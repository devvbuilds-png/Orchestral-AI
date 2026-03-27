import { useState } from "react";
import { Building2, Users, Layers, ArrowRight, Package, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { motion, AnimatePresence } from "framer-motion";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useMinimalMode } from "@/contexts/MinimalModeContext";

const types = [
  {
    id: "b2b" as const,
    label: "B2B",
    subtitle: "Business-to-Business",
    description: "Sales cycles, ICPs, org-level buyers, and enterprise personas.",
    icon: Building2,
    color: "glow-blue",
    emoji: "🏢",
  },
  {
    id: "b2c" as const,
    label: "B2C",
    subtitle: "Business-to-Consumer",
    description: "User acquisition, retention loops, and consumer personas.",
    icon: Users,
    color: "glow-pink",
    emoji: "👥",
  },
  {
    id: "hybrid" as const,
    label: "Hybrid",
    subtitle: "Mixed Model",
    description: "Both business and consumer motions with blended go-to-market.",
    icon: Layers,
    color: "glow-amber",
    emoji: "🔀",
  },
];

interface Props {
  open: boolean;
  onClose: () => void;
}

const AddProductModal = ({ open, onClose }: Props) => {
  const { minimal } = useMinimalMode();
  const [selected, setSelected] = useState<"b2b" | "b2c" | "hybrid" | null>(null);
  const [productName, setProductName] = useState("");
  const [step, setStep] = useState<"type" | "details" | "creating">("type");

  const handleContinue = () => {
    if (step === "type" && selected) {
      setStep("details");
    } else if (step === "details" && productName.trim()) {
      setStep("creating");
      setTimeout(() => {
        // Mock creation — reset and close
        setStep("type");
        setSelected(null);
        setProductName("");
        onClose();
      }, 2000);
    }
  };

  const handleClose = () => {
    setStep("type");
    setSelected(null);
    setProductName("");
    onClose();
  };

  const handleBack = () => {
    if (step === "details") setStep("type");
  };

  const colorClasses: Record<string, { bg: string; ring: string; text: string; border: string; dot: string }> = {
    "glow-blue": { bg: "bg-glow-blue/10", ring: "ring-glow-blue/30", text: "text-glow-blue", border: "border-glow-blue/30", dot: "bg-glow-blue" },
    "glow-pink": { bg: "bg-glow-pink/10", ring: "ring-glow-pink/30", text: "text-glow-pink", border: "border-glow-pink/30", dot: "bg-glow-pink" },
    "glow-amber": { bg: "bg-glow-amber/10", ring: "ring-glow-amber/30", text: "text-glow-amber", border: "border-glow-amber/30", dot: "bg-glow-amber" },
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="sm:max-w-[540px] bg-card border-border p-0 overflow-hidden gap-0">
        {/* Header gradient strip */}
        <div className={`h-1 w-full ${minimal ? "bg-foreground/20" : "bg-gradient-to-r from-glow-blue via-primary to-glow-pink"}`} />

        <div className="px-7 pt-6 pb-2">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                minimal ? "bg-secondary ring-1 ring-border" : "bg-primary/10 ring-1 ring-primary/20"
              }`}>
                <Package className={`h-5 w-5 ${minimal ? "text-foreground" : "text-primary"}`} />
              </div>
              <div>
                <DialogTitle className="text-foreground font-heading text-lg">
                  {step === "type" && "New Product"}
                  {step === "details" && "Product Details"}
                  {step === "creating" && "Creating..."}
                </DialogTitle>
                <DialogDescription className="text-muted-foreground text-xs mt-0.5">
                  {step === "type" && "Select the type of product you're analyzing"}
                  {step === "details" && "Give your product a name to get started"}
                  {step === "creating" && "Setting up your workspace"}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
        </div>

        {/* Step indicator */}
        <div className="px-7 py-3">
          <div className="flex items-center gap-2">
            {["type", "details"].map((s, i) => (
              <div key={s} className="flex items-center gap-2">
                <div className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold transition-all ${
                  step === s
                    ? minimal ? "bg-foreground text-background" : "bg-primary text-primary-foreground"
                    : (step === "details" && s === "type") || step === "creating"
                      ? minimal ? "bg-foreground/20 text-foreground" : "bg-glow-emerald/15 text-glow-emerald"
                      : "bg-secondary text-muted-foreground"
                }`}>
                  {(step === "details" && s === "type") || step === "creating" ? "✓" : i + 1}
                </div>
                <span className={`text-[11px] font-semibold ${step === s ? "text-foreground" : "text-muted-foreground"}`}>
                  {s === "type" ? "Type" : "Name"}
                </span>
                {i < 1 && <div className={`w-8 h-px ${
                  step === "details" || step === "creating" ? (minimal ? "bg-foreground/30" : "bg-primary/30") : "bg-border"
                }`} />}
              </div>
            ))}
          </div>
        </div>

        <div className="px-7 pb-7">
          <AnimatePresence mode="wait">
            {step === "type" && (
              <motion.div
                key="type"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                transition={{ duration: 0.2 }}
                className="space-y-3"
              >
                {types.map((t) => {
                  const isSelected = selected === t.id;
                  const Icon = t.icon;
                  const c = colorClasses[t.color];

                  return (
                    <button
                      key={t.id}
                      onClick={() => setSelected(t.id)}
                      className={`w-full rounded-xl p-4 text-left transition-all duration-200 ring-1 flex items-start gap-4 group ${
                        isSelected
                          ? minimal
                            ? "bg-secondary ring-foreground/40"
                            : `${c.bg} ${c.ring}`
                          : "bg-secondary/30 ring-border/50 hover:ring-border hover:bg-secondary/50"
                      }`}
                    >
                      <div className={`flex h-11 w-11 items-center justify-center rounded-xl shrink-0 transition-all ${
                        minimal
                          ? isSelected ? "bg-foreground/10 ring-1 ring-foreground/20" : "bg-secondary ring-1 ring-border"
                          : isSelected ? `${c.bg} ring-1 ${c.ring}` : "bg-secondary/60 ring-1 ring-border/50"
                      }`}>
                        <Icon className={`h-5 w-5 transition-colors ${
                          minimal
                            ? isSelected ? "text-foreground" : "text-muted-foreground"
                            : isSelected ? c.text : "text-muted-foreground"
                        }`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-bold text-foreground font-heading">{t.label}</h3>
                          <span className="text-[10px] font-medium text-muted-foreground">{t.subtitle}</span>
                          {!minimal && isSelected && (
                            <motion.div
                              layoutId="type-dot"
                              className={`h-2 w-2 rounded-full ml-auto ${c.dot}`}
                            />
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed mt-1">{t.description}</p>
                      </div>
                    </button>
                  );
                })}
              </motion.div>
            )}

            {step === "details" && (
              <motion.div
                key="details"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.2 }}
                className="space-y-5"
              >
                {/* Selected type badge */}
                {selected && (
                  <div className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold ring-1 ${
                    minimal ? "bg-secondary ring-border text-foreground" : `${colorClasses[types.find(t => t.id === selected)!.color].bg} ${colorClasses[types.find(t => t.id === selected)!.color].ring} ${colorClasses[types.find(t => t.id === selected)!.color].text}`
                  }`}>
                    {!minimal && <span>{types.find(t => t.id === selected)?.emoji}</span>}
                    {types.find(t => t.id === selected)?.label} Product
                  </div>
                )}

                <div className="space-y-2">
                  <label className="text-xs font-bold text-foreground">Product Name</label>
                  <Input
                    value={productName}
                    onChange={(e) => setProductName(e.target.value)}
                    placeholder="e.g. Notion, Figma, Linear..."
                    className="bg-secondary/50 border-border rounded-xl h-12 text-sm font-medium"
                    autoFocus
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Name the product you want to analyze. You can change this later.
                  </p>
                </div>

                {/* Preview card */}
                {productName.trim() && (
                  <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-xl bg-secondary/30 ring-1 ring-border/50 p-4"
                  >
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Preview</p>
                    <div className="flex items-center gap-3">
                      <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                        minimal ? "bg-secondary ring-1 ring-border" : "bg-primary/10 ring-1 ring-primary/20"
                      }`}>
                        <span className="font-heading text-sm font-bold text-primary">
                          {productName.trim().charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div>
                        <p className="text-sm font-bold text-foreground font-heading">{productName.trim()}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {types.find(t => t.id === selected)?.label} · 0% Confidence · New
                        </p>
                      </div>
                    </div>
                  </motion.div>
                )}
              </motion.div>
            )}

            {step === "creating" && (
              <motion.div
                key="creating"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex flex-col items-center py-10 text-center"
              >
                <div className={`flex h-16 w-16 items-center justify-center rounded-2xl mb-4 ${
                  minimal ? "bg-secondary ring-1 ring-border" : "bg-primary/10 ring-1 ring-primary/20"
                }`}>
                  <Sparkles className={`h-7 w-7 animate-pulse ${minimal ? "text-foreground" : "text-primary"}`} />
                </div>
                <p className="text-base font-bold text-foreground font-heading">Creating {productName}</p>
                <p className="text-xs text-muted-foreground mt-1">Setting up your workspace and knowledge pipeline...</p>
                <div className="mt-6 w-48 h-1.5 rounded-full bg-secondary overflow-hidden">
                  <motion.div
                    className={`h-full rounded-full ${minimal ? "bg-foreground" : "bg-primary"}`}
                    initial={{ width: "0%" }}
                    animate={{ width: "100%" }}
                    transition={{ duration: 1.8, ease: "easeInOut" }}
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Footer actions */}
          {step !== "creating" && (
            <div className="flex items-center justify-between mt-6 pt-5 border-t border-border/50">
              <Button
                variant="ghost"
                onClick={step === "type" ? handleClose : handleBack}
                className="rounded-xl text-xs font-bold text-muted-foreground hover:text-foreground"
              >
                {step === "type" ? "Cancel" : "← Back"}
              </Button>
              <Button
                onClick={handleContinue}
                disabled={step === "type" ? !selected : !productName.trim()}
                className="rounded-xl text-xs font-bold bg-primary hover:bg-primary/90 gap-2 h-9 px-5"
              >
                {step === "type" ? "Continue" : "Create Product"}
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AddProductModal;
