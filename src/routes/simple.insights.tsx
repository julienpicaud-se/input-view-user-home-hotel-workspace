import { createFileRoute, Link } from "@tanstack/react-router";
import * as React from "react";
import {
  Sparkles,
  TrendingUp,
  TrendingDown,
  Bolt,
  Flame,
  Droplets,
  Trash2,
  Loader2,
  ArrowRight,
  MessageCircle,
  Users,
  Send,
  CalendarRange,
  Lightbulb,
  AlertTriangle,
  CheckCircle2,
  Wand2,
} from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import ReactMarkdown from "react-markdown";
import { supabase } from "@/integrations/supabase/client";
import { getActiveHotelId, type Hotel, type MonthlyEntry } from "@/lib/hotel";
import { DEMO_PROFILE_ID, type UserProfile } from "@/lib/user-profile";
import { MONTH_NAMES, MONTH_SHORT, formatNumber, pctChange, formatPct, calculateCO2e } from "@/lib/format";
import {
  getPeerStats,
  getPeerRank,
  getPeerCohortSize,
  type Utility,
  type PeerStats,
} from "@/lib/peer-benchmarks";
import { SimpleShell } from "@/components/simple-shell";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  generateBriefing,
  generateInsights,
  sendAssistantMessage,
  type BriefingPayload,
  type Insight,
} from "@/server/assistant.functions";

export const Route = createFileRoute("/simple/insights")({
  head: () => ({
    meta: [
      { title: "How am I doing? — RA+ (Simple)" },
      {
        name: "description",
        content:
          "A friendly snapshot of how your hotel is performing, with peer comparison and AI-suggested actions.",
      },
    ],
  }),
  component: SimpleInsightsPage,
});

interface UtilitySummary {
  key: "electricity_kwh" | "gas_kwh" | "water_m3" | "waste_kg";
  label: string;
  unit: string;
  utility: Utility;
  Icon: React.ComponentType<{ className?: string }>;
  value: number | null;
  prev: number | null;
  intensity: number | null;
  rank: ReturnType<typeof getPeerRank> | null;
  stats: PeerStats | null;
}

function SimpleInsightsPage() {
  const callAssistant = useServerFn(sendAssistantMessage);
  const callBriefing = useServerFn(generateBriefing);
  const [hotel, setHotel] = React.useState<Hotel | null>(null);
  const [profile, setProfile] = React.useState<UserProfile | null>(null);
  const [entries, setEntries] = React.useState<MonthlyEntry[]>([]);
  const [insights, setInsights] = React.useState<Insight[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [insightsLoading, setInsightsLoading] = React.useState(true);
  const [briefing, setBriefing] = React.useState<BriefingPayload | null>(null);
  const [briefingLoading, setBriefingLoading] = React.useState(true);
  const [chatInput, setChatInput] = React.useState("");
  const [chatHistory, setChatHistory] = React.useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [chatLoading, setChatLoading] = React.useState(false);
  const chatScrollRef = React.useRef<HTMLDivElement | null>(null);

  // Side-panel "Ask Sera" state — used by per-utility / per-tip / per-card buttons
  // so users get an inline answer without losing their place on the page.
  const [panelOpen, setPanelOpen] = React.useState(false);
  const [panelTitle, setPanelTitle] = React.useState<string>("Sera");
  const [panelPrompt, setPanelPrompt] = React.useState<string>("");
  const [panelAnswer, setPanelAnswer] = React.useState<string | null>(null);
  const [panelLoading, setPanelLoading] = React.useState(false);
  const [panelError, setPanelError] = React.useState<string | null>(null);

  React.useEffect(() => {
    void (async () => {
      const hotelId = getActiveHotelId();
      const [{ data: h }, { data: e }, { data: p }] = await Promise.all([
        supabase.from("hotels").select("*").eq("id", hotelId).maybeSingle(),
        supabase
          .from("monthly_entries")
          .select("*")
          .eq("hotel_id", hotelId)
          .order("year", { ascending: true })
          .order("month", { ascending: true }),
        supabase
          .from("user_profiles")
          .select("*")
          .eq("id", DEMO_PROFILE_ID)
          .maybeSingle(),
      ]);
      setHotel(h as Hotel | null);
      setEntries((e as MonthlyEntry[]) ?? []);
      setProfile((p as UserProfile) ?? null);
      setLoading(false);
    })();
  }, []);

  React.useEffect(() => {
    if (loading) return;
    setInsightsLoading(true);
    generateInsights({ data: { hotelId: getActiveHotelId() } })
      .then((r) => setInsights(r.insights))
      .catch(() => setInsights([]))
      .finally(() => setInsightsLoading(false));
  }, [loading]);

  const firstName = (profile?.display_name?.split(" ")[0] || "there").trim();

  React.useEffect(() => {
    if (loading || !hotel) return;
    setBriefingLoading(true);
    callBriefing({
      data: { firstName, todos: [], issues: [] },
    })
      .then((res) => {
        if (res.ok) setBriefing(res.briefing);
      })
      .catch(() => {})
      .finally(() => setBriefingLoading(false));
  }, [loading, hotel, callBriefing, firstName]);

  React.useEffect(() => {
    chatScrollRef.current?.scrollTo({
      top: chatScrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [chatHistory, chatLoading]);

  const sorted = [...entries].sort((a, b) =>
    a.year !== b.year ? a.year - b.year : a.month - b.month
  );
  const latest = sorted[sorted.length - 1];
  const prev = sorted[sorted.length - 2];

  const filters = {
    sizeBand: hotel?.size_band ?? "medium",
    region: hotel?.region ?? "",
    starRating: hotel?.star_rating ?? 4,
  };

  const summaries: UtilitySummary[] = React.useMemo(() => {
    if (!latest) return [];
    const defs: { key: UtilitySummary["key"]; label: string; unit: string; utility: Utility; Icon: React.ComponentType<{ className?: string }> }[] = [
      { key: "electricity_kwh", label: "Electricity", unit: "kWh", utility: "electricity", Icon: Bolt },
      { key: "gas_kwh", label: "Gas", unit: "kWh", utility: "gas", Icon: Flame },
      { key: "water_m3", label: "Water", unit: "m³", utility: "water", Icon: Droplets },
      { key: "waste_kg", label: "Waste", unit: "kg", utility: "waste", Icon: Trash2 },
    ];
    return defs.map((d) => {
      const v = latest[d.key] as number | null;
      const pv = prev ? (prev[d.key] as number | null) : null;
      const rn = latest.occupied_room_nights;
      const intensity = v && rn ? v / rn : null;
      const stats = getPeerStats(d.utility, latest.month, filters);
      const rank = intensity !== null ? getPeerRank(intensity, stats) : null;
      return {
        key: d.key,
        label: d.label,
        unit: d.unit,
        utility: d.utility,
        Icon: d.Icon,
        value: v,
        prev: pv,
        intensity,
        rank,
        stats,
      };
    });
  }, [latest, prev, filters]);

  const monthLabel = latest ? `${MONTH_NAMES[latest.month - 1]} ${latest.year}` : "—";
  const co2eLatest = latest ? calculateCO2e(latest) : 0;
  const co2ePrev = prev ? calculateCO2e(prev) : 0;
  const co2Change = pctChange(co2eLatest || null, co2ePrev || null);
  const cohortSize = React.useMemo(() => getPeerCohortSize(filters), [filters]);
  const recentEntries = React.useMemo(
    () => [...sorted].reverse().slice(0, 6),
    [sorted],
  );

  async function sendChat(preset?: string) {
    const msg = (preset ?? chatInput).trim();
    if (!msg || chatLoading) return;
    if (!preset) setChatInput("");
    const newHistory = [...chatHistory, { role: "user" as const, content: msg }];
    setChatHistory(newHistory);
    setChatLoading(true);
    try {
      const res = await callAssistant({
        data: {
          message: msg,
          hotelId: getActiveHotelId(),
          history: chatHistory,
        },
      });
      const reply = res.ok ? res.content : "Sorry — I couldn't reach Sera just now. Try again?";
      setChatHistory((h) => [...h, { role: "assistant", content: reply }]);
    } catch {
      setChatHistory((h) => [
        ...h,
        { role: "assistant", content: "Sorry — I couldn't reach Sera just now. Try again?" },
      ]);
    } finally {
      setChatLoading(false);
    }
  }

  // Open the side panel and ask Sera a contextual question. Used by all the
  // small "Ask Sera about X" buttons across the page so the answer appears
  // beside the content the user clicked from instead of forcing them to scroll.
  async function askSeraAbout(prompt: string, title?: string) {
    setPanelTitle(title ?? "Sera");
    setPanelPrompt(prompt);
    setPanelAnswer(null);
    setPanelError(null);
    setPanelOpen(true);
    setPanelLoading(true);
    try {
      const res = await callAssistant({
        data: {
          message: prompt,
          hotelId: getActiveHotelId(),
          history: [],
        },
      });
      if (res.ok) setPanelAnswer(res.content);
      else setPanelError(res.error ?? "Sera couldn't answer just now.");
    } catch {
      setPanelError("Couldn't reach Sera. Please try again.");
    } finally {
      setPanelLoading(false);
    }
  }

  return (
    <SimpleShell
      title="How am I doing?"
      subtitle={
        loading
          ? "Reading your numbers…"
          : !latest
            ? "Add some data first and we'll show you trends and tips here."
            : `Snapshot for ${hotel?.name ?? "your hotel"} · ${monthLabel}`
      }
      showBack
      help="The colour next to each utility tells you how you compare to similar hotels: green is great, amber is around average, red means there's room to save."
    >
      {!loading && !latest && (
        <div className="rounded-3xl border border-dashed border-border/60 bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">No monthly data yet for this hotel.</p>
          <Link
            to="/simple/log"
            className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Add this month
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      )}

      {!loading && latest && (
        <>
          {/* Sera hero briefing — feels like Sera is right there with you */}
          <section className="mb-8 overflow-hidden rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/8 via-card to-accent/12 p-5 md:p-6">
            <div className="pointer-events-none absolute" />
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
                <Sparkles className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                  Sera · Reading your {monthLabel} numbers
                </div>
                {briefingLoading && !briefing ? (
                  <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Looking through your data…
                  </div>
                ) : briefing ? (
                  <>
                    <p className="mt-1 font-serif text-xl leading-snug text-foreground md:text-2xl">
                      {briefing.headline}
                    </p>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground md:text-[15px]">
                      {briefing.summary}
                    </p>
                    {briefing.focus && (
                      <div className="mt-3 flex items-start gap-2 rounded-2xl bg-primary/5 px-3 py-2.5 text-sm text-foreground">
                        <Wand2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                        <span>
                          <span className="font-medium">Focus this month: </span>
                          {briefing.focus}
                        </span>
                      </div>
                    )}
                    {(briefing.questions?.length ?? 0) > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {(briefing.questions ?? []).slice(0, 3).map((q) => (
                          <button
                            key={q}
                            type="button"
                            onClick={() => askSeraAbout(q)}
                            className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-background/70 px-2.5 py-1 text-xs text-foreground transition hover:border-primary/60 hover:bg-primary/5"
                          >
                            <MessageCircle className="h-3 w-3" />
                            {q}
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <p className="mt-2 text-sm text-muted-foreground">
                    Sera will share a personalised briefing here once your data is in.
                  </p>
                )}
              </div>
            </div>
          </section>

          {/* Headline carbon */}
          <section className="mb-8 rounded-3xl border border-border/60 bg-card p-5 md:p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                  CO₂ this month
                </div>
                <div className="mt-1 font-serif text-4xl font-semibold text-foreground num md:text-5xl">
                  {formatNumber(Math.round(co2eLatest))}{" "}
                  <span className="font-sans text-base font-medium text-muted-foreground">
                    kg CO₂e
                  </span>
                </div>
              </div>
              {co2Change !== null && (
                <div
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium ${
                    co2Change < 0
                      ? "bg-success/15 text-success"
                      : "bg-warning/15 text-warning"
                  }`}
                >
                  {co2Change < 0 ? (
                    <TrendingDown className="h-3.5 w-3.5" />
                  ) : (
                    <TrendingUp className="h-3.5 w-3.5" />
                  )}
                  {formatPct(co2Change)}
                </div>
              )}
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              {co2Change === null
                ? "Add another month to see how you're trending."
                : co2Change < 0
                  ? `That's ${formatPct(co2Change)} less than last month. Keep it up.`
                  : `That's ${formatPct(co2Change)} more than last month. Have a look at where the increase came from below.`}
            </p>
            {co2Change !== null && (
              <button
                type="button"
                onClick={() =>
                  askSeraAbout(
                    co2Change < 0
                      ? `My CO₂ dropped ${formatPct(co2Change)} from last month — what drove the improvement and how do I keep it going?`
                      : `My CO₂ went up ${formatPct(co2Change)} this month. What likely caused it and what should I do first?`,
                    "Sera on your CO₂",
                  )
                }
                className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-background px-3 py-1.5 text-xs font-medium text-primary transition hover:bg-primary/5"
              >
                <Sparkles className="h-3 w-3" />
                Ask Sera why
              </button>
            )}
          </section>

          {/* Per-utility cards */}
          <section className="mb-10">
            <div className="mb-4 flex items-end justify-between gap-2">
              <h2 className="font-serif text-xl font-semibold text-foreground md:text-2xl">
                Where the energy went
              </h2>
              <span className="text-xs text-muted-foreground">Tap a row to ask Sera</span>
            </div>
            <ul className="space-y-3">
              {summaries.map((s) => (
                <UtilityRow
                  key={s.key}
                  summary={s}
                  monthLabel={monthLabel}
                  onAsk={askSeraAbout}
                />
              ))}
            </ul>
          </section>

          {/* AI insights — toned cards with per-tip "ask Sera more" */}
          <section className="mb-10 rounded-3xl border border-border/60 bg-card p-5 md:p-6">
            <div className="mb-4 flex items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
              <Lightbulb className="h-3.5 w-3.5 text-primary" />
              Tips from Sera
            </div>
            {insightsLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Looking for things you can do…
              </div>
            ) : insights.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No specific tips yet — log a few more months for sharper advice.
              </p>
            ) : (
              <ul className="space-y-3">
                {insights.slice(0, 4).map((ins, i) => {
                  const toneStyles =
                    ins.tone === "positive"
                      ? "border-success/30 bg-success/5"
                      : ins.tone === "warning"
                        ? "border-warning/40 bg-warning/5"
                        : "border-border/60 bg-background";
                  const ToneIcon =
                    ins.tone === "positive"
                      ? CheckCircle2
                      : ins.tone === "warning"
                        ? AlertTriangle
                        : Lightbulb;
                  const toneIconColor =
                    ins.tone === "positive"
                      ? "text-success"
                      : ins.tone === "warning"
                        ? "text-warning"
                        : "text-primary";
                  return (
                    <li key={i} className={`rounded-2xl border p-4 ${toneStyles}`}>
                      <div className="flex items-start gap-2.5">
                        <ToneIcon className={`mt-0.5 h-4 w-4 shrink-0 ${toneIconColor}`} />
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-semibold text-foreground">
                            {ins.title}
                          </div>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {ins.body}
                          </p>
                          <button
                            type="button"
                            onClick={() =>
                              askSeraAbout(
                                `Tell me more about this tip: "${ins.title}". How would I actually do it at ${hotel?.name ?? "my hotel"} this month, step by step?`,
                                `Sera · ${ins.title}`,
                              )
                            }
                            className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                          >
                            <Sparkles className="h-3 w-3" />
                            Ask Sera how to do this
                          </button>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* Ask Sera mini-chat — feels like a real conversation */}
          <section
            id="ask-sera"
            className="mb-10 overflow-hidden rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/5 via-card to-card p-5 md:p-6"
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <Sparkles className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                    Sera · Chat
                  </div>
                  <div className="font-serif text-base font-semibold text-foreground">
                    Ask anything about your hotel
                  </div>
                </div>
              </div>
              {chatHistory.length > 0 && (
                <button
                  type="button"
                  onClick={() => setChatHistory([])}
                  className="text-[11px] text-muted-foreground hover:text-foreground"
                >
                  Clear
                </button>
              )}
            </div>

            {chatHistory.length === 0 && !chatLoading && (
              <div className="mb-3 rounded-2xl border border-border/50 bg-background/60 p-3 text-sm text-muted-foreground">
                Hi {firstName} — ask me anything about your numbers,
                comparisons or what to try next. I'll explain in plain English.
              </div>
            )}

            {(chatHistory.length > 0 || chatLoading) && (
              <div
                ref={chatScrollRef}
                className="mb-4 max-h-96 space-y-3 overflow-y-auto rounded-2xl border border-border/50 bg-background/40 p-3"
              >
                {chatHistory.map((m, i) => (
                  <div
                    key={i}
                    className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={
                        m.role === "user"
                          ? "max-w-[85%] rounded-2xl bg-primary px-3 py-2 text-sm text-primary-foreground whitespace-pre-wrap"
                          : "max-w-[88%] rounded-2xl border border-border/60 bg-card px-3 py-2 text-sm text-foreground"
                      }
                    >
                      {m.role === "user" ? (
                        m.content
                      ) : (
                        <div className="prose prose-sm max-w-none prose-p:my-1.5 prose-p:text-foreground prose-strong:text-foreground prose-li:my-0.5 prose-ul:my-1.5">
                          <ReactMarkdown>{m.content}</ReactMarkdown>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {chatLoading && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Sera is thinking…
                  </div>
                )}
              </div>
            )}

            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <textarea
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void sendChat();
                  }
                }}
                rows={2}
                placeholder="e.g. why was my electricity higher this month?"
                className="flex-1 resize-none rounded-2xl border border-input bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <button
                type="button"
                onClick={() => void sendChat()}
                disabled={chatLoading || !chatInput.trim()}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {chatLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                Send
              </button>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {[
                "What's my biggest savings opportunity?",
                "How do I compare to similar hotels?",
                "Which utility should I focus on first?",
                "Suggest 3 quick wins for next month",
              ].map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => askSeraAbout(p)}
                  disabled={chatLoading}
                  className="rounded-full border border-border/60 bg-background px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {p}
                </button>
              ))}
            </div>
          </section>

          {/* Inline peer comparison detail (replaces the old deep links to Classic) */}
          <section className="mb-10 rounded-3xl border border-border/60 bg-card p-5 md:p-6">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                  <Users className="h-3.5 w-3.5 text-primary" />
                  Compare to peers
                </div>
                <h2 className="mt-1 font-serif text-xl font-semibold text-foreground">
                  How you stack up
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  vs {cohortSize} similar {hotel?.size_band ?? ""} hotels
                  {hotel?.region ? ` in ${hotel.region}` : ""} ·{" "}
                  {hotel?.star_rating ?? 4}★
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  askSeraAbout(
                    `How do I compare to similar ${hotel?.size_band ?? ""} hotels${hotel?.region ? ` in ${hotel.region}` : ""}? Where am I doing well and where am I behind?`,
                    "Sera on peer comparison",
                  )
                }
                className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-background px-3 py-1.5 text-xs font-medium text-primary transition hover:bg-primary/5"
              >
                <Sparkles className="h-3 w-3" />
                Ask Sera
              </button>
            </div>
            {latest?.occupied_room_nights ? (
              <ul className="space-y-3">
                {summaries.map((s) => (
                  <PeerCompareRow key={s.key} summary={s} />
                ))}
              </ul>
            ) : (
              <p className="rounded-2xl border border-dashed border-border/60 bg-background p-4 text-sm text-muted-foreground">
                Add the room-nights for {monthLabel} so we can compare you per
                guest. Without occupancy we can only show totals.
              </p>
            )}
          </section>

          {/* Last 6 months — text-first recap so users don't need to hop to Classic for charts */}
          <section className="mb-10 rounded-3xl border border-border/60 bg-card p-5 md:p-6">
            <div className="mb-4 flex items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
              <CalendarRange className="h-3.5 w-3.5 text-primary" />
              Last few months
            </div>
            {recentEntries.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                We'll show your trend here once you've logged a couple of months.
              </p>
            ) : (
              <ul className="space-y-2">
                {recentEntries.map((e, i) => {
                  const next = recentEntries[i + 1];
                  const co2 = calculateCO2e(e);
                  const co2Prev = next ? calculateCO2e(next) : null;
                  const change = pctChange(co2 || null, co2Prev);
                  return (
                    <li
                      key={e.id}
                      className="flex items-center justify-between gap-3 rounded-2xl border border-border/60 bg-background px-4 py-3"
                    >
                      <div>
                        <div className="font-serif text-sm font-medium text-foreground">
                          {MONTH_SHORT[e.month - 1]} {e.year}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {formatNumber(Math.round(co2))} kg CO₂e
                        </div>
                      </div>
                      {change !== null && (
                        <div
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${
                            change < 0
                              ? "bg-success/15 text-success"
                              : "bg-warning/15 text-warning"
                          }`}
                        >
                          {change < 0 ? (
                            <TrendingDown className="h-3.5 w-3.5" />
                          ) : (
                            <TrendingUp className="h-3.5 w-3.5" />
                          )}
                          {formatPct(change)}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            <p className="mt-3 text-center text-[11px] text-muted-foreground">
              Want to fix a number?{" "}
              <Link
                to="/simple/settings"
                className="text-primary underline-offset-2 hover:underline"
              >
                Edit past months
              </Link>{" "}
              in settings.
            </p>
          </section>
        </>
      )}
    </SimpleShell>
  );
}

function UtilityRow({
  summary,
  monthLabel,
  onAsk,
}: {
  summary: UtilitySummary;
  monthLabel: string;
  onAsk: (prompt: string, title?: string) => void;
}) {
  const { Icon, label, value, prev, unit, rank } = summary;
  const change = pctChange(value, prev);
  // rank is a percentile where lower = better.
  const bucket: "top" | "average" | "bottom" | null =
    rank === null
      ? null
      : rank <= 30
        ? "top"
        : rank <= 65
          ? "average"
          : "bottom";
  const tone =
    bucket === "top" ? "good" : bucket === "average" ? "ok" : bucket === "bottom" ? "bad" : "neutral";

  const toneStyles =
    tone === "good"
      ? "border-success/30 bg-success/5"
      : tone === "ok"
        ? "border-border/60 bg-card"
        : tone === "bad"
          ? "border-warning/40 bg-warning/5"
          : "border-border/60 bg-card";

  const dotStyles =
    tone === "good"
      ? "bg-success/15 text-success"
      : tone === "bad"
        ? "bg-warning/15 text-warning"
        : "bg-primary/10 text-primary";

  const askPrompt =
    bucket === "bottom"
      ? `My ${label.toLowerCase()} for ${monthLabel} looks high vs peers (${value !== null ? `${formatNumber(value)} ${unit}` : "no value"}). What likely caused it and what should I try first?`
      : bucket === "top"
        ? `My ${label.toLowerCase()} for ${monthLabel} looks better than most peers. What's working and how do I keep it going?`
        : `Tell me about my ${label.toLowerCase()} for ${monthLabel} (${value !== null ? `${formatNumber(value)} ${unit}` : "no value"}) — anything I should do?`;

  return (
    <li className={`flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center sm:gap-4 ${toneStyles}`}>
      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${dotStyles}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-semibold text-foreground">{label}</span>
          {bucket && (
            <span className="text-xs text-muted-foreground">
              {bucket === "top"
                ? "Better than most peers"
                : bucket === "average"
                  ? "About average"
                  : "Above average — room to save"}
            </span>
          )}
        </div>
        <div className="mt-0.5 text-xs text-muted-foreground">
          {value !== null
            ? `${formatNumber(value)} ${unit}${prev !== null ? ` · last month ${formatNumber(prev)} ${unit}` : ""}`
            : "Not logged"}
        </div>
        <button
          type="button"
          onClick={() => onAsk(askPrompt)}
          className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
        >
          <Sparkles className="h-3 w-3" />
          Ask Sera about {label.toLowerCase()}
        </button>
      </div>
      {change !== null && (
        <div
          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${
            change < 0 ? "bg-success/15 text-success" : "bg-warning/15 text-warning"
          }`}
        >
          {change < 0 ? (
            <TrendingDown className="h-3.5 w-3.5" />
          ) : (
            <TrendingUp className="h-3.5 w-3.5" />
          )}
          {formatPct(change)}
        </div>
      )}
    </li>
  );
}

/**
 * Plain-language peer comparison row: shows your intensity, the peer median
 * and the best-in-class as small CSS bars (no chart library needed).
 */
function PeerCompareRow({ summary }: { summary: UtilitySummary }) {
  const { Icon, label, intensity, unit, stats, rank } = summary;
  if (!stats || intensity === null) {
    return (
      <li className="flex items-center gap-3 rounded-2xl border border-border/60 bg-background p-4 text-sm text-muted-foreground">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground">
          <Icon className="h-4 w-4" />
        </div>
        <div>{label} — not enough data to compare yet.</div>
      </li>
    );
  }
  const max = Math.max(intensity, stats.p90) * 1.05;
  const yourPct = (intensity / max) * 100;
  const medianPct = (stats.median / max) * 100;
  const bestPct = (stats.bestInClass / max) * 100;
  const bucket: "top" | "average" | "bottom" =
    rank !== null && rank <= 30
      ? "top"
      : rank !== null && rank <= 65
        ? "average"
        : "bottom";
  const youColor =
    bucket === "top"
      ? "bg-success"
      : bucket === "average"
        ? "bg-primary"
        : "bg-warning";
  const verdict =
    bucket === "top"
      ? "Better than most peers"
      : bucket === "average"
        ? "About average"
        : "Above average — room to save";

  return (
    <li className="rounded-2xl border border-border/60 bg-background p-4">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-foreground">{label}</div>
          <div className="text-xs text-muted-foreground">{verdict}</div>
        </div>
        <div className="text-right text-xs text-muted-foreground">
          <span className="block font-semibold text-foreground">
            {intensity.toFixed(2)} {unit}/night
          </span>
          <span>
            peer median {stats.median.toFixed(2)} · best {stats.bestInClass.toFixed(2)}
          </span>
        </div>
      </div>
      {/* Three stacked bars: best-in-class | peer median | you */}
      <div className="mt-3 space-y-1.5">
        <BarRow label="Best 10%" widthPct={bestPct} color="bg-success/60" />
        <BarRow label="Peer median" widthPct={medianPct} color="bg-muted-foreground/40" />
        <BarRow label="You" widthPct={yourPct} color={youColor} bold />
      </div>
    </li>
  );
}

function BarRow({
  label,
  widthPct,
  color,
  bold,
}: {
  label: string;
  widthPct: number;
  color: string;
  bold?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <span
        className={`w-20 shrink-0 text-[10px] uppercase tracking-wider ${
          bold ? "font-semibold text-foreground" : "text-muted-foreground"
        }`}
      >
        {label}
      </span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full ${color}`}
          style={{ width: `${Math.min(100, Math.max(2, widthPct))}%` }}
        />
      </div>
    </div>
  );
}
