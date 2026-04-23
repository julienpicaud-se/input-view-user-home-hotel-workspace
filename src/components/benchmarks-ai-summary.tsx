import * as React from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  Info,
  Loader2,
  MessageCircle,
  Send,
  Sparkles,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { sendAssistantMessage } from "@/server/assistant.functions";
import { getActiveHotelId, type Hotel, type MonthlyEntry } from "@/lib/hotel";
import { MONTH_NAMES } from "@/lib/format";
import {
  getPeerRank,
  getPeerStats,
  type Utility,
} from "@/lib/peer-benchmarks";

interface ChatMsg {
  role: "user" | "assistant";
  content: string;
}

interface UtilityDef {
  key: Utility;
  label: string;
  unit: string;
  entryKey: keyof MonthlyEntry;
}

const UTILITIES: UtilityDef[] = [
  { key: "electricity", label: "Electricity", unit: "kWh/room-night", entryKey: "electricity_kwh" },
  { key: "gas", label: "Gas", unit: "kWh/room-night", entryKey: "gas_kwh" },
  { key: "water", label: "Water", unit: "m³/room-night", entryKey: "water_m3" },
  { key: "waste", label: "Waste", unit: "kg/room-night", entryKey: "waste_kg" },
];

interface Driver {
  key: Utility;
  label: string;
  rank: number; // 0-100 (lower = better)
  position: number; // 1..cohortSize
  tone: "positive" | "negative";
}

export function BenchmarksAiSummary({
  hotel,
  entries,
  cohortSize,
}: {
  hotel: Hotel;
  entries: MonthlyEntry[];
  cohortSize: number;
}) {
  const send = useServerFn(sendAssistantMessage);
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const [chatTurns, setChatTurns] = React.useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = React.useState("");
  const [chatPending, setChatPending] = React.useState(false);

  React.useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [chatTurns, chatPending]);

  const filters = {
    sizeBand: hotel.size_band,
    region: hotel.region,
    starRating: hotel.star_rating,
  };

  const latest = entries[entries.length - 1];

  const summary = React.useMemo(() => {
    if (!latest) {
      return {
        headline: "Log this month's data to unlock your peer summary.",
        body: "Once you've logged electricity, gas, water and waste, we'll show how each utility ranks against similar hotels in your cohort.",
        drivers: [] as Driver[],
        bestDriver: null as Driver | null,
        worstDriver: null as Driver | null,
      };
    }

    const drivers: Driver[] = UTILITIES.map((u) => {
      const value = latest[u.entryKey] as number | null;
      if (
        value === null ||
        value === undefined ||
        !latest.occupied_room_nights ||
        latest.occupied_room_nights <= 0
      ) {
        return null;
      }
      const intensity = value / latest.occupied_room_nights;
      const stats = getPeerStats(u.key, latest.month, filters);
      const rank = getPeerRank(intensity, stats); // 0 = best
      const position = Math.max(1, Math.round((rank / 100) * cohortSize));
      // Top quartile (rank ≤ 25) is positive; bottom quartile (rank ≥ 75) is negative
      const tone: "positive" | "negative" = rank <= 50 ? "positive" : "negative";
      return { key: u.key, label: u.label, rank, position, tone };
    }).filter((d): d is Driver => d !== null);

    if (drivers.length === 0) {
      return {
        headline: "Add occupancy + utility data to see your peer summary.",
        body: "Your latest month is missing the figures we need to compute peer-relative intensity. Log electricity, gas, water, waste and occupied room-nights for the most recent month.",
        drivers: [],
        bestDriver: null,
        worstDriver: null,
      };
    }

    const sorted = [...drivers].sort((a, b) => a.rank - b.rank);
    const best = sorted[0];
    const worst = sorted[sorted.length - 1];

    const monthLabel = `${MONTH_NAMES[latest.month - 1]} ${latest.year}`;

    let headline: string;
    if (best.rank <= 25 && worst.rank <= 50) {
      headline = `You're ahead of the pack in ${monthLabel} — ${best.label.toLowerCase()} is leading the cohort.`;
    } else if (worst.rank >= 75 && best.rank >= 50) {
      headline = `${monthLabel} is trailing your peers — ${worst.label.toLowerCase()} is the biggest gap.`;
    } else if (worst.rank >= 75) {
      headline = `Mixed picture in ${monthLabel} — strong on ${best.label.toLowerCase()}, weak on ${worst.label.toLowerCase()}.`;
    } else {
      headline = `You're sitting mid-pack in ${monthLabel} versus ${cohortSize} similar hotels.`;
    }

    const bestPhrase = `${best.label} ranks #${best.position} of ${cohortSize}`;
    const worstPhrase = `${worst.label} is #${worst.position} of ${cohortSize}`;
    const body =
      best.key === worst.key
        ? `${best.label} ranks #${best.position} of ${cohortSize} — log more utilities to broaden the comparison. Click a pill below to inspect the chart.`
        : `Strongest signal: ${bestPhrase}. Biggest gap: ${worstPhrase}. Click a pill below to inspect the chart.`;

    return {
      headline,
      body,
      drivers: [best, worst].filter((d, i, arr) => arr.findIndex((x) => x.key === d.key) === i),
      bestDriver: best,
      worstDriver: worst,
    };
  }, [latest, filters, cohortSize]);

  const monthLabel = latest
    ? `${MONTH_NAMES[latest.month - 1]} ${latest.year}`
    : "the latest month";

  const summaryContext = `Context — Peer benchmark summary for ${hotel.name} (${monthLabel}) vs ${cohortSize} similar Mediterranean hotels of ${hotel.size_band} rooms.\nHeadline: ${summary.headline}\nBody: ${summary.body}\nBest: ${summary.bestDriver ? `${summary.bestDriver.label} #${summary.bestDriver.position}/${cohortSize}` : "n/a"}.\nWorst: ${summary.worstDriver ? `${summary.worstDriver.label} #${summary.worstDriver.position}/${cohortSize}` : "n/a"}.`;

  const starters: string[] = [];
  if (summary.worstDriver) {
    starters.push(`Why is ${summary.worstDriver.label.toLowerCase()} lagging the cohort?`);
  }
  if (summary.bestDriver) {
    starters.push(`What's driving the strong ${summary.bestDriver.label.toLowerCase()} performance?`);
  }
  starters.push("Which 2 actions would move me up the rankings fastest?");
  starters.push(`Compare ${monthLabel} to the same month last year.`);

  async function handleAsk(text: string) {
    const trimmed = text.trim();
    if (!trimmed || chatPending) return;

    const history: ChatMsg[] = [];
    if (chatTurns.length === 0) {
      history.push({ role: "assistant", content: summaryContext });
    }
    history.push(...chatTurns);

    const userTurn: ChatMsg = { role: "user", content: trimmed };
    setChatTurns((t) => [...t, userTurn]);
    setChatInput("");
    setChatPending(true);

    try {
      const res = await send({
        data: {
          message: trimmed,
          history,
          hotelId: getActiveHotelId(),
        },
      });
      if (res.ok) {
        setChatTurns((t) => [...t, { role: "assistant", content: res.content }]);
      } else {
        toast.error(res.error);
        setChatTurns((t) => t.slice(0, -1));
      }
    } catch {
      toast.error("Something went wrong");
      setChatTurns((t) => t.slice(0, -1));
    } finally {
      setChatPending(false);
    }
  }

  const showChat = chatTurns.length > 0 || chatPending;

  return (
    <Card className="relative mb-6 overflow-hidden rounded-3xl border-border/70 bg-card/60 p-6 backdrop-blur-sm">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-accent/15 blur-3xl"
      />
      <div className="relative flex flex-col gap-4 md:flex-row md:items-start">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-secondary text-primary-foreground shadow-md">
          <Sparkles className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              AI summary
            </span>
            <span className="rounded-full bg-accent/20 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-accent-foreground">
              Auto
            </span>
          </div>
          <p className="mt-2 font-serif text-lg leading-snug text-foreground">
            {summary.headline}
          </p>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {summary.body}
          </p>

          {summary.drivers.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {summary.drivers.map((d) => (
                <span
                  key={d.key}
                  className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium ${
                    d.tone === "positive"
                      ? "border-primary/30 bg-primary/10 text-primary"
                      : "border-destructive/30 bg-destructive/10 text-destructive"
                  }`}
                >
                  {d.tone === "positive" ? (
                    <ArrowUpRight className="h-3 w-3" />
                  ) : (
                    <ArrowDownRight className="h-3 w-3" />
                  )}
                  {d.label} #{d.position} of {cohortSize}
                </span>
              ))}
            </div>
          )}

          {latest && summary.drivers.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-background/60 px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Info className="h-3 w-3" />
                    How this is calculated
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  align="start"
                  side="bottom"
                  className="w-[22rem] rounded-2xl border-border/70 p-4 text-xs leading-relaxed"
                >
                  <div className="mb-2 flex items-center gap-1.5">
                    <Info className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      How this is calculated
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    <p className="font-medium text-foreground">Peer ranking</p>
                    <p className="text-muted-foreground">
                      For each utility, we compute your intensity per occupied
                      room-night and place it in the distribution of{" "}
                      <span className="text-foreground">{cohortSize}</span>{" "}
                      similar Mediterranean hotels of{" "}
                      <span className="text-foreground">{hotel.size_band}</span>{" "}
                      rooms.
                    </p>
                    <p className="font-mono text-[11px] text-foreground">
                      rank = percentile of (your intensity) in peer cohort
                    </p>
                  </div>
                  <Separator className="my-3" />
                  <div className="space-y-1.5">
                    <p className="font-medium text-foreground">Best vs worst</p>
                    <p className="text-muted-foreground">
                      We surface the utility with the lowest rank (you're
                      ahead) and the highest rank (you're behind) — same logic
                      drives the per-utility cards below.
                    </p>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          )}

          {/* Inline mini chat with Sera */}
          {latest && summary.drivers.length > 0 && (
            <div className="mt-4 rounded-2xl border border-border/50 bg-background/40">
              <div className="flex items-center justify-between gap-2 border-b border-border/50 px-3 py-2">
                <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                  <MessageCircle className="h-3.5 w-3.5" />
                  Ask Sera about this benchmark
                </div>
                {chatTurns.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setChatTurns([])}
                    className="text-[11px] text-muted-foreground hover:text-foreground"
                  >
                    Clear
                  </button>
                )}
              </div>

              {showChat && (
                <div
                  ref={scrollRef}
                  className="max-h-72 space-y-3 overflow-y-auto px-3 py-3"
                >
                  {chatTurns.map((t, i) => (
                    <div
                      key={i}
                      className={`flex ${t.role === "user" ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                          t.role === "user"
                            ? "bg-primary text-primary-foreground"
                            : "border border-border/60 bg-card text-foreground"
                        }`}
                      >
                        {t.role === "user" ? (
                          <div className="whitespace-pre-wrap">{t.content}</div>
                        ) : (
                          <div className="prose prose-sm max-w-none prose-p:my-1.5 prose-p:text-foreground prose-strong:text-foreground prose-li:my-0.5 prose-ul:my-1.5">
                            <ReactMarkdown>{t.content}</ReactMarkdown>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  {chatPending && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Sera is thinking…
                    </div>
                  )}
                </div>
              )}

              {!chatPending && (
                <div className="flex flex-wrap gap-1.5 px-3 pt-3">
                  {starters.map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => void handleAsk(q)}
                      className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-background/60 px-2.5 py-1 text-xs text-foreground transition hover:border-primary/40 hover:bg-primary/5"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              )}

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void handleAsk(chatInput);
                }}
                className="flex items-end gap-2 px-3 py-3"
              >
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Ask a follow-up question…"
                  autoComplete="off"
                  disabled={chatPending}
                  className="flex-1 rounded-lg border border-border/60 bg-background px-3 py-2 text-sm focus:border-primary/40 focus:outline-none focus:ring-1 focus:ring-primary/30 disabled:opacity-60"
                />
                <Button
                  type="submit"
                  size="icon"
                  disabled={chatPending || !chatInput.trim()}
                  className="h-9 w-9 shrink-0 rounded-lg"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </form>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
