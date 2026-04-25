import { createFileRoute, Link } from "@tanstack/react-router";
import * as React from "react";
import { toast } from "sonner";
import {
  Bot,
  Send,
  Sparkles,
  Loader2,
  Bolt,
  Flame,
  Droplets,
  Trash2,
  BedDouble,
  CheckCircle2,
  TrendingUp,
  TrendingDown,
  Lightbulb,
  ListChecks,
  Mic,
  Camera,
  Building2,
  ChevronDown,
  ArrowUpRight,
} from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { type Hotel, type MonthlyEntry } from "@/lib/hotel";
import { DEMO_PROFILE_ID, type UserProfile } from "@/lib/user-profile";
import { MONTH_NAMES, calculateCO2e, formatNumber, pctChange } from "@/lib/format";
import { DesignModeSwitcher } from "@/components/design-mode-switcher";
import {
  generateInsights,
  sendAssistantMessage,
  type Insight,
} from "@/server/assistant.functions";

export const Route = createFileRoute("/ai")({
  head: () => ({
    meta: [
      { title: "Sera — AI First | RA+" },
      {
        name: "description",
        content:
          "Just chat with Sera. She tells you what to do, gives you insights, and logs your hotel data for you.",
      },
    ],
  }),
  component: AIFirstPage,
});

interface ChatMsg {
  role: "user" | "assistant";
  content: string;
  // Optional UI-only payload rendered with the message (e.g. inline data form, insight cards).
  attachment?:
    | { kind: "log-form"; hotelId: string; year: number; month: number }
    | { kind: "insights"; items: Insight[] }
    | { kind: "summary"; hotelId: string };
}

function expectedReportingPeriod(): { year: number; month: number } {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

const FIELDS = [
  { key: "electricity_kwh", label: "Electricity", unit: "kWh", Icon: Bolt },
  { key: "gas_kwh", label: "Gas", unit: "kWh", Icon: Flame },
  { key: "water_m3", label: "Water", unit: "m³", Icon: Droplets },
  { key: "waste_kg", label: "Waste", unit: "kg", Icon: Trash2 },
  { key: "occupied_room_nights", label: "Room-nights sold", unit: "nights", Icon: BedDouble },
] as const;

type FieldKey = (typeof FIELDS)[number]["key"];
type Values = Record<FieldKey, string>;
const EMPTY: Values = {
  electricity_kwh: "",
  gas_kwh: "",
  water_m3: "",
  waste_kg: "",
  occupied_room_nights: "",
};

function AIFirstPage() {
  const callAssistant = useServerFn(sendAssistantMessage);
  const callInsights = useServerFn(generateInsights);

  const [profile, setProfile] = React.useState<UserProfile | null>(null);
  const [hotels, setHotels] = React.useState<Hotel[]>([]);
  const [entries, setEntries] = React.useState<MonthlyEntry[]>([]);
  const [activeHotelId, setActiveHotelId] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  const [messages, setMessages] = React.useState<ChatMsg[]>([]);
  const [input, setInput] = React.useState("");
  const [thinking, setThinking] = React.useState(false);

  const [insights, setInsights] = React.useState<Insight[]>([]);
  const [insightsLoading, setInsightsLoading] = React.useState(false);

  const expected = expectedReportingPeriod();
  const monthLabel = `${MONTH_NAMES[expected.month - 1]} ${expected.year}`;

  const scrollRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, thinking]);

  // Initial load
  React.useEffect(() => {
    void (async () => {
      const [{ data: profileData }, { data: hotelsData }, { data: entriesData }] =
        await Promise.all([
          supabase.from("user_profiles").select("*").eq("id", DEMO_PROFILE_ID).maybeSingle(),
          supabase.from("hotels").select("*").order("name", { ascending: true }),
          supabase
            .from("monthly_entries")
            .select("*")
            .order("year", { ascending: true })
            .order("month", { ascending: true }),
        ]);
      const hs = (hotelsData as Hotel[] | null) ?? [];
      setProfile((profileData as UserProfile) ?? null);
      setHotels(hs);
      setEntries((entriesData as MonthlyEntry[] | null) ?? []);
      setActiveHotelId(hs[0]?.id ?? null);
      setLoading(false);
    })();
  }, []);

  const activeHotel = hotels.find((h) => h.id === activeHotelId) ?? null;
  const firstName = (profile?.display_name?.split(" ")[0] || "there").trim();

  // Hotels missing this month's data
  const missing = React.useMemo(() => {
    return hotels.filter(
      (h) =>
        !entries.some(
          (e) => e.hotel_id === h.id && e.year === expected.year && e.month === expected.month,
        ),
    );
  }, [hotels, entries, expected.year, expected.month]);

  // Greeting message — Sera leads
  React.useEffect(() => {
    if (loading || messages.length > 0) return;
    const intro: ChatMsg[] = [];
    const missingCount = missing.length;
    const greeting =
      missingCount > 0
        ? `Hi ${firstName} 👋  I'm Sera. Quick update for ${monthLabel}:\n\n• **${missingCount} hotel${missingCount > 1 ? "s" : ""}** still need numbers for this month.\n• I can log them for you in a few seconds — or just tell me how things are going and I'll handle the rest.\n\nWhat would you like to do first?`
        : `Hi ${firstName} 👋  I'm Sera. All your hotels are up to date for ${monthLabel} — nice work.\n\nWant me to walk you through how you're doing, or share what to focus on next?`;
    intro.push({ role: "assistant", content: greeting });
    setMessages(intro);
  }, [loading, firstName, missing.length, monthLabel, messages.length]);

  // Background insights for the active hotel
  React.useEffect(() => {
    if (!activeHotelId) return;
    setInsightsLoading(true);
    callInsights({ data: { hotelId: activeHotelId } })
      .then((r) => setInsights(r.insights ?? []))
      .catch(() => setInsights([]))
      .finally(() => setInsightsLoading(false));
  }, [activeHotelId, callInsights]);

  // ---- Chat send ----
  async function send(text: string, attachReply?: ChatMsg["attachment"]) {
    const trimmed = text.trim();
    if (!trimmed || thinking) return;
    const userMsg: ChatMsg = { role: "user", content: trimmed };
    const newHistory = [...messages, userMsg];
    setMessages(newHistory);
    setInput("");
    setThinking(true);

    try {
      const res = await callAssistant({
        data: {
          message: trimmed,
          hotelId: activeHotelId ?? undefined,
          history: messages.map((m) => ({ role: m.role, content: m.content })),
        },
      });
      if (res.ok) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: res.content, attachment: attachReply },
        ]);
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

  // ---- Quick actions (one-click) ----
  function actionLogData() {
    const target = missing[0] ?? activeHotel;
    if (!target) return;
    setActiveHotelId(target.id);
    setMessages((prev) => [
      ...prev,
      { role: "user", content: `Help me log ${monthLabel} for ${target.name}.` },
      {
        role: "assistant",
        content: `Easy. Just type the numbers from your bills below — leave blank what you don't have. I'll save it and tell you immediately how it compares to last month.`,
        attachment: { kind: "log-form", hotelId: target.id, year: expected.year, month: expected.month },
      },
    ]);
  }

  function actionWhatToDo() {
    void send(`What should I focus on this month for ${activeHotel?.name ?? "my hotels"}? Give me 3 concrete actions, ranked by impact.`);
  }

  function actionHowAmIDoing() {
    void send(`How am I doing this month vs last month and vs my peers? Use plain language and exact numbers.`);
  }

  function actionExplainBill() {
    void send(`Why might my electricity bill have changed this month? What are the most likely reasons given my data?`);
  }

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-background via-background to-muted/30 text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
              <Bot className="h-4.5 w-4.5" />
            </div>
            <div className="min-w-0 leading-tight">
              <div className="font-serif text-lg truncate">Sera</div>
              <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                Your sustainability copilot
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {hotels.length > 1 && (
              <HotelPicker
                hotels={hotels}
                activeHotelId={activeHotelId}
                onChange={setActiveHotelId}
              />
            )}
            <DesignModeSwitcher />
          </div>
        </div>
      </header>

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
          ) : (
            <div className="space-y-5">
              {/* Insight strip — surfaced once, scrollable */}
              {insights.length > 0 && (
                <InsightStrip insights={insights} loading={insightsLoading} />
              )}

              {messages.map((m, i) => (
                <MessageBubble
                  key={i}
                  msg={m}
                  hotels={hotels}
                  entries={entries}
                  onSavedEntry={(entry) => {
                    setEntries((prev) => {
                      const filtered = prev.filter(
                        (e) =>
                          !(
                            e.hotel_id === entry.hotel_id &&
                            e.year === entry.year &&
                            e.month === entry.month
                          ),
                      );
                      return [...filtered, entry];
                    });
                  }}
                  onAfterSave={(hotelName) => {
                    void send(
                      `I just logged this month's data for ${hotelName}. Give me a 2-sentence reaction: how does it look vs last month, and one thing to do next.`,
                    );
                  }}
                />
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

      {/* Composer + suggested actions */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border/60 bg-background/90 backdrop-blur-md">
        <div className="mx-auto max-w-3xl px-4 py-3 sm:px-6">
          {/* one-click suggestions */}
          <div className="mb-2 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <SuggestionChip
              icon={ListChecks}
              label={
                missing.length > 0
                  ? `Log ${monthLabel}${missing.length > 1 ? ` (${missing.length})` : ""}`
                  : `Log ${monthLabel}`
              }
              onClick={actionLogData}
              tone="primary"
            />
            <SuggestionChip
              icon={Lightbulb}
              label="What should I do?"
              onClick={actionWhatToDo}
            />
            <SuggestionChip
              icon={TrendingUp}
              label="How am I doing?"
              onClick={actionHowAmIDoing}
            />
            <SuggestionChip
              icon={Sparkles}
              label="Explain my bill"
              onClick={actionExplainBill}
            />
            <SuggestionChip
              icon={Camera}
              label="Upload a bill"
              onClick={() => toast("Bill upload available in Classic › Workspace › Upload bill.")}
            />
            <SuggestionChip
              icon={Mic}
              label="Voice"
              onClick={() => toast("Voice logging available in Classic › Workspace › Voice.")}
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
              placeholder={`Ask Sera anything about ${activeHotel?.name ?? "your hotels"}…`}
              rows={1}
              className="max-h-32 min-h-[36px] flex-1 resize-none bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-muted-foreground"
            />
            <button
              type="submit"
              disabled={!input.trim() || thinking}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
              aria-label="Send"
            >
              {thinking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </form>
          <p className="mt-1.5 text-center text-[10px] text-muted-foreground">
            Sera can log data, give insights and tell you what to do next. She uses your real hotel numbers.
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

function InsightStrip({ insights, loading }: { insights: Insight[]; loading: boolean }) {
  return (
    <div className="-mx-4 px-4 sm:-mx-6 sm:px-6">
      <div className="mb-1.5 flex items-center gap-1.5 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        <Sparkles className="h-3 w-3" /> Sera's insights
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
            ins.tone === "positive" ? TrendingDown : ins.tone === "warning" ? TrendingUp : Lightbulb;
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

function MessageBubble({
  msg,
  hotels,
  entries,
  onSavedEntry,
  onAfterSave,
}: {
  msg: ChatMsg;
  hotels: Hotel[];
  entries: MonthlyEntry[];
  onSavedEntry: (entry: MonthlyEntry) => void;
  onAfterSave: (hotelName: string) => void;
}) {
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
        {msg.attachment?.kind === "log-form" && (() => {
          const att = msg.attachment;
          const targetHotel = hotels.find((h) => h.id === att.hotelId);
          if (!targetHotel) return null;
          const pd = new Date(att.year, att.month - 2, 1);
          const existing =
            entries.find(
              (e) =>
                e.hotel_id === att.hotelId && e.year === att.year && e.month === att.month,
            ) ?? null;
          const prev =
            entries.find(
              (e) =>
                e.hotel_id === att.hotelId &&
                e.year === pd.getFullYear() &&
                e.month === pd.getMonth() + 1,
            ) ?? null;
          return (
            <div className="mt-2">
              <InlineLogForm
                hotel={targetHotel}
                year={att.year}
                month={att.month}
                existing={existing}
                prev={prev}
                onSaved={(entry, hotelName) => {
                  onSavedEntry(entry);
                  onAfterSave(hotelName);
                }}
              />
            </div>
          );
        })()}
      </div>
    </div>
  );
}

/** Tiny markdown renderer: bold + bullets + line breaks. Avoids extra deps. */
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

function InlineLogForm({
  hotel,
  year,
  month,
  existing,
  prev,
  onSaved,
}: {
  hotel: Hotel;
  year: number;
  month: number;
  existing: MonthlyEntry | null;
  prev: MonthlyEntry | null;
  onSaved: (entry: MonthlyEntry, hotelName: string) => void;
}) {
  const [values, setValues] = React.useState<Values>(() =>
    existing
      ? {
          electricity_kwh: existing.electricity_kwh?.toString() ?? "",
          gas_kwh: existing.gas_kwh?.toString() ?? "",
          water_m3: existing.water_m3?.toString() ?? "",
          waste_kg: existing.waste_kg?.toString() ?? "",
          occupied_room_nights: existing.occupied_room_nights?.toString() ?? "",
        }
      : { ...EMPTY },
  );
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState(false);

  const monthLabel = `${MONTH_NAMES[month - 1]} ${year}`;

  function setVal(k: FieldKey, v: string) {
    setValues((prev) => ({ ...prev, [k]: v }));
    setSaved(false);
  }

  async function save() {
    const filledCount = Object.values(values).filter((v) => v.trim() !== "").length;
    if (filledCount === 0) {
      toast.error("Add at least one number first.");
      return;
    }
    setSaving(true);
    const num = (s: string): number | null => {
      const v = s.trim();
      if (v === "") return null;
      const n = Number(v.replace(/,/g, ""));
      return Number.isFinite(n) ? n : null;
    };
    const payload = {
      hotel_id: hotel.id,
      year,
      month,
      electricity_kwh: num(values.electricity_kwh),
      gas_kwh: num(values.gas_kwh),
      water_m3: num(values.water_m3),
      waste_kg: num(values.waste_kg),
      occupied_room_nights: num(values.occupied_room_nights),
    };
    const { data, error } = existing
      ? await supabase
          .from("monthly_entries")
          .update(payload)
          .eq("id", existing.id)
          .select()
          .single()
      : await supabase.from("monthly_entries").insert(payload).select().single();
    setSaving(false);
    if (error || !data) {
      toast.error("Could not save. Try again in a moment.");
      return;
    }
    setSaved(true);
    toast.success(`${hotel.name} saved.`);
    onSaved(data as MonthlyEntry, hotel.name);
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-3.5">
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-foreground">{hotel.name}</div>
          <div className="text-[11px] text-muted-foreground">{monthLabel}</div>
        </div>
        {saved && (
          <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[11px] font-medium text-success">
            <CheckCircle2 className="h-3 w-3" /> Saved
          </span>
        )}
      </div>
      <div className="grid grid-cols-1 gap-2">
        {FIELDS.map((f) => {
          const prevVal = prev ? (prev[f.key] as number | null) : null;
          const curr = values[f.key];
          const currNum = curr.trim() === "" ? null : Number(curr.replace(/,/g, ""));
          const change =
            prevVal != null && currNum != null && Number.isFinite(currNum)
              ? pctChange(currNum, prevVal)
              : null;
          return (
            <label
              key={f.key}
              className="flex items-center gap-2.5 rounded-xl border border-border/60 bg-background px-2.5 py-2 focus-within:border-primary/40"
            >
              <f.Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">{f.label}</span>
                  {prevVal != null && (
                    <span className="text-[10px] text-muted-foreground">
                      last: {formatNumber(prevVal)} {f.unit}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <input
                    inputMode="decimal"
                    value={curr}
                    onChange={(e) => setVal(f.key, e.target.value)}
                    placeholder={prevVal != null ? formatNumber(prevVal) : "0"}
                    className="w-full bg-transparent text-sm font-medium text-foreground outline-none placeholder:text-muted-foreground/50"
                  />
                  <span className="text-[11px] text-muted-foreground">{f.unit}</span>
                  {change != null && (
                    <span
                      className={`text-[10px] font-medium ${
                        change <= 0 ? "text-success" : "text-amber-600"
                      }`}
                    >
                      {change > 0 ? "+" : ""}
                      {change.toFixed(0)}%
                    </span>
                  )}
                </div>
              </div>
            </label>
          );
        })}
      </div>
      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
          Save & ask Sera
        </button>
        <Link
          to="/log"
          className="inline-flex items-center gap-1 rounded-xl border border-border bg-card px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
        >
          More options <ArrowUpRight className="h-3 w-3" />
        </Link>
      </div>
    </div>
  );
}
