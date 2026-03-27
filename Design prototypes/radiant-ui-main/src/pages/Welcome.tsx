import { motion } from "framer-motion";
import { ArrowRight, Brain, Lightbulb, RefreshCw, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import ParticleBackground from "@/components/ParticleBackground";
import { useMinimalMode } from "@/contexts/MinimalModeContext";

interface WelcomeProps {
  onGetStarted: () => void;
}

const features = [
  {
    icon: "🧠",
    minimalIcon: Brain,
    title: "Ask anything",
    description: "Chat with your product knowledge like it's a teammate who never forgets.",
  },
  {
    icon: "💡",
    minimalIcon: Lightbulb,
    title: "Know what's missing",
    description: "Auto-detects gaps in your knowledge base and tells you exactly what to fill in.",
  },
  {
    icon: "🔄",
    minimalIcon: RefreshCw,
    title: "Always improving",
    description: "Every conversation, doc, and update makes the knowledge base smarter over time.",
  },
];

const Welcome = ({ onGetStarted }: WelcomeProps) => {
  const { minimal } = useMinimalMode();

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
        {/* Badge */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 text-sm font-medium text-primary">
            <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
            New workspace
          </span>
        </motion.div>

        {/* Hero */}
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          className="font-heading text-5xl md:text-6xl font-bold tracking-tight text-foreground mt-8 leading-tight"
        >
          One brain.
          <br />
          All your products.
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="font-body text-base md:text-lg text-muted-foreground mt-6 max-w-2xl leading-relaxed"
        >
          Every product your company builds carries a universe of knowledge — decisions, features, context, gaps.
          Orchestral-AI brings it all into one place so anyone on your team can ask questions, find answers, and keep it growing.
        </motion.p>

        {/* Feature Cards */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.65 }}
          className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-12 w-full"
        >
          {features.map((feature, i) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.7 + i * 0.1 }}
              className="surface-card rounded-xl p-6 text-left"
            >
              <div className="mb-4">
                {minimal ? (
                  <feature.minimalIcon className="h-6 w-6 text-muted-foreground" />
                ) : (
                  <span className="text-2xl">{feature.icon}</span>
                )}
              </div>
              <h3 className="font-heading text-sm font-bold text-foreground mb-2">{feature.title}</h3>
              <p className="font-body text-xs text-muted-foreground leading-relaxed">{feature.description}</p>
            </motion.div>
          ))}
        </motion.div>

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1 }}
          className="mt-10"
        >
          <Button
            onClick={onGetStarted}
            className="gap-2 bg-primary hover:bg-primary/90 rounded-xl font-semibold text-base h-12 px-8"
          >
            Get started
            <ArrowRight className="h-4 w-4" />
          </Button>
        </motion.div>

        {/* Branding */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.2 }}
          className="flex items-center gap-2 mt-16 opacity-50"
        >
          <Zap className="h-3.5 w-3.5 text-primary" />
          <span className="font-heading text-xs font-medium text-muted-foreground">
            Powered by Orchestral<span className="text-primary">-AI</span>
          </span>
        </motion.div>
      </div>
    </motion.div>
  );
};

export default Welcome;
