import { callLLM, streamLLM, loadCombinedContext, buildOrgContext, buildAgentContext, type AgentContext } from "./base-agent";
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

const APP_GUIDE_KNOWLEDGE = `Orchestral-AI is a product knowledge platform. Here is how it works:

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
- "Guide" mode (this mode): answers questions about how to use Orchestral-AI.`;

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
    return `You are the Guide for Orchestral-AI, helping users understand how to use the platform.

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

  for await (const chunk of streamLLM(systemPrompt, question, { maxTokens: 2048 })) {
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

  return callLLM(systemPrompt, question, { maxTokens: 2048 });
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

  return callLLM(systemPrompt, message, { maxTokens: 1024 });
}

// ──────────────────────────────────────────────────────────────────────────────
// formatPKBForContext — exported for route use (dashboard product summaries)
// ──────────────────────────────────────────────────────────────────────────────

export function formatPKBForContext(pkb: PKB): string {
  const sections: string[] = [];

  if (pkb.meta) {
    sections.push(`## Product Overview
- Name: ${pkb.meta.product_name || "Unknown"}
- Type: ${pkb.meta.product_type?.toUpperCase() || "Unknown"}
${pkb.meta.primary_mode ? `- Primary Focus: ${pkb.meta.primary_mode.toUpperCase()}` : ""}`);
  }

  if (pkb.facts?.product_identity) {
    const pi = pkb.facts.product_identity;
    sections.push(`## Product Identity
- Name: ${extractValue(pi.name)}
- One-liner: ${extractValue(pi.one_liner)}
- Category: ${extractValue(pi.category)}
- Website: ${extractValue(pi.website)}`);
  }

  if (pkb.facts?.value_proposition) {
    const vp = pkb.facts.value_proposition;
    sections.push(`## Value Proposition
- Primary Problem: ${extractValue(vp.primary_problem)}
- Top Benefits: ${extractValue(vp.top_benefits)}
- Why Now: ${extractValue(vp.why_now)}`);
  }

  if (pkb.facts?.target_users) {
    const tu = pkb.facts.target_users;
    sections.push(`## Target Users
- Primary Users: ${extractValue(tu.primary_users)}
- Secondary Users: ${extractValue(tu.secondary_users)}
- Not For: ${extractValue(tu.not_for)}`);
  }

  if (pkb.facts?.use_cases && Array.isArray(pkb.facts.use_cases) && pkb.facts.use_cases.length > 0) {
    const useCases = pkb.facts.use_cases.map((uc, i) =>
      `${i + 1}. ${extractValue(uc.name)}: ${extractValue(uc.outcome)}`
    ).join("\n");
    sections.push(`## Use Cases\n${useCases}`);
  }

  if (pkb.facts?.features && Array.isArray(pkb.facts.features) && pkb.facts.features.length > 0) {
    const features = pkb.facts.features.map((f, i) =>
      `${i + 1}. ${extractValue(f.name)}: ${extractValue(f.what_it_does)}`
    ).join("\n");
    sections.push(`## Features\n${features}`);
  }

  if (pkb.facts?.pricing) {
    const p = pkb.facts.pricing;
    sections.push(`## Pricing
- Model: ${extractValue(p.model)}
- Range: ${extractValue(p.range_notes)}
- Currency: ${extractValue(p.currency)}`);
  }

  if (pkb.facts?.differentiation) {
    const d = pkb.facts.differentiation;
    sections.push(`## Differentiation
- Alternatives: ${extractValue(d.alternatives)}
- Why We Win: ${extractValue(d.why_we_win)}
- Where We Lose: ${extractValue(d.where_we_lose)}`);
  }

  if (pkb.derived_insights?.product_brief) {
    const brief = pkb.derived_insights.product_brief;
    sections.push(`## Synthesized Insights
- Summary: ${brief.simple_summary || "Not available"}
- Who It's For: ${brief.who_its_for || "Not available"}
- Why It Wins: ${brief.why_it_wins || "Not available"}
- Key Messages: ${brief.key_message_pillars?.join(", ") || "Not available"}`);
  }

  if (pkb.extensions?.b2b && Object.keys(pkb.extensions.b2b).length > 0) {
    const b2b = pkb.extensions.b2b;
    sections.push(`## B2B Details
- Buyers: ${extractValue(b2b.buyer_vs_user?.buyers)}
- End Users: ${extractValue(b2b.buyer_vs_user?.end_users)}
- Industries: ${extractValue(b2b.org_fit?.industries)}
- Company Size: ${extractValue(b2b.org_fit?.company_size)}
- Sales Cycle: ${extractValue(b2b.procurement?.sales_cycle)}
- Integrations: ${extractValue(b2b.implementation?.integrations)}`);
  }

  if (pkb.extensions?.b2c && Object.keys(pkb.extensions.b2c).length > 0) {
    const b2c = pkb.extensions.b2c;
    const segments = b2c.user_segments?.map(s => extractValue(s.segment_name)).join(", ");
    sections.push(`## B2C Details
- User Segments: ${segments || "Not available"}
- Monetization: ${extractValue(b2c.monetization?.model)}
- Retention Triggers: ${extractValue(b2c.retention_habits?.triggers)}`);
  }

  return sections.join("\n\n");
}

function extractValue(field: any): string {
  if (!field) return "Not available";
  if (typeof field === "string") return field;
  if (field.value !== undefined) {
    if (Array.isArray(field.value)) {
      return field.value.join(", ");
    }
    return String(field.value);
  }
  if (Array.isArray(field)) {
    return field.join(", ");
  }
  return JSON.stringify(field);
}
