import * as React from "react";
import {
  Calendar,
  GitCompare,
  Scale,
  Activity,
  ShieldCheck,
  RotateCcw,
  Info,
  Check,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { ProfileType } from "@/lib/profile-type";

/**
 * Persistent global dashboard filter bar.
 *
 * Designed as a decision-oriented navigation aid (not a settings panel)
 * that helps users answer:  "What am I looking at, compared to what,
 * at which level?".
 *
 * Filters are visually grouped into clusters (Time, Comparison,
 * Measurement, Scope) with subtle dividers and small caption labels.
 * Defaults adapt to the active role (hotel user / VPO / central) and
 * sections can de-emphasise filters that are less relevant in context.
 *
 * State is local — filters react instantly, no Apply button.
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

/** Visual emphasis hint per filter group, set by the parent section. */
export type FilterGroupKey =
  | "time"
  | "comparison"
  | "measurement"
  | "metrics"
  | "data";
export type FilterEmphasis = Partial<
  Record<FilterGroupKey, "primary" | "default" | "muted">
>;

export const DEFAULT_DASHBOARD_FILTERS: DashboardFiltersValue = {
  period: "year",
  comparison: "yoy",
  normalization: "per_room",
  scope: "hotel",
  metrics: ["electricity", "gas", "water", "waste", "co2e"],
  dataStatus: "all",
};

/** Recommended defaults per role. The label drives the Reset action copy. */
export function recommendedFiltersForRole(role: ProfileType): {
  values: DashboardFiltersValue;
  label: string;
} {
  switch (role) {
    case "vpo":
      return {
        label: "VPO view — portfolio consistency",
        values: {
          period: "ytd",
          comparison: "yoy",
          normalization: "per_room",
          scope: "portfolio",
          metrics: ["electricity", "gas", "water", "waste", "co2e"],
          dataStatus: "all",
        },
      };
    case "super_admin":
      return {
        label: "Central view — governance & coverage",
        values: {
          period: "year",
          comparison: "target",
          normalization: "absolute",
          scope: "group",
          metrics: ["electricity", "gas", "water", "waste", "co2e"],
          dataStatus: "missing",
        },
      };
    case "hotel_user":
    default:
      return {
        label: "Hotel view — daily steering",
        values: {
          period: "ytd",
          comparison: "yoy",
          normalization: "per_room",
          scope: "hotel",
          metrics: ["electricity", "water", "waste"],
          dataStatus: "all",
        },
      };
  }
}

/** Smart context line that summarises the active filter selection. */
export function summariseFilters(value: DashboardFiltersValue): string {
  const periodMap: Record<DashPeriod, string> = {
    month: "the latest month",
    quarter: "the latest quarter",
    year: "the last 12 months",
    ytd: "Year-to-Date data",
    custom: "your custom range",
  };
  const normMap: Record<DashNormalization, string> = {
    absolute: "in absolute values",
    per_room: "normalized per room",
    per_guest: "normalized per guest",
  };
  const compMap: Record<DashComparison, string> = {
    none: "with no comparison",
    mom: "compared month-over-month",
    yoy: "compared year-over-year",
    target: "compared to target",
  };
  return `Showing ${periodMap[value.period]}, ${normMap[value.normalization]}, ${compMap[value.comparison]}.`;
}

const PERIOD_OPTIONS: Array<{ value: DashPeriod; label: string; hint: string }> = [
  { value: "month", label: "Month", hint: "Latest reported month only" },
  { value: "quarter", label: "Quarter", hint: "Last three months" },
  { value: "year", label: "Year", hint: "Trailing 12 months" },
  { value: "ytd", label: "YTD", hint: "Year-to-date — Jan to today" },
  { value: "custom", label: "Custom", hint: "Pick any date range" },
];

const COMPARISON_OPTIONS: Array<{
  value: DashComparison;
  label: string;
  hint: string;
}> = [
  { value: "none", label: "No compare", hint: "Show absolute values only" },
  { value: "mom", label: "MoM", hint: "Versus previous month" },
  { value: "yoy", label: "YoY", hint: "Versus same month last year" },
  { value: "target", label: "vs Target", hint: "Versus the reduction target" },
];

const NORM_OPTIONS: Array<{
  value: DashNormalization;
  label: string;
  hint: string;
}> = [
  { value: "absolute", label: "Absolute", hint: "Raw consumption — no adjustment" },
  {
    value: "per_room",
    label: "per room",
    hint: "Adjusts values based on occupancy",
  },
  {
    value: "per_guest",
    label: "per guest",
    hint: "Per guest-night — fairer cross-property comparison",
  },
];

const METRIC_OPTIONS: Array<{ value: DashMetric; label: string }> = [
  { value: "electricity", label: "Electricity" },
  { value: "gas", label: "Gas" },
  { value: "water", label: "Water" },
  { value: "waste", label: "Waste" },
  { value: "co2e", label: "CO₂e" },
];

const STATUS_OPTIONS: Array<{
  value: DashDataStatus;
  label: string;
  hint: string;
}> = [
  { value: "all", label: "All", hint: "All reported entries" },
  { value: "complete", label: "Complete", hint: "Only fully-reported months" },
  { value: "missing", label: "Missing", hint: "Months with at least one gap" },
  { value: "flagged", label: "Flagged", hint: "Values flagged by validity checks" },
  { value: "late", label: "Late", hint: "Submitted after the reporting deadline" },
];

/* ------------------------------ component -------------------------------- */

export function DashboardFilters({
  value,
  onChange,
  role = "hotel_user",
  emphasis,
  onReset,
}: {
  value: DashboardFiltersValue;
  onChange: (next: DashboardFiltersValue) => void;
  /** Active user role — drives the Reset target and the recommendation label. */
  role?: ProfileType;
  /** Per-section emphasis hints. Unspecified groups default to "default". */
  emphasis?: FilterEmphasis;
  /** Optional override for the Reset action. Defaults to recommended-for-role. */
  onReset?: () => void;
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

  const recommended = recommendedFiltersForRole(role);
  const handleReset = () => {
    if (onReset) onReset();
    else onChange(recommended.values);
  };

  const emp = (k: FilterGroupKey) => emphasis?.[k] ?? "default";

  return (
    <TooltipProvider delayDuration={200}>
      <div className="rounded-2xl border border-border bg-card/70 p-2.5 shadow-sm backdrop-blur-md">
        <div className="flex flex-wrap items-end gap-3">
          {/* 🕒 Time */}
          <Cluster label="Time" icon={Calendar} emphasis={emp("time")}>
            <SegGroup
              options={PERIOD_OPTIONS}
              value={value.period}
              onChange={(v) => update("period", v as DashPeriod)}
              emphasis={emp("time")}
            />
          </Cluster>

          <Divider />

          {/* 🔁 Comparison */}
          <Cluster label="Comparison" icon={GitCompare} emphasis={emp("comparison")}>
            <SegGroup
              options={COMPARISON_OPTIONS}
              value={value.comparison}
              onChange={(v) => update("comparison", v as DashComparison)}
              emphasis={emp("comparison")}
            />
          </Cluster>

          <Divider />

          {/* 📐 Measurement */}
          <Cluster label="Measurement" icon={Scale} emphasis={emp("measurement")}>
            <SegGroup
              options={NORM_OPTIONS}
              value={value.normalization}
              onChange={(v) => update("normalization", v as DashNormalization)}
              emphasis={emp("measurement")}
            />
          </Cluster>

          <Divider />

          {/* 📊 Scope (metrics + data) */}
          <Cluster label="Scope" icon={Activity} emphasis="default">
            <div className="flex flex-wrap items-center gap-1.5">
              <MetricsPicker
                value={value.metrics}
                onToggle={toggleMetric}
                emphasis={emp("metrics")}
              />
              <DataStatusPicker
                value={value.dataStatus}
                onChange={(v) => update("dataStatus", v)}
                emphasis={emp("data")}
              />
            </div>
          </Cluster>

          {/* Reset to recommended */}
          <div className="ml-auto flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={handleReset}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-[11px] font-medium text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
                >
                  <RotateCcw className="h-3 w-3" />
                  Reset to recommended view
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {recommended.label}
              </TooltipContent>
            </Tooltip>
          </div>
        </div>

        {/* Smart context line — updates live as filters change */}
        <div className="mt-2.5 flex items-center gap-1.5 border-t border-border/50 px-1 pt-2 text-[11.5px] text-muted-foreground">
          <Info className="h-3 w-3 shrink-0 text-primary/70" />
          <span>{summariseFilters(value)}</span>
        </div>
      </div>
    </TooltipProvider>
  );
}

/* ------------------------------- internals ------------------------------- */

function Cluster({
  label,
  icon: Icon,
  emphasis,
  children,
}: {
  label: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  emphasis: "primary" | "default" | "muted";
  children: React.ReactNode;
}) {
  const labelTone =
    emphasis === "primary"
      ? "text-primary"
      : emphasis === "muted"
        ? "text-muted-foreground/60"
        : "text-muted-foreground";
  const wrap =
    emphasis === "muted" ? "opacity-70" : emphasis === "primary" ? "" : "";
  return (
    <div className={`flex flex-col gap-1 ${wrap}`}>
      <span
        className={`inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${labelTone}`}
      >
        <Icon className="h-3 w-3" />
        {label}
      </span>
      <div>{children}</div>
    </div>
  );
}

function Divider() {
  return (
    <span
      aria-hidden
      className="hidden h-9 w-px self-end bg-border/60 sm:inline-block"
    />
  );
}

interface SegOption<T extends string> {
  value: T;
  label: string;
  hint: string;
}

function SegGroup<T extends string>({
  options,
  value,
  onChange,
  emphasis,
}: {
  options: SegOption<T>[];
  value: T;
  onChange: (v: T) => void;
  emphasis: "primary" | "default" | "muted";
}) {
  const wrap =
    emphasis === "primary"
      ? "bg-primary/10 ring-1 ring-primary/20"
      : "bg-muted/50";
  return (
    <div className={`inline-flex items-center rounded-full p-1 ${wrap}`}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <Tooltip key={opt.value}>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => onChange(opt.value)}
                aria-pressed={active}
                className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition ${
                  active
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {opt.label}
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-[220px]">
              {opt.hint}
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}

function MetricsPicker({
  value,
  onToggle,
  emphasis,
}: {
  value: DashMetric[];
  onToggle: (m: DashMetric) => void;
  emphasis: "primary" | "default" | "muted";
}) {
  const summary =
    value.length === METRIC_OPTIONS.length
      ? "All metrics"
      : value.length === 1
        ? METRIC_OPTIONS.find((o) => o.value === value[0])?.label ?? "1 metric"
        : `${value.length} metrics`;
  const wrap =
    emphasis === "primary"
      ? "bg-primary/10 ring-1 ring-primary/20 text-foreground"
      : emphasis === "muted"
        ? "bg-muted/40 text-muted-foreground/80"
        : "bg-muted/50 text-foreground";
  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <button
              type="button"
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-medium transition hover:bg-muted ${wrap}`}
            >
              <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                Metrics
              </span>
              <span>{summary}</span>
            </button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          Choose which metrics appear in the charts
        </TooltipContent>
      </Tooltip>
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
                  {active && <Check className="h-3.5 w-3.5 text-primary" />}
                </button>
              </li>
            );
          })}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

function DataStatusPicker({
  value,
  onChange,
  emphasis,
}: {
  value: DashDataStatus;
  onChange: (v: DashDataStatus) => void;
  emphasis: "primary" | "default" | "muted";
}) {
  const current = STATUS_OPTIONS.find((o) => o.value === value) ?? STATUS_OPTIONS[0];
  const wrap =
    emphasis === "primary"
      ? "bg-primary/10 ring-1 ring-primary/20 text-foreground"
      : emphasis === "muted"
        ? "bg-muted/40 text-muted-foreground/80"
        : "bg-muted/50 text-foreground";
  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <button
              type="button"
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-medium transition hover:bg-muted ${wrap}`}
            >
              <ShieldCheck className="h-3 w-3 text-muted-foreground" />
              <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                Data
              </span>
              <span>{current.label}</span>
            </button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom">{current.hint}</TooltipContent>
      </Tooltip>
      <PopoverContent
        align="start"
        className="w-60 rounded-2xl border border-border bg-card p-2 shadow-xl"
      >
        <ul className="space-y-1">
          {STATUS_OPTIONS.map((opt) => {
            const active = opt.value === value;
            return (
              <li key={opt.value}>
                <button
                  type="button"
                  onClick={() => onChange(opt.value)}
                  className={`flex w-full items-start justify-between gap-2 rounded-xl px-2.5 py-1.5 text-left text-xs transition ${
                    active
                      ? "bg-primary/10 text-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  <span className="flex-1">
                    <span className="block font-medium">{opt.label}</span>
                    <span className="block text-[10.5px] text-muted-foreground">
                      {opt.hint}
                    </span>
                  </span>
                  {active && <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />}
                </button>
              </li>
            );
          })}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
