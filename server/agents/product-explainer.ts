import { callLLM, streamLLM, loadCombinedContext, buildOrgContext, buildAgentContext, type AgentContext, type ChatHistoryMessage } from "./base-agent";
import type { PKB, OrgPKB } from "@shared/schema";

// ──────────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────────

export type ExplainerSurface = "product_chat" | "dashboard_chat" | "app_guide";
export type AnswerMode = "funnel_to_learner" | "answer_with_caveat" | "answer_clean";

export interface ProductSummary {
  productName: string;
  productBrief?: string;
  fullFacts: string;
  kb: { confidenceScore: number; stage: string };
}

export interface ExplainerContext {
  surface?: ExplainerSurface;
  isFirstExplainerUse?: boolean;
  suggestedQuestions?: string[];
  allProductSummaries?: ProductSummary[];
}

// ──────────────────────────────────────────────────────────────────────────────
// Static app guide knowledge
// ──────────────────────────────────────────────────────────────────────────────

const APP_GUIDE_KNOWLEDGE = `Kaizen is a product knowledge platform. Here is how it works:

NAVIGATION
- Dashboard: Your home base. Shows all your products and the Central Intelligence chat.
- Product Workspace: Click any product card to enter it. Has four tabs: Chat, Knowledge, Personas, Documents.

BUILDING KNOWLEDGE (Chat tab — Learner mode)
- The Chat tab is where you teach the platform about your product.
- Start by sharing a document, URL, or deck. The Learner will read it and extract what it can.
- After processing, a "Fill gaps" button will appear — click it to answer what the system couldn't find in your docs.
- The Learner will tell you when the knowledge base is ready.

QUERYING KNOWLEDGE (Chat tab — Explainer mode, or Central Intelligence)
- Once the knowledge base is built, anyone on your team can ask questions about the product.
- Use the Explainer tab inside a product workspace, or ask here in Central Intelligence.
- Central Intelligence can answer questions across all your products at once.

KNOWLEDGE TAB
- Summary: A generated brief of the product.
- Facts: All the individual facts captured about the product, with their sources.
- Gaps: Fields that have not been filled yet. Click any gap card or use "Fill gaps" to complete them.

PERSONAS TAB
- Shows buyer personas derived from the knowledge base.
- Personas are generated automatically — you confirm or dismiss them.

DOCUMENTS TAB
- All documents and URLs that have been ingested for this product.
- Add new documents here at any time — they will be processed automatically.

CONFIDENCE SCORE
- Shows how complete the knowledge base is.
- Below 40%: low — basic questions can be answered but detail is thin.
- 40–70%: building — most questions can be answered well.
- Above 70%: established — the knowledge base is solid.

CENTRAL INTELLIGENCE TOGGLE
- "Knowledge" mode: answers questions about your products using the knowledge base.
- "Guide" mode (this mode): answers questions about how to use Kaizen.`;

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

function getAnswerMode(confidenceScore: number): AnswerMode {
  if (confidenceScore >= 70) return "answer_clean";
  if (confidenceScore >= 40) return "answer_with_caveat";
  return "funnel_to_learner";
}

interface BuildPromptParams {
  surface: ExplainerSurface;
  answerMode: AnswerMode;
  productName: string;
  orgName: string;
  isFirstExplainerUse: boolean;
  suggestedQuestions: string[];
  pkbContext: string;
  orgContext: string;
  allProductSummaries?: ProductSummary[];
}

function buildExplainerSystemPrompt(p: BuildPromptParams): string {
  // ── app_guide ─────────────────────────────────────────────────────────────
  if (p.surface === "app_guide") {
    return `You are the Guide for Kaizen, helping users understand how to use the platform.

## APP KNOWLEDGE

${APP_GUIDE_KNOWLEDGE}

## RULES

- Answer only from the app knowledge above — do not reference any PKB or product content
- Be concise and direct — these are navigation and usage questions, not deep discussions
- If something is not covered above, say: "I don't have detail on that — you can check the docs or reach out to support."
- Friendly, helpful tone`;
  }

  // ── dashboard_chat ────────────────────────────────────────────────────────
  if (p.surface === "dashboard_chat") {
    const productBlocks = p.allProductSummaries && p.allProductSummaries.length > 0
      ? p.allProductSummaries.map(ps =>
          `### ${ps.productName} (confidence: ${ps.kb.confidenceScore}%)${ps.productBrief ? `\n${ps.productBrief}` : ""}\n${ps.fullFacts}`
        ).join("\n\n---\n\n")
      : "No product knowledge bases available yet.";

    return `You are the Central Intelligence for ${p.orgName} — an AI that answers questions across the entire product portfolio.

## ORGANISATION CONTEXT
${p.orgContext || "No organisation details available."}

## PRODUCT KNOWLEDGE BASES
${productBlocks}

## RULES

**Answering across products**
- Always attribute answers to the specific product they come from — lead with the product name
- If the question is clearly about one product, focus there but note if other products are relevant
- Synthesise across products when the question calls for it: "Across your products, the common thread is..."

**When a product has no data for the question**
- Do not skip it silently — state: "[Product name] — this hasn't been captured yet"
- Never guess or infer for missing products

**Scope**
- Org context takes precedence for org-level questions (company positioning, competitors, business model)
- Product PKBs take precedence for product-specific questions
- No funneling to Learner — this is a query surface only
- Conversational tone — give the executive view`;
  }

  // ── product_chat ──────────────────────────────────────────────────────────
  const answerModeBlock =
    p.answerMode === "funnel_to_learner"
      ? `**Answer mode: Partial knowledge (confidence low)**
- Answer briefly what is known
- If knowledge is thin on a specific area, acknowledge it plainly
- Add this tip exactly once per conversation (not on every message): "The more you teach the Learner about ${p.productName}, the better my answers get — head to the Chat tab to add more."
- Never refuse to answer entirely — give what is available`
      : p.answerMode === "answer_with_caveat"
      ? `**Answer mode: Building knowledge (confidence building)**
- Answer fully what is known
- If a specific area has no data: "I don't have detail on that yet — it hasn't been captured in the knowledge base."
- One caveat maximum per response — do not pepper every sentence with uncertainty
- No tip or funneling needed`
      : `**Answer mode: Established knowledge (confidence high)**
- Answer cleanly and confidently
- No hedging, no caveats, no uncertainty language
- The KB is solid — treat it as authoritative`;

  const firstUseBlock =
    p.isFirstExplainerUse && p.suggestedQuestions.length > 0
      ? `\n**First use — wow moment**
After your opening response text, output the suggested questions in this exact format — no extra text inside or after the block:
<suggested_questions>
${p.suggestedQuestions.join("\n")}
</suggested_questions>
Show this once only — isFirstExplainerUse will be false on subsequent turns.\n`
      : "";

  return `You are the Explainer for ${p.productName} — an AI that answers questions about this product from its knowledge base.

## PRODUCT KNOWLEDGE BASE
${p.pkbContext}
${p.orgContext ? `\n## ORGANISATION CONTEXT\n${p.orgContext}\n` : ""}
## BEHAVIOURAL RULES

${answerModeBlock}
${firstUseBlock}
**Core rules**
- Answer from the knowledge base above — do not invent or infer beyond what is stored
- If something is not in the KB: "I don't have that information yet"
- Never mention field paths, PKB internals, or technical KB structure
- Keep answers conversational — not bullet-heavy unless the question calls for it
- Reference personas naturally when relevant: "Your primary users tend to be..."
- One follow-up question maximum if clarification would genuinely help`;
}

// ──────────────────────────────────────────────────────────────────────────────
// product_chat: streamExplainProduct (called by /explain route)
// ──────────────────────────────────────────────────────────────────────────────

export async function* streamExplainProduct(
  context: AgentContext,
  question: string,
  explainerCtx?: ExplainerContext,
  conversationHistory: ChatHistoryMessage[] = [],
): AsyncGenerator<string> {
  const { orgPKB, productPKB: pkb } = await loadCombinedContext(context);
  const enrichedContext = buildAgentContext(context, pkb, orgPKB);
  const answerMode = getAnswerMode(enrichedContext.kb.confidenceScore);
  const pkbContext = formatPKBForContext(pkb);
  const orgContext = buildOrgContext(orgPKB);

  const systemPrompt = buildExplainerSystemPrompt({
    surface: explainerCtx?.surface ?? "product_chat",
    answerMode,
    productName: enrichedContext.productName,
    orgName: enrichedContext.orgName,
    isFirstExplainerUse: explainerCtx?.isFirstExplainerUse ?? false,
    suggestedQuestions: explainerCtx?.suggestedQuestions ?? [],
    pkbContext,
    orgContext,
  });

  for await (const chunk of streamLLM(systemPrompt, question, { maxTokens: 2048, conversationHistory })) {
    yield chunk;
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// explainProduct (non-streaming — kept for compatibility)
// ──────────────────────────────────────────────────────────────────────────────

export async function explainProduct(
  context: AgentContext,
  question: string,
  explainerCtx?: ExplainerContext,
  conversationHistory: ChatHistoryMessage[] = [],
): Promise<string> {
  const { orgPKB, productPKB: pkb } = await loadCombinedContext(context);
  const enrichedContext = buildAgentContext(context, pkb, orgPKB);
  const answerMode = getAnswerMode(enrichedContext.kb.confidenceScore);
  const pkbContext = formatPKBForContext(pkb);
  const orgContext = buildOrgContext(orgPKB);

  const systemPrompt = buildExplainerSystemPrompt({
    surface: explainerCtx?.surface ?? "product_chat",
    answerMode,
    productName: enrichedContext.productName,
    orgName: enrichedContext.orgName,
    isFirstExplainerUse: explainerCtx?.isFirstExplainerUse ?? false,
    suggestedQuestions: explainerCtx?.suggestedQuestions ?? [],
    pkbContext,
    orgContext,
  });

  return callLLM(systemPrompt, question, { maxTokens: 2048, conversationHistory });
}

// ──────────────────────────────────────────────────────────────────────────────
// explainCIChat — CI dashboard chat (dashboard_chat + app_guide surfaces)
// ──────────────────────────────────────────────────────────────────────────────

export async function explainCIChat(
  orgPKB: OrgPKB,
  orgName: string,
  message: string,
  surface: "dashboard_chat" | "app_guide",
  allProductSummaries?: ProductSummary[],
  conversationHistory: ChatHistoryMessage[] = [],
): Promise<string> {
  const orgContext = buildOrgContext(orgPKB);

  const systemPrompt = buildExplainerSystemPrompt({
    surface,
    answerMode: "answer_clean",
    productName: "",
    orgName,
    isFirstExplainerUse: false,
    suggestedQuestions: [],
    pkbContext: "",
    orgContext,
    allProductSummaries,
  });

  return callLLM(systemPrompt, message, { maxTokens: 1024, conversationHistory });
}

// ──────────────────────────────────────────────────────────────────────────────
// formatPKBForContext — exported for route use (dashboard product summaries)
// ──────────────────────────────────────────────────────────────────────────────

export function formatPKBForContext(pkb: PKB): string {
  const sections: string[] = [];

  // Product overview from meta
  if (pkb.meta) {
    sections.push(`## Product Overview
- Name: ${pkb.meta.product_name || "Unknown"}
- Type: ${pkb.meta.product_type?.toUpperCase() || "Unknown"}
${pkb.meta.primary_mode ? `- Primary Focus: ${pkb.meta.primary_mode.toUpperCase()}` : ""}`);
  }

  // Dynamically walk pkb.facts
  if (pkb.facts && typeof pkb.facts === "object") {
    const knownSections: Record<string, string> = {
      product_identity: "Product Identity",
      value_proposition: "Value Proposition",
      target_users: "Target Users",
      use_cases: "Use Cases",
      features: "Features",
      pricing: "Pricing",
      differentiation: "Differentiation",
      proof_assets: "Proof & Social Proof",
      constraints_assumptions: "Constraints & Assumptions",
    };
    const renderedKeys = new Set<string>();

    for (const [key, heading] of Object.entries(knownSections)) {
      const section = (pkb.facts as any)[key];
      if (!section) continue;
      renderedKeys.add(key);
      const rendered = renderNode(section, key);
      if (rendered) sections.push(`## ${heading}\n${rendered}`);
    }

    // Render any extra sections not in the known list
    for (const key of Object.keys(pkb.facts as any)) {
      if (renderedKeys.has(key)) continue;
      const section = (pkb.facts as any)[key];
      if (!section) continue;
      const rendered = renderNode(section, key);
      if (rendered) sections.push(`## ${formatLabel(key)}\n${rendered}`);
    }
  }

  // Dynamically walk extensions
  if (pkb.extensions?.b2b && hasContent(pkb.extensions.b2b)) {
    const rendered = renderNode(pkb.extensions.b2b, "b2b");
    if (rendered) sections.push(`## B2B Details\n${rendered}`);
  }
  if (pkb.extensions?.b2c && hasContent(pkb.extensions.b2c)) {
    const rendered = renderNode(pkb.extensions.b2c, "b2c");
    if (rendered) sections.push(`## B2C Details\n${rendered}`);
  }

  // Derived insights
  if (pkb.derived_insights?.product_brief) {
    const brief = pkb.derived_insights.product_brief;
    const lines: string[] = [];
    if (brief.simple_summary) lines.push(`- Summary: ${brief.simple_summary}`);
    if (brief.who_its_for) lines.push(`- Who It's For: ${brief.who_its_for}`);
    if (brief.why_it_wins) lines.push(`- Why It Wins: ${brief.why_it_wins}`);
    if (Array.isArray(brief.key_message_pillars) && brief.key_message_pillars.length > 0) {
      lines.push(`- Key Messages: ${brief.key_message_pillars.join(", ")}`);
    }
    if (lines.length > 0) sections.push(`## Synthesized Insights\n${lines.join("\n")}`);
  }

  return sections.join("\n\n");
}

// ── Dynamic PKB rendering helpers ──────────────────────────────────────────

/** Check if an object has any real content (not just empty sub-objects) */
function hasContent(obj: any): boolean {
  if (!obj || typeof obj !== "object") return false;
  for (const val of Object.values(obj)) {
    if (val === null || val === undefined) continue;
    if (typeof val === "string" && val.length > 0) return true;
    if (typeof val === "number" || typeof val === "boolean") return true;
    if (Array.isArray(val) && val.length > 0) return true;
    if (typeof val === "object") {
      if ("value" in val && val.value !== null && val.value !== undefined && val.value !== "") return true;
      if (hasContent(val)) return true;
    }
  }
  return false;
}

/** Convert snake_case key to a readable label */
function formatLabel(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Extract the display value from a FactField, primitive, or nested object */
function extractValue(field: any): string | null {
  if (field === null || field === undefined) return null;
  if (typeof field === "string") return field.length > 0 ? field : null;
  if (typeof field === "number" || typeof field === "boolean") return String(field);
  if (Array.isArray(field)) {
    const items = field.map((item) => extractValue(item)).filter(Boolean);
    return items.length > 0 ? items.join(", ") : null;
  }
  // FactField wrapper: { value, sources, ... }
  if ("value" in field && field.value !== undefined && field.value !== null) {
    return extractValue(field.value);
  }
  return null;
}

/**
 * Recursively render a PKB node into human-readable lines.
 * Handles: FactField wrappers, plain objects, arrays, primitives.
 */
function renderNode(node: any, _parentKey: string, depth: number = 0): string {
  if (node === null || node === undefined) return "";
  const indent = "  ".repeat(depth);

  // Primitive
  if (typeof node === "string" || typeof node === "number" || typeof node === "boolean") {
    return String(node);
  }

  // Array — render each item
  if (Array.isArray(node)) {
    const items: string[] = [];
    for (let i = 0; i < node.length; i++) {
      const item = node[i];
      const val = extractValue(item);
      if (val) {
        items.push(`${indent}${i + 1}. ${val}`);
      } else if (typeof item === "object" && item !== null) {
        // Complex array item — render its fields
        const subLines = renderObjectFields(item, depth + 1);
        if (subLines) items.push(`${indent}${i + 1}.\n${subLines}`);
      }
    }
    return items.join("\n");
  }

  // FactField wrapper — extract and return value
  if (typeof node === "object" && "value" in node && node.value !== undefined) {
    const val = extractValue(node);
    return val || "";
  }

  // Plain object — render each key
  return renderObjectFields(node, depth);
}

/** Render the fields of a plain object, skipping metadata keys */
function renderObjectFields(obj: any, depth: number): string {
  if (!obj || typeof obj !== "object") return "";
  const indent = "  ".repeat(depth);
  const lines: string[] = [];
  const skipKeys = new Set(["sources", "source_type", "source_ref", "captured_at", "evidence",
    "quality_tag", "lifecycle_status", "sensitive", "approved", "locked",
    "do_not_ask", "last_verified", "audit_trail"]);

  for (const [key, val] of Object.entries(obj)) {
    if (skipKeys.has(key)) continue;
    if (val === null || val === undefined) continue;

    // Try to extract a simple value first
    const simple = extractValue(val);
    if (simple) {
      lines.push(`${indent}- ${formatLabel(key)}: ${simple}`);
      continue;
    }

    // Nested object or array with content — recurse
    if (typeof val === "object") {
      const nested = renderNode(val, key, depth + 1);
      if (nested) {
        lines.push(`${indent}- ${formatLabel(key)}:\n${nested}`);
      }
    }
  }
  return lines.join("\n");
}
