import { createFileRoute, Link } from "@tanstack/react-router";
import * as React from "react";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import {
  ArrowLeft,
  Building2,
  Loader2,
  Sparkles,
  Bolt,
  Flame,
  Droplets,
  Trash2,
  BedDouble,
  CheckCircle2,
  Leaf,
  TrendingDown,
  TrendingUp,
  Upload,
  Mic,
  Wand2,
  ChevronDown,
  Lightbulb,
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
import { EasyHeader } from "@/components/easy-nav";
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
  generateInsights,
  sendAssistantMessage,
  type Insight,
} from "@/server/assistant.functions";

export const Route = createFileRoute("/easy/workspace")({
  head: () => ({
    meta: [
      { title: "Hotel workspace — RA+ (Extra Simple)" },
      {
        name: "description",
        content:
          "One hotel, one page: log this month's numbers, see how you're doing, and get a quick tip.",
      },
    ],
  }),
  component: ExtraSimpleWorkspacePage,
});

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
  { key: "occupied_room_nights", label: "Room-nights", unit: "nights", Icon: BedDouble },
] as const;

type Values = Record<(typeof FIELDS)[number]["key"], string>;
const EMPTY: Values = {
  electricity_kwh: "",
  gas_kwh: "",
  water_m3: "",
  waste_kg: "",
  occupied_room_nights: "",
};

function ExtraSimpleWorkspacePage() {
  const callInsights = useServerFn(generateInsights);
  const callAssistant = useServerFn(sendAssistantMessage);
  const [loading, setLoading] = React.useState(true);
  const [hotels, setHotels] = React.useState<Hotel[]>([]);
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [entries, setEntries] = React.useState<MonthlyEntry[]>([]);
  const [values, setValues] = React.useState<Values>({ ...EMPTY });
  const [saving, setSaving] = React.useState(false);
  const [insights, setInsights] = React.useState<Insight[]>([]);
  const [insightsLoading, setInsightsLoading] = React.useState(false);

  // Quick-entry tools (parity with Standard view).
  const [openTool, setOpenTool] = React.useState<null | "upload" | "voice" | "paste">(null);

  // Side-panel "Ask Sera" — used by per-tip and CO₂ buttons.
  const [panelOpen, setPanelOpen] = React.useState(false);
  const [panelTitle, setPanelTitle] = React.useState("Sera");
  const [panelPrompt, setPanelPrompt] = React.useState("");
  const [panelAnswer, setPanelAnswer] = React.useState<string | null>(null);
  const [panelLoading, setPanelLoading] = React.useState(false);
  const [panelError, setPanelError] = React.useState<string | null>(null);

  const expected = expectedReportingPeriod();
  const monthLabel = `${MONTH_NAMES[expected.month - 1]} ${expected.year}`;

  const reload = React.useCallback(async () => {
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
    setActiveId((prev) => prev ?? hs.find((h) => h.id === stored)?.id ?? hs[0]?.id ?? null);
    const initial = hs.find((h) => h.id === stored)?.id ?? hs[0]?.id ?? null;
    if (initial) setActiveHotelId(initial);
    setLoading(false);
  }, []);

  React.useEffect(() => {
    void reload();
  }, [reload]);

  async function askSeraAbout(prompt: string, title?: string) {
    setPanelTitle(title ?? "Sera");
    setPanelPrompt(prompt);
    setPanelAnswer(null);
    setPanelError(null);
    setPanelOpen(true);
    setPanelLoading(true);
    try {
      const res = await callAssistant({
        data: { message: prompt, hotelId: activeId ?? undefined, history: [] },
      });
      if (res.ok) setPanelAnswer(res.content);
      else setPanelError("Sera couldn't answer just now.");
    } catch {
      setPanelError("Couldn't reach Sera.");
    } finally {
      setPanelLoading(false);
    }
  }

  const hotel = hotels.find((h) => h.id === activeId) ?? null;
  const thisMonth =
    entries.find(
      (e) =>
        e.hotel_id === activeId &&
        e.year === expected.year &&
        e.month === expected.month,
    ) ?? null;
  const prevDate = new Date(expected.year, expected.month - 2, 1);
  const prevMonth =
    entries.find(
      (e) =>
        e.hotel_id === activeId &&
        e.year === prevDate.getFullYear() &&
        e.month === prevDate.getMonth() + 1,
    ) ?? null;

  // Hydrate values from existing entry whenever active hotel changes.
  React.useEffect(() => {
    if (!hotel) return;
    if (thisMonth) {
      setValues({
        electricity_kwh: thisMonth.electricity_kwh?.toString() ?? "",
        gas_kwh: thisMonth.gas_kwh?.toString() ?? "",
        water_m3: thisMonth.water_m3?.toString() ?? "",
        waste_kg: thisMonth.waste_kg?.toString() ?? "",
        occupied_room_nights: thisMonth.occupied_room_nights?.toString() ?? "",
      });
    } else {
      setValues({ ...EMPTY });
    }
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

  async function save() {
    if (!hotel) return;
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
      year: expected.year,
      month: expected.month,
      electricity_kwh: num(values.electricity_kwh),
      gas_kwh: num(values.gas_kwh),
      water_m3: num(values.water_m3),
      waste_kg: num(values.waste_kg),
      occupied_room_nights: num(values.occupied_room_nights),
    };
    const { data, error } = thisMonth
      ? await supabase
          .from("monthly_entries")
          .update(payload)
          .eq("id", thisMonth.id)
          .select()
          .single()
      : await supabase.from("monthly_entries").insert(payload).select().single();
    setSaving(false);
    if (error || !data) {
      toast.error("Could not save. Try again.");
      return;
    }
    setEntries((prev) => {
      const filtered = prev.filter(
        (e) =>
          !(
            e.hotel_id === hotel.id &&
            e.year === expected.year &&
            e.month === expected.month
          ),
      );
      return [...filtered, data as MonthlyEntry];
    });
    toast.success(`${monthLabel} saved for ${hotel.name}.`);
  }

  const co2eThis = thisMonth ? calculateCO2e(thisMonth) : 0;
  const co2ePrev = prevMonth ? calculateCO2e(prevMonth) : 0;
  const co2eChange = pctChange(co2eThis, co2ePrev);

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <EasyHeader />

      <main className="mx-auto w-full max-w-3xl px-5 pb-24 pt-6">
        <Link
          to="/easy"
          className="mb-5 inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to home
        </Link>

        {loading ? (
          <div className="flex justify-center py-16 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : !hotel ? (
          <div className="rounded-3xl border border-dashed border-border/60 bg-card p-8 text-center text-sm text-muted-foreground">
            No hotel selected. Go back to home and pick one.
          </div>
        ) : (
          <>
            {/* Hotel switcher */}
            {hotels.length > 1 && (
              <div className="mb-6 flex flex-wrap gap-1.5">
                {hotels.map((h) => (
                  <button
                    key={h.id}
                    type="button"
                    onClick={() => {
                      setActiveId(h.id);
                      setActiveHotelId(h.id);
                    }}
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition ${
                      h.id === activeId
                        ? "bg-primary text-primary-foreground"
                        : "border border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    <Building2 className="h-3 w-3" />
                    {h.name}
                  </button>
                ))}
              </div>
            )}

            {/* Hero */}
            <section className="mb-8">
              <h1 className="font-serif text-3xl font-semibold leading-tight text-foreground md:text-4xl">
                {hotel.name}
              </h1>
              <p className="mt-2 text-sm text-muted-foreground md:text-base">
                {hotel.region} · {hotel.rooms} rooms · {hotel.star_rating}★
              </p>
            </section>

            {/* This month carbon snapshot */}
            <section className="mb-8 rounded-3xl border border-success/30 bg-success/5 p-5 text-center md:p-6">
              <Leaf className="mx-auto mb-2 h-5 w-5 text-success" />
              <div className="text-xs uppercase tracking-wider text-muted-foreground">
                {monthLabel} carbon
              </div>
              <div className="mt-1 font-serif text-3xl font-semibold text-foreground num">
                {thisMonth ? `${formatNumber(Math.round(co2eThis))} kg CO₂e` : "—"}
              </div>
              {co2eChange != null && (
                <div
                  className={`mt-2 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${
                    co2eChange <= 0
                      ? "bg-success/15 text-success"
                      : "bg-warning/15 text-warning"
                  }`}
                >
                  {co2eChange <= 0 ? (
                    <TrendingDown className="h-3 w-3" />
                  ) : (
                    <TrendingUp className="h-3 w-3" />
                  )}
                  {co2eChange > 0 ? "+" : ""}
                  {co2eChange.toFixed(0)}% vs last month
                </div>
              )}
            </section>

            {/* Inline log */}
            <section className="mb-10">
              <h2 className="mb-1 font-serif text-2xl font-semibold text-foreground md:text-3xl">
                {thisMonth ? `Edit ${monthLabel}` : `Log ${monthLabel}`}
              </h2>
              <p className="mb-5 text-sm text-muted-foreground">
                Just type the numbers from your bills. Tap save when you're done.
              </p>

              <div className="space-y-2.5 rounded-3xl border border-border/60 bg-card p-4 md:p-5">
                {FIELDS.map((f) => {
                  const prevVal = prevMonth ? (prevMonth[f.key] as number | null) : null;
                  const curr = values[f.key];
                  const currNum = curr.trim() === "" ? null : Number(curr.replace(/,/g, ""));
                  const change =
                    prevVal != null && currNum != null && Number.isFinite(currNum)
                      ? pctChange(currNum, prevVal)
                      : null;
                  return (
                    <label
                      key={f.key}
                      className="flex items-center gap-3 rounded-2xl border border-border/60 bg-background px-3 py-2.5 focus-within:border-primary/60"
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
                            onChange={(e) =>
                              setValues((p) => ({ ...p, [f.key]: e.target.value }))
                            }
                            placeholder={prevVal != null ? formatNumber(prevVal) : "0"}
                            className="w-full bg-transparent text-base font-medium text-foreground outline-none placeholder:text-muted-foreground/50"
                          />
                          <span className="text-xs text-muted-foreground">{f.unit}</span>
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

                <button
                  type="button"
                  onClick={() => void save()}
                  disabled={saving}
                  className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-2xl bg-primary px-4 py-3 text-base font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
                >
                  {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" />
                  )}
                  Save {monthLabel}
                </button>
              </div>
            </section>

            {/* Faster ways to fill in — parity with Standard view */}
            <section className="mb-10">
              <h2 className="mb-1 font-serif text-xl font-semibold text-foreground">
                Faster ways to fill this in
              </h2>
              <p className="mb-4 text-sm text-muted-foreground">
                Upload a bill, dictate, or paste from email — Sera does the typing.
              </p>
              <div className="grid gap-3 sm:grid-cols-3">
                <ToolToggle icon={Upload} title="Upload bills" subtitle="We'll read the numbers." active={openTool === "upload"} onClick={() => setOpenTool((t) => (t === "upload" ? null : "upload"))} />
                <ToolToggle icon={Mic} title="Read it out" subtitle="Speak the numbers." active={openTool === "voice"} onClick={() => setOpenTool((t) => (t === "voice" ? null : "voice"))} />
                <ToolToggle icon={Wand2} title="Paste from email" subtitle="We'll parse the text." active={openTool === "paste"} onClick={() => setOpenTool((t) => (t === "paste" ? null : "paste"))} />
              </div>
              {openTool && (
                <div className="mt-4 rounded-3xl border border-border/60 bg-card p-4 md:p-5">
                  {openTool === "upload" && <InvoiceUploadCard entries={entries} onSaved={() => void reload()} />}
                  {openTool === "voice" && <VoiceLogCard entries={entries} onSaved={() => void reload()} />}
                  {openTool === "paste" && <SmartPasteCard entries={entries} onSaved={() => void reload()} />}
                </div>
              )}
            </section>

            {/* Tips */}
            <section className="mb-10 rounded-3xl border border-border/60 bg-card p-5 md:p-6">
              <div className="mb-3 flex items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                What Sera suggests for this hotel
              </div>
              {insightsLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Looking…
                </div>
              ) : insights.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Log a couple of months and tips will appear here.
                </p>
              ) : (
                <ul className="space-y-2.5">
                  {insights.slice(0, 3).map((ins, i) => (
                    <li key={i} className="rounded-2xl border border-border/60 bg-background p-3.5">
                      <div className="text-sm font-semibold text-foreground">{ins.title}</div>
                      <p className="mt-1 text-sm text-muted-foreground">{ins.body}</p>
                      <button
                        type="button"
                        onClick={() => void askSeraAbout(`Walk me through how to do this for ${hotel?.name ?? "my hotel"}, step by step in plain language: "${ins.title}". Keep it under 6 short bullets.`, `How to: ${ins.title}`)}
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

            {/* Ask Sera prompt */}
            {hotel && (
              <section className="mb-10 rounded-3xl border border-primary/20 bg-primary/5 p-5">
                <div className="mb-3 flex items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                  Ask Sera about {hotel.name}
                </div>
                <div className="flex flex-wrap gap-2">
                  {[
                    `Why might my CO₂ have changed at ${hotel.name} this month?`,
                    `What's the single biggest opportunity at ${hotel.name}?`,
                    `How do I compare to similar ${hotel.star_rating}★ hotels in ${hotel.region}?`,
                  ].map((q) => (
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
              </section>
            )}
          </>
        )}
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
        active ? "border-primary bg-primary/10 shadow-sm" : "border-border/60 bg-card hover:border-primary/40 hover:shadow-sm"
      }`}
    >
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${active ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary"}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-foreground">{title}</div>
        <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
      </div>
      <ChevronDown className={`mt-2 h-4 w-4 shrink-0 text-muted-foreground transition-transform ${active ? "rotate-180 text-primary" : ""}`} />
    </button>
  );
}
