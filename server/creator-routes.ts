import type { Express, Request, Response } from "express";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import multer from "multer";
import os from "os";
import path from "path";
import fs from "fs";
import { randomUUID } from "crypto";
import pLimit from "p-limit";

import { db } from "./db";
import { products, productMembers, organisations, organisationMembers } from "@shared/schema";
import { requireOrgAccess } from "./authz";
import {
  initializePKB, loadPKB, initializeOrgPKB, loadOrgPKB, updateOrgPKBFields,
  addCreatorSource, removeCreatorSource,
} from "./services/pkb-storage";
import { batchApplyUpdates } from "./services/pkc-curator";
import { chunkText, extractTextFromFile, fetchUrlContent, cleanText } from "./services/ingestion-service";
import { extractFromMultipleChunks } from "./agents/information-extractor";
import { runSynthesizer } from "./agents/synthesizer-function";
import { runCreatorSynthesizer } from "./agents/creator-synthesizer";
import { buildPortfolioHTML, buildProjectHTML, type PortfolioProject } from "./services/portfolio-generator";
import {
  getUser, listUserRepos, rankRepos, getReadme, getLanguages, aggregateLanguages,
} from "./services/github-service";
import type { AgentContext } from "./agents/base-agent";
import type { Product } from "@shared/schema";

const createCreatorSchema = z.object({
  name: z.string().min(1),
  github_username: z.string().optional(),
});

const importSchema = z.object({
  username: z.string().optional(),
  token: z.string().optional(),
  maxRepos: z.number().min(1).max(30).optional().default(15),
});

const SOURCE_TEXT_CAP = 12000; // cap stored text per source to bound PKB size

const sourceUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
});

const sourceUrlSchema = z.object({ url: z.string().url() });

function sse(res: Response) {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
}
function send(res: Response, obj: unknown) {
  res.write(`data: ${JSON.stringify(obj)}\n\n`);
}

export function registerCreatorRoutes(app: Express): void {
  // ── Create a creator (vibe-coder) workspace ────────────────────────────────
  // Mirrors POST /api/organisations but flags kind='creator'.
  app.post("/api/creators", async (req: Request, res: Response) => {
    try {
      const parsed = createCreatorSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "Invalid request", details: parsed.error.errors });
      const { name, github_username } = parsed.data;
      const userId = req.user!.id;

      const [org] = await db
        .insert(organisations)
        .values({ name, owner_id: userId, kind: "creator", github_username: github_username ?? null } as any)
        .returning();

      await initializeOrgPKB(org.id);
      await updateOrgPKBFields(org.id, {
        name: org.name,
        kind: "creator",
        github_username: github_username ?? undefined,
      } as any);

      await db.insert(organisationMembers).values({ org_id: org.id, user_id: userId, org_role: "admin" });

      res.status(201).json({ organisation: org });
    } catch (err) {
      console.error("Create creator error:", err);
      res.status(500).json({ error: "Failed to create creator workspace" });
    }
  });

  // ── Import GitHub repos as projects (SSE) — reusable for orgs too ───────────
  app.post("/api/organisations/:orgId/github/import", requireOrgAccess, async (req: Request, res: Response) => {
    const orgId = parseInt(req.params.orgId as string);
    const parsed = importSchema.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ error: "Invalid request", details: parsed.error.errors });

    const orgPKB = await loadOrgPKB(orgId);
    const username = parsed.data.username || orgPKB.github_username;
    if (!username) return res.status(400).json({ error: "No GitHub username provided" });
    const { token, maxRepos } = parsed.data;

    sse(res);
    try {
      send(res, { type: "status", message: `Connecting to GitHub @${username}…` });

      // Validate the user up-front so we can surface a clear, specific message
      // (e.g. "user not found" / "rate limit") instead of a generic failure.
      let ghUser: Awaited<ReturnType<typeof getUser>> | null = null;
      try {
        ghUser = await getUser(username, token);
      } catch (e: any) {
        send(res, { type: "fatal", error: e?.message || `Couldn't reach GitHub user @${username}` });
        res.end();
        return;
      }
      if (ghUser) {
        await updateOrgPKBFields(orgId, {
          github_username: ghUser.login,
          avatar_url: ghUser.avatar_url,
          ...(ghUser.bio ? { description: ghUser.bio } : {}),
        } as any);
        await db.update(organisations)
          .set({ github_username: ghUser.login, avatar_url: ghUser.avatar_url, updated_at: new Date() } as any)
          .where(eq(organisations.id, orgId));
      }

      const allRepos = await listUserRepos(username, token);
      const ranked = rankRepos(allRepos).slice(0, maxRepos);
      send(res, { type: "status", message: `Found ${allRepos.length} repos — importing top ${ranked.length}…` });

      // Map existing repo_url → product id. Existing repos are re-enriched
      // (not skipped) so a previously-failed import can self-heal on retry.
      const existing = await db.select({ id: products.id, repo_url: products.repo_url }).from(products).where(eq(products.org_id, orgId));
      const existingByUrl = new Map<string, number>(
        existing.filter((e: any) => e.repo_url).map((e: any) => [e.repo_url as string, e.id as number]),
      );

      let imported = 0;
      let enrichFailed = 0;
      let failed = 0;
      let processed = 0;
      let lastError = "";
      // Import repos with bounded concurrency — each repo's writes are scoped to
      // its own product lock, so 3-at-a-time is safe and ~3x faster than serial.
      const limit = pLimit(3);

      await Promise.all(ranked.map((repo) => limit(async () => {
        processed++;
        send(res, { type: "progress", current: processed, total: ranked.length, repo: repo.name });

        const languages = await getLanguages(repo.full_name, token).catch(() => ({} as Record<string, number>));
        const readme = await getReadme(repo.full_name, token).catch(() => null);

        // ── Create the project row + PKB (or reuse an existing one). If create
        //    fails, the repo is skipped with a surfaced error. ────────────────
        let productId: number;
        const existingId = existingByUrl.get(repo.html_url);
        if (existingId) {
          productId = existingId;   // re-enrich below; don't double-count as imported
        } else {
          try {
            const [product] = await db.insert(products).values({
              name: repo.name,
              owner_id: req.user!.id,
              org_id: orgId,
              product_type: "b2c",
              state: "ready",
              source: "github",
              repo_url: repo.html_url,
              homepage_url: repo.homepage || null,
              primary_language: repo.language || Object.keys(languages)[0] || null,
              stars: repo.stargazers_count,
              topics: repo.topics ?? [],
            } as any).returning();
            productId = product.id;
            await db.insert(productMembers).values({ product_id: product.id, user_id: req.user!.id, role: "owner" });
            await initializePKB(String(product.id), "b2c");
            imported++;   // the project exists now — count it regardless of enrichment
          } catch (e) {
            failed++;
            lastError = e instanceof Error ? e.message : String(e);
            console.error(`[github-import] create failed for ${repo.full_name}:`, e);
            send(res, { type: "error", error: `Could not import ${repo.name}: ${lastError}` });
            return;
          }
        }

        // ── Best-effort LLM enrichment. Failure here (e.g. OpenAI key) leaves a
        //    valid metadata-only project rather than discarding it. ──────────
        try {
          const langPct = aggregateLanguages([languages]).map((l) => `${l.language} ${l.pct}%`).join(", ");
          const doc = [
            `# ${repo.name}`,
            repo.description ? `\n${repo.description}` : "",
            repo.topics?.length ? `\nTopics: ${repo.topics.join(", ")}` : "",
            langPct ? `\nLanguages: ${langPct}` : "",
            repo.homepage ? `\nLive site: ${repo.homepage}` : "",
            `\nRepository: ${repo.html_url}`,
            readme ? `\n\n## README\n${readme}` : "",
          ].join("");
          const context: AgentContext = {
            orgId, productId: String(productId), productType: "b2c", productName: repo.name,
          };
          const chunks = chunkText(doc);
          const updates = await extractFromMultipleChunks(context, chunks, `github:${repo.full_name}`, "doc");
          if (updates.length > 0) await batchApplyUpdates(String(productId), updates, orgId);
          await runSynthesizer(String(productId), orgId);
        } catch (e) {
          enrichFailed++;
          lastError = e instanceof Error ? e.message : String(e);
          console.error(`[github-import] enrichment failed for ${repo.full_name}:`, e);
        }
      })));

      // Only creator workspaces get a synthesized portfolio profile; for plain
      // organisations the imported repos are just products (no profile needed).
      let profile = null;
      if (orgPKB.kind === "creator") {
        send(res, { type: "status", message: "Building your profile…" });
        profile = await runCreatorSynthesizer(orgId);
      }

      send(res, {
        type: "done",
        imported,
        enrich_failed: enrichFailed,
        failed,
        total_repos: allRepos.length,
        has_profile: !!profile,
        last_error: (failed > 0 || enrichFailed > 0) ? lastError : undefined,
      });
      res.end();
    } catch (err: any) {
      console.error("GitHub import error:", err);
      if (!res.headersSent) res.status(500).json({ error: err?.message ?? "Import failed" });
      else { send(res, { type: "error", error: err?.message ?? "Import failed" }); res.end(); }
    }
  });

  // ── Re-synthesize the creator profile on demand ────────────────────────────
  app.post("/api/organisations/:orgId/synthesize-profile", requireOrgAccess, async (req: Request, res: Response) => {
    try {
      const orgId = parseInt(req.params.orgId as string);
      const profile = await runCreatorSynthesizer(orgId);
      if (!profile) return res.status(400).json({ error: "Add some projects first — nothing to synthesize yet." });
      res.json({ profile });
    } catch (err) {
      console.error("Synthesize profile error:", err);
      res.status(500).json({ error: "Failed to synthesize profile" });
    }
  });

  // ── Get creator profile + projects (for the dashboard) ─────────────────────
  app.get("/api/organisations/:orgId/profile", requireOrgAccess, async (req: Request, res: Response) => {
    try {
      const orgId = parseInt(req.params.orgId as string);
      const orgPKB = await loadOrgPKB(orgId);
      const rows = await db.select().from(products).where(eq(products.org_id, orgId));
      // Don't leak full source text to the client — just lightweight metadata.
      const sources = (orgPKB.creator_sources ?? []).map((s) => ({
        id: s.id, type: s.type, ref: s.ref, title: s.title, added_at: s.added_at,
      }));
      res.json({
        profile: orgPKB.creator_profile ?? null,
        projects: rows,
        github_username: orgPKB.github_username ?? null,
        avatar_url: orgPKB.avatar_url ?? null,
        sources,
      });
    } catch (err) {
      console.error("Get profile error:", err);
      res.status(500).json({ error: "Failed to load profile" });
    }
  });

  // ── Upload a resume / document as a profile source ─────────────────────────
  app.post("/api/organisations/:orgId/sources/upload", requireOrgAccess, sourceUpload.single("file"), async (req: Request, res: Response) => {
    try {
      const orgId = parseInt(req.params.orgId as string);
      const file = req.file;
      if (!file) return res.status(400).json({ error: "file is required" });

      const safeName = file.originalname.replace(/[^a-zA-Z0-9.\-]/g, "_");
      const tmpPath = path.join(os.tmpdir(), `kaizen_src_${Date.now()}_${safeName}`);
      fs.writeFileSync(tmpPath, file.buffer);
      let text = "";
      try { text = cleanText(await extractTextFromFile(tmpPath)); }
      finally { try { fs.unlinkSync(tmpPath); } catch { /* ignore */ } }

      if (!text.trim()) return res.status(400).json({ error: "Could not read any text from that file." });

      const isResume = /resume|cv/i.test(file.originalname);
      await addCreatorSource(orgId, {
        id: randomUUID(),
        type: isResume ? "resume" : "file",
        ref: file.originalname,
        title: file.originalname,
        text: text.slice(0, SOURCE_TEXT_CAP),
        added_at: new Date().toISOString(),
      });
      res.json({ success: true, ref: file.originalname, chars: text.length });
    } catch (err) {
      console.error("Source upload error:", err);
      res.status(500).json({ error: err instanceof Error ? err.message : "Failed to add source" });
    }
  });

  // ── Add a website / portfolio URL as a profile source ──────────────────────
  app.post("/api/organisations/:orgId/sources/url", requireOrgAccess, async (req: Request, res: Response) => {
    try {
      const orgId = parseInt(req.params.orgId as string);
      const parsed = sourceUrlSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "A valid URL is required" });

      const { text, title } = await fetchUrlContent(parsed.data.url);
      const clean = cleanText(text);
      if (!clean.trim()) return res.status(400).json({ error: "No readable content found at that URL." });

      await addCreatorSource(orgId, {
        id: randomUUID(),
        type: "url",
        ref: parsed.data.url,
        title: title || parsed.data.url,
        text: clean.slice(0, SOURCE_TEXT_CAP),
        added_at: new Date().toISOString(),
      });
      res.json({ success: true, ref: parsed.data.url, title });
    } catch (err) {
      console.error("Source URL error:", err);
      res.status(500).json({ error: err instanceof Error ? err.message : "Failed to fetch URL" });
    }
  });

  // ── Remove a profile source ────────────────────────────────────────────────
  app.delete("/api/organisations/:orgId/sources/:sourceId", requireOrgAccess, async (req: Request, res: Response) => {
    try {
      const orgId = parseInt(req.params.orgId as string);
      await removeCreatorSource(orgId, req.params.sourceId as string);
      res.json({ success: true });
    } catch (err) {
      console.error("Remove source error:", err);
      res.status(500).json({ error: "Failed to remove source" });
    }
  });

  // ── PUBLIC portfolio pages (no auth — portfolios are meant to be shared) ────
  app.get("/portfolio/:orgId", async (req: Request, res: Response) => {
    try {
      const orgId = parseInt(req.params.orgId as string);
      if (isNaN(orgId)) return res.status(404).send("Not found");
      const orgPKB = await loadOrgPKB(orgId);
      if (!orgPKB.creator_profile) {
        return res.status(404).type("html").send(notReadyPage("This portfolio hasn't been generated yet."));
      }
      const rows = await db.select().from(products).where(eq(products.org_id, orgId));
      const projects: PortfolioProject[] = [];
      for (const p of rows) projects.push({ product: p as Product, pkb: await loadPKB(String(p.id)) });
      res.type("html").send(buildPortfolioHTML(orgPKB, orgPKB.creator_profile, projects));
    } catch (err) {
      console.error("Portfolio render error:", err);
      res.status(500).type("html").send(notReadyPage("Something went wrong rendering this portfolio."));
    }
  });

  app.get("/portfolio/:orgId/p/:productId", async (req: Request, res: Response) => {
    try {
      const orgId = parseInt(req.params.orgId as string);
      const productId = parseInt(req.params.productId as string);
      if (isNaN(orgId) || isNaN(productId)) return res.status(404).send("Not found");
      const [product] = await db.select().from(products).where(and(eq(products.id, productId), eq(products.org_id, orgId)));
      if (!product) return res.status(404).type("html").send(notReadyPage("Project not found."));
      const orgPKB = await loadOrgPKB(orgId);
      const pkb = await loadPKB(String(productId));
      res.type("html").send(buildProjectHTML(orgPKB, product as Product, pkb));
    } catch (err) {
      console.error("Project page render error:", err);
      res.status(500).type("html").send(notReadyPage("Something went wrong."));
    }
  });
}

function notReadyPage(msg: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"/><title>Kaizen</title>
<style>body{background:#0a0a0a;color:#f5f5f5;font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}
.box{text-align:center}.box h1{color:#DE7356}</style></head>
<body><div class="box"><h1>Kaizen</h1><p>${msg}</p></div></body></html>`;
}
