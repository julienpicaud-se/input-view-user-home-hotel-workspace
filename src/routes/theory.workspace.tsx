import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import * as React from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  Bolt,
  Flame,
  Droplets,
  Trash2,
  BedDouble,
  Building2,
  Check,
  Pencil,
  Loader2,
  Sparkles,
  Lightbulb,
  TrendingUp,
  TrendingDown,
  ChevronRight,
  Save,
  Leaf,
  X,
  Mic,
  MicOff,
} from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import {
  getActiveHotelId,
  type Hotel,
  type MonthlyEntry,
} from "@/lib/hotel";
import { DEMO_PROFILE_ID, type UserProfile } from "@/lib/user-profile";
import {
  MONTH_NAMES,
  formatNumber,
  calculateCO2e,
  pctChange,
} from "@/lib/format";
import { DesignModeSwitcher } from "@/components/design-mode-switcher";
import { TheoryNav } from "@/components/theory-nav";
import { TheorySectionNav, TheorySection } from "@/components/theory-section-nav";
import { TheoryAnalyze } from "@/components/theory-analyze";
import { TheoryHistory } from "@/components/theory-history";
import { TheoryBenchmarks } from "@/components/theory-benchmarks";
import { TheoryImport, TheoryHotelSettings } from "@/components/theory-import-settings";
import {
  generateInsights,
  sendAssistantMessage,
  type Insight,
} from "@/server/assistant.functions";
import { SeraStage } from "@/routes/theory";

export const Route = createFileRoute("/theory/workspace")({
  head: () => ({
    meta: [
      { title: "Hotel Theatre — AI Theory | RA+" },
      {
        name: "description",
        content:
          "Step inside one hotel's theatre. Sera is on stage with you — log data, see insights, and act in seconds.",
      },
    ],
  }),
  component: TheoryWorkspacePage,
});

function expectedReportingPeriod(): { year: number; month: number } {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

const FIELDS = [
  {
    key: "electricity_kwh",
    label: "Electricity",
    unit: "kWh",
    Icon: Bolt,
    hue: "from-amber-400 to-orange-500",
    sera: "Look on your electricity bill for **Total kWh used** this month.",
  },
  {
    key: "gas_kwh",
    label: "Gas",
    unit: "kWh",
    Icon: Flame,
    hue: "from-rose-400 to-red-500",
    sera: "Find **kWh used** on your gas bill. If it's in m³, multiply by ~10.5.",
  },
  {
    key: "water_m3",
    label: "Water",
    unit: "m³",
    Icon: Droplets,
    hue: "from-sky-400 to-blue-500",
    sera: "On your water bill, look for **m³ used** or **cubic metres**.",
  },
  {
    key: "waste_kg",
    label: "Waste",
    unit: "kg",
    Icon: Trash2,
    hue: "from-emerald-400 to-teal-500",
    sera: "From your waste hauler invoice — total kg collected.",
  },
  {
    key: "occupied_room_nights",
    label: "Room-nights",
    unit: "nights",
    Icon: BedDouble,
    hue: "from-violet-400 to-fuchsia-500",
    sera: "From your PMS — total **occupied room-nights** for the month.",
  },
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

function TheoryWorkspacePage() {
  const callAssistant = useServerFn(sendAssistantMessage);
  const callInsights = useServerFn(generateInsights);
  const navigate = useNavigate();

  const [profile, setProfile] = React.useState<UserProfile | null>(null);
  const [hotel, setHotel] = React.useState<Hotel | null>(null);
  const [entries, setEntries] = React.useState<MonthlyEntry[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [activeId, setActiveId] = React.useState<string>("");

  const [insights, setInsights] = React.useState<Insight[]>([]);
  const [insightsLoading, setInsightsLoading] = React.useState(false);

  const [seraSay, setSeraSay] = React.useState("");
  const [seraThinking, setSeraThinking] = React.useState(false);

  // Inline guided log state
  const [logOpen, setLogOpen] = React.useState(false);
  const [step, setStep] = React.useState<number>(0);
  const [values, setValues] = React.useState<Values>(EMPTY);
  const [saving, setSaving] = React.useState(false);

  // Voice input state (per-step)
  const [listening, setListening] = React.useState(false);
  const [voiceHeard, setVoiceHeard] = React.useState<string>("");
  const [voicePending, setVoicePending] = React.useState<{
    raw: string;
    parsed: number | null;
  } | null>(null);
  const [voiceError, setVoiceError] = React.useState<string>("");
  const recognitionRef = React.useRef<any>(null);
  const speechSupported =
    typeof window !== "undefined" &&
    !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
  // Refs mirror state so async speech callbacks can read latest values.
  const stepRef = React.useRef(0);
  const voicePendingRef = React.useRef<typeof voicePending>(null);
  React.useEffect(() => { voicePendingRef.current = voicePending; }, [voicePending]);
  React.useEffect(() => { stepRef.current = step; }, [step]);

  // Hands-free mode: after a confirm, auto-advance + auto-listen on next step.
  const [handsFree, setHandsFree] = React.useState(false);
  const handsFreeRef = React.useRef(false);
  React.useEffect(() => {
    handsFreeRef.current = handsFree;
  }, [handsFree]);
  // When true on the next step, we auto-start listening.
  const autoListenRef = React.useRef(false);
  // Brief banner showing the recognized command (e.g. "Skip", "Back").
  const [commandFlash, setCommandFlash] = React.useState<string>("");
  const commandFlashTimer = React.useRef<number | null>(null);
  function flashCommand(label: string) {
    setCommandFlash(label);
    if (commandFlashTimer.current) window.clearTimeout(commandFlashTimer.current);
    commandFlashTimer.current = window.setTimeout(() => setCommandFlash(""), 1400);
  }

  const expected = expectedReportingPeriod();
  const monthLabel = `${MONTH_NAMES[expected.month - 1]} ${expected.year}`;

  const refreshEntries = React.useCallback(async () => {
    const id = getActiveHotelId();
    const { data: entriesData } = await supabase
      .from("monthly_entries")
      .select("*")
      .eq("hotel_id", id)
      .order("year", { ascending: true })
      .order("month", { ascending: true });
    setEntries((entriesData as MonthlyEntry[] | null) ?? []);
  }, []);

  React.useEffect(() => {
    const id = getActiveHotelId();
    setActiveId(id);
    void (async () => {
      try {
        const [{ data: profileData }, { data: hotelData }, { data: entriesData }] =
          await Promise.all([
            supabase.from("user_profiles").select("*").eq("id", DEMO_PROFILE_ID).maybeSingle(),
            supabase.from("hotels").select("*").eq("id", id).maybeSingle(),
            supabase
              .from("monthly_entries")
              .select("*")
              .eq("hotel_id", id)
              .order("year", { ascending: true })
              .order("month", { ascending: true }),
          ]);
        setProfile((profileData as UserProfile) ?? null);
        setHotel((hotelData as Hotel) ?? null);
        setEntries((entriesData as MonthlyEntry[] | null) ?? []);
      } catch {
        toast.error("Workspace data could not load. Please try again.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const firstName = (profile?.display_name?.split(" ")[0] || "there").trim();

  // Latest entries
  const currentEntry = React.useMemo(() => {
    return entries.find((e) => e.year === expected.year && e.month === expected.month) ?? null;
  }, [entries, expected.year, expected.month]);

  const prevPeriod = expected.month === 1
    ? { year: expected.year - 1, month: 12 }
    : { year: expected.year, month: expected.month - 1 };

  const prevEntry = React.useMemo(() => {
    return entries.find((e) => e.year === prevPeriod.year && e.month === prevPeriod.month) ?? null;
  }, [entries, prevPeriod.year, prevPeriod.month]);

  const co2 = currentEntry ? calculateCO2e(currentEntry) : 0;
  const prevCo2 = prevEntry ? calculateCO2e(prevEntry) : 0;
  const co2Change = pctChange(co2 || null, prevCo2 || null);

  // Sera ambient lines for this hotel
  React.useEffect(() => {
    if (loading || !hotel) return;
    if (!currentEntry) {
      setSeraSay(
        `${firstName}, ${hotel.name} is missing ${monthLabel}. Tap "Log this month" — I'll guide you step-by-step.`,
      );
    } else if (co2Change !== null && co2Change > 5) {
      setSeraSay(
        `Your CO₂e is up ${co2Change.toFixed(0)}% vs last month. Want me to tell you why?`,
      );
    } else if (co2Change !== null && co2Change < 0) {
      setSeraSay(
        `Nice — CO₂e down ${Math.abs(co2Change).toFixed(0)}% vs last month at ${hotel.name}. Want to see what's working?`,
      );
    } else {
      setSeraSay(`${hotel.name} looks steady. Want my top 3 actions for next month?`);
    }
  }, [loading, hotel, currentEntry, co2Change, monthLabel, firstName]);

  // Background insights
  React.useEffect(() => {
    if (!hotel) return;
    setInsightsLoading(true);
    callInsights({ data: { hotelId: hotel.id } })
      .then((r) => setInsights(r.insights ?? []))
      .catch(() => setInsights([]))
      .finally(() => setInsightsLoading(false));
  }, [hotel, callInsights]);

  // ---- Sera ----
  async function askSera(text: string) {
    if (!text.trim() || seraThinking) return;
    setSeraThinking(true);
    setSeraSay("Thinking…");
    try {
      const res = await callAssistant({
        data: { message: text, hotelId: hotel?.id, history: [] },
      });
      if (res.ok) setSeraSay(res.content);
      else setSeraSay(`Sorry — ${res.error}`);
    } catch {
      setSeraSay("Something went wrong. Please try again.");
    } finally {
      setSeraThinking(false);
    }
  }

  // ---- Guided log flow ----
  function startLog(opts?: { handsFree?: boolean }) {
    const wantsHandsFree = !!opts?.handsFree && speechSupported;
    setHandsFree(wantsHandsFree);
    handsFreeRef.current = wantsHandsFree;
    autoListenRef.current = wantsHandsFree;
    setLogOpen(true);
    setStep(0);
    setValues(
      currentEntry
        ? {
            electricity_kwh: currentEntry.electricity_kwh?.toString() ?? "",
            gas_kwh: currentEntry.gas_kwh?.toString() ?? "",
            water_m3: currentEntry.water_m3?.toString() ?? "",
            waste_kg: currentEntry.waste_kg?.toString() ?? "",
            occupied_room_nights: currentEntry.occupied_room_nights?.toString() ?? "",
          }
        : EMPTY,
    );
  }

  function setVal(k: FieldKey, v: string) {
    setValues((prev) => ({ ...prev, [k]: v }));
  }

  // ---- Voice input ----
  // Parses spoken number strings, including spelled-out words and units.
  function parseSpokenNumber(input: string): number | null {
    if (!input) return null;
    let s = input.toLowerCase().trim();
    // Strip common units & filler words
    s = s.replace(
      /\b(kwh|kilowatt[-\s]?hours?|kilowatts?|cubic\s+met(?:re|er)s?|m3|m\^3|m³|kilograms?|kilos?|kgs?|kg|nights?|rooms?|approximately|about|around|roughly|maybe|i\s+think|i\s+guess|please|thanks?)\b/g,
      " ",
    );
    s = s.replace(/[, ]+/g, " ").trim();

    // Try direct numeric parse first (handles "1234.5", "1,234.5", "1 234")
    const direct = s.replace(/\s+/g, "").replace(/,/g, "");
    if (/^-?\d+(\.\d+)?$/.test(direct)) return Number(direct);

    // Word-to-number for small spoken values
    const ones: Record<string, number> = {
      zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5,
      six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11,
      twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
      sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
    };
    const tens: Record<string, number> = {
      twenty: 20, thirty: 30, forty: 40, fifty: 50,
      sixty: 60, seventy: 70, eighty: 80, ninety: 90,
    };
    const scales: Record<string, number> = {
      hundred: 100, thousand: 1000, million: 1000000,
    };
    const tokens = s.split(/[\s-]+/).filter(Boolean);
    if (tokens.length === 0) return null;

    let total = 0;
    let current = 0;
    let matchedAny = false;
    for (const tk of tokens) {
      if (tk === "and") continue;
      if (ones[tk] !== undefined) {
        current += ones[tk];
        matchedAny = true;
      } else if (tens[tk] !== undefined) {
        current += tens[tk];
        matchedAny = true;
      } else if (scales[tk] !== undefined) {
        if (current === 0) current = 1;
        if (tk === "hundred") {
          current *= 100;
        } else {
          total += current * scales[tk];
          current = 0;
        }
        matchedAny = true;
      } else if (/^\d+(\.\d+)?$/.test(tk)) {
        current += Number(tk);
        matchedAny = true;
      } else {
        // unknown token — abort word parsing
        return null;
      }
    }
    if (!matchedAny) return null;
    return total + current;
  }

  // ---- Voice commands (hands-free navigation) ----
  type VoiceCommand =
    | "confirm"
    | "reject"
    | "next"
    | "back"
    | "skip"
    | "repeat"
    | "stop";

  function parseCommand(input: string): VoiceCommand | null {
    if (!input) return null;
    const s = input.toLowerCase().trim().replace(/[.!?,]/g, "");
    // Keep matching tight — only treat short utterances as commands so
    // numbers like "twelve hundred" are never swallowed by accident.
    if (s.split(/\s+/).length > 4) return null;
    const has = (...words: string[]) => words.some((w) => s === w || s.startsWith(w + " ") || s.endsWith(" " + w) || s.includes(" " + w + " "));
    if (has("yes", "yeah", "yep", "yup", "correct", "confirm", "save", "okay", "ok", "right", "sure")) return "confirm";
    if (has("no", "nope", "wrong", "incorrect")) return "reject";
    if (s === "try again" || s.startsWith("try again")) return "reject";
    if (has("back", "previous", "go back")) return "back";
    if (has("skip")) return "skip";
    if (has("next", "forward")) return "next";
    if (has("repeat", "again", "what")) return "repeat";
    if (has("stop", "cancel", "quit", "exit", "close")) return "stop";
    return null;
  }

  function runCommand(cmd: VoiceCommand) {
    const curStep = stepRef.current;
    const curField = curStep < FIELDS.length ? FIELDS[curStep] : null;
    const pending = voicePendingRef.current;

    switch (cmd) {
      case "confirm": {
        flashCommand("Confirm");
        if (pending && pending.parsed !== null && curField) {
          confirmVoice(curField.key);
        } else if (handsFreeRef.current) {
          // No pending value to confirm — treat as "next".
          autoListenRef.current = true;
          setStep((s) => Math.min(s + 1, FIELDS.length));
        }
        return;
      }
      case "reject": {
        flashCommand("Try again");
        rejectVoice();
        if (handsFreeRef.current && curField) {
          window.setTimeout(() => startListening(curField.key), 250);
        }
        return;
      }
      case "next": {
        flashCommand("Next");
        if (handsFreeRef.current) autoListenRef.current = true;
        setStep((s) => Math.min(s + 1, FIELDS.length));
        return;
      }
      case "back": {
        flashCommand("Back");
        if (handsFreeRef.current) autoListenRef.current = true;
        setStep((s) => Math.max(s - 1, 0));
        return;
      }
      case "skip": {
        flashCommand("Skip");
        if (curField) setVal(curField.key, "");
        if (handsFreeRef.current) autoListenRef.current = true;
        setStep((s) => Math.min(s + 1, FIELDS.length));
        return;
      }
      case "repeat": {
        flashCommand("Repeat");
        rejectVoice();
        if (curField) {
          // Visually re-trigger by toggling the heard text briefly; mostly
          // useful in hands-free where we also re-listen.
          if (handsFreeRef.current) {
            window.setTimeout(() => startListening(curField.key), 200);
          }
        }
        return;
      }
      case "stop": {
        flashCommand("Stopped");
        stopListening();
        rejectVoice();
        if (handsFreeRef.current) {
          setHandsFree(false);
          handsFreeRef.current = false;
          autoListenRef.current = false;
        }
        return;
      }
    }
  }

  function stopListening() {
    try {
      recognitionRef.current?.stop?.();
    } catch {
      // ignore
    }
    setListening(false);
  }

  function startListening(field: FieldKey, opts?: { keepPending?: boolean }) {
    if (!speechSupported) {
      setVoiceError("Voice input isn't supported in this browser.");
      return;
    }
    setVoiceError("");
    if (!opts?.keepPending) {
      setVoiceHeard("");
      setVoicePending(null);
    }
    const SR =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;
    const rec = new SR();
    rec.lang = "en-US";
    rec.continuous = false;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    let finalText = "";
    rec.onresult = (event: any) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript;
        if (event.results[i].isFinal) finalText += t;
        else interim += t;
      }
      setVoiceHeard((finalText + interim).trim());
    };
    rec.onerror = (e: any) => {
      setListening(false);
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        setVoiceError("Microphone permission denied.");
      } else if (e.error === "no-speech") {
        setVoiceError("I didn't catch that. Try again.");
      } else {
        setVoiceError("Couldn't capture audio. Try again.");
      }
    };
    rec.onend = () => {
      setListening(false);
      const heard = finalText.trim();
      if (!heard) return;
      // Voice command takes priority over number parsing — lets the user
      // say "yes / no / next / back / skip / repeat / stop" hands-free.
      const cmd = parseCommand(heard);
      if (cmd) {
        setVoiceHeard("");
        runCommand(cmd);
        return;
      }
      const parsed = parseSpokenNumber(heard);
      setVoicePending({ raw: heard, parsed });
      if (parsed === null) {
        setVoiceError(`I heard "${heard}" but couldn't read a number. Try again or say "skip".`);
      }
      // Hands-free: after showing the pending value, re-open the mic so
      // the user can say "yes" / "no" / "try again" without tapping.
      if (handsFreeRef.current) {
        const curStep = stepRef.current;
        const nextField = curStep < FIELDS.length ? FIELDS[curStep].key : null;
        if (nextField) {
          window.setTimeout(() => startListening(nextField, { keepPending: true }), 600);
        }
      }
    };
    recognitionRef.current = rec;
    try {
      rec.start();
      setListening(true);
    } catch {
      setListening(false);
      setVoiceError("Couldn't start the microphone.");
    }
  }

  function confirmVoice(field: FieldKey) {
    if (voicePending && voicePending.parsed !== null) {
      setVal(field, String(voicePending.parsed));
    }
    setVoicePending(null);
    setVoiceHeard("");
    setVoiceError("");
    // Hands-free: advance to the next step (or review) and re-listen there.
    if (handsFreeRef.current) {
      autoListenRef.current = true;
      // Tiny delay so the user sees the saved chip flash before we move on.
      window.setTimeout(() => {
        setStep((s) => Math.min(s + 1, FIELDS.length));
      }, 280);
    }
  }

  function rejectVoice() {
    setVoicePending(null);
    setVoiceHeard("");
    setVoiceError("");
  }

  // Reset voice state when changing step or closing the log.
  // In hands-free mode, also auto-start listening on the new step.
  React.useEffect(() => {
    stopListening();
    setVoiceHeard("");
    setVoicePending(null);
    setVoiceError("");
    if (!logOpen) {
      autoListenRef.current = false;
      return;
    }
    if (autoListenRef.current && step < FIELDS.length && speechSupported) {
      autoListenRef.current = false;
      const fieldKey = FIELDS[step].key;
      // Small gap so the new step renders & mic resource is free.
      const t = window.setTimeout(() => startListening(fieldKey), 350);
      return () => window.clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, logOpen]);

  function next() {
    if (step < FIELDS.length) setStep((s) => s + 1);
  }

  function back() {
    if (step > 0) setStep((s) => s - 1);
  }

  async function saveAll() {
    if (!hotel) return;
    setSaving(true);
    const num = (k: FieldKey): number | null => {
      const raw = values[k].replace(/,/g, "").trim();
      return raw === "" ? null : Number(raw);
    };
    const payload = {
      hotel_id: hotel.id,
      year: expected.year,
      month: expected.month,
      electricity_kwh: num("electricity_kwh"),
      gas_kwh: num("gas_kwh"),
      water_m3: num("water_m3"),
      waste_kg: num("waste_kg"),
      occupied_room_nights:
        values.occupied_room_nights.trim() === ""
          ? null
          : Math.round(Number(values.occupied_room_nights.replace(/,/g, ""))),
    };
    const { data, error } = await supabase
      .from("monthly_entries")
      .upsert(payload, { onConflict: "hotel_id,year,month" })
      .select()
      .maybeSingle();
    setSaving(false);
    if (error || !data) {
      toast.error("Couldn't save — please try again.", {
        style: { background: "#1a1230", color: "#fff", border: "1px solid rgba(255,255,255,0.1)" },
      });
      return;
    }
    const saved = data as MonthlyEntry;
    setEntries((prev) => {
      const filtered = prev.filter(
        (e) => !(e.hotel_id === saved.hotel_id && e.year === saved.year && e.month === saved.month),
      );
      return [...filtered, saved];
    });
    setLogOpen(false);
    toast.success(`Saved ${monthLabel} for ${hotel.name}.`, {
      style: { background: "#1a1230", color: "#fff", border: "1px solid rgba(255,255,255,0.1)" },
    });
    void askSera(
      `I just logged ${MONTH_NAMES[expected.month - 1]} for ${hotel.name}. In 2 sentences: how does it look vs last month, and one thing to do next.`,
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0a0612] text-white/60">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (!hotel) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0a0612] px-6 text-center text-white">
        <div className="max-w-md">
          <p className="font-serif text-2xl">No hotel selected.</p>
          <p className="mt-2 text-sm text-white/60">Pick a hotel from the stage.</p>
          <Link
            to="/theory"
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 px-5 py-2.5 text-sm font-medium text-white"
          >
            <ArrowLeft className="h-4 w-4" /> Back to stage
          </Link>
        </div>
      </div>
    );
  }

  const currentField = step < FIELDS.length ? FIELDS[step] : null;
  const isReview = step >= FIELDS.length;

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#0a0612] text-white">
      {/* ambient backdrop */}
      <div className="pointer-events-none absolute inset-0 z-0">
        <div className="absolute -left-20 top-0 h-[36rem] w-[36rem] rounded-full bg-violet-600/15 blur-[120px]" />
        <div className="absolute right-0 top-1/2 h-[32rem] w-[32rem] rounded-full bg-amber-500/10 blur-[120px]" />
      </div>

      {/* Header */}
      <header className="relative z-30 flex items-center justify-between gap-3 px-5 py-4 sm:px-8">
        <div className="min-w-0 flex-1">
          <TheoryNav active="workspace" />
        </div>
        <DesignModeSwitcher />
      </header>

      <main className="relative z-10 mx-auto max-w-4xl px-5 pb-72 pt-2 sm:px-8">
        {/* Hero hotel card */}
        <section className="mb-8">
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-white/45">
            <Building2 className="h-3.5 w-3.5" />
            Hotel theatre
          </div>
          <h1 className="mt-3 font-serif text-4xl leading-tight sm:text-5xl">
            {hotel.name}
          </h1>
          <p className="mt-2 text-sm text-white/60">
            {hotel.region} · {hotel.rooms} rooms · {hotel.star_rating}★ · {hotel.climate_zone}
          </p>
        </section>

        {/* Section anchor nav — Log / Analyze / History / Benchmarks / Import / Settings */}
        <TheorySectionNav />

        {/* anchor for "log" — wraps the existing primary action + guided log block below */}
        <div id="theory-section-log" className="scroll-mt-24" />

        {/* Status pulse */}
        <section className="mb-8 grid gap-3 sm:grid-cols-3">
          <PulseTile
            label={`${MONTH_NAMES[expected.month - 1]} status`}
            value={currentEntry ? "Logged" : "Pending"}
            hint={currentEntry ? "All set" : "Tap below to log"}
            tone={currentEntry ? "success" : "warning"}
          />
          <PulseTile
            label="CO₂e this month"
            value={co2 > 0 ? `${formatNumber(co2 / 1000, 2)}t` : "—"}
            hint={
              co2Change !== null
                ? `${co2Change > 0 ? "+" : ""}${co2Change.toFixed(0)}% vs last`
                : "No comparison"
            }
            tone={co2Change !== null && co2Change < 0 ? "success" : co2Change !== null && co2Change > 5 ? "warning" : "neutral"}
            Icon={co2Change !== null && co2Change < 0 ? TrendingDown : TrendingUp}
          />
          <PulseTile
            label="Renewable"
            value={
              currentEntry?.renewable_pct != null
                ? `${currentEntry.renewable_pct}%`
                : "—"
            }
            hint="Of electricity used"
            tone="neutral"
            Icon={Leaf}
          />
        </section>

        {/* Big primary action — Log this month */}
        {!logOpen && (
          <section className="mb-8 space-y-3">
            <button
              onClick={() => startLog()}
              className="group relative w-full overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-violet-600/30 via-fuchsia-600/20 to-amber-600/20 p-6 text-left shadow-[0_0_50px_rgba(168,85,247,0.18)] transition-all hover:border-white/30 hover:shadow-[0_0_70px_rgba(168,85,247,0.3)] sm:p-8"
            >
              <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-gradient-to-br from-violet-500/40 to-fuchsia-500/20 blur-3xl" />
              <div className="relative flex items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-amber-200/80">
                    <Sparkles className="h-3.5 w-3.5" />
                    {currentEntry ? "Update" : "Guided log"}
                  </div>
                  <h2 className="mt-2 font-serif text-2xl sm:text-3xl">
                    {currentEntry ? `Update ${MONTH_NAMES[expected.month - 1]}` : `Log ${MONTH_NAMES[expected.month - 1]}`}
                  </h2>
                  <p className="mt-1.5 text-sm text-white/65">
                    I'll ask one thing at a time. About 30 seconds.
                  </p>
                </div>
                <ChevronRight className="h-7 w-7 text-white/70 transition-transform group-hover:translate-x-1" />
              </div>
            </button>

            {speechSupported && (
              <button
                onClick={() => startLog({ handsFree: true })}
                className="group relative flex w-full items-center justify-between gap-4 overflow-hidden rounded-2xl border border-rose-300/20 bg-gradient-to-br from-rose-500/15 via-fuchsia-500/10 to-violet-500/10 px-5 py-4 text-left transition-all hover:border-rose-300/40 hover:from-rose-500/25"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-rose-500 to-pink-500 text-white shadow-[0_0_20px_rgba(244,63,94,0.4)]">
                    <Mic className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-serif text-lg leading-tight">
                      Hands-free voice log
                    </p>
                    <p className="text-xs text-white/60">
                      Just talk — Sera asks, confirms & advances on her own.
                    </p>
                  </div>
                </div>
                <ChevronRight className="h-5 w-5 text-white/60 transition-transform group-hover:translate-x-1" />
              </button>
            )}
          </section>
        )}

        {/* Inline guided log flow */}
        {logOpen && (
          <section className="mb-8 overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04] backdrop-blur-md">
            {/* Progress dots */}
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
              <div className="flex items-center gap-2">
                {FIELDS.map((_, i) => (
                  <span
                    key={i}
                    className={`h-1.5 rounded-full transition-all ${
                      i < step
                        ? "w-6 bg-gradient-to-r from-violet-400 to-fuchsia-400"
                        : i === step
                          ? "w-10 bg-white"
                          : "w-6 bg-white/15"
                    }`}
                  />
                ))}
                <span
                  className={`h-1.5 rounded-full transition-all ${
                    isReview ? "w-10 bg-white" : "w-6 bg-white/15"
                  }`}
                />
              </div>
              <div className="flex items-center gap-2">
                {speechSupported && (
                  <button
                    type="button"
                    onClick={() => {
                      const next = !handsFree;
                      setHandsFree(next);
                      handsFreeRef.current = next;
                      if (!next) {
                        autoListenRef.current = false;
                        stopListening();
                      } else if (!isReview && !listening && !voicePending) {
                        // Start listening immediately on the current step
                        const fk = FIELDS[step]?.key;
                        if (fk) startListening(fk);
                      }
                    }}
                    aria-pressed={handsFree}
                    title={handsFree ? "Hands-free on — Sera auto-advances" : "Turn on hands-free"}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] transition-colors ${
                      handsFree
                        ? "border-rose-300/40 bg-rose-500/15 text-rose-100"
                        : "border-white/15 bg-white/[0.04] text-white/60 hover:bg-white/[0.08] hover:text-white"
                    }`}
                  >
                    <Mic className="h-3 w-3" />
                    Hands-free {handsFree ? "on" : "off"}
                  </button>
                )}
                <button
                  onClick={() => setLogOpen(false)}
                  className="rounded-full p-1 text-white/50 hover:bg-white/10 hover:text-white"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="p-5 sm:p-7">
              {!isReview && currentField && (
                <div>
                  <div className="flex items-center gap-3">
                    <div
                      className={`flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${currentField.hue} text-white shadow-md`}
                    >
                      <currentField.Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.2em] text-white/45">
                        Step {step + 1} of {FIELDS.length}
                      </p>
                      <h3 className="font-serif text-2xl">{currentField.label}</h3>
                    </div>
                  </div>

                  <p className="mt-4 text-sm leading-relaxed text-white/75">
                    {currentField.sera}
                  </p>

                  <div className="mt-5 flex items-end gap-2 sm:gap-3">
                    <input
                      type="text"
                      inputMode="decimal"
                      autoFocus
                      value={values[currentField.key]}
                      onChange={(e) => setVal(currentField.key, e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") next();
                      }}
                      placeholder="0"
                      className="flex-1 min-w-0 rounded-2xl border border-white/15 bg-white/[0.04] px-5 py-4 font-serif text-3xl text-white placeholder:text-white/25 focus:border-violet-300/50 focus:outline-none"
                    />
                    <span className="pb-3 font-serif text-xl text-white/50">
                      {currentField.unit}
                    </span>
                    {speechSupported && (
                      <button
                        type="button"
                        onClick={() =>
                          listening ? stopListening() : startListening(currentField.key)
                        }
                        aria-label={listening ? "Stop listening" : "Speak the value"}
                        className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border transition-all ${
                          listening
                            ? "border-rose-300/50 bg-gradient-to-br from-rose-500 to-pink-500 text-white shadow-[0_0_30px_rgba(244,63,94,0.5)] animate-pulse"
                            : "border-white/15 bg-white/[0.04] text-white/80 hover:border-violet-300/40 hover:bg-violet-500/10 hover:text-white"
                        }`}
                      >
                        {listening ? (
                          <MicOff className="h-5 w-5" />
                        ) : (
                          <Mic className="h-5 w-5" />
                        )}
                      </button>
                    )}
                  </div>

                  {/* Voice feedback / confirmation */}
                  {speechSupported && (listening || voiceHeard || voicePending || voiceError || commandFlash) && (
                    <div className="mt-3 rounded-2xl border border-violet-300/20 bg-violet-500/[0.06] p-3 backdrop-blur-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          {commandFlash && (
                            <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-emerald-300/30 bg-emerald-500/15 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-emerald-100">
                              <Check className="h-3 w-3" />
                              {commandFlash}
                            </div>
                          )}
                          {listening && (
                            <div className="flex items-center gap-2 text-sm text-violet-100">
                              <span className="relative flex h-2.5 w-2.5">
                                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75" />
                                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-rose-500" />
                              </span>
                              Listening… say the value, or "yes / no / next / back / skip / repeat / stop"
                            </div>
                          )}
                          {!listening && voiceHeard && (
                            <HeardChip text={voiceHeard} onClear={rejectVoice} />
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            stopListening();
                            rejectVoice();
                          }}
                          aria-label="Cancel voice input"
                          className="-m-1 rounded-full p-1 text-white/50 hover:bg-white/10 hover:text-white"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>

                      {!listening && voicePending && voicePending.parsed !== null && (
                        <div className="mt-2">
                          <p className="text-sm text-white/85">
                            Sera: did you say{" "}
                            <span className="font-serif text-xl text-white">
                              {formatNumber(voicePending.parsed)} {currentField.unit}
                            </span>
                            ?
                          </p>
                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => confirmVoice(currentField.key)}
                              className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 px-4 py-2 text-sm font-medium text-white shadow-md hover:from-emerald-400 hover:to-teal-400"
                            >
                              <Check className="h-4 w-4" /> Yes, save it
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                rejectVoice();
                                startListening(currentField.key);
                              }}
                              className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/[0.04] px-4 py-2 text-sm text-white/80 hover:bg-white/[0.08]"
                            >
                              <Mic className="h-4 w-4" /> Try again
                            </button>
                            <button
                              type="button"
                              onClick={rejectVoice}
                              className="rounded-xl px-3 py-2 text-sm text-white/55 hover:text-white"
                            >
                              Type instead
                            </button>
                          </div>
                        </div>
                      )}
                      {!listening && voiceError && (
                        <p className="mt-2 text-sm text-amber-200/90">{voiceError}</p>
                      )}
                    </div>
                  )}

                  <div className="mt-5 flex items-center justify-between">
                    <button
                      onClick={back}
                      disabled={step === 0}
                      className="rounded-xl px-4 py-2 text-sm text-white/60 hover:text-white disabled:opacity-30"
                    >
                      Back
                    </button>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setVal(currentField.key, "");
                          next();
                        }}
                        className="rounded-xl px-4 py-2 text-sm text-white/60 hover:text-white"
                      >
                        Skip
                      </button>
                      <button
                        onClick={next}
                        className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 px-5 py-2.5 text-sm font-medium text-white shadow-md hover:from-violet-400 hover:to-fuchsia-400"
                      >
                        Next
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {isReview && (
                <div>
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 to-teal-500 text-white shadow-md">
                      <Check className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.2em] text-white/45">
                        Final review
                      </p>
                      <h3 className="font-serif text-2xl">Look good?</h3>
                    </div>
                  </div>

                  <p className="mt-4 text-sm text-white/65">
                    Tap any number to edit it. Otherwise hit save.
                  </p>

                  <ul className="mt-5 divide-y divide-white/5 rounded-2xl border border-white/10 bg-white/[0.02]">
                    {FIELDS.map((f, i) => (
                      <li
                        key={f.key}
                        className="flex items-center gap-3 px-4 py-3"
                      >
                        <div
                          className={`flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br ${f.hue} text-white`}
                        >
                          <f.Icon className="h-4 w-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-white/80">{f.label}</p>
                          <p className="text-xs text-white/50">{f.unit}</p>
                        </div>
                        <button
                          onClick={() => setStep(i)}
                          className="rounded-lg px-3 py-1.5 text-right font-serif text-lg text-white hover:bg-white/5"
                        >
                          {values[f.key] === "" ? (
                            <span className="text-white/30">—</span>
                          ) : (
                            values[f.key]
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>

                  <div className="mt-5 flex items-center justify-between">
                    <button
                      onClick={back}
                      className="rounded-xl px-4 py-2 text-sm text-white/60 hover:text-white"
                    >
                      Back
                    </button>
                    <button
                      onClick={saveAll}
                      disabled={saving}
                      className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 px-5 py-2.5 text-sm font-medium text-white shadow-md hover:from-emerald-400 hover:to-teal-400 disabled:opacity-50"
                    >
                      {saving ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Save className="h-4 w-4" />
                      )}
                      Save {MONTH_NAMES[expected.month - 1]}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {/* What Sera sees here */}
        <section className="mb-8">
          <h2 className="mb-3 text-xs uppercase tracking-[0.22em] text-white/50">
            Sera's read on {hotel.name}
          </h2>
          {insightsLoading && insights.length === 0 ? (
            <div className="flex items-center gap-2 text-sm text-white/50">
              <Loader2 className="h-4 w-4 animate-spin" /> Reading your data…
            </div>
          ) : insights.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-sm text-white/55">
              Once you log a few months, I'll start spotting patterns and recommending actions here.
            </div>
          ) : (
            <div className="space-y-2">
              {insights.map((ins, i) => (
                <div
                  key={i}
                  className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur-sm"
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500/30 to-fuchsia-500/20 text-violet-200">
                      <Lightbulb className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h4 className="font-medium text-white/90">{ins.title}</h4>
                      <p className="mt-1 text-sm leading-relaxed text-white/60">
                        {ins.body}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Analyze */}
        <TheorySection id="analyze" title="Analyze" subtitle="Trends across the last 12 months — tap a metric, then ask Sera.">
          <TheoryAnalyze hotel={hotel} entries={entries} />
        </TheorySection>

        {/* History — past data, editable */}
        <TheorySection id="history" title="Past data" subtitle="Browse and correct any prior month inline.">
          <TheoryHistory entries={entries} onChanged={refreshEntries} />
        </TheorySection>

        {/* Benchmarks */}
        <TheorySection id="benchmarks" title="Benchmarks" subtitle="How this hotel compares to similar peers.">
          <TheoryBenchmarks hotel={hotel} entries={entries} />
        </TheorySection>

        {/* Import — bills + smart paste */}
        <TheorySection id="import" title="Import" subtitle="Drop a bill or paste anything — Sera does the rest.">
          <TheoryImport hotelId={hotel.id} onSaved={refreshEntries} />
        </TheorySection>

        {/* To-dos placeholder */}
        <TheorySection id="todos" title="To-dos" subtitle="Sera's daily focus list — coming online with your next sync.">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-sm text-white/60">
            Once Sera finishes reading {hotel.name}'s patterns, she'll list 3 high-impact to-dos here every morning.
          </div>
        </TheorySection>

        {/* Settings */}
        <TheorySection id="settings" title="Settings" subtitle="Tune this hotel's profile — Sera uses it for benchmarking.">
          <TheoryHotelSettings hotel={hotel} onSaved={(h) => setHotel(h)} />
        </TheorySection>
      </main>

      {/* SERA always on stage */}
      <SeraStage
        say={seraSay}
        thinking={seraThinking}
        onAsk={askSera}
        onUploadBill={() =>
          toast("Bill upload available in Standard › Workspace › Upload bill.", {
            style: { background: "#1a1230", color: "#fff", border: "1px solid rgba(255,255,255,0.1)" },
          })
        }
        onVoice={() =>
          toast("Voice capture available in Standard › Workspace › Voice.", {
            style: { background: "#1a1230", color: "#fff", border: "1px solid rgba(255,255,255,0.1)" },
          })
        }
        suggestions={
          currentEntry
            ? ["How am I doing?", "What should I focus on?", "Explain my bill"]
            : [`Log ${MONTH_NAMES[expected.month - 1]}`, "How am I doing?", "What should I focus on?"]
        }
        onSuggestion={(s) => {
          if (s.startsWith("Log ")) {
            startLog();
          } else {
            void askSera(s);
          }
        }}
      />
    </div>
  );
}

function PulseTile({
  label,
  value,
  hint,
  tone,
  Icon,
}: {
  label: string;
  value: string;
  hint: string;
  tone: "success" | "warning" | "neutral";
  Icon?: React.ComponentType<{ className?: string }>;
}) {
  const accent =
    tone === "success"
      ? "from-emerald-400/20 to-teal-400/10 text-emerald-200"
      : tone === "warning"
        ? "from-amber-400/20 to-orange-400/10 text-amber-200"
        : "from-violet-400/20 to-fuchsia-400/10 text-violet-200";
  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-sm">
      <div className={`absolute inset-0 bg-gradient-to-br ${accent} opacity-50`} />
      <div className="relative">
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] text-white/50">
          {Icon && <Icon className="h-3 w-3" />}
          {label}
        </div>
        <p className="mt-2 font-serif text-3xl text-white">{value}</p>
        <p className="mt-1 text-xs text-white/60">{hint}</p>
      </div>
    </div>
  );
}

/**
 * "Heard …" chip that supports two ways to instantly clear the value
 * without leaving the current step:
 *  - Long-press (≥450ms) — works for touch and mouse
 *  - Swipe-down (≥40px vertical drag, mostly vertical) — touch only
 * On long-press we also vibrate briefly (where supported) to confirm.
 */
function HeardChip({ text, onClear }: { text: string; onClear: () => void }) {
  const [pressing, setPressing] = React.useState(false);
  const [dragY, setDragY] = React.useState(0);
  const [clearing, setClearing] = React.useState(false);

  const longPressTimer = React.useRef<number | null>(null);
  const startY = React.useRef<number | null>(null);
  const startX = React.useRef<number | null>(null);
  const triggered = React.useRef(false);

  const SWIPE_THRESHOLD = 40;
  const LONG_PRESS_MS = 450;

  const trigger = React.useCallback(() => {
    if (triggered.current) return;
    triggered.current = true;
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      try {
        navigator.vibrate?.(15);
      } catch {
        // ignore
      }
    }
    setClearing(true);
    // brief animation, then clear
    window.setTimeout(() => {
      onClear();
    }, 140);
  }, [onClear]);

  const cancel = React.useCallback(() => {
    if (longPressTimer.current !== null) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    setPressing(false);
    setDragY(0);
    startY.current = null;
    startX.current = null;
  }, []);

  const startPress = React.useCallback(() => {
    triggered.current = false;
    setPressing(true);
    longPressTimer.current = window.setTimeout(() => {
      trigger();
      cancel();
    }, LONG_PRESS_MS);
  }, [trigger, cancel]);

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Heard "${text}". Long-press or swipe down to clear.`}
      onPointerDown={(e) => {
        // Only handle primary pointer
        if (e.button !== undefined && e.button !== 0) return;
        startY.current = e.clientY;
        startX.current = e.clientX;
        startPress();
      }}
      onPointerMove={(e) => {
        if (startY.current === null || startX.current === null) return;
        const dy = e.clientY - startY.current;
        const dx = Math.abs(e.clientX - startX.current);
        // Only track downward, mostly-vertical motion
        if (dy > 0 && dy > dx) {
          setDragY(Math.min(dy, 80));
          // Cancel long-press once user starts dragging meaningfully
          if (dy > 8 && longPressTimer.current !== null) {
            window.clearTimeout(longPressTimer.current);
            longPressTimer.current = null;
          }
          if (dy >= SWIPE_THRESHOLD) {
            trigger();
            cancel();
          }
        } else if (dx > 8) {
          // Sideways drag — abort gesture
          cancel();
        }
      }}
      onPointerUp={cancel}
      onPointerCancel={cancel}
      onPointerLeave={cancel}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " " || e.key === "Delete" || e.key === "Backspace") {
          e.preventDefault();
          trigger();
        }
      }}
      style={{
        transform: `translateY(${dragY}px)`,
        opacity: clearing ? 0 : 1 - Math.min(dragY / 80, 0.6),
        transition: pressing && dragY === 0 ? "transform 120ms ease, opacity 120ms ease" : clearing ? "opacity 140ms ease, transform 140ms ease" : "none",
        touchAction: "pan-x",
      }}
      className={`group inline-flex max-w-full cursor-pointer select-none items-center gap-2 rounded-full border px-3 py-1 text-xs uppercase tracking-[0.18em] transition-colors ${
        pressing
          ? "border-rose-300/40 bg-rose-500/15 text-rose-100"
          : "border-white/10 bg-white/[0.04] text-white/45 hover:border-white/20 hover:bg-white/[0.07]"
      }`}
    >
      <span>Heard</span>
      <span className="truncate normal-case tracking-normal text-white/80">
        "{text}"
      </span>
      <span className="hidden sm:inline whitespace-nowrap normal-case tracking-normal text-[10px] text-white/35 group-hover:text-white/55">
        · hold to clear
      </span>
    </div>
  );
}
