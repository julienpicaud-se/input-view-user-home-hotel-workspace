import { createFileRoute, Link } from "@tanstack/react-router";
import * as React from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  Bot,
  Building2,
  ChevronDown,
  Loader2,
  Send,
  Sparkles,
  Lightbulb,
  TrendingUp,
  ListChecks,
  CheckCircle2,
  MapPin,
  Leaf,
  TrendingDown,
} from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import {
  getActiveHotelId,
  setActiveHotelId,
  type Hotel,
  type MonthlyEntry,
} from "@/lib/hotel";
import {
  MONTH_NAMES,
  calculateCO2e,
  formatNumber,
  pctChange,
} from "@/lib/format";
import { DesignModeSwitcher } from "@/components/design-mode-switcher";
import {
  generateInsights,
  sendAssistantMessage,
  type Insight,
} from "@/server/assistant.functions";

export const Route = createFileRoute("/ai/workspace")({
  head: () => ({
    meta: [
      { title: "Sera — Hotel workspace (AI First) | RA+" },
      {
        name: "description",
        content:
          "Chat with Sera focused on a single hotel. She has the latest numbers and tips ready.",
      },
    ],
  }),
  component: AIWorkspacePage,
});

interface ChatMsg {
  role: "user" | "assistant";
  content: string;
}

function expectedReportingPeriod(): { year: number; month: number } {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

function AIWorkspacePage() {
  const callAssistant = useServerFn(sendAssistantMessage);
  const callInsights = useServerFn(generateInsights);

  const [loading, setLoading] = React.useState(true);
  const [hotels, setHotels] = React.useState<Hotel[]>([]);
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [entries, setEntries] = React.useState<MonthlyEntry[]>([]);
  const [insights, setInsights] = React.useState<Insight[]>([]);
  const [insightsLoading, setInsightsLoading] = React.useState(false);

  const [messages, setMessages] = React.useState<ChatMsg[]>([]);
  const [input, setInput] = React.useState("");
  const [thinking, setThinking] = React.useState(false);

  const expected = expectedReportingPeriod();
  const monthLabel = `${MONTH_NAMES[expected.month - 1]} ${expected.year}`;

  const scrollRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, thinking]);

  React.useEffect(() => {
    void (async () => {
      const [{ data: hotelsData }, { data: entriesData }] = await Promise.all([
        supabase.from("hotels").select("*").order("name", { ascending: true }),
        supabase
          .from("monthly_entries")
          .select("*")
          .order("year", { ascending: true })
          .order("month", { ascending: true }),
      ]);
      const hs = (hotelsData as Hotel[] | null) ?? [];
      setHotels(hs);
      setEntries((entriesData as MonthlyEntry[] | null) ?? []);
      const stored = getActiveHotelId();
      const initial = hs.find((h) => h.id === stored)?.id ?? hs[0]?.id ?? null;
      setActiveId(initial);
      if (initial) setActiveHotelId(initial);
      setLoading(false);
    })();
  }, []);

  const hotel = hotels.find((h) => h.id === activeId) ?? null;
  const thisMonth =
    entries.find(
      (e) =>
        e.hotel_id === activeId &&
        e.year === expected.year &&
        e.month === expected.month,
    ) ?? null;
  const prevDate = new Date(expected.year, expected.month - 2, 1);
  const lastMonth =
    entries.find(
      (e) =>
        e.hotel_id === activeId &&
        e.year === prevDate.getFullYear() &&
        e.month === prevDate.getMonth() + 1,
    ) ?? null;
  const co2eThis = thisMonth ? calculateCO2e(thisMonth) : 0;
  const co2ePrev = lastMonth ? calculateCO2e(lastMonth) : 0;
  const co2eChange = pctChange(co2eThis, co2ePrev);

  // Greeting (resets when active hotel changes)
  React.useEffect(() => {
    if (!hotel) return;
    setMessages([
      {
        role: "assistant",
        content:
          `Hi 👋 I'm focused on **${hotel.name}** right now.\n\n` +
          (thisMonth
            ? `${monthLabel} is logged. Want me to walk you through how this hotel is doing or suggest one thing to do next?`
            : `${monthLabel} isn't logged yet for this hotel. Tap **Log this month** when you're ready, or ask me anything about it.`),
      },
    ]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  // Insights for the active hotel
  React.useEffect(() => {
    if (!activeId) return;
    setInsightsLoading(true);
    callInsights({ data: { hotelId: activeId } })
      .then((r) => setInsights(r.insights ?? []))
      .catch(() => setInsights([]))
      .finally(() => setInsightsLoading(false));
  }, [activeId, callInsights]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || thinking) return;
    const userMsg: ChatMsg = { role: "user", content: trimmed };
    setMessages((p) => [...p, userMsg]);
    setInput("");
    setThinking(true);

    try {
      const res = await callAssistant({
        data: {
          message: trimmed,
          hotelId: activeId ?? undefined,
          history: messages.map((m) => ({ role: m.role, content: m.content })),
        },
      });
      if (res.ok) {
        setMessages((prev) => [...prev, { role: "assistant", content: res.content }]);
      } else {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: `Sorry — ${res.error}` },
        ]);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Something went wrong. Please try again." },
      ]);
    } finally {
      setThinking(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-background via-background to-muted/30 text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
              <Bot className="h-4 w-4" />
            </div>
            <div className="min-w-0 leading-tight">
              <div className="font-serif text-lg truncate">Sera</div>
              <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                AI First · Workspace
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {hotels.length > 1 && (
              <HotelPicker
                hotels={hotels}
                activeHotelId={activeId}
                onChange={(id) => {
                  setActiveId(id);
                  setActiveHotelId(id);
                }}
              />
            )}
            <DesignModeSwitcher />
          </div>
        </div>
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 pb-3 sm:px-6">
          <Link
            to="/ai"
            className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Portfolio chat
          </Link>
          {hotel && (
            <div className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
              <Building2 className="h-3 w-3 shrink-0" />
              <span className="truncate font-medium text-foreground">{hotel.name}</span>
              <span className="hidden sm:inline">·</span>
              <span className="hidden items-center gap-1 sm:inline-flex">
                <MapPin className="h-3 w-3" /> {hotel.region}
              </span>
            </div>
          )}
        </div>
      </header>

      {/* Hotel snapshot strip */}
      {hotel && !loading && (
        <div className="border-b border-border/40 bg-muted/30">
          <div className="mx-auto flex max-w-3xl items-center gap-3 overflow-x-auto px-4 py-3 sm:px-6 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <SnapshotChip
              icon={Leaf}
              label={`${monthLabel} carbon`}
              value={
                thisMonth
                  ? `${formatNumber(Math.round(co2eThis))} kg CO₂e`
                  : "Not logged"
              }
            />
            {co2eChange != null && (
              <SnapshotChip
                icon={co2eChange <= 0 ? TrendingDown : TrendingUp}
                label="vs last month"
                value={`${co2eChange > 0 ? "+" : ""}${co2eChange.toFixed(0)}%`}
                tone={co2eChange <= 0 ? "success" : "warning"}
              />
            )}
            <SnapshotChip
              icon={CheckCircle2}
              label="This month"
              value={thisMonth ? "Logged" : "Pending"}
              tone={thisMonth ? "success" : "muted"}
            />
          </div>
        </div>
      )}

      {/* Messages */}
      <main className="flex-1 overflow-hidden">
        <div
          ref={scrollRef}
          className="mx-auto h-full max-w-3xl overflow-y-auto px-4 pb-40 pt-6 sm:px-6"
        >
          {loading ? (
            <div className="flex justify-center pt-20 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : !hotel ? (
            <div className="rounded-3xl border border-dashed border-border/60 bg-card p-8 text-center text-sm text-muted-foreground">
              No hotel selected.{" "}
              <Link to="/ai" className="font-medium text-primary hover:underline">
                Go back
              </Link>
              .
            </div>
          ) : (
            <div className="space-y-5">
              {/* Insights for this hotel */}
              {insights.length > 0 && (
                <InsightStrip insights={insights} loading={insightsLoading} />
              )}

              {messages.map((m, i) => (
                <MessageBubble key={i} msg={m} />
              ))}
              {thinking && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Sparkles className="h-4 w-4" />
                  </div>
                  <span className="inline-flex gap-1">
                    <Dot /> <Dot delay={0.15} /> <Dot delay={0.3} />
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* Composer */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border/60 bg-background/90 backdrop-blur-md">
        <div className="mx-auto max-w-3xl px-4 py-3 sm:px-6">
          {/* Suggestions scoped to this hotel */}
          <div className="mb-2 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <SuggestionChip
              icon={ListChecks}
              label={thisMonth ? `Update ${monthLabel}` : `Log ${monthLabel}`}
              onClick={() => {
                if (activeId) setActiveHotelId(activeId);
                toast(
                  "Open the chat suggestion 'Guided log' on the portfolio chat to log step-by-step.",
                );
              }}
              tone="primary"
            />
            <SuggestionChip
              icon={TrendingUp}
              label="How is this hotel doing?"
              onClick={() =>
                void send(
                  `How is ${hotel?.name ?? "this hotel"} doing this month vs last month and vs peers? Use plain language.`,
                )
              }
            />
            <SuggestionChip
              icon={Lightbulb}
              label="What should I do?"
              onClick={() =>
                void send(
                  `Give me 3 concrete actions for ${hotel?.name ?? "this hotel"} this month, ranked by impact.`,
                )
              }
            />
            <SuggestionChip
              icon={Sparkles}
              label="Explain my bill"
              onClick={() =>
                void send(
                  `Why might the electricity bill for ${hotel?.name ?? "this hotel"} have changed this month?`,
                )
              }
            />
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send(input);
            }}
            className="flex items-end gap-2 rounded-2xl border border-border bg-card p-2 shadow-sm focus-within:border-primary/40"
          >
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send(input);
                }
              }}
              placeholder={`Ask Sera anything about ${hotel?.name ?? "this hotel"}…`}
              rows={1}
              className="max-h-32 min-h-[36px] flex-1 resize-none bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-muted-foreground"
            />
            <button
              type="submit"
              disabled={!input.trim() || thinking}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
              aria-label="Send"
            >
              {thinking ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </button>
          </form>
          <p className="mt-1.5 text-center text-[10px] text-muted-foreground">
            This chat is scoped to the selected hotel.
          </p>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Sub-components ---------------- */

function Dot({ delay = 0 }: { delay?: number }) {
  return (
    <span
      className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-primary"
      style={{ animationDelay: `${delay}s` }}
    />
  );
}

function SnapshotChip({
  icon: Icon,
  label,
  value,
  tone = "muted",
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  tone?: "muted" | "success" | "warning";
}) {
  const toneClass =
    tone === "success"
      ? "border-success/40 bg-success/5 text-success"
      : tone === "warning"
        ? "border-amber-500/40 bg-amber-500/5 text-amber-600"
        : "border-border bg-card text-foreground";
  return (
    <div
      className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-xs ${toneClass}`}
    >
      <Icon className="h-3.5 w-3.5" />
      <span className="text-muted-foreground">{label}:</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function SuggestionChip({
  icon: Icon,
  label,
  onClick,
  tone = "default",
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  tone?: "default" | "primary";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        tone === "primary"
          ? "inline-flex shrink-0 items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground shadow-sm transition-opacity hover:opacity-90"
          : "inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-muted"
      }
    >
      <Icon className="h-3.5 w-3.5" />
      <span>{label}</span>
    </button>
  );
}

function HotelPicker({
  hotels,
  activeHotelId,
  onChange,
}: {
  hotels: Hotel[];
  activeHotelId: string | null;
  onChange: (id: string) => void;
}) {
  return (
    <label className="relative inline-flex items-center">
      <span className="sr-only">Hotel</span>
      <Building2 className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-muted-foreground" />
      <select
        className="appearance-none rounded-full border border-border bg-card py-1.5 pl-7 pr-7 text-xs font-medium text-foreground outline-none transition-colors hover:border-primary/40 focus:border-primary/40"
        value={activeHotelId ?? ""}
        onChange={(e) => onChange(e.target.value)}
      >
        {hotels.map((h) => (
          <option key={h.id} value={h.id}>
            {h.name}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 h-3.5 w-3.5 text-muted-foreground" />
    </label>
  );
}

function InsightStrip({
  insights,
  loading,
}: {
  insights: Insight[];
  loading: boolean;
}) {
  return (
    <div className="-mx-4 px-4 sm:-mx-6 sm:px-6">
      <div className="mb-1.5 flex items-center gap-1.5 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        <Sparkles className="h-3 w-3" /> For this hotel
        {loading && <Loader2 className="ml-1 h-3 w-3 animate-spin" />}
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {insights.map((ins, i) => {
          const tone =
            ins.tone === "positive"
              ? "border-success/40 bg-success/5"
              : ins.tone === "warning"
                ? "border-amber-500/40 bg-amber-500/5"
                : "border-border bg-card";
          const ToneIcon =
            ins.tone === "positive"
              ? TrendingDown
              : ins.tone === "warning"
                ? TrendingUp
                : Lightbulb;
          return (
            <div
              key={i}
              className={`flex w-64 shrink-0 flex-col gap-1 rounded-2xl border p-3 ${tone}`}
            >
              <div className="flex items-center gap-1.5">
                <ToneIcon className="h-3.5 w-3.5 text-muted-foreground" />
                <div className="text-[11px] font-semibold uppercase tracking-wide text-foreground">
                  {ins.title}
                </div>
              </div>
              <p className="text-xs leading-snug text-muted-foreground">{ins.body}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MessageBubble({ msg }: { msg: ChatMsg }) {
  const isUser = msg.role === "user";
  return (
    <div className={`flex gap-2.5 ${isUser ? "flex-row-reverse" : ""}`}>
      <div
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
          isUser ? "bg-muted text-foreground" : "bg-primary/10 text-primary"
        }`}
      >
        {isUser ? (
          <span className="text-xs font-medium">You</span>
        ) : (
          <Sparkles className="h-4 w-4" />
        )}
      </div>
      <div className={`min-w-0 max-w-[85%] ${isUser ? "items-end" : "items-start"}`}>
        <div
          className={`whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
            isUser
              ? "bg-primary text-primary-foreground"
              : "border border-border bg-card text-foreground"
          }`}
        >
          {renderMarkdownLite(msg.content)}
        </div>
      </div>
    </div>
  );
}

function renderMarkdownLite(text: string): React.ReactNode {
  const lines = text.split("\n");
  return lines.map((line, i) => {
    const isBullet = /^\s*[•\-\*]\s+/.test(line);
    const cleaned = line.replace(/^\s*[•\-\*]\s+/, "");
    const parts = cleaned.split(/(\*\*[^*]+\*\*)/g).map((part, idx) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return (
          <strong key={idx} className="font-semibold">
            {part.slice(2, -2)}
          </strong>
        );
      }
      return <React.Fragment key={idx}>{part}</React.Fragment>;
    });
    return (
      <React.Fragment key={i}>
        {isBullet ? (
          <div className="flex gap-1.5">
            <span className="select-none text-muted-foreground">•</span>
            <span>{parts}</span>
          </div>
        ) : (
          <div>{parts}</div>
        )}
      </React.Fragment>
    );
  });
}
