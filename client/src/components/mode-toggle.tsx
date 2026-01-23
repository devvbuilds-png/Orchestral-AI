import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { GraduationCap, Sparkles, Lock, AlertTriangle } from "lucide-react";
import type { ChatMode } from "@shared/schema";

interface ModeToggleProps {
  mode: ChatMode;
  onModeChange: (mode: ChatMode) => void;
  explainerEnabled: boolean;
  overrideEnabled?: boolean;
  onOverrideChange?: (enabled: boolean) => void;
  confidenceLevel?: "low" | "medium" | "high";
  className?: string;
}

export function ModeToggle({
  mode,
  onModeChange,
  explainerEnabled,
  overrideEnabled = false,
  onOverrideChange,
  confidenceLevel,
  className,
}: ModeToggleProps) {
  const canUseExplainer = explainerEnabled || overrideEnabled;
  const showOverrideOption = !explainerEnabled && confidenceLevel && confidenceLevel !== "high";

  return (
    <div className={cn("flex flex-col gap-2", className)} data-testid="mode-toggle">
      <div className="flex items-center gap-1 p-1 rounded-lg bg-muted">
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
                onClick={() => canUseExplainer && onModeChange("explainer")}
                disabled={!canUseExplainer}
                className={cn(
                  "flex items-center gap-2 transition-all",
                  mode === "explainer" && "shadow-sm",
                  !canUseExplainer && "opacity-50 cursor-not-allowed"
                )}
                data-testid="button-mode-explainer"
              >
                {!canUseExplainer && <Lock className="h-3 w-3" />}
                {overrideEnabled && !explainerEnabled && <AlertTriangle className="h-3 w-3 text-yellow-500" />}
                <Sparkles className="h-4 w-4" />
                <span className="hidden sm:inline">Explainer</span>
              </Button>
            </div>
          </TooltipTrigger>
          {!explainerEnabled && !overrideEnabled && (
            <TooltipContent side="bottom" className="max-w-[200px]">
              <p className="text-sm">
                Explainer mode unlocks when product understanding reaches high confidence
              </p>
            </TooltipContent>
          )}
          {overrideEnabled && !explainerEnabled && (
            <TooltipContent side="bottom" className="max-w-[250px]">
              <p className="text-sm">
                Override active: Explainer will use partial knowledge and may not be able to answer some questions
              </p>
            </TooltipContent>
          )}
        </Tooltip>
      </div>

      {showOverrideOption && onOverrideChange && (
        <div className="flex items-center gap-2 text-xs" data-testid="override-switch-container">
          <Switch
            id="override-explainer"
            checked={overrideEnabled}
            onCheckedChange={onOverrideChange}
            className="scale-75"
            data-testid="switch-override-explainer"
          />
          <Label 
            htmlFor="override-explainer" 
            className="text-muted-foreground cursor-pointer"
          >
            Use Explainer with partial knowledge
          </Label>
        </div>
      )}
    </div>
  );
}
