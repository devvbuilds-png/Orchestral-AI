import { callLLM, parseJSONResponse, type AgentContext } from "./base-agent";
import type { ProposedUpdate, Source } from "@shared/schema";

const EXTRACTION_SYSTEM_PROMPT = `You are an expert product analyst that extracts structured facts from product documentation, websites, and other materials.

Your job is to identify and extract factual information about a product and organize it according to the PKB (Product Knowledge Base) schema.

IMPORTANT RULES:
1. Only extract facts that are EXPLICITLY stated in the text - never infer or assume
2. Each fact must have supporting evidence from the text
3. Be conservative - if something is unclear, don't extract it
4. Focus on the most important facts first
5. Maintain the exact wording when possible for accuracy

OUTPUT FORMAT:
Return a JSON object with "facts" array containing extracted facts. Each fact should have:
- field_path: The path in the PKB schema (e.g., "facts.product_identity.name")
- value: The extracted value
- evidence: The exact text snippet that supports this fact

PKB SCHEMA PATHS:
- facts.product_identity.name
- facts.product_identity.one_liner
- facts.product_identity.category
- facts.product_identity.website
- facts.value_proposition.primary_problem
- facts.value_proposition.top_benefits (array)
- facts.value_proposition.why_now
- facts.target_users.primary_users (array)
- facts.target_users.secondary_users (array)
- facts.target_users.not_for (array)
- facts.use_cases (array of {name, for_user_type, problem_story, outcome})
- facts.features (array of {name, what_it_does, why_it_matters})
- facts.pricing.model
- facts.pricing.range_notes
- facts.pricing.currency
- facts.pricing.tiers (array)
- facts.differentiation.alternatives (array)
- facts.differentiation.why_we_win (array)
- facts.differentiation.where_we_lose (array)
- facts.proof_assets.case_studies (array)
- facts.proof_assets.testimonials (array)
- facts.proof_assets.metrics (array)
- facts.constraints_assumptions.assumptions (array)
- facts.constraints_assumptions.known_unknowns (array)

For B2B products, also extract:
- extensions.b2b.buyer_vs_user.buyers (array)
- extensions.b2b.buyer_vs_user.end_users (array)
- extensions.b2b.org_fit.industries (array)
- extensions.b2b.org_fit.company_size
- extensions.b2b.org_fit.regions (array)
- extensions.b2b.procurement.sales_cycle
- extensions.b2b.procurement.security_compliance (array)
- extensions.b2b.procurement.roi_driver
- extensions.b2b.implementation.integrations (array)
- extensions.b2b.implementation.onboarding_time
- extensions.b2b.implementation.support_model

For B2C products, also extract:
- extensions.b2c.user_segments (array of {segment_name, who, why_they_care})
- extensions.b2c.monetization.model
- extensions.b2c.monetization.range_notes
- extensions.b2c.retention_habits.triggers (array)
- extensions.b2c.retention_habits.loops (array)`;

interface ExtractedFact {
  field_path: string;
  value: any;
  evidence: string;
}

interface ExtractionResult {
  facts: ExtractedFact[];
}

export async function extractInformation(
  context: AgentContext,
  text: string,
  sourceRef: string,
  sourceType: "doc" | "url" = "doc"
): Promise<ProposedUpdate[]> {
  const productTypeContext = context.productType === "hybrid"
    ? `This is a hybrid product (both B2B and B2C) with ${context.primaryMode?.toUpperCase() || "B2B"} as primary.`
    : `This is a ${context.productType.toUpperCase()} product.`;

  const userPrompt = `${productTypeContext}

Extract structured facts from the following content. Be thorough but only extract what is explicitly stated.

SOURCE: ${sourceRef}
TYPE: ${sourceType}

CONTENT:
${text}

Return a JSON object with a "facts" array containing all extracted facts.`;

  const response = await callLLM(EXTRACTION_SYSTEM_PROMPT, userPrompt, {
    responseFormat: "json",
    maxTokens: 8192,
  });

  const result = parseJSONResponse<ExtractionResult>(response);
  if (!result || !result.facts) {
    console.error("Failed to parse extraction result");
    return [];
  }

  const now = new Date().toISOString();
  const source: Source = {
    source_type: sourceType,
    source_ref: sourceRef,
    captured_at: now,
  };

  const proposedUpdates: ProposedUpdate[] = result.facts.map((fact) => {
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
        proposed_by: "extractor" as const,
        timestamp: now,
        session_id: context.sessionId,
      },
    };
  });

  return proposedUpdates;
}

function getTargetSection(fieldPath: string): "facts" | "extensions.b2b" | "extensions.b2c" | "derived_insights" | "gaps" {
  if (fieldPath.startsWith("facts.")) return "facts";
  if (fieldPath.startsWith("extensions.b2b.")) return "extensions.b2b";
  if (fieldPath.startsWith("extensions.b2c.")) return "extensions.b2c";
  if (fieldPath.startsWith("derived_insights.")) return "derived_insights";
  if (fieldPath.startsWith("gaps.")) return "gaps";
  return "facts";
}

export async function extractFromMultipleChunks(
  context: AgentContext,
  chunks: string[],
  sourceRef: string,
  sourceType: "doc" | "url" = "doc"
): Promise<ProposedUpdate[]> {
  const allUpdates: ProposedUpdate[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunkRef = chunks.length > 1 ? `${sourceRef} (part ${i + 1}/${chunks.length})` : sourceRef;
    const updates = await extractInformation(context, chunks[i], chunkRef, sourceType);
    allUpdates.push(...updates);
  }

  const deduplicatedUpdates = deduplicateUpdates(allUpdates);
  
  return deduplicatedUpdates;
}

function deduplicateUpdates(updates: ProposedUpdate[]): ProposedUpdate[] {
  const seenPaths = new Map<string, ProposedUpdate>();

  for (const update of updates) {
    const key = update.field_path;
    
    if (!seenPaths.has(key)) {
      seenPaths.set(key, update);
    } else {
      const existing = seenPaths.get(key)!;
      if (update.sources && existing.sources) {
        existing.sources.push(...update.sources);
      }
    }
  }

  return Array.from(seenPaths.values());
}
