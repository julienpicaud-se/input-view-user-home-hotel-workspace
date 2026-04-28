import * as React from "react";
import { Calendar, GitCompare, Scale, Globe, Activity, ShieldCheck, X } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

/**
 * Persistent global dashboard filter bar.
 *
 * Sits directly under the tab navigation. Filters apply across every
 * tab and are intentionally lightweight (local state, no URL sync) so
 * users can explore quickly without losing context.
 *
 * Most filters are visual-only on the charts that don't yet have a
 * data source for them — they always re-render the affected charts so
 * the experience feels live, but several views display a small
 * "Sample data" hint when the underlying series is illustrative.
 */

export type DashPeriod = "month" | "quarter" | "year" | "ytd" | "custom";
export type DashComparison = "none" | "mom" | "yoy" | "target";
export type DashNormalization = "absolute" | "per_room" | "per_guest";
export type DashScope = "hotel" | "portfolio" | "group";
export type DashMetric = "electricity" | "gas" | "water" | "waste" | "co2e";
export type DashDataStatus = "all" | "complete" | "missing" | "flagged" | "late";

export interface DashboardFiltersValue {
  period: DashPeriod;
  comparison: DashComparison;
  normalization: DashNormalization;
  scope: DashScope;
  metrics: DashMetric[];
  dataStatus: DashDataStatus;
  customRange?: { start: string; end: string };
}

export const DEFAULT_DASHBOARD_FILTERS: DashboardFiltersValue = {
  period: "year",
  comparison: "yoy",
  normalization: "per_room",
  scope: "hotel",
  metrics: ["electricity", "gas", "water", "waste", "co2e"],
  dataStatus: "all",
};

const PERIOD_OPTIONS: Array<{ value: DashPeriod; label: string }> = [
  { value: "month", label: "Month" },
  { value: "quarter", label: "Quarter" },
  { value: "year", label: "Year" },
  { value: "ytd", label: "YTD" },
  { value: "custom", label: "Custom" },
];

const COMPARISON_OPTIONS: Array<{ value: DashComparison; label: string }> = [
  { value: "none", label: "No compare" },
  { value: "mom", label: "MoM" },
  { value: "yoy", label: "YoY" },
  { value: "target", label: "vs Target" },
];

const NORM_OPTIONS: Array<{ value: DashNormalization; label: string }> = [
  { value: "absolute", label: "Absolute" },
  { value: "per_room", label: "per room" },
  { value: "per_guest", label: "per guest" },
];

const SCOPE_OPTIONS: Array<{ value: DashScope; label: string }> = [
  { value: "hotel", label: "Hotel" },
  { value: "portfolio", label: "Portfolio" },
  { value: "group", label: "Group" },
];

const METRIC_OPTIONS: Array<{ value: DashMetric; label: string }> = [
  { value: "electricity", label: "Electricity" },
  { value: "gas", label: "Gas" },
  { value: "water", label: "Water" },
  { value: "waste", label: "Waste" },
  { value: "co2e", label: "CO₂e" },
];

const STATUS_OPTIONS: Array<{ value: DashDataStatus; label: string }> = [
  { value: "all", label: "All" },
  { value: "complete", label: "Complete" },
  { value: "missing", label: "Missing" },
  { value: "flagged", label: "Flagged" },
  { value: "late", label: "Late" },
];

export function DashboardFilters({
  value,
  onChange,
  allowedScopes = ["hotel"],
}: {
  value: DashboardFiltersValue;
  onChange: (next: DashboardFiltersValue) => void;
  /** Role-aware scopes. Defaults to hotel-only. */
  allowedScopes?: DashScope[];
}) {
  const update = <K extends keyof DashboardFiltersValue>(
    key: K,
    next: DashboardFiltersValue[K],
  ) => onChange({ ...value, [key]: next });

  const toggleMetric = (m: DashMetric) => {
    const has = value.metrics.includes(m);
    const next = has
      ? value.metrics.filter((x) => x !== m)
      : [...value.metrics, m];
    if (next.length === 0) return; // never empty
    update("metrics", next);
  };

  const filteredScopes = SCOPE_OPTIONS.filter((s) =>
    allowedScopes.includes(s.value),
  );

  return (
    <div className="rounded-2xl border border-border bg-card/70 p-2 shadow-sm backdrop-blur-md">
      <div className="flex flex-wrap items-center gap-1.5">
        <SegGroup
          icon={Calendar}
          label="Period"
          options={PERIOD_OPTIONS}
          value={value.period}
          onChange={(v) => update("period", v as DashPeriod)}
        />
        <Divider />
        <SegGroup
          icon={GitCompare}
          label="Compare"
          options={COMPARISON_OPTIONS}
          value={value.comparison}
          onChange={(v) => update("comparison", v as DashComparison)}
        />
        <Divider />
        <SegGroup
          icon={Scale}
          label="Normalize"
          options={NORM_OPTIONS}
          value={value.normalization}
          onChange={(v) => update("normalization", v as DashNormalization)}
        />
        {filteredScopes.length > 1 && (
          <>
            <Divider />
            <SegGroup
              icon={Globe}
              label="Scope"
              options={filteredScopes}
              value={value.scope}
              onChange={(v) => update("scope", v as DashScope)}
            />
          </>
        )}
        <Divider />
        <MetricsPicker value={value.metrics} onToggle={toggleMetric} />
        <Divider />
        <SegGroup
          icon={ShieldCheck}
          label="Data"
          options={STATUS_OPTIONS}
          value={value.dataStatus}
          onChange={(v) => update("dataStatus", v as DashDataStatus)}
        />
      </div>
    </div>
  );
}

function Divider() {
  return <span className="hidden h-6 w-px bg-border/60 sm:inline-block" />;
}

function SegGroup<T extends string>({
  icon: Icon,
  label,
  options,
  value,
  onChange,
}: {
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  label: string;
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex items-center gap-1.5 rounded-full bg-muted/50 px-1.5 py-1">
      <span
        className="ml-1 inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground"
        aria-label={label}
      >
        <Icon className="h-3 w-3" />
        {label}
      </span>
      <div className="flex items-center">
        {options.map((opt) => {
          const active = opt.value === value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition ${
                active
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function MetricsPicker({
  value,
  onToggle,
}: {
  value: DashMetric[];
  onToggle: (m: DashMetric) => void;
}) {
  const summary =
    value.length === METRIC_OPTIONS.length
      ? "All metrics"
      : `${value.length} metric${value.length > 1 ? "s" : ""}`;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-full bg-muted/50 px-2.5 py-1.5 text-[11px] font-medium text-foreground transition hover:bg-muted"
        >
          <Activity className="h-3 w-3 text-muted-foreground" />
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Metrics
          </span>
          <span>{summary}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-56 rounded-2xl border border-border bg-card p-2 shadow-xl"
      >
        <ul className="space-y-1">
          {METRIC_OPTIONS.map((opt) => {
            const active = value.includes(opt.value);
            return (
              <li key={opt.value}>
                <button
                  type="button"
                  onClick={() => onToggle(opt.value)}
                  className={`flex w-full items-center justify-between rounded-xl px-2.5 py-1.5 text-xs font-medium transition ${
                    active
                      ? "bg-primary/10 text-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  <span>{opt.label}</span>
                  {active ? (
                    <span className="text-[10px] uppercase tracking-wider text-primary">
                      On
                    </span>
                  ) : (
                    <X className="h-3 w-3 opacity-50" />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
