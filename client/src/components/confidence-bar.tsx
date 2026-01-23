import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import { AlertCircle, CheckCircle2, AlertTriangle, Info, Lightbulb, TrendingUp } from "lucide-react";

interface ConfidenceBarProps {
  level?: "low" | "medium" | "high";
  score?: number;
  reasons?: string[];
  improvements?: string[];
  className?: string;
}

export function ConfidenceBar({
  level = "low",
  score = 0,
  reasons = [],
  improvements = [],
  className,
}: ConfidenceBarProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const handleMouseEnter = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setIsExpanded(true);
  };

  const handleMouseLeave = () => {
    timeoutRef.current = setTimeout(() => {
      setIsExpanded(false);
    }, 150);
  };

  const config = {
    low: {
      label: "Low",
      icon: AlertCircle,
      barColor: "bg-red-500",
      pillBg: "bg-red-500/10 dark:bg-red-500/20",
      pillText: "text-red-700 dark:text-red-400",
      pillBorder: "border-red-200 dark:border-red-800",
    },
    medium: {
      label: "Medium",
      icon: AlertTriangle,
      barColor: "bg-yellow-500",
      pillBg: "bg-yellow-500/10 dark:bg-yellow-500/20",
      pillText: "text-yellow-700 dark:text-yellow-400",
      pillBorder: "border-yellow-200 dark:border-yellow-800",
    },
    high: {
      label: "High",
      icon: CheckCircle2,
      barColor: "bg-emerald-500",
      pillBg: "bg-emerald-500/10 dark:bg-emerald-500/20",
      pillText: "text-emerald-700 dark:text-emerald-400",
      pillBorder: "border-emerald-200 dark:border-emerald-800",
    },
  };

  const { label, icon: Icon, barColor, pillBg, pillText, pillBorder } = config[level];

  const defaultReasons = {
    low: [
      "Limited product information has been provided so far",
      "Many important knowledge areas are still empty",
      "Core product details need to be filled in",
    ],
    medium: [
      "Basic product information has been captured",
      "Some important areas still need more detail",
      "Good foundation, but gaps remain in key areas",
    ],
    high: [
      "Comprehensive product knowledge has been built",
      "All critical information areas are covered",
      "Strong foundation for accurate explanations",
    ],
  };

  const defaultImprovements = {
    low: [
      "Upload product documentation (PDFs, docs)",
      "Share your product website URL",
      "Answer the interview questions about your product",
    ],
    medium: [
      "Continue answering interview questions",
      "Provide more specific examples and use cases",
      "Add details about pricing, competitors, or customer stories",
    ],
    high: [
      "Your knowledge base is comprehensive!",
      "Switch to Explainer mode to test the AI's understanding",
    ],
  };

  const displayReasons = reasons.length > 0 ? reasons : defaultReasons[level];
  const displayImprovements = improvements.length > 0 ? improvements : defaultImprovements[level];

  return (
    <div
      className={cn("relative", className)}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      data-testid="confidence-bar"
    >
      <div
        className={cn(
          "flex items-center gap-3 px-4 py-2 rounded-full cursor-pointer transition-all border",
          pillBg,
          pillText,
          pillBorder
        )}
        data-testid="confidence-bar-header"
      >
        <Icon className="h-4 w-4 flex-shrink-0" />
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="font-medium text-sm whitespace-nowrap">
            {label} Confidence
          </span>
          <div className="flex-1 h-2 bg-black/10 dark:bg-white/10 rounded-full overflow-hidden min-w-[60px] max-w-[120px]">
            <div
              className={cn("h-full rounded-full transition-all duration-500", barColor)}
              style={{ width: `${Math.max(score, 5)}%` }}
            />
          </div>
          <span className="text-xs opacity-70 whitespace-nowrap">
            {score}%
          </span>
        </div>
      </div>

      {isExpanded && (
        <div
          className="absolute top-full left-0 right-0 mt-2 z-50"
          data-testid="confidence-bar-expanded"
        >
          <div className="bg-card border rounded-lg shadow-lg p-4 space-y-4">
            <div className="space-y-2">
              <h4 className="font-semibold text-sm flex items-center gap-2">
                <Info className="h-4 w-4 text-muted-foreground" />
                What is Confidence?
              </h4>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Confidence measures how well the AI understands your product based on the information you've provided. 
                Higher confidence means more accurate and detailed explanations.
              </p>
            </div>

            <div className="h-px bg-border" />

            <div className="space-y-2">
              <h4 className="font-semibold text-sm flex items-center gap-2">
                <Icon className="h-4 w-4" />
                Why {label} Confidence?
              </h4>
              <ul className="text-sm text-muted-foreground space-y-1.5">
                {displayReasons.map((reason, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-muted-foreground/60 mt-1">•</span>
                    <span>{reason}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="h-px bg-border" />

            <div className="space-y-2">
              <h4 className="font-semibold text-sm flex items-center gap-2">
                {level === "high" ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                ) : (
                  <TrendingUp className="h-4 w-4 text-primary" />
                )}
                {level === "high" ? "You're All Set!" : "How to Improve"}
              </h4>
              <ul className="text-sm text-muted-foreground space-y-1.5">
                {displayImprovements.map((improvement, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <Lightbulb className="h-3.5 w-3.5 text-yellow-500 mt-0.5 flex-shrink-0" />
                    <span>{improvement}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
