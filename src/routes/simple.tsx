import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import * as React from "react";
import {
  ClipboardList,
  Sparkles,
  CheckCircle2,
  ArrowRight,
  AlertTriangle,
  Sunrise,
  Sun,
  Sunset,
  Loader2,
  Leaf,
} from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { setActiveHotelId, type Hotel, type MonthlyEntry } from "@/lib/hotel";
import { DEMO_PROFILE_ID, type UserProfile } from "@/lib/user-profile";
import { MONTH_NAMES, calculateCO2e, formatNumber } from "@/lib/format";
import { SimpleShell } from "@/components/simple-shell";
import { generateBriefing, type BriefingPayload } from "@/server/assistant.functions";

export const Route = createFileRoute("/simple")({
  head: () => ({
    meta: [
      { title: "Home — RA+ (Simple)" },
      {
        name: "description",
        content:
          "Your monthly check-in: see what to do, how you're doing, and ask Sera for help — in plain English.",
      },
    ],
  }),
  component: SimpleHomePage,
});

function expectedReportingPeriod(): { year: number; month: number } {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

function greeting(): { label: string; Icon: React.ComponentType<{ className?: string }> } {
  const h = new Date().getHours();
  if (h < 6) return { label: "Good evening", Icon: Sunset };
  if (h < 12) return { label: "Good morning", Icon: Sunrise };
  if (h < 18) return { label: "Good afternoon", Icon: Sun };
  return { label: "Good evening", Icon: Sunset };
}

interface HotelSummary {
  hotel: Hotel;
  hasThisMonth: boolean;
  filledFields: number; // 0..5
  lastPeriod: string | null;
}

function SimpleHomePage() {
  const navigate = useNavigate();
  const callBriefing = useServerFn(generateBriefing);
  const [loading, setLoading] = React.useState(true);
  const [profile, setProfile] = React.useState<UserProfile | null>(null);
  const [summaries, setSummaries] = React.useState<HotelSummary[]>([]);
  const [briefing, setBriefing] = React.useState<BriefingPayload | null>(null);
  const [briefingLoading, setBriefingLoading] = React.useState(false);
  const [co2eLatest, setCo2eLatest] = React.useState(0);

  React.useEffect(() => {
    void (async () => {
      const expected = expectedReportingPeriod();
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

      const summaries: HotelSummary[] = hotels.map((h) => {
        const expEntry = entries.find(
          (e) => e.hotel_id === h.id && e.year === expected.year && e.month === expected.month
        );
        const filled = (v: number | null | undefined) =>
          v !== null && v !== undefined && Number(v) > 0;
        const filledFields = expEntry
          ? [
              expEntry.electricity_kwh,
              expEntry.gas_kwh,
              expEntry.water_m3,
              expEntry.waste_kg,
              expEntry.occupied_room_nights,
            ].filter(filled).length
          : 0;
        const hist = entries
          .filter((e) => e.hotel_id === h.id)
          .sort((a, b) => (a.year !== b.year ? b.year - a.year : b.month - a.month));
        const last = hist[0];
        return {
          hotel: h,
          hasThisMonth: filledFields === 5,
          filledFields,
          lastPeriod: last
            ? `${MONTH_NAMES[last.month - 1]} ${last.year}`
            : null,
        };
      });

      // Portfolio CO2e for the expected month
      let co2 = 0;
      for (const e of entries) {
        if (e.year === expected.year && e.month === expected.month) {
          co2 += calculateCO2e(e);
        }
      }

      setProfile((profileData as UserProfile) ?? null);
      setSummaries(summaries);
      setCo2eLatest(co2);
      setLoading(false);
    })();
  }, []);

  const firstName = (profile?.display_name?.split(" ")[0] || "Julien").trim();
  const expected = expectedReportingPeriod();
  const monthLabel = `${MONTH_NAMES[expected.month - 1]} ${expected.year}`;
  const totalHotels = summaries.length;
  const completeHotels = summaries.filter((s) => s.hasThisMonth).length;
  const allDone = totalHotels > 0 && completeHotels === totalHotels;
  const g = greeting();

  // Friendly briefing
  React.useEffect(() => {
    if (loading || !totalHotels) return;
    setBriefingLoading(true);
    callBriefing({
      data: {
        firstName,
        todos: summaries
          .filter((s) => !s.hasThisMonth)
          .map((s) => ({
            title: `Add ${monthLabel} for ${s.hotel.name}`,
            description: `${s.filledFields}/5 fields filled.`,
            done: false,
            tone: "primary" as const,
          })),
        issues: [],
      },
    })
      .then((res) => {
        if (res.ok) setBriefing(res.briefing);
      })
      .catch(() => {})
      .finally(() => setBriefingLoading(false));
  }, [loading, totalHotels, callBriefing, firstName, monthLabel, summaries]);

  return (
    <SimpleShell
      title={`${g.label}, ${firstName}.`}
      subtitle={
        loading
          ? "Loading your hotels…"
          : allDone
            ? `You've already added ${monthLabel} data for every hotel. Have a look at how you're doing.`
            : `Here's what to do for ${monthLabel}. It usually takes a few minutes per hotel.`
      }
      help="This page is your monthly check-in. Add last month's data, then see how each hotel is doing compared to similar properties. You only need to come back once a month."
    >
      {/* Friendly briefing card */}
      <section className="mb-8 rounded-3xl border border-border/60 bg-card p-5 md:p-6">
        <div className="mb-3 flex items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          A note from Sera
        </div>
        {briefingLoading || (loading && !briefing) ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Sera is reading your numbers…
          </div>
        ) : briefing ? (
          <div className="space-y-3 text-sm leading-relaxed text-foreground">
            <p className="font-serif text-lg italic text-foreground/90">
              "{briefing.headline}"
            </p>
            <p className="text-muted-foreground">{briefing.summary}</p>
            {briefing.focus && (
              <p className="rounded-2xl bg-primary/5 px-3 py-2 text-foreground">
                <span className="font-medium">Focus this month: </span>
                {briefing.focus}
              </p>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Add a couple of months of data and Sera will start sharing tips here.
          </p>
        )}
      </section>

      {/* This month section */}
      <section className="mb-10">
        <div className="mb-4 flex items-end justify-between gap-2">
          <h2 className="font-serif text-xl font-semibold text-foreground md:text-2xl">
            {allDone ? `${monthLabel} is in ✓` : `Add ${monthLabel}`}
          </h2>
          {totalHotels > 0 && (
            <span className="text-xs text-muted-foreground">
              {completeHotels} of {totalHotels} done
            </span>
          )}
        </div>

        {loading ? (
          <div className="space-y-3">
            {[0, 1].map((i) => (
              <div
                key={i}
                className="h-24 animate-pulse rounded-2xl border border-border/60 bg-muted/40"
              />
            ))}
          </div>
        ) : totalHotels === 0 ? (
          <EmptyHotels />
        ) : (
          <ul className="space-y-3">
            {summaries.map((s) => (
              <HotelTaskCard
                key={s.hotel.id}
                summary={s}
                monthLabel={monthLabel}
                onAction={() => {
                  setActiveHotelId(s.hotel.id);
                  void navigate({ to: "/simple/workspace" });
                }}
              />
            ))}
          </ul>
        )}
      </section>

      {/* Big helper buttons */}
      <section className="mb-12 grid gap-3 sm:grid-cols-2">
        <BigAction
          to="/simple/insights"
          icon={Sparkles}
          title="How am I doing?"
          subtitle="See trends, peer comparison and AI tips."
          tone="primary"
        />
        <BigAction
          to="/simple/log"
          icon={ClipboardList}
          title="Add this month"
          subtitle="Type, paste or upload last month's bills."
          tone="muted"
        />
      </section>

      {/* Reassuring footer stat */}
      {totalHotels > 0 && co2eLatest > 0 && (
        <section className="mb-8 rounded-3xl border border-border/60 bg-muted/40 p-5 text-center">
          <Leaf className="mx-auto mb-2 h-5 w-5 text-success" />
          <div className="text-xs uppercase tracking-wider text-muted-foreground">
            Portfolio carbon · {monthLabel}
          </div>
          <div className="mt-1 font-serif text-3xl font-semibold text-foreground num">
            {formatNumber(Math.round(co2eLatest))} kg CO₂e
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Based on the hotels that have logged data for {monthLabel}.
          </p>
        </section>
      )}
    </SimpleShell>
  );
}

function EmptyHotels() {
  return (
    <div className="rounded-3xl border border-dashed border-border/60 bg-card p-8 text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <ClipboardList className="h-6 w-6" />
      </div>
      <h3 className="font-serif text-lg text-foreground">No hotels yet</h3>
      <p className="mt-2 text-sm text-muted-foreground">
        Add your first hotel in settings, then come back here to log data.
      </p>
      <Link
        to="/simple/settings"
        className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        Open settings
        <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}

function HotelTaskCard({
  summary,
  monthLabel,
  onAction,
}: {
  summary: HotelSummary;
  monthLabel: string;
  onAction: () => void;
}) {
  const { hotel, hasThisMonth, filledFields, lastPeriod } = summary;
  const partial = !hasThisMonth && filledFields > 0;

  return (
    <li>
      <button
        type="button"
        onClick={onAction}
        className={`group flex w-full flex-col gap-3 rounded-3xl border p-5 text-left transition-all hover:shadow-md md:flex-row md:items-center md:gap-5 ${
          hasThisMonth
            ? "border-success/30 bg-success/5"
            : partial
              ? "border-warning/40 bg-warning/5"
              : "border-border/60 bg-card hover:border-primary/40"
        }`}
      >
        <div
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${
            hasThisMonth
              ? "bg-success/15 text-success"
              : partial
                ? "bg-warning/15 text-warning"
                : "bg-primary/10 text-primary"
          }`}
        >
          {hasThisMonth ? (
            <CheckCircle2 className="h-6 w-6" />
          ) : partial ? (
            <AlertTriangle className="h-6 w-6" />
          ) : (
            <ClipboardList className="h-6 w-6" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-serif text-lg font-semibold text-foreground">
            {hotel.name}
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {hasThisMonth
              ? `${monthLabel} is logged. Nicely done.`
              : partial
                ? `${filledFields} of 5 fields filled for ${monthLabel}.`
                : lastPeriod
                  ? `No data yet for ${monthLabel}. Last entry: ${lastPeriod}.`
                  : `Let's log your first month for this hotel.`}
          </p>
        </div>
        <div className="flex items-center justify-between gap-3 md:justify-end">
          <span className="text-xs text-muted-foreground md:hidden">
            {hotel.region}
          </span>
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition ${
              hasThisMonth
                ? "bg-card text-foreground group-hover:bg-muted"
                : "bg-primary text-primary-foreground group-hover:bg-primary/90"
            }`}
          >
            {hasThisMonth ? "View" : "Add data"}
            <ArrowRight className="h-3.5 w-3.5" />
          </span>
        </div>
      </button>
    </li>
  );
}

function BigAction({
  to,
  icon: Icon,
  title,
  subtitle,
  tone,
}: {
  to: "/simple/log" | "/simple/insights" | "/simple/settings";
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle: string;
  tone: "primary" | "muted";
}) {
  return (
    <Link
      to={to}
      className={`group flex items-start gap-4 rounded-3xl border p-5 transition-all hover:shadow-md ${
        tone === "primary"
          ? "border-primary/30 bg-primary/5 hover:border-primary/60"
          : "border-border/60 bg-card hover:border-primary/40"
      }`}
    >
      <div
        className={`flex h-11 w-11 items-center justify-center rounded-2xl ${
          tone === "primary" ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
        }`}
      >
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-serif text-lg font-semibold text-foreground">{title}</div>
        <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
      </div>
      <ArrowRight className="mt-3 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1" />
    </Link>
  );
}
