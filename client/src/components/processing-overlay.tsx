import { cn } from "@/lib/utils";
import { Loader2, FileText, Globe, Brain, Sparkles } from "lucide-react";

type ProcessingPhase = "uploading" | "fetching" | "analyzing" | "synthesizing" | "idle";

interface ProcessingOverlayProps {
  phase: ProcessingPhase;
  details?: string;
  className?: string;
}

const phaseConfig: Record<ProcessingPhase, { icon: React.ElementType; title: string; description: string }> = {
  uploading: {
    icon: FileText,
    title: "Uploading Documents",
    description: "Reading and extracting text from your files...",
  },
  fetching: {
    icon: Globe,
    title: "Fetching URL Content",
    description: "Retrieving and parsing the webpage...",
  },
  analyzing: {
    icon: Brain,
    title: "Analyzing Content",
    description: "Extracting facts and building product knowledge...",
  },
  synthesizing: {
    icon: Sparkles,
    title: "Synthesizing Insights",
    description: "Creating a comprehensive product understanding...",
  },
  idle: {
    icon: Loader2,
    title: "Processing",
    description: "Working on your request...",
  },
};

export function ProcessingOverlay({ phase, details, className }: ProcessingOverlayProps) {
  if (phase === "idle") return null;

  const config = phaseConfig[phase];
  const Icon = config.icon;

  return (
    <div
      className={cn(
        "fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm",
        className
      )}
      data-testid="processing-overlay"
    >
      <div className="flex flex-col items-center gap-4 p-8 rounded-lg bg-card border shadow-lg max-w-sm text-center">
        <div className="relative">
          <div className="absolute inset-0 animate-ping opacity-20">
            <Icon className="h-12 w-12 text-primary" />
          </div>
          <Icon className="h-12 w-12 text-primary animate-pulse" />
        </div>
        <div className="space-y-2">
          <h3 className="font-semibold text-lg">{config.title}</h3>
          <p className="text-sm text-muted-foreground">{config.description}</p>
          {details && (
            <p className="text-xs text-muted-foreground/70 mt-2 font-mono truncate max-w-[280px]">
              {details}
            </p>
          )}
        </div>
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    </div>
  );
}
