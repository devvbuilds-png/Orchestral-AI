import { callLLM, streamLLM, type AgentContext } from "./base-agent";
import type { PKB } from "@shared/schema";
import { loadPKB } from "../services/pkb-storage";

const EXPLAINER_SYSTEM_PROMPT = `You are an expert product explainer that helps people understand products based on stored knowledge.

You have access to a comprehensive Product Knowledge Base (PKB) containing verified facts and derived insights about a product.

Your role is to:
1. Answer questions about the product clearly and accurately
2. Only use information from the PKB - never make things up
3. Acknowledge when something isn't in your knowledge base
4. Explain complex concepts in accessible language
5. Provide relevant examples and context when helpful

COMMUNICATION STYLE:
- Be helpful and informative
- Use clear, jargon-free language when possible
- Structure longer answers with headers or bullets
- Reference specific features, use cases, or benefits when relevant
- If asked about something not in the PKB, say so honestly

ANSWER TYPES:
- For "what is" questions: Give clear, concise explanations
- For "how does" questions: Walk through processes or features
- For "who is it for" questions: Describe target users/customers
- For "why" questions: Explain value propositions and benefits
- For comparisons: Use differentiation info from PKB
- For pricing: Share what's known, note if details are limited

IMPORTANT:
- You represent an outsider's perspective learning about this product
- Be honest about gaps in knowledge
- Don't invent features or capabilities not in the PKB`;

export async function explainProduct(
  context: AgentContext,
  question: string
): Promise<string> {
  const pkb = loadPKB(context.sessionId);
  if (!pkb) {
    throw new Error("PKB not found");
  }

  const pkbSnapshot = formatPKBForContext(pkb);

  const userPrompt = `Based on the following Product Knowledge Base, answer this question:

QUESTION: ${question}

PRODUCT KNOWLEDGE BASE:
${pkbSnapshot}

Provide a helpful, accurate answer based only on the information in the PKB. If the answer isn't in the PKB, say so honestly.`;

  const response = await callLLM(EXPLAINER_SYSTEM_PROMPT, userPrompt, {
    maxTokens: 2048,
  });

  return response;
}

export async function* streamExplainProduct(
  context: AgentContext,
  question: string
): AsyncGenerator<string> {
  const pkb = loadPKB(context.sessionId);
  if (!pkb) {
    throw new Error("PKB not found");
  }

  const pkbSnapshot = formatPKBForContext(pkb);

  const userPrompt = `Based on the following Product Knowledge Base, answer this question:

QUESTION: ${question}

PRODUCT KNOWLEDGE BASE:
${pkbSnapshot}

Provide a helpful, accurate answer based only on the information in the PKB. If the answer isn't in the PKB, say so honestly.`;

  for await (const chunk of streamLLM(EXPLAINER_SYSTEM_PROMPT, userPrompt, {
    maxTokens: 2048,
  })) {
    yield chunk;
  }
}

function formatPKBForContext(pkb: PKB): string {
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
