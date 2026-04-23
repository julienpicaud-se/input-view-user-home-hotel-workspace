import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import * as React from "react";
import {
  ArrowRight,
  Bolt,
  Building2,
  CheckCircle2,
  ClipboardList,
  Flame,
  Leaf,
  Sparkles,
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
} from "lucide-react";
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

function HomePage() {
  const navigate = useNavigate();
  const [loading, setLoading] = React.useState(true);
  const [profile, setProfile] = React.useState<UserProfile | null>(null);
  const [summary, setSummary] = React.useState<PortfolioSummary | null>(null);
  const [dismissed, setDismissed] = React.useState<Set<string>>(() => loadDismissed());
  const [showDismissed, setShowDismissed] = React.useState(false);

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

      // Latest entry across portfolio
      const sortedAll = [...entries].sort((a, b) =>
        a.year !== b.year ? a.year - b.year : a.month - b.month
      );
      const latest = sortedAll[sortedAll.length - 1] ?? null;
      const latestHotel = latest
        ? hotels.find((h) => h.id === latest.hotel_id)
        : undefined;

      // Previous month for the same latest hotel
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

  // Build the full task list (deep-linked, per-hotel where useful)
  const allTodos: Todo[] = React.useMemo(() => {
    if (!summary) return [];
    const items: Todo[] = [];
    const expected = { year: summary.expectedYear, month: summary.expectedMonth };
    const allComplete = summary.hotelProgress.every((h) => h.complete);

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
      });
    }

    // Generic engagement tasks
    items.push({
      id: "review-benchmarks",
      title: "Review this month's peer benchmarks",
      description: "See how your portfolio compares to similar hotels on energy, water and waste.",
      cta: "View benchmarks",
      done: false,
      tone: "primary",
      target: { kind: "workspace", tab: "benchmarks" },
      dismissible: true,
    });

    items.push({
      id: "ask-sera",
      title: "Get AI insights from Sera",
      description: "Ask about trends, anomalies, or where to cut footprint next.",
      cta: "Open Insights",
      done: false,
      tone: "primary",
      target: { kind: "workspace", tab: "analyze" },
      dismissible: true,
    });

    // Profile completeness
    const profileComplete = Boolean(
      profile?.display_name && profile?.email && profile?.company_name
    );
    items.push({
      id: "complete-profile",
      title: profileComplete ? "Profile is complete" : "Finish setting up your profile",
      description: profileComplete
        ? "Name, email and company are filled in."
        : "Add your email and company so reports can be addressed to you.",
      cta: profileComplete ? "View profile" : "Complete profile",
      done: profileComplete,
      tone: profileComplete ? "muted" : "warning",
      target: { kind: "profile" },
      dismissible: false,
    });

    return items;
  }, [summary, profile]);

  const visibleTodos = React.useMemo(
    () => allTodos.filter((t) => !dismissed.has(t.id)),
    [allTodos, dismissed]
  );
  const dismissedTodos = React.useMemo(
    () => allTodos.filter((t) => dismissed.has(t.id)),
    [allTodos, dismissed]
  );

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

      {/* Briefing */}
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
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {/* Portfolio */}
          <Card className="rounded-2xl border-border/60 p-5">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Building2 className="h-3.5 w-3.5" />
              Portfolio
            </div>
            {loading ? (
              <Skeleton className="mt-3 h-9 w-24" />
            ) : (
              <div className="mt-2 flex items-baseline gap-2">
                <span className="font-serif text-4xl font-semibold text-foreground">
                  {summary?.hotelCount ?? 0}
                </span>
                <span className="text-sm text-muted-foreground">
                  {summary?.hotelCount === 1 ? "hotel" : "hotels"}
                </span>
              </div>
            )}
            <div className="mt-1 text-xs text-muted-foreground">
              {loading ? <Skeleton className="h-3 w-32" /> : `${formatNumber(summary?.totalRooms ?? 0)} total rooms`}
            </div>
          </Card>

          {/* Latest data */}
          <Card className="rounded-2xl border-border/60 p-5">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <ClipboardList className="h-3.5 w-3.5" />
              Latest data
            </div>
            {loading ? (
              <Skeleton className="mt-3 h-9 w-40" />
            ) : summary?.latestEntry ? (
              <>
                <div className="mt-2 font-serif text-2xl font-semibold leading-tight text-foreground">
                  {periodLabel(summary.latestEntry.year, summary.latestEntry.month)}
                </div>
                <div className="mt-1 truncate text-xs text-muted-foreground">
                  {summary.latestEntry.hotel_name}
                </div>
              </>
            ) : (
              <div className="mt-2 text-sm text-muted-foreground">No entries yet</div>
            )}
          </Card>

          {/* CO2e trend */}
          <Card className="rounded-2xl border-border/60 p-5">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Leaf className="h-3.5 w-3.5" />
              CO₂e — latest month
            </div>
            {loading ? (
              <Skeleton className="mt-3 h-9 w-32" />
            ) : (
              <>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="font-serif text-3xl font-semibold text-foreground">
                    {formatNumber(Math.round(summary?.co2eLatest ?? 0))}
                  </span>
                  <span className="text-sm text-muted-foreground">kg</span>
                </div>
                {co2Change !== null ? (
                  <div
                    className={`mt-1 inline-flex items-center gap-1 text-xs font-medium ${
                      co2Down ? "text-success" : "text-warning"
                    }`}
                  >
                    {co2Down ? (
                      <TrendingDown className="h-3.5 w-3.5" />
                    ) : (
                      <TrendingUp className="h-3.5 w-3.5" />
                    )}
                    {formatPct(co2Change)} vs previous month
                  </div>
                ) : (
                  <div className="mt-1 text-xs text-muted-foreground">No comparison yet</div>
                )}
              </>
            )}
          </Card>
        </div>

        {/* Headline insight */}
        {!loading && summary?.latestEntry && (
          <Card className="mt-4 overflow-hidden rounded-2xl border-border/60 bg-gradient-to-br from-primary/5 via-card to-accent/10 p-5">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                <Bolt className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                  Headline
                </div>
                <p className="mt-1 text-sm text-foreground md:text-base">
                  Your portfolio drew{" "}
                  <span className="font-semibold">
                    {formatNumber(Math.round(summary.totalElectricity))} kWh
                  </span>{" "}
                  of electricity in{" "}
                  {periodLabel(summary.latestEntry.year, summary.latestEntry.month)}
                  {co2Change !== null && (
                    <>
                      {" "}— overall CO₂e is{" "}
                      <span
                        className={`font-semibold ${co2Down ? "text-success" : "text-warning"}`}
                      >
                        {co2Down ? "down" : "up"} {Math.abs(co2Change).toFixed(1)}%
                      </span>{" "}
                      vs the prior month
                    </>
                  )}
                  .
                </p>
              </div>
            </div>
          </Card>
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

      {/* To-dos */}
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

      {/* Quick links */}
      <section>
        <div className="mb-4">
          <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            Shortcuts
          </div>
          <h2 className="font-serif text-2xl font-semibold text-foreground">
            Jump into the workspace
          </h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <ShortcutLink
            to="/workspace"
            search={{ tab: "overview" }}
            icon={Building2}
            title="Overview"
          />
          <ShortcutLink
            to="/workspace"
            search={{ tab: "log" }}
            icon={Flame}
            title="Add data"
          />
          <ShortcutLink
            to="/workspace"
            search={{ tab: "benchmarks" }}
            icon={Users}
            title="Peer benchmarks"
          />
          <ShortcutLink
            to="/workspace"
            search={{ tab: "analyze" }}
            icon={Sparkles}
            title="Hotel insights"
          />
        </div>
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

function ShortcutLink({
  to,
  search,
  icon: Icon,
  title,
}: {
  to: string;
  search?: Record<string, string>;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
}) {
  return (
    <Link
      to={to as never}
      search={search as never}
      className="group flex items-center gap-3 rounded-2xl border border-border/60 bg-card px-4 py-3.5 text-sm font-medium text-foreground transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-sm"
    >
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
        <Icon className="h-4 w-4" />
      </span>
      <span className="flex-1">{title}</span>
      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
    </Link>
  );
}
