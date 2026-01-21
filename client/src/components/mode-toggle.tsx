import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { GraduationCap, Sparkles, Lock } from "lucide-react";
import type { ChatMode } from "@shared/schema";

interface ModeToggleProps {
  mode: ChatMode;
  onModeChange: (mode: ChatMode) => void;
  explainerEnabled: boolean;
  className?: string;
}

export function ModeToggle({
  mode,
  onModeChange,
  explainerEnabled,
  className,
}: ModeToggleProps) {
  return (
    <div 
      className={cn("flex items-center gap-1 p-1 rounded-lg bg-muted", className)}
      data-testid="mode-toggle"
    >
      <Button
        variant={mode === "learner" ? "default" : "ghost"}
        size="sm"
        onClick={() => onModeChange("learner")}
        className={cn(
          "flex items-center gap-2 transition-all",
          mode === "learner" && "shadow-sm"
        )}
        data-testid="button-mode-learner"
      >
        <GraduationCap className="h-4 w-4" />
        <span className="hidden sm:inline">Learner</span>
      </Button>

      <Tooltip>
        <TooltipTrigger asChild>
          <div>
            <Button
              variant={mode === "explainer" ? "default" : "ghost"}
              size="sm"
              onClick={() => explainerEnabled && onModeChange("explainer")}
              disabled={!explainerEnabled}
              className={cn(
                "flex items-center gap-2 transition-all",
                mode === "explainer" && "shadow-sm",
                !explainerEnabled && "opacity-50 cursor-not-allowed"
              )}
              data-testid="button-mode-explainer"
            >
              {!explainerEnabled && <Lock className="h-3 w-3" />}
              <Sparkles className="h-4 w-4" />
              <span className="hidden sm:inline">Explainer</span>
            </Button>
          </div>
        </TooltipTrigger>
        {!explainerEnabled && (
          <TooltipContent side="bottom" className="max-w-[200px]">
            <p className="text-sm">
              Explainer mode unlocks when product understanding reaches high confidence
            </p>
          </TooltipContent>
        )}
      </Tooltip>
    </div>
  );
}
