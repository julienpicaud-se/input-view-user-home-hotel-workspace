import * as React from "react";
import { BookOpen, Download, CheckCircle2, AlertTriangle, Sparkles } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Card } from "@/components/ui/card";

/**
 * Standardized chart block used across every dashboard tab.
 *
 * Layout: title + subtitle, optional aside (legend), the chart area,
 * and a footer with mini-actions:
 *   - "How to read this chart" (popover with plain-language guidance)
 *   - Optional download / export (calls onDownload when provided)
 *   - Small data status note (complete / sample / missing)
 *
 * Goal: maximise information density and keep every chart in the
 * dashboard visually consistent. The "How to read" pattern matches
 * the per-section helper already used by DashboardSection so users
 * learn the affordance once.
 */

export type ChartBlockStatus = "complete" | "sample" | "missing";

export interface ChartBlockHowTo {
  intro: string;
  bullets?: string[];
}

export function ChartBlock({
  title,
  subtitle,
  aside,
  status = "complete",
  statusLabel,
  howToRead,
  onDownload,
  children,
  className,
  dense = false,
}: {
  title: string;
  subtitle?: string;
  aside?: React.ReactNode;
  status?: ChartBlockStatus;
  /** Optional override for the status pill label. */
  statusLabel?: string;
  howToRead: ChartBlockHowTo;
  onDownload?: () => void;
  children: React.ReactNode;
  className?: string;
  /** Tighter padding for compact blocks (used in 2-column grids). */
  dense?: boolean;
}) {
  return (
    <Card
      className={`overflow-hidden rounded-3xl border border-border/70 bg-card/80 shadow-sm transition hover:border-primary/30 ${className ?? ""}`}
    >
      <div className={`${dense ? "px-4 pt-4 pb-1.5" : "px-6 pt-6 pb-2"}`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3
              className={`font-serif font-semibold text-foreground ${dense ? "text-base" : "text-lg"}`}
            >
              {title}
            </h3>
            {subtitle && (
              <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
            )}
          </div>
          {aside && <div className="shrink-0">{aside}</div>}
        </div>
      </div>
      <div className={dense ? "px-1 pb-1" : "px-2 pb-2"}>{children}</div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 bg-muted/20 px-4 py-2.5">
        <StatusNote status={status} label={statusLabel} />
        <div className="flex items-center gap-1.5">
          {onDownload && (
            <button
              type="button"
              onClick={onDownload}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition hover:border-primary/30 hover:text-foreground"
            >
              <Download className="h-3 w-3" />
              Export
            </button>
          )}
          <HowToReadButton title={title} howToRead={howToRead} />
        </div>
      </div>
    </Card>
  );
}

function StatusNote({
  status,
  label,
}: {
  status: ChartBlockStatus;
  label?: string;
}) {
  const map = {
    complete: {
      Icon: CheckCircle2,
      cls: "text-emerald-500/90",
      text: label ?? "Data complete",
    },
    sample: {
      Icon: Sparkles,
      cls: "text-primary/80",
      text: label ?? "Sample data",
    },
    missing: {
      Icon: AlertTriangle,
      cls: "text-amber-500/90",
      text: label ?? "Some values missing",
    },
  } as const;
  const { Icon, cls, text } = map[status];
  return (
    <div className={`inline-flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.12em] ${cls}`}>
      <Icon className="h-3 w-3" />
      {text}
    </div>
  );
}

export function HowToReadButton({
  title,
  howToRead,
}: {
  title: string;
  howToRead: ChartBlockHowTo;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-1 rounded-full border border-foreground/15 bg-foreground/[0.04] px-2.5 py-1 text-[11px] font-medium text-foreground transition hover:border-primary/40 hover:bg-primary/5"
          aria-label={`How to read ${title}`}
        >
          <BookOpen className="h-3 w-3" />
          How to read
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[min(92vw,360px)] rounded-2xl border border-border bg-card p-0 shadow-xl"
      >
        <div className="border-b border-border/60 bg-muted/30 px-4 py-3">
          <div className="flex items-center gap-2">
            <BookOpen className="h-3.5 w-3.5 text-primary" />
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              How to read
            </span>
          </div>
          <p className="mt-1 text-sm font-medium text-foreground">{title}</p>
        </div>
        <div className="space-y-2.5 px-4 py-4 text-[13px]">
          <p className="leading-relaxed text-muted-foreground">{howToRead.intro}</p>
          {howToRead.bullets && howToRead.bullets.length > 0 && (
            <ul className="space-y-1.5">
              {howToRead.bullets.map((b, i) => (
                <li
                  key={i}
                  className="rounded-lg bg-muted/40 px-2.5 py-1.5 text-[12.5px] leading-relaxed text-foreground/90"
                >
                  {b}
                </li>
              ))}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
