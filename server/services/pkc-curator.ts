import type { PKB, ProposedUpdate, PKCDecision, Source, Conflict, FactField } from "@shared/schema";
import { loadPKB, savePKB } from "./pkb-storage";
import { randomUUID } from "crypto";

const VALID_SECTIONS = ["facts", "extensions.b2b", "extensions.b2c", "derived_insights", "gaps"];
const AGENTS_REQUIRING_SOURCES = ["extractor", "interviewer"];
const WRITE_PERMISSIONS: Record<string, string[]> = {
  extractor: ["facts", "extensions.b2b", "extensions.b2c"],
  interviewer: ["facts", "extensions.b2b", "extensions.b2c"],
  synthesizer: ["derived_insights"],
  gap_identifier: ["gaps"],
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

function valuesConflict(oldValue: any, newValue: any): boolean {
  if (typeof oldValue !== typeof newValue) return true;
  
  if (typeof oldValue === "object" && oldValue !== null) {
    const oldVal = oldValue.value ?? oldValue;
    const newVal = newValue.value ?? newValue;
    return JSON.stringify(oldVal) !== JSON.stringify(newVal);
  }
  
  return oldValue !== newValue;
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

export function applyProposedUpdate(sessionId: string, update: ProposedUpdate): PKCDecision {
  const pkb = loadPKB(sessionId);
  if (!pkb) {
    return {
      accepted: false,
      reason: `PKB not found for session ${sessionId}`,
    };
  }

  const validationResult = validateProposedUpdate(pkb, update);
  if (!validationResult.accepted) {
    return validationResult;
  }

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
    if (existingValue && valuesConflict(existingValue, update.value)) {
      const conflictId = randomUUID();
      const conflict: Conflict = {
        conflict_id: conflictId,
        field_path: update.field_path,
        old_value: existingValue,
        new_value: update.value,
        old_source: existingValue.sources?.[0] || { source_type: "doc", source_ref: "unknown", captured_at: "" },
        new_source: update.sources?.[0] || { source_type: "doc", source_ref: "unknown", captured_at: "" },
        status: "pending",
        created_at: new Date().toISOString(),
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

      savePKB(sessionId, pkb);

      return {
        accepted: false,
        reason: "Conflict detected - stored for human resolution",
        conflict_created: true,
        conflict_id: conflictId,
      };
    }

    const factField: FactField = {
      value: update.value.value ?? update.value,
      sources: update.sources || [],
      quality_tag: determineQualityTag(update.sources || []),
      notes: update.value.notes,
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

  savePKB(sessionId, pkb);

  return { accepted: true };
}

function determineQualityTag(sources: Source[]): "strong" | "ok" | "weak" {
  if (sources.length === 0) return "weak";
  
  const hasDocOrUrl = sources.some(s => s.source_type === "doc" || s.source_type === "url");
  if (hasDocOrUrl) return "strong";
  
  const hasFounder = sources.some(s => s.source_type === "founder");
  if (hasFounder) return "ok";
  
  return "weak";
}

export function resolveConflict(
  sessionId: string, 
  conflictId: string, 
  resolution: "keep_old" | "use_new" | string,
  customValue?: any
): PKCDecision {
  const pkb = loadPKB(sessionId);
  if (!pkb) {
    return { accepted: false, reason: "PKB not found" };
  }

  const conflictIndex = pkb.conflicts?.findIndex(c => c.conflict_id === conflictId);
  if (conflictIndex === undefined || conflictIndex === -1) {
    return { accepted: false, reason: "Conflict not found" };
  }

  const conflict = pkb.conflicts![conflictIndex];
  
  let finalValue: any;
  if (resolution === "keep_old") {
    finalValue = conflict.old_value;
  } else if (resolution === "use_new") {
    finalValue = conflict.new_value;
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
      return { accepted: false, reason: "Invalid field path" };
  }

  if (targetObj) {
    setNestedValue(targetObj, pathParts.join("."), finalValue);
  }

  conflict.status = "resolved";
  conflict.resolved_at = new Date().toISOString();
  conflict.resolution = resolution;

  if (pkb.gaps?.current) {
    pkb.gaps.current = pkb.gaps.current.filter(
      g => !g.gap_id.includes(conflictId)
    );
  }

  savePKB(sessionId, pkb);

  return { accepted: true };
}

export function batchApplyUpdates(sessionId: string, updates: ProposedUpdate[]): PKCDecision[] {
  return updates.map(update => applyProposedUpdate(sessionId, update));
}
