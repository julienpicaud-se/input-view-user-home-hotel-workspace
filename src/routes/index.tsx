import { createFileRoute, useNavigate } from "@tanstack/react-router";
import * as React from "react";
import {
  ArrowRight,
  Bolt,
  Building2,
  CheckCircle2,
  ClipboardList,
  Flame,
  Leaf,
  
  Sun,
  Sunrise,
  Sunset,
  TrendingDown,
  TrendingUp,
  Users,
  Wand2,
  AlertTriangle,
  X,
  Eye,
  EyeOff,
  Droplets,
  Trash2,
  Check,
  Minus,
  RefreshCw,
  CalendarClock,
} from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { setActiveHotelId, type Hotel, type MonthlyEntry } from "@/lib/hotel";
import { DEMO_PROFILE_ID, type UserProfile } from "@/lib/user-profile";
import {
  MONTH_NAMES,
  calculateCO2e,
  formatNumber,
  formatPct,
  pctChange,
} from "@/lib/format";
import { PageContainer } from "@/components/page-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { generateBriefing, type BriefingPayload } from "@/server/assistant.functions";
import { SeraBriefingCard } from "@/components/sera-briefing-card";
import { DataQualityCard } from "@/components/data-quality-card";
import { buildDataQualityIssues, type DataQualityIssue } from "@/lib/data-quality";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Home — RA+" },
      {
        name: "description",
        content:
          "Your daily sustainability briefing — what's new across your portfolio and what to do next.",
      },
    ],
  }),
  component: HomePage,
});

interface PortfolioSummary {
  hotelCount: number;
  totalRooms: number;
  latestEntry: (MonthlyEntry & { hotel_name: string }) | null;
  prevEntry: MonthlyEntry | null;
  co2eLatest: number;
  co2ePrev: number;
  totalElectricity: number;
  expectedYear: number;
  expectedMonth: number;
  hotelProgress: HotelProgress[];
  anomalies: Anomaly[];
}

type RequiredField =
  | "electricity"
  | "gas"
  | "water"
  | "waste"
  | "occupancy";

interface HotelProgress {
  id: string;
  name: string;
  lastPeriod: string | null;
  // Status of each required field for the expected reporting month
  fields: Record<RequiredField, boolean>;
  filledCount: number;
  totalCount: number; // always 5
  complete: boolean;
}

interface Anomaly {
  hotelId: string;
  hotelName: string;
  utility: "electricity" | "gas" | "water" | "waste";
  pctChange: number; // positive = spike up
  year: number;
  month: number;
}

type WorkspaceTab = "overview" | "log" | "analyze" | "settings" | "benchmarks";

interface Todo {
  id: string;
  title: string;
  description: string;
  cta: string;
  done: boolean;
  tone: "primary" | "warning" | "muted" | "danger";
  // Action target
  target:
    | { kind: "workspace"; tab: WorkspaceTab; hotelId?: string }
    | { kind: "profile" };
  dismissible: boolean;
  // Optional due date — drives sort order and the in-row pill
  dueDate?: Date;
}

const UTILITY_LABEL: Record<Anomaly["utility"], string> = {
  electricity: "Electricity",
  gas: "Gas",
  water: "Water",
  waste: "Waste",
};

const DISMISSED_KEY = "ra-plus-dismissed-todos";

function loadDismissed(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(DISMISSED_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as unknown;
    if (Array.isArray(arr)) return new Set(arr.filter((x): x is string => typeof x === "string"));
    return new Set();
  } catch {
    return new Set();
  }
}

function saveDismissed(set: Set<string>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DISMISSED_KEY, JSON.stringify(Array.from(set)));
  } catch {
    // ignore
  }
}

function greeting(): { label: string; icon: React.ComponentType<{ className?: string }> } {
  const h = new Date().getHours();
  if (h < 6) return { label: "Good evening", icon: Sunset };
  if (h < 12) return { label: "Good morning", icon: Sunrise };
  if (h < 18) return { label: "Good afternoon", icon: Sun };
  return { label: "Good evening", icon: Sunset };
}

function todayLabel(): string {
  return new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function periodLabel(year: number, month: number): string {
  return `${MONTH_NAMES[month - 1]} ${year}`;
}

function expectedReportingPeriod(): { year: number; month: number } {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

// Logging deadline: monthly entries are expected by the 10th of the following month.
// e.g. data for September is due October 10.
function loggingDueDate(year: number, month: number): Date {
  // month is 1-indexed; due on the 10th of the *next* month.
  return new Date(year, month, 10);
}

// Format a due date relative to today: "Overdue 3d", "Due today", "Due in 2d",
// "Due Apr 30". Returns the label plus a tone for styling.
function formatDue(due: Date, done: boolean): { label: string; tone: "overdue" | "soon" | "later" | "done" } {
  if (done) {
    return { label: `Due ${due.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`, tone: "done" };
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(due);
  d.setHours(0, 0, 0, 0);
  const diffDays = Math.round((d.getTime() - today.getTime()) / 86_400_000);
  if (diffDays < 0) {
    const n = Math.abs(diffDays);
    return { label: `Overdue ${n}d`, tone: "overdue" };
  }
  if (diffDays === 0) return { label: "Due today", tone: "soon" };
  if (diffDays <= 7) return { label: `Due in ${diffDays}d`, tone: "soon" };
  return {
    label: `Due ${due.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`,
    tone: "later",
  };
}

function HomePage() {
  const navigate = useNavigate();
  const callBriefing = useServerFn(generateBriefing);
  const [loading, setLoading] = React.useState(true);
  const [profile, setProfile] = React.useState<UserProfile | null>(null);
  const [summary, setSummary] = React.useState<PortfolioSummary | null>(null);
  const [dismissed, setDismissed] = React.useState<Set<string>>(() => loadDismissed());
  const [showDismissed, setShowDismissed] = React.useState(false);
  const [briefing, setBriefing] = React.useState<BriefingPayload | null>(null);
  const [briefingLoading, setBriefingLoading] = React.useState(false);
  const [briefingError, setBriefingError] = React.useState<string | null>(null);
  const [hotels, setHotels] = React.useState<Hotel[]>([]);
  const [entries, setEntries] = React.useState<MonthlyEntry[]>([]);

  React.useEffect(() => {
    void (async () => {
      const [{ data: profileData }, { data: hotelsData }, { data: entriesData }] =
        await Promise.all([
          supabase
            .from("user_profiles")
            .select("*")
            .eq("id", DEMO_PROFILE_ID)
            .maybeSingle(),
          supabase.from("hotels").select("*").order("name", { ascending: true }),
          supabase
            .from("monthly_entries")
            .select("*")
            .order("year", { ascending: true })
            .order("month", { ascending: true }),
        ]);

      const hotels = (hotelsData as Hotel[] | null) ?? [];
      const entries = (entriesData as MonthlyEntry[] | null) ?? [];

      // Latest reporting period across portfolio.
      // We pick the most recent year+month where AT LEAST HALF of the hotels
      // have a logged entry — that way a single in-progress / test entry for
      // the current month doesn't hijack the portfolio summary.
      const periodCounts = new Map<string, { year: number; month: number; count: number }>();
      for (const e of entries) {
        const key = `${e.year}-${e.month}`;
        const cur = periodCounts.get(key);
        if (cur) cur.count += 1;
        else periodCounts.set(key, { year: e.year, month: e.month, count: 1 });
      }
      const minHotels = Math.max(1, Math.ceil(hotels.length / 2));
      const sortedPeriods = Array.from(periodCounts.values()).sort((a, b) =>
        a.year !== b.year ? b.year - a.year : b.month - a.month
      );
      const latestPeriod =
        sortedPeriods.find((p) => p.count >= minHotels) ?? sortedPeriods[0] ?? null;

      // Pick a representative entry for the latest period: the one belonging
      // to the hotel with the largest electricity reading (acts as the
      // "headline" hotel for the latest data card).
      let latest: MonthlyEntry | null = null;
      if (latestPeriod) {
        const inPeriod = entries.filter(
          (e) => e.year === latestPeriod.year && e.month === latestPeriod.month
        );
        latest =
          [...inPeriod].sort(
            (a, b) => Number(b.electricity_kwh ?? 0) - Number(a.electricity_kwh ?? 0)
          )[0] ?? null;
      }
      const latestHotel = latest
        ? hotels.find((h) => h.id === latest.hotel_id)
        : undefined;

      // Previous month for the same latest hotel (kept for compatibility)
      let prev: MonthlyEntry | null = null;
      if (latest) {
        const sameHotel = entries
          .filter((e) => e.hotel_id === latest.hotel_id)
          .sort((a, b) => (a.year !== b.year ? a.year - b.year : a.month - b.month));
        const idx = sameHotel.findIndex(
          (e) => e.year === latest.year && e.month === latest.month
        );
        prev = idx > 0 ? sameHotel[idx - 1] : null;
      }

      // Portfolio totals for latest month
      let totalElectricity = 0;
      let co2eLatest = 0;
      let co2ePrev = 0;
      if (latest) {
        const ly = latest.year;
        const lm = latest.month;
        const py = lm === 1 ? ly - 1 : ly;
        const pm = lm === 1 ? 12 : lm - 1;
        for (const e of entries) {
          if (e.year === ly && e.month === lm) {
            totalElectricity += Number(e.electricity_kwh ?? 0);
            co2eLatest += calculateCO2e(e);
          }
          if (e.year === py && e.month === pm) {
            co2ePrev += calculateCO2e(e);
          }
        }
      }

      // Per-hotel progress for the expected reporting period
      const expected = expectedReportingPeriod();
      const hotelProgress: HotelProgress[] = hotels.map((h) => {
        const expectedEntry = entries.find(
          (e) => e.hotel_id === h.id && e.year === expected.year && e.month === expected.month
        );
        const filled = (v: number | null | undefined) =>
          v !== null && v !== undefined && Number(v) > 0;
        const fields: Record<RequiredField, boolean> = {
          electricity: filled(expectedEntry?.electricity_kwh ?? null),
          gas: filled(expectedEntry?.gas_kwh ?? null),
          water: filled(expectedEntry?.water_m3 ?? null),
          waste: filled(expectedEntry?.waste_kg ?? null),
          occupancy: filled(expectedEntry?.occupied_room_nights ?? null),
        };
        const filledCount = Object.values(fields).filter(Boolean).length;
        const hotelEntries = entries
          .filter((e) => e.hotel_id === h.id)
          .sort((a, b) => (a.year !== b.year ? b.year - a.year : b.month - a.month));
        const last = hotelEntries[0];
        return {
          id: h.id,
          name: h.name,
          lastPeriod: last ? periodLabel(last.year, last.month) : null,
          fields,
          filledCount,
          totalCount: 5,
          complete: filledCount === 5,
        };
      });

      // Anomaly detection: for each hotel's most recent entry, compare each
      // utility to its prior month. Flag >20% increase as a spike.
      const anomalies: Anomaly[] = [];
      for (const h of hotels) {
        const hEntries = entries
          .filter((e) => e.hotel_id === h.id)
          .sort((a, b) => (a.year !== b.year ? a.year - b.year : a.month - b.month));
        if (hEntries.length < 2) continue;
        const last = hEntries[hEntries.length - 1];
        const prior = hEntries[hEntries.length - 2];
        const utilities: Anomaly["utility"][] = ["electricity", "gas", "water", "waste"];
        const fieldFor: Record<Anomaly["utility"], keyof MonthlyEntry> = {
          electricity: "electricity_kwh",
          gas: "gas_kwh",
          water: "water_m3",
          waste: "waste_kg",
        };
        for (const u of utilities) {
          const cur = Number(last[fieldFor[u]] ?? 0);
          const pr = Number(prior[fieldFor[u]] ?? 0);
          if (pr <= 0 || cur <= 0) continue;
          const change = ((cur - pr) / pr) * 100;
          if (change >= 20) {
            anomalies.push({
              hotelId: h.id,
              hotelName: h.name,
              utility: u,
              pctChange: change,
              year: last.year,
              month: last.month,
            });
          }
        }
      }
      // Keep the most severe first, cap at 4 to avoid noise.
      anomalies.sort((a, b) => b.pctChange - a.pctChange);
      const topAnomalies = anomalies.slice(0, 4);

      setProfile((profileData as UserProfile) ?? null);
      setHotels(hotels);
      setEntries(entries);
      setSummary({
        hotelCount: hotels.length,
        totalRooms: hotels.reduce((acc, h) => acc + (h.rooms ?? 0), 0),
        latestEntry: latest && latestHotel
          ? { ...latest, hotel_name: latestHotel.name }
          : null,
        prevEntry: prev,
        co2eLatest,
        co2ePrev,
        totalElectricity,
        expectedYear: expected.year,
        expectedMonth: expected.month,
        hotelProgress,
        anomalies: topAnomalies,
      });
      setLoading(false);
    })();
  }, []);

  const g = greeting();
  const firstName = (profile?.display_name?.split(" ")[0] || "Julien").trim();

  // Build a stable signature so we cache the briefing per portfolio state + name.
  const briefingSignature = React.useMemo(() => {
    if (!summary) return null;
    const latest = summary.latestEntry;
    return [
      firstName,
      summary.hotelCount,
      latest ? `${latest.year}-${latest.month}` : "none",
      Math.round(summary.co2eLatest),
      Math.round(summary.co2ePrev),
      summary.hotelProgress.reduce((acc, h) => acc + h.filledCount, 0),
      summary.anomalies.length,
    ].join("|");
  }, [summary, firstName]);

  const fetchBriefing = React.useCallback(
    async (
      force = false,
      payload?: {
        todos: { title: string; description?: string; done?: boolean; tone?: Todo["tone"] }[];
        issues: { hotelName: string; severity: DataQualityIssue["severity"]; title: string; detail?: string }[];
      }
    ) => {
      if (!briefingSignature) return;
      // Build a focus-signature so the cache invalidates when todos/issues change
      const focusSig = payload
        ? `${payload.todos.filter((t) => !t.done).length}t-${payload.issues.length}i-${payload.issues
            .slice(0, 6)
            .map((i) => `${i.severity[0]}${i.hotelName.slice(0, 4)}`)
            .join(",")}`
        : "no-focus";
      const cacheKey = `ra-plus-briefing:${briefingSignature}:${focusSig}`;
      if (!force && typeof window !== "undefined") {
        const cached = window.localStorage.getItem(cacheKey);
        if (cached) {
          try {
            setBriefing(JSON.parse(cached) as BriefingPayload);
            setBriefingError(null);
            return;
          } catch {
            // fall through
          }
        }
      }
      setBriefingLoading(true);
      setBriefingError(null);
      try {
        const res = await callBriefing({
          data: {
            firstName,
            todos: payload?.todos,
            issues: payload?.issues,
          },
        });
        if (res.ok) {
          setBriefing(res.briefing);
          if (typeof window !== "undefined") {
            try {
              window.localStorage.setItem(cacheKey, JSON.stringify(res.briefing));
            } catch {
              // ignore quota errors
            }
          }
        } else {
          setBriefingError(res.error);
        }
      } catch (e) {
        console.error("Briefing fetch failed:", e);
        setBriefingError("Briefing unavailable right now.");
      } finally {
        setBriefingLoading(false);
      }
    },
    [briefingSignature, callBriefing, firstName]
  );


  // Build the full task list (deep-linked, per-hotel where useful)
  const allTodos: Todo[] = React.useMemo(() => {
    if (!summary) return [];
    const items: Todo[] = [];
    const expected = { year: summary.expectedYear, month: summary.expectedMonth };
    const allComplete = summary.hotelProgress.every((h) => h.complete);
    // Logging deadline for the expected reporting period (10th of next month)
    const logDue = loggingDueDate(expected.year, expected.month);
    // Anomalies are time-sensitive — give a tighter deadline (3 days from today)
    const anomalyDue = (() => {
      const d = new Date();
      d.setDate(d.getDate() + 3);
      return d;
    })();
    // Per-hotel "log data" tasks — auto-mark done when all 5 fields are filled
    if (summary.hotelProgress.length === 0) {
      items.push({
        id: "log-no-hotels",
        title: "Add your first hotel to start logging",
        description: "Once you have a hotel, monthly data tasks will appear here.",
        cta: "Open workspace",
        done: false,
        tone: "warning",
        target: { kind: "workspace", tab: "settings" },
        dismissible: false,
        dueDate: logDue,
      });
    } else if (allComplete) {
      items.push({
        id: "log-up-to-date",
        title: `${MONTH_NAMES[expected.month - 1]} ${expected.year} data is complete`,
        description: "Every hotel has all required fields filled in.",
        cta: "Open log",
        done: true,
        tone: "muted",
        target: { kind: "workspace", tab: "log" },
        dismissible: false,
        dueDate: logDue,
      });
    } else {
      for (const h of summary.hotelProgress) {
        const remaining = h.totalCount - h.filledCount;
        items.push({
          id: `log-${h.id}-${expected.year}-${expected.month}`,
          title: h.complete
            ? `${h.name}: ${MONTH_NAMES[expected.month - 1]} ${expected.year} fully logged`
            : `Log ${MONTH_NAMES[expected.month - 1]} ${expected.year} for ${h.name}`,
          description: h.complete
            ? "All 5 fields filled — electricity, gas, water, waste, occupancy."
            : h.filledCount === 0
              ? h.lastPeriod
                ? `Last entry: ${h.lastPeriod}. Add electricity, gas, water, waste and occupancy.`
                : "No data yet — start with the most recent month."
              : `${h.filledCount}/${h.totalCount} filled — ${remaining} ${remaining === 1 ? "field" : "fields"} to go.`,
          cta: h.complete ? "View" : "Add data",
          done: h.complete,
          tone: h.complete ? "muted" : h.filledCount > 0 ? "primary" : "warning",
          target: { kind: "workspace", tab: "log", hotelId: h.id },
          dismissible: !h.complete,
          dueDate: logDue,
        });
      }
    }

    // Per-anomaly "review spike" tasks
    for (const a of summary.anomalies) {
      items.push({
        id: `anomaly-${a.hotelId}-${a.year}-${a.month}-${a.utility}`,
        title: `${UTILITY_LABEL[a.utility]} spiked ${a.pctChange.toFixed(0)}% at ${a.hotelName}`,
        description: `${periodLabel(a.year, a.month)} vs prior month — review the meter reading or check for an event.`,
        cta: "Review hotel",
        done: false,
        tone: "danger",
        target: { kind: "workspace", tab: "overview", hotelId: a.hotelId },
        dismissible: true,
        dueDate: anomalyDue,
      });
    }

    return items;
  }, [summary]);

  // Sort: open tasks first, then by soonest due date, then done tasks at the end.
  // Tasks without a due date sink below dated ones within their group.
  const sortTodos = React.useCallback((list: Todo[]) => {
    return [...list].sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1;
      const at = a.dueDate ? a.dueDate.getTime() : Number.POSITIVE_INFINITY;
      const bt = b.dueDate ? b.dueDate.getTime() : Number.POSITIVE_INFINITY;
      return at - bt;
    });
  }, []);

  const visibleTodos = React.useMemo(
    () => sortTodos(allTodos.filter((t) => !dismissed.has(t.id))),
    [allTodos, dismissed, sortTodos]
  );
  const dismissedTodos = React.useMemo(
    () => sortTodos(allTodos.filter((t) => dismissed.has(t.id))),
    [allTodos, dismissed, sortTodos]
  );


  const dataQualityIssues: DataQualityIssue[] = React.useMemo(() => {
    if (!summary || hotels.length === 0) return [];
    return buildDataQualityIssues({
      hotels,
      entries,
      expectedYear: summary.expectedYear,
      expectedMonth: summary.expectedMonth,
    });
  }, [hotels, entries, summary]);

  function handleDataQualityClick(issue: DataQualityIssue) {
    setActiveHotelId(issue.hotelId);
    void navigate({ to: "/workspace", search: { tab: "log" } });
  }

  // Data-quality badges shown on the "Latest data" and "CO₂e" glance cards.
  // We restrict to issues that affect the latest reporting period the cards
  // are summarising, so the badges reflect what the user is looking at.
  const glanceBadges = React.useMemo(() => {
    const empty = { latest: [] as GlanceBadge[], co2e: [] as GlanceBadge[] };
    if (!summary?.latestEntry || dataQualityIssues.length === 0) return empty;
    const ly = summary.latestEntry.year;
    const lm = summary.latestEntry.month;

    const inLatest = dataQualityIssues.filter(
      (i) => (i.year === ly && i.month === lm) || i.kind === "stale-data"
    );

    // ---- Latest data card ----
    const latestBadges: GlanceBadge[] = [];
    const missing = inLatest.filter((i) => i.kind === "missing-month");
    if (missing.length > 0) {
      latestBadges.push({
        tone: "danger",
        label: `${missing.length} missing`,
        title: missing.map((m) => `${m.hotelName}: ${m.title}`).join("\n"),
      });
    }
    const anomaliesLatest = inLatest.filter(
      (i) =>
        i.kind === "huge-jump" ||
        i.kind === "implausible-range" ||
        i.kind === "zero-or-negative" ||
        i.kind === "low-occupancy"
    );
    if (anomaliesLatest.length > 0) {
      latestBadges.push({
        tone: "warning",
        label: `${anomaliesLatest.length} ${anomaliesLatest.length === 1 ? "anomaly" : "anomalies"}`,
        title: anomaliesLatest.map((a) => `${a.hotelName}: ${a.title}`).join("\n"),
      });
    }
    const stale = dataQualityIssues.filter((i) => i.kind === "stale-data");
    if (stale.length > 0) {
      latestBadges.push({
        tone: "info",
        label: `${stale.length} stale`,
        title: stale.map((s) => `${s.hotelName}: ${s.title}`).join("\n"),
      });
    }

    // ---- CO2e card ----
    // The CO2e total only sums hotels that reported in the latest period.
    // If some hotels are missing, flag the total as incomplete.
    const co2eBadges: GlanceBadge[] = [];
    if (missing.length > 0) {
      co2eBadges.push({
        tone: "warning",
        label: `Excludes ${missing.length} ${missing.length === 1 ? "hotel" : "hotels"}`,
        title:
          "These hotels haven't logged the latest period yet, so the CO₂e total under-represents the portfolio.\n\n" +
          missing.map((m) => `• ${m.hotelName}`).join("\n"),
      });
    }
    // Anomalies on the utilities that feed CO₂e (electricity, gas, waste)
    const co2eAnomalies = anomaliesLatest.filter((i) =>
      /electricity|gas|waste/i.test(i.title)
    );
    if (co2eAnomalies.length > 0) {
      co2eBadges.push({
        tone: "warning",
        label: `${co2eAnomalies.length} suspect ${co2eAnomalies.length === 1 ? "reading" : "readings"}`,
        title: co2eAnomalies.map((a) => `${a.hotelName}: ${a.title}`).join("\n"),
      });
    }

    return { latest: latestBadges, co2e: co2eBadges };
  }, [dataQualityIssues, summary]);


  // Build the focus payload (todos + issues) for the Sera briefing
  const briefingFocusPayload = React.useMemo(() => {
    return {
      todos: visibleTodos.map((t) => ({
        title: t.title,
        description: t.description,
        done: t.done,
        tone: t.tone,
      })),
      issues: dataQualityIssues.map((i) => ({
        hotelName: i.hotelName,
        severity: i.severity,
        title: i.title,
        detail: i.detail,
      })),
    };
  }, [visibleTodos, dataQualityIssues]);

  // Trigger the briefing once we have both portfolio summary and the focus payload
  React.useEffect(() => {
    if (!briefingSignature) return;
    void fetchBriefing(false, briefingFocusPayload);
  }, [briefingSignature, briefingFocusPayload, fetchBriefing]);


  const co2Change = summary
    ? pctChange(summary.co2eLatest || null, summary.co2ePrev || null)
    : null;
  const co2Down = co2Change !== null && co2Change < 0;
  const openTodos = visibleTodos.filter((t) => !t.done).length;

  // Action handlers
  function handleAction(todo: Todo) {
    if (todo.target.kind === "profile") {
      void navigate({ to: "/profile" });
      return;
    }
    if (todo.target.hotelId) {
      setActiveHotelId(todo.target.hotelId);
    }
    void navigate({
      to: "/workspace",
      search: { tab: todo.target.tab },
    });
  }

  function dismissTodo(id: string) {
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(id);
      saveDismissed(next);
      return next;
    });
  }

  function restoreTodo(id: string) {
    setDismissed((prev) => {
      const next = new Set(prev);
      next.delete(id);
      saveDismissed(next);
      return next;
    });
  }

  return (
    <PageContainer>
      {/* Welcome */}
      <header className="mb-10">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          <g.icon className="h-3.5 w-3.5" />
          <span>{g.label}</span>
          <span className="text-border">·</span>
          <span>{todayLabel()}</span>
        </div>
        <h1 className="mt-3 font-serif text-4xl md:text-5xl font-semibold leading-[1.05] text-foreground">
          Welcome back, {firstName}.
        </h1>
        <p className="mt-3 max-w-2xl text-sm md:text-base text-muted-foreground">
          {loading ? (
            "Pulling together your portfolio briefing…"
          ) : openTodos > 0 ? (
            <>
              You have <span className="font-medium text-foreground">{openTodos} open {openTodos === 1 ? "task" : "tasks"}</span> across your{" "}
              {summary?.hotelCount ?? 0} {summary?.hotelCount === 1 ? "hotel" : "hotels"}.
              Here's what to focus on today.
            </>
          ) : (
            <>Everything looks on track today. Nice work, {firstName}.</>
          )}
        </p>
        <div className="mt-6 h-px gold-divider" />
      </header>

      {/* Briefing — Your portfolio at a glance (top of page) */}
      <section className="mb-12">
        <div className="mb-4 flex items-end justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              Today's briefing
            </div>
            <h2 className="font-serif text-2xl font-semibold text-foreground">
              Your portfolio at a glance
            </h2>
          </div>
          {!loading && summary?.latestEntry && (
            <div className="hidden text-right text-xs text-muted-foreground sm:block">
              As of{" "}
              <span className="font-medium text-foreground">
                {periodLabel(summary.latestEntry.year, summary.latestEntry.month)}
              </span>
            </div>
          )}
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {/* Portfolio */}
          <GlanceCard
            label="Portfolio"
            icon={Building2}
            loading={loading}
            value={summary ? formatNumber(summary.hotelCount) : "—"}
            unit={summary?.hotelCount === 1 ? "hotel" : "hotels"}
            footer={
              summary
                ? `${formatNumber(summary.totalRooms)} total rooms`
                : undefined
            }
          />

          {/* Latest data */}
          <GlanceCard
            label="Latest data"
            icon={ClipboardList}
            loading={loading}
            value={
              summary?.latestEntry
                ? periodLabel(summary.latestEntry.year, summary.latestEntry.month)
                : "—"
            }
            valueSize="md"
            badges={glanceBadges.latest}
            footer={summary?.latestEntry?.hotel_name ?? "No entries yet"}
          />

          {/* CO2e trend */}
          <GlanceCard
            label="CO₂e — latest month"
            icon={Leaf}
            loading={loading}
            value={
              summary
                ? formatNumber(Math.round(summary.co2eLatest))
                : "—"
            }
            unit="kg"
            tone={co2Change === null ? "neutral" : co2Down ? "positive" : "warning"}
            badges={glanceBadges.co2e}
            footer={
              co2Change !== null ? (
                <span
                  className={`inline-flex items-center gap-1 font-medium ${
                    co2Down ? "text-success" : "text-warning"
                  }`}
                >
                  {co2Down ? (
                    <TrendingDown className="h-3.5 w-3.5" />
                  ) : (
                    <TrendingUp className="h-3.5 w-3.5" />
                  )}
                  {formatPct(co2Change)} vs previous month
                </span>
              ) : (
                "No comparison yet"
              )
            }
          />
        </div>
      </section>

      {/* AI personalised briefing from Sera — focused on to-dos & data quality */}
      <section className="mb-12">
        <SeraBriefingCard
          firstName={firstName}
          loading={loading || (briefingLoading && !briefing)}
          briefing={briefing}
          error={briefingError}
          refreshing={briefingLoading && Boolean(briefing)}
          onRefresh={() => void fetchBriefing(true, briefingFocusPayload)}
          onAsk={() => {
            void navigate({ to: "/workspace", search: { tab: "analyze" } });
          }}
        />
      </section>

      {/* To-dos — directly under the Sera briefing */}
      <section className="mb-12">
        <div className="mb-4 flex items-end justify-between gap-3">
          <div>
            <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              For you to do
            </div>
            <h2 className="font-serif text-2xl font-semibold text-foreground">
              Your to-dos
            </h2>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span>
              {openTodos} open · {visibleTodos.length - openTodos} done
            </span>
            {dismissedTodos.length > 0 && (
              <button
                type="button"
                onClick={() => setShowDismissed((s) => !s)}
                className="inline-flex items-center gap-1 rounded-lg border border-border/60 px-2 py-1 transition-colors hover:bg-muted hover:text-foreground"
              >
                {showDismissed ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                {showDismissed ? "Hide" : "Show"} dismissed ({dismissedTodos.length})
              </button>
            )}
          </div>
        </div>

        <div className="space-y-3">
          {loading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <Card key={i} className="rounded-2xl border-border/60 p-5">
                <Skeleton className="h-5 w-1/2" />
                <Skeleton className="mt-2 h-4 w-3/4" />
              </Card>
            ))
          ) : visibleTodos.length === 0 ? (
            <Card className="rounded-2xl border-border/60 p-8 text-center">
              <CheckCircle2 className="mx-auto h-8 w-8 text-success" />
              <p className="mt-3 text-sm text-muted-foreground">
                You're all caught up. Enjoy the quiet.
              </p>
            </Card>
          ) : (
            visibleTodos.map((t) => (
              <TodoRow
                key={t.id}
                todo={t}
                onAction={() => handleAction(t)}
                onDismiss={t.dismissible ? () => dismissTodo(t.id) : undefined}
              />
            ))
          )}
        </div>

        {showDismissed && dismissedTodos.length > 0 && (
          <div className="mt-6">
            <div className="mb-2 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              Dismissed
            </div>
            <div className="space-y-3">
              {dismissedTodos.map((t) => (
                <TodoRow
                  key={t.id}
                  todo={t}
                  onAction={() => handleAction(t)}
                  onRestore={() => restoreTodo(t.id)}
                  isDismissed
                />
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Reporting progress */}
      <section className="mb-12">
        <div className="mb-4 flex items-end justify-between gap-3">
          <div>
            <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              Reporting progress
            </div>
            <h2 className="font-serif text-2xl font-semibold text-foreground">
              {summary
                ? `${MONTH_NAMES[summary.expectedMonth - 1]} ${summary.expectedYear}`
                : "Expected period"}
            </h2>
          </div>
          {summary && summary.hotelProgress.length > 0 && (
            <PortfolioProgressBadge progress={summary.hotelProgress} />
          )}
        </div>

        <Card className="overflow-hidden rounded-2xl border-border/60">
          {loading ? (
            <div className="space-y-3 p-5">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : !summary || summary.hotelProgress.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Add a hotel to start tracking monthly reporting progress.
            </div>
          ) : (
            <div className="divide-y divide-border/60">
              {summary.hotelProgress.map((h) => (
                <HotelProgressRow
                  key={h.id}
                  progress={h}
                  onClick={() => {
                    setActiveHotelId(h.id);
                    void navigate({ to: "/workspace", search: { tab: "log" } });
                  }}
                />
              ))}
            </div>
          )}
        </Card>
      </section>

      {/* Data quality */}
      <section className="mb-12">
        <DataQualityCard
          loading={loading}
          issues={dataQualityIssues}
          onIssueClick={handleDataQualityClick}
        />
      </section>

    </PageContainer>
  );
}

function TodoRow({
  todo,
  onAction,
  onDismiss,
  onRestore,
  isDismissed,
}: {
  todo: Todo;
  onAction: () => void;
  onDismiss?: () => void;
  onRestore?: () => void;
  isDismissed?: boolean;
}) {
  const dotClass =
    todo.tone === "danger"
      ? "bg-destructive text-destructive-foreground"
      : todo.tone === "warning"
        ? "bg-warning text-warning-foreground"
        : todo.tone === "muted"
          ? "bg-muted text-muted-foreground"
          : "bg-primary text-primary-foreground";

  const Icon =
    todo.done
      ? CheckCircle2
      : todo.tone === "danger"
        ? AlertTriangle
        : todo.tone === "warning"
          ? Wand2
          : ArrowRight;

  return (
    <Card
      className={`group rounded-2xl border-border/60 p-5 transition-colors ${
        todo.done || isDismissed
          ? "bg-muted/40"
          : todo.tone === "danger"
            ? "hover:border-destructive/40"
            : "hover:border-primary/40"
      }`}
    >
      <div className="flex items-start gap-4">
        <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${dotClass}`}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3
              className={`text-base font-semibold ${
                todo.done || isDismissed ? "text-muted-foreground line-through" : "text-foreground"
              }`}
            >
              {todo.title}
            </h3>
            {todo.done && (
              <span className="rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-success">
                Done
              </span>
            )}
            {isDismissed && (
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Dismissed
              </span>
            )}
            {todo.dueDate && !isDismissed && <DueBadge due={todo.dueDate} done={todo.done} />}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{todo.description}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {onRestore && (
            <Button variant="ghost" size="sm" className="rounded-xl" onClick={onRestore}>
              Restore
            </Button>
          )}
          <Button
            onClick={onAction}
            variant={
              todo.done || isDismissed
                ? "ghost"
                : todo.tone === "danger" || todo.tone === "warning"
                  ? "default"
                  : "outline"
            }
            size="sm"
            className="rounded-xl"
          >
            {todo.cta}
            <ArrowRight className="ml-1 h-3.5 w-3.5" />
          </Button>
          {onDismiss && !isDismissed && (
            <button
              type="button"
              aria-label="Dismiss task"
              onClick={onDismiss}
              className="ml-1 flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground group-hover:opacity-100"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    </Card>
  );
}

function DueBadge({ due, done }: { due: Date; done: boolean }) {
  const { label, tone } = formatDue(due, done);
  const cls =
    tone === "overdue"
      ? "bg-destructive/10 text-destructive ring-1 ring-destructive/20"
      : tone === "soon"
        ? "bg-warning/15 text-warning-foreground ring-1 ring-warning/30"
        : tone === "done"
          ? "bg-muted text-muted-foreground"
          : "bg-muted/60 text-muted-foreground";
  const fullDate = due.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return (
    <span
      title={fullDate}
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${cls}`}
    >
      <CalendarClock className="h-3 w-3" />
      {label}
    </span>
  );
}

interface GlanceBadge {
  label: string;
  tone: "warning" | "danger" | "info";
  title?: string;
}

function GlanceCard({
  label,
  icon: Icon,
  loading,
  value,
  unit,
  footer,
  valueSize = "lg",
  tone = "neutral",
  badges,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  loading: boolean;
  value: string;
  unit?: string;
  footer?: React.ReactNode;
  valueSize?: "md" | "lg";
  tone?: "neutral" | "positive" | "warning";
  badges?: GlanceBadge[];
}) {
  const accentByTone: Record<typeof tone, string> = {
    neutral: "bg-primary/10 text-primary",
    positive: "bg-success/10 text-success",
    warning: "bg-warning/10 text-warning",
  };
  const badgeStyle: Record<GlanceBadge["tone"], string> = {
    danger: "bg-destructive/10 text-destructive ring-destructive/20",
    warning: "bg-warning/10 text-warning ring-warning/20",
    info: "bg-muted text-muted-foreground ring-border",
  };
  return (
    <Card className="group relative overflow-hidden rounded-2xl border-border/60 p-5 transition-all hover:border-border hover:shadow-sm">
      {/* subtle accent rail */}
      <span
        aria-hidden
        className={`absolute inset-y-3 left-0 w-[3px] rounded-r-full ${
          tone === "positive"
            ? "bg-success/40"
            : tone === "warning"
              ? "bg-warning/40"
              : "bg-primary/30"
        }`}
      />
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
          {label}
        </div>
        <span
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${accentByTone[tone]}`}
        >
          <Icon className="h-3.5 w-3.5" />
        </span>
      </div>

      {loading ? (
        <Skeleton className="mt-4 h-9 w-32" />
      ) : (
        <div className="mt-3 flex items-baseline gap-1.5">
          <span
            className={`font-serif font-semibold leading-none text-foreground tabular-nums ${
              valueSize === "md" ? "text-2xl md:text-[1.75rem]" : "text-[2.25rem] md:text-[2.5rem]"
            }`}
          >
            {value}
          </span>
          {unit && (
            <span className="text-sm text-muted-foreground">{unit}</span>
          )}
        </div>
      )}

      {!loading && badges && badges.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {badges.map((b, i) => (
            <span
              key={`${b.label}-${i}`}
              title={b.title}
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-medium ring-1 ring-inset ${badgeStyle[b.tone]}`}
            >
              <AlertTriangle className="h-2.5 w-2.5" />
              {b.label}
            </span>
          ))}
        </div>
      )}

      <div className="mt-2 min-h-[1.25rem] text-xs text-muted-foreground">
        {loading ? <Skeleton className="h-3 w-32" /> : footer}
      </div>
    </Card>
  );
}


const FIELD_META: Record<
  RequiredField,
  { label: string; icon: React.ComponentType<{ className?: string }> }
> = {
  electricity: { label: "Electricity", icon: Bolt },
  gas: { label: "Gas", icon: Flame },
  water: { label: "Water", icon: Droplets },
  waste: { label: "Waste", icon: Trash2 },
  occupancy: { label: "Occupancy", icon: Users },
};

const FIELD_ORDER: RequiredField[] = ["electricity", "gas", "water", "waste", "occupancy"];

function PortfolioProgressBadge({ progress }: { progress: HotelProgress[] }) {
  const totalFields = progress.length * 5;
  const filled = progress.reduce((acc, h) => acc + h.filledCount, 0);
  const pct = totalFields === 0 ? 0 : Math.round((filled / totalFields) * 100);
  const allDone = pct === 100;
  return (
    <div className="flex items-center gap-3 text-xs">
      <div className="flex flex-col items-end leading-tight">
        <span className="font-serif text-base font-semibold text-foreground">{pct}%</span>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
          {filled}/{totalFields} fields
        </span>
      </div>
      <div className="h-2 w-24 overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full transition-all ${allDone ? "bg-success" : "bg-primary"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function HotelProgressRow({
  progress,
  onClick,
}: {
  progress: HotelProgress;
  onClick: () => void;
}) {
  const pct = Math.round((progress.filledCount / progress.totalCount) * 100);
  const remaining = progress.totalCount - progress.filledCount;
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-muted/40"
    >
      <div
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
          progress.complete
            ? "bg-success/15 text-success"
            : progress.filledCount > 0
              ? "bg-primary/10 text-primary"
              : "bg-warning/15 text-warning"
        }`}
      >
        {progress.complete ? (
          <CheckCircle2 className="h-4 w-4" />
        ) : (
          <ClipboardList className="h-4 w-4" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-foreground">{progress.name}</span>
          {progress.complete && (
            <span className="rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-success">
              Complete
            </span>
          )}
        </div>
        <div className="mt-0.5 text-xs text-muted-foreground">
          {progress.complete
            ? "All 5 fields logged"
            : progress.filledCount === 0
              ? progress.lastPeriod
                ? `Nothing yet — last entry ${progress.lastPeriod}`
                : "No data yet"
              : `${remaining} ${remaining === 1 ? "field" : "fields"} to go`}
        </div>
      </div>

      <div className="hidden items-center gap-1.5 sm:flex">
        {FIELD_ORDER.map((f) => {
          const filled = progress.fields[f];
          const Icon = FIELD_META[f].icon;
          return (
            <div
              key={f}
              title={`${FIELD_META[f].label}: ${filled ? "logged" : "missing"}`}
              className={`relative flex h-8 w-8 items-center justify-center rounded-lg border transition-colors ${
                filled
                  ? "border-success/40 bg-success/10 text-success"
                  : "border-border/60 bg-muted/40 text-muted-foreground"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              <span
                className={`absolute -bottom-0.5 -right-0.5 flex h-3 w-3 items-center justify-center rounded-full ${
                  filled ? "bg-success text-success-foreground" : "bg-muted text-muted-foreground"
                }`}
              >
                {filled ? <Check className="h-2 w-2" /> : <Minus className="h-2 w-2" />}
              </span>
            </div>
          );
        })}
      </div>

      <div className="flex w-20 shrink-0 flex-col items-end gap-1">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={`h-full transition-all ${progress.complete ? "bg-success" : "bg-primary"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="text-[10px] tabular-nums text-muted-foreground">
          {progress.filledCount}/{progress.totalCount}
        </span>
      </div>

      <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
    </button>
  );
}

