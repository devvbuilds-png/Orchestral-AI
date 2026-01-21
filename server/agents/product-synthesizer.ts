import { callLLM, parseJSONResponse, type AgentContext } from "./base-agent";
import type { PKB, ProposedUpdate, DerivedInsights } from "@shared/schema";
import { loadPKB } from "../services/pkb-storage";

const SYNTHESIS_SYSTEM_PROMPT = `You are an expert product strategist that synthesizes product knowledge into clear, compelling insights.

Your job is to analyze the facts stored in a Product Knowledge Base (PKB) and generate derived insights that help understand the product holistically.

IMPORTANT RULES:
1. Base your synthesis ONLY on the facts provided - never make up information
2. Be honest about confidence levels - don't overstate certainty
3. If facts are incomplete, acknowledge gaps in your synthesis
4. Focus on creating actionable, clear insights
5. Write in a professional but accessible tone

OUTPUT FORMAT:
Return a JSON object with the following structure:
{
  "product_brief": {
    "simple_summary": "2-3 sentence description of what the product is",
    "who_its_for": "Clear description of target users/customers",
    "why_it_wins": "Key differentiators and competitive advantages",
    "key_message_pillars": ["pillar1", "pillar2", "pillar3"],
    "sample_pitch": "A 2-3 sentence elevator pitch"
  },
  "confidence": {
    "level": "low|medium|high",
    "score": 0-100,
    "reasons": ["reason1", "reason2"]
  },
  "icp_hypothesis": {
    "b2b_icp_hypothesis": "Ideal Customer Profile for B2B (if applicable)",
    "b2c_segment_hypothesis": "Primary user segment hypothesis for B2C (if applicable)"
  },
  "storytelling_summary": "A detailed, narrative summary of the product that tells its story"
}

CONFIDENCE SCORING GUIDELINES:
- HIGH (75-100): Core identity, value prop, target users, pricing, and differentiation are well-defined
- MEDIUM (40-74): Basic understanding exists but important gaps remain (features, use cases, proof)
- LOW (0-39): Many critical fields are missing or unclear`;

interface SynthesisResult {
  product_brief: {
    simple_summary?: string;
    who_its_for?: string;
    why_it_wins?: string;
    key_message_pillars?: string[];
    sample_pitch?: string;
  };
  confidence: {
    level: "low" | "medium" | "high";
    score: number;
    reasons: string[];
  };
  icp_hypothesis?: {
    b2b_icp_hypothesis?: string;
    b2c_segment_hypothesis?: string;
  };
  storytelling_summary?: string;
}

export async function synthesizeProductKnowledge(
  context: AgentContext
): Promise<{ insights: DerivedInsights; updates: ProposedUpdate[] }> {
  const pkb = loadPKB(context.sessionId);
  if (!pkb) {
    throw new Error("PKB not found");
  }

  const factsSnapshot = JSON.stringify({
    facts: pkb.facts,
    extensions: pkb.extensions,
  }, null, 2);

  const productTypeContext = context.productType === "hybrid"
    ? `This is a hybrid product (both B2B and B2C) with ${context.primaryMode?.toUpperCase() || "B2B"} as the primary focus.`
    : `This is a ${context.productType.toUpperCase()} product.`;

  const userPrompt = `${productTypeContext}

Analyze the following Product Knowledge Base facts and generate derived insights:

${factsSnapshot}

Generate a comprehensive synthesis including:
1. A product brief with summary, target users, competitive advantages
2. Confidence assessment based on completeness of the knowledge
3. ICP/segment hypotheses (based on product type)
4. A detailed storytelling summary (only if confidence is medium or high)

Return as JSON.`;

  const response = await callLLM(SYNTHESIS_SYSTEM_PROMPT, userPrompt, {
    responseFormat: "json",
    maxTokens: 4096,
  });

  const result = parseJSONResponse<SynthesisResult>(response);
  if (!result) {
    throw new Error("Failed to parse synthesis result");
  }

  const now = new Date().toISOString();
  
  const insights: DerivedInsights = {
    product_brief: result.product_brief,
    confidence: result.confidence,
    icp_hypothesis: result.icp_hypothesis,
    storytelling_summary: result.storytelling_summary,
  };

  const updates: ProposedUpdate[] = [
    {
      target_section: "derived_insights",
      field_path: "derived_insights.product_brief",
      value: result.product_brief,
      metadata: {
        proposed_by: "synthesizer",
        timestamp: now,
        session_id: context.sessionId,
      },
    },
    {
      target_section: "derived_insights",
      field_path: "derived_insights.confidence",
      value: result.confidence,
      metadata: {
        proposed_by: "synthesizer",
        timestamp: now,
        session_id: context.sessionId,
      },
    },
  ];

  if (result.icp_hypothesis) {
    updates.push({
      target_section: "derived_insights",
      field_path: "derived_insights.icp_hypothesis",
      value: result.icp_hypothesis,
      metadata: {
        proposed_by: "synthesizer",
        timestamp: now,
        session_id: context.sessionId,
      },
    });
  }

  if (result.storytelling_summary && result.confidence.level !== "low") {
    updates.push({
      target_section: "derived_insights",
      field_path: "derived_insights.storytelling_summary",
      value: result.storytelling_summary,
      metadata: {
        proposed_by: "synthesizer",
        timestamp: now,
        session_id: context.sessionId,
      },
    });
  }

  return { insights, updates };
}

export function formatSynthesisForChat(insights: DerivedInsights): string {
  const parts: string[] = [];

  if (insights.product_brief?.simple_summary) {
    parts.push(`**What is this product?**\n${insights.product_brief.simple_summary}`);
  }

  if (insights.product_brief?.who_its_for) {
    parts.push(`**Who is it for?**\n${insights.product_brief.who_its_for}`);
  }

  if (insights.product_brief?.why_it_wins) {
    parts.push(`**Why it wins:**\n${insights.product_brief.why_it_wins}`);
  }

  if (insights.product_brief?.key_message_pillars?.length) {
    parts.push(`**Key messages:**\n${insights.product_brief.key_message_pillars.map(p => `• ${p}`).join("\n")}`);
  }

  if (insights.confidence) {
    const confidenceEmoji = {
      low: "🔴",
      medium: "🟡",
      high: "🟢",
    }[insights.confidence.level];
    
    parts.push(`**Confidence:** ${confidenceEmoji} ${insights.confidence.level.toUpperCase()} (${insights.confidence.score}%)`);
    
    if (insights.confidence.reasons?.length) {
      parts.push(`*Reasons:* ${insights.confidence.reasons.join("; ")}`);
    }
  }

  return parts.join("\n\n");
}
