import { callLLM, streamLLM, parseJSONResponse, type AgentContext } from "./base-agent";
import type { ProposedUpdate, Source, Gap, PKB } from "@shared/schema";
import { loadPKB, savePKB } from "../services/pkb-storage";

const INTERVIEWER_SYSTEM_PROMPT = `You are a friendly, expert product interviewer helping founders articulate their product knowledge.

Your role is to:
1. Engage naturally in conversation
2. Extract structured facts from founder responses
3. Ask clarifying follow-up questions when needed
4. Guide the founder to provide complete information
5. RESPECT when users decline to provide information

CONVERSATION STYLE:
- Be warm and encouraging
- Acknowledge their answers before asking more
- Use their language and terminology
- Keep questions focused and specific
- Ask only 1-2 questions per response - NEVER more than 2
- If you have more questions to ask, tell the user something like "I have a few more questions after this" or "Once you answer these, I have a couple more topics to cover"
- If the user says they don't want to share something, RESPECT that and move on

HANDLING REFUSALS:
When a user says things like:
- "I don't want to share that"
- "That's confidential"
- "Skip this question"
- "This is all I have"
- "I can't provide that information"

You MUST:
1. Acknowledge their decision politely
2. Mark the field as "declined" in extracted_facts
3. Move on to other questions without pressuring
4. Never ask about the declined topic again

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
      "value": "extracted value OR 'DECLINED' if user refused",
      "evidence": "the relevant part of the founder's response",
      "declined": true/false
    }
  ],
  "response": "Your conversational response to the founder",
  "follow_up_needed": true/false,
  "follow_up_question": "Optional follow-up question if needed",
  "user_declined_info": true/false
}`;

const INITIAL_SUMMARY_PROMPT = `You are a friendly product knowledge assistant. Generate a clean, well-formatted summary of what you learned from the materials.

FORMAT YOUR RESPONSE EXACTLY LIKE THIS:

I've processed your materials. Here's my understanding of your product:

**What is it?**
[1-2 sentences describing the product]

**Who is it for?**
[1-2 sentences about target users]

**Key value**
[1-2 sentences about main benefits or value proposition]

---

**To fill in some gaps, I have a couple of questions:**

1. [First question]
2. [Second question - optional, only if needed]

*I have a few more questions after these.*

IMPORTANT RULES:
- Keep each section brief (1-2 sentences max)
- Use the exact markdown formatting shown above (bold headers, numbered questions, horizontal rule)
- Ask only 1-2 questions - NEVER more than 2
- Always end with the italicized note about more questions coming
- If a section has no information, write "I didn't find details about this yet" instead of guessing
- Be concise - avoid lengthy explanations`;

interface InterviewerResult {
  extracted_facts: Array<{
    field_path: string;
    value: any;
    evidence: string;
    declined?: boolean;
  }>;
  response: string;
  follow_up_needed: boolean;
  follow_up_question?: string;
  user_declined_info?: boolean;
}

export async function processFounderResponse(
  context: AgentContext,
  founderMessage: string,
  currentGaps: Gap[]
): Promise<{ response: string; updates: ProposedUpdate[]; declinedFields?: string[] }> {
  const pkb = loadPKB(context.sessionId);
  
  const gapContext = currentGaps.length > 0
    ? `Current knowledge gaps:\n${currentGaps.map(g => `- ${g.field_path}: ${g.question}`).join("\n")}`
    : "No specific gaps identified yet.";

  const productTypeContext = context.productType === "hybrid"
    ? `This is a hybrid product (B2B and B2C) with ${context.primaryMode?.toUpperCase() || "B2B"} as primary.`
    : `This is a ${context.productType.toUpperCase()} product.`;

  const declinedFieldsList = (pkb?.meta?.inputs as any)?.declined_fields || [];
  const declinedContext = declinedFieldsList.length > 0
    ? `\n\nPREVIOUSLY DECLINED FIELDS (do not ask about these):\n${declinedFieldsList.join("\n")}`
    : "";

  const userPrompt = `${productTypeContext}

CURRENT KNOWLEDGE GAPS:
${gapContext}${declinedContext}

FOUNDER'S MESSAGE:
${founderMessage}

Extract any facts from this response and provide a conversational reply. If the response answers some gaps, extract those facts. If the user declines to provide information, mark it as declined. If clarification is needed, ask a follow-up question.

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

  const updates: ProposedUpdate[] = [];
  const declinedFields: string[] = [];

  for (const fact of result.extracted_facts) {
    if (fact.declined) {
      declinedFields.push(fact.field_path);
      continue;
    }

    const targetSection = getTargetSection(fact.field_path);
    
    updates.push({
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
    });
  }

  if (declinedFields.length > 0 && pkb) {
    const existingDeclined: string[] = (pkb.meta?.inputs as any)?.declined_fields || [];
    const allDeclined = Array.from(new Set([...existingDeclined, ...declinedFields]));
    if (!pkb.meta.inputs) {
      pkb.meta.inputs = { documents: [], urls: [], founder_sessions: [] };
    }
    (pkb.meta.inputs as any).declined_fields = allDeclined;
    savePKB(context.sessionId, pkb);
  }

  let finalResponse = result.response;
  if (result.follow_up_needed && result.follow_up_question) {
    finalResponse += `\n\n${result.follow_up_question}`;
  }

  return { response: finalResponse, updates, declinedFields };
}

function getTargetSection(fieldPath: string): "facts" | "extensions.b2b" | "extensions.b2c" | "derived_insights" | "gaps" {
  if (fieldPath.startsWith("facts.")) return "facts";
  if (fieldPath.startsWith("extensions.b2b.")) return "extensions.b2b";
  if (fieldPath.startsWith("extensions.b2c.")) return "extensions.b2c";
  if (fieldPath.startsWith("derived_insights.")) return "derived_insights";
  if (fieldPath.startsWith("gaps.")) return "gaps";
  return "facts";
}

export async function generateInitialSummary(context: AgentContext, pkb: PKB): Promise<string> {
  const pkbSnapshot = JSON.stringify({
    product_name: pkb.meta?.product_name,
    product_type: pkb.meta?.product_type,
    facts: pkb.facts,
    extensions: pkb.extensions,
    derived_insights: pkb.derived_insights?.product_brief,
  }, null, 2);

  const productTypeContext = context.productType === "hybrid"
    ? `This is a hybrid product (B2B and B2C) with ${context.primaryMode?.toUpperCase() || "B2B"} as primary.`
    : `This is a ${context.productType.toUpperCase()} product.`;

  const userPrompt = `${productTypeContext}

I've just finished processing the initial documents/URLs for this product. Here's what I know:

${pkbSnapshot}

Generate a brief, friendly summary showing that I've reviewed their materials, explain what I understand about the product so far, and then naturally transition to asking follow-up questions to fill any gaps.`;

  const response = await callLLM(INITIAL_SUMMARY_PROMPT, userPrompt, {
    maxTokens: 1500,
  });

  return response;
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

**Documents that work great:**
- Product documentation or specs
- Pitch decks or presentations  
- Marketing materials or landing pages
- Customer case studies
- Pricing pages or proposals

**URLs to share:**
- Your product website
- Documentation sites
- Blog posts about your product

**When answering questions:**
- Be specific with examples
- Include numbers when possible (pricing, metrics, timelines)
- Mention real customer stories if you have them`;

  const b2bTips = `

**For B2B products specifically:**
- Include information about your buyers vs end users
- Share sales cycle details and pricing tiers
- Mention integrations and compliance certifications`;

  const b2cTips = `

**For B2C products specifically:**
- Describe your user segments clearly
- Share retention strategies and engagement loops
- Include app store links or user reviews`;

  let tips = baseTips;
  if (productType === "b2b" || productType === "hybrid") {
    tips += b2bTips;
  }
  if (productType === "b2c" || productType === "hybrid") {
    tips += b2cTips;
  }

  return tips;
}
