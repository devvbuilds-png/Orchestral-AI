import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Code2, Github } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useMinimalMode } from "@/contexts/MinimalModeContext";
import ParticleBackground from "@/components/particle-background";

interface Props {
  onComplete: () => void;
  onBack: () => void;
}

const CreatorSetup = ({ onComplete, onBack }: Props) => {
  const { minimal } = useMinimalMode();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [github, setGithub] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!name.trim()) { setError("Please add your name"); return; }
    setSubmitting(true);
    setError(null);
    try {
      const ghClean = github.trim().replace(/^@/, "").replace(/.*github\.com\//i, "").replace(/\/+$/, "");
      await apiRequest("POST", "/api/creators", {
        name: name.trim(),
        github_username: ghClean || undefined,
      });
      await queryClient.invalidateQueries({ queryKey: ["/api/organisations"] });
      onComplete();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create your workspace");
      setSubmitting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center outer-frame overflow-auto"
    >
      {!minimal && <ParticleBackground />}
      <div className="relative z-10 w-full max-w-lg px-6 py-12">
        <button onClick={onBack} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-8">
          <ArrowLeft className="h-4 w-4" /> Back
        </button>

        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/15 ring-1 ring-primary/30 mb-6">
          <Code2 className="h-6 w-6 text-primary" />
        </div>
        <h1 className="font-heading text-3xl font-bold text-foreground">Set up your builder profile</h1>
        <p className="font-body text-muted-foreground mt-3">
          Kaizen will turn your projects into a living portfolio. Start with your name and GitHub —
          you can connect more sources next.
        </p>

        <div className="surface-card rounded-2xl p-6 mt-8 space-y-5">
          <div>
            <label className="text-sm font-semibold text-foreground">Your name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Alex Rivera"
              className="mt-2 h-11 rounded-xl"
              autoFocus
            />
          </div>
          <div>
            <label className="text-sm font-semibold text-foreground flex items-center gap-1.5">
              <Github className="h-3.5 w-3.5" /> GitHub username <span className="text-muted-foreground font-normal">(optional)</span>
            </label>
            <Input
              value={github}
              onChange={(e) => setGithub(e.target.value)}
              placeholder="e.g. alexrivera"
              className="mt-2 h-11 rounded-xl"
              onKeyDown={(e) => e.key === "Enter" && submit()}
            />
            <p className="text-xs text-muted-foreground mt-1.5">We'll import your repos and build project pages automatically.</p>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button onClick={submit} disabled={submitting} className="w-full gap-2 bg-primary hover:bg-primary/90 rounded-xl h-11 font-semibold">
            {submitting ? "Creating…" : "Continue"} <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </motion.div>
  );
};

export default CreatorSetup;
