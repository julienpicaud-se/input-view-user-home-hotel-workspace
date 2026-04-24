import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  AlertTriangle,
  AudioLines,
  Bolt,
  CheckCircle2,
  Droplets,
  Flame,
  Loader2,
  Mic,
  MicOff,
  ShieldCheck,
  Sparkles,
  Square,
  Trash2,
  Users,
  Wand2,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { supabase } from "@/integrations/supabase/client";
import { getActiveHotelId, type MonthlyEntry } from "@/lib/hotel";
import { MONTH_NAMES } from "@/lib/format";
import {
  extractSmartInput,
  type SmartEntry,
  type SmartMetric,
} from "@/server/assistant.functions";

interface VoiceLogCardProps {
  entries: MonthlyEntry[];
  onSaved: () => void;
}

const METRIC_META: Record<
  SmartMetric,
  { label: string; unit: string; icon: React.ComponentType<React.SVGProps<SVGSVGElement>>; color: string }
> = {
  electricity_kwh: { label: "Electricity", unit: "kWh", icon: Bolt, color: "var(--chart-3)" },
  gas_kwh: { label: "Gas", unit: "kWh", icon: Flame, color: "var(--chart-1)" },
  water_m3: { label: "Water", unit: "m³", icon: Droplets, color: "var(--chart-2)" },
  waste_kg: { label: "Waste", unit: "kg", icon: Trash2, color: "var(--chart-5)" },
  occupied_room_nights: { label: "Occupied room-nights", unit: "nights", icon: Users, color: "var(--chart-4)" },
};

const PROMPTS: { text: string; lang: "en" | "fr" }[] = [
  { text: "Last month we used about twelve thousand four hundred kilowatt-hours of electricity and two hundred thirty cubic metres of water.", lang: "en" },
  { text: "In March, gas was one thousand eight hundred kWh and we had two thousand one hundred fifty room-nights.", lang: "en" },
  { text: "En avril : électricité douze mille quatre cents kilowattheures, eau deux cent trente mètres cubes, déchets une virgule deux tonnes.", lang: "fr" },
];

type DraftRow = SmartEntry & { id: string; selected: boolean; reviewed: boolean };

// Minimal typing for the Web Speech API (vendor-prefixed in most browsers).
type SpeechRecognitionAlternativeLike = { transcript: string; confidence?: number };
type SpeechRecognitionResultLike = {
  isFinal: boolean;
  0: SpeechRecognitionAlternativeLike;
};
type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
};
type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
};

function getSpeechRecognitionCtor():
  | (new () => SpeechRecognitionLike)
  | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

// Bilingual auto-detect: we run two recognizers in parallel (en + fr) and pick
// the lane with the strongest score = Σ(confidence × wordCount) on FINAL results.
type LangCode = "en" | "fr";
const LANGS: { code: LangCode; bcp47: string; flag: string; label: string }[] = [
  { code: "en", bcp47: "en-US", flag: "🇬🇧", label: "English" },
  { code: "fr", bcp47: "fr-FR", flag: "🇫🇷", label: "Français" },
];

interface RecognizerLane {
  code: LangCode;
  rec: SpeechRecognitionLike;
  finalText: string;
  interimText: string;
  score: number;
}

export function VoiceLogCard({ entries: _entries, onSaved }: VoiceLogCardProps) {
  const extract = useServerFn(extractSmartInput);
  const [supported, setSupported] = React.useState<boolean | null>(null);
  const [listening, setListening] = React.useState(false);
  // Mirrored copies of each lane's transcript for live rendering.
  const [laneTexts, setLaneTexts] = React.useState<
    Record<LangCode, { final: string; interim: string; score: number }>
  >({
    en: { final: "", interim: "", score: 0 },
    fr: { final: "", interim: "", score: 0 },
  });
  const [detectedLang, setDetectedLang] = React.useState<LangCode | null>(null);
  const [extracting, setExtracting] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [drafts, setDrafts] = React.useState<DraftRow[]>([]);
  const [summary, setSummary] = React.useState<string>("");
  const [warnings, setWarnings] = React.useState<string[]>([]);
  const [confidence, setConfidence] = React.useState<"high" | "medium" | "low" | null>(null);
  const [level, setLevel] = React.useState(0);
  const lanesRef = React.useRef<RecognizerLane[]>([]);

  React.useEffect(() => {
    setSupported(getSpeechRecognitionCtor() !== null);
  }, []);

  // Soft pulsing waveform while listening (purely visual)
  React.useEffect(() => {
    if (!listening) {
      setLevel(0);
      return;
    }
    let raf = 0;
    const tick = () => {
      setLevel(0.35 + Math.random() * 0.65);
      raf = window.setTimeout(tick, 120) as unknown as number;
    };
    tick();
    return () => window.clearTimeout(raf);
  }, [listening]);

  // Pick the lane with the highest accumulated score; fall back to whichever has text.
  const pickWinner = React.useCallback((lanes: RecognizerLane[]): LangCode | null => {
    const scored = lanes.filter((l) => l.score > 0 || l.finalText.trim());
    if (scored.length === 0) return null;
    return scored.reduce((best, cur) =>
      cur.score > best.score ||
      (cur.score === best.score && cur.finalText.length > best.finalText.length)
        ? cur
        : best,
    ).code;
  }, []);

  const stopAllLanes = React.useCallback(() => {
    for (const l of lanesRef.current) {
      try {
        l.rec.stop();
      } catch {
        // ignore
      }
    }
  }, []);

  const startListening = React.useCallback(() => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      toast.error("Voice input isn't supported in this browser. Try Chrome, Edge or Safari.");
      return;
    }
    // Reset everything before a new session
    setLaneTexts({ en: { final: "", interim: "", score: 0 }, fr: { final: "", interim: "", score: 0 } });
    setDetectedLang(null);
    setDrafts([]);
    setSummary("");
    setWarnings([]);
    setConfidence(null);

    let micErrorShown = false;
    const lanes: RecognizerLane[] = LANGS.map(({ code, bcp47 }) => {
      const rec = new Ctor();
      rec.lang = bcp47;
      rec.continuous = true;
      rec.interimResults = true;
      const lane: RecognizerLane = { code, rec, finalText: "", interimText: "", score: 0 };
      rec.onresult = (e) => {
        let interim = "";
        let finalChunk = "";
        let addedScore = 0;
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i];
          const alt = r[0];
          const txt = alt.transcript;
          if (r.isFinal) {
            finalChunk += txt;
            // Score = confidence × wordCount. If confidence missing (Safari),
            // assume 0.6 so we still get a comparable signal.
            const conf = typeof alt.confidence === "number" && alt.confidence > 0 ? alt.confidence : 0.6;
            const wc = txt.trim().split(/\s+/).filter(Boolean).length;
            addedScore += conf * wc;
          } else {
            interim += txt;
          }
        }
        if (finalChunk) {
          lane.finalText = (lane.finalText ? lane.finalText + " " : "") + finalChunk.trim();
          lane.interimText = "";
          lane.score += addedScore;
        } else {
          lane.interimText = interim;
        }
        // Push into React state
        setLaneTexts((prev) => ({
          ...prev,
          [lane.code]: { final: lane.finalText, interim: lane.interimText, score: lane.score },
        }));
        setDetectedLang(pickWinner(lanesRef.current));
      };
      rec.onend = () => {
        // If user manually stopped or all lanes ended, ensure listening flips off.
        const stillRunning = lanesRef.current.some((other) => other !== lane && other.rec === other.rec);
        if (!stillRunning) {
          setListening(false);
        }
      };
      rec.onerror = (ev) => {
        // 'no-speech' / 'aborted' fire often when one lane disagrees — stay silent.
        if (ev.error === "not-allowed" || ev.error === "service-not-allowed") {
          if (!micErrorShown) {
            toast.error("Microphone access was blocked.");
            micErrorShown = true;
          }
          stopAllLanes();
          setListening(false);
        } else if (ev.error === "language-not-supported") {
          // Browser can't run this language — drop the lane silently.
          console.warn(`Web Speech: ${lane.code} not supported in this browser`);
        } else if (ev.error && ev.error !== "no-speech" && ev.error !== "aborted" && ev.error !== "audio-capture") {
          console.warn("speech lane error", lane.code, ev.error);
        }
      };
      return lane;
    });

    lanesRef.current = lanes;
    let started = 0;
    for (const l of lanes) {
      try {
        l.rec.start();
        started++;
      } catch (e) {
        console.warn("Couldn't start lane", l.code, e);
      }
    }
    if (started === 0) {
      toast.error("Couldn't start the microphone.");
      return;
    }
    setListening(true);
  }, [pickWinner, stopAllLanes]);

  const stopListening = React.useCallback(() => {
    stopAllLanes();
    setListening(false);
  }, [stopAllLanes]);

  React.useEffect(() => {
    return () => {
      for (const l of lanesRef.current) {
        try {
          l.rec.abort();
        } catch {
          // ignore
        }
      }
    };
  }, []);

  // Derived: the transcript we treat as authoritative (winning lane, or whichever has content).
  const winnerLang: LangCode = detectedLang ?? "en";
  const winnerLane = laneTexts[winnerLang];
  const finalText = winnerLane.final;
  const interimText = winnerLane.interim;
  const langMeta = LANGS.find((l) => l.code === winnerLang)!;


  const handleExtract = React.useCallback(async () => {
    const text = (finalText + " " + interimText).trim();
    if (!text) {
      toast.error("Say something first — Sera needs words to work with.");
      return;
    }
    if (listening) stopListening();
    setExtracting(true);
    try {
      const res = await extract({
        data: {
          text,
          currentYear: new Date().getFullYear(),
        },
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      const rows: DraftRow[] = res.extraction.entries.map((e, i) => ({
        ...e,
        id: `${e.year}-${e.month}-${e.metric}-${i}`,
        selected: true,
        // Rows Sera flagged as medium/low must be explicitly confirmed before save.
        reviewed: (e.confidence ?? "high") === "high",
      }));
      setDrafts(rows);
      setSummary(res.extraction.summary);
      setWarnings(res.extraction.warnings);
      setConfidence(res.extraction.confidence);
      if (rows.length === 0) {
        toast("Sera didn't catch any numbers — try rephrasing with units.", { icon: "🎙️" });
      }
    } catch (e) {
      console.error(e);
      toast.error("Couldn't process the voice note.");
    } finally {
      setExtracting(false);
    }
  }, [extract, finalText, interimText, listening, stopListening]);

  const handleSave = React.useCallback(async () => {
    const selected = drafts.filter((d) => d.selected);
    if (selected.length === 0) {
      toast.error("Select at least one row to save.");
      return;
    }
    const unreviewed = selected.filter((d) => (d.confidence ?? "high") !== "high" && !d.reviewed);
    if (unreviewed.length > 0) {
      toast.error(
        `Confirm ${unreviewed.length} flagged field${unreviewed.length === 1 ? "" : "s"} before saving.`,
      );
      return;
    }
    setSaving(true);
    const hotelId = getActiveHotelId();
    type Bucket = Partial<Record<SmartMetric, number>>;
    const buckets = new Map<string, { year: number; month: number; vals: Bucket }>();
    for (const r of selected) {
      const key = `${r.year}-${r.month}`;
      const b = buckets.get(key) ?? { year: r.year, month: r.month, vals: {} };
      b.vals[r.metric] = r.value;
      buckets.set(key, b);
    }
    let saved = 0;
    let failed = 0;
    for (const b of buckets.values()) {
      const { data: existing } = await supabase
        .from("monthly_entries")
        .select("*")
        .eq("hotel_id", hotelId)
        .eq("year", b.year)
        .eq("month", b.month)
        .maybeSingle();
      const payload = {
        hotel_id: hotelId,
        year: b.year,
        month: b.month,
        electricity_kwh: b.vals.electricity_kwh ?? existing?.electricity_kwh ?? null,
        gas_kwh: b.vals.gas_kwh ?? existing?.gas_kwh ?? null,
        water_m3: b.vals.water_m3 ?? existing?.water_m3 ?? null,
        waste_kg: b.vals.waste_kg ?? existing?.waste_kg ?? null,
        occupied_room_nights: b.vals.occupied_room_nights ?? existing?.occupied_room_nights ?? null,
      };
      const { error } = existing
        ? await supabase.from("monthly_entries").update(payload).eq("id", existing.id)
        : await supabase.from("monthly_entries").insert(payload);
      if (error) failed++;
      else saved++;
    }
    setSaving(false);
    if (saved > 0) toast.success(`Saved ${saved} month${saved === 1 ? "" : "s"} from your voice note.`);
    if (failed > 0) toast.error(`${failed} month${failed === 1 ? "" : "s"} failed to save.`);
    setDrafts([]);
    setLaneTexts({ en: { final: "", interim: "", score: 0 }, fr: { final: "", interim: "", score: 0 } });
    setDetectedLang(null);
    setSummary("");
    setWarnings([]);
    setConfidence(null);
    onSaved();
  }, [drafts, onSaved]);

  const reset = React.useCallback(() => {
    if (listening) stopListening();
    setLaneTexts({ en: { final: "", interim: "", score: 0 }, fr: { final: "", interim: "", score: 0 } });
    setDetectedLang(null);
    setDrafts([]);
    setSummary("");
    setWarnings([]);
    setConfidence(null);
  }, [listening, stopListening]);

  // Seed an example transcript (manual try-out) — defaults to English lane.
  const seedExample = React.useCallback((text: string, lang: LangCode) => {
    setLaneTexts((prev) => ({
      ...prev,
      [lang]: { final: text, interim: "", score: text.split(/\s+/).length },
    }));
    setDetectedLang(lang);
  }, []);

  const updateDraft = (id: string, patch: Partial<DraftRow>) => {
    setDrafts((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  };
  const removeDraft = (id: string) => {
    setDrafts((prev) => prev.filter((d) => d.id !== id));
  };

  const liveText = (finalText + " " + interimText).trim();

  return (
    <Card className="overflow-hidden border-border bg-card">
      {/* Header */}
      <div className="border-b border-border bg-gradient-to-br from-primary/5 via-card to-secondary/5 px-6 py-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="mb-1 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
              <Sparkles className="h-3 w-3" /> Voice journal
            </div>
            <h3 className="font-serif text-xl font-semibold">Just talk to Sera</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Press the mic and read your numbers out loud — even messy, with units mixed.
              Sera transcribes, normalises and turns it into clean monthly rows.
            </p>
          </div>
          {(finalText || drafts.length > 0) && (
            <Button variant="ghost" size="sm" onClick={reset} className="text-muted-foreground">
              <X className="mr-1 h-3.5 w-3.5" /> Clear
            </Button>
          )}
        </div>
      </div>

      <div className="space-y-5 px-6 py-5">
        {supported === false && (
          <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 px-4 py-3 text-xs text-amber-700 dark:text-amber-400">
            Your browser doesn't support voice recognition. Try Chrome, Edge, or Safari — or use the
            <span className="font-semibold"> Smart data input</span> method instead.
          </div>
        )}

        {/* Mic + waveform */}
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-border bg-muted/30 px-4 py-8">
          <button
            type="button"
            disabled={supported === false || extracting || saving}
            onClick={listening ? stopListening : startListening}
            className={`group relative flex h-24 w-24 items-center justify-center rounded-full transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/30 ${
              listening
                ? "bg-gradient-to-br from-primary to-secondary text-primary-foreground shadow-[0_8px_30px_-8px_var(--chart-3)]"
                : "bg-card border-2 border-primary/40 text-primary hover:border-primary hover:bg-primary/5"
            } disabled:cursor-not-allowed disabled:opacity-50`}
            aria-label={listening ? "Stop recording" : "Start recording"}
          >
            {listening ? <Square className="h-9 w-9 fill-current" /> : <Mic className="h-10 w-10" />}
            {listening && (
              <>
                <motion.span
                  className="absolute inset-0 rounded-full border-2 border-primary/40"
                  animate={{ scale: [1, 1.4, 1.7], opacity: [0.6, 0.2, 0] }}
                  transition={{ duration: 1.6, repeat: Infinity, ease: "easeOut" }}
                />
                <motion.span
                  className="absolute inset-0 rounded-full border-2 border-primary/40"
                  animate={{ scale: [1, 1.4, 1.7], opacity: [0.6, 0.2, 0] }}
                  transition={{ duration: 1.6, repeat: Infinity, ease: "easeOut", delay: 0.6 }}
                />
              </>
            )}
          </button>

          {/* Waveform bars */}
          <div className="flex h-8 items-end gap-1">
            {Array.from({ length: 24 }).map((_, i) => {
              const base = listening ? 0.25 + Math.abs(Math.sin(i + level * 9)) * 0.75 * level : 0.15;
              return (
                <motion.span
                  key={i}
                  className="w-1 rounded-full bg-primary/70"
                  animate={{ height: `${base * 100}%` }}
                  transition={{ duration: 0.18, ease: "easeOut" }}
                  style={{ minHeight: 4 }}
                />
              );
            })}
          </div>

          <div className="text-center text-xs text-muted-foreground">
            {listening ? (
              <span className="inline-flex items-center gap-2">
                <AudioLines className="h-3.5 w-3.5 text-primary" /> Listening… tap again to stop.
              </span>
            ) : supported === false ? (
              <span className="inline-flex items-center gap-2">
                <MicOff className="h-3.5 w-3.5" /> Voice input unavailable.
              </span>
            ) : (
              <span>Tap the mic and speak naturally — Sera handles the rest.</span>
            )}
          </div>
        </div>

        {/* Live transcript */}
        <AnimatePresence>
          {(liveText || listening) && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="rounded-2xl border border-border bg-background/60 px-4 py-3"
            >
              <div className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                Live transcript
              </div>
              <p className="text-sm leading-relaxed">
                <span>{finalText}</span>{" "}
                <span className="text-muted-foreground italic">{interimText}</span>
                {listening && !finalText && !interimText && (
                  <span className="text-muted-foreground italic">Waiting for your voice…</span>
                )}
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Action */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            onClick={handleExtract}
            disabled={!liveText || extracting || saving}
            className="bg-gradient-to-r from-primary to-secondary text-primary-foreground hover:opacity-90"
          >
            {extracting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sera is listening back…
              </>
            ) : (
              <>
                <Wand2 className="mr-2 h-4 w-4" /> Turn into data
              </>
            )}
          </Button>
          {!liveText && (
            <span className="text-xs text-muted-foreground">
              Try: <span className="italic">"{PROMPTS[0]}"</span>
            </span>
          )}
        </div>

        {/* Sample prompts */}
        {!liveText && drafts.length === 0 && (
          <div className="space-y-2">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Some examples</div>
            <div className="flex flex-wrap gap-2">
              {PROMPTS.map((p, i) => {
                const meta = LANGS.find((l) => l.code === p.lang)!;
                return (
                  <button
                    key={i}
                    onClick={() => seedExample(p.text, p.lang)}
                    disabled={listening}
                    className="rounded-full border border-border bg-muted/40 px-3 py-1 text-xs text-muted-foreground transition hover:border-primary/40 hover:bg-primary/5 hover:text-foreground disabled:opacity-50"
                  >
                    <span className="mr-1">{meta.flag}</span>"{p.text.slice(0, 60)}…"
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Drafts review */}
        <AnimatePresence>
          {drafts.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="space-y-3"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold">What Sera heard</div>
                  {summary && <div className="text-xs text-muted-foreground">{summary}</div>}
                </div>
                {confidence && (
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                      confidence === "high"
                        ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                        : confidence === "medium"
                          ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                          : "bg-rose-500/15 text-rose-600 dark:text-rose-400"
                    }`}
                  >
                    {confidence} confidence
                  </span>
                )}
              </div>

              {warnings.length > 0 && (
                <ul className="space-y-1 rounded-xl border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                  {warnings.map((w, i) => (
                    <li key={i}>• {w}</li>
                  ))}
                </ul>
              )}

              {/* Confirmation checklist — surfaces low-confidence rows up front */}
              {(() => {
                const flagged = drafts.filter(
                  (d) => d.selected && (d.confidence ?? "high") !== "high",
                );
                const pending = flagged.filter((d) => !d.reviewed);
                if (flagged.length === 0) return null;
                return (
                  <div
                    className={`rounded-xl border px-3 py-3 text-xs ${
                      pending.length === 0
                        ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400"
                        : "border-amber-500/40 bg-amber-500/5 text-amber-700 dark:text-amber-400"
                    }`}
                  >
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 font-semibold">
                        {pending.length === 0 ? (
                          <ShieldCheck className="h-4 w-4" />
                        ) : (
                          <AlertTriangle className="h-4 w-4" />
                        )}
                        {pending.length === 0
                          ? "All flagged fields confirmed"
                          : `Please confirm ${pending.length} flagged field${pending.length === 1 ? "" : "s"}`}
                      </div>
                      {pending.length > 0 && (
                        <button
                          type="button"
                          onClick={() =>
                            setDrafts((prev) =>
                              prev.map((d) =>
                                (d.confidence ?? "high") !== "high" && d.selected
                                  ? { ...d, reviewed: true }
                                  : d,
                              ),
                            )
                          }
                          className="rounded-full border border-current px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider hover:bg-current/10"
                        >
                          Confirm all
                        </button>
                      )}
                    </div>
                    <p className="mb-2 text-[11px] opacity-80">
                      Sera wasn't fully sure about these — tick each one after a quick check, or edit
                      the value directly below.
                    </p>
                    <ul className="space-y-1.5">
                      {flagged.map((d) => {
                        const meta = METRIC_META[d.metric];
                        return (
                          <li key={`chk-${d.id}`} className="flex items-start gap-2">
                            <input
                              type="checkbox"
                              checked={d.reviewed}
                              onChange={(e) => updateDraft(d.id, { reviewed: e.target.checked })}
                              className="mt-0.5 h-3.5 w-3.5 accent-current"
                              aria-label={`Confirm ${meta.label} for ${MONTH_NAMES[d.month - 1]} ${d.year}`}
                            />
                            <span className="leading-tight">
                              <span className="font-semibold">
                                {meta.label} · {MONTH_NAMES[d.month - 1]} {d.year}
                              </span>{" "}
                              <span className="opacity-80">
                                ({d.value.toLocaleString()} {meta.unit})
                              </span>
                              {d.confidence_reason && (
                                <span className="block text-[11px] opacity-75">
                                  Why flagged: {d.confidence_reason}
                                </span>
                              )}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })()}

              <div className="space-y-2">
                {drafts.map((d) => {
                  const meta = METRIC_META[d.metric];
                  const Icon = meta.icon;
                  const conf = d.confidence ?? "high";
                  const flagged = conf !== "high";
                  const needsReview = flagged && d.selected && !d.reviewed;
                  return (
                    <div
                      key={d.id}
                      className={`flex flex-wrap items-center gap-3 rounded-xl border px-3 py-2 transition ${
                        !d.selected
                          ? "border-border bg-muted/40 opacity-60"
                          : needsReview
                            ? "border-amber-500/50 bg-amber-500/5"
                            : "border-primary/40 bg-primary/5"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={d.selected}
                        onChange={(e) => updateDraft(d.id, { selected: e.target.checked })}
                        className="h-4 w-4 accent-primary"
                      />
                      <div
                        className="flex h-8 w-8 items-center justify-center rounded-lg"
                        style={{ background: `color-mix(in oklab, ${meta.color} 15%, transparent)`, color: meta.color }}
                      >
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="flex min-w-[7rem] flex-col">
                        <span className="text-sm font-medium">{meta.label}</span>
                        <span
                          className={`mt-0.5 inline-flex w-fit items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${
                            conf === "high"
                              ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                              : conf === "medium"
                                ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
                                : "bg-rose-500/15 text-rose-600 dark:text-rose-400"
                          }`}
                        >
                          {conf === "high" ? (
                            <CheckCircle2 className="h-2.5 w-2.5" />
                          ) : (
                            <AlertTriangle className="h-2.5 w-2.5" />
                          )}
                          {conf}
                        </span>
                      </div>
                      <Select
                        value={String(d.month)}
                        onValueChange={(v) => updateDraft(d.id, { month: Number(v) })}
                      >
                        <SelectTrigger className="h-8 w-[110px] text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {MONTH_NAMES.map((m, i) => (
                            <SelectItem key={i} value={String(i + 1)}>
                              {m}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        type="number"
                        value={d.year}
                        onChange={(e) => updateDraft(d.id, { year: Number(e.target.value) })}
                        className="h-8 w-[90px] text-xs"
                      />
                      <div className="ml-auto flex items-center gap-2">
                        <Input
                          type="number"
                          value={d.value}
                          onChange={(e) => updateDraft(d.id, { value: Number(e.target.value) })}
                          className="h-8 w-[120px] text-right text-sm font-medium"
                        />
                        <Label className="text-xs text-muted-foreground">{meta.unit}</Label>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={() => removeDraft(d.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                      {(d.original_unit || d.confidence_reason) && (
                        <div className="basis-full pl-9 text-[10px] text-muted-foreground">
                          {d.original_unit && (
                            <>
                              You said: <span className="italic">{d.original_unit}</span>
                            </>
                          )}
                          {d.note ? ` · ${d.note}` : ""}
                          {flagged && d.confidence_reason && (
                            <span className="ml-1 text-amber-600 dark:text-amber-400">
                              · {d.confidence_reason}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {(() => {
                const selectedRows = drafts.filter((d) => d.selected);
                const pendingReview = selectedRows.filter(
                  (d) => (d.confidence ?? "high") !== "high" && !d.reviewed,
                ).length;
                const saveDisabled = saving || selectedRows.length === 0 || pendingReview > 0;
                return (
                  <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-3">
                    {pendingReview > 0 && (
                      <span className="mr-auto text-xs text-amber-600 dark:text-amber-400">
                        {pendingReview} flagged field{pendingReview === 1 ? "" : "s"} still need
                        {pendingReview === 1 ? "s" : ""} confirmation.
                      </span>
                    )}
                    <Button variant="ghost" onClick={reset} disabled={saving}>
                      Discard
                    </Button>
                    <Button
                      onClick={handleSave}
                      disabled={saveDisabled}
                      className="bg-primary text-primary-foreground hover:bg-primary/90"
                    >
                      {saving ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving…
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="mr-2 h-4 w-4" /> Save {selectedRows.length} row
                          {selectedRows.length === 1 ? "" : "s"}
                        </>
                      )}
                    </Button>
                  </div>
                );
              })()}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Card>
  );
}
