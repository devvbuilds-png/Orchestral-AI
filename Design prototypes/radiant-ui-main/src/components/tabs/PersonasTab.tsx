import { useState } from "react";
import { Users, Target, Sparkles, TrendingUp, UserCheck, Building2, Ghost, Plus } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { useMinimalMode } from "@/contexts/MinimalModeContext";

interface Persona {
  name: string;
  type: "User" | "Buyer" | "Admin";
  inferred: boolean;
  confidence: number;
  goals: string[];
  pains: string[];
  evidenceSources: number;
  emoji: string;
  color: "cyan" | "purple" | "pink" | "amber" | "emerald" | "blue";
}

interface ICP {
  segment: string;
  inferred: boolean;
  confidence: number;
  companySize: string;
  industry: string;
  emoji: string;
  color: "blue" | "purple" | "pink" | "amber";
}

const colorMap = {
  cyan: { bg: "bg-glow-cyan/10", ring: "ring-glow-cyan/20", text: "text-glow-cyan", border: "border-l-glow-cyan", bar: "bg-glow-cyan" },
  purple: { bg: "bg-glow-purple/10", ring: "ring-glow-purple/20", text: "text-glow-purple", border: "border-l-glow-purple", bar: "bg-glow-purple" },
  pink: { bg: "bg-glow-pink/10", ring: "ring-glow-pink/20", text: "text-glow-pink", border: "border-l-glow-pink", bar: "bg-glow-pink" },
  amber: { bg: "bg-glow-amber/10", ring: "ring-glow-amber/20", text: "text-glow-amber", border: "border-l-glow-amber", bar: "bg-glow-amber" },
  emerald: { bg: "bg-glow-emerald/10", ring: "ring-glow-emerald/20", text: "text-glow-emerald", border: "border-l-glow-emerald", bar: "bg-glow-emerald" },
  blue: { bg: "bg-glow-blue/10", ring: "ring-glow-blue/20", text: "text-glow-blue", border: "border-l-glow-blue", bar: "bg-glow-blue" },
};

const minimalColorMap = {
  cyan: { bg: "bg-secondary", ring: "ring-border", text: "text-muted-foreground", border: "border-l-border", bar: "bg-foreground" },
  purple: { bg: "bg-secondary", ring: "ring-border", text: "text-muted-foreground", border: "border-l-border", bar: "bg-foreground" },
  pink: { bg: "bg-secondary", ring: "ring-border", text: "text-muted-foreground", border: "border-l-border", bar: "bg-foreground" },
  amber: { bg: "bg-secondary", ring: "ring-border", text: "text-muted-foreground", border: "border-l-border", bar: "bg-foreground" },
  emerald: { bg: "bg-secondary", ring: "ring-border", text: "text-muted-foreground", border: "border-l-border", bar: "bg-foreground" },
  blue: { bg: "bg-secondary", ring: "ring-border", text: "text-muted-foreground", border: "border-l-border", bar: "bg-foreground" },
};

const samplePersonas: Persona[] = [
  {
    name: "Project Manager",
    type: "User",
    inferred: true,
    confidence: 70,
    goals: ["Create a project management system", "Increase team productivity"],
    pains: ["Scattered company information"],
    evidenceSources: 1,
    emoji: "👔",
    color: "cyan",
  },
  {
    name: "Engineer",
    type: "User",
    inferred: true,
    confidence: 60,
    goals: ["Enhance productivity and work efficiency"],
    pains: ["Need better organization of information"],
    evidenceSources: 1,
    emoji: "⚙️",
    color: "purple",
  },
  {
    name: "Designer",
    type: "User",
    inferred: true,
    confidence: 60,
    goals: ["Use organized knowledge for creative tasks"],
    pains: ["Scattered information affecting creative processes"],
    evidenceSources: 1,
    emoji: "🎨",
    color: "pink",
  },
];

const sampleICPs: ICP[] = [
  {
    segment: "B2B",
    inferred: true,
    confidence: 50,
    companySize: "Medium, Large",
    industry: "Technology, SaaS",
    emoji: "🏢",
    color: "blue",
  },
];

const PersonasTab = () => {
  const [showFilled] = useState(true);
  const { minimal } = useMinimalMode();

  const personas = showFilled ? samplePersonas : [];
  const icps = showFilled ? sampleICPs : [];
  const cMap = minimal ? minimalColorMap : colorMap;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="w-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${minimal ? "bg-secondary ring-1 ring-border" : "bg-glow-cyan/10 ring-1 ring-glow-cyan/20"}`}>
            <Users className={`h-5 w-5 ${minimal ? "text-muted-foreground" : "text-glow-cyan"}`} />
          </div>
          <div>
            <h2 className="text-lg font-extrabold text-foreground">Personas</h2>
            <p className="text-xs text-muted-foreground">User archetypes extracted from your sources</p>
          </div>
        </div>
        {personas.length > 0 && (
          <div className="flex items-center gap-2">
            <span className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full ring-1 ${
              minimal ? "text-foreground bg-secondary ring-border" : "text-glow-emerald bg-glow-emerald/10 ring-glow-emerald/20"
            }`}>
              {!minimal && <span className="h-1.5 w-1.5 rounded-full bg-glow-emerald animate-pulse" />}
              Active ({personas.length})
            </span>
          </div>
        )}
      </div>

      {/* Personas */}
      {personas.length > 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-8">
          {personas.map((persona, i) => {
            const c = cMap[persona.color];
            return (
              <motion.div
                key={persona.name}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.08 }}
                className={`group relative rounded-2xl bg-secondary/40 ring-1 ring-border/50 p-5 border-l-[3px] ${c.border} hover:ring-border transition-all`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2.5">
                    {!minimal && <span className="text-2xl">{persona.emoji}</span>}
                    <div>
                      <h3 className="text-sm font-extrabold text-foreground">{persona.name}</h3>
                      <div className="flex items-center gap-1.5 mt-1">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-secondary text-foreground">{persona.type}</span>
                        {persona.inferred && (
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${c.bg} ${c.text} ring-1 ${c.ring}`}>
                            Inferred
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-extrabold text-foreground">{persona.confidence}%</span>
                    <div className="w-20 h-1.5 rounded-full bg-muted mt-1 overflow-hidden">
                      <div className={`h-full rounded-full ${c.bar}`} style={{ width: `${persona.confidence}%` }} />
                    </div>
                  </div>
                </div>

                <div className="mb-2.5">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Goals</p>
                  {persona.goals.map((g) => (
                    <p key={g} className="text-xs text-secondary-foreground flex items-start gap-1.5 mb-0.5">
                      <TrendingUp className={`h-3 w-3 ${minimal ? "text-muted-foreground" : colorMap[persona.color].text} mt-0.5 shrink-0`} />
                      {g}
                    </p>
                  ))}
                </div>

                <div className="mb-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Pains</p>
                  {persona.pains.map((p) => (
                    <p key={p} className="text-xs text-secondary-foreground flex items-start gap-1.5 mb-0.5">
                      <span className="text-primary mt-0.5 shrink-0">•</span>
                      {p}
                    </p>
                  ))}
                </div>

                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  <UserCheck className="h-3 w-3" />
                  {persona.evidenceSources} evidence source{persona.evidenceSources > 1 ? "s" : ""}
                </div>
              </motion.div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-2xl bg-secondary/30 ring-1 ring-border/40 p-10 text-center mb-8">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-secondary mx-auto mb-4">
            <Ghost className="h-7 w-7 text-muted-foreground" />
          </div>
          <p className="text-sm font-bold text-foreground mb-1">No personas yet</p>
          <p className="text-xs text-muted-foreground mb-4">Personas are automatically inferred when you add documents or URLs.</p>
          <Button variant="outline" size="sm" className="rounded-xl gap-1.5 border-muted hover:border-primary/40">
            <Plus className="h-3.5 w-3.5" /> Add Sources to Begin
          </Button>
        </div>
      )}

      <Separator className="mb-6 bg-border/50" />

      {/* ICP Section */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${minimal ? "bg-secondary ring-1 ring-border" : "bg-glow-blue/10 ring-1 ring-glow-blue/20"}`}>
            <Target className={`h-5 w-5 ${minimal ? "text-muted-foreground" : "text-glow-blue"}`} />
          </div>
          <div>
            <h3 className="text-base font-extrabold text-foreground">Ideal Customer Profiles</h3>
            <p className="text-xs text-muted-foreground">Target segments derived from your product data</p>
          </div>
        </div>
      </div>

      {icps.length > 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {icps.map((icp, i) => {
            const c = cMap[icp.color];
            return (
              <motion.div
                key={icp.segment}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.08 }}
                className={`group relative rounded-2xl bg-secondary/40 ring-1 ring-border/50 p-5 border-l-[3px] ${c.border} hover:ring-border transition-all`}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-2.5">
                    {!minimal && <span className="text-2xl">{icp.emoji}</span>}
                    <div>
                      <h4 className="text-sm font-extrabold text-foreground">{icp.segment}</h4>
                      <div className="flex items-center gap-1.5 mt-1">
                        {icp.inferred && (
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${c.bg} ${c.text} ring-1 ${c.ring}`}>
                            Inferred
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-extrabold text-foreground">{icp.confidence}%</span>
                    <div className="w-20 h-1.5 rounded-full bg-muted mt-1 overflow-hidden">
                      <div className={`h-full rounded-full ${c.bar}`} style={{ width: `${icp.confidence}%` }} />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl bg-card/50 ring-1 ring-border/30 p-3">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Building2 className={`h-3 w-3 ${minimal ? "text-muted-foreground" : colorMap[icp.color].text}`} />
                      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Company Size</p>
                    </div>
                    <p className="text-xs font-semibold text-foreground">{icp.companySize}</p>
                  </div>
                  <div className="rounded-xl bg-card/50 ring-1 ring-border/30 p-3">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Sparkles className={`h-3 w-3 ${minimal ? "text-muted-foreground" : colorMap[icp.color].text}`} />
                      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Industry</p>
                    </div>
                    <p className="text-xs font-semibold text-foreground">{icp.industry}</p>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-2xl bg-secondary/30 ring-1 ring-border/40 p-10 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-secondary mx-auto mb-4">
            <Target className="h-7 w-7 text-muted-foreground" />
          </div>
          <p className="text-sm font-bold text-foreground mb-1">No ICPs yet</p>
          <p className="text-xs text-muted-foreground">ICPs are inferred alongside personas after processing your sources.</p>
        </div>
      )}
    </motion.div>
  );
};

export default PersonasTab;
