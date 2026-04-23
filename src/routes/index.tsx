import { createFileRoute, Link } from "@tanstack/react-router";
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
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { type Hotel, type MonthlyEntry } from "@/lib/hotel";
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
  totalElectricity: number; // most recent month across portfolio
  hotelsMissingCurrent: { id: string; name: string; lastPeriod: string | null }[];
}

interface Todo {
  id: string;
  title: string;
  description: string;
  href: { to: string; search?: Record<string, string> };
  cta: string;
  done: boolean;
  tone: "primary" | "warning" | "muted";
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

// Returns the year/month for "the month we should have data for by now"
// = previous calendar month (data is reported in arrears).
function expectedReportingPeriod(): { year: number; month: number } {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

function HomePage() {
  const [loading, setLoading] = React.useState(true);
  const [profile, setProfile] = React.useState<UserProfile | null>(null);
  const [summary, setSummary] = React.useState<PortfolioSummary | null>(null);

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

      // For the latest hotel, find the previous month's entry
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

      // Portfolio-wide totals for the most recent month present
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

      // Which hotels are missing the expected reporting period?
      const expected = expectedReportingPeriod();
      const hotelsMissingCurrent = hotels
        .filter((h) => {
          const has = entries.some(
            (e) =>
              e.hotel_id === h.id &&
              e.year === expected.year &&
              e.month === expected.month
          );
          return !has;
        })
        .map((h) => {
          const hotelEntries = entries
            .filter((e) => e.hotel_id === h.id)
            .sort((a, b) =>
              a.year !== b.year ? b.year - a.year : b.month - a.month
            );
          const last = hotelEntries[0];
          return {
            id: h.id,
            name: h.name,
            lastPeriod: last ? periodLabel(last.year, last.month) : null,
          };
        });

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
        hotelsMissingCurrent,
      });
      setLoading(false);
    })();
  }, []);

  const g = greeting();
  const firstName = (profile?.display_name?.split(" ")[0] || "Julien").trim();

  // Build to-dos based on real data
  const todos: Todo[] = React.useMemo(() => {
    if (!summary) return [];
    const items: Todo[] = [];

    // 1. Add data for any hotel missing the expected period
    if (summary.hotelsMissingCurrent.length > 0) {
      const missing = summary.hotelsMissingCurrent;
      const expected = expectedReportingPeriod();
      items.push({
        id: "log-current",
        title: `Log ${MONTH_NAMES[expected.month - 1]} data for ${missing.length} ${missing.length === 1 ? "hotel" : "hotels"}`,
        description:
          missing.length <= 2
            ? missing.map((m) => m.name).join(" · ")
            : `${missing[0].name}, ${missing[1].name} +${missing.length - 2} more`,
        href: { to: "/workspace", search: { tab: "log" } },
        cta: "Add data",
        done: false,
        tone: "warning",
      });
    } else {
      items.push({
        id: "log-current",
        title: "All monthly data is up to date",
        description: "Every hotel has reported the latest expected period.",
        href: { to: "/workspace", search: { tab: "log" } },
        cta: "Open log",
        done: true,
        tone: "muted",
      });
    }

    // 2. Review benchmarks if we have at least one entry
    items.push({
      id: "review-benchmarks",
      title: "Review this month's peer benchmarks",
      description:
        "See how your portfolio compares to similar hotels on energy, water and waste.",
      href: { to: "/workspace", search: { tab: "benchmarks" } },
      cta: "View benchmarks",
      done: false,
      tone: "primary",
    });

    // 3. Ask Sera for an insight
    items.push({
      id: "ask-sera",
      title: "Get AI insights from Sera",
      description: "Ask about trends, anomalies, or where to cut footprint next.",
      href: { to: "/workspace", search: { tab: "analyze" } },
      cta: "Open Insights",
      done: false,
      tone: "primary",
    });

    // 4. Profile completeness
    const profileComplete = Boolean(
      profile?.display_name && profile?.email && profile?.company_name
    );
    items.push({
      id: "complete-profile",
      title: profileComplete ? "Profile is complete" : "Finish setting up your profile",
      description: profileComplete
        ? "Name, email and company are filled in."
        : "Add your email and company so reports can be addressed to you.",
      href: { to: "/profile" },
      cta: profileComplete ? "View profile" : "Complete profile",
      done: profileComplete,
      tone: profileComplete ? "muted" : "warning",
    });

    return items;
  }, [summary, profile]);

  const co2Change = summary
    ? pctChange(summary.co2eLatest || null, summary.co2ePrev || null)
    : null;
  const co2Down = co2Change !== null && co2Change < 0;
  const openTodos = todos.filter((t) => !t.done).length;

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

      {/* To-dos */}
      <section className="mb-12">
        <div className="mb-4 flex items-end justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              For you to do
            </div>
            <h2 className="font-serif text-2xl font-semibold text-foreground">
              Your to-dos
            </h2>
          </div>
          <div className="text-xs text-muted-foreground">
            {openTodos} open · {todos.length - openTodos} done
          </div>
        </div>

        <div className="space-y-3">
          {loading
            ? Array.from({ length: 3 }).map((_, i) => (
                <Card key={i} className="rounded-2xl border-border/60 p-5">
                  <Skeleton className="h-5 w-1/2" />
                  <Skeleton className="mt-2 h-4 w-3/4" />
                </Card>
              ))
            : todos.map((t) => <TodoRow key={t.id} todo={t} />)}
        </div>
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

function TodoRow({ todo }: { todo: Todo }) {
  const dotClass =
    todo.tone === "warning"
      ? "bg-warning text-warning-foreground"
      : todo.tone === "muted"
        ? "bg-muted text-muted-foreground"
        : "bg-primary text-primary-foreground";

  return (
    <Card
      className={`group rounded-2xl border-border/60 p-5 transition-colors ${
        todo.done ? "bg-muted/40" : "hover:border-primary/40"
      }`}
    >
      <div className="flex items-start gap-4">
        <div
          className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${dotClass}`}
        >
          {todo.done ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : todo.tone === "warning" ? (
            <Wand2 className="h-4 w-4" />
          ) : (
            <ArrowRight className="h-4 w-4" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3
              className={`text-base font-semibold ${
                todo.done ? "text-muted-foreground line-through" : "text-foreground"
              }`}
            >
              {todo.title}
            </h3>
            {todo.done && (
              <span className="rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-success">
                Done
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{todo.description}</p>
        </div>
        <Button
          asChild
          variant={todo.done ? "ghost" : todo.tone === "warning" ? "default" : "outline"}
          size="sm"
          className="shrink-0 rounded-xl"
        >
          <Link to={todo.href.to as never} search={todo.href.search as never}>
            {todo.cta}
            <ArrowRight className="ml-1 h-3.5 w-3.5" />
          </Link>
        </Button>
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
