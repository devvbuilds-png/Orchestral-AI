import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { AlertCircle, CheckCircle2, AlertTriangle } from "lucide-react";

interface ConfidenceDisplayProps {
  level?: "low" | "medium" | "high";
  score?: number;
  showProgress?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function ConfidenceDisplay({
  level = "low",
  score,
  showProgress = false,
  size = "md",
  className,
}: ConfidenceDisplayProps) {
  const config = {
    low: {
      label: "Low Confidence",
      icon: AlertCircle,
      color: "text-destructive",
      bgColor: "bg-destructive/10",
      borderColor: "border-destructive/20",
      progressColor: "bg-destructive",
    },
    medium: {
      label: "Medium Confidence",
      icon: AlertTriangle,
      color: "text-yellow-600 dark:text-yellow-500",
      bgColor: "bg-yellow-500/10",
      borderColor: "border-yellow-500/20",
      progressColor: "bg-yellow-500",
    },
    high: {
      label: "High Confidence",
      icon: CheckCircle2,
      color: "text-emerald-600 dark:text-emerald-500",
      bgColor: "bg-emerald-500/10",
      borderColor: "border-emerald-500/20",
      progressColor: "bg-emerald-500",
    },
  };

  const { label, icon: Icon, color, bgColor, borderColor, progressColor } = config[level];

  const sizeClasses = {
    sm: "text-xs px-2 py-0.5",
    md: "text-sm px-3 py-1",
    lg: "text-base px-4 py-1.5",
  };

  const iconSizes = {
    sm: "h-3 w-3",
    md: "h-4 w-4",
    lg: "h-5 w-5",
  };

  return (
    <div className={cn("flex flex-col gap-2", className)} data-testid="confidence-display">
      <div className="flex items-center gap-2">
        <Badge
          variant="outline"
          className={cn(
            "flex items-center gap-1.5 font-medium border",
            bgColor,
            borderColor,
            color,
            sizeClasses[size]
          )}
          data-testid="badge-confidence-level"
        >
          <Icon className={iconSizes[size]} />
          <span>{label}</span>
          {score !== undefined && (
            <span className="opacity-70">({score}%)</span>
          )}
        </Badge>
      </div>
      {showProgress && score !== undefined && (
        <div className="w-full" data-testid="progress-confidence">
          <Progress 
            value={score} 
            className={cn("h-1.5", progressColor)}
          />
        </div>
      )}
    </div>
  );
}
