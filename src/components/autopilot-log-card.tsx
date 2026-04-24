import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Bolt,
  CheckCircle2,
  ChevronRight,
  Droplets,
  Flame,
  Loader2,
  Plane,
  Send,
  Sparkles,
  Trash2,
  Users,
  Wand2,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

import { supabase } from "@/integrations/supabase/client";
import { getActiveHotelId, type MonthlyEntry } from "@/lib/hotel";
import { MONTH_NAMES } from "@/lib/format";
import { parseAutopilotReply, type SmartMetric } from "@/server/assistant.functions";

interface AutopilotLogCardProps {
  entries: MonthlyEntry[];
  onSaved: () => void;
}

const METRIC_META: Record<
  SmartMetric,
  {
    label: string;
    unit: string;
    icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
    color: string;
    column: keyof Pick<
      MonthlyEntry,
      "electricity_kwh" | "gas_kwh" | "water_m3" | "waste_kg" | "occupied_room_nights"
    >;
  }
> = {
  electricity_kwh: { label: "Electricity", unit: "kWh", icon: Bolt, color: "var(--chart-3)", column: "electricity_kwh" },
  gas_kwh: { label: "Gas", unit: "kWh", icon: Flame, color: "var(--chart-1)", column: "gas_kwh" },
  water_m3: { label: "Water", unit: "m³", icon: Droplets, color: "var(--chart-2)", column: "water_m3" },
  waste_kg: { label: "Waste", unit: "kg", icon: Trash2, color: "var(--chart-5)", column: "waste_kg" },
  occupied_room_nights: { label: "Room-nights", unit: "nights", icon: Users, color: "var(--chart-4)", column: "occupied_room_nights" },
};

// Order matters — the conversation walks the metrics in this sequence.
const METRIC_ORDER: SmartMetric[] = [
  "electricity_kwh",
  "gas_kwh",
  "water_m3",
  "waste_kg",
  "occupied_room_nights",
];

type ChatMsg =
  | { id: string; role: "sera"; text: string; metric?: SmartMetric; predicted?: number | null }
  | { id: string; role: "user"; text: string }
  | { id: string; role: "sera-confirm"; text: string; metric: SmartMetric; value: number | null };

interface MetricResult {
  metric: SmartMetric;
  value: number | null; // null = skipped
  predicted: number | null;
  lastYear: number | null;
  source: "predicted" | "delta" | "literal" | "skipped" | "ai";
  note?: string;
}

/**
 * Predict next value for a metric from the most recent entries.
 * Strategy: average the last-3-months ratio of (current vs same month prior year).
 * Falls back to: same month prior year, then last entry's value.
 */
function predictNext(
  entries: MonthlyEntry[],
  metric: SmartMetric,
  targetYear: number,
  targetMonth: number,
): { predicted: number | null; lastYear: number | null } {
  const col = METRIC_META[metric].column;
  const values = entries
    .map((e) => ({ year: e.year, month: e.month, v: e[col] as number | null }))
    .filter((x) => x.v !== null && x.v !== undefined && x.v >= 0) as {
    year: number;
    month: number;
    v: number;
  }[];
  if (values.length === 0) return { predicted: null, lastYear: null };

  const lastYear =
    values.find((x) => x.year === targetYear - 1 && x.month === targetMonth)?.v ?? null;

  // Recent year-over-year ratios (up to 3)
  const ratios: number[] = [];
  for (const v of values.slice(-6).reverse()) {
    const py = values.find((x) => x.year === v.year - 1 && x.month === v.month);
    if (py && py.v > 0) {
      ratios.push(v.v / py.v);
      if (ratios.length >= 3) break;
    }
  }
  const avgRatio = ratios.length ? ratios.reduce((a, b) => a + b, 0) / ratios.length : 1;

  if (lastYear !== null) {
    return { predicted: Math.round(lastYear * avgRatio), lastYear };
  }
  // No same-month-last-year — use the most recent value as a flat baseline.
  const last = values[values.length - 1];
  return { predicted: Math.round(last.v), lastYear: null };
}

/**
 * Try to parse the user's reply locally without calling the AI.
 * Returns null if we should fall back to the AI parser.
 */
function parseReplyLocal(
  reply: string,
  predicted: number | null,
  lastYear: number | null,
): { value: number | null; intent: "value" | "skip"; note: string } | null {
  const t = reply.trim().toLowerCase();
  if (!t) return null;

  // Skip / unknown intents
  if (/^(skip|idk|i don'?t know|no idea|pas|sais pas|next|later|unsure|dunno)\b/.test(t)) {
    return { value: null, intent: "skip", note: "Skipped" };
  }

  // Confirm prediction
  if (
    /^(y|yes|yep|yeah|ok|okay|sure|same|same as expected|correct|right|looks? (good|right|fine)|confirm|✓|👍)\b/.test(t) &&
    predicted !== null
  ) {
    return { value: predicted, intent: "value", note: `Confirmed prediction (${predicted.toLocaleString()})` };
  }

  // "like last year"
  if (/last year|same as last year|comme l'an/i.test(t) && lastYear !== null) {
    return { value: lastYear, intent: "value", note: "Used last year's value" };
  }

  // ±N%  (e.g. "+5%", "-10%", "5% more", "down 8%", "up 3 percent")
  const pctMatch =
    t.match(/([+-]?)\s*(\d+(?:[.,]\d+)?)\s*%/) ??
    t.match(/(?:up|more|higher|plus|\+)\s*(\d+(?:[.,]\d+)?)\s*(?:%|percent)/) ??
    t.match(/(?:down|less|lower|minus|-)\s*(\d+(?:[.,]\d+)?)\s*(?:%|percent)/);
  if (pctMatch && predicted !== null) {
    const negative = /down|less|lower|minus|-/.test(t);
    const num = Number(pctMatch[pctMatch.length - 1].replace(",", "."));
    if (Number.isFinite(num)) {
      const sign = negative || pctMatch[1] === "-" ? -1 : 1;
      const value = Math.max(0, Math.round(predicted * (1 + (sign * num) / 100)));
      return {
        value,
        intent: "value",
        note: `${sign > 0 ? "+" : "−"}${num}% from prediction`,
      };
    }
  }

  // Plain number with optional K suffix and thousand separators.
  // Accept: "12500", "12,500", "12.5k", "1 200", "1.2K"
  const numMatch = t
    .replace(/[\s'_]/g, "")
    .match(/^[+-]?(\d{1,3}(?:[,.]?\d{3})*|\d+)(?:[,.](\d+))?\s*([km]?)\b/);
  if (numMatch) {
    const intPart = numMatch[1].replace(/[,.]/g, "");
    const decPart = numMatch[2];
    let value = Number(decPart ? `${intPart}.${decPart}` : intPart);
    const suffix = numMatch[3];
    if (suffix === "k") value *= 1000;
    else if (suffix === "m") value *= 1_000_000;
    if (Number.isFinite(value) && value >= 0) {
      return { value: Math.round(value), intent: "value", note: "Used the number you typed" };
    }
  }

  return null; // → AI fallback
}

function quickReplies(predicted: number | null): { label: string; reply: string }[] {
  const out: { label: string; reply: string }[] = [];
  if (predicted !== null) {
    out.push({ label: `≈ ${predicted.toLocaleString()}`, reply: "yes" });
    out.push({ label: "+5%", reply: "+5%" });
    out.push({ label: "−5%", reply: "-5%" });
  }
  out.push({ label: "Skip", reply: "skip" });
  return out;
}

export function AutopilotLogCard({ entries, onSaved }: AutopilotLogCardProps) {
  const parseReply = useServerFn(parseAutopilotReply);
  const [messages, setMessages] = React.useState<ChatMsg[]>([]);
  const [input, setInput] = React.useState("");
  const [stepIdx, setStepIdx] = React.useState<number>(-1); // -1 = not started
  const [results, setResults] = React.useState<MetricResult[]>([]);
  const [thinking, setThinking] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [done, setDone] = React.useState(false);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Target month = the next un-logged month after the latest entry.
  const target = React.useMemo(() => {
    const sorted = [...entries].sort((a, b) =>
      a.year !== b.year ? a.year - b.year : a.month - b.month,
    );
    const last = sorted[sorted.length - 1];
    const now = new Date();
    let year = now.getFullYear();
    let month = now.getMonth() + 1;
    if (last) {
      // Suggest the month right after the latest entry, capped at "this month".
      let m = last.month + 1;
      let y = last.year;
      if (m > 12) {
        m = 1;
        y += 1;
      }
      if (y < year || (y === year && m <= month)) {
        year = y;
        month = m;
      }
    }
    return { year, month };
  }, [entries]);

  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, thinking]);

  const start = React.useCallback(() => {
    const first = METRIC_ORDER[0];
    const meta = METRIC_META[first];
    const { predicted, lastYear } = predictNext(entries, first, target.year, target.month);
    setResults([{ metric: first, value: null, predicted, lastYear, source: "skipped" }]);
    const intro: ChatMsg = {
      id: `intro-${Date.now()}`,
      role: "sera",
      text: `Hi 👋 — let's log **${MONTH_NAMES[target.month - 1]} ${target.year}** together. I'll ask one question at a time and pre-fill what I expect from your history. Reply however you like: a number, "yes", "+5%", or "skip".`,
    };
    const ask: ChatMsg = {
      id: `ask-${first}-${Date.now()}`,
      role: "sera",
      metric: first,
      predicted,
      text: predicted !== null
        ? `**${meta.label}** for ${MONTH_NAMES[target.month - 1]} — based on your history I'm expecting around **${predicted.toLocaleString()} ${meta.unit}**. Sound right?`
        : `**${meta.label}** for ${MONTH_NAMES[target.month - 1]} — I don't have history yet. What was it (in ${meta.unit})?`,
    };
    setMessages([intro, ask]);
    setStepIdx(0);
    setDone(false);
    // Focus the input after a tick so keyboard users can just type.
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [entries, target]);

  const reset = React.useCallback(() => {
    setMessages([]);
    setResults([]);
    setStepIdx(-1);
    setInput("");
    setDone(false);
  }, []);

  const advance = React.useCallback(
    (currentResults: MetricResult[]) => {
      const nextIdx = stepIdx + 1;
      if (nextIdx >= METRIC_ORDER.length) {
        // Done — show summary card.
        setStepIdx(nextIdx);
        const captured = currentResults.filter((r) => r.value !== null).length;
        setMessages((prev) => [
          ...prev,
          {
            id: `done-${Date.now()}`,
            role: "sera",
            text: captured === 0
              ? "We didn't capture any values. Want to start over?"
              : `That's everything! I've drafted **${captured} value${captured === 1 ? "" : "s"}** for ${MONTH_NAMES[target.month - 1]} ${target.year}. Review the summary below and hit save when you're ready.`,
          },
        ]);
        setDone(true);
        return;
      }
      const next = METRIC_ORDER[nextIdx];
      const meta = METRIC_META[next];
      const { predicted, lastYear } = predictNext(entries, next, target.year, target.month);
      setResults((prev) => [
        ...prev,
        { metric: next, value: null, predicted, lastYear, source: "skipped" },
      ]);
      setMessages((prev) => [
        ...prev,
        {
          id: `ask-${next}-${Date.now()}`,
          role: "sera",
          metric: next,
          predicted,
          text: predicted !== null
            ? `Now **${meta.label.toLowerCase()}** — expecting around **${predicted.toLocaleString()} ${meta.unit}**?`
            : `Now **${meta.label.toLowerCase()}** — what was it (in ${meta.unit})?`,
        },
      ]);
      setStepIdx(nextIdx);
      requestAnimationFrame(() => inputRef.current?.focus());
    },
    [entries, stepIdx, target],
  );

  const handleSubmit = React.useCallback(
    async (rawReply: string) => {
      const reply = rawReply.trim();
      if (!reply || stepIdx < 0 || stepIdx >= METRIC_ORDER.length || thinking) return;
      const metric = METRIC_ORDER[stepIdx];
      const meta = METRIC_META[metric];
      const current = results[stepIdx];
      const predicted = current?.predicted ?? null;
      const lastYear = current?.lastYear ?? null;

      // Echo user message
      setMessages((prev) => [...prev, { id: `u-${Date.now()}`, role: "user", text: reply }]);
      setInput("");

      // Try local parser first — instant, no AI roundtrip.
      const local = parseReplyLocal(reply, predicted, lastYear);
      let value: number | null = null;
      let intent: "value" | "skip" | "unknown" = "unknown";
      let note = "";
      let source: MetricResult["source"] = "skipped";

      if (local) {
        value = local.value;
        intent = local.intent;
        note = local.note;
        if (local.intent === "skip") {
          source = "skipped";
        } else if (predicted !== null && value === predicted) {
          source = "predicted";
        } else if (predicted !== null && Math.abs((value ?? 0) - predicted) <= predicted * 0.5) {
          source = "delta";
        } else {
          source = "literal";
        }
      } else {
        // Hand off to the AI parser.
        setThinking(true);
        try {
          const res = await parseReply({
            data: { reply, metric, unit: meta.unit, predicted, lastYear },
          });
          if (!res.ok) {
            toast.error(res.error);
            setThinking(false);
            setMessages((prev) => [
              ...prev,
              {
                id: `e-${Date.now()}`,
                role: "sera",
                text: "Hmm, I couldn't parse that — try a number, a percentage, or 'skip'.",
              },
            ]);
            return;
          }
          intent = res.intent;
          value = res.value;
          note = res.note ?? "";
          source = "ai";
        } catch (e) {
          console.error(e);
          toast.error("AI parser failed — please try again.");
          setThinking(false);
          return;
        }
        setThinking(false);
      }

      if (intent === "unknown") {
        setMessages((prev) => [
          ...prev,
          {
            id: `clar-${Date.now()}`,
            role: "sera",
            text: predicted !== null
              ? `Sorry, didn't catch that. You can say **yes** (≈${predicted.toLocaleString()}), a number, **+5%**, or **skip**.`
              : "Sorry, didn't catch that — try a number or **skip**.",
          },
        ]);
        return;
      }

      // Persist the result.
      const updated = results.map((r, i) =>
        i === stepIdx ? { ...r, value, source, note } : r,
      );
      setResults(updated);
      setMessages((prev) => [
        ...prev,
        {
          id: `c-${Date.now()}`,
          role: "sera-confirm",
          metric,
          value,
          text:
            value === null
              ? `Skipping ${meta.label.toLowerCase()}.`
              : `Got it — **${value.toLocaleString()} ${meta.unit}** for ${meta.label.toLowerCase()}. ${note ? `_(${note})_` : ""}`,
        },
      ]);
      // Move to the next metric.
      advance(updated);
    },
    [advance, parseReply, results, stepIdx, thinking],
  );

  const handleSave = React.useCallback(async () => {
    const captured = results.filter((r) => r.value !== null);
    if (captured.length === 0) {
      toast.error("Nothing to save — answer at least one question.");
      return;
    }
    setSaving(true);
    const hotelId = getActiveHotelId();
    const { data: existing } = await supabase
      .from("monthly_entries")
      .select("*")
      .eq("hotel_id", hotelId)
      .eq("year", target.year)
      .eq("month", target.month)
      .maybeSingle();
    const captured_map = new Map<SmartMetric, number>();
    for (const r of captured) {
      if (r.value !== null) captured_map.set(r.metric, r.value);
    }
    const payload = {
      hotel_id: hotelId,
      year: target.year,
      month: target.month,
      electricity_kwh:
        captured_map.get("electricity_kwh") ?? existing?.electricity_kwh ?? null,
      gas_kwh: captured_map.get("gas_kwh") ?? existing?.gas_kwh ?? null,
      water_m3: captured_map.get("water_m3") ?? existing?.water_m3 ?? null,
      waste_kg: captured_map.get("waste_kg") ?? existing?.waste_kg ?? null,
      occupied_room_nights:
        captured_map.get("occupied_room_nights") ?? existing?.occupied_room_nights ?? null,
    };
    const { error } = existing
      ? await supabase.from("monthly_entries").update(payload).eq("id", existing.id)
      : await supabase.from("monthly_entries").insert(payload);
    setSaving(false);
    if (error) {
      toast.error("Couldn't save — try again.");
      return;
    }
    toast.success(`Saved ${captured.length} value${captured.length === 1 ? "" : "s"} for ${MONTH_NAMES[target.month - 1]} ${target.year}.`);
    onSaved();
    reset();
  }, [results, target, onSaved, reset]);

  const currentMetric = stepIdx >= 0 && stepIdx < METRIC_ORDER.length ? METRIC_ORDER[stepIdx] : null;
  const currentPredicted = currentMetric ? results[stepIdx]?.predicted ?? null : null;
  const replies = currentMetric ? quickReplies(currentPredicted) : [];
  const captured = results.filter((r) => r.value !== null);
  const progress = stepIdx < 0 ? 0 : Math.min(stepIdx, METRIC_ORDER.length) / METRIC_ORDER.length;

  return (
    <Card className="overflow-hidden border-border bg-card">
      <div className="border-b border-border bg-gradient-to-br from-primary/5 via-card to-secondary/5 px-6 py-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="mb-1 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
              <Plane className="h-3 w-3" /> Sera Autopilot
            </div>
            <h3 className="font-serif text-xl font-semibold">Let Sera ask the questions</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              I look at your history, predict each value for{" "}
              <span className="font-medium">
                {MONTH_NAMES[target.month - 1]} {target.year}
              </span>
              , and ask one quick question at a time. Reply with a number, "yes", "+5%", or just "skip".
            </p>
          </div>
          {(messages.length > 0 || done) && (
            <Button variant="ghost" size="sm" onClick={reset} className="text-muted-foreground">
              <X className="mr-1 h-3.5 w-3.5" /> Clear
            </Button>
          )}
        </div>
        {/* Progress bar */}
        {stepIdx >= 0 && !done && (
          <div className="mt-4 h-1 overflow-hidden rounded-full bg-muted">
            <motion.div
              className="h-full bg-gradient-to-r from-primary to-secondary"
              animate={{ width: `${progress * 100}%` }}
              transition={{ duration: 0.4, ease: "easeOut" }}
            />
          </div>
        )}
      </div>

      <div className="px-6 py-5">
        {/* Empty state */}
        {stepIdx < 0 && (
          <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-border bg-muted/30 px-4 py-10 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-primary to-secondary text-primary-foreground shadow-[0_8px_30px_-8px_var(--chart-3)]">
              <Sparkles className="h-7 w-7" />
            </div>
            <div className="max-w-md">
              <div className="font-semibold">One tap. Five quick questions.</div>
              <p className="mt-1 text-sm text-muted-foreground">
                I'll predict each value from your past months so you usually only need to type "yes". The whole month takes about 30 seconds.
              </p>
            </div>
            <Button
              onClick={start}
              size="lg"
              disabled={entries.length === 0}
              className="bg-gradient-to-r from-primary to-secondary text-primary-foreground hover:opacity-90"
            >
              <Wand2 className="mr-2 h-4 w-4" /> Start Autopilot
            </Button>
            {entries.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Autopilot needs at least one previous month to predict from. Try voice or smart input first.
              </p>
            )}
          </div>
        )}

        {/* Conversation */}
        {stepIdx >= 0 && (
          <>
            <div
              ref={scrollRef}
              className="mb-4 max-h-[420px] space-y-3 overflow-y-auto rounded-2xl border border-border bg-background/40 px-4 py-4"
            >
              <AnimatePresence initial={false}>
                {messages.map((m) => (
                  <motion.div
                    key={m.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.18 }}
                    className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed ${
                        m.role === "user"
                          ? "bg-primary text-primary-foreground"
                          : m.role === "sera-confirm"
                            ? "border border-emerald-500/30 bg-emerald-500/5 text-foreground"
                            : "border border-border bg-card text-foreground"
                      }`}
                    >
                      {m.role === "sera-confirm" && (
                        <span className="mr-1 inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                          <CheckCircle2 className="h-3 w-3" /> Captured
                        </span>
                      )}
                      <RenderMd text={m.text} />
                    </div>
                  </motion.div>
                ))}
                {thinking && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex justify-start"
                  >
                    <div className="rounded-2xl border border-border bg-card px-3.5 py-2 text-sm text-muted-foreground">
                      <span className="inline-flex items-center gap-2">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Sera is thinking…
                      </span>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Input + quick replies */}
            {!done && currentMetric && (
              <>
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {replies.map((r) => (
                    <button
                      key={r.label}
                      type="button"
                      disabled={thinking}
                      onClick={() => handleSubmit(r.reply)}
                      className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-3 py-1 text-xs text-muted-foreground transition hover:border-primary/40 hover:bg-primary/5 hover:text-foreground disabled:opacity-50"
                    >
                      {r.label === "Skip" ? <ChevronRight className="h-3 w-3" /> : null}
                      {r.label}
                    </button>
                  ))}
                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSubmit(input);
                  }}
                  className="flex items-center gap-2"
                >
                  <Input
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder='Type a number, "yes", "+5%", or "skip"…'
                    disabled={thinking}
                    className="h-10 flex-1"
                  />
                  <Button
                    type="submit"
                    disabled={thinking || !input.trim()}
                    className="h-10 bg-gradient-to-r from-primary to-secondary text-primary-foreground hover:opacity-90"
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </form>
              </>
            )}

            {/* Summary + save */}
            {done && (
              <div className="rounded-2xl border border-primary/30 bg-primary/5 px-4 py-4">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold">
                      Summary — {MONTH_NAMES[target.month - 1]} {target.year}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {captured.length} of {METRIC_ORDER.length} values captured
                    </div>
                  </div>
                </div>
                <ul className="space-y-1.5">
                  {results.map((r) => {
                    const meta = METRIC_META[r.metric];
                    const Icon = meta.icon;
                    return (
                      <li
                        key={r.metric}
                        className={`flex items-center gap-3 rounded-xl border px-3 py-2 text-sm ${
                          r.value === null
                            ? "border-border bg-muted/30 text-muted-foreground"
                            : "border-border bg-card"
                        }`}
                      >
                        <div
                          className="flex h-8 w-8 items-center justify-center rounded-lg"
                          style={{
                            background: `color-mix(in oklab, ${meta.color} 15%, transparent)`,
                            color: meta.color,
                          }}
                        >
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="flex-1">
                          <div className="font-medium">{meta.label}</div>
                          {r.note && r.value !== null && (
                            <div className="text-[11px] text-muted-foreground">{r.note}</div>
                          )}
                        </div>
                        <div className="text-right">
                          {r.value === null ? (
                            <span className="text-xs italic">skipped</span>
                          ) : (
                            <span className="font-semibold">
                              {r.value.toLocaleString()}{" "}
                              <span className="text-xs font-normal text-muted-foreground">{meta.unit}</span>
                            </span>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
                <div className="mt-4 flex items-center justify-end gap-2">
                  <Button variant="ghost" size="sm" onClick={reset}>
                    Start over
                  </Button>
                  <Button
                    onClick={handleSave}
                    disabled={saving || captured.length === 0}
                    className="bg-gradient-to-r from-primary to-secondary text-primary-foreground hover:opacity-90"
                  >
                    {saving ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving…
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="mr-2 h-4 w-4" /> Save{" "}
                        {MONTH_NAMES[target.month - 1]} {target.year}
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </Card>
  );
}

// Tiny inline markdown renderer — supports **bold** and _italic_ only.
function RenderMd({ text }: { text: string }) {
  const parts = React.useMemo(() => {
    const out: React.ReactNode[] = [];
    let i = 0;
    let key = 0;
    const re = /(\*\*([^*]+)\*\*|_([^_]+)_)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      if (m.index > i) out.push(text.slice(i, m.index));
      if (m[2] !== undefined) {
        out.push(<strong key={key++}>{m[2]}</strong>);
      } else if (m[3] !== undefined) {
        out.push(
          <em key={key++} className="text-muted-foreground">
            {m[3]}
          </em>,
        );
      }
      i = m.index + m[0].length;
    }
    if (i < text.length) out.push(text.slice(i));
    return out;
  }, [text]);
  return <>{parts}</>;
}
