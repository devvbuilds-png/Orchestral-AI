import { useState } from "react";
import { Sparkles, Users, Trophy, BarChart3, ChevronDown, Globe, Calendar, TrendingUp, Shield, Lightbulb, Target, Rocket, Layers, Eye, EyeOff, Check } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { useMinimalMode } from "@/contexts/MinimalModeContext";
import GapFillDialog from "@/components/GapFillDialog";

type FactLifecycle = "Asserted" | "Evidenced" | "Inferred" | "Disputed" | "Stale";

const lifecycleConfig: Record<FactLifecycle, { color: string; bg: string; ring: string }> = {
  Asserted: { color: "text-glow-blue", bg: "bg-glow-blue/10", ring: "ring-glow-blue/20" },
  Evidenced: { color: "text-glow-emerald", bg: "bg-glow-emerald/10", ring: "ring-glow-emerald/20" },
  Inferred: { color: "text-glow-amber", bg: "bg-glow-amber/10", ring: "ring-glow-amber/20" },
  Disputed: { color: "text-glow-pink", bg: "bg-glow-pink/10", ring: "ring-glow-pink/20" },
  Stale: { color: "text-muted-foreground", bg: "bg-secondary", ring: "ring-border" },
};

interface KnowledgeTabProps {
  productName: string;
  confidence: number;
}

const KnowledgeTab = ({ productName, confidence }: KnowledgeTabProps) => {
  const [subTab, setSubTab] = useState<"summary" | "facts" | "gaps">("summary");
  const isHigh = confidence >= 70;
  const { minimal } = useMinimalMode();
  const [gapDialogOpen, setGapDialogOpen] = useState(false);
  const [selectedGap, setSelectedGap] = useState<{ key: string; q: string; why: string; severity: string } | null>(null);
  const [sensitiveRevealed, setSensitiveRevealed] = useState<Set<string>>(new Set());

  const revealSensitive = (key: string) => {
    setSensitiveRevealed((prev) => new Set([...prev, key]));
  };

  const openGapFill = (gap: { key: string; q: string; why: string }, severity: string) => {
    setSelectedGap({ ...gap, severity });
    setGapDialogOpen(true);
  };

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
          {/* Hero header */}
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
                <div className="absolute top-0 right-0 w-48 h-48 rounded-full opacity-20 blur-3xl"
                  style={{ background: isHigh ? "hsl(173 80% 50%)" : "hsl(0 72% 51%)" }} />
                <div className="absolute bottom-0 left-1/3 w-32 h-32 rounded-full opacity-10 blur-3xl"
                  style={{ background: "hsl(265 89% 62%)" }} />
              </>
            )}

            <div className="relative z-10 flex items-start justify-between">
              <div>
                <div className="flex items-center gap-3 mb-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-secondary border border-border">
                    <Globe className={`h-5 w-5 ${minimal ? "text-muted-foreground" : "text-glow-blue"}`} />
                  </div>
                  <div>
                    <h2 className="text-2xl font-extrabold text-foreground font-display">{productName}</h2>
                    <p className="text-xs text-muted-foreground mt-0.5">Product Intelligence Overview</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap mt-4">
                  <span className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider ${
                    minimal ? "bg-secondary text-foreground border border-border" : "bg-glow-blue/10 text-glow-blue border border-glow-blue/20"
                  }`}>
                    <Layers className="h-3 w-3" /> B2B · SaaS
                  </span>
                  <span className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-bold border ${
                    minimal
                      ? "bg-secondary text-foreground border-border"
                      : isHigh
                        ? "bg-glow-emerald/10 text-glow-emerald border-glow-emerald/20"
                        : "bg-primary/10 text-primary border-primary/20"
                  }`}>
                    <TrendingUp className="h-3 w-3" />
                    {isHigh ? "High" : "Low"} Confidence · {confidence}%
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Calendar className="h-3 w-3" /> Updated 14 Mar 2026
                  </span>
                </div>
              </div>

              <div className="hidden sm:flex flex-col items-center gap-1">
                <div className="relative h-20 w-20">
                  <svg className="h-20 w-20 -rotate-90" viewBox="0 0 80 80">
                    <circle cx="40" cy="40" r="34" fill="none" stroke="hsl(0 0% 14%)" strokeWidth="6" />
                    <circle cx="40" cy="40" r="34" fill="none"
                      stroke={minimal ? "hsl(0 0% 60%)" : isHigh ? "hsl(160 84% 44%)" : "hsl(0 72% 51%)"}
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

          {/* Quick stats row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Facts", value: "4", icon: Lightbulb, color: "text-glow-amber", bg: "bg-glow-amber/10" },
              { label: "Gaps", value: "4", icon: Target, color: "text-glow-pink", bg: "bg-glow-pink/10" },
              { label: "Sources", value: "8", icon: Layers, color: "text-glow-blue", bg: "bg-glow-blue/10" },
              { label: "Personas", value: "3", icon: Users, color: "text-glow-purple", bg: "bg-glow-purple/10" },
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

          {/* Info cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              {
                icon: Sparkles, color: "text-glow-purple", bg: "bg-glow-purple/10", border: "border-glow-purple/20",
                title: "What It Is",
                text: "Difficulty in collaborating and streamlining communication across large, cross-functional teams.",
                emoji: "🧩"
              },
              {
                icon: Users, color: "text-glow-cyan", bg: "bg-glow-cyan/10", border: "border-glow-cyan/20",
                title: "Who It's For",
                text: "Product teams, startups, engineers looking for seamless workflows.",
                emoji: "👥"
              },
              {
                icon: Trophy, color: "text-glow-amber", bg: "bg-glow-amber/10", border: "border-glow-amber/20",
                title: "Why It Wins",
                text: "No differentiation captured yet.",
                italic: true,
                emoji: "🏆"
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
                  <div>
                    <h3 className="text-sm font-bold text-foreground">{card.title}</h3>
                  </div>
                  {!minimal && <span className="ml-auto text-lg">{card.emoji}</span>}
                </div>
                <p className={`text-sm text-muted-foreground leading-relaxed ${card.italic ? "italic" : ""}`}>{card.text}</p>
              </motion.div>
            ))}
          </div>

          {/* Knowledge Health */}
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
                { label: "Product Identity", score: 1, max: 2, color: "bg-glow-cyan", icon: Shield, emoji: "🛡️" },
                { label: "Value Proposition", score: 2, max: 3, color: "bg-glow-purple", icon: Rocket, emoji: "🚀" },
                { label: "Target Users", score: 1, max: 2, color: "bg-glow-amber", icon: Target, emoji: "🎯" },
              ].map((item) => (
                <div key={item.label} className="bg-secondary/40 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {!minimal && <span className="text-sm">{item.emoji}</span>}
                      <span className="text-sm text-foreground font-semibold">{item.label}</span>
                    </div>
                    <span className="text-xs font-extrabold text-foreground bg-secondary rounded-md px-2 py-0.5">{item.score}/{item.max}</span>
                  </div>
                  <div className="h-2.5 w-full rounded-full bg-secondary overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${(item.score / item.max) * 100}%` }}
                      transition={{ duration: 0.8, delay: 0.4 }}
                      className={`h-full rounded-full ${minimal ? "bg-foreground" : item.color}`}
                    />
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      )}

      {subTab === "facts" && (
        <div className="space-y-5">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center justify-between"
          >
            <div className="flex items-center gap-3">
              <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${minimal ? "bg-secondary border border-border" : "bg-glow-cyan/10 border border-glow-cyan/20"}`}>
                <Lightbulb className={`h-5 w-5 ${minimal ? "text-muted-foreground" : "text-glow-cyan"}`} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-foreground font-display">Extracted Facts</h3>
                <p className="text-xs text-muted-foreground">4 facts across 3 categories</p>
              </div>
            </div>
            <span className="text-[11px] font-semibold text-muted-foreground bg-secondary px-3 py-1.5 rounded-lg">
              {minimal ? "8 total sources" : "📚 8 total sources"}
            </span>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              {
                title: "Product Identity", count: 1, emoji: "🏷️",
                color: "text-glow-blue", bg: "bg-glow-blue/10", border: "border-glow-blue/20",
                icon: Shield,
                facts: [{ label: "Name", value: productName, sources: "3 sources", lifecycle: "Evidenced" as FactLifecycle, sensitive: false }],
              },
              {
                title: "Value Proposition", count: 2, emoji: "💎",
                color: "text-glow-purple", bg: "bg-glow-purple/10", border: "border-glow-purple/20",
                icon: Rocket,
                facts: [
                  { label: "Top Benefits", value: "Keep everything organized, write better notes, work faster, augment creativity", sources: "2 sources", lifecycle: "Asserted" as FactLifecycle, sensitive: false },
                  { label: "Primary Problem", value: "Difficulty collaborating across large, cross-functional teams.", sources: "1 source", lifecycle: "Inferred" as FactLifecycle, sensitive: false },
                ],
              },
              {
                title: "Target Users", count: 1, emoji: "🎯",
                color: "text-glow-amber", bg: "bg-glow-amber/10", border: "border-glow-amber/20",
                icon: Target,
                facts: [{ label: "Primary Users", value: "Product teams, startups, engineers", sources: "2 sources", lifecycle: "Evidenced" as FactLifecycle, sensitive: false }],
              },
              {
                title: "Financials", count: 1, emoji: "💰",
                color: "text-glow-pink", bg: "bg-glow-pink/10", border: "border-glow-pink/20",
                icon: Shield,
                facts: [{ label: "Revenue (ARR)", value: "$12.4M ARR as of Q3 2025", sources: "1 source", lifecycle: "Asserted" as FactLifecycle, sensitive: true }],
              },
            ].map((section, i) => (
              <motion.div
                key={section.title}
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
                    <h3 className="text-sm font-bold text-foreground">{section.title}</h3>
                  </div>
                  {!minimal && <span className="text-sm">{section.emoji}</span>}
                  <span className="text-[10px] font-bold text-muted-foreground bg-secondary rounded-md px-2 py-0.5">{section.count}</span>
                </div>
                <div className="p-4 space-y-4 flex-1">
                  {section.facts.map((fact) => {
                    const lc = lifecycleConfig[fact.lifecycle];
                    const isRevealed = sensitiveRevealed.has(fact.label);
                    const isSensitive = fact.sensitive && !isRevealed;

                    return (
                      <div key={fact.label}>
                        <div className="flex items-center gap-2 mb-1">
                          <p className="text-xs font-bold text-foreground">{fact.label}</p>
                          {/* Lifecycle badge */}
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
                            <p className="text-sm text-muted-foreground leading-relaxed">{fact.value}</p>
                            <div className="flex items-center gap-1.5 mt-2">
                              <Layers className="h-3 w-3 text-muted-foreground opacity-50" />
                              <p className="text-[10px] text-muted-foreground opacity-60">{fact.sources}</p>
                            </div>
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
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center justify-between"
          >
            <div className="flex items-center gap-3">
              <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${minimal ? "bg-secondary border border-border" : "bg-glow-pink/10 border border-glow-pink/20"}`}>
                <Target className={`h-5 w-5 ${minimal ? "text-muted-foreground" : "text-glow-pink"}`} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-foreground font-display">Knowledge Gaps</h3>
                <p className="text-xs text-muted-foreground">4 gaps to fill for better intelligence</p>
              </div>
            </div>
            <span className="text-[11px] font-semibold text-muted-foreground bg-secondary px-3 py-1.5 rounded-lg">
              {minimal ? "2 critical · 2 important" : "🔍 2 critical · 2 important"}
            </span>
          </motion.div>

          {[
            {
              severity: "Critical",
              count: 2,
              emoji: "🚨",
              color: "text-glow-pink", bg: "bg-glow-pink/10", border: "border-glow-pink/20",
              dotColor: "bg-glow-pink",
              gaps: [
                { key: "extensions.b2b.org_fit", q: "What company sizes and industries benefit most?", why: "Understanding the target market helps tailor marketing." },
                { key: "extensions.b2b.buyer_personas", q: "Who are the main decision makers?", why: "Crucial for effective sales strategies." },
              ],
            },
            {
              severity: "Important",
              count: 2,
              emoji: "⚡",
              color: "text-glow-amber", bg: "bg-glow-amber/10", border: "border-glow-amber/20",
              dotColor: "bg-glow-amber",
              gaps: [
                { key: "extensions.b2b.sales_cycle", q: "What's the typical enterprise sales cycle?", why: "Helps forecast revenue and align resources." },
                { key: "extensions.b2b.integrations", q: "What tools does it integrate with?", why: "Critical for leveraging existing tech environments." },
              ],
            },
          ].map((group, gi) => (
            <motion.div key={group.severity} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 + gi * 0.1 }}>
              <div className="flex items-center gap-2.5 mb-3">
                <div className={`h-2.5 w-2.5 rounded-full ${minimal ? "bg-muted-foreground" : group.dotColor}`} />
                <span className={`text-sm font-bold ${minimal ? "text-foreground" : group.color}`}>
                  {!minimal && group.emoji} {group.severity}
                </span>
                <span className="text-[10px] font-bold text-muted-foreground bg-secondary rounded-md px-2 py-0.5">{group.count}</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {group.gaps.map((gap, i) => (
                  <motion.div
                    key={gap.key}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.12 + gi * 0.1 + i * 0.06 }}
                    className={`glass-card p-4 border ${minimal ? "border-border" : group.border} hover:ring-1 hover:ring-border transition-all cursor-pointer`}
                    onClick={() => openGapFill(gap, group.severity)}
                  >
                    <p className="text-xs font-bold text-foreground mb-2">{gap.q}</p>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">{gap.why}</p>
                    <div className="mt-3 pt-2 border-t border-border/50 flex items-center justify-between">
                      <code className="text-[10px] text-muted-foreground/60 font-mono">{gap.key}</code>
                      <span className={`text-[10px] font-bold ${minimal ? "text-foreground" : "text-primary"}`}>Fill →</span>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          ))}
        </div>
      )}

      <GapFillDialog
        open={gapDialogOpen}
        onClose={() => { setGapDialogOpen(false); setSelectedGap(null); }}
        gap={selectedGap}
      />
    </div>
  );
};

export default KnowledgeTab;
