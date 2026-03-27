import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  X,
  BookOpen,
  AlertTriangle,
  Lock,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Sparkles,
  Users,
  Trophy,
  MessageSquare,
  BarChart2,
} from "lucide-react";
import type { PKB, FactField, Persona, ICP, Conflict } from "@shared/schema";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface PkbKnowledgeViewProps {
  isOpen: boolean;
  onClose: () => void;
  productId: string;
}

// ---------------------------------------------------------------------------
// Constants & helpers
// ---------------------------------------------------------------------------

const LIFECYCLE_CONFIG: Record<string, { label: string; className: string }> = {
  asserted:  { label: "Asserted",  className: "bg-glow-blue/15 text-glow-blue border-0" },
  evidenced: { label: "Evidenced", className: "bg-glow-emerald/15 text-glow-emerald border-0" },
  inferred:  { label: "Inferred",  className: "bg-muted text-muted-foreground border-0" },
  disputed:  { label: "Disputed",  className: "bg-glow-red/15 text-glow-red border-0" },
  stale:     { label: "Stale",     className: "bg-glow-amber/15 text-glow-amber border-0" },
};

const PERSONA_TYPE_LABEL: Record<string, string> = {
  buyer_persona:   "Buyer",
  user_persona:    "User",
  influencer:      "Influencer",
  economic_buyer:  "Economic Buyer",
  gatekeeper:      "Gatekeeper",
};

const FIELD_LABEL: Record<string, string> = {
  name: "Name", one_liner: "One Liner", category: "Category", website: "Website",
  primary_problem: "Primary Problem", top_benefits: "Top Benefits", why_now: "Why Now",
  primary_users: "Primary Users", secondary_users: "Secondary Users", not_for: "Not For",
  model: "Pricing Model", range_notes: "Price Range", currency: "Currency",
  alternatives: "Alternatives", why_we_win: "Why We Win", where_we_lose: "Where We Lose",
  case_studies: "Case Studies", testimonials: "Testimonials", metrics: "Key Metrics",
  assumptions: "Assumptions", known_unknowns: "Known Unknowns",
  buyers: "Buyers", end_users: "End Users", industries: "Industries",
  company_size: "Company Size", regions: "Regions", tech_stack_fit: "Tech Stack Fit",
  sales_cycle: "Sales Cycle", security_compliance: "Security & Compliance",
  roi_driver: "ROI Driver", integrations: "Integrations",
  onboarding_time: "Onboarding Time", support_model: "Support Model",
  segment_name: "Segment Name", who: "Who", why_they_care: "Why They Care",
  triggers: "Triggers", loops: "Loops", risks: "Risks", mitigations: "Mitigations",
};

const CORE_SECTION_LABELS: Record<string, string> = {
  product_identity: "Product Identity",
  value_proposition: "Value Proposition",
  target_users: "Target Users",
  use_cases: "Use Cases",
  features: "Features",
  pricing: "Pricing",
  differentiation: "Differentiation",
  proof_assets: "Proof Assets",
  constraints_assumptions: "Constraints & Assumptions",
};

function isFactField(obj: unknown): obj is FactField {
  return (
    typeof obj === "object" &&
    obj !== null &&
    "value" in obj &&
    "sources" in obj &&
    Array.isArray((obj as Record<string, unknown>).sources)
  );
}

function collectFactFields(
  obj: unknown,
  prefix: string,
  results: { path: string; field: FactField }[] = [],
): { path: string; field: FactField }[] {
  if (!obj || typeof obj !== "object") return results;
  if (isFactField(obj)) {
    results.push({ path: prefix, field: obj as FactField });
    return results;
  }
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      collectFactFields(obj[i], `${prefix}[${i}]`, results);
    }
  } else {
    for (const key of Object.keys(obj as Record<string, unknown>)) {
      collectFactFields(
        (obj as Record<string, unknown>)[key],
        prefix ? `${prefix}.${key}` : key,
        results,
      );
    }
  }
  return results;
}

function readableFieldLabel(path: string): string {
  const last = path.split(".").pop() ?? path;
  const key = last.replace(/\[\d+\].*$/, "");
  return FIELD_LABEL[key] ?? key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value
      .map((v) => (typeof v === "string" ? v : JSON.stringify(v)))
      .join(", ");
  }
  return JSON.stringify(value);
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short", day: "numeric", year: "numeric",
    });
  } catch {
    return iso;
  }
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function LifecycleBadge({ status }: { status?: string }) {
  if (!status) return null;
  const cfg = LIFECYCLE_CONFIG[status];
  if (!cfg) return null;
  return (
    <Badge variant="outline" className={cn("text-xs px-1.5 py-0 shrink-0", cfg.className)}>
      {cfg.label}
    </Badge>
  );
}

function FactRow({ path, field }: { path: string; field: FactField }) {
  const label = readableFieldLabel(path);
  const valueStr = formatValue(field.value);
  const sourceCount = field.sources?.length ?? 0;
  const firstRef = field.sources?.[0]?.source_ref;

  return (
    <div className="py-2.5 border-b border-border/40 last:border-0">
      {field.lifecycle_status === "disputed" && (
        <div className="flex items-center gap-1.5 text-xs text-glow-red mb-2 bg-glow-red/10 rounded px-2 py-1">
          <AlertTriangle className="h-3 w-3 shrink-0" />
          Conflict detected — resolve in Review Inbox
        </div>
      )}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-foreground">{label}</p>
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2 break-words">{valueStr}</p>
          {sourceCount > 0 && (
            <p className="text-xs text-muted-foreground/60 mt-0.5">
              {sourceCount} source{sourceCount !== 1 ? "s" : ""}
              {firstRef && ` · ${firstRef}`}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0 flex-wrap justify-end mt-0.5">
          <LifecycleBadge status={field.lifecycle_status} />
          {field.sensitive && <Lock className="h-3 w-3 text-glow-amber" aria-label="Sensitive field" />}
          {field.approved && <CheckCircle2 className="h-3 w-3 text-glow-emerald" aria-label="Approved" />}
        </div>
      </div>
    </div>
  );
}

function FactSection({
  label,
  sectionKey,
  fields,
  toggled,
  onToggle,
}: {
  label: string;
  sectionKey: string;
  fields: { path: string; field: FactField }[];
  toggled: Record<string, boolean>;
  onToggle: (key: string, currentOpen: boolean) => void;
}) {
  const hasContent = fields.length > 0;
  const isOpen = sectionKey in toggled ? toggled[sectionKey] : hasContent;

  return (
    <div className="border border-border/50 rounded-lg overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-3 py-2.5 bg-muted/30 hover:bg-muted/50 transition-colors text-left"
        onClick={() => onToggle(sectionKey, isOpen)}
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{label}</span>
          <Badge variant="outline" className="text-xs px-1.5 py-0 text-muted-foreground">
            {fields.length}
          </Badge>
        </div>
        {isOpen ? (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
        )}
      </button>
      {isOpen && (
        <div className="px-3">
          {hasContent ? (
            fields.map(({ path, field }) => (
              <FactRow key={path} path={path} field={field} />
            ))
          ) : (
            <p className="text-xs text-muted-foreground py-3">No data in this section yet.</p>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Summary
// ---------------------------------------------------------------------------

export function SummaryTab({ pkb, onTabChange }: { pkb: PKB; onTabChange: (tab: string) => void }) {
  const facts = (pkb.facts ?? {}) as Record<string, unknown>;
  const pi   = facts.product_identity as Record<string, FactField | undefined> | undefined;
  const vp   = facts.value_proposition as Record<string, FactField | undefined> | undefined;
  const tu   = facts.target_users as Record<string, FactField | undefined> | undefined;
  const diff = facts.differentiation as Record<string, FactField | undefined> | undefined;

  const productName   = pi?.name?.value     ? formatValue(pi.name.value)     : "Unnamed Product";
  const oneLiner      = pi?.one_liner?.value ? formatValue(pi.one_liner.value) : null;
  const productType   = pkb.meta?.product_type;
  const confidence    = (pkb.derived_insights as Record<string, unknown> | undefined)?.confidence as { level?: string; score?: number } | undefined;
  const confLevel     = confidence?.level;
  const confScore     = confidence?.score ?? 0;
  const lastUpdated   = pkb.meta?.last_updated;

  const featuresList  = Array.isArray(facts.features) ? facts.features as Record<string, FactField | undefined>[] : [];
  const primaryProblem = vp?.primary_problem?.value ? formatValue(vp.primary_problem.value) : null;
  const topBenefits    = vp?.top_benefits?.value    ? formatValue(vp.top_benefits.value)    : null;
  const primaryUsers   = tu?.primary_users?.value   ? formatValue(tu.primary_users.value)   : null;
  const activePersonas = (pkb.personas ?? []).filter((p) => p.status === "active");

  const whyWeWin       = diff?.why_we_win?.value   ? formatValue(diff.why_we_win.value)   : null;
  const diffAlternatives = diff?.alternatives?.value ? formatValue(diff.alternatives.value) : null;
  const diffPills: string[] = whyWeWin
    ? whyWeWin.split(/[.;,\n]+/).map((s) => s.trim()).filter((s) => s.length > 4).slice(0, 4)
    : [];

  const synthesis  = pkb.derived_insights as Record<string, unknown> | undefined;
  const samplePitch = (synthesis?.sample_pitch ?? synthesis?.simple_summary) as string | undefined;

  const healthAreas = [
    { label: "Product Identity",    filled: [!!pi?.name?.value, !!pi?.one_liner?.value].filter(Boolean).length,                                          total: 2 },
    { label: "Value Proposition",   filled: [!!(vp?.primary_problem?.value || vp?.top_benefits?.value), !!vp?.why_now?.value].filter(Boolean).length,     total: 2 },
    { label: "Target Users",        filled: [!!tu?.primary_users?.value].filter(Boolean).length,                                                          total: 1 },
    { label: "Differentiation",     filled: [!!diff?.why_we_win?.value, !!diff?.alternatives?.value].filter(Boolean).length,                              total: 2 },
  ];
  const totalFilled = healthAreas.reduce((s, a) => s + a.filled, 0);
  const totalAreas  = healthAreas.reduce((s, a) => s + a.total, 0);

  const confBadgeClass =
    confLevel === "high"   ? "bg-confidence-high/15 text-confidence-high border-0" :
    confLevel === "medium" ? "bg-confidence-medium/15 text-confidence-medium border-0" :
                             "bg-confidence-low/15 text-confidence-low border-0";

  return (
    <div className="space-y-4">
      {/* Hero */}
      <div className="rounded-xl bg-gradient-to-b from-primary/10 to-transparent p-5">
        <h2 className="text-2xl font-bold leading-tight">{productName}</h2>
        {oneLiner && <p className="text-sm text-muted-foreground mt-1">{oneLiner}</p>}
        <div className="flex flex-wrap items-center gap-2 mt-3">
          {productType && (
            <Badge variant="outline" className="text-xs">{productType.toUpperCase()}</Badge>
          )}
          {confLevel && (
            <Badge variant="outline" className={cn("text-xs capitalize", confBadgeClass)}>
              {confLevel} confidence · {confScore}%
            </Badge>
          )}
          {lastUpdated && (
            <span className="text-xs text-muted-foreground">Updated {formatDate(lastUpdated)}</span>
          )}
        </div>
      </div>

      {/* Card 1: What It Is */}
      <div className="rounded-xl border border-border/60 shadow-sm p-5 hover:shadow-md transition-shadow space-y-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary shrink-0" />
          <p className="text-sm font-semibold">What It Is</p>
        </div>
        {primaryProblem || topBenefits ? (
          <p className="text-sm text-muted-foreground leading-relaxed">{primaryProblem ?? topBenefits}</p>
        ) : (
          <p className="text-xs text-muted-foreground/60 italic">No description captured yet.</p>
        )}
        {featuresList.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {featuresList.slice(0, 6).map((f, i) => {
              const nameField = (f as Record<string, FactField | undefined>)?.name ?? (f as Record<string, FactField | undefined>)?.title;
              const label = nameField?.value ? formatValue(nameField.value) : `Feature ${i + 1}`;
              return <Badge key={i} variant="secondary" className="text-xs">{label}</Badge>;
            })}
          </div>
        )}
      </div>

      {/* Card 2: Who It's For */}
      <div className="rounded-xl border border-border/60 shadow-sm p-5 hover:shadow-md transition-shadow space-y-3">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-primary shrink-0" />
          <p className="text-sm font-semibold">Who It&apos;s For</p>
        </div>
        {primaryUsers ? (
          <p className="text-sm text-muted-foreground leading-relaxed">{primaryUsers}</p>
        ) : (
          <p className="text-xs text-muted-foreground/60 italic">No target users captured yet.</p>
        )}
        {activePersonas.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {activePersonas.map((p) => {
              const pct = Math.round((p.confidence ?? 0) * 100);
              const chipColor =
                pct >= 70 ? "bg-confidence-high/15 text-confidence-high border-confidence-high/30" :
                pct >= 40 ? "bg-confidence-medium/15 text-confidence-medium border-confidence-medium/30" :
                            "bg-confidence-low/15 text-confidence-low border-confidence-low/30";
              return (
                <button
                  key={p.persona_id}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs border cursor-pointer hover:opacity-80 transition-opacity",
                    chipColor,
                  )}
                  onClick={() => onTabChange("personas")}
                >
                  <span>{PERSONA_TYPE_LABEL[p.type] ?? p.type}</span>
                  <span className="font-medium">· {p.name}</span>
                  <span className="opacity-70">{pct}%</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Card 3: Why It Wins */}
      <div className="rounded-xl border border-border/60 shadow-sm p-5 hover:shadow-md transition-shadow space-y-3">
        <div className="flex items-center gap-2">
          <Trophy className="h-4 w-4 text-primary shrink-0" />
          <p className="text-sm font-semibold">Why It Wins</p>
        </div>
        {whyWeWin || diffAlternatives ? (
          <p className="text-sm text-muted-foreground leading-relaxed line-clamp-3">
            {whyWeWin ?? diffAlternatives}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground/60 italic">No differentiation captured yet.</p>
        )}
        {diffPills.length > 0 && (
          <div className="space-y-1.5">
            {diffPills.map((pill, i) => (
              <div
                key={i}
                className="border-l-2 border-primary/50 bg-primary/5 rounded-r-md px-3 py-1.5 text-xs text-muted-foreground"
              >
                {pill}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Card 4: The Pitch */}
      {samplePitch && (
        <div className="rounded-xl border border-dashed border-primary/30 bg-gradient-to-br from-primary/5 to-transparent shadow-sm p-5 hover:shadow-md transition-shadow space-y-2">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-primary shrink-0" />
            <p className="text-sm font-semibold">The Pitch</p>
          </div>
          <div className="relative pl-4">
            <span className="absolute top-0 left-0 text-3xl text-primary/20 font-serif leading-none select-none">&ldquo;</span>
            <p className="text-sm text-muted-foreground italic leading-relaxed">{samplePitch}</p>
          </div>
        </div>
      )}

      {/* Card 5: Knowledge Health */}
      <div className="rounded-xl border border-border/60 shadow-sm p-5 hover:shadow-md transition-shadow space-y-3">
        <div className="flex items-center gap-2">
          <BarChart2 className="h-4 w-4 text-primary shrink-0" />
          <p className="text-sm font-semibold">Knowledge Health</p>
        </div>
        <div className="space-y-2.5">
          {healthAreas.map(({ label, filled, total }) => {
            const pct = total > 0 ? Math.round((filled / total) * 100) : 0;
            const barColor = pct >= 75 ? "bg-confidence-high" : pct >= 40 ? "bg-confidence-medium" : "bg-confidence-low";
            return (
              <div key={label} className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">{label}</span>
                  <span className="text-xs text-muted-foreground/60">{filled}/{total}</span>
                </div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div className={cn("h-full rounded-full transition-all", barColor)} style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground/70">{totalFilled} of {totalAreas} key areas complete</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Facts
// ---------------------------------------------------------------------------

export function FactsTab({ pkb }: { pkb: PKB }) {
  const [toggled, setToggled] = useState<Record<string, boolean>>({});

  function onToggle(key: string, currentOpen: boolean) {
    setToggled((prev) => ({ ...prev, [key]: !currentOpen }));
  }

  // Group core facts by top-level section key
  const coreSections = useMemo(() => {
    const facts = pkb.facts ?? {};
    return Object.entries(CORE_SECTION_LABELS).map(([key, label]) => {
      const sectionData = (facts as Record<string, unknown>)[key];
      const fields = collectFactFields(sectionData, key);
      return { key, label, fields };
    });
  }, [pkb.facts]);

  // Extension sections
  const b2bFields = useMemo(
    () => collectFactFields(pkb.extensions?.b2b, "extensions.b2b"),
    [pkb.extensions?.b2b],
  );
  const b2cFields = useMemo(
    () => collectFactFields(pkb.extensions?.b2c, "extensions.b2c"),
    [pkb.extensions?.b2c],
  );

  const totalFacts = coreSections.reduce((sum, s) => sum + s.fields.length, 0)
    + b2bFields.length
    + b2cFields.length;

  if (totalFacts === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-48 gap-2 text-center">
        <BookOpen className="h-8 w-8 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">No facts captured yet.</p>
        <p className="text-xs text-muted-foreground/70">Upload documents or answer interview questions to build the knowledge base.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {coreSections.map(({ key, label, fields }) => (
        <FactSection
          key={key}
          sectionKey={key}
          label={label}
          fields={fields}
          toggled={toggled}
          onToggle={onToggle}
        />
      ))}
      {b2bFields.length > 0 && (
        <FactSection
          sectionKey="ext_b2b"
          label="B2B Extensions"
          fields={b2bFields}
          toggled={toggled}
          onToggle={onToggle}
        />
      )}
      {b2cFields.length > 0 && (
        <FactSection
          sectionKey="ext_b2c"
          label="B2C Extensions"
          fields={b2cFields}
          toggled={toggled}
          onToggle={onToggle}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Personas
// ---------------------------------------------------------------------------

function PersonaCard({ persona }: { persona: Persona }) {
  const isActive = persona.status === "active";
  const isCandidate = persona.status === "candidate";
  const confidencePct = Math.round((persona.confidence ?? 0) * 100);
  const evidenceCount = persona.evidence?.length ?? 0;

  return (
    <div
      className={cn(
        "border border-l-4 rounded-lg p-3 space-y-2",
        isActive && "border-l-glow-emerald",
        isCandidate && "border-l-glow-amber",
        !isActive && !isCandidate && "border-l-border opacity-50",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{persona.name}</p>
          <div className="flex flex-wrap items-center gap-1.5 mt-1">
            <Badge variant="outline" className="text-xs px-1.5 py-0 capitalize">
              {PERSONA_TYPE_LABEL[persona.type] ?? persona.type.replace(/_/g, " ")}
            </Badge>
            <LifecycleBadge status={persona.lifecycle_status} />
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="text-xs text-muted-foreground">{confidencePct}%</p>
          <div className="h-1.5 w-16 bg-muted rounded-full overflow-hidden mt-1">
            <div
              className="h-full bg-confidence-high rounded-full"
              style={{ width: `${confidencePct}%` }}
            />
          </div>
        </div>
      </div>

      {persona.goals && persona.goals.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-0.5">Goals</p>
          <ul className="text-xs text-muted-foreground space-y-0.5">
            {persona.goals.slice(0, 2).map((g, i) => (
              <li key={i} className="flex gap-1">
                <span className="shrink-0">•</span>
                <span className="line-clamp-1">{g.text}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {persona.pains && persona.pains.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-0.5">Pains</p>
          <ul className="text-xs text-muted-foreground space-y-0.5">
            {persona.pains.slice(0, 2).map((p, i) => (
              <li key={i} className="flex gap-1">
                <span className="shrink-0">•</span>
                <span className="line-clamp-1">{p.text}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {persona.buying_triggers && persona.buying_triggers.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-0.5">Buying Triggers</p>
          <ul className="text-xs text-muted-foreground space-y-0.5">
            {persona.buying_triggers.slice(0, 2).map((t, i) => (
              <li key={i} className="flex gap-1">
                <span className="shrink-0">•</span>
                <span className="line-clamp-1">{t}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {evidenceCount > 0 && (
        <p className="text-xs text-muted-foreground/60">
          {evidenceCount} evidence source{evidenceCount !== 1 ? "s" : ""}
        </p>
      )}
    </div>
  );
}

export function PersonasTab({ pkb }: { pkb: PKB }) {
  const personas = pkb.personas ?? [];

  const active    = personas.filter((p) => p.status === "active");
  const candidate = personas.filter((p) => p.status === "candidate");
  const inactive  = personas.filter((p) => p.status === "inactive");

  if (personas.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-48 gap-2 text-center">
        <p className="text-sm text-muted-foreground">No personas extracted yet.</p>
        <p className="text-xs text-muted-foreground/70">Personas are inferred after documents or URLs are processed.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {active.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-glow-emerald inline-block" />
            Active ({active.length})
          </p>
          {active.map((p) => <PersonaCard key={p.persona_id} persona={p} />)}
        </div>
      )}
      {candidate.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-glow-amber inline-block" />
            Candidate ({candidate.length})
          </p>
          {candidate.map((p) => <PersonaCard key={p.persona_id} persona={p} />)}
        </div>
      )}
      {inactive.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-muted-foreground/40 inline-block" />
            Inactive ({inactive.length})
          </p>
          {inactive.map((p) => <PersonaCard key={p.persona_id} persona={p} />)}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: ICPs
// ---------------------------------------------------------------------------

function IcpCard({ icp }: { icp: ICP }) {
  const confidencePct = Math.round((icp.confidence ?? 0) * 100);
  const industries = icp.firmographics?.industries ?? [];
  const companySizes = icp.firmographics?.company_size ?? [];
  const disqualifiers = icp.disqualifiers ?? [];
  const notFor = icp.not_for ?? [];

  return (
    <div className="border rounded-lg p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="outline" className="text-xs px-1.5 py-0 capitalize">
            {icp.segment_type}
          </Badge>
          <LifecycleBadge status={icp.lifecycle_status} />
        </div>
        <div className="text-right shrink-0">
          <p className="text-xs text-muted-foreground">{confidencePct}%</p>
          <div className="h-1.5 w-16 bg-muted rounded-full overflow-hidden mt-1">
            <div
              className="h-full bg-glow-blue rounded-full"
              style={{ width: `${confidencePct}%` }}
            />
          </div>
        </div>
      </div>

      {industries.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-0.5">Industries</p>
          <p className="text-xs text-muted-foreground">{industries.slice(0, 3).join(", ")}</p>
        </div>
      )}

      {companySizes.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-0.5">Company Size</p>
          <p className="text-xs text-muted-foreground">{companySizes.join(", ")}</p>
        </div>
      )}

      {disqualifiers.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-0.5">Disqualifiers</p>
          <ul className="text-xs text-muted-foreground space-y-0.5">
            {disqualifiers.slice(0, 2).map((d, i) => (
              <li key={i} className="flex gap-1">
                <span className="shrink-0 text-glow-red">✕</span>
                <span>{d}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {notFor.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-0.5">Not For</p>
          <p className="text-xs text-muted-foreground">{notFor.slice(0, 2).join(", ")}</p>
        </div>
      )}
    </div>
  );
}

export function IcpsTab({ pkb }: { pkb: PKB }) {
  const icps = pkb.icps ?? [];

  if (icps.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-48 gap-2 text-center">
        <p className="text-sm text-muted-foreground">No ICPs extracted yet.</p>
        <p className="text-xs text-muted-foreground/70">ICPs are inferred alongside personas after processing.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {icps.map((icp) => <IcpCard key={icp.icp_id} icp={icp} />)}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Conflicts & Audit
// ---------------------------------------------------------------------------

function ConflictCard({ conflict }: { conflict: Conflict }) {
  const isUnresolved = conflict.resolution_status === "unresolved";
  const valueA = typeof conflict.value_a === "object" && conflict.value_a !== null
    ? (conflict.value_a as Record<string, unknown>).value ?? conflict.value_a
    : conflict.value_a;
  const valueB = typeof conflict.value_b === "object" && conflict.value_b !== null
    ? (conflict.value_b as Record<string, unknown>).value ?? conflict.value_b
    : conflict.value_b;

  return (
    <div
      className={cn(
        "border border-l-4 rounded-lg p-3 space-y-2",
        isUnresolved ? "border-l-glow-red" : "border-l-border opacity-60",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium font-mono break-all">{conflict.field_path}</p>
        <Badge
          variant="outline"
          className={cn(
            "text-xs px-1.5 py-0 shrink-0 border-0",
            isUnresolved
              ? "bg-glow-red/15 text-glow-red"
              : "bg-muted text-muted-foreground",
          )}
        >
          {isUnresolved ? "Unresolved" : "Resolved"}
        </Badge>
      </div>

      <div className="space-y-1">
        <div className="flex items-start gap-2">
          <span className="text-xs text-muted-foreground shrink-0 w-4">A:</span>
          <span className="text-xs text-muted-foreground font-mono line-clamp-1 break-all">
            {String(valueA).slice(0, 100)}
          </span>
        </div>
        <div className="flex items-start gap-2">
          <span className="text-xs text-muted-foreground shrink-0 w-4">B:</span>
          <span className="text-xs text-muted-foreground font-mono line-clamp-1 break-all">
            {String(valueB).slice(0, 100)}
          </span>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground/60">
          Detected {formatDate(conflict.detected_at)}
        </p>
        {conflict.resolution_status === "resolved" && conflict.resolved_at && (
          <p className="text-xs text-muted-foreground/60">
            Resolved {formatDate(conflict.resolved_at)}
          </p>
        )}
      </div>
    </div>
  );
}

interface AuditEntry {
  path: string;
  timestamp: string;
  action: string;
  actor: string;
  previous_value?: unknown;
  note?: string;
}

function collectAuditEntries(pkb: PKB): AuditEntry[] {
  const results: AuditEntry[] = [];

  const allFields = [
    ...collectFactFields(pkb.facts, "facts"),
    ...collectFactFields(pkb.extensions?.b2b, "extensions.b2b"),
    ...collectFactFields(pkb.extensions?.b2c, "extensions.b2c"),
  ];

  for (const { path, field } of allFields) {
    if (!field.audit_trail) continue;
    for (const entry of field.audit_trail) {
      results.push({
        path,
        timestamp: entry.timestamp,
        action: entry.action,
        actor: entry.actor,
        previous_value: entry.previous_value,
        note: entry.note,
      });
    }
  }

  results.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  return results.slice(0, 20);
}

function ConflictsAuditTab({ pkb }: { pkb: PKB }) {
  const conflicts = pkb.conflicts ?? [];
  const auditEntries = useMemo(() => collectAuditEntries(pkb), [pkb]);

  const unresolved = conflicts.filter((c) => c.resolution_status === "unresolved");
  const resolved   = conflicts.filter((c) => c.resolution_status === "resolved");

  return (
    <div className="space-y-6">
      {/* Conflicts section */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-foreground">
          Conflicts ({conflicts.length})
        </p>
        {conflicts.length === 0 ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground py-3">
            <CheckCircle2 className="h-4 w-4 text-glow-emerald shrink-0" />
            No conflicts detected.
          </div>
        ) : (
          <div className="space-y-2">
            {unresolved.map((c) => <ConflictCard key={c.conflict_id} conflict={c} />)}
            {resolved.map((c) => <ConflictCard key={c.conflict_id} conflict={c} />)}
          </div>
        )}
      </div>

      {/* Audit section */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-foreground">
          Recent Changes ({auditEntries.length})
        </p>
        {auditEntries.length === 0 ? (
          <p className="text-xs text-muted-foreground py-2">No audit trail entries yet.</p>
        ) : (
          <div className="space-y-1">
            {auditEntries.map((entry, i) => (
              <div key={i} className="flex items-start gap-2 py-1.5 border-b border-border/40 last:border-0">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs font-mono text-muted-foreground truncate max-w-[180px]">
                      {entry.path}
                    </span>
                    <Badge variant="outline" className="text-xs px-1 py-0 border-0 bg-muted text-muted-foreground">
                      {entry.action}
                    </Badge>
                  </div>
                  {entry.previous_value !== undefined && (
                    <p className="text-xs text-muted-foreground/60 mt-0.5 line-clamp-1">
                      was: {String(entry.previous_value).slice(0, 60)}
                    </p>
                  )}
                  {entry.note && (
                    <p className="text-xs text-muted-foreground/60 mt-0.5 line-clamp-1">{entry.note}</p>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs text-muted-foreground/60">{entry.actor}</p>
                  <p className="text-xs text-muted-foreground/40">{formatDate(entry.timestamp)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function PkbKnowledgeView({ isOpen, onClose, productId }: PkbKnowledgeViewProps) {
  const [activeTab, setActiveTab] = useState("summary");

  const { data } = useQuery<{ pkb: PKB }>({
    queryKey: ["/api/products", productId],
    enabled: !!productId && isOpen,
    staleTime: 10_000,
  });

  const pkb = data?.pkb;

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/20 sm:hidden"
          onClick={onClose}
        />
      )}

      {/* Panel */}
      <div
        className={cn(
          "fixed right-0 top-0 h-full z-40 flex flex-col",
          "w-full sm:w-[480px]",
          "bg-card border-l border-border shadow-xl",
          "transition-transform duration-300 ease-in-out",
          isOpen ? "translate-x-0" : "translate-x-full",
        )}
        data-testid="pkb-knowledge-panel"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-muted-foreground" />
            <span className="font-semibold text-sm">Product Knowledge</span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={onClose}
            data-testid="pkb-knowledge-close"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Body */}
        {!pkb ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-sm text-muted-foreground">Loading knowledge base...</p>
          </div>
        ) : (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
            <TabsList className="mx-4 mt-3 shrink-0 grid grid-cols-5">
              <TabsTrigger value="summary" className="text-xs">Summary</TabsTrigger>
              <TabsTrigger value="facts" className="text-xs">Facts</TabsTrigger>
              <TabsTrigger value="personas" className="text-xs">Personas</TabsTrigger>
              <TabsTrigger value="icps" className="text-xs">ICPs</TabsTrigger>
              <TabsTrigger value="conflicts" className="text-xs">Conflicts</TabsTrigger>
            </TabsList>

            <TabsContent value="summary" className="flex-1 overflow-y-auto px-4 py-3 mt-0">
              <SummaryTab pkb={pkb} onTabChange={setActiveTab} />
            </TabsContent>

            <TabsContent value="facts" className="flex-1 overflow-y-auto px-4 py-3 mt-0">
              <FactsTab pkb={pkb} />
            </TabsContent>

            <TabsContent value="personas" className="flex-1 overflow-y-auto px-4 py-3 mt-0">
              <PersonasTab pkb={pkb} />
            </TabsContent>

            <TabsContent value="icps" className="flex-1 overflow-y-auto px-4 py-3 mt-0">
              <IcpsTab pkb={pkb} />
            </TabsContent>

            <TabsContent value="conflicts" className="flex-1 overflow-y-auto px-4 py-3 mt-0">
              <ConflictsAuditTab pkb={pkb} />
            </TabsContent>
          </Tabs>
        )}
      </div>
    </>
  );
}
