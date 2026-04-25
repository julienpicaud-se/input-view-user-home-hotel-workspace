import * as React from "react";
import { Link } from "@tanstack/react-router";
import { Orbit, Building2 } from "lucide-react";

/**
 * Persistent two-tab nav for AI Theory mode so users can always
 * see — and reach — both surfaces (Stage home + Hotel workspace).
 */
export function TheoryNav({ active }: { active: "stage" | "workspace" }) {
  const base =
    "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all";
  const on =
    "bg-white/[0.12] text-white shadow-[0_0_20px_rgba(168,85,247,0.25)] ring-1 ring-white/15";
  const off = "text-white/55 hover:text-white/85";

  return (
    <nav
      aria-label="AI Theory sections"
      className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] p-1 backdrop-blur-md"
    >
      <Link
        to="/theory"
        className={`${base} ${active === "stage" ? on : off}`}
        aria-current={active === "stage" ? "page" : undefined}
      >
        <Orbit className="h-3.5 w-3.5" />
        Stage
      </Link>
      <Link
        to="/theory/workspace"
        className={`${base} ${active === "workspace" ? on : off}`}
        aria-current={active === "workspace" ? "page" : undefined}
      >
        <Building2 className="h-3.5 w-3.5" />
        Workspace
      </Link>
    </nav>
  );
}
