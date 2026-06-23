import { callLLM, parseJSONResponse } from "./base-agent";
import { loadPKB, loadOrgPKB, updateOrgPKBFields } from "../services/pkb-storage";
import { formatPKBForContext } from "./product-explainer";
import { db } from "../db";
import { products } from "@shared/schema";
import { eq } from "drizzle-orm";
import type { CreatorProfile } from "@shared/schema";

// ──────────────────────────────────────────────────────────────────────────────
// Creator synthesizer — reads every project PKB in a creator workspace and
// produces a unified developer profile: who they are, what they build, how they
// build, their skill groups, featured projects, and inter-project connections.
// ──────────────────────────────────────────────────────────────────────────────

interface ProjectDigest {
  product_id: number;
  name: string;
  primary_language: string | null;
  topics: string[];
  stars: number;
  repo_url: string | null;
  homepage_url: string | null;
  brief: string;
  facts: string;
}

const SYSTEM_PROMPT = `You are a portfolio strategist for software builders ("vibe coders"). You are given a developer's GitHub projects (and any uploaded materials), already parsed into structured knowledge. Produce a single JSON object describing the WHOLE PERSON as a builder — not any one project.

Respond ONLY with valid JSON, no markdown fences, exactly this shape:
{
  "headline": "string — a punchy one-line specialty, e.g. 'Full-stack builder shipping AI-native web apps'. Grounded in their actual projects.",
  "bio": "string — 2 to 3 short paragraphs. Para 1: who they are as a builder and the through-line across their work. Para 2: the kinds of things they build and the problems they gravitate to. Optional Para 3: trajectory / what's emerging in recent work.",
  "how_i_build": "string — 2 to 4 sentences on their building style, inferred from tech choices, project shapes, and READMEs (e.g. ships fast with TypeScript + serverless, prefers small focused tools, documentation-first).",
  "specialties": ["3-6 short theme labels grounded in the projects, e.g. 'Developer tooling', 'LLM apps', 'Data viz'"],
  "skill_groups": [
    { "label": "Languages", "items": ["TypeScript", "Python"] },
    { "label": "Frameworks", "items": ["React", "Next.js"] },
    { "label": "Tools & Infra", "items": ["Docker", "Supabase"] }
  ],
  "featured_product_ids": [/* 3-6 product_id numbers, the most portfolio-worthy, best first */],
  "connections": [
    { "from_product_id": 1, "to_product_id": 2, "relationship": "shared stack | evolution of | companion tool | same domain", "rationale": "one sentence" }
  ]
}

RULES:
- Use ONLY the provided projects and their real product_id values. Never invent projects or ids.
- featured_product_ids: rank by impact/polish (stars, has live homepage, completeness, recency).
- connections: only include genuine relationships; [] if none. Max 8.
- Ground everything in the evidence. Do not fabricate skills not visible in the projects.`;

export async function runCreatorSynthesizer(orgId: number): Promise<CreatorProfile | null> {
  const orgPKB = await loadOrgPKB(orgId);

  const rows = await db
    .select()
    .from(products)
    .where(eq(products.org_id, orgId));

  const sources = orgPKB.creator_sources ?? [];

  if (rows.length === 0 && sources.length === 0) {
    console.log(`[creator-synth] org ${orgId} has no projects or sources yet`);
    return null;
  }

  const digests: ProjectDigest[] = [];
  for (const p of rows) {
    const pkb = await loadPKB(String(p.id));
    digests.push({
      product_id: p.id,
      name: p.name,
      primary_language: (p as any).primary_language ?? null,
      topics: ((p as any).topics ?? []) as string[],
      stars: (p as any).stars ?? 0,
      repo_url: (p as any).repo_url ?? null,
      homepage_url: (p as any).homepage_url ?? null,
      brief: pkb?.meta?.product_brief ?? pkb?.derived_insights?.product_brief?.simple_summary ?? "",
      facts: pkb ? formatPKBForContext(pkb).slice(0, 1800) : "",
    });
  }

  const projectsBlock = digests.map((d) => `### Project ${d.product_id}: ${d.name}
- Primary language: ${d.primary_language || "unknown"}
- Topics: ${d.topics.join(", ") || "none"}
- Stars: ${d.stars}${d.homepage_url ? `\n- Live: ${d.homepage_url}` : ""}${d.repo_url ? `\n- Repo: ${d.repo_url}` : ""}
- Brief: ${d.brief || "(no brief yet)"}
${d.facts ? `- Knowledge:\n${d.facts}` : ""}`).join("\n\n");

  // Uploaded materials (resume, personal sites) — strong signal for bio/skills.
  const sourcesBlock = sources.length > 0
    ? `\n\n## Uploaded materials about the builder (resume / sites — use for bio, skills, social links)\n` +
      sources.map((s) => `### ${s.type.toUpperCase()}: ${s.title || s.ref}\n${s.text.slice(0, 4000)}`).join("\n\n")
    : "";

  const userPrompt = `Developer: ${orgPKB.name || orgPKB.github_username || "this builder"}
${orgPKB.github_username ? `GitHub: @${orgPKB.github_username}` : ""}
Projects (${digests.length}):

${projectsBlock}${sourcesBlock}

Synthesize the unified builder profile as JSON. ${sources.length > 0 ? "Blend the GitHub projects with the uploaded resume/site materials — the resume is authoritative for background, role, and contact/social links." : ""}`;

  let raw: string;
  try {
    raw = await callLLM(SYSTEM_PROMPT, userPrompt, { responseFormat: "json", maxTokens: 3000, temperature: 0.3 });
  } catch (err) {
    console.error(`[creator-synth] LLM failed for org ${orgId}:`, err);
    return null;
  }

  const parsed = parseJSONResponse<Partial<CreatorProfile>>(raw);
  if (!parsed || !parsed.bio) {
    console.error(`[creator-synth] parse failed for org ${orgId}`);
    return null;
  }

  const validIds = new Set(digests.map((d) => d.product_id));
  const profile: CreatorProfile = {
    display_name: orgPKB.name || orgPKB.github_username || "Builder",
    headline: parsed.headline || "Builder & maker",
    bio: parsed.bio,
    how_i_build: parsed.how_i_build || "",
    specialties: Array.isArray(parsed.specialties) ? parsed.specialties.slice(0, 6) : [],
    skill_groups: Array.isArray(parsed.skill_groups) ? parsed.skill_groups : [],
    featured_product_ids: Array.isArray(parsed.featured_product_ids)
      ? parsed.featured_product_ids.filter((id) => validIds.has(id)).slice(0, 6)
      : [],
    connections: Array.isArray(parsed.connections)
      ? parsed.connections.filter((c) => validIds.has(c.from_product_id) && validIds.has(c.to_product_id)).slice(0, 8)
      : [],
    social_links: parsed.social_links,
    generated_at: new Date().toISOString(),
  };

  // Fallback featured set if the LLM omitted it: top by stars.
  if (profile.featured_product_ids.length === 0) {
    profile.featured_product_ids = [...digests]
      .sort((a, b) => b.stars - a.stars)
      .slice(0, 6)
      .map((d) => d.product_id);
  }

  await updateOrgPKBFields(orgId, { creator_profile: profile, headline: profile.headline } as any);
  console.log(`[creator-synth] org ${orgId}: profile generated, ${profile.featured_product_ids.length} featured`);
  return profile;
}
