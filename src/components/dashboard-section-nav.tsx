import * as React from "react";
import {
  Activity,
  Zap,
  Cloud,
  BarChart3,
  Database,
  type LucideIcon,
} from "lucide-react";

export interface DashboardSectionDef {
  id: string;
  label: string;
  Icon?: LucideIcon;
}

export const DASHBOARD_SECTIONS: DashboardSectionDef[] = [
  { id: "ops", label: "Operational", Icon: Activity },
  { id: "energy-water", label: "Energy & Water", Icon: Zap },
  { id: "carbon", label: "Carbon", Icon: Cloud },
  { id: "benchmarks", label: "Benchmarks", Icon: BarChart3 },
  { id: "data-quality", label: "Data quality", Icon: Database },
];

/**
 * Pill-bar nav for the dashboard's interest-based sections.
 * Controlled: parent owns the active section so it can swap which
 * section is rendered (one at a time, with a swipe animation).
 */
export function DashboardSectionNav({
  active,
  onChange,
  sections = DASHBOARD_SECTIONS,
}: {
  active: string;
  onChange: (id: string) => void;
  sections?: DashboardSectionDef[];
}) {
  return (
    <div className="overflow-x-auto rounded-full border border-border bg-card/85 p-1 shadow-sm backdrop-blur-md">
      <div className="flex min-w-max items-center gap-1">
        {sections.map((s) => {
          const isActive = active === s.id;
          const Icon = s.Icon;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => onChange(s.id)}
              aria-current={isActive ? "true" : undefined}
              className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-medium transition-all sm:text-sm ${
                isActive
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              {Icon && <Icon className="h-3.5 w-3.5" />}
              {s.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
