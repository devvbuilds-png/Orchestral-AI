import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Button } from "@/components/ui/button";

export interface DashboardTutorialStep {
  id: string;
  title: string;
  body: string;
  target: HTMLElement | null;
  highlightMode?: "target" | "viewport";
  scrollAlign?: ScrollLogicalPosition;
}

interface DashboardTutorialProps {
  open: boolean;
  steps: DashboardTutorialStep[];
  onClose: () => void;
  onComplete: () => void;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getViewportSpotlight() {
  if (typeof window === "undefined") return null;
  return {
    top: 8,
    left: 8,
    width: Math.max(window.innerWidth - 16, 0),
    height: Math.max(window.innerHeight - 16, 0),
  };
}

function isTargetMostlyVisible(target: HTMLElement) {
  const rect = target.getBoundingClientRect();
  const viewportHeight = window.innerHeight;
  const viewportWidth = window.innerWidth;

  return (
    rect.top >= -16 &&
    rect.left >= -16 &&
    rect.bottom <= viewportHeight + 16 &&
    rect.right <= viewportWidth + 16
  );
}

export default function DashboardTutorial({
  open,
  steps,
  onClose,
  onComplete,
}: DashboardTutorialProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [measuredCardHeight, setMeasuredCardHeight] = useState(0);
  const cardRef = useRef<HTMLDivElement | null>(null);

  // Measure the card after it renders
  const measureCard = useCallback((node: HTMLDivElement | null) => {
    cardRef.current = node;
    if (node) {
      setMeasuredCardHeight(node.getBoundingClientRect().height);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncPreference = () => setReduceMotion(mediaQuery.matches);
    syncPreference();
    mediaQuery.addEventListener("change", syncPreference);
    return () => mediaQuery.removeEventListener("change", syncPreference);
  }, []);

  useEffect(() => {
    if (!open) {
      setCurrentStep(0);
      setTargetRect(null);
      setMeasuredCardHeight(0);
    }
  }, [open]);

  const step = steps[currentStep] ?? null;

  // Re-measure card when step changes
  useEffect(() => {
    if (cardRef.current) {
      setMeasuredCardHeight(cardRef.current.getBoundingClientRect().height);
    }
  }, [currentStep]);

  useEffect(() => {
    if (!open || !step) {
      setTargetRect(null);
      return;
    }

    if (step.highlightMode === "viewport") {
      setTargetRect(null);
      if (typeof window !== "undefined" && window.scrollY !== 0 && step.scrollAlign === "start") {
        window.scrollTo({ top: 0, left: 0, behavior: reduceMotion ? "auto" : "smooth" });
      }
      return;
    }

    if (!step.target) {
      setTargetRect(null);
      return;
    }

    let frameId = 0;
    let timeoutId = 0;

    const updateRect = () => {
      const rect = step.target?.getBoundingClientRect();
      setTargetRect(rect && rect.width > 0 && rect.height > 0 ? rect : null);
    };

    setTargetRect(null);

    if (!isTargetMostlyVisible(step.target)) {
      step.target.scrollIntoView({
        behavior: reduceMotion ? "auto" : "smooth",
        block: step.scrollAlign ?? "center",
        inline: "nearest",
      });
    }

    frameId = window.requestAnimationFrame(() => {
      updateRect();
    });

    if (!reduceMotion) {
      timeoutId = window.setTimeout(updateRect, 280);
    }

    window.addEventListener("resize", updateRect);
    window.addEventListener("scroll", updateRect, true);
    return () => {
      window.cancelAnimationFrame(frameId);
      window.clearTimeout(timeoutId);
      window.removeEventListener("resize", updateRect);
      window.removeEventListener("scroll", updateRect, true);
    };
  }, [open, step, reduceMotion]);

  const spotlightStyle = useMemo(() => {
    if (step?.highlightMode === "viewport") {
      return getViewportSpotlight();
    }
    if (!targetRect) return null;
    const padding = 12;
    return {
      top: Math.max(targetRect.top - padding, 0),
      left: Math.max(targetRect.left - padding, 0),
      width: Math.min(targetRect.width + padding * 2, window.innerWidth),
      height: Math.min(targetRect.height + padding * 2, window.innerHeight),
    };
  }, [step?.highlightMode, targetRect]);

  // Position card near the spotlight target using measured height
  const cardStyle = useMemo(() => {
    if (typeof window === "undefined") return { left: "50%", top: "50%", transform: "translate(-50%, -50%)" } as React.CSSProperties;

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const cardWidth = Math.min(360, viewportWidth - 32);
    const cardHeight = measuredCardHeight || 220; // fallback until measured

    // No target or viewport mode → center-bottom, clamped
    if (!spotlightStyle || step?.highlightMode === "viewport") {
      const bottomPos = Math.max(24, viewportHeight - cardHeight - 24);
      return {
        left: "50%",
        top: clamp(bottomPos, 16, viewportHeight - cardHeight - 16),
        width: cardWidth,
        maxHeight: viewportHeight - 32,
        overflow: "auto" as const,
        transform: "translateX(-50%)",
      } as React.CSSProperties;
    }

    // Calculate horizontal position: center on target, clamped to viewport
    const targetCenterX = spotlightStyle.left + spotlightStyle.width / 2;
    const desiredLeft = targetCenterX - cardWidth / 2;
    const left = clamp(desiredLeft, 16, viewportWidth - cardWidth - 16);

    // Decide vertical position: prefer below target, fall back to above
    const spaceBelow = viewportHeight - (spotlightStyle.top + spotlightStyle.height);
    const spaceAbove = spotlightStyle.top;
    const gap = 16;

    let top: number;
    if (spaceBelow >= cardHeight + gap) {
      top = spotlightStyle.top + spotlightStyle.height + gap;
    } else if (spaceAbove >= cardHeight + gap) {
      top = spotlightStyle.top - cardHeight - gap;
    } else {
      // Not enough space — center vertically in the viewport
      top = Math.max(16, (viewportHeight - cardHeight) / 2);
    }

    // Clamp to stay fully within viewport
    top = clamp(top, 16, Math.max(16, viewportHeight - cardHeight - 16));

    return {
      left,
      top,
      width: cardWidth,
      maxHeight: viewportHeight - 32,
      overflow: "auto" as const,
    } as React.CSSProperties;
  }, [step?.highlightMode, spotlightStyle, measuredCardHeight]);

  if (!open || !step) return null;

  const isLastStep = currentStep === steps.length - 1;

  const goToStep = (nextStep: number) => {
    setTargetRect(null);
    setMeasuredCardHeight(0);
    setCurrentStep(clamp(nextStep, 0, steps.length - 1));
  };

  // Build the overlay mask as a single SVG with a cutout for the spotlight
  const renderOverlay = () => {
    if (typeof window === "undefined") return null;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    if (!spotlightStyle) {
      return <div className="fixed inset-0 bg-black/72 backdrop-blur-[3px]" />;
    }

    const { top, left, width, height } = spotlightStyle;
    const r = 16;

    return (
      <svg
        className="fixed inset-0"
        width={vw}
        height={vh}
        style={{ pointerEvents: "auto" }}
      >
        <defs>
          <mask id="tutorial-mask">
            <rect width={vw} height={vh} fill="white" />
            <rect
              x={left}
              y={top}
              width={width}
              height={height}
              rx={r}
              ry={r}
              fill="black"
            />
          </mask>
        </defs>
        <rect
          width={vw}
          height={vh}
          fill="rgba(0,0,0,0.72)"
          mask="url(#tutorial-mask)"
          style={{ backdropFilter: "blur(3px)" }}
        />
      </svg>
    );
  };

  return (
    <div className="fixed inset-0 z-[90]">
      {renderOverlay()}

      <AnimatePresence mode="wait">
        {spotlightStyle && (
          <motion.div
            key={`spotlight-${step.id}`}
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.2 }}
            className="pointer-events-none fixed rounded-2xl border-2 border-primary/80 shadow-[0_0_0_1px_rgba(255,255,255,0.05),0_0_30px_rgba(222,115,86,0.24)]"
            style={{
              top: spotlightStyle.top,
              left: spotlightStyle.left,
              width: spotlightStyle.width,
              height: spotlightStyle.height,
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        <motion.div
          ref={measureCard}
          key={`card-${step.id}`}
          initial={reduceMotion ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ duration: reduceMotion ? 0 : 0.2 }}
          className="fixed z-[91] rounded-2xl border border-border/60 p-5 text-left shadow-2xl"
          style={{
            ...cardStyle,
            background: "hsl(0 0% 10%)",
          }}
        >
          <div className="mb-3 flex items-center justify-between gap-4">
            <span className="text-[11px] font-bold uppercase tracking-[0.28em] text-primary">
              Tutorial
            </span>
            <span className="text-xs text-muted-foreground">
              {currentStep + 1} / {steps.length}
            </span>
          </div>

          <h3 className="font-heading text-lg font-bold text-foreground">
            {step.title}
          </h3>
          <p className="mt-2 text-[13px] leading-relaxed text-neutral-300">
            {step.body}
          </p>

          <div className="mt-5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={onClose}
                className="h-9 rounded-xl px-3 text-xs font-semibold text-muted-foreground hover:text-foreground"
              >
                Skip
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => goToStep(currentStep - 1)}
                disabled={currentStep === 0}
                className="h-9 rounded-xl px-3 text-xs font-semibold"
              >
                Back
              </Button>
            </div>

            <Button
              type="button"
              onClick={() => {
                if (isLastStep) {
                  onComplete();
                  return;
                }
                goToStep(currentStep + 1);
              }}
              className="h-9 rounded-xl px-4 text-xs font-semibold"
            >
              {isLastStep ? "Done" : "Next"}
            </Button>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
