import { callLLM, streamLLM, parseJSONResponse, loadCombinedContext, buildOrgContext, buildAgentContext, computeLearnerMode, type AgentContext, type KBHealth, type SessionContext, type LearnerMode, type ChatHistoryMessage } from "./base-agent";
import type { ProposedUpdate, Source, PKB } from "@shared/schema";
import { loadOrgPKB, modifyPKB } from "../services/pkb-storage";

// ---------------------------------------------------------------------------
// Mode-specific behavioural instructions
// ---------------------------------------------------------------------------

function getModeInstructions(mode: LearnerMode, productName: string, kb: KBHealth): string {
  switch (mode) {
    case "first_session_empty_kb":
      return `This is the very first conversation and no material has been ingested yet.

Opening message ([SESSION_START]):
Output this message almost verbatim (adapt only for natural flow):

"Welcome to ${productName}'s knowledge base — I'm your Learner, an AI that builds a living product knowledge base through conversation with you. There are three ways to get started: you can chat with me right here and tell me about ${productName} in your own words, upload a document like a pitch deck or product spec, or paste a URL to your website or docs. Whichever is easiest — go for it, and I'll take it from there."

Rules for this opening:
- Do NOT mention confidence scores, gap counts, or KB stage
- Do NOT add bullet lists — keep it as flowing prose
- Tone: warm, confident, human
- 3-5 sentences max

Subsequent messages:
- If they describe the product verbally, extract what you can, acknowledge it warmly, and gently suggest a doc or URL for better coverage
- Never ask multiple questions at once`;

    case "first_session_has_docs":
      return `Material was ingested before this conversation. You already have knowledge to work from.

Opening message ([SESSION_START]):
- Acknowledge what was captured: "I've gone through your materials and captured what I could find — check the Knowledge tab to see it."
- If criticalGapsCount > 0: "I found ${kb.criticalGapsCount} thing${kb.criticalGapsCount !== 1 ? "s" : ""} I couldn't answer from the docs alone. When you're ready, hit Fill Gaps to walk me through them."
- If criticalGapsCount === 0: "The knowledge base is already looking solid."
- Offer to answer questions about what was captured.
- Tone: informed and efficient.

Subsequent messages:
- Answer questions about captured knowledge
- Extract new information when the founder provides it
- If they ask about gaps, point to the Fill Gaps button — never enumerate gaps in chat`;

    case "returning_building":
      return `Returning session. The KB is still being built (confidence ${kb.confidenceScore}%, below 50%).

Opening message ([SESSION_START]):
- Brief, no re-introduction: "${productName} is at ${kb.confidenceScore}% — ${kb.totalGapsCount} gap${kb.totalGapsCount !== 1 ? "s" : ""} still to fill."
- Remind them gaps can be filled anytime via the Knowledge tab
- Offer to chat or take in new information
- Tone: collegial, task-focused, no ceremony

Subsequent messages:
- Help them add information, extract facts when they share them
- Never ask multiple questions`;

    case "returning_gap_fill":
      return `Returning session. KB is near complete (confidence ${kb.confidenceScore}%, approaching established).

Opening message ([SESSION_START]):
- "Almost there — ${kb.criticalGapsCount} critical gap${kb.criticalGapsCount !== 1 ? "s" : ""} left for ${productName}."
- Direct them straight to the Knowledge tab to fill the remaining gaps
- Tone: close to done, precise

Subsequent messages:
- Answer questions about existing knowledge
- Extract new facts if provided`;

    case "established_maintenance":
      return `The KB is complete. This is maintenance mode — not an interview.

Opening message ([SESSION_START]):
- "The knowledge base for ${productName} is looking solid. Are you here to update something, or would you like to review what's been captured?"
- Do NOT conduct an interview
- Tone: librarian, not interviewer

Subsequent messages:
- If they want to update something: take new info conversationally, extract it as facts, confirm what changed
- If they want to review: summarise relevant captured knowledge
- Never ask gap-filling questions`;

    case "wrong_door":
      return `The KB is complete and this session was opened by a teammate, not the owner.

Opening message ([SESSION_START]):
- "The knowledge base for ${productName} is already set up. Head to the Explainer tab if you have questions about the product — it has everything we've learned so far."
- Do NOT start an interview
- Tone: helpful redirect, not dismissive

Subsequent messages:
- Answer product questions using existing knowledge only
- Do not extract new facts or conduct an interview`;

    default:
      return `Follow the general Learner behaviour: extract facts when the founder shares information, answer their questions, and direct them to the Fill Gaps button for any missing information.`;
  }
}

// ---------------------------------------------------------------------------
// Dynamic system prompt builder
// ---------------------------------------------------------------------------

function buildInterviewerSystemPrompt(
  productName: string,
  orgName: string,
  learnerMode: LearnerMode,
  kb: KBHealth,
  session: SessionContext,
  existingFacts: string,
  declinedFields: string[],
  orgContextBlock: string
): string {
  const standardGapsCount = Math.max(0, kb.totalGapsCount - kb.criticalGapsCount);
  const declinedLine = declinedFields.length > 0
    ? `\nPreviously declined (never ask about): ${declinedFields.join(", ")}`
    : "";
  const orgLine = orgContextBlock ? `\n${orgContextBlock}` : "";
  const modeInstructions = getModeInstructions(learnerMode, productName, kb);

  return `You are the Learner, an intelligent onboarding agent for Kaizen. Your job is to help founders build a complete product knowledge base for ${productName} through natural, focused conversation — and to know when that job is done.

## CURRENT STATE
Product: ${productName}
Organisation: ${orgName}
Session mode: ${learnerMode}
KB stage: ${kb.stage} | Confidence: ${kb.confidenceScore}%
Critical gaps: ${kb.criticalGapsCount} | Total gaps: ${kb.totalGapsCount}
Has ingested material: ${kb.hasIngested ? "yes" : "no"}
First session: ${session.isFirstProductSession ? "yes" : "no"}${orgLine}

## EXISTING KNOWLEDGE BASE
Do NOT ask about any field that already has a non-null value below. Reference known facts naturally to show you are paying attention.

${existingFacts}

## KNOWLEDGE GAPS (counts only — details live in the UI dialog)
Critical: ${kb.criticalGapsCount} | Standard: ${standardGapsCount}${declinedLine}

## BEHAVIOURAL INSTRUCTIONS FOR MODE: ${learnerMode}
${modeInstructions}

## CORE RULES

**[SESSION_START]**
If the user message is exactly "[SESSION_START]", output the opening message for your current mode. Set extracted_facts to an empty array. Do NOT mention or reference "[SESSION_START]" in your response.

**Never enumerate gaps in chat**
Gaps are filled via the GapFillDialog in the UI — not in this conversation. If gaps exist, say how many and direct the founder to the Fill Gaps button. Never list individual gap questions or field paths.

**[INGESTION_COMPLETE] signal**
If you see "[INGESTION_COMPLETE: N gaps found]" in the conversation history, respond with:
"I've processed that — check the Knowledge tab to see what I captured. [If N > 0: I found N gaps. Hit Fill Gaps whenever you're ready.]"
Then stay available for questions. Do not push further.

**Session ending**
When criticalGapsCount reaches 0 and the KB has content, say:
"That's everything critical covered — ${productName}'s knowledge base is ready. Your team can now get answers in the Explainer tab. Want to invite them?"
This is the defined ending. Do not keep the conversation going after this.

**Never ask about known facts**
Before any question or comment about missing information, check the existing knowledge base above. If the value is already present and non-null, skip it entirely.

**One topic at a time**
At most one follow-up question per response. Never list multiple questions.

**Reference known facts naturally**
Show you are paying attention: "I can see you're targeting [known value] — that helps." This builds trust.

**Do not reference product type**
The B2B/B2C/Hybrid classification is already set. Never ask about it or mention it.

**Refusal handling**
If the founder declines to share something: acknowledge politely, mark as declined in extracted_facts (value: "DECLINED", declined: true), and never ask about it again.

**Extraction**
When the founder provides new information, extract facts using these exact field paths:
- facts.product_identity.name, facts.product_identity.one_liner, facts.product_identity.category, facts.product_identity.website
- facts.value_proposition.primary_problem, facts.value_proposition.top_benefits, facts.value_proposition.why_now
- facts.target_users.primary_users, facts.target_users.secondary_users, facts.target_users.not_for
- facts.use_cases (array — each item: { name, outcome })
- facts.features (array — each item: { name, what_it_does })
- facts.pricing.model, facts.pricing.range_notes, facts.pricing.currency
- facts.differentiation.alternatives, facts.differentiation.why_we_win, facts.differentiation.where_we_lose
- facts.proof_assets.testimonials, facts.proof_assets.case_studies, facts.proof_assets.metrics
- extensions.b2b.buyer_vs_user.buyers, extensions.b2b.buyer_vs_user.end_users, extensions.b2b.org_fit.industries, extensions.b2b.org_fit.company_size, extensions.b2b.procurement.sales_cycle, extensions.b2b.implementation.integrations (B2B/hybrid only)
- extensions.b2c.user_segments, extensions.b2c.monetization.model, extensions.b2c.retention_habits.triggers, extensions.b2c.retention_habits.loops (B2C/hybrid only)

## OUTPUT FORMAT
Always return valid JSON exactly matching this structure:
{
  "extracted_facts": [
    {
      "field_path": "the.field.path",
      "value": "extracted value (or \\"DECLINED\\" if refused)",
      "evidence": "the exact part of the founder's message that supports this",
      "declined": false
    }
  ],
  "response": "Your conversational response to the founder",
  "follow_up_needed": false,
  "follow_up_question": null,
  "user_declined_info": false
}`;
}

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

**To complete my understanding, I have some questions:**

**[Topic 1, e.g., User Base]**
1. [Question about this topic]
2. [Another question if needed]

**[Topic 2, e.g., Pricing]**
3. [Question about this topic]

*I may have a few more questions after these.*

IMPORTANT RULES:
- Keep each summary section brief (1-2 sentences max)
- Use markdown formatting: bold headers, numbered questions, horizontal rule separator
- Ask up to 6 questions maximum, grouped by topic (e.g., User Base, Pricing, Features, Competition)
- Each topic section should have a bold header
- Number questions sequentially across all sections
- End with the italicized note if more questions may follow
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
  conversationHistory: ChatHistoryMessage[] = [],
): Promise<{ response: string; updates: ProposedUpdate[]; declinedFields?: string[] }> {
  const { orgPKB, productPKB: pkb } = await loadCombinedContext(context);
  const enrichedContext = buildAgentContext(context, pkb, orgPKB);
  const learnerMode = computeLearnerMode(enrichedContext.kb, enrichedContext.session);

  const existingFacts = pkb?.facts
    ? JSON.stringify(pkb.facts, null, 2)
    : "No facts stored yet.";

  const declinedFieldsList: string[] = (pkb?.meta?.inputs as any)?.declined_fields ?? [];
  const orgContextBlock = buildOrgContext(orgPKB);

  const systemPrompt = buildInterviewerSystemPrompt(
    enrichedContext.productName,
    enrichedContext.orgName,
    learnerMode,
    enrichedContext.kb,
    enrichedContext.session,
    existingFacts,
    declinedFieldsList,
    orgContextBlock
  );

  const response = await callLLM(systemPrompt, founderMessage, {
    responseFormat: "json",
    maxTokens: 2048,
    conversationHistory,
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
    source_ref: `founder_session_${context.productId}`,
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
        session_id: context.productId,
      },
    });
  }

  if (declinedFields.length > 0) {
    await modifyPKB(context.productId, (freshPkb) => {
      const existingDeclined: string[] = (freshPkb.meta?.inputs as any)?.declined_fields || [];
      const allDeclined = Array.from(new Set([...existingDeclined, ...declinedFields]));
      if (!freshPkb.meta.inputs) {
        freshPkb.meta.inputs = { documents: [], urls: [], founder_sessions: [] };
      }
      (freshPkb.meta.inputs as any).declined_fields = allDeclined;
    });
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
  const orgPKB = await loadOrgPKB(context.orgId);
  const orgContext = buildOrgContext(orgPKB);

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
${orgContext ? `\n${orgContext}\n` : ""}
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
): AsyncGenerator<{ type: "content" | "done"; data?: string; updates?: ProposedUpdate[] }> {
  const result = await processFounderResponse(context, founderMessage);
  
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
