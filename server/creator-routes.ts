import type { Express, Request, Response } from "express";
import { z } from "zod";
import { eq, and } from "drizzle-orm";

import { db } from "./db";
import { products, productMembers, organisations, organisationMembers } from "@shared/schema";
import { requireOrgAccess } from "./authz";
import {
  initializePKB, loadPKB, initializeOrgPKB, loadOrgPKB, updateOrgPKBFields,
} from "./services/pkb-storage";
import { batchApplyUpdates } from "./services/pkc-curator";
import { chunkText } from "./services/ingestion-service";
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

      const ghUser = await getUser(username, token).catch(() => null);
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

      // Repos already imported (skip dupes by repo_url)
      const existing = await db.select({ repo_url: products.repo_url }).from(products).where(eq(products.org_id, orgId));
      const existingUrls = new Set(existing.map((e: any) => e.repo_url).filter(Boolean));

      const perRepoLangs: Record<string, number>[] = [];
      let imported = 0;

      for (let i = 0; i < ranked.length; i++) {
        const repo = ranked[i];
        send(res, { type: "progress", current: i + 1, total: ranked.length, repo: repo.name });
        if (existingUrls.has(repo.html_url)) continue;

        try {
          const [languages, readme] = await Promise.all([
            getLanguages(repo.full_name, token),
            getReadme(repo.full_name, token),
          ]);
          perRepoLangs.push(languages);

          // Create the project row
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

          await db.insert(productMembers).values({ product_id: product.id, user_id: req.user!.id, role: "owner" });
          await initializePKB(String(product.id), "b2c");

          // Build an ingestion document from repo metadata + README
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
            orgId, productId: String(product.id), productType: "b2c",
            productName: repo.name,
          };
          const chunks = chunkText(doc);
          const updates = await extractFromMultipleChunks(context, chunks, `github:${repo.full_name}`, "doc");
          if (updates.length > 0) await batchApplyUpdates(String(product.id), updates, orgId);
          await runSynthesizer(String(product.id), orgId);

          imported++;
        } catch (e) {
          console.error(`[github-import] failed for ${repo.full_name}:`, e);
          send(res, { type: "error", error: `Could not import ${repo.name}` });
        }
      }

      send(res, { type: "status", message: "Building your profile…" });
      const profile = await runCreatorSynthesizer(orgId);

      send(res, { type: "done", imported, total_repos: allRepos.length, has_profile: !!profile });
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
      res.json({ profile: orgPKB.creator_profile ?? null, projects: rows, github_username: orgPKB.github_username ?? null, avatar_url: orgPKB.avatar_url ?? null });
    } catch (err) {
      console.error("Get profile error:", err);
      res.status(500).json({ error: "Failed to load profile" });
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
