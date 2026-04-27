import { createFileRoute, Link } from "@tanstack/react-router";
import * as React from "react";
import { toast } from "sonner";
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
  HelpCircle,
  Upload,
  Mic,
  Wand2,
  ChevronDown,
  Lightbulb,
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
  formatPct,
  pctChange,
  calculateCO2e,
} from "@/lib/format";
import { getPeerStats, getPeerRank, type Utility } from "@/lib/peer-benchmarks";
import { EasyHeader, EasyCrossLink } from "@/components/easy-nav";
import { InvoiceUploadCard } from "@/components/invoice-upload-card";
import { VoiceLogCard } from "@/components/voice-log-card";
import { SmartPasteCard } from "@/components/smart-paste-card";
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

export const Route = createFileRoute("/easy")({
  head: () => ({
    meta: [
      { title: "Your month — RA+ (Extra Simple)" },
      {
        name: "description",
        content:
          "Everything for your hotels in one scrollable page: what to log, how you're doing, and answers from Sera.",
      },
    ],
  }),
  component: ExtraSimplePage,
});

function expectedReportingPeriod(): { year: number; month: number } {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

interface FieldDef {
  key: keyof Pick<
    MonthlyEntry,
    "electricity_kwh" | "gas_kwh" | "water_m3" | "waste_kg" | "occupied_room_nights"
  >;
  label: string;
  unit: string;
  Icon: React.ComponentType<{ className?: string }>;
}

const FIELDS: FieldDef[] = [
  { key: "electricity_kwh", label: "Electricity", unit: "kWh", Icon: Bolt },
  { key: "gas_kwh", label: "Gas", unit: "kWh", Icon: Flame },
  { key: "water_m3", label: "Water", unit: "m³", Icon: Droplets },
  { key: "waste_kg", label: "Waste", unit: "kg", Icon: Trash2 },
  { key: "occupied_room_nights", label: "Room-nights sold", unit: "nights", Icon: BedDouble },
];

type Values = Record<FieldDef["key"], string>;

const EMPTY_VALUES: Values = {
  electricity_kwh: "",
  gas_kwh: "",
  water_m3: "",
  waste_kg: "",
  occupied_room_nights: "",
};

interface HotelCardData {
  hotel: Hotel;
  entry: MonthlyEntry | null;
  prevEntry: MonthlyEntry | null;
  values: Values;
  saving: boolean;
  saved: boolean;
}

function ExtraSimplePage() {
  const callBriefing = useServerFn(generateBriefing);
  const callInsights = useServerFn(generateInsights);
  const callAssistant = useServerFn(sendAssistantMessage);

  const [profile, setProfile] = React.useState<UserProfile | null>(null);
  const [cards, setCards] = React.useState<HotelCardData[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [briefing, setBriefing] = React.useState<BriefingPayload | null>(null);
  const [briefingLoading, setBriefingLoading] = React.useState(false);
  const [insights, setInsights] = React.useState<Insight[]>([]);
  const [insightsLoading, setInsightsLoading] = React.useState(false);

  const [chatInput, setChatInput] = React.useState("");
  const [chatHistory, setChatHistory] = React.useState<
    { role: "user" | "assistant"; content: string }[]
  >([]);
  const [chatLoading, setChatLoading] = React.useState(false);
  const [activeChatHotelId, setActiveChatHotelId] = React.useState<string | null>(null);

  // Quick-entry tools (upload bills, voice, paste) — same components as the
  // Simple/Classic views so we don't lose any capability here.
  const [openTool, setOpenTool] = React.useState<null | "upload" | "voice" | "paste">(null);
  const [allEntries, setAllEntries] = React.useState<MonthlyEntry[]>([]);

  // Side-panel "Ask Sera" state — used by per-utility / per-tip buttons so
  // users get a contextual answer without scrolling away or losing their place.
  const [panelOpen, setPanelOpen] = React.useState(false);
  const [panelTitle, setPanelTitle] = React.useState("Sera");
  const [panelPrompt, setPanelPrompt] = React.useState("");
  const [panelAnswer, setPanelAnswer] = React.useState<string | null>(null);
  const [panelLoading, setPanelLoading] = React.useState(false);
  const [panelError, setPanelError] = React.useState<string | null>(null);

  const expected = expectedReportingPeriod();
  const monthLabel = `${MONTH_NAMES[expected.month - 1]} ${expected.year}`;

  // Initial load (extracted to reload so the upload/voice/paste tools can refresh us)
  const reload = React.useCallback(async () => {
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

    const cards: HotelCardData[] = hotels.map((h) => {
      const entry =
        entries.find(
          (e) =>
            e.hotel_id === h.id &&
            e.year === expected.year &&
            e.month === expected.month,
        ) ?? null;
      // previous month
      const prevDate = new Date(expected.year, expected.month - 2, 1);
      const py = prevDate.getFullYear();
      const pm = prevDate.getMonth() + 1;
      const prevEntry =
        entries.find(
          (e) => e.hotel_id === h.id && e.year === py && e.month === pm,
        ) ?? null;

      const values: Values = entry
        ? {
            electricity_kwh: entry.electricity_kwh?.toString() ?? "",
            gas_kwh: entry.gas_kwh?.toString() ?? "",
            water_m3: entry.water_m3?.toString() ?? "",
            waste_kg: entry.waste_kg?.toString() ?? "",
            occupied_room_nights:
              entry.occupied_room_nights?.toString() ?? "",
          }
        : { ...EMPTY_VALUES };

      return {
        hotel: h,
        entry,
        prevEntry,
        values,
        saving: false,
        saved: !!entry && allFilled(values),
      };
    });

    setProfile((profileData as UserProfile) ?? null);
    setAllEntries(entries);
    setCards(cards);
    setActiveChatHotelId((prev) => prev ?? cards[0]?.hotel.id ?? null);
    setLoading(false);
  }, [expected.year, expected.month]);

  React.useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const firstName = (profile?.display_name?.split(" ")[0] || "there").trim();

  const totalHotels = cards.length;
  const completeHotels = cards.filter((c) => c.saved).length;
  const allDone = totalHotels > 0 && completeHotels === totalHotels;

  // Portfolio CO2e (this month, from saved entries)
  const portfolioCO2e = React.useMemo(() => {
    return cards.reduce(
      (sum, c) => (c.entry ? sum + calculateCO2e(c.entry) : sum),
      0
    );
  }, [cards]);

  // Briefing
  React.useEffect(() => {
    if (loading || !totalHotels) return;
    setBriefingLoading(true);
    callBriefing({
      data: {
        firstName,
        todos: cards
          .filter((c) => !c.saved)
          .map((c) => ({
            title: `Add ${monthLabel} for ${c.hotel.name}`,
            description: `Quick: just 5 numbers from your bills.`,
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
  }, [loading, totalHotels, callBriefing, firstName, monthLabel, cards]);

  // Insights for the first hotel that has data
  React.useEffect(() => {
    if (loading) return;
    const firstWithData = cards.find((c) => c.entry || c.prevEntry);
    if (!firstWithData) return;
    setInsightsLoading(true);
    callInsights({ data: { hotelId: firstWithData.hotel.id } })
      .then((r) => setInsights(r.insights ?? []))
      .catch(() => setInsights([]))
      .finally(() => setInsightsLoading(false));
  }, [loading, cards, callInsights]);

  function updateCard(hotelId: string, patch: Partial<HotelCardData>) {
    setCards((prev) =>
      prev.map((c) => (c.hotel.id === hotelId ? { ...c, ...patch } : c))
    );
  }

  function updateValue(hotelId: string, key: FieldDef["key"], v: string) {
    setCards((prev) =>
      prev.map((c) =>
        c.hotel.id === hotelId
          ? { ...c, values: { ...c.values, [key]: v }, saved: false }
          : c
      )
    );
  }

  async function saveCard(card: HotelCardData) {
    const filledCount = Object.values(card.values).filter(
      (v) => v.trim() !== ""
    ).length;
    if (filledCount === 0) {
      toast.error("Add at least one number first.");
      return;
    }
    updateCard(card.hotel.id, { saving: true });
    const num = (s: string): number | null => {
      const v = s.trim();
      if (v === "") return null;
      const n = Number(v.replace(/,/g, ""));
      return Number.isFinite(n) ? n : null;
    };
    const payload = {
      hotel_id: card.hotel.id,
      year: expected.year,
      month: expected.month,
      electricity_kwh: num(card.values.electricity_kwh),
      gas_kwh: num(card.values.gas_kwh),
      water_m3: num(card.values.water_m3),
      waste_kg: num(card.values.waste_kg),
      occupied_room_nights: num(card.values.occupied_room_nights),
    };
    const { data, error } = card.entry
      ? await supabase
          .from("monthly_entries")
          .update(payload)
          .eq("id", card.entry.id)
          .select()
          .single()
      : await supabase
          .from("monthly_entries")
          .insert(payload)
          .select()
          .single();

    if (error || !data) {
      updateCard(card.hotel.id, { saving: false });
      toast.error("Could not save. Try again in a moment.");
      return;
    }
    updateCard(card.hotel.id, {
      saving: false,
      saved: allFilled(card.values),
      entry: data as MonthlyEntry,
    });
    toast.success(`${monthLabel} saved for ${card.hotel.name}.`);
  }

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
          hotelId: activeChatHotelId ?? undefined,
          history: chatHistory,
        },
      });
      const reply = res.ok
        ? res.content
        : "Sorry — I couldn't reach Sera just now. Try again?";
      setChatHistory((h) => [...h, { role: "assistant", content: reply }]);
    } catch {
      setChatHistory((h) => [
        ...h,
        {
          role: "assistant",
          content: "Sorry — I couldn't reach Sera just now. Try again?",
        },
      ]);
    } finally {
      setChatLoading(false);
    }
  }

  // Open the side panel and ask Sera a contextual question. Used by per-utility,
  // per-tip and CO₂ "Ask Sera" buttons so users get a focused answer without
  // losing their place on the long page.
  async function askSeraAbout(prompt: string, title?: string, hotelId?: string | null) {
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
          hotelId: hotelId ?? activeChatHotelId ?? undefined,
          history: [],
        },
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

      <main className="mx-auto w-full max-w-3xl px-5 pb-24 pt-8">
        {/* Hero greeting */}
        <section className="mb-10">
          <h1 className="font-serif text-3xl font-semibold leading-tight text-foreground md:text-5xl">
            Hi {firstName}.
          </h1>
          <p className="mt-3 text-base text-muted-foreground md:text-lg">
            {loading
              ? "Getting your hotels ready…"
              : totalHotels === 0
                ? "Add your first hotel to get started."
                : allDone
                  ? `${monthLabel} is all logged. Nice work — scroll down to see how you're doing.`
                  : `Here are the numbers for ${monthLabel}. Just type them in below — that's it.`}
          </p>

          {/* Progress dots */}
          {!loading && totalHotels > 0 && (
            <div className="mt-5 flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                {cards.map((c) => (
                  <span
                    key={c.hotel.id}
                    title={c.hotel.name}
                    className={`h-2.5 w-2.5 rounded-full ${
                      c.saved ? "bg-success" : "bg-muted"
                    }`}
                  />
                ))}
              </div>
              <span className="text-xs text-muted-foreground">
                {completeHotels} of {totalHotels} done
              </span>
            </div>
          )}
        </section>

        {/* Sera briefing — always above the fold */}
        <section className="mb-10 rounded-3xl border border-border/60 bg-card p-5 md:p-7">
          <div className="mb-3 flex items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            Sera's note
          </div>
          {briefingLoading || (loading && !briefing) ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Reading your numbers…
            </div>
          ) : briefing ? (
            <div className="space-y-3 text-sm leading-relaxed text-foreground">
              <p className="font-serif text-xl italic text-foreground/90 md:text-2xl">
                "{briefing.headline}"
              </p>
              <p className="text-muted-foreground">{briefing.summary}</p>
              {briefing.focus && (
                <p className="rounded-2xl bg-primary/5 px-3 py-2 text-foreground">
                  <span className="font-medium">Focus this month: </span>
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
              Add a couple of months of data and Sera will share tips here.
            </p>
          )}
        </section>

        {/* Quick-entry capabilities — restore parity with the Classic view:
            upload bills, dictate, or paste from email. Same components as Simple. */}
        {!loading && totalHotels > 0 && (
          <section className="mb-12">
            <h2 className="mb-1 font-serif text-2xl font-semibold text-foreground md:text-3xl">
              Faster ways to fill this in
            </h2>
            <p className="mb-5 text-sm text-muted-foreground">
              Skip the typing — let Sera read your bills, listen to you, or parse a
              supplier email.
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              <ToolToggle
                icon={Upload}
                title="Upload bills"
                subtitle="We'll read the numbers."
                active={openTool === "upload"}
                onClick={() =>
                  setOpenTool((t) => (t === "upload" ? null : "upload"))
                }
              />
              <ToolToggle
                icon={Mic}
                title="Read it out"
                subtitle="Speak the numbers."
                active={openTool === "voice"}
                onClick={() =>
                  setOpenTool((t) => (t === "voice" ? null : "voice"))
                }
              />
              <ToolToggle
                icon={Wand2}
                title="Paste from email"
                subtitle="We'll parse the text."
                active={openTool === "paste"}
                onClick={() =>
                  setOpenTool((t) => (t === "paste" ? null : "paste"))
                }
              />
            </div>
            {openTool && (
              <div className="mt-4 rounded-3xl border border-border/60 bg-card p-4 md:p-5">
                {openTool === "upload" && (
                  <InvoiceUploadCard
                    entries={allEntries}
                    onSaved={() => void reload()}
                  />
                )}
                {openTool === "voice" && (
                  <VoiceLogCard
                    entries={allEntries}
                    onSaved={() => void reload()}
                  />
                )}
                {openTool === "paste" && (
                  <SmartPasteCard
                    entries={allEntries}
                    onSaved={() => void reload()}
                  />
                )}
              </div>
            )}
          </section>
        )}

        {/* Inline log section — one card per hotel, no clicks needed to start */}
        <section className="mb-12">
          <h2 className="mb-1 font-serif text-2xl font-semibold text-foreground md:text-3xl">
            {allDone ? `${monthLabel} ✓` : `Log ${monthLabel}`}
          </h2>
          <p className="mb-5 text-sm text-muted-foreground">
            Everything saves automatically when you tap{" "}
            <span className="font-medium text-foreground">Save month</span>. No
            page changes.
          </p>

          {loading ? (
            <div className="space-y-3">
              {[0, 1].map((i) => (
                <div
                  key={i}
                  className="h-64 animate-pulse rounded-3xl border border-border/60 bg-muted/40"
                />
              ))}
            </div>
          ) : totalHotels === 0 ? (
            <EmptyHotels />
          ) : (
            <div className="space-y-5">
              {cards.map((card) => (
                <InlineHotelCard
                  key={card.hotel.id}
                  card={card}
                  onChange={(k, v) => updateValue(card.hotel.id, k, v)}
                  onSave={() => void saveCard(card)}
                />
              ))}
            </div>
          )}
        </section>

        {/* How am I doing? — auto-rendered, no click */}
        <section className="mb-12">
          <h2 className="mb-1 font-serif text-2xl font-semibold text-foreground md:text-3xl">
            How you're doing
          </h2>
          <p className="mb-5 text-sm text-muted-foreground">
            Compared to similar hotels in your region.
          </p>

          {loading ? (
            <div className="h-40 animate-pulse rounded-3xl border border-border/60 bg-muted/40" />
          ) : cards.every((c) => !c.entry && !c.prevEntry) ? (
            <div className="rounded-3xl border border-dashed border-border/60 bg-card p-6 text-center text-sm text-muted-foreground">
              Add a month above and we'll show you how you compare.
            </div>
          ) : (
            <div className="space-y-4">
              {cards
                .filter((c) => c.entry || c.prevEntry)
                .map((c) => (
                  <PerformanceCard key={c.hotel.id} card={c} />
                ))}
            </div>
          )}

          {/* Portfolio CO2e */}
          {!loading && portfolioCO2e > 0 && (
            <div className="mt-5 rounded-3xl border border-success/30 bg-success/5 p-5 text-center">
              <Leaf className="mx-auto mb-2 h-5 w-5 text-success" />
              <div className="text-xs uppercase tracking-wider text-muted-foreground">
                Portfolio carbon · {monthLabel}
              </div>
              <div className="mt-1 font-serif text-3xl font-semibold text-foreground num">
                {formatNumber(Math.round(portfolioCO2e))} kg CO₂e
              </div>
            </div>
          )}
        </section>

        {/* Sera tips */}
        <section className="mb-12 rounded-3xl border border-border/60 bg-card p-5 md:p-7">
          <div className="mb-4 flex items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            Things you can do this month
          </div>
          {insightsLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Looking for opportunities…
            </div>
          ) : insights.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Log a couple of months and tips will appear here.
            </p>
          ) : (
            <ul className="space-y-3">
              {insights.slice(0, 3).map((ins, i) => (
                <li
                  key={i}
                  className="rounded-2xl border border-border/60 bg-background p-4"
                >
                  <div className="text-sm font-semibold text-foreground">
                    {ins.title}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{ins.body}</p>
                  <button
                    type="button"
                    onClick={() =>
                      void askSeraAbout(
                        `Walk me through how to do this, step by step, in plain language: "${ins.title}". Use my hotel's data and keep it under 6 short bullets.`,
                        `How to: ${ins.title}`,
                      )
                    }
                    className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
                  >
                    <Lightbulb className="h-3 w-3" />
                    Tell me how
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Ask Sera — always visible at the bottom */}
        <section className="mb-12 rounded-3xl border border-primary/20 bg-primary/5 p-5 md:p-7">
          <div className="mb-3 flex items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            Ask Sera anything
          </div>

          {totalHotels > 1 && (
            <div className="mb-3 flex flex-wrap gap-1.5">
              {cards.map((c) => (
                <button
                  key={c.hotel.id}
                  type="button"
                  onClick={() => setActiveChatHotelId(c.hotel.id)}
                  className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition ${
                    activeChatHotelId === c.hotel.id
                      ? "bg-primary text-primary-foreground"
                      : "bg-card text-muted-foreground hover:bg-muted"
                  }`}
                >
                  <Building2 className="h-3 w-3" />
                  {c.hotel.name}
                </button>
              ))}
            </div>
          )}

          {chatHistory.length > 0 && (
            <div className="mb-4 max-h-80 space-y-2 overflow-y-auto pr-1">
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
              Ask
            </button>
          </div>

          {chatHistory.length === 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {[
                "How can I lower my electricity?",
                "How do I compare to peers?",
                "What's my biggest opportunity?",
              ].map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setChatInput(p)}
                  className="rounded-full border border-border/60 bg-card px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
                >
                  {p}
                </button>
              ))}
            </div>
          )}
        </section>

        {/* Footer help */}
        <footer className="mb-4 flex flex-col items-center justify-center gap-3 rounded-2xl border border-border/40 bg-muted/30 px-4 py-3 text-xs text-muted-foreground sm:flex-row">
          <div className="inline-flex items-center gap-2">
            <HelpCircle className="h-3.5 w-3.5" />
            Want to focus on one hotel?
          </div>
          <EasyCrossLink
            to="/easy/workspace"
            label="Open hotel workspace"
            hint="one property at a time"
          />
        </footer>
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

function ToolToggle({
  icon: Icon,
  title,
  subtitle,
  active,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`group flex w-full items-start gap-3 rounded-2xl border p-4 text-left transition-all ${
        active
          ? "border-primary bg-primary/10 shadow-sm"
          : "border-border/60 bg-card hover:border-primary/40 hover:shadow-sm"
      }`}
    >
      <div
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
          active ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary"
        }`}
      >
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-foreground">{title}</div>
        <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
      </div>
      <ChevronDown
        className={`mt-2 h-4 w-4 shrink-0 text-muted-foreground transition-transform ${
          active ? "rotate-180 text-primary" : ""
        }`}
      />
    </button>
  );
}

function allFilled(v: Values): boolean {
  return (Object.values(v) as string[]).every((s) => s.trim() !== "");
}

function EmptyHotels() {
  return (
    <div className="rounded-3xl border border-dashed border-border/60 bg-card p-8 text-center">
      <h3 className="font-serif text-lg text-foreground">No hotels yet</h3>
      <p className="mt-2 text-sm text-muted-foreground">
        Switch to Classic view from the top-right to add your first hotel.
      </p>
    </div>
  );
}

function InlineHotelCard({
  card,
  onChange,
  onSave,
}: {
  card: HotelCardData;
  onChange: (k: FieldDef["key"], v: string) => void;
  onSave: () => void;
}) {
  const { hotel, values, saving, saved, prevEntry } = card;
  const filledCount = Object.values(values).filter((v) => v.trim() !== "").length;

  return (
    <article
      className={`rounded-3xl border p-5 transition-shadow md:p-6 ${
        saved
          ? "border-success/30 bg-success/5"
          : "border-border/60 bg-card hover:shadow-sm"
      }`}
    >
      <header className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            <h3 className="font-serif text-xl font-semibold text-foreground">
              {hotel.name}
            </h3>
            {saved && (
              <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-[11px] font-medium text-success">
                <CheckCircle2 className="h-3 w-3" />
                Done
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {hotel.region} · {hotel.rooms} rooms · {hotel.star_rating}★
          </p>
        </div>
        <Link
          to="/easy/workspace"
          onClick={() => setActiveHotelId(hotel.id)}
          className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border/60 bg-background px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
        >
          Open workspace
          <ArrowRight className="h-3 w-3" />
        </Link>
      </header>

      <div className="space-y-2">
        {FIELDS.map((f) => {
          const prev = prevEntry ? (prevEntry[f.key] as number | null) : null;
          return (
            <div
              key={f.key}
              className="flex items-center gap-3 rounded-2xl border border-border/50 bg-background px-3 py-2.5"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground">
                <f.Icon className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <label className="block text-sm font-medium text-foreground">
                  {f.label}
                </label>
                {prev !== null && prev > 0 && (
                  <p className="text-[11px] text-muted-foreground">
                    Last month: {formatNumber(prev)} {f.unit}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <input
                  inputMode="decimal"
                  value={values[f.key]}
                  onChange={(e) => onChange(f.key, e.target.value)}
                  placeholder={prev ? formatNumber(prev) : "—"}
                  className="num w-24 rounded-xl border border-input bg-card px-3 py-2 text-right text-base font-medium text-foreground shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring sm:w-32"
                />
                <span className="w-10 text-[11px] text-muted-foreground">
                  {f.unit}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <span className="text-xs text-muted-foreground">
          {filledCount} of {FIELDS.length} filled
        </span>
        <button
          type="button"
          onClick={onSave}
          disabled={saving || filledCount === 0}
          className="inline-flex items-center justify-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : saved ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : (
            <ArrowRight className="h-4 w-4" />
          )}
          {saving ? "Saving…" : saved ? "Update month" : "Save month"}
        </button>
      </div>
    </article>
  );
}

function PerformanceCard({ card }: { card: HotelCardData }) {
  const { hotel, entry, prevEntry } = card;
  const latest = entry ?? prevEntry;
  if (!latest) return null;

  const filters = {
    sizeBand: hotel.size_band ?? "medium",
    region: hotel.region ?? "",
    starRating: hotel.star_rating ?? 4,
  };

  const utilities: {
    key: "electricity_kwh" | "gas_kwh" | "water_m3" | "waste_kg";
    label: string;
    Icon: React.ComponentType<{ className?: string }>;
    utility: Utility;
  }[] = [
    { key: "electricity_kwh", label: "Electricity", Icon: Bolt, utility: "electricity" },
    { key: "gas_kwh", label: "Gas", Icon: Flame, utility: "gas" },
    { key: "water_m3", label: "Water", Icon: Droplets, utility: "water" },
    { key: "waste_kg", label: "Waste", Icon: Trash2, utility: "waste" },
  ];

  const co2Latest = entry ? calculateCO2e(entry) : 0;
  const co2Prev = prevEntry ? calculateCO2e(prevEntry) : 0;
  const co2Change = pctChange(co2Latest || null, co2Prev || null);

  // Use latest's calendar month for seasonal stats
  const usedMonth = latest.month;

  return (
    <div className="rounded-3xl border border-border/60 bg-card p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="font-serif text-lg font-semibold text-foreground">
            {hotel.name}
          </h3>
          <p className="text-xs text-muted-foreground">
            {MONTH_NAMES[usedMonth - 1]} snapshot
          </p>
        </div>
        {co2Change !== null && (
          <div
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${
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
            {formatPct(co2Change)} CO₂
          </div>
        )}
      </div>

      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {utilities.map((u) => {
          const v = latest[u.key] as number | null;
          const rn = latest.occupied_room_nights;
          const intensity = v && rn ? v / rn : null;
          const stats = getPeerStats(u.utility, usedMonth, filters);
          const rank = intensity !== null ? getPeerRank(intensity, stats) : null;
          const bucket: "top" | "average" | "bottom" | null =
            rank === null
              ? null
              : rank <= 30
                ? "top"
                : rank <= 65
                  ? "average"
                  : "bottom";
          const tone =
            bucket === "top"
              ? "border-success/30 bg-success/5 text-success"
              : bucket === "bottom"
                ? "border-warning/40 bg-warning/5 text-warning"
                : "border-border/60 bg-background text-muted-foreground";
          const label =
            bucket === "top"
              ? "Better than peers"
              : bucket === "average"
                ? "About average"
                : bucket === "bottom"
                  ? "Room to save"
                  : "No data";
          return (
            <li
              key={u.key}
              className={`flex flex-col items-start gap-1 rounded-2xl border p-3 ${tone}`}
            >
              <div className="flex items-center gap-1.5 text-[11px] font-medium text-foreground">
                <u.Icon className="h-3.5 w-3.5" />
                {u.label}
              </div>
              <div className="text-[11px]">{label}</div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
