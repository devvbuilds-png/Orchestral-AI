import { motion } from "framer-motion";
import { ArrowRight, Building2, Code2, Github, FileText, Network } from "lucide-react";
import KaizenMark from "@/components/KaizenMark";
import ParticleBackground from "@/components/particle-background";
import { useMinimalMode } from "@/contexts/MinimalModeContext";

export type WorkspaceKind = "organisation" | "creator";

interface WelcomeProps {
  // Back-compat: some callers passed onGetStarted; prefer onChoose.
  onGetStarted?: () => void;
  onChoose?: (kind: WorkspaceKind) => void;
}

const Welcome = ({ onGetStarted, onChoose }: WelcomeProps) => {
  const { minimal } = useMinimalMode();
  const choose = (kind: WorkspaceKind) => {
    if (onChoose) onChoose(kind);
    else if (onGetStarted) onGetStarted();
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center outer-frame overflow-auto"
    >
      {!minimal && <ParticleBackground />}

      <div className="relative z-10 flex flex-col items-center px-6 py-16 max-w-4xl mx-auto text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 text-sm font-medium text-primary">
            <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
            Welcome to Kaizen
          </span>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          className="font-heading text-5xl md:text-6xl font-bold tracking-tight text-foreground mt-8 leading-tight"
        >
          The context layer for
          <br />
          everything you build.
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="font-body text-base md:text-lg text-muted-foreground mt-6 max-w-2xl leading-relaxed"
        >
          Kaizen understands your work — repos, docs, and decisions — and turns it into living knowledge.
          How do you want to start?
        </motion.p>

        {/* Two paths */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-12 w-full">
          {/* Vibe coder */}
          <motion.button
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.65 }}
            onClick={() => choose("creator")}
            className="group surface-card rounded-2xl p-7 text-left ring-1 ring-border hover:ring-primary/50 transition-all hover:-translate-y-1"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/15 ring-1 ring-primary/30 mb-5">
              <Code2 className="h-6 w-6 text-primary" />
            </div>
            <h3 className="font-heading text-xl font-bold text-foreground">I'm a Vibe Coder</h3>
            <p className="font-body text-sm text-muted-foreground mt-2 leading-relaxed">
              Connect your GitHub, drop in your resume or sites. Kaizen builds a living portfolio that
              explains who you are, what you build, and how it all connects.
            </p>
            <div className="flex flex-wrap gap-2 mt-5">
              {[{ i: Github, t: "Connect GitHub" }, { i: FileText, t: "Upload resume" }, { i: Network, t: "Auto portfolio" }].map(({ i: Icon, t }) => (
                <span key={t} className="inline-flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground bg-secondary/60 rounded-full px-2.5 py-1 ring-1 ring-border/50">
                  <Icon className="h-3 w-3" />{t}
                </span>
              ))}
            </div>
            <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary mt-6 group-hover:gap-2.5 transition-all">
              Build my portfolio <ArrowRight className="h-4 w-4" />
            </span>
          </motion.button>

          {/* Organisation */}
          <motion.button
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.75 }}
            onClick={() => choose("organisation")}
            className="group surface-card rounded-2xl p-7 text-left ring-1 ring-border hover:ring-primary/50 transition-all hover:-translate-y-1"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-secondary ring-1 ring-border mb-5">
              <Building2 className="h-6 w-6 text-foreground" />
            </div>
            <h3 className="font-heading text-xl font-bold text-foreground">We're an Organisation</h3>
            <p className="font-body text-sm text-muted-foreground mt-2 leading-relaxed">
              A shared Central Intelligence for your team. Capture product knowledge, answer questions,
              detect gaps, and keep everyone aligned across every product you ship.
            </p>
            <div className="flex flex-wrap gap-2 mt-5">
              {["Product PKBs", "Team chat", "Gap detection", "GitHub analysis"].map((t) => (
                <span key={t} className="text-[11px] font-medium text-muted-foreground bg-secondary/60 rounded-full px-2.5 py-1 ring-1 ring-border/50">{t}</span>
              ))}
            </div>
            <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground mt-6 group-hover:gap-2.5 group-hover:text-primary transition-all">
              Set up our workspace <ArrowRight className="h-4 w-4" />
            </span>
          </motion.button>
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.1 }}
          className="flex items-center gap-2 mt-16 opacity-50"
        >
          <KaizenMark className="h-4 w-4" />
          <span className="font-heading text-xs font-medium text-muted-foreground">Powered by Kaizen</span>
        </motion.div>
      </div>
    </motion.div>
  );
};

export default Welcome;
