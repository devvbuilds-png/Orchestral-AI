import { useMinimalMode, cycleMode } from "@/contexts/MinimalModeContext";
import { Sun, Moon, Minus } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const modeConfig = {
  dark: { icon: Moon, label: "Dark", color: "text-glow-purple" },
  light: { icon: Sun, label: "Light", color: "text-glow-amber" },
  minimal: { icon: Minus, label: "Minimal", color: "text-foreground" },
} as const;

const MinimalModeToggle = () => {
  const { mode, setMode } = useMinimalMode();
  const config = modeConfig[mode];
  const Icon = config.icon;

  return (
    <button
      onClick={() => setMode(cycleMode(mode))}
      className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-secondary/80 ring-1 ring-border/60 hover:ring-border hover:bg-secondary transition-all"
      title={`Mode: ${config.label} — click to cycle`}
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={mode}
          initial={{ scale: 0.5, opacity: 0, rotate: -90 }}
          animate={{ scale: 1, opacity: 1, rotate: 0 }}
          exit={{ scale: 0.5, opacity: 0, rotate: 90 }}
          transition={{ duration: 0.2 }}
        >
          <Icon className={`h-4 w-4 ${config.color}`} />
        </motion.div>
      </AnimatePresence>
    </button>
  );
};

export default MinimalModeToggle;
