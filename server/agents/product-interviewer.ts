import { callLLM, streamLLM, parseJSONResponse, type AgentContext } from "./base-agent";
import type { ProposedUpdate, Source, Gap } from "@shared/schema";
import { loadPKB } from "../services/pkb-storage";

const INTERVIEWER_SYSTEM_PROMPT = `You are a friendly, expert product interviewer helping founders articulate their product knowledge.

Your role is to:
1. Engage naturally in conversation
2. Extract structured facts from founder responses
3. Ask clarifying follow-up questions when needed
4. Guide the founder to provide complete information

CONVERSATION STYLE:
- Be warm and encouraging
- Acknowledge their answers before asking more
- Use their language and terminology
- Keep questions focused and specific
- Don't overwhelm with too many questions at once

EXTRACTION RULES:
When the founder provides information, extract facts for these PKB paths:
- facts.product_identity.* (name, one_liner, category, website)
- facts.value_proposition.* (primary_problem, top_benefits, why_now)
- facts.target_users.* (primary_users, secondary_users, not_for)
- facts.use_cases (array)
- facts.features (array)
- facts.pricing.* (model, range_notes, currency, tiers)
- facts.differentiation.* (alternatives, why_we_win, where_we_lose)
- facts.proof_assets.* (case_studies, testimonials, metrics)
- extensions.b2b.* (for B2B/hybrid products)
- extensions.b2c.* (for B2C/hybrid products)

OUTPUT FORMAT:
Return a JSON object with:
{
  "extracted_facts": [
    {
      "field_path": "the.field.path",
      "value": "extracted value",
      "evidence": "the relevant part of the founder's response"
    }
  ],
  "response": "Your conversational response to the founder",
  "follow_up_needed": true/false,
  "follow_up_question": "Optional follow-up question if needed"
}`;

interface InterviewerResult {
  extracted_facts: Array<{
    field_path: string;
    value: any;
    evidence: string;
  }>;
  response: string;
  follow_up_needed: boolean;
  follow_up_question?: string;
}

export async function processFounderResponse(
  context: AgentContext,
  founderMessage: string,
  currentGaps: Gap[]
): Promise<{ response: string; updates: ProposedUpdate[] }> {
  const pkb = loadPKB(context.sessionId);
  
  const gapContext = currentGaps.length > 0
    ? `Current knowledge gaps:\n${currentGaps.map(g => `- ${g.field_path}: ${g.question}`).join("\n")}`
    : "No specific gaps identified yet.";

  const productTypeContext = context.productType === "hybrid"
    ? `This is a hybrid product (B2B and B2C) with ${context.primaryMode?.toUpperCase() || "B2B"} as primary.`
    : `This is a ${context.productType.toUpperCase()} product.`;

  const userPrompt = `${productTypeContext}

CURRENT KNOWLEDGE GAPS:
${gapContext}

FOUNDER'S MESSAGE:
${founderMessage}

Extract any facts from this response and provide a conversational reply. If the response answers some gaps, extract those facts. If clarification is needed, ask a follow-up question.

Return as JSON.`;

  const response = await callLLM(INTERVIEWER_SYSTEM_PROMPT, userPrompt, {
    responseFormat: "json",
    maxTokens: 2048,
  });

  const result = parseJSONResponse<InterviewerResult>(response);
  if (!result) {
    return {
      response: "I appreciate your input! Could you tell me a bit more about that?",
      updates: [],
    };
  }

  const now = new Date().toISOString();
  const source: Source = {
    source_type: "founder",
    source_ref: `founder_session_${context.sessionId}`,
    captured_at: now,
  };

  const updates: ProposedUpdate[] = result.extracted_facts.map((fact) => {
    const targetSection = getTargetSection(fact.field_path);
    
    return {
      target_section: targetSection,
      field_path: fact.field_path,
      value: fact.value,
      sources: [{
        ...source,
        evidence: fact.evidence,
      }],
      metadata: {
        proposed_by: "interviewer" as const,
        timestamp: now,
        session_id: context.sessionId,
      },
    };
  });

  let finalResponse = result.response;
  if (result.follow_up_needed && result.follow_up_question) {
    finalResponse += `\n\n${result.follow_up_question}`;
  }

  return { response: finalResponse, updates };
}

function getTargetSection(fieldPath: string): "facts" | "extensions.b2b" | "extensions.b2c" | "derived_insights" | "gaps" {
  if (fieldPath.startsWith("facts.")) return "facts";
  if (fieldPath.startsWith("extensions.b2b.")) return "extensions.b2b";
  if (fieldPath.startsWith("extensions.b2c.")) return "extensions.b2c";
  if (fieldPath.startsWith("derived_insights.")) return "derived_insights";
  if (fieldPath.startsWith("gaps.")) return "gaps";
  return "facts";
}

export async function* streamInterviewerResponse(
  context: AgentContext,
  founderMessage: string,
  currentGaps: Gap[]
): AsyncGenerator<{ type: "content" | "done"; data?: string; updates?: ProposedUpdate[] }> {
  const result = await processFounderResponse(context, founderMessage, currentGaps);
  
  const words = result.response.split(" ");
  for (const word of words) {
    yield { type: "content", data: word + " " };
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  
  yield { type: "done", updates: result.updates };
}

export function generateOnboardingTips(productType: "b2b" | "b2c" | "hybrid"): string {
  const baseTips = `Here are some tips for providing the best information:

📄 **Documents that work great:**
• Product documentation or specs
• Pitch decks or presentations  
• Marketing materials or landing pages
• Customer case studies
• Pricing pages or proposals

🔗 **URLs to share:**
• Your product website
• Documentation sites
• Blog posts about your product

💡 **When answering questions:**
• Be specific with examples
• Include numbers when possible (pricing, metrics, timelines)
• Mention real customer stories if you have them`;

  const b2bTips = `

**For B2B products specifically:**
• Include information about your buyers vs end users
• Share sales cycle details and pricing tiers
• Mention integrations and compliance certifications`;

  const b2cTips = `

**For B2C products specifically:**
• Describe your user segments clearly
• Share retention strategies and engagement loops
• Include app store links or user reviews`;

  let tips = baseTips;
  if (productType === "b2b" || productType === "hybrid") {
    tips += b2bTips;
  }
  if (productType === "b2c" || productType === "hybrid") {
    tips += b2cTips;
  }

  return tips;
}
