import * as React from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  Line,
  LineChart,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as ReTooltip,
  CartesianGrid,
  ComposedChart,
  Legend,
  ReferenceLine,
  Cell,
} from "recharts";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Trophy,
  Target,
  Zap,
  Droplets,
  Flame,
  Trash2,
  Cloud,
  type LucideIcon,
} from "lucide-react";
import { ChartBlock, type ChartBlockStatus } from "@/components/chart-block";
import { type MonthlyEntry } from "@/lib/hotel";
import { MONTH_SHORT, MONTH_NAMES, calculateCO2e, formatNumber } from "@/lib/format";
import type { DashboardFiltersValue, DashMetric } from "@/components/dashboard-filters";

/* ----------------------------- shared helpers ---------------------------- */

const COLORS = {
  electricity: "var(--chart-3)",
  gas: "var(--chart-1)",
  water: "var(--chart-2)",
  waste: "var(--chart-5)",
  co2e: "var(--champagne)",
  prev: "var(--muted-foreground)",
} as const;

const TOOLTIP_STYLE = {
  backgroundColor: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  fontSize: 12,
} as const;

function sortEntries(entries: MonthlyEntry[]): MonthlyEntry[] {
  return [...entries].sort((a, b) =>
    a.year !== b.year ? a.year - b.year : a.month - b.month,
  );
}

function periodWindow(period: DashboardFiltersValue["period"]): number {
  switch (period) {
    case "month":
      return 1;
    case "quarter":
      return 3;
    case "year":
      return 12;
    case "ytd":
      return new Date().getMonth() + 1;
    case "custom":
      return 12;
  }
}

function normLabel(n: DashboardFiltersValue["normalization"]): string {
  if (n === "absolute") return "";
  if (n === "per_room") return " / room-night";
  return " / guest";
}

function divisor(
  e: MonthlyEntry,
  n: DashboardFiltersValue["normalization"],
): number {
  if (n === "absolute") return 1;
  // Approx: per_guest assumed ~1.6x room nights
  const rn = e.occupied_room_nights || 1;
  if (n === "per_room") return rn;
  return rn * 1.6;
}

function metricEnabled(filters: DashboardFiltersValue, m: DashMetric): boolean {
  return filters.metrics.includes(m);
}

function shortMonth(e: MonthlyEntry): string {
  return `${MONTH_SHORT[e.month - 1]} ${String(e.year).slice(2)}`;
}

/** Generates a deterministic pseudo-random number based on a key — used for
 *  illustrative charts where real data isn't yet available. */
function seeded(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = (h * 16777619) >>> 0;
  }
  return (h % 1000) / 1000;
}

/* ============================================================================
 *                            OPERATIONAL TAB CHARTS
 * ========================================================================== */

export function OpsIntensityTrend({
  entries,
  filters,
}: {
  entries: MonthlyEntry[];
  filters: DashboardFiltersValue;
}) {
  const window = periodWindow(filters.period);
  const data = sortEntries(entries)
    .slice(-window)
    .map((e) => {
      const d = divisor(e, filters.normalization === "absolute" ? "per_room" : filters.normalization);
      return {
        label: shortMonth(e),
        electricity: e.electricity_kwh ? e.electricity_kwh / d : 0,
        gas: e.gas_kwh ? e.gas_kwh / d : 0,
        water: e.water_m3 ? e.water_m3 / d : 0,
      };
    });
  return (
    <ChartBlock
      title={`Intensity trend${normLabel(filters.normalization === "absolute" ? "per_room" : filters.normalization)}`}
      subtitle="Energy & water normalised by activity — strips out occupancy noise."
      status={data.length >= 6 ? "complete" : "missing"}
      howToRead={{
        intro:
          "Intensity removes the impact of occupancy. A flat absolute curve with a rising intensity line means the hotel got less efficient even though it was quieter.",
        bullets: [
          "Compare months with similar seasonality (e.g. June vs June).",
          "Sustained drift up = check setpoints, schedules, leaks.",
          "Toggle 'per guest' in the filter bar when occupancy mix shifts.",
        ],
      }}
    >
      <div className="h-56 px-2 pb-3 md:px-4">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 12, right: 12, left: 0, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
            <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
            <ReTooltip contentStyle={TOOLTIP_STYLE} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {metricEnabled(filters, "electricity") && (
              <Line type="monotone" dataKey="electricity" stroke={COLORS.electricity} strokeWidth={2} dot={false} name="Elec" />
            )}
            {metricEnabled(filters, "gas") && (
              <Line type="monotone" dataKey="gas" stroke={COLORS.gas} strokeWidth={2} dot={false} name="Gas" />
            )}
            {metricEnabled(filters, "water") && (
              <Line type="monotone" dataKey="water" stroke={COLORS.water} strokeWidth={2} dot={false} name="Water" />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </ChartBlock>
  );
}

export function OpsVarianceDrivers({
  entries,
  filters,
}: {
  entries: MonthlyEntry[];
  filters: DashboardFiltersValue;
}) {
  const sorted = sortEntries(entries);
  const latest = sorted[sorted.length - 1];
  const prev = sorted[sorted.length - 2];
  const lastYear =
    latest && sorted.find((e) => e.year === latest.year - 1 && e.month === latest.month);
  const reference = filters.comparison === "yoy" ? lastYear : prev;
  const compareLabel = filters.comparison === "yoy" ? "YoY" : "MoM";
  const rows: Array<{ key: string; label: string; delta: number }> = [];
  if (latest && reference) {
    const fields: Array<{ key: DashMetric; label: string; get: (e: MonthlyEntry) => number }> = [
      { key: "electricity", label: "Electricity", get: (e) => e.electricity_kwh ?? 0 },
      { key: "gas", label: "Gas", get: (e) => e.gas_kwh ?? 0 },
      { key: "water", label: "Water", get: (e) => e.water_m3 ?? 0 },
      { key: "waste", label: "Waste", get: (e) => e.waste_kg ?? 0 },
      { key: "co2e", label: "CO₂e", get: (e) => calculateCO2e(e) },
    ];
    for (const f of fields) {
      if (!metricEnabled(filters, f.key)) continue;
      const a = f.get(latest);
      const b = f.get(reference);
      if (!b) continue;
      rows.push({ key: f.key, label: f.label, delta: ((a - b) / b) * 100 });
    }
  }
  rows.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  const data = rows.map((r) => ({ ...r, deltaRound: Math.round(r.delta * 10) / 10 }));
  return (
    <ChartBlock
      title="Variance & drivers"
      subtitle={`Largest ${compareLabel} swings across your KPIs.`}
      status={data.length > 0 ? "complete" : "missing"}
      howToRead={{
        intro:
          "Each bar shows how much a metric moved versus the comparison period selected in the filter bar. Long bars = large changes — investigate first.",
        bullets: [
          "Green bars are reductions (good). Red bars are increases.",
          "Very long single bars often indicate a meter or invoice issue.",
          "Use this with the intensity chart to confirm it's not just occupancy.",
        ],
      }}
    >
      <div className="h-56 px-2 pb-3 md:px-4">
        {data.length === 0 ? (
          <EmptyState message="Need at least two reporting periods to compute variance." />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart layout="vertical" data={data} margin={{ top: 8, right: 24, left: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} unit="%" />
              <YAxis type="category" dataKey="label" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} width={80} />
              <ReTooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => `${v}%`} />
              <ReferenceLine x={0} stroke="var(--border)" />
              <Bar dataKey="deltaRound" radius={[0, 6, 6, 0]}>
                {data.map((row) => (
                  <Cell key={row.key} fill={row.delta > 0 ? "var(--chart-1)" : "var(--chart-4, #16a34a)"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </ChartBlock>
  );
}

export function OpsSustainabilityActions() {
  // Illustrative completion view (no actions table yet)
  const items = [
    { label: "Energy efficiency programme", done: 6, total: 8 },
    { label: "Waste reduction & recycling", done: 4, total: 7 },
    { label: "Water saving initiatives", done: 5, total: 6 },
    { label: "Sustainable sourcing", done: 2, total: 5 },
  ];
  const totalPct = Math.round(
    (items.reduce((s, i) => s + i.done, 0) / items.reduce((s, i) => s + i.total, 0)) * 100,
  );
  return (
    <ChartBlock
      title="Sustainability actions progress"
      subtitle={`${totalPct}% of programme actions in progress or completed.`}
      status="sample"
      howToRead={{
        intro:
          "A high-level completion view of the hotel's sustainability action plan. Use it as a daily reminder of what's pending — open the Actions module for full detail.",
        bullets: [
          "Each bar = % complete for one action programme.",
          "Programmes below 50% deserve a check-in this month.",
        ],
      }}
    >
      <div className="space-y-3 px-5 pb-5 pt-2">
        {items.map((it) => {
          const pct = Math.round((it.done / it.total) * 100);
          return (
            <div key={it.label}>
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="font-medium text-foreground">{it.label}</span>
                <span className="tabular-nums text-muted-foreground">
                  {it.done}/{it.total} · {pct}%
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </ChartBlock>
  );
}

/* ============================================================================
 *                        ENERGY & WATER TAB CHARTS
 * ========================================================================== */

export function EnergyTrend({
  entries,
  filters,
}: {
  entries: MonthlyEntry[];
  filters: DashboardFiltersValue;
}) {
  const window = periodWindow(filters.period);
  const data = sortEntries(entries)
    .slice(-window)
    .map((e) => ({
      label: shortMonth(e),
      electricity: e.electricity_kwh ?? 0,
      gas: e.gas_kwh ?? 0,
    }));
  return (
    <ChartBlock
      title="Energy carriers — trend"
      subtitle="Electricity vs gas, side by side."
      status={data.length >= 3 ? "complete" : "missing"}
      howToRead={{
        intro:
          "Two energy carriers tracked separately. A divergence between the two lines often reflects fuel switching, weather, or a faulty boiler.",
        bullets: [
          "Gas peaks in winter, electricity in summer.",
          "If gas drops sharply year-round, check the BMS schedule.",
        ],
      }}
    >
      <div className="h-56 px-2 pb-3 md:px-4">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 12, right: 12, left: 0, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
            <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
            <ReTooltip contentStyle={TOOLTIP_STYLE} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {metricEnabled(filters, "electricity") && (
              <Line type="monotone" dataKey="electricity" stroke={COLORS.electricity} strokeWidth={2} dot={false} name="Electricity (kWh)" />
            )}
            {metricEnabled(filters, "gas") && (
              <Line type="monotone" dataKey="gas" stroke={COLORS.gas} strokeWidth={2} dot={false} name="Gas (kWh)" />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </ChartBlock>
  );
}

export function WaterTrend({
  entries,
  filters,
}: {
  entries: MonthlyEntry[];
  filters: DashboardFiltersValue;
}) {
  const window = periodWindow(filters.period);
  const data = sortEntries(entries)
    .slice(-window)
    .map((e) => {
      const rn = e.occupied_room_nights || 1;
      return {
        label: shortMonth(e),
        absolute: e.water_m3 ?? 0,
        intensity: e.water_m3 ? (e.water_m3 * 1000) / rn : 0, // L per room-night
      };
    });
  return (
    <ChartBlock
      title="Water — consumption & intensity"
      subtitle="Absolute m³ alongside L per room-night."
      status={data.length >= 3 ? "complete" : "missing"}
      howToRead={{
        intro:
          "Water often hides leaks. Absolute volume can stay flat while intensity climbs because occupancy dropped — that gap is the early warning.",
        bullets: [
          "Sudden intensity spike with no event → check irrigation & cooling tower.",
          "Use the data quality tab to verify late readings before reacting.",
        ],
      }}
    >
      <div className="h-56 px-2 pb-3 md:px-4">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 12, right: 12, left: 0, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
            <YAxis yAxisId="l" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
            <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
            <ReTooltip contentStyle={TOOLTIP_STYLE} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar yAxisId="l" dataKey="absolute" fill={COLORS.water} fillOpacity={0.5} radius={[4, 4, 0, 0]} name="Volume (m³)" />
            <Line yAxisId="r" type="monotone" dataKey="intensity" stroke={COLORS.water} strokeWidth={2.5} dot={false} name="L / room-night" />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </ChartBlock>
  );
}

export function EnergyMix({
  entries,
  filters,
}: {
  entries: MonthlyEntry[];
  filters: DashboardFiltersValue;
}) {
  const window = periodWindow(filters.period);
  const data = sortEntries(entries)
    .slice(-window)
    .map((e) => {
      const elec = e.electricity_kwh ?? 0;
      const gas = e.gas_kwh ?? 0;
      const total = elec + gas || 1;
      return {
        label: shortMonth(e),
        electricity: Math.round((elec / total) * 1000) / 10,
        gas: Math.round((gas / total) * 1000) / 10,
      };
    });
  return (
    <ChartBlock
      title="Energy mix"
      subtitle="Share of total energy: electricity vs gas."
      status={data.length > 0 ? "complete" : "missing"}
      howToRead={{
        intro:
          "Stacked share of energy consumption. Use this to track electrification — a rising green share means less fossil fuel in the mix.",
        bullets: [
          "Electrification of heating is the strongest CO₂e lever.",
          "Compare the mix in winter months year-over-year.",
        ],
      }}
    >
      <div className="h-56 px-2 pb-3 md:px-4">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 12, right: 12, left: 0, bottom: 8 }} stackOffset="expand">
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
            <YAxis tickFormatter={(v) => `${Math.round(v * 100)}%`} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
            <ReTooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => `${v}%`} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Area type="monotone" dataKey="electricity" stackId="1" stroke={COLORS.electricity} fill={COLORS.electricity} fillOpacity={0.6} name="Electricity %" />
            <Area type="monotone" dataKey="gas" stackId="1" stroke={COLORS.gas} fill={COLORS.gas} fillOpacity={0.6} name="Gas %" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </ChartBlock>
  );
}

export function AnomalyDetection({
  entries,
  filters,
}: {
  entries: MonthlyEntry[];
  filters: DashboardFiltersValue;
}) {
  const sorted = sortEntries(entries);
  const window = periodWindow(filters.period);
  const slice = sorted.slice(-window);
  // mean + std on electricity intensity
  const series = slice.map((e) => (e.electricity_kwh ?? 0) / (e.occupied_room_nights || 1));
  const mean = series.reduce((s, x) => s + x, 0) / Math.max(series.length, 1);
  const std =
    Math.sqrt(series.reduce((s, x) => s + (x - mean) ** 2, 0) / Math.max(series.length, 1));
  const data = slice.map((e, i) => {
    const v = series[i];
    const z = std > 0 ? (v - mean) / std : 0;
    return {
      label: shortMonth(e),
      value: Math.round(v * 100) / 100,
      anomaly: Math.abs(z) > 1.2 ? v : null,
    };
  });
  return (
    <ChartBlock
      title="Anomaly drift — electricity"
      subtitle="Highlights months that break the seasonal pattern."
      status="complete"
      howToRead={{
        intro:
          "We compute the average and variance of electricity intensity, then flag months that sit more than ~1.2 standard deviations away. Those points are not always bugs — but always worth a look.",
        bullets: [
          "Highlighted dot = unusual vs your own history.",
          "Cross-check with weather, occupancy, and event calendar.",
        ],
      }}
    >
      <div className="h-56 px-2 pb-3 md:px-4">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 12, right: 12, left: 0, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
            <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
            <ReTooltip contentStyle={TOOLTIP_STYLE} />
            <ReferenceLine y={mean} stroke="var(--muted-foreground)" strokeDasharray="4 4" label={{ value: "avg", fontSize: 10, fill: "var(--muted-foreground)" }} />
            <Line type="monotone" dataKey="value" stroke={COLORS.electricity} strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="anomaly" stroke="var(--chart-1)" strokeWidth={0} dot={{ r: 6, fill: "var(--chart-1)", stroke: "var(--card)", strokeWidth: 2 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </ChartBlock>
  );
}

export function HourlyLoadProfile({
  resource = "energy",
}: {
  resource?: "energy" | "water";
}) {
  // Synthetic hourly profile (Lot 2b illustrative)
  const data = Array.from({ length: 24 }, (_, h) => {
    const base = resource === "energy" ? 38 : 12;
    const morning = h >= 6 && h <= 10 ? 18 : 0;
    const evening = h >= 18 && h <= 22 ? 24 : 0;
    const noise = seeded(`${resource}-${h}`) * 5;
    return { hour: `${String(h).padStart(2, "0")}:00`, value: Math.round(base + morning + evening + noise) };
  });
  const peak = data.reduce((a, b) => (b.value > a.value ? b : a));
  const isWater = resource === "water";
  return (
    <ChartBlock
      title={isWater ? "Water — hourly profile (sample)" : "Energy — hourly load profile (sample)"}
      subtitle={`Typical day · peak ${peak.hour} (${peak.value}${isWater ? " L/h" : " kW"})`}
      status="sample"
      howToRead={{
        intro:
          "Granular hourly steering view — only available when sub-meters or smart meters are connected (Accor Lot 2b). The shape highlights when consumption peaks.",
        bullets: [
          "Twin peaks usually = breakfast service + evening turndown.",
          "A flat night-time floor that rises is a strong leak signal.",
        ],
      }}
    >
      <div className="h-56 px-2 pb-3 md:px-4">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 12, right: 12, left: 0, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="hour" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} interval={2} />
            <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
            <ReTooltip contentStyle={TOOLTIP_STYLE} />
            <Area
              type="monotone"
              dataKey="value"
              stroke={isWater ? COLORS.water : COLORS.electricity}
              fill={isWater ? COLORS.water : COLORS.electricity}
              fillOpacity={0.35}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </ChartBlock>
  );
}

/* ============================================================================
 *                              CARBON TAB CHARTS
 * ========================================================================== */

export function CarbonYoYTrend({
  entries,
  filters,
}: {
  entries: MonthlyEntry[];
  filters: DashboardFiltersValue;
}) {
  const sorted = sortEntries(entries);
  const window = periodWindow(filters.period);
  const last = sorted.slice(-window);
  const data = last.map((e) => {
    const prev = sorted.find((x) => x.year === e.year - 1 && x.month === e.month);
    return {
      label: shortMonth(e),
      current: Math.round(calculateCO2e(e)),
      previous: prev ? Math.round(calculateCO2e(prev)) : null,
    };
  });
  return (
    <ChartBlock
      title="CO₂e — current vs last year"
      subtitle="Year-over-year overlay highlights real change."
      status={data.some((d) => d.previous != null) ? "complete" : "missing"}
      howToRead={{
        intro:
          "The dotted line is the same month last year. When the solid line stays below it, you are emitting less than a year ago for the same month.",
        bullets: [
          "Look at the gap, not the absolute level.",
          "A widening downward gap = your decarbonisation is accelerating.",
        ],
      }}
    >
      <div className="h-56 px-2 pb-3 md:px-4">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 12, right: 12, left: 0, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
            <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
            <ReTooltip contentStyle={TOOLTIP_STYLE} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line type="monotone" dataKey="current" stroke={COLORS.co2e} strokeWidth={2.5} dot={false} name="Current year" />
            <Line type="monotone" dataKey="previous" stroke={COLORS.prev} strokeWidth={1.5} strokeDasharray="4 4" dot={false} name="Previous year" />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </ChartBlock>
  );
}

export function CarbonBreakdown({
  entries,
}: {
  entries: MonthlyEntry[];
}) {
  const sorted = sortEntries(entries).slice(-12);
  const data = sorted.map((e) => {
    const elec = (e.electricity_kwh ?? 0) * 0.233;
    const gas = (e.gas_kwh ?? 0) * 0.184;
    const water = (e.water_m3 ?? 0) * 0.34;
    const waste = (e.waste_kg ?? 0) * 0.467;
    return {
      label: shortMonth(e),
      electricity: Math.round(elec),
      gas: Math.round(gas),
      water: Math.round(water),
      waste: Math.round(waste),
    };
  });
  return (
    <ChartBlock
      title="Emissions breakdown by source"
      subtitle="kg CO₂e split across electricity, gas, water and waste."
      status={data.length > 0 ? "complete" : "missing"}
      howToRead={{
        intro:
          "Stacked bars show which utility contributes most to your emissions. The biggest slice is usually your fastest decarbonisation lever.",
        bullets: [
          "If electricity dominates, focus on grid mix & PPA contracts.",
          "If gas dominates, evaluate heat pumps or hybrid systems.",
        ],
      }}
    >
      <div className="h-56 px-2 pb-3 md:px-4">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 12, right: 12, left: 0, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
            <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
            <ReTooltip contentStyle={TOOLTIP_STYLE} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="electricity" stackId="c" fill={COLORS.electricity} />
            <Bar dataKey="gas" stackId="c" fill={COLORS.gas} />
            <Bar dataKey="water" stackId="c" fill={COLORS.water} />
            <Bar dataKey="waste" stackId="c" fill={COLORS.waste} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartBlock>
  );
}

export function CarbonIntensityTrend({
  entries,
  filters,
}: {
  entries: MonthlyEntry[];
  filters: DashboardFiltersValue;
}) {
  const window = periodWindow(filters.period);
  const data = sortEntries(entries)
    .slice(-window)
    .map((e) => {
      const d = divisor(e, filters.normalization === "absolute" ? "per_room" : filters.normalization);
      return {
        label: shortMonth(e),
        intensity: Math.round((calculateCO2e(e) / d) * 100) / 100,
      };
    });
  return (
    <ChartBlock
      title={`Carbon intensity${normLabel(filters.normalization === "absolute" ? "per_room" : filters.normalization)}`}
      subtitle="kg CO₂e per unit of activity."
      status={data.length >= 3 ? "complete" : "missing"}
      howToRead={{
        intro:
          "Intensity removes the impact of occupancy. A flat line at falling absolute emissions can mean you decarbonised — or just had fewer guests. This chart tells the difference.",
      }}
    >
      <div className="h-56 px-2 pb-3 md:px-4">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 12, right: 12, left: 0, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
            <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
            <ReTooltip contentStyle={TOOLTIP_STYLE} />
            <Area type="monotone" dataKey="intensity" stroke={COLORS.co2e} fill={COLORS.co2e} fillOpacity={0.35} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </ChartBlock>
  );
}

export function CarbonContribution({
  entries,
}: {
  entries: MonthlyEntry[];
}) {
  const sorted = sortEntries(entries);
  const latest = sorted[sorted.length - 1];
  const prev = sorted.find(
    (e) => latest && e.year === latest.year - 1 && e.month === latest.month,
  );
  const rows = [
    { key: "electricity", label: "Electricity", curr: (latest?.electricity_kwh ?? 0) * 0.233, prevV: (prev?.electricity_kwh ?? 0) * 0.233 },
    { key: "gas", label: "Gas", curr: (latest?.gas_kwh ?? 0) * 0.184, prevV: (prev?.gas_kwh ?? 0) * 0.184 },
    { key: "water", label: "Water", curr: (latest?.water_m3 ?? 0) * 0.34, prevV: (prev?.water_m3 ?? 0) * 0.34 },
    { key: "waste", label: "Waste", curr: (latest?.waste_kg ?? 0) * 0.467, prevV: (prev?.waste_kg ?? 0) * 0.467 },
  ];
  const data = rows.map((r) => ({ label: r.label, delta: Math.round(r.curr - r.prevV) }));
  return (
    <ChartBlock
      title="Contribution analysis"
      subtitle="Drivers of CO₂e change vs same month last year."
      status={prev ? "complete" : "missing"}
      howToRead={{
        intro:
          "Each bar shows how many kg CO₂e a driver added (red) or saved (green) compared to the same month last year. The biggest red bar is the priority.",
      }}
    >
      <div className="h-56 px-2 pb-3 md:px-4">
        {!prev ? (
          <EmptyState message="Need a year of history to compare drivers." />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart layout="vertical" data={data} margin={{ top: 8, right: 24, left: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
              <YAxis type="category" dataKey="label" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} width={80} />
              <ReTooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => `${v} kg`} />
              <ReferenceLine x={0} stroke="var(--border)" />
              <Bar dataKey="delta" radius={[0, 6, 6, 0]}>
                {data.map((row) => (
                  <Cell key={row.label} fill={row.delta > 0 ? "var(--chart-1)" : "var(--chart-4, #16a34a)"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </ChartBlock>
  );
}

export function CarbonTargetProgress({
  entries,
}: {
  entries: MonthlyEntry[];
}) {
  const sorted = sortEntries(entries);
  const latest = sorted[sorted.length - 1];
  const lastYear = sorted.find(
    (e) => latest && e.year === latest.year - 1 && e.month === latest.month,
  );
  if (!latest || !lastYear) {
    return (
      <ChartBlock
        title="Target progress"
        subtitle="Trajectory vs the Accor reduction target."
        status="missing"
        howToRead={{
          intro: "Need at least one year of history to evaluate trajectory vs the target.",
        }}
      >
        <div className="px-5 pb-5 pt-2">
          <EmptyState message="Add monthly data for the prior year to enable target tracking." />
        </div>
      </ChartBlock>
    );
  }
  const curr = calculateCO2e(latest);
  const target = calculateCO2e(lastYear) * 0.95; // -5% YoY
  const onTrack = curr <= target;
  const pct = Math.round(((curr - target) / target) * 100);
  return (
    <ChartBlock
      title="Target progress"
      subtitle="Trajectory vs the −5% YoY reduction target."
      status="complete"
      howToRead={{
        intro:
          "Compares the latest month's CO₂e against the YoY target. Below = on track, above = off track. Used to steer monthly action plans.",
      }}
    >
      <div className="grid grid-cols-3 gap-3 px-5 pb-5 pt-2">
        <Stat label="This month" value={`${formatNumber(curr)} kg`} hint="actual CO₂e" />
        <Stat label="Target" value={`${formatNumber(target)} kg`} hint="−5% vs LY" />
        <Stat
          label={onTrack ? "On track" : "Off track"}
          value={`${pct > 0 ? "+" : ""}${pct}%`}
          hint="vs target"
          tone={onTrack ? "good" : "warn"}
        />
      </div>
    </ChartBlock>
  );
}

/* ============================================================================
 *                            BENCHMARKS TAB CHARTS
 * ========================================================================== */

export function PeerPercentileRank({ filters }: { filters: DashboardFiltersValue }) {
  // Illustrative percentile per KPI.
  const items = [
    { key: "electricity", label: "Electricity", icon: Zap, percentile: 32, color: COLORS.electricity },
    { key: "gas", label: "Gas", icon: Flame, percentile: 58, color: COLORS.gas },
    { key: "water", label: "Water", icon: Droplets, percentile: 18, color: COLORS.water },
    { key: "waste", label: "Waste", icon: Trash2, percentile: 71, color: COLORS.waste },
    { key: "co2e", label: "Carbon", icon: Cloud, percentile: 41, color: COLORS.co2e },
  ].filter((it) => filters.metrics.includes(it.key as DashMetric));
  return (
    <ChartBlock
      title="Peer rank — by KPI"
      subtitle="Where the hotel sits in its cohort (lower percentile = more efficient)."
      status="sample"
      howToRead={{
        intro:
          "Each row is one KPI. The dot shows your percentile in the cohort. The leftmost band (top 25%) is the best.",
        bullets: [
          "Top 25% — leader, share the playbook.",
          "Middle 50% — typical, mature optimisation needed.",
          "Bottom 25% — clear improvement opportunity.",
        ],
      }}
    >
      <div className="space-y-3 px-5 pb-5 pt-2">
        {items.map((it) => (
          <PercentileRow key={it.key} label={it.label} icon={it.icon} percentile={it.percentile} color={it.color} />
        ))}
      </div>
    </ChartBlock>
  );
}

function PercentileRow({
  label,
  icon: Icon,
  percentile,
  color,
}: {
  label: string;
  icon: LucideIcon;
  percentile: number;
  color: string;
}) {
  const band =
    percentile <= 25 ? "Top 25%" : percentile <= 50 ? "Top 50%" : percentile <= 75 ? "Bottom 50%" : "Bottom 25%";
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
          <Icon className="h-3.5 w-3.5" style={{ color }} />
          {label}
        </span>
        <span className="tabular-nums text-muted-foreground">
          P{percentile} · {band}
        </span>
      </div>
      <div className="relative h-2 overflow-hidden rounded-full bg-gradient-to-r from-emerald-500/30 via-amber-500/30 to-rose-500/30">
        <div
          className="absolute top-1/2 h-3 w-3 -translate-y-1/2 rounded-full border-2 border-card shadow"
          style={{ left: `calc(${percentile}% - 6px)`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

export function PeerDistribution() {
  // Synthetic distribution bands for energy intensity.
  const data = [
    { range: "<60", hotels: 4 },
    { range: "60–80", hotels: 9 },
    { range: "80–100", hotels: 14 },
    { range: "100–120", hotels: 11 },
    { range: "120–140", hotels: 6 },
    { range: ">140", hotels: 3 },
  ];
  return (
    <ChartBlock
      title="Peer distribution — energy intensity"
      subtitle="kWh per room-night across the cohort."
      status="sample"
      howToRead={{
        intro:
          "Histogram of the cohort. Your hotel is highlighted by the marker — the further left, the more efficient.",
      }}
    >
      <div className="h-56 px-2 pb-3 md:px-4">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 12, right: 12, left: 0, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="range" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
            <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
            <ReTooltip contentStyle={TOOLTIP_STYLE} />
            <Bar dataKey="hotels" radius={[6, 6, 0, 0]}>
              {data.map((d) => (
                <Cell key={d.range} fill={d.range === "80–100" ? "var(--primary)" : "var(--chart-2)"} fillOpacity={d.range === "80–100" ? 0.95 : 0.45} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartBlock>
  );
}

export function PeerOutliers() {
  const rows = [
    { name: "Hotel A · Marseille", val: 58, label: "leader" },
    { name: "Hotel B · Nice", val: 64, label: "leader" },
    { name: "This hotel", val: 92, label: "you", highlight: true },
    { name: "Hotel C · Palermo", val: 138, label: "outlier" },
    { name: "Hotel D · Athens", val: 152, label: "outlier" },
  ];
  return (
    <ChartBlock
      title="Top & bottom — energy intensity"
      subtitle="Diagnostic ranking, not punitive."
      status="sample"
      howToRead={{
        intro:
          "A short ranked list highlighting leaders and outliers in your cohort. Use it to find playbooks to copy and questions to ask.",
      }}
    >
      <ul className="divide-y divide-border/60 px-5 pb-3 pt-1">
        {rows.map((r) => (
          <li key={r.name} className="flex items-center justify-between py-2 text-xs">
            <span className={r.highlight ? "font-semibold text-foreground" : "text-muted-foreground"}>
              {r.name}
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="tabular-nums text-foreground">{r.val}</span>
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] uppercase tracking-wider ${
                  r.label === "you"
                    ? "bg-primary/15 text-primary"
                    : r.label === "leader"
                      ? "bg-emerald-500/10 text-emerald-600"
                      : "bg-amber-500/10 text-amber-600"
                }`}
              >
                {r.label}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </ChartBlock>
  );
}

export function PeerRankOverTime() {
  const data = MONTH_SHORT.map((m, i) => ({
    label: m,
    rank: 18 + Math.round(seeded(`rank-${i}`) * 14 - 7),
  }));
  return (
    <ChartBlock
      title="Rank over time"
      subtitle="How your position in the cohort moves month to month."
      status="sample"
      howToRead={{
        intro:
          "A lower line is better — this is your rank within the cohort each month. Sustained downward movement = consistent improvement vs peers.",
      }}
    >
      <div className="h-52 px-2 pb-3 md:px-4">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 12, right: 12, left: 0, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
            <YAxis reversed tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
            <ReTooltip contentStyle={TOOLTIP_STYLE} />
            <Line type="monotone" dataKey="rank" stroke="var(--primary)" strokeWidth={2.5} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </ChartBlock>
  );
}

export type PeerGroupFilter = "brand" | "region" | "size";

export function BenchmarkGroupFilter({
  value,
  onChange,
}: {
  value: PeerGroupFilter;
  onChange: (v: PeerGroupFilter) => void;
}) {
  const opts: Array<{ value: PeerGroupFilter; label: string }> = [
    { value: "brand", label: "Same brand" },
    { value: "region", label: "Same region" },
    { value: "size", label: "Similar size" },
  ];
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        Peer group
      </span>
      <div className="inline-flex rounded-full bg-muted/50 p-1">
        {opts.map((o) => {
          const active = o.value === value;
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => onChange(o.value)}
              className={`rounded-full px-3 py-1 text-[11px] font-medium transition ${
                active
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ============================================================================
 *                          DATA QUALITY TAB CHARTS
 * ========================================================================== */

export function CompletenessTimeline({ entries }: { entries: MonthlyEntry[] }) {
  const sorted = sortEntries(entries).slice(-12);
  const data = sorted.map((e) => {
    const fields = [
      e.electricity_kwh,
      e.gas_kwh,
      e.water_m3,
      e.waste_kg,
      e.occupied_room_nights,
    ];
    const filled = fields.filter((v) => v != null && v !== 0).length;
    return {
      label: shortMonth(e),
      pct: Math.round((filled / fields.length) * 100),
    };
  });
  const avg =
    data.length > 0 ? Math.round(data.reduce((s, x) => s + x.pct, 0) / data.length) : 0;
  return (
    <ChartBlock
      title="Completeness timeline"
      subtitle={`Avg ${avg}% of fields completed across the last 12 months.`}
      status={avg >= 80 ? "complete" : avg >= 50 ? "missing" : "missing"}
      howToRead={{
        intro:
          "Each bar = % of expected fields filled for that month. Aim for 100%. A drop usually points to one missing utility or a late submission.",
      }}
    >
      <div className="h-52 px-2 pb-3 md:px-4">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 12, right: 12, left: 0, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
            <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
            <ReTooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => `${v}%`} />
            <ReferenceLine y={100} stroke="var(--border)" strokeDasharray="3 3" />
            <Bar dataKey="pct" radius={[6, 6, 0, 0]}>
              {data.map((d) => (
                <Cell key={d.label} fill={d.pct >= 80 ? "var(--primary)" : d.pct >= 50 ? "var(--chart-1)" : "var(--destructive)"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartBlock>
  );
}

export function MissingDataMatrix({ entries }: { entries: MonthlyEntry[] }) {
  const sorted = sortEntries(entries).slice(-12);
  const metrics: Array<{ key: keyof MonthlyEntry; label: string }> = [
    { key: "electricity_kwh", label: "Elec" },
    { key: "gas_kwh", label: "Gas" },
    { key: "water_m3", label: "Water" },
    { key: "waste_kg", label: "Waste" },
    { key: "occupied_room_nights", label: "Occ" },
  ];
  return (
    <ChartBlock
      title="Missing data matrix"
      subtitle="Metric × month grid — gaps are immediately visible."
      status={sorted.length > 0 ? "complete" : "missing"}
      howToRead={{
        intro:
          "Each cell is one metric for one month. Filled = present, faded = missing. Patterns of vertical gaps usually mean a late campaign; horizontal gaps mean one metric is consistently unreported.",
      }}
    >
      <div className="overflow-x-auto px-5 pb-5 pt-2">
        <table className="w-full min-w-[520px] border-separate border-spacing-1">
          <thead>
            <tr>
              <th className="w-16" />
              {sorted.map((e) => (
                <th
                  key={`${e.year}-${e.month}`}
                  className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground"
                >
                  {MONTH_SHORT[e.month - 1]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {metrics.map((m) => (
              <tr key={m.key as string}>
                <td className="pr-2 text-right text-xs font-medium text-foreground">{m.label}</td>
                {sorted.map((e) => {
                  const v = e[m.key];
                  const filled = v != null && v !== 0;
                  return (
                    <td key={`${m.key as string}-${e.year}-${e.month}`} className="text-center">
                      <div
                        className={`mx-auto h-5 w-5 rounded ${
                          filled
                            ? "bg-primary/80"
                            : "border border-dashed border-amber-500/60 bg-amber-500/10"
                        }`}
                        title={filled ? "Reported" : "Missing"}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ChartBlock>
  );
}

export function FreshnessByMetric({ entries }: { entries: MonthlyEntry[] }) {
  const sorted = sortEntries(entries);
  const metrics: Array<{ key: keyof MonthlyEntry; label: string }> = [
    { key: "electricity_kwh", label: "Electricity" },
    { key: "gas_kwh", label: "Gas" },
    { key: "water_m3", label: "Water" },
    { key: "waste_kg", label: "Waste" },
    { key: "occupied_room_nights", label: "Occupancy" },
  ];
  const today = new Date();
  const rows = metrics.map((m) => {
    const last = [...sorted].reverse().find((e) => {
      const v = e[m.key];
      return v != null && v !== 0;
    });
    if (!last) return { label: m.label, days: null as number | null, when: "Never reported" };
    const lastDate = new Date(last.year, last.month - 1, 28);
    const days = Math.max(0, Math.floor((today.getTime() - lastDate.getTime()) / 86400000));
    return { label: m.label, days, when: `${MONTH_NAMES[last.month - 1]} ${last.year}` };
  });
  return (
    <ChartBlock
      title="Freshness by metric"
      subtitle="Days since the last reported value."
      status="complete"
      howToRead={{
        intro:
          "Long bars = data is getting stale. Anything older than ~45 days is no longer useful for steering and will distort comparisons.",
      }}
    >
      <ul className="space-y-2 px-5 pb-5 pt-2">
        {rows.map((r) => {
          const tone =
            r.days == null ? "text-rose-500" : r.days <= 35 ? "text-emerald-500" : r.days <= 60 ? "text-amber-500" : "text-rose-500";
          return (
            <li key={r.label} className="flex items-center justify-between text-xs">
              <span className="font-medium text-foreground">{r.label}</span>
              <span className={`inline-flex items-center gap-1.5 tabular-nums ${tone}`}>
                <Clock className="h-3 w-3" />
                {r.days == null ? "—" : `${r.days}d`}
                <span className="text-muted-foreground">· {r.when}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </ChartBlock>
  );
}

export function FlaggedValues({ entries }: { entries: MonthlyEntry[] }) {
  const sorted = sortEntries(entries);
  const flags: Array<{ when: string; metric: string; value: string; reason: string }> = [];
  for (let i = 1; i < sorted.length; i++) {
    const e = sorted[i];
    const prev = sorted[i - 1];
    const checks: Array<[string, number | null | undefined, number | null | undefined]> = [
      ["Electricity", e.electricity_kwh, prev.electricity_kwh],
      ["Gas", e.gas_kwh, prev.gas_kwh],
      ["Water", e.water_m3, prev.water_m3],
    ];
    for (const [name, curr, p] of checks) {
      if (curr != null && curr < 0)
        flags.push({ when: shortMonth(e), metric: name, value: String(curr), reason: "Negative value" });
      if (curr === 0)
        flags.push({ when: shortMonth(e), metric: name, value: "0", reason: "Zero — possible missing" });
      if (curr != null && p != null && p > 0 && curr > p * 1.6)
        flags.push({ when: shortMonth(e), metric: name, value: formatNumber(curr), reason: "Spike > +60% MoM" });
    }
  }
  const top = flags.slice(0, 6);
  return (
    <ChartBlock
      title="Flagged values"
      subtitle={`${flags.length} potential validity issues detected.`}
      status={flags.length === 0 ? "complete" : "missing"}
      statusLabel={flags.length === 0 ? "No anomalies" : `${flags.length} flagged`}
      howToRead={{
        intro:
          "Automated validity checks (zero, negative, MoM spike). Each flag is a candidate for review — not necessarily an error, but always worth checking.",
      }}
    >
      <div className="px-5 pb-5 pt-2">
        {top.length === 0 ? (
          <div className="flex items-center gap-2 rounded-xl bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700">
            <CheckCircle2 className="h-4 w-4" /> All recent values pass validity checks.
          </div>
        ) : (
          <ul className="space-y-1.5">
            {top.map((f, i) => (
              <li key={i} className="flex items-start gap-2 rounded-xl bg-amber-500/10 px-3 py-2 text-xs">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
                <div className="flex-1">
                  <div className="font-medium text-foreground">
                    {f.metric} · {f.when}{" "}
                    <span className="ml-1 tabular-nums text-muted-foreground">({f.value})</span>
                  </div>
                  <div className="text-muted-foreground">{f.reason}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </ChartBlock>
  );
}

export function PreviousCampaignCompare({
  entries,
}: {
  entries: MonthlyEntry[];
}) {
  const sorted = sortEntries(entries);
  // Pair months that have both year n and year n-1 values.
  const window = sorted.slice(-12);
  const data = window.map((e) => {
    const prev = sorted.find((x) => x.year === e.year - 1 && x.month === e.month);
    return {
      label: shortMonth(e),
      current: e.electricity_kwh ?? 0,
      previous: prev?.electricity_kwh ?? 0,
    };
  });
  return (
    <ChartBlock
      title="Previous campaign comparison"
      subtitle="Side-by-side: current vs previous campaign for the same month."
      status={data.some((d) => d.previous > 0) ? "complete" : "missing"}
      howToRead={{
        intro:
          "Comparing the current input to last year's same month is the fastest way to catch input errors — a 10× value almost always means a wrong unit.",
      }}
    >
      <div className="h-56 px-2 pb-3 md:px-4">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 12, right: 12, left: 0, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
            <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
            <ReTooltip contentStyle={TOOLTIP_STYLE} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="previous" fill={COLORS.prev} fillOpacity={0.4} radius={[4, 4, 0, 0]} name="Last campaign" />
            <Bar dataKey="current" fill={COLORS.electricity} radius={[4, 4, 0, 0]} name="Current campaign" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartBlock>
  );
}

export function OwnerResponsibilityFilter() {
  const owners = ["All owners", "Hotel manager", "Maintenance lead", "Sustainability lead", "Finance"];
  const [active, setActive] = React.useState(owners[0]);
  return (
    <ChartBlock
      title="Owner & responsibility filter"
      subtitle="Filter quality views by who is responsible for the data."
      status="sample"
      howToRead={{
        intro:
          "Used by regional support to identify who needs help. Selecting an owner filters the rest of this tab to their scope of metrics.",
      }}
    >
      <div className="flex flex-wrap gap-1.5 px-5 pb-5 pt-1">
        {owners.map((o) => {
          const sel = active === o;
          return (
            <button
              key={o}
              type="button"
              onClick={() => setActive(o)}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                sel
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground"
              }`}
            >
              {o}
            </button>
          );
        })}
      </div>
    </ChartBlock>
  );
}

/* ----------------------------- tiny atoms -------------------------------- */

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex h-full items-center justify-center text-center text-xs text-muted-foreground">
      {message}
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "good" | "warn";
}) {
  const toneCls =
    tone === "good"
      ? "border-emerald-500/30 bg-emerald-500/5"
      : tone === "warn"
        ? "border-amber-500/30 bg-amber-500/5"
        : "border-border bg-card/50";
  return (
    <div className={`rounded-2xl border p-3 ${toneCls}`}>
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-base font-semibold text-foreground">{value}</div>
      {hint && <div className="mt-0.5 text-[11px] text-muted-foreground">{hint}</div>}
    </div>
  );
}
