import { createFileRoute, Link, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import * as React from "react";
import { toast } from "sonner";
import {
  Orbit,
  Sparkles,
  Bolt,
  Flame,
  Droplets,
  Trash2,
  BedDouble,
  Mic,
  Camera,
  Send,
  Building2,
  ChevronRight,
  Loader2,
  ArrowRight,
  TrendingDown,
  TrendingUp,
  Lightbulb,
  Check,
  Pencil,
  Leaf,
} from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import {
  setActiveHotelId as setActiveHotelIdLib,
  type Hotel,
  type MonthlyEntry,
} from "@/lib/hotel";
import { DEMO_PROFILE_ID, type UserProfile } from "@/lib/user-profile";
import { MONTH_NAMES, formatNumber, calculateCO2e, pctChange } from "@/lib/format";
import { DesignModeSwitcher } from "@/components/design-mode-switcher";
import { TheoryNav } from "@/components/theory-nav";
import {
  generateInsights,
  sendAssistantMessage,
  type Insight,
} from "@/server/assistant.functions";

export const Route = createFileRoute("/theory")({
  head: () => ({
    meta: [
      { title: "Sera Stage — AI Theory | RA+" },
      {
        name: "description",
        content:
          "An immersive AI stage where Sera is everywhere — speak, glance, tap. Sustainability for hotel managers, made effortless.",
      },
    ],
  }),
  component: TheoryHomePage,
});

function expectedReportingPeriod(): { year: number; month: number } {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

const FIELDS = [
  { key: "electricity_kwh", label: "Electricity", unit: "kWh", Icon: Bolt, hue: "from-amber-400 to-orange-500" },
  { key: "gas_kwh", label: "Gas", unit: "kWh", Icon: Flame, hue: "from-rose-400 to-red-500" },
  { key: "water_m3", label: "Water", unit: "m³", Icon: Droplets, hue: "from-sky-400 to-blue-500" },
  { key: "waste_kg", label: "Waste", unit: "kg", Icon: Trash2, hue: "from-emerald-400 to-teal-500" },
  { key: "occupied_room_nights", label: "Room-nights", unit: "nights", Icon: BedDouble, hue: "from-violet-400 to-fuchsia-500" },
] as const;

type FieldKey = (typeof FIELDS)[number]["key"];

function TheoryHomePage() {
  const location = useLocation();
  const callAssistant = useServerFn(sendAssistantMessage);
  const callInsights = useServerFn(generateInsights);
  const navigate = useNavigate();

  if (location.pathname !== "/theory") {
    return <Outlet />;
  }

  const [profile, setProfile] = React.useState<UserProfile | null>(null);
  const [hotels, setHotels] = React.useState<Hotel[]>([]);
  const [entries, setEntries] = React.useState<MonthlyEntry[]>([]);
  const [loading, setLoading] = React.useState(true);

  const [seraSay, setSeraSay] = React.useState<string>("");
  const [seraThinking, setSeraThinking] = React.useState(false);
  const [insights, setInsights] = React.useState<Record<string, Insight[]>>({});

  const expected = expectedReportingPeriod();
  const monthLabel = `${MONTH_NAMES[expected.month - 1]} ${expected.year}`;

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
      setProfile((profileData as UserProfile) ?? null);
      setHotels((hotelsData as Hotel[] | null) ?? []);
      setEntries((entriesData as MonthlyEntry[] | null) ?? []);
      setLoading(false);
    })();
  }, []);

  const firstName = (profile?.display_name?.split(" ")[0] || "there").trim();

  const missing = React.useMemo(() => {
    return hotels.filter(
      (h) =>
        !entries.some(
          (e) => e.hotel_id === h.id && e.year === expected.year && e.month === expected.month,
        ),
    );
  }, [hotels, entries, expected.year, expected.month]);

  // Sera's opening line, rotated through ambient prompts every 8s
  const ambientLines = React.useMemo(() => {
    const lines: string[] = [];
    if (loading) return ["Tuning in…"];
    if (missing.length > 0) {
      lines.push(
        `Hi ${firstName}. ${missing.length} hotel${missing.length > 1 ? "s" : ""} still need numbers for ${monthLabel}. Want me to log them with you?`,
      );
      lines.push(`Tap the glowing card below — I'll handle ${missing[0].name} in 30 seconds.`);
    } else {
      lines.push(`All hotels are up to date for ${monthLabel}, ${firstName}. Beautiful.`);
      lines.push(`I noticed something in your data. Want me to share what to focus on next?`);
    }
    lines.push(`You can just talk to me. Try: "How are we doing this month?"`);
    return lines;
  }, [loading, firstName, missing, monthLabel]);

  const [ambientIdx, setAmbientIdx] = React.useState(0);
  React.useEffect(() => {
    if (ambientLines.length <= 1) {
      setSeraSay(ambientLines[0] ?? "");
      return;
    }
    setSeraSay(ambientLines[0]);
    const id = window.setInterval(() => {
      setAmbientIdx((i) => {
        const next = (i + 1) % ambientLines.length;
        setSeraSay(ambientLines[next]);
        return next;
      });
    }, 8000);
    return () => window.clearInterval(id);
  }, [ambientLines]);

  // Background insights for the first hotel (portfolio glance)
  React.useEffect(() => {
    if (hotels.length === 0) return;
    const first = hotels[0];
    callInsights({ data: { hotelId: first.id } })
      .then((r) => setInsights((prev) => ({ ...prev, [first.id]: r.insights ?? [] })))
      .catch(() => {});
  }, [hotels, callInsights]);

  // ---- Sera "speak" ----
  async function askSera(text: string) {
    if (!text.trim() || seraThinking) return;
    setSeraThinking(true);
    setSeraSay("Thinking…");
    try {
      const res = await callAssistant({
        data: { message: text, history: [] },
      });
      if (res.ok) {
        setSeraSay(res.content);
      } else {
        setSeraSay(`Sorry — ${res.error}`);
      }
    } catch {
      setSeraSay("Something went wrong. Please try again.");
    } finally {
      setSeraThinking(false);
    }
  }

  // ---- Portfolio numbers ----
  const portfolioCO2 = React.useMemo(() => {
    return entries
      .filter((e) => e.year === expected.year && e.month === expected.month)
      .reduce((sum, e) => sum + calculateCO2e(e), 0);
  }, [entries, expected.year, expected.month]);

  const lastMonthPortfolioCO2 = React.useMemo(() => {
    const prev = expected.month === 1
      ? { year: expected.year - 1, month: 12 }
      : { year: expected.year, month: expected.month - 1 };
    return entries
      .filter((e) => e.year === prev.year && e.month === prev.month)
      .reduce((sum, e) => sum + calculateCO2e(e), 0);
  }, [entries, expected.year, expected.month]);

  const co2Change = pctChange(portfolioCO2 || null, lastMonthPortfolioCO2 || null);

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#0a0612] text-white">
      {/* Cinematic ambient background */}
      <AmbientBackdrop />

      {/* Top bar */}
      <header className="relative z-30 flex items-center justify-between gap-3 px-5 py-4 sm:px-8">
        <Link to="/theory" className="flex items-center gap-2.5">
          <div className="relative flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-500 shadow-[0_0_30px_rgba(168,85,247,0.5)]">
            <Orbit className="h-5 w-5 text-white" />
          </div>
          <div className="hidden leading-tight sm:block">
            <div className="font-serif text-lg">Sera Stage</div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-white/50">
              AI Theory · RA+
            </div>
          </div>
        </Link>
        <TheoryNav active="stage" />
        <DesignModeSwitcher />
      </header>

      {/* Main stage content */}
      <main className="relative z-10 mx-auto max-w-5xl px-5 pb-72 pt-4 sm:px-8 sm:pt-10">
        {loading ? (
          <div className="flex justify-center pt-32 text-white/60">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : (
          <>
            {/* Hero greeting */}
            <section className="mb-10">
              <p className="text-xs uppercase tracking-[0.22em] text-white/40">
                {monthLabel}
              </p>
              <h1 className="mt-3 font-serif text-4xl leading-tight sm:text-6xl">
                Welcome back,<br />
                <span className="bg-gradient-to-r from-violet-300 via-fuchsia-300 to-amber-200 bg-clip-text text-transparent">
                  {firstName}.
                </span>
              </h1>
              <p className="mt-4 max-w-xl text-base text-white/70 sm:text-lg">
                I'm watching over your {hotels.length} {hotels.length === 1 ? "hotel" : "hotels"}.
                Speak, tap, or just look — I'll handle the rest.
              </p>
            </section>

            {/* Portfolio pulse */}
            <section className="mb-10 grid gap-4 sm:grid-cols-3">
              <PulseTile
                label="Hotels"
                value={String(hotels.length)}
                hint={missing.length > 0 ? `${missing.length} need data` : "All up to date"}
                tone={missing.length > 0 ? "warning" : "success"}
              />
              <PulseTile
                label={`CO₂e · ${MONTH_NAMES[expected.month - 1].slice(0, 3)}`}
                value={portfolioCO2 > 0 ? `${formatNumber(portfolioCO2 / 1000, 1)}t` : "—"}
                hint={
                  co2Change !== null
                    ? `${co2Change > 0 ? "+" : ""}${co2Change.toFixed(0)}% vs last month`
                    : "No comparison yet"
                }
                tone={co2Change !== null && co2Change < 0 ? "success" : co2Change !== null && co2Change > 5 ? "warning" : "neutral"}
              />
              <PulseTile
                label="Sera's focus"
                value={insights[hotels[0]?.id]?.[0]?.title?.slice(0, 18) ?? "Listening…"}
                hint="Tap a hotel to dive in"
                tone="neutral"
              />
            </section>

            {/* Action stage — what Sera suggests right now */}
            {missing.length > 0 && (
              <section className="mb-10">
                <h2 className="mb-3 text-xs uppercase tracking-[0.22em] text-white/50">
                  Sera suggests
                </h2>
                <button
                  onClick={() => {
                    setActiveHotelIdLib(missing[0].id);
                    void navigate({ to: "/theory/workspace" });
                  }}
                  className="group relative w-full overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-violet-600/30 via-fuchsia-600/20 to-amber-600/20 p-6 text-left shadow-[0_0_60px_rgba(168,85,247,0.2)] transition-all hover:border-white/30 hover:shadow-[0_0_80px_rgba(168,85,247,0.35)] sm:p-8"
                >
                  <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-gradient-to-br from-violet-500/40 to-fuchsia-500/20 blur-3xl" />
                  <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-amber-200/80">
                        <Sparkles className="h-3.5 w-3.5" />
                        One-tap log
                      </div>
                      <h3 className="mt-2 font-serif text-2xl sm:text-3xl">
                        Log {missing[0].name} for {MONTH_NAMES[expected.month - 1]}
                      </h3>
                      <p className="mt-1.5 text-sm text-white/65">
                        I'll walk you through 5 numbers, one at a time. About 30 seconds.
                      </p>
                    </div>
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-white transition-transform group-hover:translate-x-1">
                      <ArrowRight className="h-6 w-6" />
                    </div>
                  </div>
                </button>
              </section>
            )}

            {/* Hotels constellation */}
            <section className="mb-10">
              <h2 className="mb-3 text-xs uppercase tracking-[0.22em] text-white/50">
                Your hotels
              </h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {hotels.map((h) => {
                  const has = entries.some(
                    (e) => e.hotel_id === h.id && e.year === expected.year && e.month === expected.month,
                  );
                  return (
                    <button
                      key={h.id}
                      onClick={() => {
                        setActiveHotelIdLib(h.id);
                        void navigate({ to: "/theory/workspace" });
                      }}
                      className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-left backdrop-blur-sm transition-all hover:border-violet-400/40 hover:bg-white/[0.06]"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <Building2 className="h-4 w-4 text-white/50" />
                            <h3 className="truncate font-serif text-lg">{h.name}</h3>
                          </div>
                          <p className="mt-1 text-xs text-white/50">
                            {h.region} · {h.rooms} rooms · {h.star_rating}★
                          </p>
                          <div className="mt-3 flex items-center gap-2">
                            {has ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-emerald-300">
                                <Check className="h-3 w-3" />
                                Logged
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-amber-200">
                                <Pencil className="h-3 w-3" />
                                Needs data
                              </span>
                            )}
                          </div>
                        </div>
                        <ChevronRight className="h-5 w-5 text-white/30 transition-transform group-hover:translate-x-0.5 group-hover:text-white/60" />
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* What Sera knows — quick insights peek */}
            {insights[hotels[0]?.id]?.length > 0 && (
              <section className="mb-10">
                <h2 className="mb-3 text-xs uppercase tracking-[0.22em] text-white/50">
                  What I see right now
                </h2>
                <div className="space-y-2">
                  {insights[hotels[0].id].slice(0, 3).map((ins, i) => (
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
              </section>
            )}
          </>
        )}
      </main>

      {/* SERA — the omnipresent stage performer */}
      <SeraStage
        say={seraSay}
        thinking={seraThinking}
        onAsk={askSera}
        onUploadBill={() =>
          toast("Bill upload available in Classic › Workspace › Upload bill.", {
            style: { background: "#1a1230", color: "#fff", border: "1px solid rgba(255,255,255,0.1)" },
          })
        }
        onVoice={() =>
          toast("Voice capture available in Classic › Workspace › Voice.", {
            style: { background: "#1a1230", color: "#fff", border: "1px solid rgba(255,255,255,0.1)" },
          })
        }
        suggestions={
          missing.length > 0
            ? [
                `Log ${missing[0].name} now`,
                "How am I doing?",
                "What should I focus on?",
              ]
            : ["How am I doing?", "What should I focus on?", "Explain my bill"]
        }
        onSuggestion={(s) => {
          if (s.startsWith("Log ") && missing[0]) {
            setActiveHotelIdLib(missing[0].id);
            void navigate({ to: "/theory/workspace" });
          } else {
            void askSera(s);
          }
        }}
      />
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Components                                                       */
/* ---------------------------------------------------------------- */

function AmbientBackdrop() {
  return (
    <>
      <div className="pointer-events-none absolute inset-0 z-0">
        <div className="absolute -left-20 top-10 h-[40rem] w-[40rem] rounded-full bg-violet-600/20 blur-[120px]" />
        <div className="absolute -right-20 top-1/3 h-[34rem] w-[34rem] rounded-full bg-fuchsia-500/20 blur-[120px]" />
        <div className="absolute bottom-0 left-1/4 h-[30rem] w-[30rem] rounded-full bg-amber-400/10 blur-[120px]" />
      </div>
      <div
        className="pointer-events-none absolute inset-0 z-0 opacity-[0.06]"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.4) 1px, transparent 0)",
          backgroundSize: "32px 32px",
        }}
      />
    </>
  );
}

function PulseTile({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  tone: "success" | "warning" | "neutral";
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
        <p className="text-[10px] uppercase tracking-[0.2em] text-white/50">{label}</p>
        <p className="mt-2 font-serif text-3xl text-white">{value}</p>
        <p className="mt-1 text-xs text-white/60">{hint}</p>
      </div>
    </div>
  );
}

/**
 * SeraStage — Sera as an always-visible orb at the bottom of the screen.
 * She speaks (live caption above the orb), listens (input below),
 * and offers one-tap suggestions.
 */
export function SeraStage({
  say,
  thinking,
  suggestions,
  onAsk,
  onSuggestion,
  onUploadBill,
  onVoice,
}: {
  say: string;
  thinking: boolean;
  suggestions: string[];
  onAsk: (text: string) => void;
  onSuggestion: (text: string) => void;
  onUploadBill: () => void;
  onVoice: () => void;
}) {
  const [text, setText] = React.useState("");
  const [open, setOpen] = React.useState(false);

  return (
    <div className="fixed inset-x-0 bottom-0 z-40">
      {/* gradient veil that lifts the orb off the page */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-72 bg-gradient-to-t from-[#0a0612] via-[#0a0612]/80 to-transparent" />

      <div className="relative mx-auto max-w-3xl px-4 pb-5 sm:px-6">
        {/* Sera's live caption */}
        <div className="mb-3 flex justify-center">
          <div className="max-w-xl rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-center text-sm leading-relaxed text-white/85 shadow-[0_0_40px_rgba(168,85,247,0.15)] backdrop-blur-md">
            {say || "I'm here when you need me."}
          </div>
        </div>

        {/* Suggestion chips */}
        <div className="mb-3 flex flex-wrap justify-center gap-2">
          {suggestions.map((s) => (
            <button
              key={s}
              onClick={() => onSuggestion(s)}
              className="rounded-full border border-white/15 bg-white/[0.04] px-3.5 py-1.5 text-xs text-white/80 backdrop-blur-md transition-colors hover:border-violet-300/40 hover:bg-violet-500/15 hover:text-white"
            >
              {s}
            </button>
          ))}
        </div>

        {/* The orb + composer */}
        <div className="flex items-end gap-3">
          {/* Orb */}
          <div className="relative shrink-0">
            <div
              className={`absolute inset-0 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 blur-xl ${
                thinking ? "animate-pulse" : ""
              }`}
            />
            <button
              onClick={() => setOpen((v) => !v)}
              className="relative flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shadow-[0_0_30px_rgba(168,85,247,0.6)] transition-transform hover:scale-105"
              aria-label="Sera"
            >
              <Orbit className={`h-6 w-6 ${thinking ? "animate-spin" : ""}`} />
            </button>
          </div>

          {/* Composer */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!text.trim()) return;
              onAsk(text);
              setText("");
            }}
            className="flex flex-1 items-center gap-2 rounded-2xl border border-white/15 bg-white/[0.06] px-3 py-2 backdrop-blur-md focus-within:border-violet-300/50"
          >
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Ask Sera anything…"
              className="flex-1 bg-transparent text-sm text-white placeholder:text-white/40 focus:outline-none"
            />
            <button
              type="button"
              onClick={onVoice}
              className="flex h-9 w-9 items-center justify-center rounded-xl text-white/60 transition-colors hover:bg-white/10 hover:text-white"
              aria-label="Voice"
            >
              <Mic className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onUploadBill}
              className="flex h-9 w-9 items-center justify-center rounded-xl text-white/60 transition-colors hover:bg-white/10 hover:text-white"
              aria-label="Upload bill"
            >
              <Camera className="h-4 w-4" />
            </button>
            <button
              type="submit"
              disabled={!text.trim() || thinking}
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shadow-md transition-all hover:from-violet-400 hover:to-fuchsia-400 disabled:opacity-40"
              aria-label="Send"
            >
              {thinking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </form>
        </div>

        {/* Optional expanded shortcuts when orb tapped */}
        {open && (
          <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">
            {FIELDS.map((f) => (
              <div
                key={f.key}
                className="flex flex-col items-center gap-1.5 rounded-2xl border border-white/10 bg-white/[0.04] px-2 py-3 text-center backdrop-blur-md"
              >
                <div className={`flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br ${f.hue} text-white shadow-sm`}>
                  <f.Icon className="h-4 w-4" />
                </div>
                <span className="text-[10px] text-white/70">{f.label}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
