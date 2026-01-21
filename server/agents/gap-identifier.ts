import { callLLM, parseJSONResponse, type AgentContext } from "./base-agent";
import type { PKB, ProposedUpdate, Gap } from "@shared/schema";
import { loadPKB } from "../services/pkb-storage";

const GAP_SYSTEM_PROMPT = `You are an expert at identifying missing information in product documentation.

Your job is to analyze a Product Knowledge Base (PKB) and identify what critical information is missing or unclear.

REQUIRED FIELDS BY PRODUCT TYPE:

ALWAYS REQUIRED (all product types):
- Product name OR one_liner
- Primary problem
- Primary users (at least 1)
- At least 2 use cases OR 5 features
- Pricing range_notes
- At least 2 differentiators OR alternatives list
- not_for (at least 1 anti-persona)

B2B ADDITIONAL REQUIREMENTS:
- Buyer personas (who makes purchase decisions)
- Company size + industries (org_fit)
- Integrations (even if "none")
- Sales cycle (rough estimate)

B2C ADDITIONAL REQUIREMENTS:
- User segments (at least 2)
- Monetization model + range_notes
- Retention triggers (at least 2)

HYBRID REQUIREMENTS:
- Both B2B and B2C requirements apply
- Primary mode requirements are CRITICAL
- Secondary mode requirements are IMPORTANT

SEVERITY LEVELS:
- critical: Absolutely essential for understanding the product
- important: Needed for a complete picture but not blocking
- nice_to_have: Would enhance understanding but can proceed without

OUTPUT FORMAT:
Return a JSON object with a "gaps" array. Each gap should have:
{
  "gap_id": "gap_unique_id",
  "field_path": "the.field.path",
  "severity": "critical|important|nice_to_have",
  "question": "A natural language question to ask the founder",
  "why_needed": "Brief explanation of why this matters"
}

IMPORTANT:
- Ask specific, actionable questions
- Prioritize by severity (critical first)
- Don't ask about things that are already filled
- Phrase questions in a friendly, conversational way
- Maximum 10 gaps at a time (focus on most important)`;

interface GapResult {
  gaps: Gap[];
}

export async function identifyGaps(context: AgentContext): Promise<{ gaps: Gap[]; updates: ProposedUpdate[] }> {
  const pkb = loadPKB(context.sessionId);
  if (!pkb) {
    throw new Error("PKB not found");
  }

  const factsSnapshot = JSON.stringify({
    meta: {
      product_type: pkb.meta.product_type,
      primary_mode: pkb.meta.primary_mode,
    },
    facts: pkb.facts,
    extensions: pkb.extensions,
  }, null, 2);

  const productTypeContext = context.productType === "hybrid"
    ? `This is a HYBRID product with ${context.primaryMode?.toUpperCase() || "B2B"} as the PRIMARY focus.
       For the primary side, requirements are CRITICAL.
       For the secondary side, downgrade severity by one level (critical → important, important → nice_to_have).`
    : `This is a ${context.productType.toUpperCase()} product.`;

  const userPrompt = `${productTypeContext}

Analyze the following PKB and identify missing or incomplete information:

${factsSnapshot}

Identify gaps following the required fields rules. Return as JSON with a "gaps" array.`;

  const response = await callLLM(GAP_SYSTEM_PROMPT, userPrompt, {
    responseFormat: "json",
    maxTokens: 4096,
  });

  const result = parseJSONResponse<GapResult>(response);
  if (!result || !result.gaps) {
    console.error("Failed to parse gap identification result");
    return { gaps: [], updates: [] };
  }

  const gaps = result.gaps.map((gap, index) => ({
    ...gap,
    gap_id: gap.gap_id || `gap_${Date.now()}_${index}`,
  }));

  gaps.sort((a, b) => {
    const severityOrder = { critical: 0, important: 1, nice_to_have: 2 };
    return severityOrder[a.severity] - severityOrder[b.severity];
  });

  const now = new Date().toISOString();
  const updates: ProposedUpdate[] = [{
    target_section: "gaps",
    field_path: "gaps.current",
    value: gaps,
    metadata: {
      proposed_by: "gap_identifier",
      timestamp: now,
      session_id: context.sessionId,
    },
  }];

  return { gaps, updates };
}

export function formatGapsForChat(gaps: Gap[]): string {
  if (gaps.length === 0) {
    return "Great news! I have a comprehensive understanding of your product. No critical gaps remain.";
  }

  const criticalGaps = gaps.filter(g => g.severity === "critical");
  const importantGaps = gaps.filter(g => g.severity === "important");
  const niceToHaveGaps = gaps.filter(g => g.severity === "nice_to_have");

  const parts: string[] = [];
  
  parts.push("I've identified some gaps in my understanding of your product. Let me ask you a few questions:\n");

  let questionNum = 1;

  if (criticalGaps.length > 0) {
    parts.push("**Critical questions:**");
    for (const gap of criticalGaps.slice(0, 3)) {
      parts.push(`${questionNum}. ${gap.question}`);
      questionNum++;
    }
    parts.push("");
  }

  if (importantGaps.length > 0 && questionNum <= 5) {
    parts.push("**Additional questions:**");
    for (const gap of importantGaps.slice(0, 5 - questionNum + 1)) {
      parts.push(`${questionNum}. ${gap.question}`);
      questionNum++;
    }
    parts.push("");
  }

  parts.push("Feel free to answer as many as you'd like - you can respond to multiple questions in a single message.");

  return parts.join("\n");
}

export function getNextGapQuestions(gaps: Gap[], count: number = 3): Gap[] {
  const sorted = [...gaps].sort((a, b) => {
    const severityOrder = { critical: 0, important: 1, nice_to_have: 2 };
    return severityOrder[a.severity] - severityOrder[b.severity];
  });

  return sorted.slice(0, count);
}
