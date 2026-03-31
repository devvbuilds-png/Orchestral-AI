import { useState, useEffect, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, SkipForward, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useMinimalMode } from "@/contexts/MinimalModeContext";
import { apiRequest } from "@/lib/queryClient";
import type { PKB, Gap } from "@shared/schema";

interface GapFillDialogProps {
  open: boolean;
  onClose: () => void;
  productId: number | null;
  gap: { key: string; q: string; why: string; severity: string } | null;
  pkb: PKB | null;
}

export const GapFillDialog = ({ open, onClose, productId, gap, pkb }: GapFillDialogProps) => {
  const { minimal } = useMinimalMode();
  const queryClient = useQueryClient();

  const allGaps: Gap[] = pkb?.gaps?.current ?? [];

  // Session state — reset every time dialog opens
  const [answeredInSession, setAnsweredInSession] = useState<Record<string, string>>({});
  const [skippedInSession, setSkippedInSession] = useState<Set<string>>(new Set());
  const [activeGapPath, setActiveGapPath] = useState<string | null>(null);
  const [currentAnswer, setCurrentAnswer] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Reset session when dialog opens
  useEffect(() => {
    if (!open) return;
    setAnsweredInSession({});
    setSkippedInSession(new Set());
    setSubmitError(null);
    setCurrentAnswer("");
    const initial =
      gap?.key ??
      allGaps.find((g) => g.severity === "critical")?.field_path ??
      allGaps[0]?.field_path ??
      null;
    setActiveGapPath(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Focus textarea when active gap changes
  useEffect(() => {
    if (activeGapPath) {
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  }, [activeGapPath]);

  const activeGap = allGaps.find((g) => g.field_path === activeGapPath) ?? null;
  const answeredCount = Object.keys(answeredInSession).length;
  const noUnansweredLeft =
    allGaps.length > 0 &&
    allGaps.every(
      (g) =>
        answeredInSession[g.field_path] !== undefined ||
        skippedInSession.has(g.field_path)
    );

  // Advance to next unanswered/unskipped gap after save or skip
  const advanceToNext = (
    fromPath: string,
    answered: Record<string, string>,
    skipped: Set<string>
  ) => {
    const isDone = (path: string) =>
      answered[path] !== undefined || skipped.has(path);
    const idx = allGaps.findIndex((g) => g.field_path === fromPath);
    // Look forward first
    for (let i = idx + 1; i < allGaps.length; i++) {
      if (!isDone(allGaps[i].field_path)) {
        setActiveGapPath(allGaps[i].field_path);
        setCurrentAnswer(answered[allGaps[i].field_path] ?? "");
        return;
      }
    }
    // Wrap around
    for (let i = 0; i < idx; i++) {
      if (!isDone(allGaps[i].field_path)) {
        setActiveGapPath(allGaps[i].field_path);
        setCurrentAnswer(answered[allGaps[i].field_path] ?? "");
        return;
      }
    }
    // All done
    setActiveGapPath(null);
    setCurrentAnswer("");
  };

  const handleSelectGap = (path: string) => {
    // Auto-preserve current draft when navigating away
    if (activeGapPath && currentAnswer.trim()) {
      setAnsweredInSession((prev) => ({ ...prev, [activeGapPath]: currentAnswer.trim() }));
    }
    setActiveGapPath(path);
    setCurrentAnswer(answeredInSession[path] ?? "");
  };

  const handleSaveAnswer = () => {
    if (!activeGapPath || !currentAnswer.trim()) return;
    const answer = currentAnswer.trim();
    const newAnswered = { ...answeredInSession, [activeGapPath]: answer };
    setAnsweredInSession(newAnswered);
    advanceToNext(activeGapPath, newAnswered, skippedInSession);
  };

  const handleSkip = () => {
    if (!activeGapPath) return;
    const newSkipped = new Set(skippedInSession).add(activeGapPath);
    setSkippedInSession(newSkipped);
    advanceToNext(activeGapPath, answeredInSession, newSkipped);
  };

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!productId) return;
      const answers = Object.entries(answeredInSession).map(([field_path, answer]) => ({
        field_path,
        answer,
      }));
      const skipped = Array.from(skippedInSession);
      await apiRequest("POST", `/api/products/${productId}/fill-gaps`, { answers, skipped });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/products/${productId}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      onClose();
    },
    onError: (err: any) => {
      setSubmitError(err?.message ?? "Failed to save answers. Please try again.");
    },
  });

  const remainingCount = allGaps.length - answeredCount;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[780px] p-0 gap-0 bg-card border-border overflow-hidden flex flex-col">
        <div className="flex overflow-hidden" style={{ height: "520px" }}>
          {/* LEFT COLUMN — gap list sidebar */}
          <div className="w-[30%] border-r border-border flex flex-col overflow-hidden">
            <div className="px-4 py-3 border-b border-border shrink-0">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-foreground font-heading">Knowledge Gaps</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-secondary text-muted-foreground ring-1 ring-border shrink-0">
                  {remainingCount} remaining
                </span>
              </div>
            </div>

            <div className="overflow-y-auto flex-1 p-2 space-y-1">
              {allGaps.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-6">No gaps found.</p>
              )}
              {allGaps.map((g) => {
                const isActive = g.field_path === activeGapPath;
                const isAnswered = answeredInSession[g.field_path] !== undefined;
                const isSkipped = skippedInSession.has(g.field_path);
                const isCritical = g.severity === "critical";
                return (
                  <button
                    key={g.field_path}
                    onClick={() => handleSelectGap(g.field_path)}
                    className={`w-full text-left rounded-lg p-2.5 transition-all ${
                      isActive
                        ? "bg-primary/10 ring-1 ring-primary/20"
                        : "hover:bg-secondary/60"
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <div className="shrink-0 mt-0.5">
                        {isAnswered ? (
                          <CheckCircle2 className={`h-3.5 w-3.5 ${minimal ? "text-foreground" : "text-glow-emerald"}`} />
                        ) : isSkipped ? (
                          <SkipForward className="h-3.5 w-3.5 text-muted-foreground" />
                        ) : (
                          <div
                            className={`h-3.5 w-3.5 rounded-full ring-1 ${
                              minimal
                                ? "ring-border bg-secondary"
                                : isCritical
                                ? "ring-destructive bg-destructive/10"
                                : "ring-glow-amber bg-glow-amber/10"
                            }`}
                          />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-semibold text-foreground leading-tight line-clamp-2">
                          {g.question}
                        </p>
                        <span
                          className={`text-[9px] font-bold mt-0.5 inline-block ${
                            minimal
                              ? "text-muted-foreground"
                              : isCritical
                              ? "text-destructive"
                              : "text-glow-amber"
                          }`}
                        >
                          {isCritical ? "Critical" : "Important"}
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* RIGHT COLUMN — active gap form */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {noUnansweredLeft || activeGapPath === null ? (
              /* Completion state */
              <div className="flex-1 flex flex-col items-center justify-center p-10 text-center">
                <div
                  className={`flex h-14 w-14 items-center justify-center rounded-2xl mb-4 ${
                    minimal
                      ? "bg-secondary ring-1 ring-border"
                      : "bg-glow-emerald/10 ring-1 ring-glow-emerald/20"
                  }`}
                >
                  <CheckCircle2
                    className={`h-7 w-7 ${minimal ? "text-foreground" : "text-glow-emerald"}`}
                  />
                </div>
                <p className="text-sm font-bold text-foreground mb-1">All gaps answered</p>
                <p className="text-xs text-muted-foreground">Hit Done to save everything.</p>
              </div>
            ) : activeGap ? (
              /* Active gap form */
              <div className="flex-1 flex flex-col p-6 overflow-y-auto">
                <div className="flex items-center gap-2 mb-4 shrink-0">
                  <span
                    className={`text-[11px] font-bold px-2.5 py-1 rounded-full ring-1 ${
                      minimal
                        ? "bg-secondary text-foreground ring-border"
                        : activeGap.severity === "critical"
                        ? "bg-destructive/10 text-destructive ring-destructive/20"
                        : "bg-glow-amber/10 text-glow-amber ring-glow-amber/20"
                    }`}
                  >
                    {activeGap.severity === "critical" ? "Critical" : "Important"}
                  </span>
                  <code className="text-[10px] text-muted-foreground/60 font-mono truncate">
                    {activeGap.field_path}
                  </code>
                </div>

                <h3 className="text-base font-bold text-foreground font-heading mb-2 shrink-0">
                  {activeGap.question}
                </h3>

                {activeGap.why_needed && (
                  <p className="text-xs text-muted-foreground mb-4 shrink-0">
                    <span className="font-semibold text-foreground/70">Why this matters: </span>
                    {activeGap.why_needed}
                  </p>
                )}

                <Textarea
                  ref={textareaRef}
                  value={currentAnswer}
                  onChange={(e) => setCurrentAnswer(e.target.value)}
                  placeholder="Type your answer here..."
                  className="flex-1 min-h-[120px] bg-secondary/50 border-border rounded-xl resize-none text-sm"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSaveAnswer();
                  }}
                />

                <div className="flex items-center justify-end gap-2 mt-3 shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleSkip}
                    className="text-xs font-semibold gap-1.5 rounded-lg text-muted-foreground"
                  >
                    <SkipForward className="h-3.5 w-3.5" />
                    Skip
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleSaveAnswer}
                    disabled={!currentAnswer.trim()}
                    className="bg-primary hover:bg-primary/90 text-xs font-bold gap-1.5 rounded-lg"
                  >
                    <Check className="h-3.5 w-3.5" />
                    Save answer
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        {/* BOTTOM BAR */}
        <div className="border-t border-border px-5 py-3 flex items-center justify-between shrink-0">
          <span className="text-xs text-muted-foreground">
            <span className="font-bold text-foreground">{answeredCount}</span> of {allGaps.length} answered
          </span>
          <div className="flex items-center gap-2">
            {submitError && (
              <span className="text-xs text-destructive">{submitError}</span>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="text-xs font-semibold rounded-lg"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => submitMutation.mutate()}
              disabled={answeredCount === 0 || submitMutation.isPending}
              className="bg-primary hover:bg-primary/90 text-xs font-bold rounded-lg px-4"
            >
              {submitMutation.isPending ? "Saving..." : "Done"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default GapFillDialog;
