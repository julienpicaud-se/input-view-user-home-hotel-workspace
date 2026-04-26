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
} from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getActiveHotelId, type Hotel, type MonthlyEntry } from "@/lib/hotel";
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
  generateInsights,
  sendAssistantMessage,
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
  const [hotel, setHotel] = React.useState<Hotel | null>(null);
  const [entries, setEntries] = React.useState<MonthlyEntry[]>([]);
  const [insights, setInsights] = React.useState<Insight[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [insightsLoading, setInsightsLoading] = React.useState(true);
  const [chatInput, setChatInput] = React.useState("");
  const [chatHistory, setChatHistory] = React.useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [chatLoading, setChatLoading] = React.useState(false);

  React.useEffect(() => {
    void (async () => {
      const hotelId = getActiveHotelId();
      const [{ data: h }, { data: e }] = await Promise.all([
        supabase.from("hotels").select("*").eq("id", hotelId).maybeSingle(),
        supabase
          .from("monthly_entries")
          .select("*")
          .eq("hotel_id", hotelId)
          .order("year", { ascending: true })
          .order("month", { ascending: true }),
      ]);
      setHotel(h as Hotel | null);
      setEntries((e as MonthlyEntry[]) ?? []);
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

  async function sendChat() {
    const msg = chatInput.trim();
    if (!msg || chatLoading) return;
    setChatInput("");
    setChatHistory((h) => [...h, { role: "user", content: msg }]);
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
          </section>

          {/* Per-utility cards */}
          <section className="mb-10">
            <h2 className="mb-4 font-serif text-xl font-semibold text-foreground md:text-2xl">
              Where the energy went
            </h2>
            <ul className="space-y-3">
              {summaries.map((s) => (
                <UtilityRow key={s.key} summary={s} />
              ))}
            </ul>
          </section>

          {/* AI insights */}
          <section className="mb-10 rounded-3xl border border-border/60 bg-card p-5 md:p-6">
            <div className="mb-4 flex items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
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
                {insights.slice(0, 4).map((ins, i) => (
                  <li
                    key={i}
                    className="rounded-2xl border border-border/60 bg-background p-4"
                  >
                    <div className="text-sm font-semibold text-foreground">
                      {ins.title}
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{ins.body}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Ask Sera mini-chat */}
          <section className="mb-10 rounded-3xl border border-border/60 bg-card p-5 md:p-6">
            <div className="mb-3 flex items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
              <MessageCircle className="h-3.5 w-3.5 text-primary" />
              Ask Sera anything
            </div>

            {chatHistory.length > 0 && (
              <div className="mb-4 space-y-2 max-h-80 overflow-y-auto pr-1">
                {chatHistory.map((m, i) => (
                  <div
                    key={i}
                    className={
                      m.role === "user"
                        ? "ml-auto max-w-[85%] rounded-2xl bg-primary px-3 py-2 text-sm text-primary-foreground"
                        : "max-w-[85%] rounded-2xl border border-border/60 bg-background px-3 py-2 text-sm text-foreground"
                    }
                  >
                    {m.content}
                  </div>
                ))}
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

            {chatHistory.length === 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {[
                  "How can I lower electricity?",
                  "How do I compare to similar hotels?",
                  "What's my biggest opportunity?",
                ].map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setChatInput(p)}
                    className="rounded-full border border-border/60 bg-background px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    {p}
                  </button>
                ))}
              </div>
            )}
          </section>

          {/* Deep links to classic */}
          <section className="mb-10 grid gap-3 sm:grid-cols-2">
            <DeepLink
              href="/workspace"
              search={{ tab: "analyze" } as never}
              icon={BarChart3}
              title="See the full charts"
              subtitle="Switches to the Classic view, just for this page."
            />
            <DeepLink
              href="/workspace"
              search={{ tab: "benchmarks" } as never}
              icon={Users}
              title="Compare to peers"
              subtitle="Detailed peer cohort and trend lines."
            />
          </section>
        </>
      )}
    </SimpleShell>
  );
}

function UtilityRow({ summary }: { summary: UtilitySummary }) {
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

function DeepLink({
  href,
  search,
  icon: Icon,
  title,
  subtitle,
}: {
  href: "/workspace";
  search: never;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle: string;
}) {
  return (
    <Link
      to={href}
      search={search}
      className="group flex items-start gap-3 rounded-2xl border border-border/60 bg-card p-4 transition-all hover:border-primary/40 hover:shadow-sm"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground">
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-foreground">{title}</div>
        <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
      </div>
      <ArrowRight className="mt-2 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}
