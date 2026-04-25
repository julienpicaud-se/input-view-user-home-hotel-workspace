import * as React from "react";
import { Link } from "@tanstack/react-router";
import { Orbit, Building2 } from "lucide-react";

/**
 * Persistent Stage / Workspace tab bar for AI Theory mode.
 * The active tab is filled with the signature violet→fuchsia gradient,
 * carries a glow, and shows a small pulsing dot — so the current
 * surface is impossible to miss.
 */
export function TheoryNav({ active }: { active: "stage" | "workspace" }) {
  const base =
    "relative inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold tracking-wide transition-all sm:px-4 sm:text-sm";
  const on =
    "bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shadow-[0_0_24px_rgba(168,85,247,0.55)] ring-1 ring-white/30";
  const off =
    "text-white/55 hover:text-white hover:bg-white/[0.06]";

  return (
    <nav
      aria-label="AI Theory sections"
      className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-black/40 p-1 backdrop-blur-md"
    >
      <Link
        to="/theory"
        className={`${base} ${active === "stage" ? on : off}`}
        aria-current={active === "stage" ? "page" : undefined}
      >
        <Orbit className="h-3.5 w-3.5" />
        Stage
        {active === "stage" && (
          <span className="ml-1 h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
        )}
      </Link>
      <Link
        to="/theory/workspace"
        className={`${base} ${active === "workspace" ? on : off}`}
        aria-current={active === "workspace" ? "page" : undefined}
      >
        <Building2 className="h-3.5 w-3.5" />
        Workspace
        {active === "workspace" && (
          <span className="ml-1 h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
        )}
      </Link>
    </nav>
  );
}
