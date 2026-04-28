import * as React from "react";
import { BookOpen } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

/**
 * Wrapper for an interest-based dashboard section.
 *
 * Renders a header (title + subtitle) and exposes a consistent
 * "How to read this section" affordance in the top-right corner —
 * the same pattern across every section so users learn it once.
 *
 * The helper opens a popover with plain-language operational copy
 * tailored to the section. It complements (does not replace) the
 * per-chart "How to read this chart" explainer that already exists
 * on each ChartCard.
 */
export interface SectionHelpItem {
  q: string;
  a: string;
}

export function DashboardSection({
  id,
  title,
  subtitle,
  help,
  children,
}: {
  id: string;
  title: string;
  subtitle: string;
  help: {
    intro: string;
    items: SectionHelpItem[];
  };
  children: React.ReactNode;
}) {
  return (
    <section id={`section-${id}`} className="scroll-mt-20">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-serif text-lg font-semibold text-foreground sm:text-xl">
            {title}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
        </div>
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-card/60 px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:border-primary/40 hover:bg-primary/5 hover:text-foreground"
              aria-label={`How to read the ${title} section`}
            >
              <BookOpen className="h-3.5 w-3.5" />
              How to read this section
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="end"
            className="w-[min(92vw,420px)] rounded-2xl border border-border bg-card p-0 shadow-xl"
          >
            <div className="border-b border-border/60 bg-muted/30 px-4 py-3">
              <div className="flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-primary" />
                <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  How to read
                </span>
              </div>
              <p className="mt-1.5 text-sm font-medium text-foreground">
                {title}
              </p>
            </div>
            <div className="space-y-3 px-4 py-4 text-sm">
              <p className="text-muted-foreground">{help.intro}</p>
              <ul className="space-y-2.5">
                {help.items.map((it, idx) => (
                  <li key={idx} className="rounded-xl bg-muted/40 p-3">
                    <div className="text-[13px] font-semibold text-foreground">
                      {it.q}
                    </div>
                    <div className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                      {it.a}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </PopoverContent>
        </Popover>
      </div>
      <div className="space-y-6">{children}</div>
    </section>
  );
}
