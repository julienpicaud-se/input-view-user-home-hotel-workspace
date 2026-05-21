import { createFileRoute, Link } from "@tanstack/react-router";
import * as React from "react";
import { z } from "zod";
import { toast } from "sonner";
import {
  Bolt,
  Flame,
  Droplets,
  Trash2,
  Users,
  CheckCircle2,
  Clock,
  AlertCircle,
  X,
  ArrowLeft,
  Search,
  Download,
  Eye,
  Calendar as CalendarIcon,
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  PencilLine,
  ClipboardList,
  Receipt,
  Upload,
  RotateCcw,
  Plus,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { getActiveHotelId, type Hotel, type MonthlyEntry } from "@/lib/hotel";
import { MONTH_SHORT, MONTH_NAMES, formatNumber } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const METRIC_KEYS = [
  "electricity_kwh",
  "gas_kwh",
  "water_m3",
  "waste_kg",
  "occupied_room_nights",
] as const;

const searchSchema = z.object({
  tab: z.enum(["coverage", "detailed"]).catch("coverage"),
  metric: z.enum(METRIC_KEYS).optional().catch(undefined),
  period: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .optional()
    .catch(undefined),
});

export const Route = createFileRoute("/data-collection")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Data Collection — RA+" },
      {
        name: "description",
        content:
          "Track monthly data collection coverage and review all raw ESG records for your hotel.",
      },
    ],
  }),
  component: DataCollectionPage,
});

// ---------- Types ----------
type MetricKey =
  | "electricity_kwh"
  | "gas_kwh"
  | "water_m3"
  | "waste_kg"
  | "occupied_room_nights";

interface MetricDef {
  key: MetricKey;
  label: string;
  unit: string;
  activity: string;
  Icon: React.ComponentType<{ className?: string }>;
  tone: string;
}

const METRICS: MetricDef[] = [
  {
    key: "electricity_kwh",
    label: "Electric Power",
    unit: "kWh",
    activity: "Electricity consumption",
    Icon: Bolt,
    tone: "text-amber-600 bg-amber-50 border-amber-200",
  },
  {
    key: "gas_kwh",
    label: "Natural Gas Combustion",
    unit: "kWh",
    activity: "Natural gas consumption",
    Icon: Flame,
    tone: "text-orange-600 bg-orange-50 border-orange-200",
  },
  {
    key: "water_m3",
    label: "Water Supply",
    unit: "m³",
    activity: "Water withdrawal",
    Icon: Droplets,
    tone: "text-sky-600 bg-sky-50 border-sky-200",
  },
  {
    key: "waste_kg",
    label: "Mixed Municipal Solid Waste",
    unit: "kg",
    activity: "Waste generated",
    Icon: Trash2,
    tone: "text-emerald-600 bg-emerald-50 border-emerald-200",
  },
  {
    key: "occupied_room_nights",
    label: "Headcount",
    unit: "ORN",
    activity: "Occupied room-nights",
    Icon: Users,
    tone: "text-violet-600 bg-violet-50 border-violet-200",
  },
];

type CellStatus = "done" | "in_progress" | "missing";

/**
 * Real status derived from saved monthly_entries:
 *  - done        → a non-null, positive value is stored for this metric/month
 *  - in_progress → a row exists for the month but this metric is null or 0
 *                  (the user started logging the month but hasn't filled this field)
 *  - missing     → no row at all for that month
 */
function deriveStatus(
  entry: MonthlyEntry | undefined,
  metric: MetricKey,
): CellStatus {
  if (!entry) return "missing";
  const v = entry[metric];
  if (v === null || v === undefined) return "in_progress";
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return "in_progress";
  return "done";
}

// ---------- Page ----------
function DataCollectionPage() {
  const { tab, metric: metricFilter, period: periodFilter } = Route.useSearch();
  const [hotel, setHotel] = React.useState<Hotel | null>(null);
  const [entries, setEntries] = React.useState<MonthlyEntry[]>([]);
  const [loading, setLoading] = React.useState(true);
  const hotelId = getActiveHotelId();

  const load = React.useCallback(async () => {
    setLoading(true);
    const [{ data: h }, { data: e }] = await Promise.all([
      supabase.from("hotels").select("*").eq("id", hotelId).maybeSingle(),
      supabase
        .from("monthly_entries")
        .select("*")
        .eq("hotel_id", hotelId)
        .order("year", { ascending: false })
        .order("month", { ascending: false }),
    ]);
    setHotel((h as Hotel) ?? null);
    setEntries((e as MonthlyEntry[]) ?? []);
    setLoading(false);
  }, [hotelId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  // Side panel state for filling in missing data (Coverage Matrix)
  const [editing, setEditing] = React.useState<{
    metric: MetricDef;
    year: number;
    month: number;
  } | null>(null);

  // Side panel state for viewing measuring points (Detailed Data)
  const [viewing, setViewing] = React.useState<{
    metric: MetricDef;
    year: number;
    month: number;
  } | null>(null);

  return (
    <div className="min-h-screen bg-[#F6F7F8]">
      <div className="mx-auto w-full max-w-7xl px-6 py-8 md:px-10 md:py-10">
        <header className="mb-6 flex items-center">
          <TabBar active={tab} />
        </header>

        {loading ? (
          <div className="rounded-xl border border-zinc-200 bg-white p-12 text-center text-sm text-zinc-500">
            Loading data…
          </div>
        ) : tab === "coverage" ? (
          <CoverageMatrix
            hotelId={hotelId}
            hotel={hotel}
            entries={entries}
            onCellClick={(metric, year, month) =>
              setEditing({ metric, year, month })
            }
            onViewCell={(metric, year, month) =>
              setViewing({ metric, year, month })
            }
          />
        ) : (
          <DetailedData
            hotel={hotel}
            entries={entries}
            metricFilter={metricFilter}
            periodFilter={periodFilter}
            onViewDetails={(metricKey, year, month) => {
              const m = METRICS.find((x) => x.key === metricKey);
              if (m) setViewing({ metric: m, year, month });
            }}
            onAddData={() => {
              const now = new Date();
              setEditing({
                metric: METRICS[0],
                year: now.getFullYear(),
                month: now.getMonth() + 1,
              });
            }}
            onRefresh={load}
          />
        )}

        {editing && (
          <FillDataPanel
            hotelId={hotelId}
            metric={editing.metric}
            year={editing.year}
            month={editing.month}
            existing={
              entries.find(
                (e) => e.year === editing.year && e.month === editing.month,
              ) ?? null
            }
            onClose={() => setEditing(null)}
            onSaved={async () => {
              setEditing(null);
              await load();
              toast.success("Data saved");
            }}
          />
        )}

        {viewing && (
          <DetailsPanel
            hotel={hotel}
            metric={viewing.metric}
            year={viewing.year}
            month={viewing.month}
            entry={
              entries.find(
                (e) => e.year === viewing.year && e.month === viewing.month,
              ) ?? null
            }
            onClose={() => setViewing(null)}
          />
        )}
      </div>
    </div>
  );
}

// ---------- Tabs ----------
function TabBar({ active }: { active: "coverage" | "detailed" }) {
  const tabs: { key: "coverage" | "detailed"; label: string }[] = [
    { key: "coverage", label: "Coverage Matrix" },
    { key: "detailed", label: "Detailed Data" },
  ];
  return (
    <div className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-white p-1">
      {tabs.map((t) => {
        const isActive = t.key === active;
        return (
          <Link
            key={t.key}
            to="/data-collection"
            search={{ tab: t.key }}
            className={cn(
              "inline-flex items-center justify-center rounded-full px-4 py-1.5 text-[13px] font-medium transition-colors",
              isActive
                ? "bg-emerald-600 text-white"
                : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900",
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}

// ---------- Coverage Matrix ----------
function CoverageMatrix({
  hotelId,
  hotel,
  entries,
  onCellClick,
  onViewCell,
}: {
  hotelId: string;
  hotel: Hotel | null;
  entries: MonthlyEntry[];
  onCellClick: (metric: MetricDef, year: number, month: number) => void;
  onViewCell: (metric: MetricDef, year: number, month: number) => void;
}) {
  const now = new Date();

  // Default rolling 12-month window
  const defaultEnd = { year: now.getFullYear(), month: now.getMonth() + 1 };
  const defaultStart = (() => {
    const d = new Date(now.getFullYear(), now.getMonth() - 11, 1);
    return { year: d.getFullYear(), month: d.getMonth() + 1 };
  })();

  const [rangeStart, setRangeStart] = React.useState(defaultStart);
  const [rangeEnd, setRangeEnd] = React.useState(defaultEnd);
  const [granularity, setGranularity] = React.useState<Granularity>("monthly");

  // Build month list from range
  const months: { year: number; month: number }[] = [];
  const cursor = new Date(rangeStart.year, rangeStart.month - 1, 1);
  const endCursor = new Date(rangeEnd.year, rangeEnd.month - 1, 1);
  while (cursor <= endCursor) {
    months.push({ year: cursor.getFullYear(), month: cursor.getMonth() + 1 });
    cursor.setMonth(cursor.getMonth() + 1);
  }

  // Clamp to a reasonable max (36 months) to avoid perf issues
  const clampedMonths = months.slice(-36);

  // Group months into periods based on granularity
  const periods = React.useMemo(
    () => groupMonths(clampedMonths, granularity),
    [clampedMonths, granularity],
  );

  const entryByKey = new Map<string, MonthlyEntry>();
  for (const e of entries) entryByKey.set(`${e.year}-${e.month}`, e);

  function cellStatus(
    metric: MetricKey,
    year: number,
    month: number,
  ): CellStatus {
    return deriveStatus(entryByKey.get(`${year}-${month}`), metric);
  }

  function periodStatus(
    metric: MetricKey,
    period: Period,
  ): CellStatus {
    let done = 0;
    let missing = 0;
    for (const m of period.months) {
      const s = cellStatus(metric, m.year, m.month);
      if (s === "done") done++;
      else if (s === "missing") missing++;
    }
    if (done === period.months.length) return "done";
    if (missing === period.months.length) return "missing";
    return "in_progress";
  }

  // Aggregate KPIs (based on visible range, at month level)
  const total = METRICS.length * clampedMonths.length;
  let covered = 0;
  let missing = 0;
  for (const m of METRICS) {
    for (const mo of clampedMonths) {
      const s = cellStatus(m.key, mo.year, mo.month);
      if (s === "missing") missing++;
      else covered++;
    }
  }
  const coveragePct = total > 0 ? Math.round((covered / total) * 100) : 0;

  const rangeLabel =
    clampedMonths.length === 0
      ? "No months selected"
      : `${MONTH_SHORT[clampedMonths[0].month - 1]} ${clampedMonths[0].year} – ${MONTH_SHORT[clampedMonths[clampedMonths.length - 1].month - 1]} ${clampedMonths[clampedMonths.length - 1].year}`;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-start gap-2">
        <RangeSelector
          start={rangeStart}
          end={rangeEnd}
          onChange={(s, e) => {
            setRangeStart(s);
            setRangeEnd(e);
          }}
        />
        <button
          type="button"
          onClick={() => {
            const now = new Date();
            setRangeStart({ year: now.getFullYear(), month: now.getMonth() + 1 });
            const d = new Date(now.getFullYear(), now.getMonth() + 11, 1);
            setRangeEnd({ year: d.getFullYear(), month: d.getMonth() + 1 });
          }}
          className="inline-flex h-8 items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-600 transition hover:border-emerald-500/40 hover:text-zinc-900"
        >
          <RotateCcw className="h-3 w-3" />
          Reset to next 12 months
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KpiCard
          label="Coverage"
          value={`${coveragePct}%`}
          tone="text-zinc-900"
          hint={`${covered} of ${total} cells filled`}
          progress={coveragePct}
        />
        <KpiCard
          label="Records"
          value={formatNumber(entries.length)}
          tone="text-zinc-900"
          hint="Monthly entries submitted"
        />
        <KpiCard
          label="Open gaps"
          value={formatNumber(missing)}
          tone={missing > 0 ? "text-amber-600" : "text-emerald-600"}
          hint="Cells that need attention"
        />
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white p-5">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-[15px] font-semibold tracking-tight text-zinc-900">Coverage matrix</h2>
            <p className="mt-1 text-xs text-zinc-500">
              {rangeLabel} · {hotel?.name ?? "Hotel"} · Click a missing or
              draft cell to add data.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <GranularityToggle value={granularity} onChange={setGranularity} />
          </div>
        </div>



        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-separate border-spacing-0 text-sm">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-white px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-zinc-500">
                  Activity data
                </th>
                {periods.map((p) => (
                  <th
                    key={p.key}
                    className="px-2 py-2 text-center text-[10px] font-semibold uppercase tracking-[0.08em] text-zinc-500"
                  >
                    <div>{p.label}</div>
                    <div className="text-[9px] font-normal text-zinc-400">
                      {p.sublabel}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {METRICS.map((metric) => {
                const Icon = metric.Icon;
                return (
                  <tr key={metric.key} className="border-t border-zinc-100">
                    <td className="sticky left-0 z-10 bg-white px-3 py-3">
                      <div className="flex items-center gap-2.5">
                        <div
                          className={cn(
                            "flex h-7 w-7 items-center justify-center rounded-md border",
                            metric.tone,
                          )}
                        >
                          <Icon className="h-3.5 w-3.5" />
                        </div>
                        <div className="leading-tight">
                          <div className="text-[13px] font-medium text-zinc-900">
                            {metric.label}
                          </div>
                          <div className="text-[10px] text-zinc-500">
                            ({metric.unit})
                          </div>
                        </div>
                      </div>
                    </td>
                    {periods.map((p) => {
                      const status = periodStatus(metric.key, p);
                      const first = p.months[0];
                      const period = `${first.year}-${String(first.month).padStart(2, "0")}`;
                      const doneCount = p.months.filter(
                        (mo) => cellStatus(metric.key, mo.year, mo.month) === "done",
                      ).length;
                      const tooltip =
                        p.months.length > 1
                          ? `${p.tooltipLabel} — ${doneCount}/${p.months.length} months ${statusLabel(status).toLowerCase()}`
                          : `${p.tooltipLabel} — ${statusLabel(status)}`;
                      const commonClass = cn(
                        "mx-auto flex h-6 w-6 items-center justify-center rounded-full transition cursor-pointer hover:scale-110 hover:ring-2 hover:ring-emerald-500/30",
                        statusDot(status),
                      );
                      const icon =
                        status === "in_progress" ? (
                          <Clock className="h-3 w-3 text-white" />
                        ) : status === "missing" ? (
                          <AlertCircle className="h-3 w-3 text-zinc-400" />
                        ) : null;
                      return (
                        <td
                          key={`${metric.key}-${p.key}`}
                          className="px-1 py-3 text-center"
                        >
                          {status === "done" ? (
                            <button
                              type="button"
                              onClick={() =>
                                onViewCell(metric, first.year, first.month)
                              }
                              title={`${tooltip} (click to view)`}
                              className={commonClass}
                            >
                              {icon}
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() =>
                                onCellClick(metric, first.year, first.month)
                              }
                              title={`${tooltip} (click to add)`}
                              className={commonClass}
                            >
                              {icon}
                            </button>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex justify-end border-t border-zinc-100 pt-3">
          <Legend />
        </div>
      </div>

    </div>
  );
}

type Granularity = "monthly" | "quarterly" | "semester" | "annual";

interface Period {
  key: string;
  label: string;
  sublabel: string;
  tooltipLabel: string;
  months: { year: number; month: number }[];
}

function groupMonths(
  months: { year: number; month: number }[],
  granularity: Granularity,
): Period[] {
  if (months.length === 0) return [];
  if (granularity === "monthly") {
    return months.map((m) => ({
      key: `${m.year}-${m.month}`,
      label: MONTH_SHORT[m.month - 1],
      sublabel: String(m.year).slice(2),
      tooltipLabel: `${MONTH_NAMES[m.month - 1]} ${m.year}`,
      months: [m],
    }));
  }

  const map = new Map<string, Period>();
  for (const m of months) {
    let key: string;
    let label: string;
    let sublabel: string;
    let tooltipLabel: string;
    if (granularity === "annual") {
      key = `${m.year}`;
      label = String(m.year);
      sublabel = "FY";
      tooltipLabel = `${m.year}`;
    } else if (granularity === "semester") {
      const half = m.month <= 6 ? 1 : 2;
      key = `${m.year}-H${half}`;
      label = `H${half}`;
      sublabel = String(m.year).slice(2);
      tooltipLabel = `H${half} ${m.year} (${half === 1 ? "Jan–Jun" : "Jul–Dec"})`;
    } else {
      const q = Math.floor((m.month - 1) / 3) + 1;
      key = `${m.year}-Q${q}`;
      label = `Q${q}`;
      sublabel = String(m.year).slice(2);
      const startM = (q - 1) * 3;
      tooltipLabel = `Q${q} ${m.year} (${MONTH_SHORT[startM]}–${MONTH_SHORT[startM + 2]})`;
    }
    let bucket = map.get(key);
    if (!bucket) {
      bucket = { key, label, sublabel, tooltipLabel, months: [] };
      map.set(key, bucket);
    }
    bucket.months.push(m);
  }
  return Array.from(map.values()).sort((a, b) => {
    const am = a.months[0];
    const bm = b.months[0];
    return am.year - bm.year || am.month - bm.month;
  });
}

function GranularityToggle({
  value,
  onChange,
}: {
  value: Granularity;
  onChange: (g: Granularity) => void;
}) {
  const options: { key: Granularity; label: string; short: string }[] = [
    { key: "monthly", label: "Monthly", short: "M" },
    { key: "quarterly", label: "Quarterly", short: "Q" },
    { key: "semester", label: "Semester", short: "S" },
    { key: "annual", label: "Annual", short: "Y" },
  ];
  return (
    <div
      role="tablist"
      aria-label="Granularity"
      className="inline-flex h-8 items-center rounded-full border border-zinc-200 bg-white p-0.5 text-xs"
    >
      {options.map((o) => {
        const active = value === o.key;
        return (
          <button
            key={o.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.key)}
            className={cn(
              "h-7 rounded-full px-3 font-medium transition",
              active
                ? "bg-emerald-600 text-white"
                : "text-zinc-600 hover:text-zinc-900",
            )}
            title={o.label}
          >
            <span className="hidden sm:inline">{o.label}</span>
            <span className="sm:hidden">{o.short}</span>
          </button>
        );
      })}
    </div>
  );
}

function RangeSelector({
  start,
  end,
  onChange,
}: {
  start: { year: number; month: number };
  end: { year: number; month: number };
  onChange: (
    start: { year: number; month: number },
    end: { year: number; month: number },
  ) => void;
}) {
  function updateStart(month: number, year: number) {
    const s = { month, year };
    const sDate = new Date(year, month - 1, 1);
    const eDate = new Date(end.year, end.month - 1, 1);
    if (sDate > eDate) onChange(s, s);
    else onChange(s, end);
  }

  function updateEnd(month: number, year: number) {
    const e = { month, year };
    const sDate = new Date(start.year, start.month - 1, 1);
    const eDate = new Date(year, month - 1, 1);
    if (eDate < sDate) onChange(e, e);
    else onChange(start, e);
  }

  function applyPreset(monthsForward: number) {
    const now = new Date();
    const s = { year: now.getFullYear(), month: now.getMonth() + 1 };
    const eDate = new Date(now.getFullYear(), now.getMonth() + (monthsForward - 1), 1);
    const e = { year: eDate.getFullYear(), month: eDate.getMonth() + 1 };
    onChange(s, e);
  }

  function applyYTD() {
    const now = new Date();
    onChange(
      { year: now.getFullYear(), month: now.getMonth() + 1 },
      { year: now.getFullYear(), month: 12 },
    );
  }

  const label = `${MONTH_SHORT[start.month - 1]} ${start.year} → ${MONTH_SHORT[end.month - 1]} ${end.year}`;

  const presets: { label: string; run: () => void }[] = [
    { label: "Next 6 months", run: () => applyPreset(6) },
    { label: "Next 12 months", run: () => applyPreset(12) },
    { label: "Next 24 months", run: () => applyPreset(24) },
    { label: "Rest of year", run: applyYTD },
  ];

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex h-8 items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-700 transition hover:border-emerald-500/40 hover:text-zinc-900"
        >
          <CalendarIcon className="h-3.5 w-3.5 text-zinc-400" />
          {label}
          <ChevronDown className="h-3.5 w-3.5 text-zinc-400" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[300px] p-3">
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {presets.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={p.run}
                className="rounded-md border border-border bg-muted/40 px-2 py-1 text-[11px] font-medium text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="space-y-2 border-t border-border/60 pt-3">
            <div>
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                From
              </div>
              <div className="flex items-center gap-1.5">
                <select
                  value={start.month}
                  onChange={(e) => updateStart(Number(e.target.value), start.year)}
                  className="flex-1 rounded-md border border-input bg-background px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-ring"
                >
                  {MONTH_SHORT.map((m, i) => (
                    <option key={m} value={i + 1}>{m}</option>
                  ))}
                </select>
                <input
                  type="number"
                  min={2000}
                  max={2100}
                  value={start.year}
                  onChange={(e) => updateStart(start.month, Number(e.target.value))}
                  className="w-20 rounded-md border border-input bg-background px-2 py-1 text-xs text-center outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
            </div>
            <div>
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                To
              </div>
              <div className="flex items-center gap-1.5">
                <select
                  value={end.month}
                  onChange={(e) => updateEnd(Number(e.target.value), end.year)}
                  className="flex-1 rounded-md border border-input bg-background px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-ring"
                >
                  {MONTH_SHORT.map((m, i) => (
                    <option key={m} value={i + 1}>{m}</option>
                  ))}
                </select>
                <input
                  type="number"
                  min={2000}
                  max={2100}
                  value={end.year}
                  onChange={(e) => updateEnd(end.month, Number(e.target.value))}
                  className="w-20 rounded-md border border-input bg-background px-2 py-1 text-xs text-center outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}


function statusLabel(s: CellStatus): string {
  switch (s) {
    case "done":
      return "Done";
    case "in_progress":
      return "In progress";
    case "missing":
      return "Missing";
  }
}

function statusDot(s: CellStatus): string {
  switch (s) {
    case "done":
      return "bg-emerald-500";
    case "in_progress":
      return "bg-amber-400";
    case "missing":
      return "bg-zinc-100 border border-dashed border-zinc-300";
  }
}

function statusPill(s: CellStatus): string {
  switch (s) {
    case "done":
      return "bg-emerald-50 text-emerald-700 border-emerald-100";
    case "in_progress":
      return "bg-amber-50 text-amber-700 border-amber-100";
    case "missing":
      return "bg-rose-50 text-rose-700 border-rose-100";
  }
}

function Legend() {
  const items: { s: CellStatus; label: string }[] = [
    { s: "done", label: "Done" },
    { s: "in_progress", label: "In progress" },
    { s: "missing", label: "Missing" },
  ];
  return (
    <div className="flex flex-wrap items-center gap-2">
      {items.map((it) => (
        <span
          key={it.s}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium",
            statusPill(it.s),
          )}
        >
          <span className={cn("h-1.5 w-1.5 rounded-full", statusDot(it.s))} />
          {it.label}
        </span>
      ))}
    </div>
  );
}

function KpiCard({
  label,
  value,
  hint,
  tone,
  progress,
}: {
  label: string;
  value: string;
  hint: string;
  tone: string;
  progress?: number;
}) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5">
      <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-zinc-500">
        {label}
      </div>
      <div className={cn("mt-2 text-[28px] font-bold tracking-tight tabular-nums", tone)}>
        {value}
      </div>
      {typeof progress === "number" && (
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-zinc-100">
          <div
            className="h-full rounded-full bg-emerald-500 transition-all"
            style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
          />
        </div>
      )}
      <div className="mt-1.5 text-xs text-zinc-500">{hint}</div>
    </div>
  );
}

// ---------- Detailed Data ----------
interface Row {
  id: string;
  activity: string;
  startDate: string;
  endDate: string;
  value: number;
  metric: string;
  entity: string;
  metricKey: MetricKey;
  period: string;
  year: number;
  month: number;
}


function DetailedData({
  hotel,
  entries,
  metricFilter,
  periodFilter,
  onViewDetails,
  onAddData,
  onRefresh,
}: {
  hotel: Hotel | null;
  entries: MonthlyEntry[];
  metricFilter?: MetricKey;
  periodFilter?: string;
  onViewDetails: (metricKey: MetricKey, year: number, month: number) => void;
  onAddData: () => void;
  onRefresh: () => Promise<void> | void;
}) {

  const rows: Row[] = React.useMemo(() => {
    const out: Row[] = [];
    for (const e of entries) {
      const start = new Date(e.year, e.month - 1, 1);
      const end = new Date(e.year, e.month, 0);
      const startStr = start.toISOString().slice(0, 10);
      const endStr = end.toISOString().slice(0, 10);
      const period = `${e.year}-${String(e.month).padStart(2, "0")}`;
      for (const m of METRICS) {
        const v = e[m.key];
        if (v === null || v === undefined) continue;
        out.push({
          id: `${e.id}-${m.key}`,
          activity: m.activity,
          startDate: startStr,
          endDate: endStr,
          value: Number(v),
          metric: m.unit,
          entity: hotel?.name ?? "—",
          metricKey: m.key,
          period,
          year: e.year,
          month: e.month,
        });
      }
    }
    return out.sort((a, b) =>
      a.startDate < b.startDate ? 1 : a.startDate > b.startDate ? -1 : 0,
    );
  }, [entries, hotel]);

  const now = new Date();
  const defaultEnd = { year: now.getFullYear(), month: now.getMonth() + 1 };
  const defaultStart = (() => {
    const d = new Date(now.getFullYear(), now.getMonth() - 11, 1);
    return { year: d.getFullYear(), month: d.getMonth() + 1 };
  })();
  const [rangeStart, setRangeStart] = React.useState(defaultStart);
  const [rangeEnd, setRangeEnd] = React.useState(defaultEnd);

  function inRange(year: number, month: number) {
    const v = year * 12 + (month - 1);
    const s = rangeStart.year * 12 + (rangeStart.month - 1);
    const e = rangeEnd.year * 12 + (rangeEnd.month - 1);
    return v >= s && v <= e;
  }

  const [q, setQ] = React.useState("");
  const filtered = rows.filter((r) => {
    if (metricFilter && r.metricKey !== metricFilter) return false;
    if (periodFilter && r.period !== periodFilter) return false;
    if (!inRange(r.year, r.month)) return false;
    if (!q) return true;
    return `${r.activity} ${r.entity} ${r.metric}`
      .toLowerCase()
      .includes(q.toLowerCase());
  });

  type SortKey = "activity" | "startDate" | "endDate" | "value" | "metric" | "entity";
  const [sortKey, setSortKey] = React.useState<SortKey>("startDate");
  const [sortDir, setSortDir] = React.useState<"asc" | "desc">("desc");

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "value" || key === "startDate" || key === "endDate" ? "desc" : "asc");
    }
  }

  const sorted = React.useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      let cmp = 0;
      if (typeof av === "number" && typeof bv === "number") cmp = av - bv;
      else cmp = String(av).localeCompare(String(bv));
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  const activeMetric = metricFilter
    ? METRICS.find((m) => m.key === metricFilter)
    : null;
  const activePeriodLabel = periodFilter
    ? (() => {
        const [y, mo] = periodFilter.split("-").map(Number);
        return `${MONTH_NAMES[mo - 1]} ${y}`;
      })()
    : null;
  const hasFilters = Boolean(activeMetric || activePeriodLabel);

  // Inline edit state — keyed by row id
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState<string>("");
  const [savingId, setSavingId] = React.useState<string | null>(null);

  function beginEdit(r: Row) {
    setEditingId(r.id);
    setDraft(String(r.value));
  }
  function cancelEdit() {
    setEditingId(null);
    setDraft("");
  }
  async function commitEdit(r: Row) {
    const num = Number(draft);
    if (draft === "" || Number.isNaN(num) || num < 0) {
      toast.error("Enter a valid non-negative number");
      return;
    }
    if (num === r.value) {
      cancelEdit();
      return;
    }
    setSavingId(r.id);
    try {
      const entry = entries.find(
        (e) => e.year === r.year && e.month === r.month,
      );
      if (!entry) throw new Error("Entry not found");
      const patch = { [r.metricKey]: num } as never;
      const { error } = await supabase
        .from("monthly_entries")
        .update(patch)
        .eq("id", entry.id);
      if (error) throw error;
      toast.success("Value updated");
      await onRefresh();
    } catch (e) {
      toast.error("Could not save value");
      // eslint-disable-next-line no-console
      console.error(e);
    } finally {
      setSavingId(null);
      setEditingId(null);
      setDraft("");
    }
  }

  function exportCsv() {
    const header = [
      "Activity data",
      "Start date",
      "End date",
      "Value",
      "Metric",
      "Entity name",
    ];
    const lines = [header.join(",")];
    for (const r of filtered) {
      lines.push(
        [
          `"${r.activity}"`,
          r.startDate,
          r.endDate,
          r.value,
          r.metric,
          `"${r.entity}"`,
        ].join(","),
      );
    }
    const blob = new Blob([lines.join("\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `data-collection-${hotel?.name ?? "hotel"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-start gap-2">
        <RangeSelector
          start={rangeStart}
          end={rangeEnd}
          onChange={(s, e) => {
            setRangeStart(s);
            setRangeEnd(e);
          }}
        />
        <button
          type="button"
          onClick={() => {
            const now = new Date();
            setRangeStart({ year: now.getFullYear(), month: now.getMonth() + 1 });
            const d = new Date(now.getFullYear(), now.getMonth() + 11, 1);
            setRangeEnd({ year: d.getFullYear(), month: d.getMonth() + 1 });
          }}
          className="inline-flex h-8 items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-600 transition hover:border-emerald-500/40 hover:text-zinc-900"
        >
          <RotateCcw className="h-3 w-3" />
          Reset to next 12 months
        </button>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 px-5 py-4">
        <div>
          <h2 className="text-[15px] font-semibold tracking-tight text-zinc-900">Detailed data</h2>
          <p className="mt-1 text-xs text-zinc-500">
            {formatNumber(filtered.length)} record
            {filtered.length === 1 ? "" : "s"} ·{" "}
            {hotel?.name ?? "Hotel"} · Click any value to edit
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search activity…"
              className="h-9 w-56 rounded-full border-zinc-200 pl-8 text-sm"
            />
          </div>
          <Button
            type="button"
            size="sm"
            onClick={onAddData}
            className="gap-1.5 rounded-full bg-emerald-600 px-4 text-white hover:bg-emerald-700"
          >
            <Plus className="h-3.5 w-3.5" />
            Add data
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={exportCsv}
            className="gap-1.5 rounded-full border-zinc-200 px-4 text-zinc-700 hover:border-emerald-500/40 hover:text-zinc-900"
          >
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </Button>
        </div>
      </div>

      {hasFilters && (
        <div className="flex flex-wrap items-center gap-2 border-b border-zinc-100 bg-zinc-50/60 px-5 py-3 text-xs">
          <span className="font-medium text-zinc-500">
            Filtered by:
          </span>
          {activeMetric && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-2.5 py-1 font-medium text-zinc-900">
              {activeMetric.label}
            </span>
          )}
          {activePeriodLabel && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-2.5 py-1 font-medium text-zinc-900">
              {activePeriodLabel}
            </span>
          )}
          <Link
            to="/data-collection"
            search={{ tab: "detailed" }}
            className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-zinc-500 transition hover:text-zinc-900"
          >
            <X className="h-3 w-3" />
            Clear
          </Link>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[920px] text-sm">
          <thead>
            <tr className="border-b border-zinc-100 text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-zinc-500">
              <SortableTh label="Activity data" sortKey="activity" currentKey={sortKey} dir={sortDir} onSort={toggleSort} className="px-5 py-3" />
              <SortableTh label="Start date" sortKey="startDate" currentKey={sortKey} dir={sortDir} onSort={toggleSort} className="px-3 py-3" />
              <SortableTh label="End date" sortKey="endDate" currentKey={sortKey} dir={sortDir} onSort={toggleSort} className="px-3 py-3" />
              <SortableTh label="Value" sortKey="value" currentKey={sortKey} dir={sortDir} onSort={toggleSort} className="px-3 py-3" align="right" />
              <SortableTh label="Metric" sortKey="metric" currentKey={sortKey} dir={sortDir} onSort={toggleSort} className="px-3 py-3" />
              <SortableTh label="Entity name" sortKey="entity" currentKey={sortKey} dir={sortDir} onSort={toggleSort} className="px-5 py-3" />
              <th className="px-3 py-3 text-right" />
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-5 py-12 text-center text-sm text-zinc-500"
                >
                  No records found.
                </td>
              </tr>
            ) : (
              sorted.map((r) => {
                const isEditing = editingId === r.id;
                const isSaving = savingId === r.id;
                return (
                  <tr
                    key={r.id}
                    className="border-b border-zinc-100 transition-colors hover:bg-zinc-50/60"
                  >
                    <td className="px-5 py-3 font-medium text-zinc-900">
                      {r.activity}
                    </td>
                    <td className="px-3 py-3 text-zinc-500 tabular-nums">
                      {r.startDate}
                    </td>
                    <td className="px-3 py-3 text-zinc-500 tabular-nums">
                      {r.endDate}
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-zinc-900 tabular-nums">
                      {isEditing ? (
                        <Input
                          type="number"
                          inputMode="decimal"
                          min={0}
                          step="any"
                          value={draft}
                          autoFocus
                          disabled={isSaving}
                          onChange={(e) => setDraft(e.target.value)}
                          onBlur={() => void commitEdit(r)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              void commitEdit(r);
                            } else if (e.key === "Escape") {
                              e.preventDefault();
                              cancelEdit();
                            }
                          }}
                          className="h-8 w-28 ml-auto text-right font-mono text-sm"
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => beginEdit(r)}
                          className="-mx-1 rounded px-1 py-0.5 text-right font-mono hover:bg-zinc-100 hover:ring-1 hover:ring-emerald-500/30"
                          title="Click to edit"
                        >
                          {formatNumber(r.value)}
                        </button>
                      )}
                    </td>
                    <td className="px-3 py-3 text-zinc-500">
                      {r.metric}
                    </td>
                    <td className="px-5 py-3 text-zinc-500">
                      {r.entity}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <button
                        type="button"
                        onClick={() =>
                          onViewDetails(r.metricKey, r.year, r.month)
                        }
                        className="inline-flex h-8 items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-700 transition hover:border-emerald-500/40 hover:text-emerald-700"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        View details
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      </div>
    </div>
  );
}

// ---------- Side panel: fill data ----------
function FillDataPanel({
  hotelId,
  metric,
  year,
  month,
  existing,
  onClose,
  onSaved,
}: {
  hotelId: string;
  metric: MetricDef;
  year: number;
  month: number;
  existing: MonthlyEntry | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  type Mode = "manual" | "survey" | "invoice";
  const [mode, setMode] = React.useState<Mode>("manual");

  const [value, setValue] = React.useState<string>(() => {
    const v = existing?.[metric.key];
    return v !== null && v !== undefined ? String(v) : "";
  });
  const [notes, setNotes] = React.useState<string>(existing?.notes ?? "");
  const [saving, setSaving] = React.useState(false);

  // Survey state
  const [surveyRecipient, setSurveyRecipient] = React.useState("");
  const [surveyDue, setSurveyDue] = React.useState("");

  // Invoice state
  const [invoiceFile, setInvoiceFile] = React.useState<File | null>(null);
  const [invoiceExtracted, setInvoiceExtracted] = React.useState<number | null>(
    null,
  );
  const [extracting, setExtracting] = React.useState(false);

  async function handleSave() {
    const num = Number(value);
    if (!value || Number.isNaN(num) || num < 0) {
      toast.error("Enter a valid non-negative number");
      return;
    }
    setSaving(true);
    try {
      const sourceNote =
        mode === "invoice"
          ? `Source: invoice (${invoiceFile?.name ?? "uploaded file"})`
          : mode === "survey"
            ? `Source: survey response`
            : null;
      const finalNotes = [notes, sourceNote].filter(Boolean).join(" · ") || null;

      if (existing) {
        const patch = { [metric.key]: num, notes: finalNotes } as never;
        const { error } = await supabase
          .from("monthly_entries")
          .update(patch)
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const row = {
          hotel_id: hotelId,
          year,
          month,
          [metric.key]: num,
          notes: finalNotes,
        } as never;
        const { error } = await supabase.from("monthly_entries").insert(row);
        if (error) throw error;
      }
      onSaved();
    } catch (e) {
      toast.error("Could not save data");
      // eslint-disable-next-line no-console
      console.error(e);
    } finally {
      setSaving(false);
    }
  }

  async function handleSendSurvey() {
    if (!surveyRecipient.trim()) {
      toast.error("Enter a recipient email");
      return;
    }
    toast.success(
      `Survey sent to ${surveyRecipient} for ${metric.label} (${MONTH_NAMES[month - 1]} ${year})`,
    );
    onClose();
  }

  function handleInvoiceUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setInvoiceFile(file);
    setExtracting(true);
    // Simulated extraction — replace with real OCR/extraction later
    window.setTimeout(() => {
      const fake = Math.round(
        (metric.key === "occupied_room_nights" ? 2400 : 12500) *
          (0.85 + Math.random() * 0.3),
      );
      setInvoiceExtracted(fake);
      setValue(String(fake));
      setExtracting(false);
      toast.success("Value extracted from invoice");
    }, 900);
  }

  const Icon = metric.Icon;

  const modes: { key: Mode; label: string; Icon: typeof PencilLine; desc: string }[] = [
    { key: "manual", label: "Manual", Icon: PencilLine, desc: "Type the value" },
    { key: "survey", label: "Survey", Icon: ClipboardList, desc: "Request from teammate" },
    { key: "invoice", label: "Invoice", Icon: Receipt, desc: "Upload a document" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex">
      <button
        type="button"
        aria-label="Close panel"
        onClick={onClose}
        className="flex-1 bg-zinc-900/30 backdrop-blur-sm"
      />
      <aside className="flex h-full w-full max-w-md flex-col border-l border-zinc-200 bg-white shadow-2xl">
        <header className="flex items-start justify-between gap-3 border-b border-zinc-100 px-5 py-4">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                "flex h-10 w-10 items-center justify-center rounded-xl border",
                metric.tone,
              )}
            >
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-zinc-500">
                Add data
              </div>
              <div className="text-[15px] font-semibold tracking-tight text-zinc-900">
                {metric.label}
              </div>
              <div className="text-xs text-zinc-500">
                {MONTH_NAMES[month - 1]} {year}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        {/* Mode selector */}
        <div className="border-b border-zinc-100 px-5 py-3">
          <div className="grid grid-cols-3 gap-2">
            {modes.map((m) => {
              const active = mode === m.key;
              const MIcon = m.Icon;
              return (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => setMode(m.key)}
                  className={cn(
                    "flex flex-col items-start gap-1 rounded-xl border px-3 py-2.5 text-left transition",
                    active
                      ? "border-emerald-500 bg-emerald-50/60 ring-1 ring-emerald-500/20"
                      : "border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50",
                  )}
                >
                  <MIcon
                    className={cn(
                      "h-4 w-4",
                      active ? "text-emerald-600" : "text-zinc-500",
                    )}
                  />
                  <div
                    className={cn(
                      "text-[13px] font-semibold",
                      active ? "text-emerald-700" : "text-zinc-900",
                    )}
                  >
                    {m.label}
                  </div>
                  <div className="text-[10px] leading-tight text-zinc-500">
                    {m.desc}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
          {mode === "manual" && (
            <>
              <div className="rounded-xl border border-zinc-200 bg-zinc-50/60 px-4 py-3 text-xs text-zinc-600">
                <div className="flex items-center gap-1.5 font-medium text-zinc-900">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                  {metric.activity}
                </div>
                <p className="mt-1">
                  Enter the total {metric.activity.toLowerCase()} for{" "}
                  {MONTH_NAMES[month - 1]} {year}. Once saved, it will appear in
                  the Coverage Matrix and feed into the dashboards.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="value">Value ({metric.unit})</Label>
                <Input
                  id="value"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="any"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder={`e.g. ${metric.key === "occupied_room_nights" ? "2400" : "12500"}`}
                  autoFocus
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="notes">Notes (optional)</Label>
                <textarea
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40"
                  placeholder="Invoice ref, methodology, anomalies…"
                />
              </div>
            </>
          )}

          {mode === "survey" && (
            <>
              <div className="rounded-xl border border-zinc-200 bg-zinc-50/60 px-4 py-3 text-xs text-zinc-600">
                <div className="flex items-center gap-1.5 font-medium text-zinc-900">
                  <ClipboardList className="h-3.5 w-3.5 text-emerald-600" />
                  Request via survey
                </div>
                <p className="mt-1">
                  Send a one-question survey to a teammate (e.g. the property
                  manager). They'll receive a link to enter the {metric.unit}{" "}
                  value for {MONTH_NAMES[month - 1]} {year}.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="recipient">Recipient email</Label>
                <Input
                  id="recipient"
                  type="email"
                  value={surveyRecipient}
                  onChange={(e) => setSurveyRecipient(e.target.value)}
                  placeholder="ops@grandplaza.com"
                  autoFocus
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="due">Due date (optional)</Label>
                <Input
                  id="due"
                  type="date"
                  value={surveyDue}
                  onChange={(e) => setSurveyDue(e.target.value)}
                />
              </div>

              <div className="rounded-lg border border-dashed border-zinc-200 bg-white px-3 py-2.5 text-[11px] text-zinc-500">
                Survey link will mark this cell as <strong className="text-amber-700">In progress</strong> until the recipient submits their value.
              </div>
            </>
          )}

          {mode === "invoice" && (
            <>
              <div className="rounded-xl border border-zinc-200 bg-zinc-50/60 px-4 py-3 text-xs text-zinc-600">
                <div className="flex items-center gap-1.5 font-medium text-zinc-900">
                  <Receipt className="h-3.5 w-3.5 text-emerald-600" />
                  Upload an invoice
                </div>
                <p className="mt-1">
                  Upload a PDF or image invoice. We'll extract the{" "}
                  {metric.activity.toLowerCase()} value automatically — review
                  before saving.
                </p>
              </div>

              <label
                htmlFor="invoice-file"
                className={cn(
                  "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-6 text-center transition",
                  invoiceFile
                    ? "border-emerald-300 bg-emerald-50/40"
                    : "border-zinc-300 bg-white hover:border-emerald-400 hover:bg-emerald-50/30",
                )}
              >
                <Upload className="h-5 w-5 text-zinc-400" />
                <div className="text-[13px] font-medium text-zinc-900">
                  {invoiceFile ? invoiceFile.name : "Click to upload invoice"}
                </div>
                <div className="text-[11px] text-zinc-500">
                  PDF, PNG, JPG · up to 10 MB
                </div>
                <input
                  id="invoice-file"
                  type="file"
                  accept=".pdf,image/*"
                  className="hidden"
                  onChange={handleInvoiceUpload}
                />
              </label>

              {extracting && (
                <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-[12px] text-zinc-600">
                  Extracting value from invoice…
                </div>
              )}

              {invoiceExtracted !== null && !extracting && (
                <div className="space-y-1.5">
                  <Label htmlFor="invoice-value">
                    Extracted value ({metric.unit})
                  </Label>
                  <Input
                    id="invoice-value"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="any"
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                  />
                  <p className="text-[11px] text-zinc-500">
                    Review and adjust if needed before saving.
                  </p>
                </div>
              )}
            </>
          )}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-zinc-100 px-5 py-4">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={saving}
            className="rounded-full"
          >
            Cancel
          </Button>
          {mode === "survey" ? (
            <Button
              onClick={handleSendSurvey}
              disabled={saving}
              className="rounded-full bg-emerald-600 px-5 text-white hover:bg-emerald-700"
            >
              Send survey
            </Button>
          ) : (
            <Button
              onClick={handleSave}
              disabled={saving || (mode === "invoice" && invoiceExtracted === null)}
              className="rounded-full bg-emerald-600 px-5 text-white hover:bg-emerald-700"
            >
              {saving ? "Saving…" : "Save data"}
            </Button>
          )}
        </footer>
      </aside>
    </div>
  );
}

// ---------- Side panel: view measuring point details ----------
interface MeasuringPoint {
  id: string;
  label: string;
  value: number;
  unit: string;
  source: string;
  recordedAt: string;
  notes: string | null;
}

function DetailsPanel({
  hotel,
  metric,
  year,
  month,
  entry,
  onClose,
}: {
  hotel: Hotel | null;
  metric: MetricDef;
  year: number;
  month: number;
  entry: MonthlyEntry | null;
  onClose: () => void;
}) {
  const Icon = metric.Icon;

  // Build the list of measuring points. The stored monthly total is split
  // into illustrative sub-points (meters / sources) per metric so the panel
  // demonstrates the multi-point breakdown UI.
  const points: MeasuringPoint[] = React.useMemo(() => {
    if (!entry) return [];
    const v = entry[metric.key];
    if (v === null || v === undefined) return [];
    const total = Number(v);

    // Per-metric breakdown templates: weights MUST sum to 1.
    const templates: Record<
      MetricKey,
      { label: string; weight: number; source: string }[]
    > = {
      electricity_kwh: [
        { label: "Main building meter", weight: 0.62, source: "Utility invoice" },
        { label: "Spa & pool sub-meter", weight: 0.23, source: "Sub-meter reading" },
        { label: "Kitchen sub-meter", weight: 0.15, source: "Sub-meter reading" },
      ],
      gas_kwh: [
        { label: "Boiler room", weight: 0.7, source: "Utility invoice" },
        { label: "Kitchen burners", weight: 0.3, source: "Sub-meter reading" },
      ],
      water_m3: [
        { label: "Main supply meter", weight: 0.55, source: "Utility invoice" },
        { label: "Irrigation meter", weight: 0.25, source: "Sub-meter reading" },
        { label: "Laundry sub-meter", weight: 0.2, source: "Sub-meter reading" },
      ],
      waste_kg: [
        { label: "Mixed municipal waste", weight: 0.6, source: "Hauler ticket" },
        { label: "Food waste (kitchen)", weight: 0.25, source: "Internal log" },
        { label: "Packaging waste", weight: 0.15, source: "Hauler ticket" },
      ],
      occupied_room_nights: [
        { label: "PMS export — all room types", weight: 1, source: "PMS export" },
      ],
    };

    const tmpl = templates[metric.key];
    const recordedAt = entry.updated_at ?? entry.created_at ?? "";
    return tmpl.map((t, i) => ({
      id: `${entry.id}-${metric.key}-${i + 1}`,
      label: t.label,
      value: Math.round(total * t.weight * 100) / 100,
      unit: metric.unit,
      source: t.source,
      recordedAt,
      notes: i === 0 ? entry.notes ?? null : null,
    }));
  }, [entry, metric]);


  const total = points.reduce((acc, p) => acc + p.value, 0);

  return (
    <div className="fixed inset-0 z-50 flex">
      <button
        type="button"
        aria-label="Close panel"
        onClick={onClose}
        className="flex-1 bg-zinc-900/30 backdrop-blur-sm"
      />
      <aside className="flex h-full w-full max-w-lg flex-col border-l border-zinc-200 bg-white shadow-2xl">
        <header className="flex items-start justify-between gap-3 border-b border-zinc-100 px-6 py-5">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                "flex h-10 w-10 items-center justify-center rounded-xl border",
                metric.tone,
              )}
            >
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                Measuring points
              </div>
              <div className="text-[15px] font-semibold tracking-tight text-zinc-900">
                {metric.label}
              </div>
              <div className="text-xs text-zinc-500">
                {MONTH_NAMES[month - 1]} {year} · {hotel?.name ?? "Hotel"}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-900"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 space-y-3 overflow-y-auto px-6 py-5">
          <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3.5">
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
              Period total
            </div>
            <div className="mt-1 text-2xl font-bold tracking-tight text-zinc-900 tabular-nums">
              {formatNumber(total)}{" "}
              <span className="text-sm font-medium text-zinc-500">
                {metric.unit}
              </span>
            </div>
            <div className="mt-1 text-xs text-zinc-500">
              Sum of {points.length} measuring point
              {points.length === 1 ? "" : "s"} for {metric.activity.toLowerCase()}.
            </div>
          </div>

          {points.length === 0 ? (
            <div className="rounded-xl border border-dashed border-zinc-200 bg-white px-4 py-8 text-center text-sm text-zinc-500">
              No measuring points recorded for this period yet.
            </div>
          ) : (
            <ul className="space-y-2.5">
              {points.map((p, idx) => (
                <li
                  key={p.id}
                  className="rounded-xl border border-zinc-200 bg-white px-4 py-3 transition hover:border-emerald-500/40"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                        Measuring point {idx + 1}
                      </div>
                      <div className="mt-0.5 text-sm font-semibold text-zinc-900">
                        {p.label}
                      </div>
                    </div>
                    <div className="text-right text-sm font-semibold tabular-nums text-zinc-900">
                      {formatNumber(p.value)}{" "}
                      <span className="font-normal text-zinc-500">{p.unit}</span>
                    </div>
                  </div>
                  <div className="mt-2.5 flex items-center justify-between gap-2 text-[11px] text-zinc-500">
                    <span>
                      <span className="text-zinc-400">Source:</span>{" "}
                      <span className="text-zinc-700">{p.source}</span>
                    </span>
                    <span>
                      <span className="text-zinc-400">Recorded:</span>{" "}
                      <span className="text-zinc-700 tabular-nums">
                        {p.recordedAt ? p.recordedAt.slice(0, 10) : "—"}
                      </span>
                    </span>
                  </div>
                  {p.notes && (
                    <div className="mt-2 rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
                      {p.notes}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}

          <div className="rounded-xl border border-dashed border-zinc-200 bg-white px-4 py-3 text-[11px] text-zinc-500">
            Multiple measuring points per period (e.g. separate meters,
            sub-buildings, or invoices) will appear here as they are added.
          </div>
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-zinc-100 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 items-center rounded-full border border-zinc-200 bg-white px-4 text-sm font-medium text-zinc-700 transition hover:border-zinc-300 hover:bg-zinc-50"
          >
            Close
          </button>
        </footer>
      </aside>
    </div>
  );
}

function SortableTh({
  label,
  sortKey,
  currentKey,
  dir,
  onSort,
  className,
  align,
}: {
  label: string;
  sortKey: "activity" | "startDate" | "endDate" | "value" | "metric" | "entity";
  currentKey: string;
  dir: "asc" | "desc";
  onSort: (k: "activity" | "startDate" | "endDate" | "value" | "metric" | "entity") => void;
  className?: string;
  align?: "left" | "right";
}) {
  const active = currentKey === sortKey;
  const isRight = align === "right";
  return (
    <th className={`${className ?? ""} ${isRight ? "text-right" : ""}`}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`inline-flex items-center gap-1 uppercase tracking-[0.08em] transition-colors hover:text-zinc-900 ${active ? "text-zinc-900" : "text-zinc-500"} ${isRight ? "flex-row-reverse" : ""}`}
      >
        {label}
        {active ? (
          dir === "asc" ? (
            <ChevronUp className="h-3 w-3" />
          ) : (
            <ChevronDown className="h-3 w-3" />
          )
        ) : (
          <ChevronsUpDown className="h-3 w-3 opacity-50" />
        )}
      </button>
    </th>
  );
}
