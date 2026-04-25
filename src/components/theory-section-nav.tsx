import * as React from "react";
import {
  Sparkles,
  LineChart,
  History,
  Users,
  Upload,
  Settings as SettingsIcon,
  CheckSquare,
} from "lucide-react";

export type TheorySectionId =
  | "log"
  | "analyze"
  | "history"
  | "benchmarks"
  | "import"
  | "todos"
  | "settings";

interface SectionDef {
  id: TheorySectionId;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
}

const SECTIONS: SectionDef[] = [
  { id: "log", label: "Log", Icon: Sparkles },
  { id: "analyze", label: "Analyze", Icon: LineChart },
  { id: "history", label: "History", Icon: History },
  { id: "benchmarks", label: "Benchmarks", Icon: Users },
  { id: "import", label: "Import", Icon: Upload },
  { id: "todos", label: "To-dos", Icon: CheckSquare },
  { id: "settings", label: "Settings", Icon: SettingsIcon },
];

/**
 * Sticky pill bar that scrolls the user to each in-page section.
 * Highlights whichever section is currently in view.
 */
export function TheorySectionNav() {
  const [active, setActive] = React.useState<TheorySectionId>("log");

  React.useEffect(() => {
    const observers: IntersectionObserver[] = [];
    const visible = new Map<TheorySectionId, number>();

    for (const s of SECTIONS) {
      const el = document.getElementById(`theory-section-${s.id}`);
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
          // pick the section with the largest intersection ratio
          let best: TheorySectionId | null = null;
          let bestVal = 0;
          for (const [k, v] of visible) {
            if (v > bestVal) {
              bestVal = v;
              best = k;
            }
          }
          if (best) setActive(best);
        },
        { rootMargin: "-30% 0px -55% 0px", threshold: [0, 0.25, 0.5, 1] },
      );
      obs.observe(el);
      observers.push(obs);
    }
    return () => observers.forEach((o) => o.disconnect());
  }, []);

  function jump(id: TheorySectionId) {
    const el = document.getElementById(`theory-section-${id}`);
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY - 80;
    window.scrollTo({ top, behavior: "smooth" });
    setActive(id);
  }

  return (
    <div className="sticky top-2 z-20 -mx-5 mb-6 px-5 sm:-mx-8 sm:px-8">
      <div className="overflow-x-auto rounded-full border border-white/10 bg-black/55 p-1 shadow-[0_10px_40px_rgba(0,0,0,0.4)] backdrop-blur-xl scrollbar-thin">
        <div className="flex min-w-max items-center gap-1">
          {SECTIONS.map((s) => {
            const isActive = active === s.id;
            return (
              <button
                key={s.id}
                onClick={() => jump(s.id)}
                className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
                  isActive
                    ? "bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shadow-[0_0_20px_rgba(168,85,247,0.45)]"
                    : "text-white/55 hover:bg-white/[0.06] hover:text-white/90"
                }`}
                aria-current={isActive ? "true" : undefined}
              >
                <s.Icon className="h-3.5 w-3.5" />
                {s.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** Wrapper that registers a scroll-anchor for the section nav. */
export function TheorySection({
  id,
  title,
  subtitle,
  children,
  className = "",
}: {
  id: TheorySectionId;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      id={`theory-section-${id}`}
      className={`mb-10 scroll-mt-24 ${className}`}
    >
      <header className="mb-4">
        <h2 className="font-serif text-2xl text-white sm:text-3xl">{title}</h2>
        {subtitle && <p className="mt-1 text-sm text-white/55">{subtitle}</p>}
      </header>
      {children}
    </section>
  );
}
