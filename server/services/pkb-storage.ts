import type { PKB, OrgPKB, OrgConflict } from "@shared/schema";
import { supabase, PKB_BUCKET } from "../supabase-storage";

const MAX_SNAPSHOTS = 25;

// ──────────────────────────────────────────────────────────────────────────────
// Per-product async mutex — prevents concurrent read-modify-write races
// ──────────────────────────────────────────────────────────────────────────────

const locks = new Map<string, Promise<void>>();

/**
 * Serialises async work per productId. If another call for the same product is
 * in-flight, this one waits until it finishes before starting.
 */
export async function withPKBLock<T>(productId: string, fn: () => Promise<T>): Promise<T> {
  // Wait for any existing lock to resolve
  const existing = locks.get(productId);
  let release: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  locks.set(productId, existing ? existing.then(() => gate) : gate);
  if (existing) await existing;
  try {
    return await fn();
  } finally {
    release!();
    // Clean up only if we're still the tail of the chain
    if (locks.get(productId) === gate) locks.delete(productId);
  }
}

/**
 * Safe read-modify-write for a product PKB.
 * Acquires the per-product lock, loads the PKB, runs the mutator in-place,
 * then saves. Returns the saved PKB.
 */
export async function modifyPKB(
  productId: string,
  mutator: (pkb: PKB) => void | Promise<void>,
): Promise<PKB> {
  return withPKBLock(productId, async () => {
    let pkb = await loadPKB(productId);
    if (!pkb) pkb = await initializePKB(productId, "b2b");
    await mutator(pkb);
    await savePKB(productId, pkb);
    return pkb;
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// Supabase helpers
// ──────────────────────────────────────────────────────────────────────────────

async function uploadJSON(storagePath: string, data: unknown): Promise<void> {
  const content = JSON.stringify(data, null, 2);
  const { error } = await supabase.storage
    .from(PKB_BUCKET)
    .upload(storagePath, content, {
      contentType: "application/json",
      upsert: true,
      cacheControl: "0",
    });
  if (error) throw new Error(`Failed to upload ${storagePath}: ${error.message}`);
}

async function downloadJSON<T>(storagePath: string): Promise<T | null> {
  // Use createSignedUrl with a short expiry to bypass CDN caching
  const { data: signedData, error: signedError } = await supabase.storage
    .from(PKB_BUCKET)
    .createSignedUrl(storagePath, 60); // 60s expiry

  if (signedError) {
    const msg = (signedError as any).message ?? "";
    if (msg.includes("Object not found") || (signedError as any).statusCode === 404 || (signedError as any).error === "Not Found") {
      return null;
    }
    throw new Error(`Failed to create signed URL for ${storagePath}: ${msg}`);
  }

  const response = await fetch(signedData.signedUrl, {
    headers: { "Cache-Control": "no-cache, no-store" },
  });

  if (!response.ok) {
    if (response.status === 404 || response.status === 400) return null;
    throw new Error(`Failed to download ${storagePath}: HTTP ${response.status}`);
  }

  const text = await response.text();
  return JSON.parse(text) as T;
}

async function createSnapshot(productId: string, pkb: PKB): Promise<void> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const snapshotPath = `product_${productId}/snapshots/pkb_${timestamp}.json`;
  await uploadJSON(snapshotPath, pkb);

  // Enforce MAX_SNAPSHOTS — list and delete oldest beyond the cap
  const { data: files } = await supabase.storage
    .from(PKB_BUCKET)
    .list(`product_${productId}/snapshots`);

  if (files && files.length > MAX_SNAPSHOTS) {
    const sorted = files
      .filter((f) => f.name.startsWith("pkb_") && f.name.endsWith(".json"))
      .sort((a, b) => a.name.localeCompare(b.name)); // ascending = oldest first

    const toDelete = sorted.slice(0, sorted.length - MAX_SNAPSHOTS);
    if (toDelete.length > 0) {
      await supabase.storage
        .from(PKB_BUCKET)
        .remove(toDelete.map((f) => `product_${productId}/snapshots/${f.name}`));
    }
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Product PKB functions
// ──────────────────────────────────────────────────────────────────────────────

export async function initializePKB(
  productId: string,
  productType: "b2b" | "b2c" | "hybrid",
  primaryMode?: "b2b" | "b2c"
): Promise<PKB> {
  const now = new Date().toISOString();
  const pkb: PKB = {
    meta: {
      product_id: productId,
      product_type: productType,
      primary_mode: primaryMode,
      version: "0.1",
      created_at: now,
      last_updated: now,
      inputs: { documents: [], urls: [], founder_sessions: [] },
    },
    facts: {},
    extensions: { b2b: {}, b2c: {} },
    derived_insights: {},
    gaps: { current: [], history: [] },
    conflicts: [],
  };
  await savePKB(productId, pkb);
  return pkb;
}

export async function loadPKB(productId: string): Promise<PKB | null> {
  try {
    const pkb = await downloadJSON<PKB>(`product_${productId}/pkb.json`);
    if (!pkb) return null;
    // V0 migration: rename session_id → product_id
    if ((pkb.meta as any).session_id && !pkb.meta.product_id) {
      pkb.meta.product_id = (pkb.meta as any).session_id;
      delete (pkb.meta as any).session_id;
    }
    return pkb;
  } catch (error) {
    console.error(`Failed to load PKB for product ${productId}:`, error);
    return null;
  }
}

export async function savePKB(productId: string, pkb: PKB): Promise<void> {
  pkb.meta.last_updated = new Date().toISOString();
  // Upload main file FIRST, then snapshot — avoids snapshot cleanup interfering with main upload
  await uploadJSON(`product_${productId}/pkb.json`, pkb);
  await createSnapshot(productId, pkb);
}

export async function deletePKB(productId: string): Promise<void> {
  // Delete main PKB file
  await supabase.storage.from(PKB_BUCKET).remove([`product_${productId}/pkb.json`]);

  // Delete snapshots
  const { data: snapFiles } = await supabase.storage
    .from(PKB_BUCKET)
    .list(`product_${productId}/snapshots`);
  if (snapFiles && snapFiles.length > 0) {
    await supabase.storage
      .from(PKB_BUCKET)
      .remove(snapFiles.map((f) => `product_${productId}/snapshots/${f.name}`));
  }
}

export async function listProducts(): Promise<string[]> {
  const { data } = await supabase.storage.from(PKB_BUCKET).list("");
  if (!data) return [];
  return data.filter((f) => f.name.startsWith("product_")).map((f) => f.name);
}

export async function getSnapshots(productId: string): Promise<string[]> {
  const { data } = await supabase.storage
    .from(PKB_BUCKET)
    .list(`product_${productId}/snapshots`);
  if (!data) return [];
  return data
    .filter((f) => f.name.startsWith("pkb_") && f.name.endsWith(".json"))
    .map((f) => f.name)
    .sort()
    .reverse();
}

export async function restoreSnapshot(productId: string, snapshotName: string): Promise<PKB | null> {
  try {
    const pkb = await downloadJSON<PKB>(`product_${productId}/snapshots/${snapshotName}`);
    if (!pkb) return null;
    await savePKB(productId, pkb);
    return pkb;
  } catch (error) {
    console.error(`Failed to restore snapshot ${snapshotName}:`, error);
    return null;
  }
}

export async function addDocumentInput(
  productId: string,
  filename: string,
  type: string,
  sizeBytes?: number
): Promise<void> {
  await modifyPKB(productId, (pkb) => {
    if (!pkb.meta.inputs) pkb.meta.inputs = { documents: [], urls: [], founder_sessions: [] };
    if (!pkb.meta.inputs.documents) pkb.meta.inputs.documents = [];
    pkb.meta.inputs.documents.push({
      filename,
      type,
      uploaded_at: new Date().toISOString(),
      size_bytes: sizeBytes,
    });
  });
}

export async function addUrlInput(productId: string, url: string, title?: string): Promise<void> {
  await modifyPKB(productId, (pkb) => {
    if (!pkb.meta.inputs) pkb.meta.inputs = { documents: [], urls: [], founder_sessions: [] };
    if (!pkb.meta.inputs.urls) pkb.meta.inputs.urls = [];
    const existingUrl = pkb.meta.inputs.urls.find((u) => u.url === url);
    if (!existingUrl) {
      pkb.meta.inputs.urls.push({ url, fetched_at: new Date().toISOString(), title });
    }
  });
}

export async function addMultipleUrlInputs(
  productId: string,
  urls: Array<{ url: string; title?: string }>
): Promise<void> {
  await modifyPKB(productId, (pkb) => {
    if (!pkb.meta.inputs) pkb.meta.inputs = { documents: [], urls: [], founder_sessions: [] };
    if (!pkb.meta.inputs.urls) pkb.meta.inputs.urls = [];
    const existingUrls = new Set(pkb.meta.inputs.urls.map((u) => u.url));
    for (const { url, title } of urls) {
      if (!existingUrls.has(url)) {
        pkb.meta.inputs.urls.push({ url, fetched_at: new Date().toISOString(), title });
        existingUrls.add(url);
      }
    }
  });
}

export async function addFounderSession(productId: string, founderSessionId: string): Promise<void> {
  await modifyPKB(productId, (pkb) => {
    if (!pkb.meta.inputs) pkb.meta.inputs = { documents: [], urls: [], founder_sessions: [] };
    if (!pkb.meta.inputs.founder_sessions) pkb.meta.inputs.founder_sessions = [];
    const alreadyTracked = pkb.meta.inputs.founder_sessions.some(
      (s) => s.session_id === founderSessionId
    );
    if (alreadyTracked) return;
    pkb.meta.inputs.founder_sessions.push({
      session_id: founderSessionId,
      started_at: new Date().toISOString(),
    });
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// Org PKB functions
// ──────────────────────────────────────────────────────────────────────────────

export function getOrgDir(orgId: number): string {
  return `org_${orgId}`;
}

export async function initializeOrgPKB(orgId: number): Promise<OrgPKB> {
  const now = new Date().toISOString();
  const pkb: OrgPKB = {
    org_id: orgId,
    name: "",
    description: "",
    industry: "",
    founded_year: null,
    num_products: null,
    locations: [],
    competitors: [],
    business_model: "",
    website_url: "",
    created_at: now,
    updated_at: now,
    conflicts: [],
  };
  await uploadJSON(`org_${orgId}/pkb.json`, pkb);
  return pkb;
}

export async function loadOrgPKB(orgId: number): Promise<OrgPKB> {
  try {
    const pkb = await downloadJSON<OrgPKB>(`org_${orgId}/pkb.json`);
    if (!pkb) return initializeOrgPKB(orgId);
    // Lazy migration: add conflicts array if missing
    if (!pkb.conflicts) pkb.conflicts = [];
    return pkb;
  } catch (error) {
    console.error(`Failed to load org PKB for org ${orgId}:`, error);
    return initializeOrgPKB(orgId);
  }
}

export async function saveOrgPKB(orgId: number, pkb: OrgPKB): Promise<void> {
  pkb.updated_at = new Date().toISOString();
  await uploadJSON(`org_${orgId}/pkb.json`, pkb);
}

export async function updateOrgPKBFields(orgId: number, fields: Partial<OrgPKB>): Promise<OrgPKB> {
  const pkb = await loadOrgPKB(orgId);
  const updated: OrgPKB = { ...pkb, ...fields };
  await saveOrgPKB(orgId, updated);
  return updated;
}

export async function addOrgConflict(orgId: number, conflict: OrgConflict): Promise<void> {
  const pkb = await loadOrgPKB(orgId);
  if (!pkb.conflicts) pkb.conflicts = [];
  pkb.conflicts.push(conflict);
  await saveOrgPKB(orgId, pkb);
}

export async function resolveOrgConflict(
  orgId: number,
  conflictId: string,
  resolution: "resolved" | "dismissed",
  updatedValue?: string
): Promise<OrgConflict | null> {
  const pkb = await loadOrgPKB(orgId);
  if (!pkb.conflicts) return null;

  const conflict = pkb.conflicts.find((c) => c.id === conflictId);
  if (!conflict) return null;

  conflict.status = resolution;
  conflict.resolved_at = new Date().toISOString();

  if (resolution === "resolved" && updatedValue !== undefined) {
    const currentValue = (pkb as any)[conflict.field];
    if (Array.isArray(currentValue)) {
      (pkb as any)[conflict.field] = updatedValue
        .split(",")
        .map((s: string) => s.trim())
        .filter(Boolean);
    } else {
      (pkb as any)[conflict.field] = updatedValue;
    }
  }

  await saveOrgPKB(orgId, pkb);
  return conflict;
}
