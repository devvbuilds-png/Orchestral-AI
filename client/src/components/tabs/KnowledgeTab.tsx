import { useState } from "react";
import { Sparkles, Users, Trophy, BarChart3, ChevronDown, Globe, Calendar, TrendingUp, Shield, Lightbulb, Target, Rocket, Layers, Eye, EyeOff, Check } from "lucide-react";
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

function getFacts(pkb: PKB | null): Array<{ category: string; emoji: string; color: string; bg: string; border: string; icon: any; facts: Array<{ label: string; value: string; sources: string; lifecycle: FactLifecycle; sensitive: boolean }> }> {
  if (!pkb) return [];
  const sections = [];

  if (pkb.facts?.product_identity) {
    const facts = [];
    const pi = pkb.facts.product_identity;
    if (pi.name) facts.push({ label: "Name", value: String(pi.name.value ?? ""), sources: "", lifecycle: toLifecycle(pi.name.lifecycle_status), sensitive: false });
    if (pi.category) facts.push({ label: "Category", value: String(pi.category.value ?? ""), sources: "", lifecycle: toLifecycle(pi.category.lifecycle_status), sensitive: false });
    if (pi.one_liner) facts.push({ label: "One-liner", value: String(pi.one_liner.value ?? ""), sources: "", lifecycle: toLifecycle(pi.one_liner.lifecycle_status), sensitive: false });
    if (facts.length) sections.push({ category: "Product Identity", emoji: "🏷️", color: "text-glow-blue", bg: "bg-glow-blue/10", border: "border-glow-blue/20", icon: Shield, facts });
  }

  if (pkb.facts?.value_proposition) {
    const facts = [];
    const vp = pkb.facts.value_proposition;
    if (vp.primary_problem) facts.push({ label: "Primary Problem", value: String(vp.primary_problem.value ?? ""), sources: "", lifecycle: toLifecycle(vp.primary_problem.lifecycle_status), sensitive: false });
    if (vp.top_benefits) facts.push({ label: "Top Benefits", value: String(vp.top_benefits.value ?? ""), sources: "", lifecycle: toLifecycle(vp.top_benefits.lifecycle_status), sensitive: false });
    if (facts.length) sections.push({ category: "Value Proposition", emoji: "💎", color: "text-glow-purple", bg: "bg-glow-purple/10", border: "border-glow-purple/20", icon: Rocket, facts });
  }

  if (pkb.facts?.target_users) {
    const facts = [];
    const tu = pkb.facts.target_users;
    if (tu.primary_users) facts.push({ label: "Primary Users", value: String(tu.primary_users.value ?? ""), sources: "", lifecycle: toLifecycle(tu.primary_users.lifecycle_status), sensitive: false });
    if (tu.secondary_users) facts.push({ label: "Secondary Users", value: String(tu.secondary_users.value ?? ""), sources: "", lifecycle: toLifecycle(tu.secondary_users.lifecycle_status), sensitive: false });
    if (facts.length) sections.push({ category: "Target Users", emoji: "🎯", color: "text-glow-amber", bg: "bg-glow-amber/10", border: "border-glow-amber/20", icon: Target, facts });
  }

  if (pkb.facts?.pricing) {
    const facts = [];
    const pricing = pkb.facts.pricing;
    if (pricing.model) facts.push({ label: "Pricing Model", value: String(pricing.model.value ?? ""), sources: "", lifecycle: toLifecycle(pricing.model.lifecycle_status), sensitive: pricing.model.sensitive ?? false });
    if (pricing.range_notes) facts.push({ label: "Pricing Notes", value: String(pricing.range_notes.value ?? ""), sources: "", lifecycle: toLifecycle(pricing.range_notes.lifecycle_status), sensitive: pricing.range_notes.sensitive ?? false });
    if (facts.length) sections.push({ category: "Pricing", emoji: "💰", color: "text-glow-pink", bg: "bg-glow-pink/10", border: "border-glow-pink/20", icon: Shield, facts });
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
                text: String(pkb?.facts?.value_proposition?.primary_problem?.value ?? pkb?.facts?.product_identity?.name?.value ?? "No description captured yet."),
                italic: !pkb?.facts?.value_proposition?.primary_problem?.value,
                emoji: "🧩",
              },
              {
                icon: Users, color: "text-glow-cyan", bg: "bg-glow-cyan/10", border: "border-glow-cyan/20",
                title: "Who It's For",
                text: String(pkb?.facts?.target_users?.primary_users?.value ?? "No target users captured yet."),
                italic: !pkb?.facts?.target_users?.primary_users?.value,
                emoji: "👥",
              },
              {
                icon: Trophy, color: "text-glow-amber", bg: "bg-glow-amber/10", border: "border-glow-amber/20",
                title: "Why It Wins",
                text: String(pkb?.facts?.differentiation?.why_we_win?.value ?? "No differentiation captured yet."),
                italic: !pkb?.facts?.differentiation?.why_we_win?.value,
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
