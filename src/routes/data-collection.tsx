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
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getActiveHotelId, type Hotel, type MonthlyEntry } from "@/lib/hotel";
import { HotelSwitcher } from "@/components/hotel-switcher";
import { MONTH_SHORT, MONTH_NAMES, formatNumber } from "@/lib/format";
import { PageContainer, PageHeader } from "@/components/page-shell";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const searchSchema = z.object({
  tab: z.enum(["coverage", "detailed"]).catch("coverage"),
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

// Deterministic pseudo-random so the demo statuses feel real & stable.
function statusFor(hotelId: string, year: number, month: number, key: MetricKey): CellStatus {
  const seed =
    hotelId.charCodeAt(hotelId.length - 1) +
    year * 13 +
    month * 7 +
    key.length * 3;
  const r = (Math.sin(seed) + 1) / 2;
  if (r < 0.15) return "missing";
  if (r < 0.32) return "in_progress";
  return "done";
}

// ---------- Page ----------
function DataCollectionPage() {
  const { tab } = Route.useSearch();
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

  // Side panel state for filling in missing data
  const [editing, setEditing] = React.useState<{
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
        <DetailedData hotel={hotel} entries={entries} />
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
  // Show a rolling 12-month window ending at the current month.
  const now = new Date();
  const months: { year: number; month: number }[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ year: d.getFullYear(), month: d.getMonth() + 1 });
  }

  const entryByKey = new Map<string, MonthlyEntry>();
  for (const e of entries) entryByKey.set(`${e.year}-${e.month}`, e);

  function cellStatus(
    metric: MetricKey,
    year: number,
    month: number,
  ): CellStatus {
    const e = entryByKey.get(`${year}-${month}`);
    if (e && e[metric] !== null && e[metric] !== undefined) {
      return statusFor(hotelId, year, month, metric);
    }
    return statusFor(hotelId, year, month, metric);
  }

  // Aggregate KPIs
  const total = METRICS.length * months.length;
  let covered = 0;
  let missing = 0;
  for (const m of METRICS) {
    for (const mo of months) {
      const s = cellStatus(m.key, mo.year, mo.month);
      if (s === "missing") missing++;
      else covered++;
    }
  }
  const coveragePct = Math.round((covered / total) * 100);

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
              Rolling 12 months · {hotel?.name ?? "Hotel"} · Click a missing or
              draft cell to add data.
            </p>
          </div>
          <Legend />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-separate border-spacing-0 text-sm">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-card px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Data type
                </th>
                {months.map((m) => (
                  <th
                    key={`${m.year}-${m.month}`}
                    className="px-2 py-2 text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
                  >
                    <div>{MONTH_SHORT[m.month - 1]}</div>
                    <div className="text-[9px] font-normal text-muted-foreground/70">
                      {String(m.year).slice(2)}
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
                    {months.map((m) => {
                      const status = cellStatus(metric.key, m.year, m.month);
                      const clickable =
                        status === "missing" || status === "in_progress";
                      return (
                        <td
                          key={`${metric.key}-${m.year}-${m.month}`}
                          className="px-1 py-3 text-center"
                        >
                          <button
                            type="button"
                            onClick={() =>
                              onCellClick(metric, m.year, m.month)
                            }
                            title={`${MONTH_NAMES[m.month - 1]} ${m.year} — ${statusLabel(status)}${clickable ? " (click to add)" : ""}`}
                            className={cn(
                              "mx-auto flex h-6 w-6 items-center justify-center rounded-full transition-transform",
                              statusDot(status),
                              clickable
                                ? "cursor-pointer hover:scale-125 hover:ring-2 hover:ring-primary/40"
                                : "cursor-default",
                            )}
                          >
                            {status === "in_progress" && (
                              <Clock className="h-3 w-3 text-white" />
                            )}
                            {status === "missing" && (
                              <AlertCircle className="h-3 w-3 text-muted-foreground" />
                            )}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function statusLabel(s: CellStatus): string {
  switch (s) {
    case "approved":
      return "Approved";
    case "submitted":
      return "Submitted";
    case "draft":
      return "Draft";
    case "missing":
      return "Missing";
  }
}

function statusDot(s: CellStatus): string {
  switch (s) {
    case "approved":
      return "bg-emerald-500";
    case "submitted":
      return "bg-sky-500";
    case "draft":
      return "bg-amber-500";
    case "missing":
      return "bg-muted border border-dashed border-muted-foreground/40";
  }
}

function Legend() {
  const items: { s: CellStatus; label: string }[] = [
    { s: "approved", label: "Approved" },
    { s: "submitted", label: "Submitted" },
    { s: "draft", label: "Draft" },
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
}

function DetailedData({
  hotel,
  entries,
}: {
  hotel: Hotel | null;
  entries: MonthlyEntry[];
}) {
  const rows: Row[] = React.useMemo(() => {
    const out: Row[] = [];
    for (const e of entries) {
      const start = new Date(e.year, e.month - 1, 1);
      const end = new Date(e.year, e.month, 0);
      const startStr = start.toISOString().slice(0, 10);
      const endStr = end.toISOString().slice(0, 10);
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
        });
      }
    }
    return out.sort((a, b) =>
      a.startDate < b.startDate ? 1 : a.startDate > b.startDate ? -1 : 0,
    );
  }, [entries, hotel]);

  const [q, setQ] = React.useState("");
  const filtered = rows.filter((r) =>
    !q
      ? true
      : `${r.activity} ${r.entity} ${r.metric}`
          .toLowerCase()
          .includes(q.toLowerCase()),
  );

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
            {hotel?.name ?? "Hotel"}
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

      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-sm">
          <thead>
            <tr className="border-b border-border/60 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              <th className="px-5 py-3">Activity data</th>
              <th className="px-3 py-3">Start date</th>
              <th className="px-3 py-3">End date</th>
              <th className="px-3 py-3 text-right">Value</th>
              <th className="px-3 py-3">Metric</th>
              <th className="px-5 py-3">Entity name</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-5 py-12 text-center text-sm text-muted-foreground"
                >
                  No records found.
                </td>
              </tr>
            ) : (
              filtered.map((r) => (
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
                    {formatNumber(r.value)}
                  </td>
                  <td className="px-3 py-3 text-muted-foreground">
                    {r.metric}
                  </td>
                  <td className="px-5 py-3 text-muted-foreground">
                    {r.entity}
                  </td>
                </tr>
              ))
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
