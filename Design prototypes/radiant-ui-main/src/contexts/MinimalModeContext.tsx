import { createContext, useContext, useState, useEffect, ReactNode } from "react";

export type ViewMode = "light" | "dark" | "minimal";

interface MinimalModeContextType {
  mode: ViewMode;
  setMode: (v: ViewMode) => void;
  minimal: boolean; // convenience: true when mode === "minimal"
  isLight: boolean; // convenience: true when mode === "light"
}

const MinimalModeContext = createContext<MinimalModeContextType>({
  mode: "dark",
  setMode: () => {},
  minimal: false,
  isLight: false,
});

export const useMinimalMode = () => useContext(MinimalModeContext);

const CYCLE_ORDER: ViewMode[] = ["dark", "light", "minimal"];

export const cycleMode = (current: ViewMode): ViewMode => {
  const idx = CYCLE_ORDER.indexOf(current);
  return CYCLE_ORDER[(idx + 1) % CYCLE_ORDER.length];
};

export const MinimalModeProvider = ({ children }: { children: ReactNode }) => {
  const [mode, setMode] = useState<ViewMode>("dark");
  const minimal = mode === "minimal";
  const isLight = mode === "light";

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("light-mode", "dark-mode", "minimal-mode");
    root.classList.add(`${mode}-mode`);
  }, [mode]);

  return (
    <MinimalModeContext.Provider value={{ mode, setMode, minimal, isLight }}>
      {children}
    </MinimalModeContext.Provider>
  );
};
