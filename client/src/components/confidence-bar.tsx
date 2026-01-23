import { useState } from "react";
import { cn } from "@/lib/utils";
import { AlertCircle, CheckCircle2, AlertTriangle, ChevronDown, ChevronUp, Lightbulb } from "lucide-react";

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

  const config = {
    low: {
      label: "Low",
      icon: AlertCircle,
      bgColor: "bg-destructive",
      textColor: "text-destructive-foreground",
      barBg: "bg-destructive/10",
    },
    medium: {
      label: "Medium",
      icon: AlertTriangle,
      bgColor: "bg-yellow-500 dark:bg-yellow-600",
      textColor: "text-black dark:text-white",
      barBg: "bg-yellow-500/10",
    },
    high: {
      label: "High",
      icon: CheckCircle2,
      bgColor: "bg-emerald-500 dark:bg-emerald-600",
      textColor: "text-white",
      barBg: "bg-emerald-500/10",
    },
  };

  const { label, icon: Icon, bgColor, textColor, barBg } = config[level];

  const defaultReasons = {
    low: ["Limited information provided", "Many knowledge gaps remain"],
    medium: ["Core product info available", "Some important details missing"],
    high: ["Comprehensive product knowledge", "All critical areas covered"],
  };

  const defaultImprovements = {
    low: ["Upload product documentation", "Provide website URL", "Answer interview questions"],
    medium: ["Fill remaining knowledge gaps", "Add more specific details", "Provide use case examples"],
    high: ["Knowledge base is comprehensive", "Ready for explainer mode"],
  };

  const displayReasons = reasons.length > 0 ? reasons : defaultReasons[level];
  const displayImprovements = improvements.length > 0 ? improvements : defaultImprovements[level];

  return (
    <div className={cn("w-full", className)} data-testid="confidence-bar">
      <div
        className={cn(
          "flex items-center justify-between px-4 py-2 cursor-pointer transition-all",
          bgColor,
          textColor
        )}
        onClick={() => setIsExpanded(!isExpanded)}
        onMouseEnter={() => setIsExpanded(true)}
        onMouseLeave={() => setIsExpanded(false)}
        data-testid="confidence-bar-header"
      >
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4" />
          <span className="font-medium text-sm">
            {label} Confidence
          </span>
          <span className="text-sm opacity-80">
            ({score}%)
          </span>
        </div>
        <div className="flex items-center gap-2">
          {isExpanded ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </div>
      </div>

      {isExpanded && (
        <div
          className={cn("p-4 space-y-4 border-x border-b", barBg)}
          data-testid="confidence-bar-expanded"
        >
          <div className="space-y-2">
            <h4 className="font-medium text-sm flex items-center gap-2">
              <Icon className="h-4 w-4" />
              Why this confidence level?
            </h4>
            <ul className="text-sm text-muted-foreground space-y-1 ml-6">
              {displayReasons.map((reason, i) => (
                <li key={i} className="list-disc">{reason}</li>
              ))}
            </ul>
          </div>

          {level !== "high" && (
            <div className="space-y-2">
              <h4 className="font-medium text-sm flex items-center gap-2">
                <Lightbulb className="h-4 w-4 text-yellow-500" />
                How to improve?
              </h4>
              <ul className="text-sm text-muted-foreground space-y-1 ml-6">
                {displayImprovements.map((improvement, i) => (
                  <li key={i} className="list-disc">{improvement}</li>
                ))}
              </ul>
            </div>
          )}

          {level === "high" && (
            <div className="flex items-center gap-2 p-2 rounded bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="h-4 w-4" />
              <span className="text-sm font-medium">Explainer mode is now available!</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
