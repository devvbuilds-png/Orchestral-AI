import fs from "fs";
import path from "path";
import type { PKB } from "@shared/schema";

const PKB_ROOT = path.join(process.cwd(), "pkb_store");
const MAX_SNAPSHOTS = 25;

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function getSessionDir(sessionId: string): string {
  return path.join(PKB_ROOT, sessionId);
}

function getPKBPath(sessionId: string): string {
  return path.join(getSessionDir(sessionId), "pkb.json");
}

function getSnapshotsDir(sessionId: string): string {
  return path.join(getSessionDir(sessionId), "snapshots");
}

function atomicWrite(filePath: string, data: string): void {
  const tempPath = `${filePath}.tmp.${Date.now()}`;
  fs.writeFileSync(tempPath, data, "utf-8");
  fs.renameSync(tempPath, filePath);
}

function createSnapshot(sessionId: string, pkb: PKB): void {
  const snapshotsDir = getSnapshotsDir(sessionId);
  ensureDir(snapshotsDir);

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const snapshotPath = path.join(snapshotsDir, `pkb_${timestamp}.json`);
  atomicWrite(snapshotPath, JSON.stringify(pkb, null, 2));

  const snapshots = fs.readdirSync(snapshotsDir)
    .filter(f => f.startsWith("pkb_") && f.endsWith(".json"))
    .sort()
    .reverse();

  while (snapshots.length > MAX_SNAPSHOTS) {
    const oldest = snapshots.pop();
    if (oldest) {
      fs.unlinkSync(path.join(snapshotsDir, oldest));
    }
  }
}

export function initializePKB(sessionId: string, productType: "b2b" | "b2c" | "hybrid", primaryMode?: "b2b" | "b2c"): PKB {
  const now = new Date().toISOString();
  
  const pkb: PKB = {
    meta: {
      session_id: sessionId,
      product_type: productType,
      primary_mode: primaryMode,
      version: "0.1",
      created_at: now,
      last_updated: now,
      inputs: {
        documents: [],
        urls: [],
        founder_sessions: [],
      },
    },
    facts: {},
    extensions: {
      b2b: {},
      b2c: {},
    },
    derived_insights: {},
    gaps: {
      current: [],
      history: [],
    },
    conflicts: [],
  };

  savePKB(sessionId, pkb);
  return pkb;
}

export function loadPKB(sessionId: string): PKB | null {
  const pkbPath = getPKBPath(sessionId);
  
  if (!fs.existsSync(pkbPath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(pkbPath, "utf-8");
    return JSON.parse(content) as PKB;
  } catch (error) {
    console.error(`Failed to load PKB for session ${sessionId}:`, error);
    return null;
  }
}

export function savePKB(sessionId: string, pkb: PKB): void {
  const sessionDir = getSessionDir(sessionId);
  ensureDir(sessionDir);

  pkb.meta.last_updated = new Date().toISOString();

  createSnapshot(sessionId, pkb);

  const pkbPath = getPKBPath(sessionId);
  atomicWrite(pkbPath, JSON.stringify(pkb, null, 2));
}

export function deletePKB(sessionId: string): void {
  const sessionDir = getSessionDir(sessionId);
  
  if (fs.existsSync(sessionDir)) {
    fs.rmSync(sessionDir, { recursive: true, force: true });
  }
}

export function listSessions(): string[] {
  ensureDir(PKB_ROOT);
  
  return fs.readdirSync(PKB_ROOT)
    .filter(name => {
      const sessionDir = path.join(PKB_ROOT, name);
      return fs.statSync(sessionDir).isDirectory() && 
             fs.existsSync(path.join(sessionDir, "pkb.json"));
    });
}

export function getSnapshots(sessionId: string): string[] {
  const snapshotsDir = getSnapshotsDir(sessionId);
  
  if (!fs.existsSync(snapshotsDir)) {
    return [];
  }

  return fs.readdirSync(snapshotsDir)
    .filter(f => f.startsWith("pkb_") && f.endsWith(".json"))
    .sort()
    .reverse();
}

export function restoreSnapshot(sessionId: string, snapshotName: string): PKB | null {
  const snapshotPath = path.join(getSnapshotsDir(sessionId), snapshotName);
  
  if (!fs.existsSync(snapshotPath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(snapshotPath, "utf-8");
    const pkb = JSON.parse(content) as PKB;
    savePKB(sessionId, pkb);
    return pkb;
  } catch (error) {
    console.error(`Failed to restore snapshot ${snapshotName}:`, error);
    return null;
  }
}

export function addDocumentInput(sessionId: string, filename: string, type: string, sizeBytes?: number): void {
  let pkb = loadPKB(sessionId);
  if (!pkb) {
    pkb = initializePKB(sessionId, "b2b");
  }

  if (!pkb.meta.inputs) {
    pkb.meta.inputs = { documents: [], urls: [], founder_sessions: [] };
  }
  if (!pkb.meta.inputs.documents) {
    pkb.meta.inputs.documents = [];
  }

  pkb.meta.inputs.documents.push({
    filename,
    type,
    uploaded_at: new Date().toISOString(),
    size_bytes: sizeBytes,
  });

  savePKB(sessionId, pkb);
}

export function addUrlInput(sessionId: string, url: string, title?: string): void {
  let pkb = loadPKB(sessionId);
  if (!pkb) {
    pkb = initializePKB(sessionId, "b2b");
  }

  if (!pkb.meta.inputs) {
    pkb.meta.inputs = { documents: [], urls: [], founder_sessions: [] };
  }
  if (!pkb.meta.inputs.urls) {
    pkb.meta.inputs.urls = [];
  }

  const existingUrl = pkb.meta.inputs.urls.find(u => u.url === url);
  if (!existingUrl) {
    pkb.meta.inputs.urls.push({
      url,
      fetched_at: new Date().toISOString(),
      title,
    });
    savePKB(sessionId, pkb);
  }
}

export function addMultipleUrlInputs(sessionId: string, urls: Array<{ url: string; title?: string }>): void {
  let pkb = loadPKB(sessionId);
  if (!pkb) {
    pkb = initializePKB(sessionId, "b2b");
  }

  if (!pkb.meta.inputs) {
    pkb.meta.inputs = { documents: [], urls: [], founder_sessions: [] };
  }
  if (!pkb.meta.inputs.urls) {
    pkb.meta.inputs.urls = [];
  }

  const existingUrls = new Set(pkb.meta.inputs.urls.map(u => u.url));
  
  for (const { url, title } of urls) {
    if (!existingUrls.has(url)) {
      pkb.meta.inputs.urls.push({
        url,
        fetched_at: new Date().toISOString(),
        title,
      });
      existingUrls.add(url);
    }
  }

  savePKB(sessionId, pkb);
}

export function addFounderSession(sessionId: string, founderSessionId: string): void {
  const pkb = loadPKB(sessionId);
  if (!pkb) return;

  if (!pkb.meta.inputs) {
    pkb.meta.inputs = { documents: [], urls: [], founder_sessions: [] };
  }
  if (!pkb.meta.inputs.founder_sessions) {
    pkb.meta.inputs.founder_sessions = [];
  }

  pkb.meta.inputs.founder_sessions.push({
    session_id: founderSessionId,
    started_at: new Date().toISOString(),
  });

  savePKB(sessionId, pkb);
}
