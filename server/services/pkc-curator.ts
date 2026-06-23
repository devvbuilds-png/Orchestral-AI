import type { PKB, ProposedUpdate, PKCDecision, Source, Conflict, FactField, OrgConflict } from "@shared/schema";
import { loadPKB, loadOrgPKB, addOrgConflict, modifyPKB } from "./pkb-storage";
import { randomUUID } from "crypto";

// ──────────────────────────────────────────────────────────────────────────────
// Org conflict detection — product field → org PKB field mapping
// ──────────────────────────────────────────────────────────────────────────────

type OrgFieldKey = "locations" | "competitors" | "industry" | "business_model";

const ORG_CONFLICT_MAPPING: Record<string, OrgFieldKey> = {
  "facts.target_users.markets": "locations",
  "facts.differentiation.competitors": "competitors",
  "facts.product_identity.industry": "industry",
};

async function detectOrgConflict(
  productId: string,
  orgId: number,
  update: ProposedUpdate,
  pkb: PKB
): Promise<void> {
  try {
    const orgPKB = await loadOrgPKB(orgId);
    const productValue = update.value?.value ?? update.value;
    const productValueStr = Array.isArray(productValue)
      ? productValue.join(", ")
      : String(productValue ?? "");

    if (!productValueStr.trim()) return;

    let orgField: OrgFieldKey | null = null;
    let orgValue: string | null = null;

    // Direct field mapping
    if (ORG_CONFLICT_MAPPING[update.field_path]) {
      orgField = ORG_CONFLICT_MAPPING[update.field_path];
      const raw = (orgPKB as any)[orgField];
      orgValue = Array.isArray(raw) ? raw.join(", ") : String(raw ?? "");
    } else if (update.field_path.startsWith("facts.constraints_assumptions")) {
      // Business model signal detection
      const lower = productValueStr.toLowerCase();
      if (lower.includes("b2b") || lower.includes("b2c") || lower.includes("both")) {
        orgField = "business_model";
        orgValue = orgPKB.business_model || "";
      }
    }

    if (!orgField || !orgValue?.trim()) return; // no mapping or org field is empty

    // Normalised comparison
    const orgNorm = orgValue.toLowerCase().trim();
    const prodNorm = productValueStr.toLowerCase().trim();
    if (orgNorm === prodNorm) return; // values match — no conflict

    // Duplicate guard: skip if a pending conflict for this field + product already exists
    if (!orgPKB.conflicts) orgPKB.conflicts = [];
    const numericProductId = parseInt(productId);
    const hasPending = orgPKB.conflicts.some(
      c => c.field === orgField && c.product_id === numericProductId && c.status === "pending"
    );
    if (hasPending) return;

    const productName = (pkb.meta as any).product_name || `product_${productId}`;
    const conflict: OrgConflict = {
      id: randomUUID(),
      product_id: numericProductId,
      product_name: productName,
      field: orgField,
      org_value: orgValue,
      product_value: productValueStr,
      suggestion: `Update "${orgField}" from "${orgValue}" to "${productValueStr}" based on ${productName} data`,
      detected_at: new Date().toISOString(),
      status: "pending",
    };

    await addOrgConflict(orgId, conflict);
    console.log(
      `[org-conflict] org ${orgId} field "${orgField}": org="${orgValue}" vs product="${productValueStr}"`
    );
  } catch (err) {
    console.error("[org-conflict] detection failed:", err);
  }
}

// V1 governance: sensitive field paths are flagged on write so the review inbox
// can require approval and the Explainer can withhold them until approved.
const SENSITIVE_PATH_RE = /(pricing|customer_name|customer_names|security|security_claims|roadmap|compliance)/i;
function isSensitivePath(fieldPath: string): boolean {
  return SENSITIVE_PATH_RE.test(fieldPath);
}

const VALID_SECTIONS = ["facts", "extensions.b2b", "extensions.b2c", "derived_insights", "gaps"];
const AGENTS_REQUIRING_SOURCES = ["extractor", "interviewer"];
const WRITE_PERMISSIONS: Record<string, string[]> = {
  extractor: ["facts", "extensions.b2b", "extensions.b2c"],
  interviewer: ["facts", "extensions.b2b", "extensions.b2c"],
  synthesizer: ["derived_insights"],
};

function getNestedValue(obj: any, path: string): any {
  return path.split(".").reduce((current, key) => current?.[key], obj);
}

function setNestedValue(obj: any, path: string, value: any): void {
  const keys = path.split(".");
  const lastKey = keys.pop();
  if (!lastKey) return;

  let current = obj;
  for (const key of keys) {
    if (!(key in current)) {
      current[key] = {};
    }
    current = current[key];
  }
  current[lastKey] = value;
}

function unwrap(v: any): any {
  return (typeof v === "object" && v !== null && "value" in v) ? v.value : v;
}

function valuesConflict(oldValue: any, newValue: any): boolean {
  const oldVal = unwrap(oldValue);
  const newVal = unwrap(newValue);

  // Arrays are additive, not conflicting — re-ingesting a second document that
  // mentions more features/use-cases/etc. should MERGE, never raise a conflict
  // (audit A3). Conflict detection is reserved for scalar disagreements.
  if (Array.isArray(oldVal) || Array.isArray(newVal)) return false;

  if (typeof oldVal !== typeof newVal) return true;

  if (typeof oldVal === "object" && oldVal !== null) {
    return JSON.stringify(oldVal) !== JSON.stringify(newVal);
  }

  return oldVal !== newVal;
}

/** Union-merge two array values, de-duplicating by JSON identity. */
function mergeArrays(oldVal: any, newVal: any): any[] {
  const a = Array.isArray(oldVal) ? oldVal : (oldVal == null ? [] : [oldVal]);
  const b = Array.isArray(newVal) ? newVal : (newVal == null ? [] : [newVal]);
  const seen = new Set(a.map((v: any) => (typeof v === "object" ? JSON.stringify(v) : String(v))));
  const out = [...a];
  for (const item of b) {
    const key = typeof item === "object" ? JSON.stringify(item) : String(item);
    if (!seen.has(key)) { out.push(item); seen.add(key); }
  }
  return out;
}

export function validateProposedUpdate(pkb: PKB, update: ProposedUpdate): PKCDecision {
  if (!VALID_SECTIONS.includes(update.target_section)) {
    return {
      accepted: false,
      reason: `Invalid target_section: ${update.target_section}. Must be one of: ${VALID_SECTIONS.join(", ")}`,
    };
  }

  const agent = update.metadata.proposed_by;
  const allowedSections = WRITE_PERMISSIONS[agent];
  if (!allowedSections || !allowedSections.includes(update.target_section)) {
    return {
      accepted: false,
      reason: `Agent '${agent}' is not allowed to write to section '${update.target_section}'`,
    };
  }

  if (AGENTS_REQUIRING_SOURCES.includes(agent)) {
    if (update.target_section === "facts" || update.target_section.startsWith("extensions.")) {
      if (!update.sources || update.sources.length === 0) {
        return {
          accepted: false,
          reason: `Updates to ${update.target_section} require at least one source`,
        };
      }

      for (const source of update.sources) {
        if (!["doc", "url", "founder"].includes(source.source_type)) {
          return {
            accepted: false,
            reason: `Invalid source_type: ${source.source_type}. Must be 'doc', 'url', or 'founder'`,
          };
        }
        if (!source.source_ref) {
          return {
            accepted: false,
            reason: `Source must have a source_ref`,
          };
        }
      }
    }
  }

  return { accepted: true };
}

/**
 * Apply a single update to a PKB object in-place. Does NOT load/save —
 * that is handled by the caller (applyProposedUpdate or batchApplyUpdates).
 */
function applyUpdateToPKB(pkb: PKB, update: ProposedUpdate): PKCDecision {
  const validationResult = validateProposedUpdate(pkb, update);
  if (!validationResult.accepted) return validationResult;

  let targetObj: any;
  switch (update.target_section) {
    case "facts":
      targetObj = pkb.facts || (pkb.facts = {});
      break;
    case "extensions.b2b":
      if (!pkb.extensions) pkb.extensions = {};
      targetObj = pkb.extensions.b2b || (pkb.extensions.b2b = {});
      break;
    case "extensions.b2c":
      if (!pkb.extensions) pkb.extensions = {};
      targetObj = pkb.extensions.b2c || (pkb.extensions.b2c = {});
      break;
    case "derived_insights":
      targetObj = pkb.derived_insights || (pkb.derived_insights = {});
      break;
    case "gaps":
      targetObj = pkb.gaps || (pkb.gaps = { current: [], history: [] });
      break;
    default:
      return { accepted: false, reason: `Unknown target section: ${update.target_section}` };
  }

  const relativePath = update.field_path.replace(`${update.target_section}.`, "");
  const existingValue = getNestedValue(targetObj, relativePath);

  if (update.target_section === "facts" || update.target_section.startsWith("extensions.")) {
    const incomingVal = (update.value && typeof update.value === "object" && "value" in update.value)
      ? update.value.value : update.value;

    // ── Array merge: union new items into the existing array (audit A3) ──────
    if (existingValue && (Array.isArray(unwrap(existingValue)) || Array.isArray(incomingVal))) {
      if (!existingValue.sources) existingValue.sources = [];
      existingValue.value = mergeArrays(unwrap(existingValue), incomingVal);
      mergeSourcesInto(existingValue, update.sources);
      existingValue.lifecycle_status = computeLifecycle(existingValue);
      return { accepted: true };
    }

    if (existingValue && !valuesConflict(existingValue, update.value)) {
      // Scalar values match — merge sources; a second DISTINCT source upgrades
      // the fact to "evidenced" (V1 governance rule), audit C4.
      mergeSourcesInto(existingValue, update.sources);
      existingValue.lifecycle_status = computeLifecycle(existingValue);
      return { accepted: true };
    }

    if (existingValue && valuesConflict(existingValue, update.value)) {
      const conflictId = randomUUID();
      const conflict: Conflict = {
        conflict_id: conflictId,
        field_path: update.field_path,
        value_a: existingValue,
        value_b: update.value,
        source_a: existingValue.sources?.[0] || { source_type: "doc", source_ref: "unknown", captured_at: "" },
        source_b: update.sources?.[0] || { source_type: "doc", source_ref: "unknown", captured_at: "" },
        resolution_status: "unresolved",
        detected_at: new Date().toISOString(),
      };

      if (!pkb.conflicts) pkb.conflicts = [];
      pkb.conflicts.push(conflict);

      if (!pkb.gaps) pkb.gaps = { current: [], history: [] };
      if (!pkb.gaps.current) pkb.gaps.current = [];

      pkb.gaps.current.push({
        gap_id: `gap_conflict_${conflictId}`,
        field_path: update.field_path,
        severity: "critical",
        question: `I found conflicting information about ${relativePath}. The previous value was "${JSON.stringify(existingValue.value || existingValue)}" but new information says "${JSON.stringify(update.value.value || update.value)}". Which is correct?`,
        why_needed: "Conflicting information needs human resolution",
      });

      return {
        accepted: false,
        reason: "Conflict detected - stored for human resolution",
        conflict_created: true,
        conflict_id: conflictId,
      };
    }

    const sensitive = isSensitivePath(update.field_path);
    const factField: FactField = {
      value: incomingVal,
      sources: update.sources || [],
      quality_tag: determineQualityTag(update.sources || []),
      lifecycle_status: "asserted",
      // Sensitive facts are committed but flagged unapproved so the inbox gates
      // them and the Explainer can withhold until a human approves (V1 gov).
      ...(sensitive ? { sensitive: true, approved: false } : {}),
      notes: (update.value && typeof update.value === "object") ? update.value.notes : undefined,
    };

    setNestedValue(targetObj, relativePath, factField);
  } else if (update.target_section === "gaps") {
    if (relativePath === "current" && Array.isArray(update.value)) {
      if (pkb.gaps?.current && pkb.gaps.current.length > 0) {
        if (!pkb.gaps.history) pkb.gaps.history = [];
        pkb.gaps.history.push({
          timestamp: new Date().toISOString(),
          gaps: pkb.gaps.current,
        });
      }
      pkb.gaps!.current = update.value;
    } else {
      setNestedValue(targetObj, relativePath, update.value);
    }
  } else {
    setNestedValue(targetObj, relativePath, update.value);
  }

  return { accepted: true };
}

export async function applyProposedUpdate(productId: string, update: ProposedUpdate, orgId?: number): Promise<PKCDecision> {
  let decision: PKCDecision = { accepted: false, reason: "Unknown error" };

  await modifyPKB(productId, (pkb) => {
    decision = applyUpdateToPKB(pkb, update);
  });

  // Org conflict detection — runs outside the lock (only reads org PKB)
  if (
    decision.accepted &&
    orgId !== undefined &&
    (update.target_section === "facts" || update.target_section.startsWith("extensions."))
  ) {
    const pkb = await loadPKB(productId);
    if (pkb) await detectOrgConflict(productId, orgId, update, pkb);
  }

  return decision;
}

/**
 * Apply multiple updates in a single lock acquisition — one load, one save.
 * Used by the /process pipeline to avoid N round-trips.
 */
export async function batchApplyUpdates(productId: string, updates: ProposedUpdate[], orgId?: number): Promise<PKCDecision[]> {
  const decisions: PKCDecision[] = [];

  await modifyPKB(productId, (pkb) => {
    for (const update of updates) {
      decisions.push(applyUpdateToPKB(pkb, update));
    }
  });

  // Org conflict detection for accepted fact/extension updates
  const factUpdates = updates.filter((u, i) =>
    decisions[i].accepted &&
    orgId !== undefined &&
    (u.target_section === "facts" || u.target_section.startsWith("extensions."))
  );
  if (factUpdates.length > 0) {
    const pkb = await loadPKB(productId);
    if (pkb) {
      for (const update of factUpdates) {
        await detectOrgConflict(productId, orgId!, update, pkb);
      }
    }
  }

  return decisions;
}

/** Merge sources into a FactField, de-duplicating by (source_ref, source_type). */
function mergeSourcesInto(field: any, incoming?: Source[]): void {
  if (!incoming) return;
  if (!field.sources) field.sources = [];
  for (const src of incoming) {
    const isDup = field.sources.some(
      (s: any) => s.source_ref === src.source_ref && s.source_type === src.source_type,
    );
    if (!isDup) field.sources.push(src);
  }
}

/**
 * Lifecycle per V1 governance: a fact is "evidenced" once a SECOND distinct
 * source (different source_ref) confirms it; otherwise "asserted". Never
 * downgrades an existing evidenced/disputed status.
 */
function computeLifecycle(field: any): FactField["lifecycle_status"] {
  if (field.lifecycle_status === "disputed" || field.lifecycle_status === "stale") {
    return field.lifecycle_status;
  }
  const refs = new Set((field.sources ?? []).map((s: any) => s.source_ref).filter(Boolean));
  return refs.size >= 2 ? "evidenced" : "asserted";
}

function determineQualityTag(sources: Source[]): "strong" | "ok" | "weak" {
  if (sources.length === 0) return "weak";
  
  const hasDocOrUrl = sources.some(s => s.source_type === "doc" || s.source_type === "url");
  if (hasDocOrUrl) return "strong";
  
  const hasFounder = sources.some(s => s.source_type === "founder");
  if (hasFounder) return "ok";
  
  return "weak";
}

export async function resolveConflict(
  productId: string,
  conflictId: string,
  resolution: "keep_old" | "use_new" | string,
  customValue?: any
): Promise<PKCDecision> {
  let decision: PKCDecision = { accepted: false, reason: "Unknown error" };

  await modifyPKB(productId, (pkb) => {
    const conflictIndex = pkb.conflicts?.findIndex(c => c.conflict_id === conflictId);
    if (conflictIndex === undefined || conflictIndex === -1) {
      decision = { accepted: false, reason: "Conflict not found" };
      return;
    }

    const conflict = pkb.conflicts![conflictIndex];

    let finalValue: any;
    if (resolution === "keep_old") {
      finalValue = conflict.value_a;
    } else if (resolution === "use_new") {
      finalValue = conflict.value_b;
    } else {
      finalValue = customValue ?? resolution;
    }

    const [section, ...pathParts] = conflict.field_path.split(".");
    let targetObj: any;

    switch (section) {
      case "facts":
        targetObj = pkb.facts;
        break;
      case "extensions":
        const extType = pathParts.shift();
        if (extType === "b2b") targetObj = pkb.extensions?.b2b;
        else if (extType === "b2c") targetObj = pkb.extensions?.b2c;
        break;
      default:
        decision = { accepted: false, reason: "Invalid field path" };
        return;
    }

    if (targetObj) {
      setNestedValue(targetObj, pathParts.join("."), finalValue);
    }

    conflict.resolution_status = "resolved";
    conflict.resolved_at = new Date().toISOString();
    conflict.resolution = resolution;

    if (pkb.gaps?.current) {
      pkb.gaps.current = pkb.gaps.current.filter(
        g => !g.gap_id.includes(conflictId)
      );
    }

    decision = { accepted: true };
  });

  return decision;
}

