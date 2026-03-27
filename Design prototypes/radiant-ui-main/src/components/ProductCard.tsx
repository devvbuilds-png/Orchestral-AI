import { Link } from "react-router-dom";
import { useState } from "react";
import { ArrowRight, AlertCircle, TrendingUp, FileText, ChevronDown } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useMinimalMode } from "@/contexts/MinimalModeContext";

interface ProductCardProps {
  id: string;
  name: string;
  segment: string;
  category: string;
  confidence: number;
  facts: number;
  currentState: string;
  lastActive: string;
  conflicts: number;
  index: number;
}

const stateColors: Record<string, { bg: string; text: string; dot: string }> = {
  Active: { bg: "bg-glow-emerald/15", text: "text-glow-emerald", dot: "bg-glow-emerald" },
  Onboarding: { bg: "bg-glow-amber/15", text: "text-glow-amber", dot: "bg-glow-amber" },
  New: { bg: "bg-glow-blue/15", text: "text-glow-blue", dot: "bg-glow-blue" },
};

const stateColorsMinimal: Record<string, { bg: string; text: string; dot: string }> = {
  Active: { bg: "bg-secondary", text: "text-foreground", dot: "bg-foreground" },
  Onboarding: { bg: "bg-secondary", text: "text-muted-foreground", dot: "bg-muted-foreground" },
  New: { bg: "bg-secondary", text: "text-muted-foreground", dot: "bg-muted-foreground" },
};

const productEmojis: Record<string, string> = {
  Notion: "📝",
  Slack: "💬",
  Figma: "🎨",
  Linear: "⚡",
};

const ProductCard = ({ id, name, segment, category, confidence, facts, currentState, lastActive, conflicts, index }: ProductCardProps) => {
  const { minimal } = useMinimalMode();
  const [expanded, setExpanded] = useState(false);
  const state = minimal ? (stateColorsMinimal[currentState] || stateColorsMinimal.Active) : (stateColors[currentState] || stateColors.Active);
  const emoji = productEmojis[name] || "📦";

  const confidenceColor = minimal
    ? "text-foreground"
    : confidence >= 70 ? "text-glow-emerald" : confidence >= 40 ? "text-glow-amber" : "text-primary";

  const barColor = minimal
    ? "bg-foreground"
    : confidence >= 70 ? "bg-glow-emerald" : confidence >= 40 ? "bg-glow-amber" : "bg-primary";

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.06, ease: [0.25, 0.46, 0.45, 0.94] }}
    >
      <div className="group relative rounded-2xl bg-card ring-1 ring-border hover:ring-primary/40 transition-all duration-200 shadow-sm hover:shadow-md">
        {/* Collapsed header — always visible */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full p-5 cursor-pointer text-center"
        >
          <div className="flex items-center justify-between mb-1">
            <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full ${state.bg} ${state.text} ring-1 ring-current/20`}>
              <span className={`h-1.5 w-1.5 rounded-full ${state.dot}`} />
              {currentState}
            </span>
            <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-200 shrink-0 ${expanded ? "rotate-180" : ""}`} />
          </div>

          <h3 className="font-heading text-2xl font-bold text-foreground tracking-tight my-3">{name}</h3>

          <div className="flex items-center justify-center gap-2 mb-3">
            <span className={`text-sm font-extrabold ${confidenceColor}`}>{confidence}%</span>
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">confidence</span>
          </div>

          <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
            <motion.div
              className={`h-full rounded-full ${barColor}`}
              initial={{ width: 0 }}
              animate={{ width: `${confidence}%` }}
              transition={{ duration: 0.8, ease: "easeOut", delay: index * 0.06 + 0.2 }}
            />
          </div>
        </button>

        {/* Expanded content */}
        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: "easeInOut" }}
              className="overflow-hidden"
            >
              <div className="px-4 pb-4 pt-1 border-t border-border/50">
                {/* Segment & category */}
                <div className="flex items-center gap-1.5 mb-4 mt-3">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-secondary text-foreground">{segment}</span>
                  <span className="text-[10px] font-medium text-muted-foreground">{category}</span>
                </div>

                {/* Stats row */}
                <div className="grid grid-cols-2 gap-2.5 mb-3">
                  <div className="rounded-xl bg-card/50 ring-1 ring-border/30 p-3">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <FileText className={`h-3.5 w-3.5 ${minimal ? "text-muted-foreground" : "text-glow-amber"}`} />
                      <span className="text-lg font-extrabold text-foreground">{facts}</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground font-medium">Facts</p>
                  </div>
                  <div className="rounded-xl bg-card/50 ring-1 ring-border/30 p-3">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <TrendingUp className={`h-3.5 w-3.5 ${minimal ? "text-muted-foreground" : "text-glow-cyan"}`} />
                      <span className="text-lg font-extrabold text-foreground">{lastActive}</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground font-medium">Last Active</p>
                  </div>
                </div>

                {/* Conflicts */}
                {conflicts > 0 && (
                  <div className={`flex items-center gap-2 rounded-xl px-3.5 py-2.5 mb-3 text-sm font-semibold ${
                    minimal ? "bg-secondary ring-1 ring-border text-foreground" : "bg-primary/8 ring-1 ring-primary/15 text-primary"
                  }`}>
                    <AlertCircle className="h-4 w-4" />
                    {conflicts} conflict{conflicts > 1 ? "s" : ""} need review
                  </div>
                )}

                {/* Footer */}
                <Link
                  to={`/product/${id}`}
                  className="flex items-center justify-end pt-2 border-t border-border/50"
                >
                  <div className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground hover:text-primary transition-colors">
                    Open
                    <ArrowRight className="h-3.5 w-3.5 transition-transform hover:translate-x-0.5" />
                  </div>
                </Link>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};

export default ProductCard;
