import { useState } from "react";
import { Target, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useMinimalMode } from "@/contexts/MinimalModeContext";

interface GapFillDialogProps {
  open: boolean;
  onClose: () => void;
  gap: {
    key: string;
    q: string;
    why: string;
    severity: string;
  } | null;
}

const GapFillDialog = ({ open, onClose, gap }: GapFillDialogProps) => {
  const [answer, setAnswer] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const { minimal } = useMinimalMode();

  const handleSubmit = () => {
    setSubmitted(true);
    setTimeout(() => {
      setSubmitted(false);
      setAnswer("");
      onClose();
    }, 1500);
  };

  if (!gap) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg bg-card border-border">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-1">
            <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${minimal ? "bg-secondary ring-1 ring-border" : "bg-glow-pink/10 ring-1 ring-glow-pink/20"}`}>
              <Target className={`h-4 w-4 ${minimal ? "text-muted-foreground" : "text-glow-pink"}`} />
            </div>
            <div>
              <DialogTitle className="text-foreground font-heading">Fill Knowledge Gap</DialogTitle>
              <DialogDescription className="text-muted-foreground mt-0.5">
                Provide an answer to improve confidence
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className={`rounded-xl p-4 border ${minimal ? "bg-secondary border-border" : "bg-glow-pink/5 border-glow-pink/20"}`}>
            <p className="text-sm font-bold text-foreground mb-1">{gap.q}</p>
            <p className="text-xs text-muted-foreground">{gap.why}</p>
            <div className="mt-2 flex items-center gap-2">
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ring-1 ${
                gap.severity === "Critical"
                  ? minimal ? "bg-secondary text-foreground ring-border" : "bg-glow-pink/10 text-glow-pink ring-glow-pink/20"
                  : minimal ? "bg-secondary text-foreground ring-border" : "bg-glow-amber/10 text-glow-amber ring-glow-amber/20"
              }`}>
                {gap.severity}
              </span>
              <code className="text-[10px] text-muted-foreground/60 font-mono">{gap.key}</code>
            </div>
          </div>

          {!submitted ? (
            <Textarea
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="Type your answer here..."
              className="min-h-[120px] bg-secondary/50 border-border rounded-xl resize-none text-sm"
            />
          ) : (
            <div className="flex flex-col items-center py-8 text-center">
              <div className={`flex h-12 w-12 items-center justify-center rounded-full mb-3 ${minimal ? "bg-secondary" : "bg-glow-emerald/15"}`}>
                <Send className={`h-5 w-5 ${minimal ? "text-foreground" : "text-glow-emerald"}`} />
              </div>
              <p className="text-sm font-bold text-foreground">Answer submitted!</p>
              <p className="text-xs text-muted-foreground mt-1">This gap will be re-evaluated.</p>
            </div>
          )}
        </div>

        {!submitted && (
          <DialogFooter>
            <Button variant="ghost" onClick={onClose} className="rounded-xl text-xs font-bold">
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!answer.trim()}
              className="rounded-xl text-xs font-bold bg-primary hover:bg-primary/90 gap-1.5"
            >
              <Send className="h-3.5 w-3.5" /> Submit Answer
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default GapFillDialog;
