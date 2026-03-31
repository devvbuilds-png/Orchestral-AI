import { callLLM, parseJSONResponse, buildOrgContext } from "./base-agent";
import { loadOrgPKB, loadPKB, modifyPKB } from "../services/pkb-storage";
import { formatPKBForContext } from "./product-explainer";
import { db } from "../db";
import { products } from "@shared/schema";
import { eq } from "drizzle-orm";
import type { PKB, Persona, Gap } from "@shared/schema";

// ──────────────────────────────────────────────────────────────────────────────
// Internal LLM response types
// ──────────────────────────────────────────────────────────────────────────────

interface SynthesizerPersona {
  name: string;
  type: "decision_maker" | "end_user" | "influencer" | "champion" | "blocker";
  description: string;
  goals: string[];
  pain_points: string[];
  evidence: string;
  confidence: "high" | "medium" | "low";
}

interface SynthesizerGapItem {
  field_path: string;
  q: string;
  why: string;
  severity: "critical" | "standard";
}

interface LLMSynthesizerOutput {
  productBrief: string;
  who_its_for: string | null;
  why_it_wins: string | null;
  key_message_pillars: string[];
  confidenceReasoning: string;
  personas: SynthesizerPersona[];
  suggestedQuestions: string[];
  gapAnalysis: {
    critical: SynthesizerGapItem[];
    standard: SynthesizerGapItem[];
  };
}

// Exported type — includes computed fields added by code (not LLM)
export interface SynthesizerOutput {
  productBrief: string;
  confidenceReasoning: string;
  personas: SynthesizerPersona[];
  suggestedQuestions: string[];
  gapAnalysis: {
    critical: SynthesizerGapItem[];
    standard: SynthesizerGapItem[];
  };
  confidenceScore: number;
  kbStage: "empty" | "building" | "established";
}

// ──────────────────────────────────────────────────────────────────────────────
// Field weight maps for deterministic confidence scoring
// ──────────────────────────────────────────────────────────────────────────────

type FieldDef = { weight: number; get: (pkb: PKB) => any };

// Base fields — apply to all product types
const BASE_FIELDS: FieldDef[] = [
  { weight: 8, get: p => p.facts?.product_identity?.name },
  { weight: 6, get: p => p.facts?.product_identity?.one_liner },
  { weight: 4, get: p => p.facts?.product_identity?.category },
  { weight: 8, get: p => p.facts?.value_proposition?.primary_problem },
  { weight: 6, get: p => p.facts?.value_proposition?.top_benefits },
  { weight: 8, get: p => p.facts?.target_users?.primary_users },
  { weight: 6, get: p => p.facts?.target_users?.secondary_users },
  { weight: 6, get: p => p.facts?.features },
  { weight: 5, get: p => p.facts?.use_cases },
  { weight: 7, get: p => p.facts?.pricing?.model },
  { weight: 5, get: p => p.facts?.differentiation?.alternatives },
  { weight: 4, get: p => p.facts?.differentiation?.why_we_win },
];

// B2B-only additional fields
const B2B_FIELDS: FieldDef[] = [
  { weight: 5, get: p => p.extensions?.b2b?.org_fit?.company_size },
  { weight: 4, get: p => p.extensions?.b2b?.org_fit?.industries },
  { weight: 6, get: p => p.extensions?.b2b?.buyer_vs_user?.buyers },
  { weight: 3, get: p => p.facts?.differentiation?.where_we_lose },
];

// B2C-only additional fields
const B2C_FIELDS: FieldDef[] = [
  { weight: 5, get: p => p.extensions?.b2c?.user_segments },
  { weight: 5, get: p => p.extensions?.b2c?.retention_habits?.triggers },
  { weight: 4, get: p => p.extensions?.b2c?.retention_habits?.loops },
  { weight: 4, get: p => p.extensions?.b2c?.monetization?.model },
];

// ──────────────────────────────────────────────────────────────────────────────
// Helper: check if a FactField value (or array) is populated
// ──────────────────────────────────────────────────────────────────────────────

function isPopulated(field: any): boolean {
  if (field === null || field === undefined) return false;
  if (Array.isArray(field)) return field.length > 0;
  if (typeof field === "object" && "value" in field) {
    const v = (field as any).value;
    if (v === null || v === undefined) return false;
    if (typeof v === "string") return v.trim() !== "";
    if (Array.isArray(v)) return v.length > 0;
    return true;
  }
  return false;
}

// ──────────────────────────────────────────────────────────────────────────────
// Helper: recursively collect all populated FactField objects
// ──────────────────────────────────────────────────────────────────────────────

function collectFactFields(obj: any): Array<{ lifecycle_status?: string; sources?: any[] }> {
  if (!obj || typeof obj !== "object") return [];
  if (Array.isArray(obj)) return obj.flatMap(collectFactFields);
  // FactField: has a 'value' property
  if ("value" in obj) {
    const v = (obj as any).value;
    if (v === null || v === undefined) return [];
    if (typeof v === "string" && v.trim() === "") return [];
    if (Array.isArray(v) && v.length === 0) return [];
    return [obj];
  }
  return Object.values(obj).flatMap(collectFactFields);
}

// ──────────────────────────────────────────────────────────────────────────────
// Deterministic confidence scoring — no LLM, same PKB always returns same score
// ──────────────────────────────────────────────────────────────────────────────

export function computeConfidenceScore(pkb: PKB, productType: string): number {
  // Build applicable field list based on product type
  const fields = [...BASE_FIELDS];
  if (productType === "b2b" || productType === "hybrid") fields.push(...B2B_FIELDS);
  if (productType === "b2c" || productType === "hybrid") fields.push(...B2C_FIELDS);

  // ── Field coverage (70 points max) ────────────────────────────────────────
  const totalWeight = fields.reduce((sum, f) => sum + f.weight, 0);
  const populatedWeight = fields
    .filter(f => isPopulated(f.get(pkb)))
    .reduce((sum, f) => sum + f.weight, 0);
  const fieldCoverage = totalWeight > 0 ? (populatedWeight / totalWeight) * 70 : 0;

  // ── Quality modifier (20 points max) ──────────────────────────────────────
  const allFactFields = [
    ...collectFactFields(pkb.facts ?? {}),
    ...collectFactFields(pkb.extensions ?? {}),
  ];

  const qualityMultipliers: Record<string, number> = {
    evidenced: 1.0,
    asserted: 0.8,
    inferred: 0.5,
    disputed: 0.0,
    stale: 0.0,
  };

  const qualityScores = allFactFields.map(f => {
    const status = f.lifecycle_status;
    return status ? (qualityMultipliers[status] ?? 0.6) : 0.6;
  });

  const avgQuality =
    qualityScores.length > 0
      ? qualityScores.reduce((sum, s) => sum + s, 0) / qualityScores.length
      : 0;
  const qualityModifier = avgQuality * 20;

  // ── Source diversity (10 points max) ──────────────────────────────────────
  const sourceTypes = new Set<string>();
  for (const f of allFactFields) {
    if (Array.isArray(f.sources)) {
      for (const s of f.sources) {
        if (s?.source_type) sourceTypes.add(s.source_type);
      }
    }
  }
  const sourceDiversity =
    sourceTypes.size >= 3 ? 10 : sourceTypes.size >= 2 ? 6 : sourceTypes.size >= 1 ? 3 : 0;

  return Math.min(100, Math.max(0, Math.round(fieldCoverage + qualityModifier + sourceDiversity)));
}

// ──────────────────────────────────────────────────────────────────────────────
// Persona and Gap adapters
// ──────────────────────────────────────────────────────────────────────────────

function mapToPersona(sp: SynthesizerPersona, index: number): Persona {
  const typeMap: Record<string, Persona["type"]> = {
    decision_maker: "buyer_persona",
    end_user: "user_persona",
    influencer: "influencer",
    champion: "user_persona",
    blocker: "gatekeeper",
  };
  const confidenceMap: Record<string, number> = { high: 0.8, medium: 0.5, low: 0.3 };
  const slug = sp.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);

  return {
    persona_id: `${slug}-${index}`,
    name: sp.name,
    type: typeMap[sp.type] ?? "user_persona",
    status: "candidate",
    goals: sp.goals.map(g => ({ text: g, priority: "medium" as const })),
    pains: sp.pain_points.map(p => ({ text: p, severity: "medium" as const })),
    evidence: [{ source_id: "synthesizer", quote: sp.evidence, field_ref: "facts" }],
    lifecycle_status: "inferred",
    confidence: confidenceMap[sp.confidence] ?? 0.5,
  };
}

function mapToGap(g: SynthesizerGapItem, index: number, severity: Gap["severity"]): Gap {
  return {
    gap_id: `gap_${Date.now()}_${index}`,
    field_path: g.field_path,
    severity,
    question: g.q,
    why_needed: g.why,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// System prompt — injected once, static
// ──────────────────────────────────────────────────────────────────────────────

const SYNTHESIZER_SYSTEM_PROMPT = `You are a knowledge synthesis function for a product knowledge platform. You receive a complete product knowledge base and produce structured analytical outputs. Respond only in valid JSON — no preamble, no markdown fences, no explanation outside the JSON object.

OUTPUT FORMAT (return exactly this structure):
{
  "productBrief": "string — 3 paragraphs. Para 1: what the product is and who it is for. Para 2: how it works and key differentiators. Para 3: what is well documented in the knowledge base and what is still thin.",
  "who_its_for": "string or null — 1-2 sentences describing the primary audience. Based on facts.target_users, facts.use_cases, and any B2C user_segments or B2B buyer_vs_user data. Example: 'Mobile-first music listeners aged 18-35, particularly students and Gen Z who want personalized music discovery without friction.' Return null if insufficient data.",
  "why_it_wins": "string or null — 1-2 sentences on competitive positioning. Based on facts.differentiation, facts.features, and facts.value_proposition. Example: 'Spotify wins on personalization depth — its recommendation engine surfaces relevant music faster than Apple Music or YouTube Music, and its free tier creates a low-friction entry point.' Return null if insufficient data.",
  "key_message_pillars": ["array of 3-5 short phrases capturing core messaging themes. Example: ['Personalized discovery', 'Zero-friction listening', 'Free-to-premium ladder', 'Multi-format audio']. Return empty array if insufficient data."],
  "confidenceReasoning": "string — one sentence explaining why the score is what it is. Name what is well captured and what is missing. Example: 'Core identity and pricing are well documented but competitive positioning and target user detail are thin.'",
  "personas": [
    {
      "name": "string — descriptive label e.g. 'The Enterprise Procurement Lead'",
      "type": "decision_maker | end_user | influencer | champion | blocker",
      "description": "string — 2-3 sentences on who this person is",
      "goals": ["string"],
      "pain_points": ["string"],
      "evidence": "string — which KB facts support this persona",
      "confidence": "high | medium | low"
    }
  ],
  "suggestedQuestions": ["string", "string", "string"],
  "gapAnalysis": {
    "critical": [
      { "field_path": "string", "q": "string — question to ask the founder", "why": "string — why this matters", "severity": "critical" }
    ],
    "standard": [
      { "field_path": "string", "q": "string", "why": "string", "severity": "standard" }
    ]
  }
}

RULES:
- personas: max 3. Only derive from signals explicitly present in the KB — do not invent personas from absent information.
- suggestedQuestions: exactly 3 items. Must reference actual captured product details — not generic placeholders.
- gapAnalysis: only list fields that are genuinely empty or incomplete based on the KB content above. Do not ask about fields that already have content.
- productBrief: write only from captured facts. Do not invent information not present in the KB.
- confidenceScore is computed by code and passed to you — use it only to write accurate confidenceReasoning.`;

// ──────────────────────────────────────────────────────────────────────────────
// Main: runSynthesizer
// ──────────────────────────────────────────────────────────────────────────────

export async function runSynthesizer(
  productId: string,
  orgId: number,
): Promise<SynthesizerOutput | null> {
  const pkb = await loadPKB(productId);
  if (!pkb) {
    console.error(`[synthesizer] PKB not found for product ${productId}`);
    return null;
  }

  const orgPKB = await loadOrgPKB(orgId);
  const orgName = orgPKB.name || "your organisation";
  const productType = pkb.meta.product_type;
  const productName =
    (pkb.meta as any).product_name ||
    (pkb.facts?.product_identity?.name as any)?.value ||
    "this product";

  // ── Deterministic confidence (no LLM) ─────────────────────────────────────
  const confidenceScore = computeConfidenceScore(pkb, productType);
  const kbStage: "empty" | "building" | "established" =
    confidenceScore === 0 ? "empty" : confidenceScore >= 70 ? "established" : "building";

  // ── Build user prompt ──────────────────────────────────────────────────────
  const orgContext = buildOrgContext(orgPKB);
  const formattedFacts = formatPKBForContext(pkb);
  const currentGaps = pkb.gaps?.current ?? [];
  const existingGapPaths = currentGaps
    .map(g => g.field_path)
    .join(", ");
  const skippedPaths = currentGaps
    .filter(g => g.do_not_ask)
    .map(g => g.field_path);
  const existingPersonaNames = (pkb.personas ?? [])
    .map(p => `${p.name} (${p.type})`)
    .join(", ");

  const skippedBlock = skippedPaths.length > 0
    ? `\n## Skipped by user (do NOT generate gaps for these field paths)\n${skippedPaths.join(", ")}\n`
    : "";

  const userPrompt = `Product: ${productName}
Product type: ${productType.toUpperCase()}
Organisation: ${orgName}
${orgContext ? `\n${orgContext}\n` : ""}
Computed confidence score: ${confidenceScore}% — KB stage: ${kbStage}

## Current knowledge base
${formattedFacts || "No facts captured yet."}

## Previously identified gaps (field paths for continuity — re-evaluate based on current KB)
${existingGapPaths || "None yet."}
${skippedBlock}
## Existing personas (for continuity)
${existingPersonaNames || "None yet."}

Synthesise the above into the required JSON format. The confidence score is ${confidenceScore} — your confidenceReasoning must explain why. Personas and gap questions must be grounded in the KB content above.`;

  // ── LLM call ──────────────────────────────────────────────────────────────
  let rawResponse: string;
  try {
    rawResponse = await callLLM(SYNTHESIZER_SYSTEM_PROMPT, userPrompt, {
      responseFormat: "json",
      maxTokens: 4096,
    });
  } catch (err) {
    console.error(`[synthesizer] LLM call failed for product ${productId}:`, err);
    return null;
  }

  const llmOutput = parseJSONResponse<LLMSynthesizerOutput>(rawResponse);
  if (!llmOutput) {
    console.error(`[synthesizer] Failed to parse LLM response for product ${productId}`);
    return null;
  }

  // ── Validation ─────────────────────────────────────────────────────────────
  if (!llmOutput.productBrief || !llmOutput.confidenceReasoning) {
    console.error(`[synthesizer] Missing required string fields for product ${productId}`);
    return null;
  }

  // Personas: max 3, prefer high confidence first
  let personas = Array.isArray(llmOutput.personas) ? llmOutput.personas : [];
  if (personas.length > 3) {
    const high = personas.filter(p => p.confidence === "high");
    const medium = personas.filter(p => p.confidence === "medium");
    const low = personas.filter(p => p.confidence === "low");
    personas = [...high, ...medium, ...low].slice(0, 3);
  }

  // suggestedQuestions: must be exactly 3 or set to empty
  const suggestedQuestions =
    Array.isArray(llmOutput.suggestedQuestions) &&
    llmOutput.suggestedQuestions.length === 3
      ? llmOutput.suggestedQuestions
      : [];

  // gapAnalysis: must be arrays (can be empty)
  const criticalGaps = Array.isArray(llmOutput.gapAnalysis?.critical)
    ? llmOutput.gapAnalysis.critical
    : [];
  const standardGaps = Array.isArray(llmOutput.gapAnalysis?.standard)
    ? llmOutput.gapAnalysis.standard
    : [];

  const output: SynthesizerOutput = {
    productBrief: llmOutput.productBrief,
    confidenceReasoning: llmOutput.confidenceReasoning,
    personas,
    suggestedQuestions,
    gapAnalysis: { critical: criticalGaps, standard: standardGaps },
    confidenceScore,
    kbStage,
  };

  // ── Write to PKB (under lock — preserves concurrent writes) ─────────────
  const allGaps: Gap[] = [
    ...criticalGaps.map((g, i) => mapToGap(g, i, "critical")),
    ...standardGaps.map((g, i) => mapToGap(g, criticalGaps.length + i, "important")),
  ];

  await modifyPKB(productId, (freshPkb) => {
    freshPkb.meta.product_brief = output.productBrief;
    freshPkb.meta.kb_health_narrative = output.confidenceReasoning;
    freshPkb.meta.kb_stage = output.kbStage;
    freshPkb.meta.suggested_questions = output.suggestedQuestions;
    freshPkb.meta.confidence_score = output.confidenceScore;

    // derived_insights.product_brief — backward compat for explainer + CI chat
    if (!freshPkb.derived_insights) freshPkb.derived_insights = {};
    freshPkb.derived_insights.product_brief = {
      simple_summary: output.productBrief,
      who_its_for: llmOutput.who_its_for || undefined,
      why_it_wins: llmOutput.why_it_wins || undefined,
      key_message_pillars: Array.isArray(llmOutput.key_message_pillars) ? llmOutput.key_message_pillars : [],
      sample_pitch: undefined,
    };

    // personas — full replacement
    freshPkb.personas = personas.map((sp, i) => mapToPersona(sp, i));

    // gaps — archive old, replace current, carry forward do_not_ask
    if (!freshPkb.gaps) freshPkb.gaps = { current: [], history: [] };
    if (!freshPkb.gaps.history) freshPkb.gaps.history = [];

    // Archive existing gaps before replacing
    const oldGaps = freshPkb.gaps.current ?? [];
    if (oldGaps.length > 0) {
      freshPkb.gaps.history.push({ timestamp: new Date().toISOString(), gaps: oldGaps });
      // Cap history at 50 entries
      if (freshPkb.gaps.history.length > 50) {
        freshPkb.gaps.history = freshPkb.gaps.history.slice(-50);
      }
    }

    // Carry forward do_not_ask from old gaps by field_path
    const doNotAskPaths = new Set(
      oldGaps.filter(g => g.do_not_ask).map(g => g.field_path),
    );
    for (const gap of allGaps) {
      if (doNotAskPaths.has(gap.field_path)) {
        gap.do_not_ask = true;
      }
    }

    freshPkb.gaps.current = allGaps;
  });

  // ── Write to DB ────────────────────────────────────────────────────────────
  try {
    await db
      .update(products)
      .set({ confidence_score: output.confidenceScore, updated_at: new Date() })
      .where(eq(products.id, parseInt(productId)));
  } catch (err) {
    console.error(`[synthesizer] DB update failed for product ${productId}:`, err);
  }

  console.log(
    `[synthesizer] product=${productId} score=${confidenceScore} stage=${kbStage} personas=${personas.length} gaps=${allGaps.length}`,
  );

  return output;
}

// ──────────────────────────────────────────────────────────────────────────────
// Debounce wrapper — coalesces rapid successive KB writes into one synthesis run
// ──────────────────────────────────────────────────────────────────────────────

const synthesizerTimers = new Map<string, NodeJS.Timeout>();

export function scheduleSynthesizer(
  productId: string,
  orgId: number,
  delayMs = 3000,
): void {
  if (synthesizerTimers.has(productId)) {
    clearTimeout(synthesizerTimers.get(productId)!);
  }
  const timer = setTimeout(async () => {
    synthesizerTimers.delete(productId);
    try {
      await runSynthesizer(productId, orgId);
    } catch (err) {
      console.error(`[synthesizer] background run failed for product ${productId}:`, err);
    }
  }, delayMs);
  synthesizerTimers.set(productId, timer);
}
