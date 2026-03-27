import { useState } from "react";
import { ArrowRight, AlertCircle, TrendingUp, FileText, ChevronDown } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useMinimalMode } from "@/contexts/MinimalModeContext";
import { Link } from "wouter";
import type { Product } from "@shared/schema";

interface ProductCardProps {
  product: Product;
  index: number;
  lastActive?: string;
  factCount?: number;
  conflictCount?: number;
}

function getStateCfg(state: string, minimal: boolean) {
  const dark = {
    ready:              { bg: "bg-glow-emerald/15", text: "text-glow-emerald", dot: "bg-glow-emerald", label: "Active" },
    learning:           { bg: "bg-glow-blue/15",    text: "text-glow-blue",    dot: "bg-glow-blue",    label: "Learning" },
    onboarding:         { bg: "bg-glow-amber/15",   text: "text-glow-amber",   dot: "bg-glow-amber",   label: "Onboarding" },
    persona_extraction: { bg: "bg-glow-purple/15",  text: "text-glow-purple",  dot: "bg-glow-purple",  label: "Extracting" },
    founder_review:     { bg: "bg-glow-pink/15",    text: "text-glow-pink",    dot: "bg-glow-pink",    label: "Needs review" },
    product_type_selection: { bg: "bg-secondary",   text: "text-muted-foreground", dot: "bg-muted-foreground", label: "New" },
    gap_interview:      { bg: "bg-glow-blue/15",    text: "text-glow-blue",    dot: "bg-glow-blue",    label: "Learning" },
  } as Record<string, { bg: string; text: string; dot: string; label: string }>;

  const minimalMap = Object.fromEntries(
    Object.entries(dark).map(([k, v]) => [k, { ...v, bg: "bg-secondary", text: "text-muted-foreground", dot: "bg-muted-foreground" }])
  );

  const map = minimal ? minimalMap : dark;
  return map[state] ?? map.learning;
}

const ProductCard = ({ product, index, lastActive = "—", factCount = 0, conflictCount = 0 }: ProductCardProps) => {
  const { minimal } = useMinimalMode();
  const [expanded, setExpanded] = useState(false);
  const confidence = product.confidence_score ?? 0;
  const state = getStateCfg(product.state ?? "learning", minimal);

  const confidenceColor = minimal
    ? "text-foreground"
    : confidence >= 70 ? "text-glow-emerald" : confidence >= 40 ? "text-glow-amber" : "text-primary";

  const barColor = minimal
    ? "bg-foreground"
    : confidence >= 70 ? "bg-glow-emerald" : confidence >= 40 ? "bg-glow-amber" : "bg-primary";

  const segment = product.product_type ? product.product_type.toUpperCase() : "—";

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.06, ease: [0.25, 0.46, 0.45, 0.94] }}
    >
      <div className="group relative rounded-2xl bg-card ring-1 ring-border hover:ring-primary/40 transition-all duration-200 shadow-sm hover:shadow-md">
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full p-5 cursor-pointer text-center"
        >
          <div className="flex items-center justify-between mb-1">
            <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full ${state.bg} ${state.text} ring-1 ring-current/20`}>
              <span className={`h-1.5 w-1.5 rounded-full ${state.dot}`} />
              {state.label}
            </span>
            <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-200 shrink-0 ${expanded ? "rotate-180" : ""}`} />
          </div>

          <h3 className="font-heading text-2xl font-bold text-foreground tracking-tight my-3">{product.name}</h3>

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
                <div className="flex items-center gap-1.5 mb-4 mt-3">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-secondary text-foreground">{segment}</span>
                  <span className="text-[10px] font-medium text-muted-foreground">Product</span>
                </div>

                <div className="grid grid-cols-2 gap-2.5 mb-3">
                  <div className="rounded-xl bg-card/50 ring-1 ring-border/30 p-3">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <FileText className={`h-3.5 w-3.5 ${minimal ? "text-muted-foreground" : "text-glow-amber"}`} />
                      <span className="text-lg font-extrabold text-foreground">{factCount}</span>
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

                {conflictCount > 0 && (
                  <div className={`flex items-center gap-2 rounded-xl px-3.5 py-2.5 mb-3 text-sm font-semibold ${
                    minimal ? "bg-secondary ring-1 ring-border text-foreground" : "bg-primary/8 ring-1 ring-primary/15 text-primary"
                  }`}>
                    <AlertCircle className="h-4 w-4" />
                    {conflictCount} conflict{conflictCount > 1 ? "s" : ""} need review
                  </div>
                )}

                <Link
                  to={`/products/${product.id}`}
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
