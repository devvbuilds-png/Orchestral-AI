import { useState } from "react";
import { Sparkles, Users, Trophy, BarChart3, ChevronDown, Globe, Calendar, TrendingUp, Shield, Lightbulb, Target, Rocket, Layers, Eye, EyeOff, Check, MessageSquare, Megaphone } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { useMinimalMode } from "@/contexts/MinimalModeContext";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { PKB, Product, Gap } from "@shared/schema";

type FactLifecycle = "Asserted" | "Evidenced" | "Inferred" | "Disputed" | "Stale";

const lifecycleConfig: Record<FactLifecycle, { color: string; bg: string; ring: string }> = {
  Asserted: { color: "text-glow-blue", bg: "bg-glow-blue/10", ring: "ring-glow-blue/20" },
  Evidenced: { color: "text-glow-emerald", bg: "bg-glow-emerald/10", ring: "ring-glow-emerald/20" },
  Inferred: { color: "text-glow-amber", bg: "bg-glow-amber/10", ring: "ring-glow-amber/20" },
  Disputed: { color: "text-glow-pink", bg: "bg-glow-pink/10", ring: "ring-glow-pink/20" },
  Stale: { color: "text-muted-foreground", bg: "bg-secondary", ring: "ring-border" },
};

function toLifecycle(status?: string): FactLifecycle {
  const map: Record<string, FactLifecycle> = {
    asserted: "Asserted", evidenced: "Evidenced",
    inferred: "Inferred", disputed: "Disputed", stale: "Stale",
  };
  return map[status ?? ""] ?? "Asserted";
}

interface KnowledgeTabProps {
  product: Product;
  pkb: PKB | null;
  gapDialogOpen: boolean;
  selectedGap: { key: string; q: string; why: string; severity: string } | null;
  openGapFill: (gap?: Gap) => void;
  closeGapFill: () => void;
}

type FactItem = { label: string; value: string; sources: string; lifecycle: FactLifecycle; sensitive: boolean };
type FactSection = { category: string; emoji: string; color: string; bg: string; border: string; icon: any; facts: FactItem[] };

const sectionStyle: Record<string, { emoji: string; color: string; bg: string; border: string; icon: any }> = {
  product_identity:        { emoji: "🏷️", color: "text-glow-blue",   bg: "bg-glow-blue/10",   border: "border-glow-blue/20",   icon: Shield },
  value_proposition:       { emoji: "💎", color: "text-glow-purple", bg: "bg-glow-purple/10", border: "border-glow-purple/20", icon: Rocket },
  target_users:            { emoji: "🎯", color: "text-glow-amber",  bg: "bg-glow-amber/10",  border: "border-glow-amber/20",  icon: Target },
  use_cases:               { emoji: "🧩", color: "text-glow-cyan",   bg: "bg-glow-cyan/10",   border: "border-glow-cyan/20",   icon: Layers },
  features:                { emoji: "⚡", color: "text-glow-purple", bg: "bg-glow-purple/10", border: "border-glow-purple/20", icon: Sparkles },
  pricing:                 { emoji: "💰", color: "text-glow-pink",   bg: "bg-glow-pink/10",   border: "border-glow-pink/20",   icon: Shield },
  differentiation:         { emoji: "🏆", color: "text-glow-amber",  bg: "bg-glow-amber/10",  border: "border-glow-amber/20",  icon: Trophy },
  proof_assets:            { emoji: "📊", color: "text-glow-blue",   bg: "bg-glow-blue/10",   border: "border-glow-blue/20",   icon: BarChart3 },
  constraints_assumptions: { emoji: "🔒", color: "text-glow-pink",   bg: "bg-glow-pink/10",   border: "border-glow-pink/20",   icon: Shield },
};

const defaultStyle = { emoji: "📦", color: "text-glow-blue", bg: "bg-glow-blue/10", border: "border-glow-blue/20", icon: Layers };

function prettifyLabel(key: string): string {
  return key.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function isFactField(obj: any): boolean {
  return obj && typeof obj === "object" && "value" in obj && "sources" in obj;
}

function unwrapValue(field: any): any {
  if (field && typeof field === "object" && "value" in field) return field.value;
  return field;
}

function formatValue(val: any): string {
  if (val == null) return "";
  if (typeof val === "string") return val;
  if (Array.isArray(val)) {
    return val.map(item => typeof item === "string" ? item : (item?.name ?? JSON.stringify(item))).join(", ");
  }
  if (typeof val === "object") return JSON.stringify(val);
  return String(val);
}

function extractFactsFromObject(obj: any): FactItem[] {
  const facts: FactItem[] = [];
  if (!obj || typeof obj !== "object") return facts;
  for (const [key, field] of Object.entries(obj)) {
    if (!field || key === "tiers") continue;
    if (isFactField(field)) {
      const f = field as any;
      const val = formatValue(f.value);
      if (val) {
        facts.push({
          label: prettifyLabel(key),
          value: val,
          sources: (f.sources ?? []).map((s: any) => s.source_ref ?? s.type ?? "").filter(Boolean).join(", "),
          lifecycle: toLifecycle(f.lifecycle_status),
          sensitive: f.sensitive ?? false,
        });
      }
    }
  }
  return facts;
}

function extractArraySection(arr: any[], sectionName: string): FactItem[] {
  const facts: FactItem[] = [];
  arr.forEach((item, idx) => {
    const unwrappedItem = unwrapValue(item);
    if (!unwrappedItem || typeof unwrappedItem !== "object") return;
    const nameField = unwrappedItem.name;
    const itemLabel = isFactField(nameField) ? formatValue(nameField.value) : `${prettifyLabel(sectionName).replace(/s$/, "")} ${idx + 1}`;
    for (const [key, field] of Object.entries(unwrappedItem)) {
      if (!field || !isFactField(field)) continue;
      const f = field as any;
      const val = formatValue(f.value);
      if (!val) continue;
      facts.push({
        label: key === "name" ? itemLabel : `${itemLabel} — ${prettifyLabel(key)}`,
        value: val,
        sources: (f.sources ?? []).map((s: any) => s.source_ref ?? s.type ?? "").filter(Boolean).join(", "),
        lifecycle: toLifecycle(f.lifecycle_status),
        sensitive: f.sensitive ?? false,
      });
    }
  });
  return facts;
}

function getFacts(pkb: PKB | null): FactSection[] {
  if (!pkb) return [];
  const sections: FactSection[] = [];

  if (pkb.facts) {
    for (const [sectionKey, sectionData] of Object.entries(pkb.facts)) {
      if (!sectionData) continue;
      const style = sectionStyle[sectionKey] ?? defaultStyle;
      let facts: FactItem[] = [];

      // sectionData could be a raw array, a FactField wrapping an array, or an object
      const unwrapped = unwrapValue(sectionData);

      if (Array.isArray(unwrapped)) {
        // Array sections: features[], use_cases[]
        facts = extractArraySection(unwrapped, sectionKey);
      } else if (typeof sectionData === "object") {
        // Object sections: product_identity, pricing, etc.
        facts = extractFactsFromObject(sectionData);
        // Handle pricing.tiers specifically
        if (sectionKey === "pricing" && (sectionData as any).tiers) {
          const rawTiers = unwrapValue((sectionData as any).tiers);
          if (Array.isArray(rawTiers)) {
            rawTiers.forEach((tier: any) => {
              if (!tier) return;
              const t = unwrapValue(tier) ?? tier;
              const tierName = formatValue(unwrapValue(t.name) ?? t.name);
              const tierPrice = formatValue(unwrapValue(t.price) ?? t.price);
              const tierFeatures = unwrapValue(t.features) ?? t.features;
              const parts = [tierPrice];
              if (Array.isArray(tierFeatures) && tierFeatures.length) parts.push(tierFeatures.join(", "));
              facts.push({
                label: `Tier: ${tierName || "Unnamed"}`,
                value: parts.filter(Boolean).join(" — "),
                sources: "",
                lifecycle: "Asserted",
                sensitive: false,
              });
            });
          }
        }
      }

      if (facts.length) {
        sections.push({ category: prettifyLabel(sectionKey), ...style, facts });
      }
    }
  }

  // Walk extensions (b2b, b2c)
  if (pkb.extensions) {
    for (const [extKey, extData] of Object.entries(pkb.extensions)) {
      if (!extData || typeof extData !== "object") continue;
      const allFacts: FactItem[] = [];
      for (const [groupKey, groupData] of Object.entries(extData)) {
        if (!groupData || typeof groupData !== "object") continue;
        const unwrappedGroup = unwrapValue(groupData);
        if (unwrappedGroup && typeof unwrappedGroup === "object" && !Array.isArray(unwrappedGroup)) {
          const groupFacts = extractFactsFromObject(unwrappedGroup);
          allFacts.push(...groupFacts);
        }
      }
      if (allFacts.length) {
        sections.push({
          category: `${extKey.toUpperCase()} Extensions`,
          ...defaultStyle,
          facts: allFacts,
        });
      }
    }
  }

  return sections;
}

function getGaps(pkb: PKB | null): Gap[] {
  if (!pkb?.gaps) return [];
  return pkb.gaps.current ?? [];
}

const KnowledgeTab = ({ product, pkb, gapDialogOpen, selectedGap, openGapFill, closeGapFill }: KnowledgeTabProps) => {
  const [subTab, setSubTab] = useState<"summary" | "facts" | "gaps">("summary");
  const confidence = product.confidence_score ?? 0;
  const isHigh = confidence >= 70;
  const { minimal } = useMinimalMode();
  const [sensitiveRevealed, setSensitiveRevealed] = useState<string[]>([]);
  const queryClient = useQueryClient();

  const recheckMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/products/${product.id}/recheck-gaps`, {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/products", product.id] }),
  });

  const revealSensitive = (key: string) => setSensitiveRevealed((prev) => prev.includes(key) ? prev : [...prev, key]);

  const factSections = getFacts(pkb);
  const allGaps = getGaps(pkb);
  const criticalGaps = allGaps.filter((g) => g.severity === "critical");
  const importantGaps = allGaps.filter((g) => g.severity !== "critical");

  const updatedAt = product.updated_at ? new Date(String(product.updated_at)).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—";

  return (
    <div>
      <div className="flex gap-1 mb-8 glass-card p-1 w-fit">
        {(["summary", "facts", "gaps"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setSubTab(t)}
            className={`relative px-5 py-2 text-sm font-semibold capitalize rounded-lg transition-all ${
              subTab === t
                ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {subTab === "summary" && (
        <div className="space-y-5">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl p-7 relative overflow-hidden border border-border"
            style={{
              background: minimal
                ? "hsl(0 0% 7%)"
                : isHigh
                  ? "linear-gradient(135deg, hsl(173 80% 50% / 0.08), hsl(217 91% 60% / 0.06), hsl(265 89% 62% / 0.04))"
                  : "linear-gradient(135deg, hsl(0 72% 51% / 0.1), hsl(340 82% 60% / 0.06), hsl(265 89% 62% / 0.04))",
            }}
          >
            {!minimal && (
              <>
                <div className="absolute top-0 right-0 w-48 h-48 rounded-full opacity-20 blur-3xl" style={{ background: isHigh ? "hsl(173 80% 50%)" : "hsl(0 72% 51%)" }} />
                <div className="absolute bottom-0 left-1/3 w-32 h-32 rounded-full opacity-10 blur-3xl" style={{ background: "hsl(265 89% 62%)" }} />
              </>
            )}

            <div className="relative z-10 flex items-start justify-between">
              <div>
                <div className="flex items-center gap-3 mb-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-secondary border border-border">
                    <Globe className={`h-5 w-5 ${minimal ? "text-muted-foreground" : "text-glow-blue"}`} />
                  </div>
                  <div>
                    <h2 className="text-2xl font-extrabold text-foreground font-display">{product.name}</h2>
                    <p className="text-xs text-muted-foreground mt-0.5">Product Intelligence Overview</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap mt-4">
                  <span className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider ${
                    minimal ? "bg-secondary text-foreground border border-border" : "bg-glow-blue/10 text-glow-blue border border-glow-blue/20"
                  }`}>
                    <Layers className="h-3 w-3" /> {product.product_type?.toUpperCase() ?? "—"} · Product
                  </span>
                  <span className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-bold border ${
                    minimal
                      ? "bg-secondary text-foreground border-border"
                      : isHigh
                        ? "bg-glow-emerald/10 text-glow-emerald border-glow-emerald/20"
                        : confidence >= 40
                          ? "bg-glow-amber/10 text-glow-amber border-glow-amber/20"
                          : "bg-destructive/10 text-destructive border-destructive/20"
                  }`}>
                    <TrendingUp className="h-3 w-3" />
                    {isHigh ? "High" : confidence >= 40 ? "Medium" : "Low"} Confidence · {confidence}%
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Calendar className="h-3 w-3" /> Updated {updatedAt}
                  </span>
                </div>
              </div>

              <div className="hidden sm:flex flex-col items-center gap-1">
                <div className="relative h-20 w-20">
                  <svg className="h-20 w-20 -rotate-90" viewBox="0 0 80 80">
                    <circle cx="40" cy="40" r="34" fill="none" stroke="hsl(0 0% 14%)" strokeWidth="6" />
                    <circle cx="40" cy="40" r="34" fill="none"
                      stroke={minimal ? "hsl(0 0% 60%)" : isHigh ? "hsl(160 84% 44%)" : confidence >= 40 ? "hsl(38 92% 60%)" : "hsl(0 72% 51%)"}
                      strokeWidth="6" strokeLinecap="round"
                      strokeDasharray={`${confidence * 2.136} 213.6`}
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-lg font-extrabold text-foreground">{confidence}%</span>
                  </div>
                </div>
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Score</span>
              </div>
            </div>
          </motion.div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Facts", value: String(factSections.reduce((s, sec) => s + sec.facts.length, 0)), icon: Lightbulb, color: "text-glow-amber", bg: "bg-glow-amber/10" },
              { label: "Gaps", value: String(allGaps.length), icon: Target, color: "text-glow-pink", bg: "bg-glow-pink/10" },
              { label: "Personas", value: String(pkb?.personas?.length ?? 0), icon: Users, color: "text-glow-purple", bg: "bg-glow-purple/10" },
              { label: "ICPs", value: String(pkb?.icps?.length ?? 0), icon: Layers, color: "text-glow-blue", bg: "bg-glow-blue/10" },
            ].map((stat, i) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.08 + i * 0.04 }}
                className="glass-card p-4 flex items-center gap-3 hover:ring-1 hover:ring-border transition-all"
              >
                <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${minimal ? "bg-secondary" : stat.bg}`}>
                  <stat.icon className={`h-4 w-4 ${minimal ? "text-muted-foreground" : stat.color}`} />
                </div>
                <div>
                  <p className="text-xl font-extrabold text-foreground font-display">{stat.value}</p>
                  <p className="text-[11px] text-muted-foreground font-medium">{stat.label}</p>
                </div>
              </motion.div>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              {
                icon: Sparkles, color: "text-glow-purple", bg: "bg-glow-purple/10", border: "border-glow-purple/20",
                title: "What It Is",
                text: String(pkb?.facts?.value_proposition?.primary_problem?.value ?? (pkb?.derived_insights as any)?.product_brief?.simple_summary ?? pkb?.facts?.product_identity?.name?.value ?? "No description captured yet."),
                italic: !pkb?.facts?.value_proposition?.primary_problem?.value && !(pkb?.derived_insights as any)?.product_brief?.simple_summary,
                emoji: "🧩",
              },
              {
                icon: Users, color: "text-glow-cyan", bg: "bg-glow-cyan/10", border: "border-glow-cyan/20",
                title: "Who It's For",
                text: String(pkb?.facts?.target_users?.primary_users?.value ?? (pkb?.derived_insights as any)?.product_brief?.who_its_for ?? "No target users captured yet."),
                italic: !pkb?.facts?.target_users?.primary_users?.value && !(pkb?.derived_insights as any)?.product_brief?.who_its_for,
                emoji: "👥",
              },
              {
                icon: Trophy, color: "text-glow-amber", bg: "bg-glow-amber/10", border: "border-glow-amber/20",
                title: "Why It Wins",
                text: String(pkb?.facts?.differentiation?.why_we_win?.value ?? (pkb?.derived_insights as any)?.product_brief?.why_it_wins ?? "No differentiation captured yet."),
                italic: !pkb?.facts?.differentiation?.why_we_win?.value && !(pkb?.derived_insights as any)?.product_brief?.why_it_wins,
                emoji: "🏆",
              },
            ].map((card, i) => (
              <motion.div
                key={card.title}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 + i * 0.05 }}
                className={`glass-card p-5 hover:ring-1 hover:ring-border transition-all flex flex-col border ${minimal ? "border-border" : card.border}`}
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${minimal ? "bg-secondary" : card.bg}`}>
                    <card.icon className={`h-4 w-4 ${minimal ? "text-muted-foreground" : card.color}`} />
                  </div>
                  <h3 className="text-sm font-bold text-foreground">{card.title}</h3>
                  {!minimal && <span className="ml-auto text-lg">{card.emoji}</span>}
                </div>
                <p className={`text-sm text-muted-foreground leading-relaxed ${card.italic ? "italic" : ""}`}>{card.text}</p>
              </motion.div>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground/50 italic">These are AI-generated insights derived from your facts — not stored information. Improve them by adding or correcting facts through chat or document uploads.</p>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
            className="glass-card p-6 border border-border"
          >
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2.5">
                <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${minimal ? "bg-secondary" : "bg-glow-blue/10"}`}>
                  <BarChart3 className={`h-4 w-4 ${minimal ? "text-muted-foreground" : "text-glow-blue"}`} />
                </div>
                <h3 className="text-sm font-bold text-foreground">Knowledge Health</h3>
              </div>
              <span className="text-[11px] font-semibold text-muted-foreground bg-secondary px-2.5 py-1 rounded-md">
                {minimal ? (isHigh ? "Healthy" : "Needs attention") : (isHigh ? "✅ Healthy" : "⚠️ Needs attention")}
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {[
                { label: "Product Identity", filled: pkb?.facts?.product_identity ? 1 : 0, max: 2, color: "bg-glow-cyan", icon: Shield, emoji: "🛡️" },
                { label: "Value Proposition", filled: pkb?.facts?.value_proposition ? 2 : 0, max: 3, color: "bg-glow-purple", icon: Rocket, emoji: "🚀" },
                { label: "Target Users", filled: pkb?.facts?.target_users ? 1 : 0, max: 2, color: "bg-glow-amber", icon: Target, emoji: "🎯" },
              ].map((item) => (
                <div key={item.label} className="bg-secondary/40 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {!minimal && <span className="text-sm">{item.emoji}</span>}
                      <span className="text-sm text-foreground font-semibold">{item.label}</span>
                    </div>
                    <span className="text-xs font-extrabold text-foreground bg-secondary rounded-md px-2 py-0.5">{item.filled}/{item.max}</span>
                  </div>
                  <div className="h-2.5 w-full rounded-full bg-secondary overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${(item.filled / item.max) * 100}%` }}
                      transition={{ duration: 0.8, delay: 0.4 }}
                      className={`h-full rounded-full ${minimal ? "bg-foreground" : item.color}`}
                    />
                  </div>
                </div>
              ))}
            </div>
            {pkb?.meta.kb_health_narrative && (
              <p className="mt-4 text-xs text-muted-foreground leading-relaxed">
                {pkb.meta.kb_health_narrative}
              </p>
            )}
          </motion.div>

          {(pkb?.derived_insights as any)?.product_brief?.key_message_pillars?.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className={`glass-card p-5 border ${minimal ? "border-border" : "border-primary/20"}`}
            >
              <div className="flex items-center gap-3 mb-3">
                <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${minimal ? "bg-secondary" : "bg-primary/10"}`}>
                  <MessageSquare className={`h-4 w-4 ${minimal ? "text-muted-foreground" : "text-primary"}`} />
                </div>
                <h3 className="text-sm font-bold text-foreground">Key Message Pillars</h3>
              </div>
              <div className="flex flex-wrap gap-2">
                {((pkb?.derived_insights as any)?.product_brief?.key_message_pillars as string[]).map((pillar: string, index: number) => (
                  <span
                    key={index}
                    className={`inline-flex items-center rounded-lg px-3 py-1.5 text-xs font-semibold ${
                      minimal ? "bg-secondary text-foreground border border-border" : "bg-primary/10 text-primary border border-primary/20"
                    }`}
                  >
                    {pillar}
                  </span>
                ))}
              </div>
            </motion.div>
          )}

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.43 }}
            className={`glass-card p-5 border border-dashed ${minimal ? "border-border" : "border-glow-purple/20"}`}
          >
            <div className="flex items-center gap-3 mb-2">
              <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${minimal ? "bg-secondary" : "bg-glow-purple/10"}`}>
                <Megaphone className={`h-4 w-4 ${minimal ? "text-muted-foreground" : "text-glow-purple"}`} />
              </div>
              <h3 className="text-sm font-bold text-foreground">Sample Pitch</h3>
            </div>
            {(pkb?.derived_insights as any)?.product_brief?.sample_pitch ? (
              <p className="text-sm text-muted-foreground leading-relaxed italic pl-12">
                "{(pkb?.derived_insights as any)?.product_brief?.sample_pitch}"
              </p>
            ) : (
              <p className="text-xs text-muted-foreground/40 italic pl-12">
                A sample pitch will be generated once more product facts are captured.
              </p>
            )}
          </motion.div>
        </div>
      )}

      {subTab === "facts" && (
        <div className="space-y-5">
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${minimal ? "bg-secondary border border-border" : "bg-glow-cyan/10 border border-glow-cyan/20"}`}>
                <Lightbulb className={`h-5 w-5 ${minimal ? "text-muted-foreground" : "text-glow-cyan"}`} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-foreground font-display">Extracted Facts</h3>
                <p className="text-xs text-muted-foreground">{factSections.reduce((s, sec) => s + sec.facts.length, 0)} facts across {factSections.length} categories</p>
              </div>
            </div>
          </motion.div>

          {factSections.length === 0 && (
            <div className="glass-card p-10 text-center border border-border">
              <p className="text-sm text-muted-foreground italic">No facts extracted yet. Upload documents or start a chat to build the knowledge base.</p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {factSections.map((section, i) => (
              <motion.div
                key={section.category}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.08 + i * 0.06 }}
                className={`glass-card overflow-hidden border ${minimal ? "border-border" : section.border} flex flex-col`}
              >
                <div className="flex items-center gap-2.5 p-4 border-b border-border">
                  <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${minimal ? "bg-secondary" : section.bg}`}>
                    <section.icon className={`h-4 w-4 ${minimal ? "text-muted-foreground" : section.color}`} />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-sm font-bold text-foreground">{section.category}</h3>
                  </div>
                  {!minimal && <span className="text-sm">{section.emoji}</span>}
                  <span className="text-[10px] font-bold text-muted-foreground bg-secondary rounded-md px-2 py-0.5">{section.facts.length}</span>
                </div>
                <div className="p-4 space-y-4 flex-1">
                  {section.facts.map((fact) => {
                    const lc = lifecycleConfig[fact.lifecycle];
                    const isRevealed = sensitiveRevealed.includes(fact.label);
                    const isSensitive = fact.sensitive && !isRevealed;

                    return (
                      <div key={fact.label}>
                        <div className="flex items-center gap-2 mb-1">
                          <p className="text-xs font-bold text-foreground">{fact.label}</p>
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ring-1 ${
                            minimal ? "bg-secondary text-muted-foreground ring-border" : `${lc.bg} ${lc.color} ${lc.ring}`
                          }`}>
                            {fact.lifecycle}
                          </span>
                        </div>
                        {isSensitive ? (
                          <div className="flex items-center gap-2 mt-2">
                            <div className="flex-1 rounded-lg bg-secondary/60 ring-1 ring-border/50 px-3 py-2 flex items-center gap-2">
                              <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
                              <span className="text-xs text-muted-foreground italic">Sensitive — hidden pending approval</span>
                            </div>
                            <Button
                              size="sm"
                              onClick={() => revealSensitive(fact.label)}
                              className="h-7 px-2.5 text-[10px] font-bold rounded-lg bg-glow-amber/15 text-glow-amber hover:bg-glow-amber/25 border-0 gap-1"
                            >
                              <Eye className="h-3 w-3" /> Approve
                            </Button>
                          </div>
                        ) : (
                          <>
                            <p className="text-sm text-muted-foreground leading-relaxed">{fact.value || <span className="italic">Not captured</span>}</p>
                            {fact.sources && (
                              <div className="flex items-center gap-1.5 mt-2">
                                <Layers className="h-3 w-3 text-muted-foreground opacity-50" />
                                <p className="text-[10px] text-muted-foreground opacity-60">{fact.sources}</p>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {subTab === "gaps" && (
        <div className="space-y-5">
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${minimal ? "bg-secondary border border-border" : "bg-glow-pink/10 border border-glow-pink/20"}`}>
                <Target className={`h-5 w-5 ${minimal ? "text-muted-foreground" : "text-glow-pink"}`} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-foreground font-display">Knowledge Gaps</h3>
                <p className="text-xs text-muted-foreground">{allGaps.length} gaps to fill for better intelligence</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold text-muted-foreground bg-secondary px-3 py-1.5 rounded-lg">
                {minimal ? `${criticalGaps.length} critical · ${importantGaps.length} important` : `🔍 ${criticalGaps.length} critical · ${importantGaps.length} important`}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => recheckMutation.mutate()}
                disabled={recheckMutation.isPending}
                className="rounded-xl text-xs"
              >
                {recheckMutation.isPending ? "Checking..." : "Recheck"}
              </Button>
            </div>
          </motion.div>

          {allGaps.length === 0 && (
            <div className="glass-card p-10 text-center border border-border">
              <Check className="h-8 w-8 text-glow-emerald mx-auto mb-3" />
              <p className="text-sm font-bold text-foreground mb-1">No gaps detected!</p>
              <p className="text-xs text-muted-foreground">The knowledge base looks complete for now.</p>
            </div>
          )}

          {[
            { severity: "Critical", gaps: criticalGaps, color: "text-glow-pink", bg: "bg-glow-pink/10", border: "border-glow-pink/20", dotColor: "bg-glow-pink", emoji: "🚨" },
            { severity: "Important", gaps: importantGaps, color: "text-glow-amber", bg: "bg-glow-amber/10", border: "border-glow-amber/20", dotColor: "bg-glow-amber", emoji: "⚡" },
          ].map((group, gi) => {
            if (group.gaps.length === 0) return null;
            return (
              <motion.div key={group.severity} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 + gi * 0.1 }}>
                <div className="flex items-center gap-2.5 mb-3">
                  <div className={`h-2.5 w-2.5 rounded-full ${minimal ? "bg-muted-foreground" : group.dotColor}`} />
                  <span className={`text-sm font-bold ${minimal ? "text-foreground" : group.color}`}>
                    {!minimal && group.emoji} {group.severity}
                  </span>
                  <span className="text-[10px] font-bold text-muted-foreground bg-secondary rounded-md px-2 py-0.5">{group.gaps.length}</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {group.gaps.map((gap, i) => (
                    <motion.div
                      key={gap.field_path}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.12 + gi * 0.1 + i * 0.06 }}
                      className={`glass-card p-4 border ${minimal ? "border-border" : group.border} hover:ring-1 hover:ring-border transition-all cursor-pointer`}
                      onClick={() => openGapFill(gap)}
                    >
                      <p className="text-xs font-bold text-foreground mb-2">{gap.question ?? gap.field_path}</p>
                      <p className="text-[11px] text-muted-foreground leading-relaxed">{gap.why_needed ?? "Fill this gap to improve knowledge base accuracy."}</p>
                      <div className="mt-3 pt-2 border-t border-border/50 flex items-center justify-between">
                        <code className="text-[10px] text-muted-foreground/60 font-mono">{gap.field_path}</code>
                        <span className={`text-[10px] font-bold ${minimal ? "text-foreground" : "text-primary"}`}>Fill →</span>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

    </div>
  );
};

export default KnowledgeTab;
