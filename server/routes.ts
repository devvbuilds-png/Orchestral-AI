import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import multer from "multer";
import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";

import { db } from "./db";
import { products, productMembers, conversations, messages, organisations, organisationMembers } from "@shared/schema";
import { storage } from "./storage";
import { requireAuth } from "./auth";
import { supabase, UPLOADS_BUCKET } from "./supabase-storage";

import {
  initializePKB,
  loadPKB,
  modifyPKB,
  deletePKB,
  clearProductLock,
  addDocumentInput,
  addUrlInput,
  addMultipleUrlInputs,
  addFounderSession,
  initializeOrgPKB,
  loadOrgPKB,
  updateOrgPKBFields,
  resolveOrgConflict,
} from "./services/pkb-storage";
import { applyProposedUpdate, batchApplyUpdates } from "./services/pkc-curator";
import {
  processUploadedFile,
  extractTextFromStoredFile,
  fetchUrlContent,
  crawlWebsite,
  chunkText,
  cleanText,
  storeUrlText,
  loadStoredUrlText,
} from "./services/ingestion-service";
import { extractFromMultipleChunks } from "./agents/information-extractor";
import { runSynthesizer, scheduleSynthesizer } from "./agents/synthesizer-function";
import {
  processFounderResponse,
  generateOnboardingTips,
  generateInitialSummary,
} from "./agents/product-interviewer";
import { streamExplainProduct, explainCIChat, formatPKBForContext, type ProductSummary } from "./agents/product-explainer";
import { callLLM, parseJSONResponse, buildConversationHistory } from "./agents/base-agent";
import type { AgentContext } from "./agents/base-agent";
import type { ProductType, PrimaryMode, OrgPKB } from "@shared/schema";

// ============================================================
// Request body schemas — V3 org-scoped
// ============================================================

const createOrganisationSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  industry: z.string().optional(),
  founded_year: z.number().int().optional(),
  num_products: z.number().int().optional(),
  locations: z.array(z.string()).optional(),
  competitors: z.array(z.string()).optional(),
  business_model: z.enum(["b2b", "b2c", "both"]).optional(),
  website_url: z.string().optional(),
});

const updateOrganisationSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  industry: z.string().optional(),
  founded_year: z.number().int().nullable().optional(),
  num_products: z.number().int().nullable().optional(),
  locations: z.array(z.string()).optional(),
  competitors: z.array(z.string()).optional(),
  business_model: z.enum(["b2b", "b2c", "both"]).optional(),
  website_url: z.string().optional(),
});

const extractOrgUrlSchema = z.object({
  url: z.string().url(),
});

// Constrained extraction prompt for org-level fields only (Part C)
const ORG_EXTRACTION_SYSTEM_PROMPT = `You are extracting organisation-level information from a company document.

Extract ONLY the following organisation-level fields. Do not extract product-specific facts, pricing details, personas, features, or any other information.

FIELDS TO EXTRACT:
- name: The organisation/company name
- description: A one-line or short description of the company
- industry: The industry or sector the company operates in
- founded_year: Year the company was founded (integer, e.g. 2018) — null if not found
- num_products: Number of products the company has (integer) — null if not found
- locations: Array of locations/markets served (e.g. ["India", "Southeast Asia", "Global"]) — [] if not found
- competitors: Array of company-wide competitors (e.g. ["Competitor A", "Competitor B"]) — [] if not found
- business_model: How the company sells — must be exactly one of: "b2b", "b2c", or "both" — null if not found
- website_url: The company website URL — null if not found

RULES:
1. Only extract what is explicitly stated in the document — never infer or assume
2. If a field is not found, return null for scalar fields (name, description, industry, founded_year, num_products, business_model, website_url) or [] for array fields (locations, competitors)
3. Do not extract product-specific information, pricing, personas, or features
4. Return a flat JSON object with exactly these keys: name, description, industry, founded_year, num_products, locations, competitors, business_model, website_url`;

// ============================================================
// Request body schemas — V2 product-scoped
// ============================================================

const createProductSchema = z.object({
  name: z.string().min(1),
  orgId: z.number().int(),
});

const setProductTypeSchema = z.object({
  productType: z.enum(["b2b", "b2c", "hybrid"]),
  primaryMode: z.enum(["b2b", "b2c"]).optional(),
});

const fetchUrlSchema = z.object({
  url: z.string().url(),
});

const chatSchema = z.object({
  message: z.string().min(0),
  mode: z.enum(["learner", "explainer"]).optional(),
});

const crawlWebsiteSchema = z.object({
  url: z.string().url(),
  maxPages: z.number().min(1).max(100).optional().default(30),
  maxDepth: z.number().min(1).max(5).optional().default(3),
});

const explainSchema = z.object({
  message: z.string().min(1),
});

const resolveInboxSchema = z.object({
  resolution: z.enum(["approved", "rejected", "locked", "do_not_ask", "resolved"]),
  note: z.string().optional(),
});

const createConversationSchema = z.object({
  title: z.string().optional(),
  mode: z.enum(["learner", "explainer"]).optional().default("learner"),
});

const orgChatSchema = z.object({
  message: z.string().min(1),
  surface: z.enum(["dashboard_chat", "app_guide"]).optional().default("app_guide"),
});

// ============================================================
// File upload middleware
// ============================================================

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowedTypes = [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "text/plain",
      "text/markdown",
    ];
    const allowedExtensions = [".pdf", ".doc", ".docx", ".txt", ".md"];
    const ext = file.originalname.toLowerCase().slice(file.originalname.lastIndexOf("."));
    if (allowedTypes.includes(file.mimetype) || allowedExtensions.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`File type not allowed: ${file.mimetype}`));
    }
  },
});

// ============================================================
// Gap fill helpers
// ============================================================

/** Normalize display-style field paths to dot-notation: "Pricing.Model" → "pricing.model" */
function normalizeFieldPath(raw: string): string {
  const cleaned = raw
    .split(".")
    .map((seg) => seg.trim().toLowerCase().replace(/\s+/g, "_"))
    .join(".");
  // Strip top-level section prefix — callers route to the correct root object
  if (cleaned.startsWith("facts.")) return cleaned.slice("facts.".length);
  if (cleaned.startsWith("extensions.b2b.")) return cleaned.slice("extensions.b2b.".length);
  if (cleaned.startsWith("extensions.b2c.")) return cleaned.slice("extensions.b2c.".length);
  return cleaned;
}

/** Set a value at a dot-notation path, creating intermediate objects as needed */
function setNestedValue(obj: any, path: string, value: any): void {
  const parts = path.split(".");
  let current = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    if (!current[key] || typeof current[key] !== "object") {
      current[key] = {};
    }
    current = current[key];
  }
  current[parts[parts.length - 1]] = value;
}

// ============================================================
// SSE headers helper
// ============================================================

function setSSEHeaders(res: Response): void {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // All /api/* routes below require an authenticated session.
  // /api/auth/me is registered in index.ts before this function and is exempt.
  app.use("/api", requireAuth);

  // ============================================================
  // V2 PRODUCT-SCOPED ROUTES
  // ============================================================

  // GET /api/products — list products for this user, optionally filtered by ?orgId=
  app.get("/api/products", async (req: Request, res: Response) => {
    try {
      const userId = req.user!.id;
      const orgIdParam = req.query.orgId;
      const orgId = orgIdParam ? parseInt(orgIdParam as string) : null;

      const conditions = [eq(productMembers.user_id, userId)];
      if (orgId && !isNaN(orgId)) {
        conditions.push(eq(products.org_id, orgId));
      }

      const rows = await db
        .select({
          id: products.id,
          name: products.name,
          owner_id: products.owner_id,
          org_id: products.org_id,
          product_type: products.product_type,
          state: products.state,
          confidence_score: products.confidence_score,
          created_at: products.created_at,
          updated_at: products.updated_at,
        })
        .from(productMembers)
        .innerJoin(products, eq(productMembers.product_id, products.id))
        .where(and(...conditions));

      res.json({ products: rows });
    } catch (error) {
      console.error("List products error:", error);
      res.status(500).json({ error: "Failed to list products" });
    }
  });

  // POST /api/products — create a new product
  app.post("/api/products", async (req: Request, res: Response) => {
    try {
      const parsed = createProductSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid request", details: parsed.error.errors });
      }
      const { name, orgId } = parsed.data;
      const userId = req.user!.id;

      const [product] = await db
        .insert(products)
        .values({ name, org_id: orgId, owner_id: userId, state: "product_type_selection", confidence_score: 0 })
        .returning();

      await db
        .insert(productMembers)
        .values({ product_id: product.id, user_id: userId, role: "owner" });

      console.log(`Created product ${product.id}: ${name} (org ${orgId})`);
      res.status(201).json({ product });
    } catch (error) {
      console.error("Create product error:", error);
      res.status(500).json({ error: "Failed to create product" });
    }
  });

  // POST /api/products/:productId/type — set product type, initialize PKB
  app.post("/api/products/:productId/type", async (req: Request, res: Response) => {
    try {
      const productId = req.params.productId as string;
      const parsed = setProductTypeSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid request", details: parsed.error.errors });
      }
      const { productType, primaryMode } = parsed.data;

      await db
        .update(products)
        .set({ product_type: productType, state: "onboarding", updated_at: new Date() })
        .where(eq(products.id, parseInt(productId)));

      await initializePKB(productId, productType, primaryMode);
      const tips = generateOnboardingTips(productType);

      res.json({ success: true, productId, productType, primaryMode, tips });
    } catch (error) {
      console.error("Set product type error:", error);
      res.status(500).json({ error: "Failed to set product type" });
    }
  });

  // GET /api/products/:productId — get product PKB
  app.get("/api/products/:productId", async (req: Request, res: Response) => {
    try {
      const productId = req.params.productId as string;

      // Check the DB first — the product must exist there
      const [productRow] = await db
        .select({ id: products.id, product_type: products.product_type })
        .from(products)
        .where(eq(products.id, parseInt(productId)));
      if (!productRow) {
        return res.status(404).json({ error: "Product not found" });
      }

      // Load PKB from storage — initialise on the fly if the file is missing
      let pkb = await loadPKB(productId);
      if (!pkb) {
        const pType = (productRow.product_type as "b2b" | "b2c" | "hybrid") || "b2b";
        pkb = await initializePKB(productId, pType);
      }

      res.json({ pkb });
    } catch (error) {
      console.error("Get product error:", error);
      res.status(500).json({ error: "Failed to get product" });
    }
  });

  // DELETE /api/products/:productId — delete product + PKB
  app.delete("/api/products/:productId", async (req: Request, res: Response) => {
    try {
      const productId = req.params.productId as string;
      const userId = req.user?.id;

      // Ownership check
      const [product] = await db
        .select()
        .from(products)
        .where(eq(products.id, parseInt(productId)))
        .limit(1);

      if (!product) {
        return res.status(404).json({ error: "Product not found" });
      }
      if (product.owner_id !== userId) {
        return res.status(403).json({ error: "Only the product owner can delete this product" });
      }

      // 1. Clean up Supabase Storage — uploads bucket
      try {
        const { data: uploadFiles } = await supabase.storage
          .from(UPLOADS_BUCKET)
          .list(`product_${productId}`);
        if (uploadFiles && uploadFiles.length > 0) {
          await supabase.storage
            .from(UPLOADS_BUCKET)
            .remove(uploadFiles.map((f) => `product_${productId}/${f.name}`));
        }
      } catch (storageErr) {
        console.error(`Failed to clean uploads for product ${productId}:`, storageErr);
      }

      // 2. Clean up Supabase Storage — pkb-store bucket (PKB + snapshots)
      try {
        await deletePKB(productId);
      } catch (storageErr) {
        console.error(`Failed to clean PKB storage for product ${productId}:`, storageErr);
      }

      // 3. Delete DB rows — no FK cascades, so delete children first
      const productIdInt = parseInt(productId);

      // Messages (via conversations for this product)
      const productConvos = await db
        .select({ id: conversations.id })
        .from(conversations)
        .where(eq(conversations.product_id, productIdInt));
      if (productConvos.length > 0) {
        for (const conv of productConvos) {
          await db.delete(messages).where(eq(messages.conversation_id, conv.id));
        }
      }

      await db.delete(conversations).where(eq(conversations.product_id, productIdInt));
      await db.delete(productMembers).where(eq(productMembers.product_id, productIdInt));
      await db.delete(products).where(eq(products.id, productIdInt));

      // 4. Clean up in-memory mutex
      clearProductLock(productId);

      res.json({ success: true });
    } catch (error) {
      console.error("Delete product error:", error);
      res.status(500).json({ error: "Failed to delete product" });
    }
  });

  // POST /api/products/:productId/upload — upload a document
  app.post(
    "/api/products/:productId/upload",
    upload.single("file"),
    async (req: Request, res: Response) => {
      try {
        const productId = req.params.productId as string;
        const file = req.file;
        if (!file) {
          return res.status(400).json({ error: "file is required" });
        }

        const { text, filename } = await processUploadedFile(productId, file);
        await addDocumentInput(productId, filename, file.mimetype, file.size);

        res.json({
          success: true,
          filename,
          extracted_text_length: text.length,
          message: `Successfully uploaded ${filename}`,
        });
      } catch (error) {
        console.error("Upload error:", error);
        res.status(500).json({
          error: error instanceof Error ? error.message : "Failed to upload file",
        });
      }
    }
  );

  // POST /api/products/:productId/fetch-url — fetch and store a URL
  app.post("/api/products/:productId/fetch-url", async (req: Request, res: Response) => {
    try {
      const productId = req.params.productId as string;
      const parsed = fetchUrlSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid request", details: parsed.error.errors });
      }
      const { url } = parsed.data;
      const { text, title } = await fetchUrlContent(url);
      const cleaned = cleanText(text);
      await addUrlInput(productId, url, title);
      await storeUrlText(productId, url, cleaned);

      res.json({
        success: true,
        url,
        title,
        extracted_text_length: text.length,
        message: `Successfully fetched content from ${title || url}`,
      });
    } catch (error) {
      console.error("URL fetch error:", error);
      res.status(500).json({
        error: error instanceof Error ? error.message : "Failed to fetch URL",
      });
    }
  });

  // POST /api/products/:productId/crawl-website — crawl a website (SSE)
  app.post("/api/products/:productId/crawl-website", async (req: Request, res: Response) => {
    try {
      const productId = req.params.productId as string;
      const parsed = crawlWebsiteSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid request", details: parsed.error.errors });
      }
      const { url, maxPages, maxDepth } = parsed.data;

      setSSEHeaders(res);
      res.write(`data: ${JSON.stringify({ type: "status", message: "Starting website crawl..." })}\n\n`);

      const result = await crawlWebsite(url, {
        maxPages,
        maxDepth,
        onProgress: (progress) => {
          res.write(`data: ${JSON.stringify({
            type: "progress",
            current: progress.current,
            total: progress.total,
            currentUrl: progress.currentUrl,
          })}\n\n`);
        },
      });

      await addMultipleUrlInputs(productId, result.pages.map(p => ({ url: p.url, title: p.title })));

      res.write(`data: ${JSON.stringify({
        type: "complete",
        totalPages: result.totalPages,
        errors: result.errors.length,
        pages: result.pages.map(p => ({ url: p.url, title: p.title })),
      })}\n\n`);
      res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
      res.end();
    } catch (error) {
      console.error("Website crawl error:", error);
      res.status(500).json({
        error: error instanceof Error ? error.message : "Failed to crawl website",
      });
    }
  });

  // POST /api/products/:productId/process — ingest all inputs and run pipeline (SSE)
  app.post("/api/products/:productId/process", async (req: Request, res: Response) => {
    try {
      const productId = req.params.productId as string;
      const pkb = await loadPKB(productId);
      if (!pkb) {
        return res.status(404).json({ error: "Product not found" });
      }

      setSSEHeaders(res);

      const [productRow] = await db.select({ org_id: products.org_id, productName: products.name }).from(products).where(eq(products.id, parseInt(productId)));
      const context: AgentContext = {
        orgId: productRow?.org_id ?? 1,
        productId: productId,
        productType: pkb.meta.product_type as ProductType,
        primaryMode: pkb.meta.primary_mode as PrimaryMode | undefined,
        productName: productRow?.productName ?? undefined,
      };

      res.write(`data: ${JSON.stringify({ type: "status", data: "Extracting information from documents..." })}\n\n`);

      const allTexts: { text: string; source: string; type: "doc" | "url" }[] = [];

      if (pkb.meta.inputs?.documents) {
        for (const doc of pkb.meta.inputs.documents) {
          try {
            const text = await extractTextFromStoredFile(productId, doc.filename);
            allTexts.push({ text, source: doc.filename, type: "doc" });
          } catch (e) {
            console.error(`Failed to read ${doc.filename}:`, e);
          }
        }
      }

      let urlsFailed = 0;
      if (pkb.meta.inputs?.urls) {
        for (const urlInfo of pkb.meta.inputs.urls) {
          try {
            // Try stored text first, fall back to live fetch
            let text = await loadStoredUrlText(productId, urlInfo.url);
            if (!text) {
              const fetched = await fetchUrlContent(urlInfo.url);
              text = cleanText(fetched.text);
              await storeUrlText(productId, urlInfo.url, text);
            }
            allTexts.push({ text, source: urlInfo.url, type: "url" });
          } catch (e) {
            urlsFailed++;
            const msg = e instanceof Error ? e.message : "Unknown error";
            console.error(`Failed to fetch ${urlInfo.url}:`, msg);
            res.write(`data: ${JSON.stringify({ type: "error", error: `Failed to fetch URL: ${urlInfo.url} — ${msg}` })}\n\n`);
          }
        }
      }

      // Collect all proposed updates from all documents/URLs, then apply in one batch
      const allUpdates: import("@shared/schema").ProposedUpdate[] = [];
      for (const { text, source, type } of allTexts) {
        const chunks = chunkText(text);
        const updates = await extractFromMultipleChunks(context, chunks, source, type);
        allUpdates.push(...updates);
      }

      if (allUpdates.length > 0) {
        const decisions = await batchApplyUpdates(productId, allUpdates, context.orgId);
        for (let i = 0; i < decisions.length; i++) {
          if (!decisions[i].accepted) {
            console.log(`Update rejected for ${allUpdates[i].field_path}: ${decisions[i].reason}`);
          }
        }
      }

      res.write(`data: ${JSON.stringify({ type: "status", data: "Synthesizing product knowledge..." })}\n\n`);

      const synthOut = await runSynthesizer(productId, context.orgId);

      const confidenceLevel = synthOut
        ? synthOut.kbStage === "established" ? "high" : synthOut.kbStage === "building" ? "medium" : "low"
        : "low";
      const confidenceScore = synthOut?.confidenceScore ?? 0;

      res.write(`data: ${JSON.stringify({
        type: "confidence",
        level: confidenceLevel,
        score: confidenceScore,
      })}\n\n`);

      const updatedPkb = await loadPKB(productId);
      if (updatedPkb?.facts?.product_identity?.name?.value) {
        res.write(`data: ${JSON.stringify({
          type: "product_name",
          name: updatedPkb.facts.product_identity.name.value,
        })}\n\n`);
      }

      const initialSummary = await generateInitialSummary(context, updatedPkb || pkb);
      res.write(`data: ${JSON.stringify({ type: "content", data: initialSummary })}\n\n`);

      const gapCount = synthOut
        ? synthOut.gapAnalysis.critical.length + synthOut.gapAnalysis.standard.length
        : 0;
      const hasGaps = gapCount > 0;

      // Save ingestion_complete message to the most recent conversation for this product
      try {
        const userId = req.user?.id;
        const productIdInt = parseInt(productId);
        console.log(`[INGESTION_MSG] Attempting to save ingestion message for product ${productIdInt}, userId=${userId}`);

        if (!userId) {
          console.error("[INGESTION_MSG] req.user is missing — auth may not work for SSE requests");
        }

        // Find the most recent conversation for this product and user
        let [conv] = await db
          .select({ id: conversations.id })
          .from(conversations)
          .where(
            and(
              eq(conversations.product_id, productIdInt),
              eq(conversations.user_id, userId!),
            )
          )
          .orderBy(desc(conversations.updated_at))
          .limit(1);

        console.log(`[INGESTION_MSG] Found conversation: ${conv ? conv.id : "NONE"}`);

        // If no conversation exists, create one
        if (!conv) {
          console.log(`[INGESTION_MSG] Creating new conversation for product ${productIdInt}`);
          [conv] = await db
            .insert(conversations)
            .values({ product_id: productIdInt, user_id: userId!, mode: "learner" })
            .returning({ id: conversations.id });
          console.log(`[INGESTION_MSG] Created conversation ${conv.id}`);
        }

        const factsApplied = allUpdates.length;
        const ingestionContent = hasGaps
          ? `[INGESTION_COMPLETE:${gapCount}] I've processed your content and captured ${factsApplied} facts — check the Knowledge tab to see them. I identified ${gapCount} knowledge gaps that would improve answer quality.`
          : `[INGESTION_COMPLETE:0] I've processed your content and captured ${factsApplied} facts — the knowledge base is looking good. Check the Knowledge tab to see what was captured.`;

        console.log(`[INGESTION_MSG] Inserting message into conversation ${conv.id}, content length=${ingestionContent.length}`);
        await db.insert(messages).values({
          conversation_id: conv.id,
          role: "assistant",
          content: ingestionContent,
        });
        console.log(`[INGESTION_MSG] Ingestion message saved successfully for product ${productIdInt}, conversation ${conv.id}`);
      } catch (msgErr) {
        console.error("[INGESTION_MSG] Failed to save ingestion_complete message:", msgErr);
      }

      res.write(`data: ${JSON.stringify({
        type: "done",
        has_gaps: hasGaps,
        confidence: confidenceLevel,
        urls_failed: urlsFailed,
      })}\n\n`);
      res.end();
    } catch (error) {
      console.error("Process error:", error);
      if (!res.headersSent) {
        res.status(500).json({ error: "Failed to process documents" });
      } else {
        res.write(`data: ${JSON.stringify({ type: "error", error: "Processing failed" })}\n\n`);
        res.end();
      }
    }
  });

  // POST /api/products/:productId/recheck-gaps — re-run gap analysis
  app.post("/api/products/:productId/recheck-gaps", async (req: Request, res: Response) => {
    try {
      const productId = req.params.productId as string;
      const pkb = await loadPKB(productId);
      if (!pkb) {
        return res.status(404).json({ error: "Product not found" });
      }

      const [recheckProductRow] = await db.select({ org_id: products.org_id, productName: products.name }).from(products).where(eq(products.id, parseInt(productId)));
      const context: AgentContext = {
        orgId: recheckProductRow?.org_id ?? 1,
        productId: productId,
        productType: pkb.meta.product_type as ProductType,
        primaryMode: pkb.meta.primary_mode as PrimaryMode | undefined,
        productName: recheckProductRow?.productName ?? undefined,
      };

      const synthOut = await runSynthesizer(productId, context.orgId);

      const freshPkb = await loadPKB(productId);
      const gaps = freshPkb?.gaps?.current ?? [];

      res.json({
        gaps,
        confidence: synthOut
          ? {
              level: synthOut.kbStage === "established" ? "high" : synthOut.kbStage === "building" ? "medium" : "low",
              score: synthOut.confidenceScore,
            }
          : null,
        message:
          gaps.length > 0
            ? `Found ${gaps.length} gap${gaps.length !== 1 ? "s" : ""} — use Fill Gaps in the Knowledge tab to complete them.`
            : "No gaps found — knowledge base is looking complete.",
      });
    } catch (error) {
      console.error("Recheck gaps error:", error);
      res.status(500).json({ error: "Failed to recheck gaps" });
    }
  });

  // GET /api/products/:productId/inbox — get review inbox items
  app.get("/api/products/:productId/inbox", async (req: Request, res: Response) => {
    try {
      const productId = req.params.productId as string;
      const pkb = await loadPKB(productId);
      if (!pkb) {
        return res.status(404).json({ error: "Product not found" });
      }
      res.json({ inbox: pkb.review_inbox || [] });
    } catch (error) {
      console.error("Get inbox error:", error);
      res.status(500).json({ error: "Failed to get inbox" });
    }
  });

  // POST /api/products/:productId/inbox/:itemId/resolve — resolve an inbox item
  app.post(
    "/api/products/:productId/inbox/:itemId/resolve",
    async (req: Request, res: Response) => {
      try {
        const productId = req.params.productId as string;
        const itemId = req.params.itemId as string;
        const parsed = resolveInboxSchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({ error: "Invalid request", details: parsed.error.errors });
        }
        const { resolution, note } = parsed.data;

        let resolvedItem: any = null;
        await modifyPKB(productId, (pkb) => {
          const item = pkb.review_inbox?.find(i => i.item_id === itemId);
          if (!item) return;
          item.status = resolution;
          item.resolved_at = new Date().toISOString();
          if (note) item.resolved_by = note;
          resolvedItem = item;
        });
        if (!resolvedItem) {
          return res.status(404).json({ error: "Inbox item not found" });
        }
        res.json({ success: true, item: resolvedItem });
      } catch (error) {
        console.error("Resolve inbox error:", error);
        res.status(500).json({ error: "Failed to resolve inbox item" });
      }
    }
  );

  // GET /api/products/:productId/conversations — list this user's conversations for a product
  app.get("/api/products/:productId/conversations", async (req: Request, res: Response) => {
    try {
      const productId = parseInt(req.params.productId as string);
      const userId = req.user!.id;
      const productConversations = await db
        .select()
        .from(conversations)
        .where(
          and(
            eq(conversations.product_id, productId),
            eq(conversations.user_id, userId),
          )
        );
      res.json({ conversations: productConversations });
    } catch (error) {
      console.error("List conversations error:", error);
      res.status(500).json({ error: "Failed to list conversations" });
    }
  });

  // POST /api/products/:productId/conversations — create a new conversation
  app.post("/api/products/:productId/conversations", async (req: Request, res: Response) => {
    try {
      const productId = parseInt(req.params.productId as string);
      const userId = req.user!.id;
      const parsed = createConversationSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid request", details: parsed.error.errors });
      }
      const { title, mode } = parsed.data;

      const [conversation] = await db
        .insert(conversations)
        .values({ product_id: productId, user_id: userId, title, mode })
        .returning();

      res.status(201).json({ conversation });
    } catch (error) {
      console.error("Create conversation error:", error);
      res.status(500).json({ error: "Failed to create conversation" });
    }
  });

  // GET /api/products/:productId/conversations/:conversationId/messages — load chat history
  app.get(
    "/api/products/:productId/conversations/:conversationId/messages",
    async (req: Request, res: Response) => {
      try {
        const conversationId = parseInt(req.params.conversationId as string);
        const userId = req.user!.id;

        // Verify the conversation belongs to this user before returning its messages
        const [conv] = await db
          .select({ id: conversations.id })
          .from(conversations)
          .where(
            and(
              eq(conversations.id, conversationId),
              eq(conversations.user_id, userId),
            )
          )
          .limit(1);

        if (!conv) {
          return res.status(404).json({ error: "Conversation not found" });
        }

        const history = await db
          .select()
          .from(messages)
          .where(eq(messages.conversation_id, conversationId))
          .orderBy(messages.id);

        res.json({ messages: history });
      } catch (error) {
        console.error("Load messages error:", error);
        res.status(500).json({ error: "Failed to load messages" });
      }
    }
  );

  // POST /api/products/:productId/conversations/:conversationId/chat — learner mode chat (SSE)
  app.post(
    "/api/products/:productId/conversations/:conversationId/chat",
    async (req: Request, res: Response) => {
      try {
        const productId = req.params.productId as string;
        const conversationId = req.params.conversationId as string;
        const parsed = chatSchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({ error: "Invalid request", details: parsed.error.errors });
        }
        const { message } = parsed.data;

        const pkb = await loadPKB(productId);
        if (!pkb) {
          return res.status(404).json({ error: "Product not found" });
        }

        setSSEHeaders(res);

        const [chatProductRow] = await db
          .select({ org_id: products.org_id, productName: products.name, orgName: organisations.name })
          .from(products)
          .leftJoin(organisations, eq(products.org_id, organisations.id))
          .where(eq(products.id, parseInt(productId)));
        const context: AgentContext = {
          orgId: chatProductRow?.org_id ?? 1,
          productId: productId,
          productType: pkb.meta.product_type as ProductType,
          primaryMode: pkb.meta.primary_mode as PrimaryMode | undefined,
          productName: chatProductRow?.productName ?? undefined,
          orgName: chatProductRow?.orgName ?? undefined,
        };

        // Load conversation history for multi-turn context
        const convIdIntForHistory = parseInt(conversationId);
        const historyRows = await db
          .select({ role: messages.role, content: messages.content })
          .from(messages)
          .where(eq(messages.conversation_id, convIdIntForHistory))
          .orderBy(messages.created_at)
          .limit(20);
        const conversationHistory = buildConversationHistory(historyRows);

        // Normalise empty message to the SESSION_START sentinel so the LLM
        // generates the mode-appropriate opening message.
        const effectiveMessage = message.trim() ? message : "[SESSION_START]";
        const { response, updates } = await processFounderResponse(context, effectiveMessage, conversationHistory);

        // Track this conversation as a founder session AFTER mode detection,
        // so the first message correctly sees isFirstProductSession=true.
        await addFounderSession(productId, conversationId);

        for (const update of updates) {
          await applyProposedUpdate(productId, update, context.orgId);
        }

        // Trigger synthesizer if the Learner extracted any facts, so confidence/gaps/brief stay current.
        // Placed here (before streaming) so it fires even if the client disconnects mid-stream.
        if (updates.length > 0) {
          scheduleSynthesizer(productId, context.orgId);
        }

        // Persist messages before streaming so they're in DB by the time the
        // client receives the 'done' event and invalidates its messages query.
        const convIdInt = parseInt(conversationId);
        if (message.trim()) {
          // Don't persist the synthetic [SESSION_START] sentinel as a user turn
          await db.insert(messages).values({ conversation_id: convIdInt, role: "user", content: message.trim() });
        }
        await db.insert(messages).values({ conversation_id: convIdInt, role: "assistant", content: response });

        const words = response.split(" ");
        for (const word of words) {
          res.write(`data: ${JSON.stringify({ type: "content", data: word + " " })}\n\n`);
          await new Promise(resolve => setTimeout(resolve, 15));
        }

        res.write(`data: ${JSON.stringify({ type: "done", facts_extracted: updates.length })}\n\n`);
        res.end();
      } catch (error) {
        console.error("Chat error:", error);
        if (!res.headersSent) {
          res.status(500).json({ error: "Chat failed" });
        } else {
          res.write(`data: ${JSON.stringify({ type: "error", error: "Chat failed" })}\n\n`);
          res.end();
        }
      }
    }
  );

  // POST /api/products/:productId/conversations/:conversationId/explain — explainer mode (SSE)
  app.post(
    "/api/products/:productId/conversations/:conversationId/explain",
    async (req: Request, res: Response) => {
      try {
        const productId = req.params.productId as string;
        const conversationId = req.params.conversationId as string;
        const parsed = explainSchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({ error: "Invalid request", details: parsed.error.errors });
        }
        const { message } = parsed.data;

        const pkb = await loadPKB(productId);
        if (!pkb) {
          return res.status(404).json({ error: "Product not found" });
        }

        setSSEHeaders(res);

        const [explainProductRow] = await db.select({ org_id: products.org_id, productName: products.name }).from(products).where(eq(products.id, parseInt(productId)));
        const context: AgentContext = {
          orgId: explainProductRow?.org_id ?? 1,
          productId: productId,
          productType: pkb.meta.product_type as ProductType,
          primaryMode: pkb.meta.primary_mode as PrimaryMode | undefined,
          productName: explainProductRow?.productName ?? undefined,
        };

        // isFirstExplainerUse: check if this user has any prior explainer conversations for this product
        const prevExplainerConvs = await db
          .select({ id: conversations.id })
          .from(conversations)
          .where(
            and(
              eq(conversations.product_id, parseInt(productId)),
              eq(conversations.mode, "explainer"),
              eq(conversations.user_id, req.user!.id),
            ),
          );
        const isFirstExplainerUse = prevExplainerConvs.length === 0;

        // Mark this conversation as explainer so future calls detect prior usage
        await db
          .update(conversations)
          .set({ mode: "explainer" })
          .where(eq(conversations.id, parseInt(conversationId)));

        const suggestedQuestions: string[] = pkb.meta.suggested_questions ?? [];

        // Load conversation history for multi-turn context
        const explainConvIdForHistory = parseInt(conversationId);
        const explainHistoryRows = await db
          .select({ role: messages.role, content: messages.content })
          .from(messages)
          .where(eq(messages.conversation_id, explainConvIdForHistory))
          .orderBy(messages.created_at)
          .limit(20);
        const explainHistory = buildConversationHistory(explainHistoryRows);

        // Collect full response while streaming so we can persist it afterwards
        let fullExplainResponse = "";
        for await (const chunk of streamExplainProduct(context, message, {
          surface: "product_chat",
          isFirstExplainerUse,
          suggestedQuestions,
        }, explainHistory)) {
          fullExplainResponse += chunk;
          res.write(`data: ${JSON.stringify({ type: "content", data: chunk })}\n\n`);
        }

        // Persist both turns before sending 'done' so the DB is ready when the
        // client invalidates its messages query on receipt of the event.
        const explainConvIdInt = parseInt(conversationId);
        await db.insert(messages).values({ conversation_id: explainConvIdInt, role: "user", content: message });
        await db.insert(messages).values({ conversation_id: explainConvIdInt, role: "assistant", content: fullExplainResponse });

        res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
        res.end();
      } catch (error) {
        console.error("Explain error:", error);
        if (!res.headersSent) {
          res.status(500).json({ error: "Explain failed" });
        } else {
          res.write(`data: ${JSON.stringify({ type: "error", error: "Explain failed" })}\n\n`);
          res.end();
        }
      }
    }
  );

  // POST /api/products/:productId/fill-gaps — batch-answer knowledge gaps
  app.post("/api/products/:productId/fill-gaps", async (req: Request, res: Response) => {
    try {
      const productId = req.params.productId as string;
      const { answers, skipped } = req.body as {
        answers: { field_path: string; answer: string }[];
        skipped: string[];
      };

      const pkb = await loadPKB(productId);
      if (!pkb) {
        return res.status(404).json({ error: "Product not found" });
      }

      const [fillGapsProductRow] = await db.select({ org_id: products.org_id, productName: products.name }).from(products).where(eq(products.id, parseInt(productId)));
      const context: AgentContext = {
        orgId: fillGapsProductRow?.org_id ?? 1,
        productId: productId,
        productType: pkb.meta.product_type as ProductType,
        primaryMode: pkb.meta.primary_mode as PrimaryMode | undefined,
        productName: fillGapsProductRow?.productName ?? undefined,
      };

      if (answers && answers.length > 0) {
        await modifyPKB(productId, (freshPkb) => {
          for (const { field_path, answer } of answers) {
            const normalized = normalizeFieldPath(field_path);
            const fact = {
              value: answer,
              sources: [{
                source_type: "founder" as const,
                source_ref: "gap_fill",
                captured_at: new Date().toISOString(),
                evidence: answer,
              }],
              quality_tag: "ok" as const,
            };
            // Route to the correct PKB section based on the original path
            const lowerPath = field_path.trim().toLowerCase();
            let targetObj: any;
            if (lowerPath.startsWith("extensions.b2b.")) {
              if (!freshPkb.extensions) freshPkb.extensions = {};
              if (!freshPkb.extensions.b2b) freshPkb.extensions.b2b = {};
              targetObj = freshPkb.extensions.b2b;
            } else if (lowerPath.startsWith("extensions.b2c.")) {
              if (!freshPkb.extensions) freshPkb.extensions = {};
              if (!freshPkb.extensions.b2c) freshPkb.extensions.b2c = {};
              targetObj = freshPkb.extensions.b2c;
            } else {
              targetObj = freshPkb.facts;
            }
            setNestedValue(targetObj, normalized, fact);
          }
        });
      }

      if (skipped && skipped.length > 0) {
        await modifyPKB(productId, (freshPkb) => {
          if (freshPkb.gaps?.current) {
            freshPkb.gaps.current = freshPkb.gaps.current.map((g) =>
              skipped.includes(g.field_path) ? { ...g, do_not_ask: true } : g
            );
          }
        });
      }

      scheduleSynthesizer(productId, context.orgId);

      const postFillPkb = await loadPKB(productId);
      const new_gaps = postFillPkb?.gaps?.current ?? [];
      res.json({ new_gaps, message: "Gaps recorded. Knowledge base will be updated shortly." });
    } catch (error) {
      console.error("Fill gaps error:", error);
      res.status(500).json({ error: "Failed to fill gaps" });
    }
  });

  // ============================================================
  // V3 ORG-SCOPED ROUTES
  // ============================================================

  // POST /api/organisations — create organisation + org PKB + add owner as admin member
  app.post("/api/organisations", async (req: Request, res: Response) => {
    try {
      const parsed = createOrganisationSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid request", details: parsed.error.errors });
      }
      const { name, description, industry, founded_year, num_products, locations, competitors, business_model, website_url } = parsed.data;

      const userId = req.user!.id;

      const [org] = await db
        .insert(organisations)
        .values({ name, description, industry, founded_year, num_products, locations, competitors, business_model, website_url, owner_id: userId })
        .returning();

      await initializeOrgPKB(org.id);
      await updateOrgPKBFields(org.id, {
        name: org.name,
        description: org.description ?? "",
        industry: org.industry ?? "",
        founded_year: org.founded_year ?? null,
        num_products: org.num_products ?? null,
        locations: org.locations ?? [],
        competitors: org.competitors ?? [],
        business_model: org.business_model ?? "",
        website_url: org.website_url ?? "",
      });

      await db
        .insert(organisationMembers)
        .values({ org_id: org.id, user_id: userId, org_role: "admin" });

      console.log(`Created organisation ${org.id}: ${name}`);
      res.status(201).json({ organisation: org });
    } catch (error) {
      console.error("Create organisation error:", error);
      res.status(500).json({ error: "Failed to create organisation" });
    }
  });

  // GET /api/organisations — returns this user's org (first membership) or null if none
  app.get("/api/organisations", async (req: Request, res: Response) => {
    try {
      const userId = req.user!.id;
      const [row] = await db
        .select({ organisation: organisations })
        .from(organisationMembers)
        .innerJoin(organisations, eq(organisationMembers.org_id, organisations.id))
        .where(eq(organisationMembers.user_id, userId))
        .limit(1);

      if (!row) {
        return res.json({ organisation: null, pkb: null });
      }
      const org = row.organisation;
      const pkb = await loadOrgPKB(org.id);
      res.json({ organisation: org, pkb });
    } catch (error) {
      console.error("Get current org error:", error);
      res.status(500).json({ error: "Failed to get organisation" });
    }
  });

  // GET /api/organisations/:orgId — get org record + org PKB
  app.get("/api/organisations/:orgId", async (req: Request, res: Response) => {
    try {
      const orgId = parseInt(req.params.orgId as string);
      if (isNaN(orgId)) {
        return res.status(400).json({ error: "Invalid org ID" });
      }

      const [org] = await db
        .select()
        .from(organisations)
        .where(eq(organisations.id, orgId));

      if (!org) {
        return res.status(404).json({ error: "Organisation not found" });
      }

      const pkb = await loadOrgPKB(orgId);
      res.json({ organisation: org, pkb });
    } catch (error) {
      console.error("Get organisation error:", error);
      res.status(500).json({ error: "Failed to get organisation" });
    }
  });

  // PATCH /api/organisations/:orgId — update org fields in DB + org PKB
  app.patch("/api/organisations/:orgId", async (req: Request, res: Response) => {
    try {
      const orgId = parseInt(req.params.orgId as string);
      if (isNaN(orgId)) {
        return res.status(400).json({ error: "Invalid org ID" });
      }

      const parsed = updateOrganisationSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid request", details: parsed.error.errors });
      }
      const fields = parsed.data;

      const [org] = await db
        .update(organisations)
        .set({ ...fields, updated_at: new Date() })
        .where(eq(organisations.id, orgId))
        .returning();

      if (!org) {
        return res.status(404).json({ error: "Organisation not found" });
      }

      const pkbFields: Partial<OrgPKB> = {};
      if (fields.name !== undefined) pkbFields.name = fields.name;
      if (fields.description !== undefined) pkbFields.description = fields.description;
      if (fields.industry !== undefined) pkbFields.industry = fields.industry;
      if (fields.founded_year !== undefined) pkbFields.founded_year = fields.founded_year ?? null;
      if (fields.num_products !== undefined) pkbFields.num_products = fields.num_products ?? null;
      if (fields.locations !== undefined) pkbFields.locations = fields.locations;
      if (fields.competitors !== undefined) pkbFields.competitors = fields.competitors;
      if (fields.business_model !== undefined) pkbFields.business_model = fields.business_model;
      if (fields.website_url !== undefined) pkbFields.website_url = fields.website_url;

      const pkb = await updateOrgPKBFields(orgId, pkbFields);
      res.json({ organisation: org, pkb });
    } catch (error) {
      console.error("Update organisation error:", error);
      res.status(500).json({ error: "Failed to update organisation" });
    }
  });

  // POST /api/organisations/:orgId/chat — Central Intelligence chat (non-streaming, single Q&A)
  app.post("/api/organisations/:orgId/chat", async (req: Request, res: Response) => {
    try {
      const orgId = parseInt(req.params.orgId as string);
      if (isNaN(orgId)) {
        return res.status(400).json({ error: "Invalid org ID" });
      }

      const parsed = orgChatSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid request", details: parsed.error.errors });
      }

      const [org] = await db.select().from(organisations).where(eq(organisations.id, orgId));
      if (!org) {
        return res.status(404).json({ error: "Organisation not found" });
      }

      const orgPKB = await loadOrgPKB(orgId);
      const { message, surface } = parsed.data;

      let allProductSummaries: ProductSummary[] | undefined;
      if (surface === "dashboard_chat") {
        const orgProducts = await db.select().from(products).where(eq(products.org_id, orgId));
        const productPkbs = await Promise.all(orgProducts.map(p => loadPKB(String(p.id))));
        allProductSummaries = orgProducts.map((p, i) => {
          const pkb = productPkbs[i];
          if (!pkb) {
            return {
              productName: p.name,
              fullFacts: "No knowledge base yet.",
              kb: { confidenceScore: 0, stage: "empty" },
            };
          }
          const confidenceScore = pkb.meta.confidence_score ?? 0;
          const stage = confidenceScore >= 70 ? "established" : confidenceScore > 0 ? "building" : "empty";
          return {
            productName: pkb.meta?.product_name || p.name,
            productBrief: pkb.derived_insights?.product_brief?.simple_summary,
            fullFacts: formatPKBForContext(pkb),
            kb: { confidenceScore, stage },
          };
        });
      }

      const response = await explainCIChat(orgPKB, org.name, message, surface, allProductSummaries);
      res.json({ response });
    } catch (error) {
      console.error("Org chat error:", error);
      res.status(500).json({ error: "Chat failed" });
    }
  });

  // POST /api/organisations/:orgId/extract — constrained org-level doc/URL extraction
  app.post(
    "/api/organisations/:orgId/extract",
    upload.single("file"),
    async (req: Request, res: Response) => {
      try {
        const orgId = parseInt(req.params.orgId as string);
        if (isNaN(orgId)) {
          return res.status(400).json({ error: "Invalid org ID" });
        }

        // Verify org exists
        const [org] = await db
          .select()
          .from(organisations)
          .where(eq(organisations.id, orgId));
        if (!org) {
          return res.status(404).json({ error: "Organisation not found" });
        }

        let text = "";
        let sourceRef = "";

        if (req.file) {
          // File upload path — write to OS temp dir for extraction only, no persistent storage needed for org extract
          const fsSync = await import("fs");
          const pathMod = await import("path");
          const osMod = await import("os");
          const { extractTextFromFile } = await import("./services/ingestion-service");
          const tmpPath = pathMod.join(osMod.tmpdir(), `org_extract_${Date.now()}_${req.file.originalname}`);
          fsSync.writeFileSync(tmpPath, req.file.buffer);
          try {
            text = cleanText(await extractTextFromFile(tmpPath));
          } finally {
            try { fsSync.unlinkSync(tmpPath); } catch {}
          }
          sourceRef = req.file.originalname;
        } else if (req.body?.url) {
          // URL path
          const urlParsed = extractOrgUrlSchema.safeParse({ url: req.body.url });
          if (!urlParsed.success) {
            return res.status(400).json({ error: "Invalid URL", details: urlParsed.error.errors });
          }
          const { text: urlText, title } = await fetchUrlContent(urlParsed.data.url);
          text = cleanText(urlText);
          sourceRef = urlParsed.data.url;
        } else {
          return res.status(400).json({ error: "Either a file or a url is required" });
        }

        // Run constrained extraction via LLM — scoped to org fields only
        const userPrompt = `Extract organisation-level fields from the following content. Return only what is explicitly stated.

SOURCE: ${sourceRef}

CONTENT:
${text.slice(0, 12000)}`; // cap to avoid token overflow

        const response = await callLLM(ORG_EXTRACTION_SYSTEM_PROMPT, userPrompt, {
          responseFormat: "json",
          maxTokens: 2048,
        });

        const extracted = parseJSONResponse<Partial<Record<keyof OrgPKB, any>>>(response);
        if (!extracted) {
          return res.status(500).json({ error: "Failed to parse extraction result" });
        }

        // Filter out nulls and empty values before saving
        const orgFields: Partial<OrgPKB> = {};
        if (extracted.name) orgFields.name = String(extracted.name);
        if (extracted.description) orgFields.description = String(extracted.description);
        if (extracted.industry) orgFields.industry = String(extracted.industry);
        if (extracted.founded_year != null) orgFields.founded_year = Number(extracted.founded_year);
        if (extracted.num_products != null) orgFields.num_products = Number(extracted.num_products);
        if (Array.isArray(extracted.locations) && extracted.locations.length > 0) orgFields.locations = extracted.locations;
        if (Array.isArray(extracted.competitors) && extracted.competitors.length > 0) orgFields.competitors = extracted.competitors;
        if (extracted.business_model && ["b2b", "b2c", "both"].includes(extracted.business_model)) orgFields.business_model = extracted.business_model;
        if (extracted.website_url) orgFields.website_url = String(extracted.website_url);

        const pkb = await updateOrgPKBFields(orgId, orgFields);

        // Sync found fields back to DB record
        if (Object.keys(orgFields).length > 0) {
          const dbFields: Record<string, any> = { updated_at: new Date() };
          if (orgFields.name) dbFields.name = orgFields.name;
          if (orgFields.description !== undefined) dbFields.description = orgFields.description;
          if (orgFields.industry !== undefined) dbFields.industry = orgFields.industry;
          if (orgFields.founded_year !== undefined) dbFields.founded_year = orgFields.founded_year;
          if (orgFields.num_products !== undefined) dbFields.num_products = orgFields.num_products;
          if (orgFields.locations !== undefined) dbFields.locations = orgFields.locations;
          if (orgFields.competitors !== undefined) dbFields.competitors = orgFields.competitors;
          if (orgFields.business_model !== undefined) dbFields.business_model = orgFields.business_model;
          if (orgFields.website_url !== undefined) dbFields.website_url = orgFields.website_url;
          await db.update(organisations).set(dbFields).where(eq(organisations.id, orgId));
        }

        console.log(`Org ${orgId} extract from ${sourceRef}: found ${Object.keys(orgFields).length} fields`);
        res.json({ extracted: orgFields, pkb });
      } catch (error) {
        console.error("Org extract error:", error);
        res.status(500).json({ error: "Failed to extract organisation fields" });
      }
    }
  );

  // ============================================================
  // Org Inbox (Phase 5 — conflict queue)
  // ============================================================

  // GET /api/organisations/:orgId/inbox — pending conflicts only
  app.get("/api/organisations/:orgId/inbox", async (req: Request, res: Response) => {
    try {
      const orgId = parseInt(req.params.orgId as string);
      if (isNaN(orgId)) return res.status(400).json({ error: "Invalid org ID" });

      const pkb = await loadOrgPKB(orgId);
      const conflicts = (pkb.conflicts || []).filter(c => c.status === "pending");
      res.json({ conflicts });
    } catch (error) {
      console.error("Get org inbox error:", error);
      res.status(500).json({ error: "Failed to get org inbox" });
    }
  });

  // POST /api/organisations/:orgId/inbox/:conflictId/resolve
  app.post(
    "/api/organisations/:orgId/inbox/:conflictId/resolve",
    async (req: Request, res: Response) => {
      try {
        const orgId = parseInt(req.params.orgId as string);
        const conflictId = req.params.conflictId as string;
        if (isNaN(orgId)) return res.status(400).json({ error: "Invalid org ID" });

        const { resolution, updatedValue } = req.body as {
          resolution: "resolved" | "dismissed";
          updatedValue?: string;
        };

        if (!["resolved", "dismissed"].includes(resolution)) {
          return res.status(400).json({ error: "Invalid resolution — must be 'resolved' or 'dismissed'" });
        }

        const conflict = await resolveOrgConflict(orgId, conflictId, resolution, updatedValue);
        if (!conflict) return res.status(404).json({ error: "Conflict not found" });

        res.json({ conflict });
      } catch (error) {
        console.error("Resolve org conflict error:", error);
        res.status(500).json({ error: "Failed to resolve conflict" });
      }
    }
  );

  return httpServer;
}
