import OpenAI from "openai";
import { loadOrgPKB, loadPKB } from "../services/pkb-storage";
import type { OrgPKB, PKB } from "@shared/schema";

export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const DEFAULT_MODEL = "gpt-4o";

export interface AgentContext {
  orgId: number;    // V3 — organisation context
  productId: string;
  productType: "b2b" | "b2c" | "hybrid";
  primaryMode?: "b2b" | "b2c";
  // Optional: authoritative names from DB, used by buildAgentContext()
  productName?: string;
  orgName?: string;
}

export interface KBHealth {
  confidenceScore: number;
  stage: "empty" | "building" | "established";
  criticalGapsCount: number;
  totalGapsCount: number;
  hasIngested: boolean;
  factCount: number;
}

export interface SessionContext {
  isFirstProductSession: boolean;
  userRole: "owner" | "member";
  triggeredBy: "founder" | "teammate";
}

export type LearnerMode =
  | "first_session_empty_kb"
  | "first_session_has_docs"
  | "returning_building"
  | "returning_gap_fill"
  | "established_maintenance"
  | "wrong_door";

export interface EnrichedAgentContext extends AgentContext {
  productName: string;
  orgName: string;
  kb: KBHealth;
  session: SessionContext;
}

// Counts non-null FactField leaf nodes in the PKB facts object.
// A FactField is identified by having a `.value` property that is not null/undefined.
function countFactLeaves(obj: any): number {
  if (!obj || typeof obj !== "object") return 0;
  if (Array.isArray(obj)) return obj.length;
  if ("value" in obj && obj.value !== null && obj.value !== undefined) return 1;
  return Object.values(obj).reduce((sum: number, v) => sum + countFactLeaves(v), 0);
}

export function buildAgentContext(
  context: AgentContext,
  productPKB: PKB,
  orgPKB: OrgPKB
): EnrichedAgentContext {
  const confidenceScore = productPKB.meta.confidence_score ?? 0;
  const stage: KBHealth["stage"] =
    confidenceScore === 0 ? "empty" : confidenceScore >= 70 ? "established" : "building";

  const gaps: any[] = productPKB.gaps?.current ?? [];
  const criticalGapsCount = gaps.filter((g: any) => g.severity === "critical").length;

  const inputs = productPKB.meta?.inputs;
  const hasIngested =
    (inputs?.documents?.length ?? 0) > 0 || (inputs?.urls?.length ?? 0) > 0;

  const isFirstProductSession = (inputs?.founder_sessions?.length ?? 0) === 0;

  const kb: KBHealth = {
    confidenceScore,
    stage,
    criticalGapsCount,
    totalGapsCount: gaps.length,
    hasIngested,
    factCount: countFactLeaves(productPKB.facts),
  };

  const session: SessionContext = {
    isFirstProductSession,
    userRole: "owner",
    triggeredBy: "founder",
  };

  const productName =
    context.productName ||
    productPKB.meta?.product_name ||
    (productPKB as any).facts?.product_identity?.name?.value ||
    "this product";

  const orgName = context.orgName || orgPKB.name || "your organisation";

  return { ...context, productName, orgName, kb, session };
}

export function computeLearnerMode(kb: KBHealth, session: SessionContext): LearnerMode {
  if (session.isFirstProductSession && !kb.hasIngested && kb.stage === "empty")
    return "first_session_empty_kb";
  if (session.isFirstProductSession)
    return "first_session_has_docs";
  if (kb.stage === "established")
    return session.triggeredBy === "teammate" ? "wrong_door" : "established_maintenance";
  if (kb.confidenceScore >= 50)
    return "returning_gap_fill";
  return "returning_building";
}

// Loads org PKB + product PKB in parallel from Supabase Storage.
export async function loadCombinedContext(
  context: AgentContext
): Promise<{ orgPKB: OrgPKB; productPKB: PKB }> {
  const [orgPKB, productPKB] = await Promise.all([
    loadOrgPKB(context.orgId),
    loadPKB(context.productId),
  ]);
  if (!productPKB) throw new Error(`PKB not found for product ${context.productId}`);
  return { orgPKB, productPKB };
}

// Builds the standardised org context block to inject at the top of agent prompts.
// Omits any line where the value is null, empty string, or zero.
export function buildOrgContext(org: OrgPKB): string {
  const lines: string[] = [];
  if (org.name) lines.push(`Organisation: ${org.name}`);
  if (org.description) lines.push(`Description: ${org.description}`);
  if (org.industry) lines.push(`Industry: ${org.industry}`);
  if (org.founded_year) lines.push(`Founded: ${org.founded_year}`);
  if (org.business_model) lines.push(`Business Model: ${org.business_model}`);
  if (org.locations?.length) lines.push(`Markets: ${org.locations.join(", ")}`);
  if (org.num_products) lines.push(`Number of Products: ${org.num_products}`);
  if (org.competitors?.length) lines.push(`Company-wide Competitors: ${org.competitors.join(", ")}`);
  if (org.website_url) lines.push(`Website: ${org.website_url}`);
  if (lines.length === 0) return "";
  return `--- Organisation Context ---\n${lines.join("\n")}\n---`;
}

export async function callLLM(
  systemPrompt: string,
  userPrompt: string,
  options: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
    responseFormat?: "text" | "json";
  } = {}
): Promise<string> {
  const {
    model = DEFAULT_MODEL,
    maxTokens = 4096,
    responseFormat = "text",
  } = options;

  try {
    const response = await openai.chat.completions.create({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      max_completion_tokens: maxTokens,
      ...(responseFormat === "json" && { response_format: { type: "json_object" } }),
    });

    const content = response.choices[0]?.message?.content || "";
    if (!content) {
      console.warn("LLM returned empty response, finish_reason:", response.choices[0]?.finish_reason);
    }
    return content;
  } catch (error) {
    console.error("LLM call failed:", error);
    throw error;
  }
}

export async function* streamLLM(
  systemPrompt: string,
  userPrompt: string,
  options: {
    model?: string;
    maxTokens?: number;
  } = {}
): AsyncGenerator<string> {
  const { model = DEFAULT_MODEL, maxTokens = 4096 } = options;

  try {
    const stream = await openai.chat.completions.create({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      max_completion_tokens: maxTokens,
      stream: true,
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || "";
      if (content) {
        yield content;
      }
    }
  } catch (error) {
    console.error("LLM stream failed:", error);
    throw error;
  }
}

export function parseJSONResponse<T>(response: string): T | null {
  try {
    const jsonMatch = response.match(/```json\n?([\s\S]*?)\n?```/) ||
                      response.match(/\{[\s\S]*\}/);
    
    if (jsonMatch) {
      const jsonStr = jsonMatch[1] || jsonMatch[0];
      return JSON.parse(jsonStr) as T;
    }
    
    return JSON.parse(response) as T;
  } catch (error) {
    console.error("Failed to parse JSON response:", error);
    console.error("Response was:", response.substring(0, 500));
    return null;
  }
}
