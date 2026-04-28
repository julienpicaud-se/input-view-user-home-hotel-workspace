import * as React from "react";
import {
  ClipboardList,
  ArrowUpRight,
  ArrowDownRight,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  Sparkles,
  Clock,
  Filter,
  ChevronLeft,
  ChevronRight,
  ListOrdered,
  Layers,
  Building2,
  Activity,
  X,
  Pencil,
  Flag,
  HelpCircle,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { formatNumber } from "@/lib/format";
import type { Hotel, MonthlyEntry } from "@/lib/hotel";
import { toast } from "sonner";

type MetricKey =
  | "electricity_kwh"
  | "gas_kwh"
  | "water_m3"
  | "waste_kg"
  | "occupied_room_nights";

const METRICS: { key: MetricKey; label: string; unit: string }[] = [
  { key: "electricity_kwh", label: "Electricity", unit: "kWh" },
  { key: "gas_kwh", label: "Gas", unit: "kWh" },
  { key: "water_m3", label: "Water", unit: "m³" },
  { key: "waste_kg", label: "Waste", unit: "kg" },
  { key: "occupied_room_nights", label: "Room-nights", unit: "nights" },
];

type RowStatus = "normal" | "attention" | "issue" | "updated";

interface Submission {
  id: string;
  entryId: string;
  metric: MetricKey;
  metricLabel: string;
  unit: string;
  value: number | null;
  year: number;
  month: number;
  startDate: string;
  endDate: string;
  inputDate: string | null;
  updatedAt: string | null;
  prevValue: number | null;
  prevYearValue: number | null;
  status: RowStatus;
  insight: string | null;
  // Sparkline of last 6 values for this metric (oldest → newest, current included)
  history: { ym: string; value: number | null }[];
  // ms since last update — for "updated recently"
  ageDays: number | null;
}

const MONTH_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function ymLabel(y: number, m: number) {
  return `${MONTH_SHORT[m - 1]} ${String(y).slice(2)}`;
}
function ymKey(y: number, m: number) {
  return y * 100 + m;
}
function fmtIso(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}
function daysAgo(iso: string | null): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / 86_400_000);
}

/** Compute status & insight for a metric value vs its previous-month value. */
function deriveStatus(
  metric: MetricKey,
  value: number | null,
  prev: number | null,
  prevYear: number | null,
  ageDays: number | null,
): { status: RowStatus; insight: string | null } {
  // Missing / zero on a metric that should be present
  if (value === null) {
    return { status: "issue", insight: "Missing value" };
  }
  if (value === 0 && metric !== "occupied_room_nights") {
    return { status: "issue", insight: "Reported as 0 — verify" };
  }

  // Recently updated wins as a soft state if last 7 days
  const recentlyUpdated = ageDays !== null && ageDays <= 7;

  let pctVsPrev: number | null = null;
  if (prev !== null && prev > 0) {
    pctVsPrev = ((value - prev) / prev) * 100;
  }

  // Strong variation thresholds
  if (pctVsPrev !== null && Math.abs(pctVsPrev) >= 20) {
    const arrow = pctVsPrev > 0 ? "↗" : "↘";
    const sign = pctVsPrev > 0 ? "+" : "";
    return {
      status: "attention",
      insight: `${arrow} ${sign}${pctVsPrev.toFixed(0)}% vs prev. month`,
    };
  }

  if (pctVsPrev !== null && Math.abs(pctVsPrev) >= 8) {
    const arrow = pctVsPrev > 0 ? "↗" : "↘";
    const sign = pctVsPrev > 0 ? "+" : "";
    return {
      status: recentlyUpdated ? "updated" : "normal",
      insight: `${arrow} ${sign}${pctVsPrev.toFixed(0)}% vs prev. month`,
    };
  }

  if (recentlyUpdated) {
    return { status: "updated", insight: "Updated recently" };
  }

  if (prevYear !== null && prevYear > 0) {
    const yoy = ((value - prevYear) / prevYear) * 100;
    if (Math.abs(yoy) >= 15) {
      const sign = yoy > 0 ? "+" : "";
      return {
        status: "normal",
        insight: `${sign}${yoy.toFixed(0)}% YoY`,
      };
    }
  }

  return { status: "normal", insight: null };
}

function statusPill(status: RowStatus) {
  const map: Record<RowStatus, { label: string; cls: string; dot: string }> = {
    normal:    { label: "On track", cls: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20", dot: "bg-emerald-500" },
    attention: { label: "Attention", cls: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20", dot: "bg-amber-500" },
    issue:     { label: "Issue",     cls: "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/20",     dot: "bg-rose-500" },
    updated:   { label: "Updated",   cls: "bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/20",         dot: "bg-sky-500" },
  };
  const s = map[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium ${s.cls}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}

function Sparkline({ points }: { points: { value: number | null }[] }) {
  const vals = points.map((p) => p.value ?? 0);
  const max = Math.max(...vals, 1);
  const min = Math.min(...vals, 0);
  const range = max - min || 1;
  const w = 80;
  const h = 22;
  const step = vals.length > 1 ? w / (vals.length - 1) : w;
  const d = vals
    .map((v, i) => {
      const x = i * step;
      const y = h - ((v - min) / range) * h;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg width={w} height={h} className="overflow-visible">
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.5" className="text-primary/70" />
      {vals.map((v, i) => {
        const x = i * step;
        const y = h - ((v - min) / range) * h;
        const isLast = i === vals.length - 1;
        return (
          <circle
            key={i}
            cx={x}
            cy={y}
            r={isLast ? 2.4 : 1.4}
            className={isLast ? "fill-primary" : "fill-primary/50"}
          />
        );
      })}
    </svg>
  );
}

type ViewMode = "chronological" | "metric" | "site" | "status";
type IntentFilter = "all" | "changed" | "missing" | "abnormal" | "mine";

const INTENT_FILTERS: { key: IntentFilter; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: "all",      label: "All updates",       icon: Activity },
  { key: "changed",  label: "What changed recently?", icon: Sparkles },
  { key: "missing",  label: "What is missing?",  icon: AlertCircle },
  { key: "abnormal", label: "What looks abnormal?", icon: AlertTriangle },
  { key: "mine",     label: "What I submitted",  icon: CheckCircle2 },
];

const VIEW_MODES: { key: ViewMode; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: "chronological", label: "Chronological", icon: Clock },
  { key: "metric",        label: "By metric",     icon: Layers },
  { key: "site",          label: "By site",       icon: Building2 },
  { key: "status",        label: "Issues first",  icon: AlertCircle },
];

export function PastDataActivity({
  entries,
  hotel,
  onChanged,
}: {
  entries: MonthlyEntry[]; // oldest → newest
  hotel: Hotel;
  onChanged?: () => void;
}) {
  const [ownerName, setOwnerName] = React.useState<string>("—");
  const [intent, setIntent] = React.useState<IntentFilter>("all");
  const [viewMode, setViewMode] = React.useState<ViewMode>("chronological");
  const [latestFirst, setLatestFirst] = React.useState(true);
  const [selectedMonth, setSelectedMonth] = React.useState<string>("all"); // "all" or "YYYY-MM"
  const [preset, setPreset] = React.useState<"all" | "last1" | "last3" | "yoy">("all");
  const [openSubmission, setOpenSubmission] = React.useState<Submission | null>(null);
  const [editValue, setEditValue] = React.useState<string>("");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from("user_profiles")
        .select("display_name, email")
        .limit(1)
        .maybeSingle();
      if (cancelled) return;
      setOwnerName(data?.display_name || data?.email || "—");
    })();
    return () => { cancelled = true; };
  }, []);

  // Build the list of available months (oldest → newest)
  const monthsList = React.useMemo(() => {
    return entries
      .map((e) => ({ y: e.year, m: e.month, key: `${e.year}-${String(e.month).padStart(2, "0")}` }))
      .sort((a, b) => ymKey(a.y, a.m) - ymKey(b.y, b.m));
  }, [entries]);

  // Apply preset → narrow month set
  const presetMonthKeys = React.useMemo(() => {
    if (preset === "all") return null;
    if (monthsList.length === 0) return new Set<string>();
    const last = monthsList[monthsList.length - 1];
    if (preset === "last1") return new Set([last.key]);
    if (preset === "last3") {
      return new Set(monthsList.slice(-3).map((m) => m.key));
    }
    // yoy: last completed month + same period last year
    const yoyKey = `${last.y - 1}-${String(last.m).padStart(2, "0")}`;
    return new Set([last.key, yoyKey]);
  }, [preset, monthsList]);

  // Build all submissions with status & insight
  const submissions = React.useMemo<Submission[]>(() => {
    if (entries.length === 0) return [];
    const out: Submission[] = [];
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      const prev = entries[i - 1] ?? null;
      const prevYear = entries.find((x) => x.year === e.year - 1 && x.month === e.month) ?? null;
      const yyyy = e.year;
      const mm = String(e.month).padStart(2, "0");
      const lastDay = new Date(yyyy, e.month, 0).getDate();
      const startDate = `${yyyy}-${mm}-01`;
      const endDate = `${yyyy}-${mm}-${String(lastDay).padStart(2, "0")}`;
      const updatedAt = (e as MonthlyEntry).updated_at ?? e.created_at ?? null;
      const ageDays = daysAgo(updatedAt);

      for (const m of METRICS) {
        const value = (e[m.key] as number | null | undefined) ?? null;
        const prevValue = prev ? ((prev[m.key] as number | null | undefined) ?? null) : null;
        const prevYearValue = prevYear ? ((prevYear[m.key] as number | null | undefined) ?? null) : null;
        const { status, insight } = deriveStatus(m.key, value, prevValue, prevYearValue, ageDays);

        // Build a 6-point sparkline ending at this entry
        const sliceStart = Math.max(0, i - 5);
        const history = entries.slice(sliceStart, i + 1).map((x) => ({
          ym: `${x.year}-${String(x.month).padStart(2, "0")}`,
          value: (x[m.key] as number | null | undefined) ?? null,
        }));

        out.push({
          id: `${e.id}:${m.key}`,
          entryId: e.id,
          metric: m.key,
          metricLabel: m.label,
          unit: m.unit,
          value,
          year: e.year,
          month: e.month,
          startDate,
          endDate,
          inputDate: e.created_at ?? null,
          updatedAt,
          prevValue,
          prevYearValue,
          status,
          insight,
          history,
          ageDays,
        });
      }
    }
    return out;
  }, [entries]);

  // Apply temporal + intent filters
  const filtered = React.useMemo(() => {
    return submissions.filter((s) => {
      const key = `${s.year}-${String(s.month).padStart(2, "0")}`;
      if (selectedMonth !== "all" && key !== selectedMonth) return false;
      if (presetMonthKeys && !presetMonthKeys.has(key)) return false;

      switch (intent) {
        case "changed":
          return s.status === "updated" || (s.ageDays !== null && s.ageDays <= 14);
        case "missing":
          return s.value === null || s.value === 0;
        case "abnormal":
          return s.status === "attention" || (s.status === "issue" && s.value !== null);
        case "mine":
          return true; // demo: single user
        case "all":
        default:
          return true;
      }
    });
  }, [submissions, selectedMonth, presetMonthKeys, intent]);

  // Counters (live, react to filters)
  const counts = React.useMemo(() => {
    const total = filtered.length;
    const issues = filtered.filter((s) => s.status === "issue").length;
    const attention = filtered.filter((s) => s.status === "attention").length;
    const updated = filtered.filter((s) => s.status === "updated").length;
    return { total, issues, attention, updated };
  }, [filtered]);

  // Sort by view mode
  const ordered = React.useMemo(() => {
    const arr = [...filtered];
    const byTime = (a: Submission, b: Submission) => {
      const cmp = ymKey(a.year, a.month) - ymKey(b.year, b.month);
      return latestFirst ? -cmp : cmp;
    };
    if (viewMode === "chronological") return arr.sort(byTime);
    if (viewMode === "metric") {
      return arr.sort((a, b) => {
        const ai = METRICS.findIndex((m) => m.key === a.metric);
        const bi = METRICS.findIndex((m) => m.key === b.metric);
        if (ai !== bi) return ai - bi;
        return byTime(a, b);
      });
    }
    if (viewMode === "site") {
      // Single demo site — fall back to time
      return arr.sort(byTime);
    }
    // status: issue > attention > updated > normal
    const rank: Record<RowStatus, number> = { issue: 0, attention: 1, updated: 2, normal: 3 };
    return arr.sort((a, b) => {
      const r = rank[a.status] - rank[b.status];
      if (r !== 0) return r;
      return byTime(a, b);
    });
  }, [filtered, viewMode, latestFirst]);

  // Time slider state — index over monthsList
  const sliderMax = monthsList.length - 1;
  const sliderIdx = selectedMonth === "all"
    ? sliderMax
    : monthsList.findIndex((m) => m.key === selectedMonth);

  function setSliderIdx(i: number) {
    if (i < 0 || i >= monthsList.length) return;
    setPreset("all");
    setSelectedMonth(monthsList[i].key);
  }

  async function saveCorrection() {
    if (!openSubmission) return;
    const raw = editValue.trim();
    const val = raw === "" ? null : Number(raw.replace(/[, ]/g, ""));
    if (val !== null && Number.isNaN(val)) {
      toast.error("Please enter a valid number.");
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("monthly_entries")
      .update({ [openSubmission.metric]: val })
      .eq("id", openSubmission.entryId);
    setSaving(false);
    if (error) {
      toast.error("Could not save: " + error.message);
      return;
    }
    toast.success(`${openSubmission.metricLabel} updated for ${MONTH_SHORT[openSubmission.month - 1]} ${openSubmission.year}.`);
    setOpenSubmission(null);
    onChanged?.();
  }

  if (entries.length === 0) {
    return (
      <Card className="rounded-2xl border-border/70 p-10 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <ClipboardList className="h-6 w-6" />
        </div>
        <h3 className="text-base font-semibold">No reported values yet</h3>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
          Once you submit your first reporting period, your activity stream will appear here.
        </p>
      </Card>
    );
  }

  const activeMonthLabel = selectedMonth === "all"
    ? "All periods"
    : (() => {
        const [y, m] = selectedMonth.split("-").map(Number);
        return `${MONTH_SHORT[m - 1]} ${y}`;
      })();

  return (
    <Card className="rounded-2xl border-border/70 p-5">
      {/* ---------- Header + counters ---------- */}
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            Data activity & history
          </h3>
          <p className="text-xs text-muted-foreground">
            Reporting timeline for {hotel.name} • {activeMonthLabel}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          <span className="rounded-full bg-muted px-2 py-1 text-muted-foreground">
            {counts.total} submission{counts.total === 1 ? "" : "s"}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border border-rose-500/20 bg-rose-500/10 px-2 py-1 text-rose-700 dark:text-rose-300">
            <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
            {counts.issues} issue{counts.issues === 1 ? "" : "s"}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-1 text-amber-700 dark:text-amber-300">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
            {counts.attention} to review
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border border-sky-500/20 bg-sky-500/10 px-2 py-1 text-sky-700 dark:text-sky-300">
            <span className="h-1.5 w-1.5 rounded-full bg-sky-500" />
            {counts.updated} updated
          </span>
        </div>
      </div>

      {/* ---------- Temporal control ---------- */}
      <div className="mb-3 rounded-xl border border-border/60 bg-muted/30 p-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            Reporting period
          </div>
          <div className="flex flex-wrap items-center gap-1">
            {[
              { k: "all" as const, label: "All" },
              { k: "last1" as const, label: "Last completed month" },
              { k: "last3" as const, label: "Last 3 months" },
              { k: "yoy" as const, label: "Same period last year" },
            ].map((p) => (
              <button
                key={p.k}
                onClick={() => {
                  setPreset(p.k);
                  setSelectedMonth("all");
                }}
                className={`rounded-full border px-2.5 py-0.5 text-[11px] transition ${
                  preset === p.k
                    ? "border-primary/30 bg-primary/10 text-primary"
                    : "border-border bg-background text-muted-foreground hover:text-foreground"
                }`}
              >
                {p.label}
              </button>
            ))}
            <label className="ml-2 inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <input
                type="checkbox"
                checked={latestFirst}
                onChange={(e) => setLatestFirst(e.target.checked)}
                className="h-3 w-3 rounded border-border"
              />
              Latest changes first
            </label>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSliderIdx(Math.max(0, sliderIdx - 1))}
            className="rounded-lg border border-border bg-background p-1 text-muted-foreground hover:text-foreground disabled:opacity-40"
            disabled={sliderIdx <= 0}
            aria-label="Previous month"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <input
            type="range"
            min={0}
            max={sliderMax}
            value={sliderIdx < 0 ? sliderMax : sliderIdx}
            onChange={(e) => setSliderIdx(Number(e.target.value))}
            className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-border accent-primary"
          />
          <button
            onClick={() => setSliderIdx(Math.min(sliderMax, sliderIdx + 1))}
            className="rounded-lg border border-border bg-background p-1 text-muted-foreground hover:text-foreground disabled:opacity-40"
            disabled={sliderIdx >= sliderMax}
            aria-label="Next month"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
          <div className="flex min-w-[7rem] items-center justify-end gap-2">
            <span className="text-xs font-medium tabular-nums">
              {sliderIdx >= 0 && monthsList[sliderIdx]
                ? ymLabel(monthsList[sliderIdx].y, monthsList[sliderIdx].m)
                : "—"}
            </span>
            {selectedMonth !== "all" && (
              <button
                onClick={() => setSelectedMonth("all")}
                className="text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ---------- Intent filters + view as ---------- */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1">
          <Filter className="mr-1 h-3.5 w-3.5 text-muted-foreground" />
          {INTENT_FILTERS.map((f) => {
            const Icon = f.icon;
            const active = intent === f.key;
            return (
              <button
                key={f.key}
                onClick={() => setIntent(f.key)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition ${
                  active
                    ? "border-primary/30 bg-primary/10 text-primary"
                    : "border-border bg-background text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="h-3 w-3" />
                {f.label}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-1.5">
          <ListOrdered className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-[11px] text-muted-foreground">View as</span>
          <select
            value={viewMode}
            onChange={(e) => setViewMode(e.target.value as ViewMode)}
            className="rounded-lg border border-border bg-background px-2 py-1 text-[11px]"
          >
            {VIEW_MODES.map((v) => (
              <option key={v.key} value={v.key}>{v.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* ---------- Activity table ---------- */}
      <div className="overflow-x-auto rounded-xl border border-border/60">
        <table className="w-full text-xs">
          <thead className="bg-muted/40 text-left text-[10px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Period</th>
              <th className="px-3 py-2 font-medium">Site</th>
              <th className="px-3 py-2 font-medium">Metric</th>
              <th className="px-3 py-2 text-right font-medium">Reported value</th>
              <th className="px-3 py-2 font-medium">Trend</th>
              <th className="px-3 py-2 font-medium">Insight</th>
              <th className="px-3 py-2 font-medium">Submitted</th>
            </tr>
          </thead>
          <tbody>
            {ordered.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">
                  No submissions match the current filters.
                </td>
              </tr>
            )}
            {ordered.map((s) => {
              const accent =
                s.status === "issue"     ? "border-l-rose-500" :
                s.status === "attention" ? "border-l-amber-500" :
                s.status === "updated"   ? "border-l-sky-500" :
                                           "border-l-transparent";
              return (
                <tr
                  key={s.id}
                  onClick={() => {
                    setOpenSubmission(s);
                    setEditValue(s.value === null ? "" : String(s.value));
                  }}
                  className={`cursor-pointer border-t border-l-2 border-border/40 transition hover:bg-muted/40 ${accent}`}
                >
                  <td className="px-3 py-2">{statusPill(s.status)}</td>
                  <td className="whitespace-nowrap px-3 py-2 font-medium">
                    {ymLabel(s.year, s.month)}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{hotel.name}</td>
                  <td className="px-3 py-2 font-medium">{s.metricLabel}</td>
                  <td className="num px-3 py-2 text-right tabular-nums">
                    {s.value != null ? (
                      <>
                        {formatNumber(s.value)}
                        <span className="ml-1 text-[10px] text-muted-foreground">{s.unit}</span>
                      </>
                    ) : (
                      <span className="text-rose-500">missing</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <Sparkline points={s.history} />
                  </td>
                  <td className="px-3 py-2 text-[11px]">
                    {s.insight ? (
                      <span className={
                        s.status === "issue"     ? "text-rose-600 dark:text-rose-300" :
                        s.status === "attention" ? "text-amber-600 dark:text-amber-300" :
                        s.status === "updated"   ? "text-sky-600 dark:text-sky-300" :
                                                   "text-muted-foreground"
                      }>
                        {s.insight}
                      </span>
                    ) : (
                      <span className="text-muted-foreground/60">—</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-[11px] text-muted-foreground">
                    {fmtIso(s.updatedAt ?? s.inputDate)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ---------- Side panel ---------- */}
      <Sheet open={!!openSubmission} onOpenChange={(o) => !o && setOpenSubmission(null)}>
        <SheetContent side="right" className="w-full max-w-md overflow-y-auto sm:max-w-lg">
          {openSubmission && (
            <>
              <SheetHeader>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <SheetTitle className="text-base">
                      {openSubmission.metricLabel} • {ymLabel(openSubmission.year, openSubmission.month)}
                    </SheetTitle>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {hotel.name} • Reporting period {fmtIso(openSubmission.startDate)} → {fmtIso(openSubmission.endDate)}
                    </p>
                  </div>
                  {statusPill(openSubmission.status)}
                </div>
              </SheetHeader>

              <div className="mt-5 space-y-5">
                {/* Insight */}
                {openSubmission.insight && (
                  <div className={`rounded-xl border p-3 text-xs ${
                    openSubmission.status === "issue"     ? "border-rose-500/20 bg-rose-500/5 text-rose-700 dark:text-rose-200" :
                    openSubmission.status === "attention" ? "border-amber-500/20 bg-amber-500/5 text-amber-700 dark:text-amber-200" :
                    openSubmission.status === "updated"   ? "border-sky-500/20 bg-sky-500/5 text-sky-700 dark:text-sky-200" :
                                                            "border-border bg-muted/40 text-muted-foreground"
                  }`}>
                    <div className="flex items-center gap-2 font-medium">
                      <Sparkles className="h-3.5 w-3.5" />
                      {openSubmission.insight}
                    </div>
                  </div>
                )}

                {/* Value + comparisons */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-xl border border-border p-3">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Reported</div>
                    <div className="mt-0.5 text-base font-semibold tabular-nums">
                      {openSubmission.value != null ? formatNumber(openSubmission.value) : "—"}
                      <span className="ml-1 text-[10px] font-normal text-muted-foreground">{openSubmission.unit}</span>
                    </div>
                  </div>
                  <div className="rounded-xl border border-border p-3">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Prev. month</div>
                    <div className="mt-0.5 text-base font-semibold tabular-nums">
                      {openSubmission.prevValue != null ? formatNumber(openSubmission.prevValue) : "—"}
                    </div>
                  </div>
                  <div className="rounded-xl border border-border p-3">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">YoY</div>
                    <div className="mt-0.5 text-base font-semibold tabular-nums">
                      {openSubmission.prevYearValue != null ? formatNumber(openSubmission.prevYearValue) : "—"}
                    </div>
                  </div>
                </div>

                {/* Sparkline + history */}
                <div className="rounded-xl border border-border p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Last periods</div>
                    <Sparkline points={openSubmission.history} />
                  </div>
                  <div className="grid grid-cols-6 gap-1 text-center text-[10px]">
                    {openSubmission.history.map((h) => {
                      const [yy, mm] = h.ym.split("-").map(Number);
                      return (
                        <div key={h.ym} className="rounded-lg bg-muted/40 px-1 py-1">
                          <div className="text-muted-foreground">{MONTH_SHORT[mm - 1]} {String(yy).slice(2)}</div>
                          <div className="font-medium tabular-nums">{h.value != null ? formatNumber(h.value) : "—"}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Source & owner */}
                <div className="rounded-xl border border-border p-3 text-xs">
                  <div className="grid grid-cols-2 gap-y-1.5">
                    <div className="text-muted-foreground">Data source</div>
                    <div className="text-right">Manual log</div>
                    <div className="text-muted-foreground">Owner</div>
                    <div className="text-right">{ownerName}</div>
                    <div className="text-muted-foreground">Submitted</div>
                    <div className="text-right">{fmtIso(openSubmission.inputDate)}</div>
                    <div className="text-muted-foreground">Last updated</div>
                    <div className="text-right">{fmtIso(openSubmission.updatedAt)}</div>
                  </div>
                </div>

                {/* Quick correction */}
                <div className="rounded-xl border border-border p-3">
                  <div className="mb-2 flex items-center gap-2 text-[11px] font-medium">
                    <Pencil className="h-3.5 w-3.5" />
                    Correct the reported value
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      placeholder="Enter value"
                      className="flex-1 rounded-lg border border-border bg-background px-2 py-1.5 text-sm tabular-nums"
                    />
                    <span className="text-xs text-muted-foreground">{openSubmission.unit}</span>
                    <Button size="sm" onClick={saveCorrection} disabled={saving}>
                      {saving ? "Saving…" : "Save"}
                    </Button>
                  </div>
                </div>

                {/* Quick actions */}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => toast.info("Anomaly explanation noted (demo).")}
                    className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-xs hover:bg-muted/50"
                  >
                    <HelpCircle className="h-3.5 w-3.5" />
                    Explain anomaly
                  </button>
                  <button
                    onClick={() => toast.info("Flagged for review (demo).")}
                    className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-xs hover:bg-muted/50"
                  >
                    <Flag className="h-3.5 w-3.5" />
                    Flag for review
                  </button>
                </div>

                <button
                  onClick={() => setOpenSubmission(null)}
                  className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                  Close
                </button>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </Card>
  );
}
