import * as React from "react";

/**
 * "Classic"      = the original, dense pro design (sidebar, dashboards, dense charts).
 * "Simple"       = a calmer, manager-friendly multi-page experience.
 * "Extra Simple" = a single-page, near-zero-click experience for managers
 *                  who only visit once a month.
 * "AI First"     = chat-led experience: Sera drives everything (insights,
 *                  recommendations, next actions, data entry) through a
 *                  single conversational surface.
 * "AI Theory"    = immersive theatre where Sera is omnipresent — a hovering
 *                  orb that follows the user, narrates everything, turns
 *                  every action into a single conversational gesture.
 */
export type DesignMode = "classic" | "simple" | "extra-simple" | "ai-first" | "ai-theory";

const STORAGE_KEY = "ra-plus-design-mode";

interface DesignModeContextValue {
  mode: DesignMode;
  setMode: (m: DesignMode) => void;
}

const DesignModeContext = React.createContext<DesignModeContextValue | null>(null);

function readInitial(): DesignMode {
  if (typeof window === "undefined") return "classic";
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    if (v === "simple") return "simple";
    if (v === "extra-simple") return "extra-simple";
    if (v === "ai-first") return "ai-first";
    if (v === "ai-theory") return "ai-theory";
    return "classic";
  } catch {
    return "classic";
  }
}

export function DesignModeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = React.useState<DesignMode>("classic");

  // Hydrate from localStorage on mount (avoids SSR mismatch).
  React.useEffect(() => {
    setModeState(readInitial());
  }, []);

  const setMode = React.useCallback((m: DesignMode) => {
    setModeState(m);
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(STORAGE_KEY, m);
      } catch {
        // ignore quota errors
      }
    }
  }, []);

  const value = React.useMemo(() => ({ mode, setMode }), [mode, setMode]);

  return (
    <DesignModeContext.Provider value={value}>
      {children}
    </DesignModeContext.Provider>
  );
}

export function useDesignMode(): DesignModeContextValue {
  const ctx = React.useContext(DesignModeContext);
  if (!ctx) {
    // Safe fallback so consumers never crash if the provider is missing.
    return { mode: "classic", setMode: () => {} };
  }
  return ctx;
}
