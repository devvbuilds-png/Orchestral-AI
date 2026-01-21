import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import multer from "multer";
import { z } from "zod";
import { storage } from "./storage";

import { 
  initializePKB, 
  loadPKB, 
  savePKB, 
  deletePKB,
  addDocumentInput,
  addUrlInput 
} from "./services/pkb-storage";
import { applyProposedUpdate, batchApplyUpdates } from "./services/pkc-curator";
import { 
  processUploadedFile, 
  fetchUrlContent, 
  chunkText, 
  cleanText 
} from "./services/ingestion-service";
import { extractFromMultipleChunks } from "./agents/information-extractor";
import { synthesizeProductKnowledge, formatSynthesisForChat } from "./agents/product-synthesizer";
import { identifyGaps, formatGapsForChat } from "./agents/gap-identifier";
import { processFounderResponse, generateOnboardingTips } from "./agents/product-interviewer";
import { streamExplainProduct } from "./agents/product-explainer";

import type { AgentContext, ProductType, PrimaryMode } from "@shared/schema";

const sessionInitSchema = z.object({
  sessionId: z.string().min(1),
  productType: z.enum(["b2b", "b2c", "hybrid"]),
  primaryMode: z.enum(["b2b", "b2c"]).optional(),
});

const sessionIdSchema = z.object({
  sessionId: z.string().min(1),
});

const fetchUrlSchema = z.object({
  sessionId: z.string().min(1),
  url: z.string().url(),
});

const chatSchema = z.object({
  sessionId: z.string().min(1),
  message: z.string().min(1),
  mode: z.enum(["learner", "explainer"]).optional(),
});

const explainSchema = z.object({
  sessionId: z.string().min(1),
  message: z.string().min(1),
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
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

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  app.post("/api/sessions/init", async (req: Request, res: Response) => {
    try {
      const parsed = sessionInitSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ 
          error: "Invalid request", 
          details: parsed.error.errors 
        });
      }
      
      const { sessionId, productType, primaryMode } = parsed.data;
      const pkb = initializePKB(sessionId, productType, primaryMode);
      
      const tips = generateOnboardingTips(productType);

      res.json({ 
        success: true, 
        sessionId,
        productType,
        primaryMode,
        tips,
      });
    } catch (error) {
      console.error("Session init error:", error);
      res.status(500).json({ error: "Failed to initialize session" });
    }
  });

  app.get("/api/sessions/:sessionId", async (req: Request, res: Response) => {
    try {
      const { sessionId } = req.params;
      const pkb = loadPKB(sessionId);
      
      if (!pkb) {
        return res.status(404).json({ error: "Session not found" });
      }

      res.json({ pkb });
    } catch (error) {
      console.error("Session get error:", error);
      res.status(500).json({ error: "Failed to get session" });
    }
  });

  app.delete("/api/sessions/:sessionId", async (req: Request, res: Response) => {
    try {
      const { sessionId } = req.params;
      deletePKB(sessionId);
      res.json({ success: true });
    } catch (error) {
      console.error("Session delete error:", error);
      res.status(500).json({ error: "Failed to delete session" });
    }
  });

  app.post("/api/sessions/upload", upload.single("file"), async (req: Request, res: Response) => {
    try {
      const { sessionId } = req.body;
      const file = req.file;

      if (!sessionId || !file) {
        return res.status(400).json({ error: "sessionId and file are required" });
      }

      const { text, filename } = await processUploadedFile(sessionId, file);
      
      addDocumentInput(sessionId, filename, file.mimetype, file.size);

      res.json({
        success: true,
        filename,
        extracted_text_length: text.length,
        message: `Successfully uploaded ${filename}`,
      });
    } catch (error) {
      console.error("Upload error:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to upload file" 
      });
    }
  });

  app.post("/api/sessions/fetch-url", async (req: Request, res: Response) => {
    try {
      const parsed = fetchUrlSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ 
          error: "Invalid request", 
          details: parsed.error.errors 
        });
      }

      const { sessionId, url } = parsed.data;
      const { text, title } = await fetchUrlContent(url);
      
      addUrlInput(sessionId, url, title);

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
        error: error instanceof Error ? error.message : "Failed to fetch URL" 
      });
    }
  });

  app.post("/api/sessions/process", async (req: Request, res: Response) => {
    try {
      const parsed = sessionIdSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ 
          error: "Invalid request", 
          details: parsed.error.errors 
        });
      }

      const { sessionId } = parsed.data;
      const pkb = loadPKB(sessionId);
      if (!pkb) {
        return res.status(404).json({ error: "Session not found" });
      }

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      const context: AgentContext = {
        sessionId,
        productType: pkb.meta.product_type as ProductType,
        primaryMode: pkb.meta.primary_mode as PrimaryMode | undefined,
      };

      res.write(`data: ${JSON.stringify({ type: "status", data: "Extracting information from documents..." })}\n\n`);

      const allTexts: { text: string; source: string; type: "doc" | "url" }[] = [];

      if (pkb.meta.inputs?.documents) {
        for (const doc of pkb.meta.inputs.documents) {
          try {
            const fs = await import("fs");
            const path = await import("path");
            const filePath = path.join(process.cwd(), "uploads", sessionId, doc.filename);
            if (fs.existsSync(filePath)) {
              const { extractTextFromFile } = await import("./services/ingestion-service");
              const text = await extractTextFromFile(filePath);
              allTexts.push({ text: cleanText(text), source: doc.filename, type: "doc" });
            }
          } catch (e) {
            console.error(`Failed to read ${doc.filename}:`, e);
          }
        }
      }

      if (pkb.meta.inputs?.urls) {
        for (const urlInfo of pkb.meta.inputs.urls) {
          try {
            const { text } = await fetchUrlContent(urlInfo.url);
            allTexts.push({ text: cleanText(text), source: urlInfo.url, type: "url" });
          } catch (e) {
            console.error(`Failed to fetch ${urlInfo.url}:`, e);
          }
        }
      }

      for (const { text, source, type } of allTexts) {
        const chunks = chunkText(text);
        const updates = await extractFromMultipleChunks(context, chunks, source, type);
        
        for (const update of updates) {
          const result = applyProposedUpdate(sessionId, update);
          if (!result.accepted) {
            console.log(`Update rejected for ${update.field_path}: ${result.reason}`);
          }
        }
      }

      res.write(`data: ${JSON.stringify({ type: "status", data: "Synthesizing product knowledge..." })}\n\n`);

      const { insights, updates: synthesisUpdates } = await synthesizeProductKnowledge(context);
      batchApplyUpdates(sessionId, synthesisUpdates);

      if (insights.confidence) {
        res.write(`data: ${JSON.stringify({ 
          type: "confidence", 
          level: insights.confidence.level,
          score: insights.confidence.score 
        })}\n\n`);
      }

      const updatedPkb = loadPKB(sessionId);
      if (updatedPkb?.facts?.product_identity?.name?.value) {
        res.write(`data: ${JSON.stringify({ 
          type: "product_name", 
          name: updatedPkb.facts.product_identity.name.value 
        })}\n\n`);
      }

      res.write(`data: ${JSON.stringify({ type: "status", data: "Identifying knowledge gaps..." })}\n\n`);

      const { gaps, updates: gapUpdates } = await identifyGaps(context);
      batchApplyUpdates(sessionId, gapUpdates);

      const synthesisMessage = formatSynthesisForChat(insights);
      res.write(`data: ${JSON.stringify({ type: "content", data: synthesisMessage })}\n\n`);

      if (gaps.length > 0) {
        const gapsMessage = "\n\n---\n\n" + formatGapsForChat(gaps);
        res.write(`data: ${JSON.stringify({ type: "content", data: gapsMessage })}\n\n`);
      }

      if (insights.confidence?.level === "high" && insights.product_brief) {
        res.write(`data: ${JSON.stringify({ 
          type: "summary", 
          data: insights.product_brief 
        })}\n\n`);
      }

      res.write(`data: ${JSON.stringify({ 
        type: "done", 
        has_gaps: gaps.length > 0,
        confidence: insights.confidence?.level || "low"
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

  app.post("/api/sessions/chat", async (req: Request, res: Response) => {
    try {
      const parsed = chatSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ 
          error: "Invalid request", 
          details: parsed.error.errors 
        });
      }

      const { sessionId, message, mode } = parsed.data;
      const pkb = loadPKB(sessionId);
      if (!pkb) {
        return res.status(404).json({ error: "Session not found" });
      }

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      const context: AgentContext = {
        sessionId,
        productType: pkb.meta.product_type as ProductType,
        primaryMode: pkb.meta.primary_mode as PrimaryMode | undefined,
      };

      const currentGaps = pkb.gaps?.current || [];

      const { response, updates } = await processFounderResponse(context, message, currentGaps);
      
      for (const update of updates) {
        applyProposedUpdate(sessionId, update);
      }

      const words = response.split(" ");
      for (const word of words) {
        res.write(`data: ${JSON.stringify({ type: "content", data: word + " " })}\n\n`);
        await new Promise(resolve => setTimeout(resolve, 15));
      }

      res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
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
  });

  app.post("/api/sessions/explain", async (req: Request, res: Response) => {
    try {
      const parsed = explainSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ 
          error: "Invalid request", 
          details: parsed.error.errors 
        });
      }

      const { sessionId, message } = parsed.data;
      const pkb = loadPKB(sessionId);
      if (!pkb) {
        return res.status(404).json({ error: "Session not found" });
      }

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      const context: AgentContext = {
        sessionId,
        productType: pkb.meta.product_type as ProductType,
        primaryMode: pkb.meta.primary_mode as PrimaryMode | undefined,
      };

      for await (const chunk of streamExplainProduct(context, message)) {
        res.write(`data: ${JSON.stringify({ type: "content", data: chunk })}\n\n`);
      }

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
  });

  app.post("/api/sessions/recheck-gaps", async (req: Request, res: Response) => {
    try {
      const parsed = sessionIdSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ 
          error: "Invalid request", 
          details: parsed.error.errors 
        });
      }

      const { sessionId } = parsed.data;
      const pkb = loadPKB(sessionId);
      if (!pkb) {
        return res.status(404).json({ error: "Session not found" });
      }

      const context: AgentContext = {
        sessionId,
        productType: pkb.meta.product_type as ProductType,
        primaryMode: pkb.meta.primary_mode as PrimaryMode | undefined,
      };

      const { insights } = await synthesizeProductKnowledge(context);
      const { gaps } = await identifyGaps(context);

      res.json({
        gaps,
        confidence: insights.confidence,
        message: formatGapsForChat(gaps),
      });
    } catch (error) {
      console.error("Recheck gaps error:", error);
      res.status(500).json({ error: "Failed to recheck gaps" });
    }
  });

  return httpServer;
}
