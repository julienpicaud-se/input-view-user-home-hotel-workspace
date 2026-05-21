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
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { getActiveHotelId, type Hotel, type MonthlyEntry } from "@/lib/hotel";
import { HotelSwitcher } from "@/components/hotel-switcher";
import { MONTH_SHORT, MONTH_NAMES, formatNumber } from "@/lib/format";
import { PageContainer, PageHeader } from "@/components/page-shell";
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
    <PageContainer>
      <PageHeader
        eyebrow="Hotel data"
        title="Data Collection"
        subtitle="Track collection progress month over month and browse every raw record submitted for this hotel."
        actions={
          <div className="flex items-center gap-2">
            <Link
              to="/workspace"
              search={{ tab: "overview" } as never}
              className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-xs font-medium text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Workspace
            </Link>
            <HotelSwitcher />
          </div>
        }
      />

      <TabBar active={tab} />

      {loading ? (
        <div className="rounded-2xl border border-border bg-card p-12 text-center text-sm text-muted-foreground">
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
    </PageContainer>
  );
}

// ---------- Tabs ----------
function TabBar({ active }: { active: "coverage" | "detailed" }) {
  const tabs: { key: "coverage" | "detailed"; label: string }[] = [
    { key: "coverage", label: "Coverage Matrix" },
    { key: "detailed", label: "Detailed Data" },
  ];
  return (
    <div className="mb-6 inline-flex w-full justify-start gap-1 rounded-2xl border border-border bg-card p-1.5 sm:w-auto">
      {tabs.map((t) => {
        const isActive = t.key === active;
        return (
          <Link
            key={t.key}
            to="/data-collection"
            search={{ tab: t.key }}
            className={cn(
              "inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-medium transition-colors",
              isActive
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
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
}: {
  hotelId: string;
  hotel: Hotel | null;
  entries: MonthlyEntry[];
  onCellClick: (metric: MetricDef, year: number, month: number) => void;
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
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KpiCard
          label="Coverage"
          value={`${coveragePct}%`}
          tone="text-emerald-600"
          hint={`${covered} of ${total} cells filled`}
        />
        <KpiCard
          label="Records"
          value={formatNumber(entries.length)}
          tone="text-sky-600"
          hint="Monthly entries submitted"
        />
        <KpiCard
          label="Open gaps"
          value={formatNumber(missing)}
          tone={missing > 0 ? "text-amber-600" : "text-emerald-600"}
          hint="Cells that need attention"
        />
      </div>

      <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-serif text-lg font-semibold">Coverage Matrix</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {rangeLabel} · {hotel?.name ?? "Hotel"} · Click a missing or
              draft cell to add data.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <GranularityToggle value={granularity} onChange={setGranularity} />
            <RangeSelector
              start={rangeStart}
              end={rangeEnd}
              onChange={(s, e) => {
                setRangeStart(s);
                setRangeEnd(e);
              }}
            />
          </div>
        </div>


        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-separate border-spacing-0 text-sm">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-card px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Data type
                </th>
                {periods.map((p) => (
                  <th
                    key={p.key}
                    className="px-2 py-2 text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
                  >
                    <div>{p.label}</div>
                    <div className="text-[9px] font-normal text-muted-foreground/70">
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
                  <tr key={metric.key} className="border-t border-border/60">
                    <td className="sticky left-0 z-10 bg-card px-3 py-3">
                      <div className="flex items-center gap-2">
                        <div
                          className={cn(
                            "flex h-7 w-7 items-center justify-center rounded-lg border",
                            metric.tone,
                          )}
                        >
                          <Icon className="h-3.5 w-3.5" />
                        </div>
                        <div className="leading-tight">
                          <div className="text-sm font-medium text-foreground">
                            {metric.label}
                          </div>
                          <div className="text-[10px] text-muted-foreground">
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
                        "mx-auto flex h-6 w-6 items-center justify-center rounded-full transition-transform cursor-pointer hover:scale-125 hover:ring-2 hover:ring-primary/40",
                        statusDot(status),
                      );
                      const icon =
                        status === "in_progress" ? (
                          <Clock className="h-3 w-3 text-white" />
                        ) : status === "missing" ? (
                          <AlertCircle className="h-3 w-3 text-muted-foreground" />
                        ) : null;
                      return (
                        <td
                          key={`${metric.key}-${p.key}`}
                          className="px-1 py-3 text-center"
                        >
                          {status === "done" ? (
                            <Link
                              to="/data-collection"
                              search={{
                                tab: "detailed",
                                metric: metric.key,
                                period,
                              }}
                              title={`${tooltip} (view in Detailed Data)`}
                              className={commonClass}
                            >
                              {icon}
                            </Link>
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
        <div className="mt-3 flex justify-end border-t border-border/40 pt-3">
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
  const options: { key: Granularity; label: string }[] = [
    { key: "monthly", label: "Monthly" },
    { key: "quarterly", label: "Quarterly" },
    { key: "semester", label: "Semester" },
    { key: "annual", label: "Annual" },
  ];
  return (
    <div className="inline-flex items-center gap-0.5 rounded-xl border border-border bg-muted/40 p-0.5">
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          onClick={() => onChange(o.key)}
          className={cn(
            "rounded-lg px-2.5 py-1 text-xs font-medium transition",
            value === o.key
              ? "bg-emerald-500 text-white shadow-sm"
              : "text-muted-foreground hover:bg-background hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
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
    if (sDate > eDate) {
      // Push end to match start
      onChange(s, s);
    } else {
      onChange(s, end);
    }
  }

  function updateEnd(month: number, year: number) {
    const e = { month, year };
    const sDate = new Date(start.year, start.month - 1, 1);
    const eDate = new Date(year, month - 1, 1);
    if (eDate < sDate) {
      // Push start to match end
      onChange(e, e);
    } else {
      onChange(start, e);
    }
  }

  function resetRolling() {
    const now = new Date();
    const e = { year: now.getFullYear(), month: now.getMonth() + 1 };
    const sDate = new Date(now.getFullYear(), now.getMonth() - 11, 1);
    const s = { year: sDate.getFullYear(), month: sDate.getMonth() + 1 };
    onChange(s, e);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1.5 rounded-xl border border-border bg-muted/40 px-2.5 py-1.5 text-xs">
        <span className="text-muted-foreground">From</span>
        <select
          value={start.month}
          onChange={(e) => updateStart(Number(e.target.value), start.year)}
          className="rounded-md border border-input bg-background px-1.5 py-1 text-xs outline-none focus:ring-1 focus:ring-ring"
        >
          {MONTH_SHORT.map((m, i) => (
            <option key={m} value={i + 1}>
              {m}
            </option>
          ))}
        </select>
        <input
          type="number"
          min={2000}
          max={2100}
          value={start.year}
          onChange={(e) => updateStart(start.month, Number(e.target.value))}
          className="w-16 rounded-md border border-input bg-background px-1.5 py-1 text-xs text-center outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      <span className="text-muted-foreground text-xs">→</span>

      <div className="flex items-center gap-1.5 rounded-xl border border-border bg-muted/40 px-2.5 py-1.5 text-xs">
        <span className="text-muted-foreground">To</span>
        <select
          value={end.month}
          onChange={(e) => updateEnd(Number(e.target.value), end.year)}
          className="rounded-md border border-input bg-background px-1.5 py-1 text-xs outline-none focus:ring-1 focus:ring-ring"
        >
          {MONTH_SHORT.map((m, i) => (
            <option key={m} value={i + 1}>
              {m}
            </option>
          ))}
        </select>
        <input
          type="number"
          min={2000}
          max={2100}
          value={end.year}
          onChange={(e) => updateEnd(end.month, Number(e.target.value))}
          className="w-16 rounded-md border border-input bg-background px-1.5 py-1 text-xs text-center outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      <button
        type="button"
        onClick={resetRolling}
        className="rounded-lg px-2 py-1.5 text-xs font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
        title="Reset to last 12 months"
      >
        Last 12 months
      </button>
    </div>
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
      return "bg-amber-500";
    case "missing":
      return "bg-muted border border-dashed border-muted-foreground/40";
  }
}

function Legend() {
  const items: { s: CellStatus; label: string }[] = [
    { s: "done", label: "Done" },
    { s: "in_progress", label: "In progress" },
    { s: "missing", label: "Missing" },
  ];
  return (
    <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
      {items.map((it) => (
        <span key={it.s} className="inline-flex items-center gap-1.5">
          <span className={cn("h-3 w-3 rounded-full", statusDot(it.s))} />
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
}: {
  label: string;
  value: string;
  hint: string;
  tone: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </div>
      <div className={cn("mt-2 font-serif text-3xl font-semibold", tone)}>
        {value}
      </div>
      <div className="mt-1 text-xs text-muted-foreground">{hint}</div>
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
  onRefresh,
}: {
  hotel: Hotel | null;
  entries: MonthlyEntry[];
  metricFilter?: MetricKey;
  periodFilter?: string;
  onViewDetails: (metricKey: MetricKey, year: number, month: number) => void;
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

  const [q, setQ] = React.useState("");
  const filtered = rows.filter((r) => {
    if (metricFilter && r.metricKey !== metricFilter) return false;
    if (periodFilter && r.period !== periodFilter) return false;
    if (!q) return true;
    return `${r.activity} ${r.entity} ${r.metric}`
      .toLowerCase()
      .includes(q.toLowerCase());
  });

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
    <div className="rounded-2xl border border-border bg-card shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 px-5 py-4">
        <div>
          <h2 className="font-serif text-lg font-semibold">Detailed Data</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {formatNumber(filtered.length)} record
            {filtered.length === 1 ? "" : "s"} ·{" "}
            {hotel?.name ?? "Hotel"} · Click any value to edit
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search activity…"
              className="h-9 w-56 pl-8 text-sm"
            />
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={exportCsv}
            className="gap-1.5"
          >
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </Button>
        </div>
      </div>

      {hasFilters && (
        <div className="flex flex-wrap items-center gap-2 border-b border-border/60 bg-muted/30 px-5 py-3 text-xs">
          <span className="font-medium text-muted-foreground">
            Filtered by:
          </span>
          {activeMetric && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 font-medium text-foreground">
              {activeMetric.label}
            </span>
          )}
          {activePeriodLabel && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 font-medium text-foreground">
              {activePeriodLabel}
            </span>
          )}
          <Link
            to="/data-collection"
            search={{ tab: "detailed" }}
            className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-muted-foreground transition hover:text-foreground"
          >
            <X className="h-3 w-3" />
            Clear
          </Link>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[920px] text-sm">
          <thead>
            <tr className="border-b border-border/60 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              <th className="px-5 py-3">Activity data</th>
              <th className="px-3 py-3">Start date</th>
              <th className="px-3 py-3">End date</th>
              <th className="px-3 py-3 text-right">Value</th>
              <th className="px-3 py-3">Metric</th>
              <th className="px-5 py-3">Entity name</th>
              <th className="px-3 py-3 text-right" />
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-5 py-12 text-center text-sm text-muted-foreground"
                >
                  No records found.
                </td>
              </tr>
            ) : (
              filtered.map((r) => {
                const isEditing = editingId === r.id;
                const isSaving = savingId === r.id;
                return (
                  <tr
                    key={r.id}
                    className="border-b border-border/40 transition-colors hover:bg-muted/30"
                  >
                    <td className="px-5 py-3 font-medium text-foreground">
                      {r.activity}
                    </td>
                    <td className="px-3 py-3 text-muted-foreground">
                      {r.startDate}
                    </td>
                    <td className="px-3 py-3 text-muted-foreground">
                      {r.endDate}
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-foreground">
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
                          className="-mx-1 rounded px-1 py-0.5 text-right font-mono hover:bg-muted/70 hover:ring-1 hover:ring-primary/30"
                          title="Click to edit"
                        >
                          {formatNumber(r.value)}
                        </button>
                      )}
                    </td>
                    <td className="px-3 py-3 text-muted-foreground">
                      {r.metric}
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">
                      {r.entity}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          onViewDetails(r.metricKey, r.year, r.month)
                        }
                        className="gap-1.5"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        View details
                      </Button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
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
  const [value, setValue] = React.useState<string>(() => {
    const v = existing?.[metric.key];
    return v !== null && v !== undefined ? String(v) : "";
  });
  const [notes, setNotes] = React.useState<string>(existing?.notes ?? "");
  const [saving, setSaving] = React.useState(false);

  async function handleSave() {
    const num = Number(value);
    if (!value || Number.isNaN(num) || num < 0) {
      toast.error("Enter a valid non-negative number");
      return;
    }
    setSaving(true);
    try {
      if (existing) {
        const patch = { [metric.key]: num, notes: notes || null } as never;
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
          notes: notes || null,
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

  const Icon = metric.Icon;

  return (
    <div className="fixed inset-0 z-50 flex">
      <button
        type="button"
        aria-label="Close panel"
        onClick={onClose}
        className="flex-1 bg-foreground/30 backdrop-blur-sm"
      />
      <aside className="flex h-full w-full max-w-md flex-col border-l border-border bg-background shadow-2xl">
        <header className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
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
              <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                Add data
              </div>
              <div className="font-serif text-lg font-semibold">
                {metric.label}
              </div>
              <div className="text-xs text-muted-foreground">
                {MONTH_NAMES[month - 1]} {year}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
          <div className="rounded-xl border border-border bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5 font-medium text-foreground">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
              {metric.activity}
            </div>
            <p className="mt-1">
              Enter the total {metric.activity.toLowerCase()} for{" "}
              {MONTH_NAMES[month - 1]} {year}. Once saved, it will appear in the
              Coverage Matrix as submitted and feed into the dashboards.
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
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="Invoice ref, methodology, anomalies…"
            />
          </div>
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-border px-5 py-4">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save data"}
          </Button>
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
        className="flex-1 bg-foreground/30 backdrop-blur-sm"
      />
      <aside className="flex h-full w-full max-w-lg flex-col border-l border-border bg-background shadow-2xl">
        <header className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
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
              <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                Measuring points
              </div>
              <div className="font-serif text-lg font-semibold">
                {metric.label}
              </div>
              <div className="text-xs text-muted-foreground">
                {MONTH_NAMES[month - 1]} {year} · {hotel?.name ?? "Hotel"}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
          <div className="rounded-xl border border-border bg-muted/30 px-4 py-3">
            <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
              Period total
            </div>
            <div className="mt-1 font-serif text-2xl font-semibold text-foreground">
              {formatNumber(total)}{" "}
              <span className="text-sm font-normal text-muted-foreground">
                {metric.unit}
              </span>
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              Sum of {points.length} measuring point
              {points.length === 1 ? "" : "s"} for {metric.activity.toLowerCase()}.
            </div>
          </div>

          {points.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
              No measuring points recorded for this period yet.
            </div>
          ) : (
            <ul className="space-y-3">
              {points.map((p, idx) => (
                <li
                  key={p.id}
                  className="rounded-xl border border-border bg-card px-4 py-3 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                        Measuring point {idx + 1}
                      </div>
                      <div className="mt-0.5 font-medium text-foreground">
                        {p.label}
                      </div>
                    </div>
                    <div className="text-right font-mono text-sm text-foreground">
                      {formatNumber(p.value)}{" "}
                      <span className="text-muted-foreground">{p.unit}</span>
                    </div>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-muted-foreground">
                    <div>
                      <span className="font-medium text-foreground/80">
                        Source:
                      </span>{" "}
                      {p.source}
                    </div>
                    <div className="text-right">
                      <span className="font-medium text-foreground/80">
                        Recorded:
                      </span>{" "}
                      {p.recordedAt ? p.recordedAt.slice(0, 10) : "—"}
                    </div>
                  </div>
                  {p.notes && (
                    <div className="mt-2 rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                      {p.notes}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}

          <div className="rounded-xl border border-dashed border-border bg-card/50 px-4 py-3 text-xs text-muted-foreground">
            Multiple measuring points per period (e.g. separate meters,
            sub-buildings, or invoices) will appear here as they are added.
          </div>
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-border px-5 py-4">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </footer>
      </aside>
    </div>
  );
}
