import * as React from "react";

/**
 * "Classic" = the original, dense pro design (sidebar, dashboards, dense charts).
 * "Simple" = an alternative, ultra-friendly design tailored for hotel managers
 * who only visit once a month. Same features, totally different UX.
 */
export type DesignMode = "classic" | "simple";

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
    return v === "simple" ? "simple" : "classic";
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
