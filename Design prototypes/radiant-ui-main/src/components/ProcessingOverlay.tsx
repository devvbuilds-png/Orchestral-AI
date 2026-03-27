import { useState, useEffect } from "react";
import { Loader2, CheckCircle, FileText, Brain, Database, Sparkles } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useMinimalMode } from "@/contexts/MinimalModeContext";

interface Props {
  visible: boolean;
  onComplete?: () => void;
}

const steps = [
  { label: "Fetching sources", icon: FileText, duration: 2000 },
  { label: "Extracting facts", icon: Brain, duration: 3000 },
  { label: "Building knowledge graph", icon: Database, duration: 2500 },
  { label: "Generating personas", icon: Sparkles, duration: 2000 },
];

const ProcessingOverlay = ({ visible, onComplete }: Props) => {
  const { minimal } = useMinimalMode();
  const [currentStep, setCurrentStep] = useState(0);
  const [completed, setCompleted] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!visible) {
      setCurrentStep(0);
      setCompleted(new Set());
      return;
    }

    let timeout: ReturnType<typeof setTimeout>;
    const advance = (step: number) => {
      if (step >= steps.length) {
        onComplete?.();
        return;
      }
      setCurrentStep(step);
      timeout = setTimeout(() => {
        setCompleted((prev) => new Set([...prev, step]));
        advance(step + 1);
      }, steps[step].duration);
    };

    advance(0);
    return () => clearTimeout(timeout);
  }, [visible, onComplete]);

  if (!visible) return null;

  const progress = ((completed.size) / steps.length) * 100;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-card/95 backdrop-blur-sm rounded-2xl"
    >
      <div className="w-full max-w-sm px-6">
        <div className={`flex h-16 w-16 items-center justify-center rounded-2xl mx-auto mb-6 ${
          minimal ? "bg-secondary ring-1 ring-border" : "bg-primary/10 ring-1 ring-primary/20"
        }`}>
          <Loader2 className={`h-7 w-7 animate-spin ${minimal ? "text-foreground" : "text-primary"}`} />
        </div>

        <h3 className="text-lg font-bold text-foreground text-center font-heading mb-1">Processing Pipeline</h3>
        <p className="text-xs text-muted-foreground text-center mb-8">Analyzing your sources and building intelligence...</p>

        {/* Progress bar */}
        <div className="h-1.5 w-full rounded-full bg-secondary overflow-hidden mb-8">
          <motion.div
            className={`h-full rounded-full ${minimal ? "bg-foreground" : "bg-primary"}`}
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.5 }}
          />
        </div>

        {/* Steps */}
        <div className="space-y-3">
          {steps.map((step, i) => {
            const isDone = completed.has(i);
            const isCurrent = currentStep === i && !isDone;
            const Icon = step.icon;

            return (
              <motion.div
                key={step.label}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.1 }}
                className={`flex items-center gap-3 rounded-xl px-4 py-3 transition-all ${
                  isCurrent
                    ? minimal ? "bg-secondary ring-1 ring-border" : "bg-primary/5 ring-1 ring-primary/20"
                    : isDone
                      ? "opacity-60"
                      : "opacity-30"
                }`}
              >
                <div className={`flex h-8 w-8 items-center justify-center rounded-lg shrink-0 ${
                  isDone
                    ? minimal ? "bg-secondary" : "bg-glow-emerald/10"
                    : isCurrent
                      ? minimal ? "bg-secondary" : "bg-primary/10"
                      : "bg-secondary/50"
                }`}>
                  {isDone ? (
                    <CheckCircle className={`h-4 w-4 ${minimal ? "text-foreground" : "text-glow-emerald"}`} />
                  ) : isCurrent ? (
                    <Loader2 className={`h-4 w-4 animate-spin ${minimal ? "text-foreground" : "text-primary"}`} />
                  ) : (
                    <Icon className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
                <span className={`text-sm font-semibold ${isDone || isCurrent ? "text-foreground" : "text-muted-foreground"}`}>
                  {step.label}
                </span>
                {isDone && <span className="ml-auto text-[10px] font-bold text-glow-emerald">Done</span>}
                {isCurrent && <span className="ml-auto text-[10px] font-bold text-primary">Running...</span>}
              </motion.div>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
};

export default ProcessingOverlay;
