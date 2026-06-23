import { useState } from "react";
import { Github, Loader2, X, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

interface Props {
  open: boolean;
  onClose: () => void;
  orgId: number | null;
  /** Tweaks copy for org vs creator context. */
  context?: "organisation" | "creator";
}

/**
 * Reusable GitHub import dialog. Streams progress from
 * POST /api/organisations/:orgId/github/import and invalidates product queries
 * on completion. Used by both the org dashboard and the creator dashboard.
 */
const GithubImportModal = ({ open, onClose, orgId, context = "organisation" }: Props) => {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [username, setUsername] = useState("");
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [done, setDone] = useState(false);

  if (!open) return null;

  const run = async () => {
    if (!orgId || !username.trim()) { setMsg("Enter a GitHub username."); return; }
    setBusy(true); setDone(false); setProgress(null); setMsg("Connecting to GitHub…");
    try {
      const res = await fetch(`/api/organisations/${orgId}/github/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), token: token.trim() || undefined }),
        credentials: "include",
      });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({}));
        const err = j.error || "Could not start import.";
        setMsg(err); setBusy(false);
        toast({ title: "GitHub import failed", description: err, variant: "destructive" });
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let fatal: string | null = null;
      let importedCount = 0;
      while (true) {
        const { done: rdone, value } = await reader.read();
        if (rdone) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const evt = JSON.parse(line.slice(6));
            if (evt.type === "status") setMsg(evt.message);
            if (evt.type === "progress") { setProgress({ current: evt.current, total: evt.total }); setMsg(`Importing ${evt.repo}…`); }
            if (evt.type === "fatal") fatal = evt.error;
            if (evt.type === "done") { importedCount = evt.imported; setMsg(`Imported ${evt.imported} project${evt.imported === 1 ? "" : "s"}.`); setDone(true); }
          } catch { /* skip */ }
        }
      }
      if (fatal) {
        setMsg(fatal);
        toast({ title: "GitHub import failed", description: fatal, variant: "destructive" });
      } else {
        queryClient.invalidateQueries({ queryKey: ["/api/products"] });
        queryClient.invalidateQueries({ queryKey: [`/api/organisations/${orgId}/profile`] });
        toast({ title: "Repositories imported", description: `Added ${importedCount} project${importedCount === 1 ? "" : "s"}.` });
      }
    } catch {
      setMsg("Import failed.");
      toast({ title: "GitHub import failed", description: "The import failed unexpectedly.", variant: "destructive" });
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => !busy && onClose()}>
      <div className="surface-card rounded-2xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-secondary ring-1 ring-border">
              <Github className="h-4.5 w-4.5 text-foreground" />
            </div>
            <h3 className="font-heading font-bold text-foreground">Import from GitHub</h3>
          </div>
          <button onClick={() => !busy && onClose()} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
        <p className="text-sm text-muted-foreground mt-2 mb-5">
          {context === "creator"
            ? "We'll read your public repos and turn each into a project with its own landing page."
            : "Pull public repos in as products so Kaizen can analyse what you've built."}
        </p>

        <div className="space-y-3">
          <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="GitHub username (or profile URL)" className="h-10 rounded-xl" disabled={busy} autoFocus onKeyDown={(e) => e.key === "Enter" && run()} />
          <Input value={token} onChange={(e) => setToken(e.target.value)} placeholder="Personal access token (optional)" type="password" className="h-10 rounded-xl" disabled={busy} />
          <p className="text-[11px] text-muted-foreground">A token raises the GitHub rate limit from 60 to 5000 req/hr — useful for many repos.</p>
        </div>

        {msg && (
          <div className="mt-4 text-sm text-muted-foreground flex items-center gap-2">
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            <span>{msg}</span>
            {progress && <span className="text-xs">({progress.current}/{progress.total})</span>}
          </div>
        )}

        <div className="flex gap-2 mt-6">
          {done ? (
            <Button onClick={onClose} className="flex-1 bg-primary hover:bg-primary/90 rounded-xl">Done</Button>
          ) : (
            <Button onClick={run} disabled={busy} className="flex-1 gap-2 bg-primary hover:bg-primary/90 rounded-xl">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUpRight className="h-4 w-4" />} Import repos
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default GithubImportModal;
