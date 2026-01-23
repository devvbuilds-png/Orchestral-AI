import { callLLM, parseJSONResponse, type AgentContext } from "./base-agent";
import type { PKB, ProposedUpdate, Gap } from "@shared/schema";
import { loadPKB } from "../services/pkb-storage";

const GAP_SYSTEM_PROMPT = `You are an expert at identifying missing information in product documentation.

Your job is to analyze a Product Knowledge Base (PKB) and identify what critical information is missing or unclear.

CRITICAL: You MUST ask questions appropriate to the product type. Do NOT ask B2B questions for B2C products!

=== B2C PRODUCTS (Consumer-focused) ===
Ask about CONSUMER topics:
- Who are the individual USERS/CONSUMERS (age groups, interests, lifestyles)?
- What consumer problem does it solve (entertainment, convenience, savings, health)?
- How do INDIVIDUAL USERS discover and use the product?
- What keeps users coming back (engagement loops, rewards, social features)?
- How is it monetized (free, freemium, subscription, in-app purchases)?
- What makes it stand out from consumer alternatives?
- User acquisition channels (app stores, social media, word of mouth)?

DO NOT ask B2C products about: company sizes, industries, sales cycles, buyer personas, enterprise integrations, B2B deals, organizations, or workflows.

=== B2B PRODUCTS (Business-focused) ===
Ask about BUSINESS topics:
- What types of COMPANIES/ORGANIZATIONS use it (size, industry)?
- Who are the BUYERS vs END USERS within organizations?
- What business problem does it solve (efficiency, revenue, compliance)?
- What's the typical sales cycle and deal process?
- What integrations with business tools are available?
- What's the pricing model for businesses (per seat, enterprise tiers)?
- ROI and business outcomes?

=== HYBRID PRODUCTS ===
Ask questions relevant to the PRIMARY mode first, then secondary mode.

REQUIRED FIELDS:

ALL PRODUCTS NEED:
- Product name OR one_liner
- Primary problem it solves
- Who uses it (primary users)
- Key use cases or features
- Basic pricing/monetization info
- What makes it different from alternatives

B2C-SPECIFIC (extensions.b2c):
- user_segments: Different types of individual consumers
- acquisition_channels: How users discover the product
- engagement_hooks: What keeps users coming back
- monetization_model: How consumers pay (or don't pay)

B2B-SPECIFIC (extensions.b2b):
- buyer_personas: Decision makers in organizations
- org_fit: Company sizes and industries
- integrations: Business tool connections
- sales_cycle: Typical deal timeline

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
- STRICTLY follow product type rules - never ask B2B questions for B2C products!
- Ask specific, actionable questions relevant to the product type
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

  const declinedFields: string[] = (pkb.meta?.inputs as any)?.declined_fields || [];

  const factsSnapshot = JSON.stringify({
    meta: {
      product_type: pkb.meta.product_type,
      primary_mode: pkb.meta.primary_mode,
    },
    facts: pkb.facts,
    extensions: pkb.extensions,
    declined_fields: declinedFields,
  }, null, 2);

  let productTypeContext: string;
  if (context.productType === "hybrid") {
    productTypeContext = `This is a HYBRID product with ${context.primaryMode?.toUpperCase() || "B2B"} as the PRIMARY focus.
For the primary side (${context.primaryMode?.toUpperCase() || "B2B"}), requirements are CRITICAL.
For the secondary side, downgrade severity by one level.`;
  } else if (context.productType === "b2c") {
    productTypeContext = `IMPORTANT: This is a B2C (Business-to-Consumer) product that sells to INDIVIDUAL CONSUMERS, not businesses.

DO NOT ask about:
- Company sizes or industries
- Sales cycles or B2B deals
- Buyer personas or enterprise procurement
- Organizational workflows or integrations

Instead, ask about:
- Individual consumer segments (who uses it personally)
- Consumer acquisition (how users find and download/signup)
- Engagement and retention (what brings users back)
- Consumer monetization (subscriptions, freemium, in-app purchases)`;
  } else {
    productTypeContext = `This is a B2B (Business-to-Business) product that sells to COMPANIES and ORGANIZATIONS.

Ask about:
- Target company sizes and industries
- Decision makers and end users in organizations
- Sales cycles and enterprise deals
- Business integrations and workflows`;
  }

  const declinedContext = declinedFields.length > 0
    ? `\n\nDECLINED FIELDS (DO NOT ask about these - the user has chosen not to provide this information):\n${declinedFields.join("\n")}\n`
    : "";

  const userPrompt = `${productTypeContext}

Analyze the following PKB and identify missing or incomplete information.
Remember: Only ask questions appropriate for a ${context.productType.toUpperCase()} product!
${declinedContext}
PKB STATE:
${factsSnapshot}

Identify gaps following the required fields rules for ${context.productType.toUpperCase()} products. DO NOT ask about any declined fields. Return as JSON with a "gaps" array.`;

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

export function formatGapsForChat(gaps: Gap[], includeContext: boolean = true): string {
  if (gaps.length === 0) {
    return "Great news! I have a comprehensive understanding of your product. No critical gaps remain.";
  }

  const criticalGaps = gaps.filter(g => g.severity === "critical");
  const importantGaps = gaps.filter(g => g.severity === "important");

  const parts: string[] = [];
  
  if (includeContext) {
    parts.push("To complete my understanding, I have a few questions for you:\n");
  }

  let questionNum = 1;

  if (criticalGaps.length > 0) {
    parts.push("### Key Questions\n");
    for (const gap of criticalGaps.slice(0, 3)) {
      parts.push(`**${questionNum}. ${gap.question}**`);
      parts.push(`   _${gap.why_needed}_\n`);
      questionNum++;
    }
  }

  if (importantGaps.length > 0 && questionNum <= 5) {
    if (criticalGaps.length > 0) {
      parts.push("### Additional Questions\n");
    }
    for (const gap of importantGaps.slice(0, 5 - questionNum + 1)) {
      parts.push(`**${questionNum}. ${gap.question}**`);
      parts.push(`   _${gap.why_needed}_\n`);
      questionNum++;
    }
  }

  parts.push("---\n");
  parts.push("Feel free to answer as many as you'd like. You can respond to multiple questions in a single message, or let me know if any questions don't apply to your product.");

  return parts.join("\n");
}

export function getNextGapQuestions(gaps: Gap[], count: number = 3): Gap[] {
  const sorted = [...gaps].sort((a, b) => {
    const severityOrder = { critical: 0, important: 1, nice_to_have: 2 };
    return severityOrder[a.severity] - severityOrder[b.severity];
  });

  return sorted.slice(0, count);
}
