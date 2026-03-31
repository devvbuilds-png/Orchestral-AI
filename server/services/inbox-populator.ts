import { randomUUID } from "crypto";
import type { PKB, InboxItem, FactField } from "@shared/schema";
import { modifyPKB } from "./pkb-storage";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isFactField(obj: unknown): obj is FactField {
  return (
    typeof obj === "object" &&
    obj !== null &&
    "value" in obj &&
    "sources" in obj &&
    Array.isArray((obj as any).sources)
  );
}

function walkFactFields(
  obj: unknown,
  prefix: string,
  results: { path: string; field: FactField }[] = [],
): { path: string; field: FactField }[] {
  if (!obj || typeof obj !== "object") return results;

  if (isFactField(obj)) {
    results.push({ path: prefix, field: obj });
    return results; // do not recurse into FactField internals
  }

  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      walkFactFields(obj[i], `${prefix}[${i}]`, results);
    }
  } else {
    for (const key of Object.keys(obj as Record<string, unknown>)) {
      const next = prefix ? `${prefix}.${key}` : key;
      walkFactFields((obj as Record<string, unknown>)[key], next, results);
    }
  }

  return results;
}

function makeItem(partial: Omit<InboxItem, "item_id" | "created_at">): InboxItem {
  return {
    item_id: randomUUID(),
    created_at: new Date().toISOString(),
    ...partial,
  };
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function populateInbox(sessionId: string, pkb: PKB): Promise<PKB> {
  if (!pkb.review_inbox) pkb.review_inbox = [];

  const inbox = pkb.review_inbox;
  const newItems: InboxItem[] = [];

  // Pre-build sets of already-tracked identifiers (unresolved only)
  const unresolvedByFieldPath = new Set(
    inbox.filter(i => i.status === "unresolved" && i.field_path).map(i => i.field_path!),
  );
  const unresolvedByConflictId = new Set(
    inbox.filter(i => i.status === "unresolved" && i.conflict_id).map(i => i.conflict_id!),
  );
  const unresolvedByPersonaId = new Set(
    inbox.filter(i => i.status === "unresolved" && i.persona_id).map(i => i.persona_id!),
  );
  const unresolvedByIcpId = new Set(
    inbox.filter(i => i.status === "unresolved" && i.icp_id).map(i => i.icp_id!),
  );

  // 1. Sensitive fields -------------------------------------------------------
  const factSections: [string, unknown][] = [
    ["facts", pkb.facts],
    ["extensions.b2b", pkb.extensions?.b2b],
    ["extensions.b2c", pkb.extensions?.b2c],
  ];

  for (const [sectionPrefix, sectionObj] of factSections) {
    if (!sectionObj) continue;
    for (const { path, field } of walkFactFields(sectionObj, sectionPrefix)) {
      if (field.sensitive === true && field.approved === false) {
        if (!unresolvedByFieldPath.has(path)) {
          newItems.push(makeItem({
            type: "sensitive_field",
            priority: "critical",
            title: `Review required: ${path}`,
            description:
              "This field contains sensitive information and requires your approval before it can be used.",
            field_path: path,
            current_value: field.value,
            status: "unresolved",
          }));
          unresolvedByFieldPath.add(path);
        }
      }
    }
  }

  // 2. Conflicts --------------------------------------------------------------
  for (const conflict of pkb.conflicts ?? []) {
    if (
      conflict.resolution_status === "unresolved" &&
      !unresolvedByConflictId.has(conflict.conflict_id)
    ) {
      newItems.push(makeItem({
        type: "conflict",
        priority: "critical",
        title: `Conflict detected: ${conflict.field_path}`,
        description: "Two sources disagree on this value.",
        field_path: conflict.field_path,
        current_value: conflict.value_a,
        proposed_value: conflict.value_b,
        conflict_id: conflict.conflict_id,
        status: "unresolved",
      }));
      unresolvedByConflictId.add(conflict.conflict_id);
    }
  }

  // 3. Persona confirmation ---------------------------------------------------
  for (const persona of pkb.personas ?? []) {
    if (
      persona.status === "active" &&
      persona.lifecycle_status === "inferred" &&
      !unresolvedByPersonaId.has(persona.persona_id)
    ) {
      newItems.push(makeItem({
        type: "persona_confirmation",
        priority: "persona_icp",
        title: `Confirm persona: ${persona.name}`,
        description:
          "This persona was inferred from your product content. Confirm to activate or demote to remove.",
        persona_id: persona.persona_id,
        current_value: persona,
        status: "unresolved",
      }));
      unresolvedByPersonaId.add(persona.persona_id);
    }
  }

  // 4. ICP confirmation -------------------------------------------------------
  for (const icp of pkb.icps ?? []) {
    if (
      icp.lifecycle_status === "inferred" &&
      !unresolvedByIcpId.has(icp.icp_id)
    ) {
      newItems.push(makeItem({
        type: "icp_confirmation",
        priority: "persona_icp",
        title: `Confirm ICP: ${icp.icp_id}`,
        description:
          "This ideal customer profile was inferred from your product content. Confirm or dismiss.",
        icp_id: icp.icp_id,
        current_value: icp,
        status: "unresolved",
      }));
      unresolvedByIcpId.add(icp.icp_id);
    }
  }

  if (newItems.length > 0) {
    pkb.review_inbox = [...inbox, ...newItems];
    await modifyPKB(sessionId, (freshPkb) => {
      freshPkb.review_inbox = pkb.review_inbox;
    });
  }

  return pkb;
}
