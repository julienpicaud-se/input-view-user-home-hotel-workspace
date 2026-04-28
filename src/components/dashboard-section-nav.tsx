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
 * Sticky pill-bar nav that jumps the user between the dashboard's
 * interest-based sections and highlights the section currently in view.
 * Visual style mirrors the existing top tabs (rounded pill, dark active
 * state) to feel native to the page.
 */
export function DashboardSectionNav({
  sections = DASHBOARD_SECTIONS,
}: {
  sections?: DashboardSectionDef[];
}) {
  const [active, setActive] = React.useState<string>(sections[0]?.id ?? "");

  React.useEffect(() => {
    const visible = new Map<string, number>();
    const observers: IntersectionObserver[] = [];

    for (const s of sections) {
      const el = document.getElementById(`section-${s.id}`);
      if (!el) continue;
      const obs = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              visible.set(s.id, entry.intersectionRatio);
            } else {
              visible.delete(s.id);
            }
          }
          let best: string | null = null;
          let bestVal = 0;
          for (const [k, v] of visible) {
            if (v > bestVal) {
              bestVal = v;
              best = k;
            }
          }
          if (best) setActive(best);
        },
        { rootMargin: "-25% 0px -60% 0px", threshold: [0, 0.25, 0.5, 1] },
      );
      obs.observe(el);
      observers.push(obs);
    }
    return () => observers.forEach((o) => o.disconnect());
  }, [sections]);

  function jump(id: string) {
    const el = document.getElementById(`section-${id}`);
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY - 88;
    window.scrollTo({ top, behavior: "smooth" });
    setActive(id);
  }

  return (
    <div className="sticky top-2 z-20 -mx-2 mb-4 px-2 sm:-mx-4 sm:px-4">
      <div className="overflow-x-auto rounded-full border border-border bg-card/85 p-1 shadow-sm backdrop-blur-md">
        <div className="flex min-w-max items-center gap-1">
          {sections.map((s) => {
            const isActive = active === s.id;
            const Icon = s.Icon;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => jump(s.id)}
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
    </div>
  );
}
