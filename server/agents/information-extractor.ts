import { callLLM, parseJSONResponse, buildOrgContext, type AgentContext } from "./base-agent";
import { loadOrgPKB } from "../services/pkb-storage";
import type { ProposedUpdate, Source, OrgPKB } from "@shared/schema";

const EXTRACTION_SYSTEM_PROMPT = `You are a thorough product knowledge extractor. Your job is to capture EVERY piece of product information from the provided text. Extract comprehensively — missing information is worse than extracting too much.

RULES:
1. Extract all facts that are stated or clearly implied by the text. If the text says "We serve SMBs and enterprises", extract both as target users. If pricing tiers are described, extract all of them with full details.
2. Each fact must have supporting evidence — quote the relevant text snippet.
3. For array fields (features, use_cases, pricing tiers, target users, etc.), extract ALL items mentioned, not just the top ones.
4. For text fields, capture the full detail — don't summarize to one sentence when the source provides a paragraph.
5. Do NOT fabricate information that isn't in the text. But DO extract everything that IS there.
6. A good extraction from a typical product document should yield 15-30 facts across multiple categories. If you're extracting fewer than 10 facts, you're probably being too conservative.
7. Never return empty arrays [] or facts with empty evidence — only extract facts you can support with a text snippet.

OUTPUT FORMAT:
Return a JSON object with "facts" array. Each fact:
- field_path: The PKB schema path (e.g., "facts.product_identity.name")
- value: The extracted value (string, array, or object depending on field)
- evidence: The exact text snippet that supports this fact

EXAMPLE OUTPUT:
{
  "facts": [
    { "field_path": "facts.product_identity.name", "value": "Acme Analytics", "evidence": "Acme Analytics is a real-time business intelligence platform" },
    { "field_path": "facts.target_users.primary_users", "value": ["Data analysts", "Product managers", "C-suite executives"], "evidence": "Built for data analysts, PMs, and executives who need instant insights" },
    { "field_path": "facts.features", "value": [{"name": "Real-time dashboards", "what_it_does": "Live updating visualizations of key metrics", "why_it_matters": "Eliminates wait for batch processing"}, {"name": "Natural language queries", "what_it_does": "Ask questions in plain English", "why_it_matters": "No SQL knowledge required"}], "evidence": "Our real-time dashboards update live... Ask questions in plain English without writing SQL" },
    { "field_path": "facts.pricing.model", "value": "tiered subscription", "evidence": "Three plans: Starter ($29/mo), Pro ($99/mo), Enterprise (custom)" }
  ]
}

PKB SCHEMA PATHS — CORE FIELDS (extract these for ALL product types — B2B, B2C, and hybrid):
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
- facts.pricing.tiers (array of {name, price, features})
- facts.differentiation.alternatives (array)
- facts.differentiation.why_we_win (array)
- facts.differentiation.where_we_lose (array)
- facts.proof_assets.case_studies (array)
- facts.proof_assets.testimonials (array)
- facts.proof_assets.metrics (array)
- facts.constraints_assumptions.assumptions (array)
- facts.constraints_assumptions.known_unknowns (array)

Always extract core fields first, then extract extension fields specific to the product type. Do NOT put core information (like target users, value proposition, or pricing) into extension fields — use the core facts.* paths above. Extension fields are ONLY for information that is specifically about the B2B or B2C dimension and does not fit into any core field.

For B2B products, ALSO extract these additional extension fields:
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

For B2C products, ALSO extract these additional extension fields:
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
  sourceType: "doc" | "url" = "doc",
  orgPKB?: OrgPKB,
  previouslyExtracted?: string[]
): Promise<ProposedUpdate[]> {
  const productTypeContext = context.productType === "hybrid"
    ? `This is a hybrid product (both B2B and B2C) with ${context.primaryMode?.toUpperCase() || "B2B"} as primary.`
    : `This is a ${context.productType.toUpperCase()} product.`;

  const orgContext = orgPKB ? buildOrgContext(orgPKB) : "";

  const crossChunkNote = previouslyExtracted && previouslyExtracted.length > 0
    ? `\nPreviously extracted fields: ${previouslyExtracted.join(", ")}. Focus on NEW information not already covered, and on EXTENDING array fields with additional items.\n`
    : "";

  const userPrompt = `${productTypeContext}
${orgContext ? `\n${orgContext}\nUse the organisation context above to disambiguate ambiguous facts during extraction.\n` : ""}${crossChunkNote}
Extract ALL structured facts from the following content. Be thorough — capture every piece of product information present.

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
        session_id: context.productId,
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

// Array-type field paths — values from multiple chunks should be merged, not replaced.
const ARRAY_FIELDS = new Set([
  "facts.value_proposition.top_benefits",
  "facts.target_users.primary_users",
  "facts.target_users.secondary_users",
  "facts.target_users.not_for",
  "facts.use_cases",
  "facts.features",
  "facts.pricing.tiers",
  "facts.differentiation.alternatives",
  "facts.differentiation.why_we_win",
  "facts.differentiation.where_we_lose",
  "facts.proof_assets.case_studies",
  "facts.proof_assets.testimonials",
  "facts.proof_assets.metrics",
  "facts.constraints_assumptions.assumptions",
  "facts.constraints_assumptions.known_unknowns",
  "extensions.b2b.buyer_vs_user.buyers",
  "extensions.b2b.buyer_vs_user.end_users",
  "extensions.b2b.org_fit.industries",
  "extensions.b2b.org_fit.regions",
  "extensions.b2b.procurement.security_compliance",
  "extensions.b2b.implementation.integrations",
  "extensions.b2c.user_segments",
  "extensions.b2c.retention_habits.triggers",
  "extensions.b2c.retention_habits.loops",
]);

function isEmptyValue(value: any): boolean {
  if (value === null || value === undefined || value === "") return true;
  if (Array.isArray(value) && value.length === 0) return true;
  return false;
}

export async function extractFromMultipleChunks(
  context: AgentContext,
  chunks: string[],
  sourceRef: string,
  sourceType: "doc" | "url" = "doc"
): Promise<ProposedUpdate[]> {
  const orgPKB = await loadOrgPKB(context.orgId);
  const allUpdates: ProposedUpdate[] = [];
  const extractedPaths: string[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunkRef = chunks.length > 1 ? `${sourceRef} (part ${i + 1}/${chunks.length})` : sourceRef;
    const updates = await extractInformation(
      context, chunks[i], chunkRef, sourceType, orgPKB,
      i > 0 ? extractedPaths : undefined,
    );
    // Filter empty-array junk and empty-evidence noise
    const filtered = updates.filter(u => {
      if (isEmptyValue(u.value)) return false;
      if (u.sources?.every(s => !(s as any).evidence?.trim())) return false;
      return true;
    });
    allUpdates.push(...filtered);
    extractedPaths.push(...filtered.map(u => u.field_path));
  }

  return deduplicateUpdates(allUpdates);
}

function deduplicateUpdates(updates: ProposedUpdate[]): ProposedUpdate[] {
  const seenPaths = new Map<string, ProposedUpdate>();

  for (const update of updates) {
    const key = update.field_path;

    if (!seenPaths.has(key)) {
      seenPaths.set(key, update);
    } else {
      const existing = seenPaths.get(key)!;
      // Merge sources regardless
      if (update.sources && existing.sources) {
        existing.sources.push(...update.sources);
      }
      // For array fields: merge arrays instead of discarding later values
      if (ARRAY_FIELDS.has(key)) {
        const existingVal = Array.isArray(existing.value) ? existing.value : [existing.value];
        const newVal = Array.isArray(update.value) ? update.value : [update.value];
        // Simple dedup by JSON stringification for objects, direct comparison for primitives
        const seen = new Set(existingVal.map((v: any) => typeof v === "object" ? JSON.stringify(v) : String(v)));
        for (const item of newVal) {
          const key = typeof item === "object" ? JSON.stringify(item) : String(item);
          if (!seen.has(key)) {
            existingVal.push(item);
            seen.add(key);
          }
        }
        existing.value = existingVal;
      } else {
        // For scalar fields: keep the longer/more detailed value
        const existingStr = typeof existing.value === "string" ? existing.value : JSON.stringify(existing.value);
        const newStr = typeof update.value === "string" ? update.value : JSON.stringify(update.value);
        if (newStr.length > existingStr.length) {
          existing.value = update.value;
        }
      }
    }
  }

  return Array.from(seenPaths.values());
}
