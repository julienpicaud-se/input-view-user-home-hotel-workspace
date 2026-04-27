import { createFileRoute, Link } from "@tanstack/react-router";
import * as React from "react";
import ReactMarkdown from "react-markdown";
import {
  Sparkles,
  Bolt,
  Flame,
  Droplets,
  Trash2,
  BedDouble,
  Loader2,
  Send,
  CheckCircle2,
  TrendingDown,
  TrendingUp,
  Leaf,
  ArrowRight,
  Building2,
  Circle,
  CalendarClock,
  Trophy,
  ListChecks,
  ChevronRight,
} from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import {
  setActiveHotelId,
  type Hotel,
  type MonthlyEntry,
} from "@/lib/hotel";
import { DEMO_PROFILE_ID, type UserProfile } from "@/lib/user-profile";
import {
  MONTH_NAMES,
  formatNumber,
  pctChange,
  calculateCO2e,
} from "@/lib/format";
import { EasyHeader } from "@/components/easy-nav";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  generateBriefing,
  sendAssistantMessage,
  type BriefingPayload,
} from "@/server/assistant.functions";

export const Route = createFileRoute("/easy/")({
  head: () => ({
    meta: [
      { title: "Your portfolio — RA+ (Extra Simple)" },
      {
        name: "description",
        content:
          "A bird's-eye view of all your hotels: who's logged this month, who's saving the most carbon, and where to focus next.",
      },
    ],
  }),
  component: ExtraSimpleHomePage,
});

function expectedReportingPeriod(): { year: number; month: number } {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

type FieldKey =
  | "electricity_kwh"
  | "gas_kwh"
  | "water_m3"
  | "waste_kg"
  | "occupied_room_nights";

const FIELD_KEYS: FieldKey[] = [
  "electricity_kwh",
  "gas_kwh",
  "water_m3",
  "waste_kg",
  "occupied_room_nights",
];

const FIELD_META: Record<
  FieldKey,
  { label: string; Icon: React.ComponentType<{ className?: string }> }
> = {
  electricity_kwh: { label: "Electricity", Icon: Bolt },
  gas_kwh: { label: "Gas", Icon: Flame },
  water_m3: { label: "Water", Icon: Droplets },
  waste_kg: { label: "Waste", Icon: Trash2 },
  occupied_room_nights: { label: "Room nights", Icon: BedDouble },
};

interface PortfolioRow {
  hotel: Hotel;
  thisMonth: MonthlyEntry | null;
  prevMonth: MonthlyEntry | null;
  filledCount: number;
  missingFields: FieldKey[];
  co2eThis: number;
  co2ePrev: number;
  co2eChange: number | null;
}

function ExtraSimpleHomePage() {
  const callBriefing = useServerFn(generateBriefing);
  const callAssistant = useServerFn(sendAssistantMessage);

  const [profile, setProfile] = React.useState<UserProfile | null>(null);
  const [rows, setRows] = React.useState<PortfolioRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [briefing, setBriefing] = React.useState<BriefingPayload | null>(null);
  const [briefingLoading, setBriefingLoading] = React.useState(false);

  // Side-panel "Ask Sera" — portfolio-wide questions only on this page.
  const [panelOpen, setPanelOpen] = React.useState(false);
  const [panelTitle, setPanelTitle] = React.useState("Sera");
  const [panelPrompt, setPanelPrompt] = React.useState("");
  const [panelAnswer, setPanelAnswer] = React.useState<string | null>(null);
  const [panelLoading, setPanelLoading] = React.useState(false);
  const [panelError, setPanelError] = React.useState<string | null>(null);

  // Quick portfolio chat (lighter than the workspace one — one-shot answers in the side panel)
  const [chatInput, setChatInput] = React.useState("");

  const expected = expectedReportingPeriod();
  const monthLabel = `${MONTH_NAMES[expected.month - 1]} ${expected.year}`;
  const prevDate = new Date(expected.year, expected.month - 2, 1);

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

      const py = prevDate.getFullYear();
      const pm = prevDate.getMonth() + 1;

      const portfolio: PortfolioRow[] = hotels.map((h) => {
        const thisMonth =
          entries.find(
            (e) =>
              e.hotel_id === h.id &&
              e.year === expected.year &&
              e.month === expected.month,
          ) ?? null;
        const prevMonth =
          entries.find(
            (e) => e.hotel_id === h.id && e.year === py && e.month === pm,
          ) ?? null;
        const filledCount = thisMonth
          ? FIELD_KEYS.filter((k) => thisMonth[k] != null).length
          : 0;
        const missingFields: FieldKey[] = thisMonth
          ? FIELD_KEYS.filter((k) => thisMonth[k] == null)
          : [...FIELD_KEYS];
        const co2eThis = thisMonth ? calculateCO2e(thisMonth) : 0;
        const co2ePrev = prevMonth ? calculateCO2e(prevMonth) : 0;
        return {
          hotel: h,
          thisMonth,
          prevMonth,
          filledCount,
          missingFields,
          co2eThis,
          co2ePrev,
          co2eChange: pctChange(co2eThis || null, co2ePrev || null),
        };
      });

      setProfile((profileData as UserProfile) ?? null);
      setRows(portfolio);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const firstName = (profile?.display_name?.split(" ")[0] || "there").trim();
  const totalHotels = rows.length;
  const completedHotels = rows.filter((r) => r.filledCount === FIELD_KEYS.length).length;
  const startedHotels = rows.filter(
    (r) => r.filledCount > 0 && r.filledCount < FIELD_KEYS.length,
  ).length;
  const notStartedHotels = totalHotels - completedHotels - startedHotels;
  const allDone = totalHotels > 0 && completedHotels === totalHotels;

  const portfolioCO2eThis = rows.reduce((s, r) => s + r.co2eThis, 0);
  const portfolioCO2ePrev = rows.reduce((s, r) => s + r.co2ePrev, 0);
  const portfolioChange = pctChange(
    portfolioCO2eThis || null,
    portfolioCO2ePrev || null,
  );

  // Best & worst movers (only hotels with both months of data)
  const movers = rows.filter((r) => r.co2eChange !== null);
  const bestMover = [...movers].sort(
    (a, b) => (a.co2eChange ?? 0) - (b.co2eChange ?? 0),
  )[0];
  const worstMover = [...movers].sort(
    (a, b) => (b.co2eChange ?? 0) - (a.co2eChange ?? 0),
  )[0];

  // Briefing
  React.useEffect(() => {
    if (loading || !totalHotels) return;
    setBriefingLoading(true);
    callBriefing({
      data: {
        firstName,
        todos: rows
          .filter((r) => r.filledCount < FIELD_KEYS.length)
          .map((r) => ({
            title: `Add ${monthLabel} for ${r.hotel.name}`,
            description: "Open the hotel workspace to log it.",
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
  }, [loading, totalHotels, callBriefing, firstName, monthLabel, rows]);

  async function askSeraAbout(prompt: string, title?: string) {
    setPanelTitle(title ?? "Sera");
    setPanelPrompt(prompt);
    setPanelAnswer(null);
    setPanelError(null);
    setPanelOpen(true);
    setPanelLoading(true);
    try {
      const res = await callAssistant({
        data: { message: prompt, history: [] },
      });
      if (res.ok) setPanelAnswer(res.content);
      else setPanelError("Sera couldn't answer just now.");
    } catch {
      setPanelError("Couldn't reach Sera.");
    } finally {
      setPanelLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <EasyHeader />

      <main className="mx-auto w-full max-w-4xl px-5 pb-24 pt-8">
        {/* Hero greeting — portfolio framing */}
        <section className="mb-8">
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-border/60 bg-card px-3 py-1 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            <CalendarClock className="h-3 w-3" />
            Portfolio overview · {monthLabel}
          </div>
          <h1 className="font-serif text-3xl font-semibold leading-tight text-foreground md:text-5xl">
            Hi {firstName}.
          </h1>
          <p className="mt-3 text-base text-muted-foreground md:text-lg">
            {loading
              ? "Pulling your hotels together…"
              : totalHotels === 0
                ? "Add your first hotel from Classic to get started."
                : allDone
                  ? `All ${totalHotels} hotels are logged for ${monthLabel}. See how the portfolio is doing below.`
                  : `${completedHotels} of ${totalHotels} hotels logged ${monthLabel}. Pick a hotel below to keep going.`}
          </p>
        </section>

        {/* Portfolio KPI strip — these numbers only make sense at the portfolio level */}
        {!loading && totalHotels > 0 && (
          <section className="mb-10 grid gap-3 sm:grid-cols-3">
            <KpiTile
              icon={Building2}
              label="Hotels"
              value={`${totalHotels}`}
              hint={`${completedHotels} done · ${startedHotels} started · ${notStartedHotels} not yet`}
            />
            <KpiTile
              icon={Leaf}
              label={`Carbon · ${monthLabel}`}
              value={
                portfolioCO2eThis > 0
                  ? `${formatNumber(Math.round(portfolioCO2eThis))} kg CO₂e`
                  : "—"
              }
              hint={
                portfolioChange !== null
                  ? `${portfolioChange > 0 ? "+" : ""}${portfolioChange.toFixed(0)}% vs last month`
                  : "Log a 2nd month to see the trend"
              }
              tone={
                portfolioChange === null
                  ? "neutral"
                  : portfolioChange <= 0
                    ? "good"
                    : "warn"
              }
            />
            <KpiTile
              icon={Trophy}
              label="Best mover"
              value={bestMover ? bestMover.hotel.name : "—"}
              hint={
                bestMover && bestMover.co2eChange !== null
                  ? `${bestMover.co2eChange > 0 ? "+" : ""}${bestMover.co2eChange.toFixed(0)}% CO₂ this month`
                  : "Awaiting data"
              }
              tone="good"
            />
          </section>
        )}

        {/* Sera briefing — portfolio-wide note */}
        <section className="mb-10 rounded-3xl border border-border/60 bg-card p-5 md:p-7">
          <div className="mb-3 flex items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            Sera's portfolio note
          </div>
          {briefingLoading || (loading && !briefing) ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Reading across your hotels…
            </div>
          ) : briefing ? (
            <div className="space-y-3 text-sm leading-relaxed text-foreground">
              <p className="font-serif text-xl italic text-foreground/90 md:text-2xl">
                "{briefing.headline}"
              </p>
              <p className="text-muted-foreground">{briefing.summary}</p>
              {briefing.focus && (
                <p className="rounded-2xl bg-primary/5 px-3 py-2 text-foreground">
                  <span className="font-medium">Where to focus: </span>
                  {briefing.focus}
                </p>
              )}
              {briefing.questions && briefing.questions.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {briefing.questions.slice(0, 3).map((q: string) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => void askSeraAbout(q, "Sera")}
                      className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-background px-3 py-1.5 text-xs font-medium text-foreground transition hover:border-primary/60 hover:bg-primary/5"
                    >
                      <Sparkles className="h-3 w-3 text-primary" />
                      {q}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Once a couple of months are logged, Sera will share what she sees across the portfolio.
            </p>
          )}
        </section>

        {/* What to do next — checklist of hotels with missing numbers */}
        {!loading && totalHotels > 0 && (
          <TodoChecklist rows={rows} monthLabel={monthLabel} />
        )}

        {/* Hotels table — the heart of the home page. Each row goes to its workspace. */}
        <section className="mb-10">
          <div className="mb-4 flex items-baseline justify-between gap-3">
            <h2 className="font-serif text-2xl font-semibold text-foreground md:text-3xl">
              Your hotels
            </h2>
            <span className="text-xs text-muted-foreground">
              Tap a hotel to log or review
            </span>
          </div>

          {loading ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="h-20 animate-pulse rounded-2xl border border-border/60 bg-muted/40"
                />
              ))}
            </div>
          ) : totalHotels === 0 ? (
            <div className="rounded-3xl border border-dashed border-border/60 bg-card p-8 text-center">
              <h3 className="font-serif text-lg text-foreground">No hotels yet</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Switch to Classic view from the top-right to add your first hotel.
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {rows.map((r) => (
                <PortfolioRowCard key={r.hotel.id} row={r} />
              ))}
            </ul>
          )}
        </section>

        {/* Compare across hotels */}
        {!loading && rows.length > 1 && (
          <section className="mb-10 rounded-3xl border border-border/60 bg-card p-5 md:p-6">
            <h2 className="mb-1 font-serif text-xl font-semibold text-foreground">
              Movers this month
            </h2>
            <p className="mb-5 text-sm text-muted-foreground">
              Where carbon went up the most, and where it came down.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <MoverCard
                label="Best change"
                row={bestMover}
                tone="good"
                onAsk={() =>
                  bestMover &&
                  askSeraAbout(
                    `Across the portfolio, ${bestMover.hotel.name} dropped CO₂ the most this month. What likely worked there, and how could other hotels copy it?`,
                    `Sera on ${bestMover.hotel.name}`,
                  )
                }
              />
              <MoverCard
                label="Needs attention"
                row={worstMover}
                tone="warn"
                onAsk={() =>
                  worstMover &&
                  askSeraAbout(
                    `${worstMover.hotel.name} had the biggest CO₂ increase this month. What are the most common drivers, and what should the manager check first?`,
                    `Sera on ${worstMover.hotel.name}`,
                  )
                }
              />
            </div>
          </section>
        )}

        {/* Ask Sera at portfolio level */}
        <section className="mb-12 rounded-3xl border border-primary/20 bg-primary/5 p-5 md:p-7">
          <div className="mb-3 flex items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            Ask Sera about the portfolio
          </div>
          <p className="mb-4 text-sm text-muted-foreground">
            For per-hotel questions (logging, bills, tips), open that hotel's workspace.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <textarea
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (chatInput.trim())
                    void askSeraAbout(chatInput.trim(), "Sera");
                  setChatInput("");
                }
              }}
              rows={2}
              placeholder="e.g. which hotel should I focus on next month?"
              className="flex-1 resize-none rounded-2xl border border-input bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <button
              type="button"
              onClick={() => {
                if (chatInput.trim()) void askSeraAbout(chatInput.trim(), "Sera");
                setChatInput("");
              }}
              disabled={!chatInput.trim()}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Send className="h-4 w-4" />
              Ask
            </button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {[
              "Which hotel should I focus on next month?",
              "Where am I losing the most carbon across the group?",
              "Which hotel is my best benchmark?",
            ].map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => void askSeraAbout(p, "Sera")}
                className="rounded-full border border-border/60 bg-card px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
              >
                {p}
              </button>
            ))}
          </div>
        </section>
      </main>

      {/* Side panel for contextual Sera answers */}
      <Sheet open={panelOpen} onOpenChange={setPanelOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2 font-serif">
              <Sparkles className="h-4 w-4 text-primary" />
              {panelTitle}
            </SheetTitle>
            {panelPrompt && (
              <SheetDescription className="text-xs italic">
                "{panelPrompt}"
              </SheetDescription>
            )}
          </SheetHeader>
          <div className="mt-5">
            {panelLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Sera is thinking…
              </div>
            ) : panelError ? (
              <p className="text-sm text-destructive">{panelError}</p>
            ) : panelAnswer ? (
              <div className="prose prose-sm max-w-none text-sm leading-relaxed text-foreground prose-p:my-2 prose-li:my-0.5 prose-strong:text-foreground">
                <ReactMarkdown>{panelAnswer}</ReactMarkdown>
              </div>
            ) : null}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function KpiTile({
  icon: Icon,
  label,
  value,
  hint,
  tone = "neutral",
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  hint: string;
  tone?: "neutral" | "good" | "warn";
}) {
  const toneCls =
    tone === "good"
      ? "border-success/30 bg-success/5"
      : tone === "warn"
        ? "border-warning/40 bg-warning/5"
        : "border-border/60 bg-card";
  return (
    <div className={`rounded-3xl border p-4 md:p-5 ${toneCls}`}>
      <div className="mb-2 flex items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="font-serif text-2xl font-semibold text-foreground num">
        {value}
      </div>
      <div className="mt-1 text-xs text-muted-foreground">{hint}</div>
    </div>
  );
}

function PortfolioRowCard({ row }: { row: PortfolioRow }) {
  const { hotel, filledCount, thisMonth, co2eThis, co2eChange } = row;
  const total = FIELD_KEYS.length;
  const status =
    filledCount === total ? "done" : filledCount > 0 ? "started" : "todo";
  const StatusIcon =
    status === "done" ? CheckCircle2 : status === "started" ? Loader2 : Circle;
  const statusTone =
    status === "done"
      ? "text-success"
      : status === "started"
        ? "text-primary"
        : "text-muted-foreground";

  return (
    <li>
      <Link
        to="/easy/workspace"
        onClick={() => setActiveHotelId(hotel.id)}
        className="group flex items-center gap-4 rounded-2xl border border-border/60 bg-card p-4 transition hover:border-primary/40 hover:shadow-sm md:p-5"
      >
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Building2 className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate font-serif text-lg font-semibold text-foreground">
              {hotel.name}
            </h3>
            <span
              className={`inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium ${statusTone}`}
            >
              <StatusIcon className="h-3 w-3" />
              {status === "done"
                ? "Logged"
                : status === "started"
                  ? `${filledCount}/${total} fields`
                  : "Not started"}
            </span>
          </div>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {hotel.region} · {hotel.rooms} rooms · {hotel.star_rating}★
          </p>
        </div>
        <div className="hidden text-right sm:block">
          <div className="text-xs text-muted-foreground">CO₂e</div>
          <div className="font-serif text-base font-semibold text-foreground num">
            {thisMonth ? `${formatNumber(Math.round(co2eThis))} kg` : "—"}
          </div>
          {co2eChange !== null && (
            <div
              className={`mt-0.5 inline-flex items-center gap-0.5 text-[10px] font-medium ${
                co2eChange <= 0 ? "text-success" : "text-warning"
              }`}
            >
              {co2eChange <= 0 ? (
                <TrendingDown className="h-2.5 w-2.5" />
              ) : (
                <TrendingUp className="h-2.5 w-2.5" />
              )}
              {co2eChange > 0 ? "+" : ""}
              {co2eChange.toFixed(0)}%
            </div>
          )}
        </div>
        <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-foreground" />
      </Link>
    </li>
  );
}

function MoverCard({
  label,
  row,
  tone,
  onAsk,
}: {
  label: string;
  row: PortfolioRow | undefined;
  tone: "good" | "warn";
  onAsk: () => void;
}) {
  if (!row || row.co2eChange === null) {
    return (
      <div className="rounded-2xl border border-dashed border-border/60 bg-background p-4 text-sm text-muted-foreground">
        <div className="text-[10px] uppercase tracking-wider">{label}</div>
        <div className="mt-1">Need a 2nd month of data.</div>
      </div>
    );
  }
  const change = row.co2eChange;
  const Tone = tone === "good" ? TrendingDown : TrendingUp;
  const toneCls =
    tone === "good"
      ? "border-success/30 bg-success/5"
      : "border-warning/40 bg-warning/5";
  const toneText = tone === "good" ? "text-success" : "text-warning";
  return (
    <div className={`rounded-2xl border p-4 ${toneCls}`}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${toneText}`}
        >
          <Tone className="h-3 w-3" />
          {change > 0 ? "+" : ""}
          {change.toFixed(0)}%
        </span>
      </div>
      <div className="font-serif text-lg font-semibold text-foreground">
        {row.hotel.name}
      </div>
      <div className="mt-0.5 text-xs text-muted-foreground">
        {row.hotel.region} · {row.hotel.star_rating}★
      </div>
      <div className="mt-3 flex items-center gap-2">
        <Link
          to="/easy/workspace"
          onClick={() => setActiveHotelId(row.hotel.id)}
          className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-background px-3 py-1.5 text-xs font-medium text-foreground transition hover:border-primary/40"
        >
          Open workspace
          <ArrowRight className="h-3 w-3" />
        </Link>
        <button
          type="button"
          onClick={onAsk}
          className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-background px-3 py-1.5 text-xs font-medium text-foreground transition hover:border-primary/60 hover:bg-primary/5"
        >
          <Sparkles className="h-3 w-3 text-primary" />
          Ask Sera why
        </button>
      </div>
    </div>
  );
}

function TodoChecklist({
  rows,
  monthLabel,
}: {
  rows: PortfolioRow[];
  monthLabel: string;
}) {
  const todos = rows.filter((r) => r.missingFields.length > 0);
  const completed = rows.length - todos.length;

  if (todos.length === 0) {
    return (
      <section className="mb-10 rounded-3xl border border-success/30 bg-success/5 p-5 md:p-6">
        <div className="mb-1 flex items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-success">
          <CheckCircle2 className="h-3.5 w-3.5" />
          What to do next
        </div>
        <h2 className="font-serif text-xl font-semibold text-foreground">
          You're all caught up for {monthLabel}.
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Every hotel has its numbers in. Sera will keep watching for trends.
        </p>
      </section>
    );
  }

  return (
    <section className="mb-10 rounded-3xl border border-primary/25 bg-primary/5 p-5 md:p-6">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <div className="mb-1 flex items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-primary">
            <ListChecks className="h-3.5 w-3.5" />
            What to do next
          </div>
          <h2 className="font-serif text-xl font-semibold text-foreground md:text-2xl">
            {todos.length} {todos.length === 1 ? "hotel needs" : "hotels need"} numbers for {monthLabel}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Tap a hotel to jump straight into its workspace and finish logging.
          </p>
        </div>
        <span className="hidden shrink-0 rounded-full border border-border/60 bg-background px-2.5 py-1 text-[11px] font-medium text-muted-foreground sm:inline-flex">
          {completed}/{rows.length} done
        </span>
      </div>

      <ul className="space-y-2">
        {todos.map((r) => (
          <TodoChecklistRow key={r.hotel.id} row={r} />
        ))}
      </ul>
    </section>
  );
}

function TodoChecklistRow({ row }: { row: PortfolioRow }) {
  const { hotel, missingFields, filledCount } = row;
  const total = FIELD_KEYS.length;
  const isFresh = filledCount === 0;
  const visible = missingFields.slice(0, 3);
  const extra = missingFields.length - visible.length;

  return (
    <li>
      <Link
        to="/easy/workspace"
        onClick={() => setActiveHotelId(hotel.id)}
        aria-label={`Open ${hotel.name} workspace to add ${missingFields.length} missing fields`}
        className="group flex items-center gap-3 rounded-2xl border border-border/60 bg-background p-3 transition hover:border-primary/50 hover:bg-card md:p-4"
      >
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 ${
            isFresh
              ? "border-muted-foreground/30 text-muted-foreground"
              : "border-primary/40 text-primary"
          }`}
          aria-hidden
        >
          {isFresh ? (
            <Circle className="h-3.5 w-3.5" />
          ) : (
            <span className="text-[10px] font-semibold tabular-nums">
              {filledCount}/{total}
            </span>
          )}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="truncate font-medium text-foreground">{hotel.name}</span>
            <span className="text-[11px] text-muted-foreground">
              {isFresh ? "Nothing logged yet" : `${missingFields.length} missing`}
            </span>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {visible.map((k) => {
              const meta = FIELD_META[k];
              const Icon = meta.Icon;
              return (
                <span
                  key={k}
                  className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-card px-2 py-0.5 text-[10.5px] font-medium text-muted-foreground"
                >
                  <Icon className="h-3 w-3" />
                  {meta.label}
                </span>
              );
            })}
            {extra > 0 && (
              <span className="inline-flex items-center rounded-full border border-border/60 bg-card px-2 py-0.5 text-[10.5px] font-medium text-muted-foreground">
                +{extra} more
              </span>
            )}
          </div>
        </div>

        <span className="hidden shrink-0 items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-[11px] font-semibold text-primary-foreground transition group-hover:bg-primary/90 sm:inline-flex">
          Log now
          <ChevronRight className="h-3 w-3" />
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-foreground sm:hidden" />
      </Link>
    </li>
  );
}
