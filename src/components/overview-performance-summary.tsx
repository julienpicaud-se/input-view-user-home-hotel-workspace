import * as React from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  Bolt,
  Building2,
  Droplets,
  Flame,
  Loader2,
  Minus,
  ShieldCheck,
  Sparkles,
  Trash2,
  TrendingDown,
  TrendingUp,
  Trophy,
  Users,
  AlertTriangle,
  CheckCircle2,
  Target,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MONTH_NAMES, formatNumber } from "@/lib/format";
import { getPeerRank, getPeerStats, type Utility } from "@/lib/peer-benchmarks";
import { getActiveHotelId, type Hotel, type MonthlyEntry } from "@/lib/hotel";
import { sendAssistantMessage } from "@/server/assistant.functions";
import { useProfileType, type ProfileType } from "@/lib/profile-type";
import { PORTFOLIO_TARGETS } from "@/components/dashboard-role-lenses";

interface UtilityDef {
  key: Utility;
  label: string;
  unit: string;
  entryKey: keyof MonthlyEntry;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  color: string;
}

const UTILITIES: UtilityDef[] = [
  { key: "electricity", label: "Electricity", unit: "kWh/rn", entryKey: "electricity_kwh", icon: Bolt, color: "var(--chart-3)" },
  { key: "gas", label: "Gas", unit: "kWh/rn", entryKey: "gas_kwh", icon: Flame, color: "var(--chart-1)" },
  { key: "water", label: "Water", unit: "m³/rn", entryKey: "water_m3", icon: Droplets, color: "var(--chart-2)" },
  { key: "waste", label: "Waste", unit: "kg/rn", entryKey: "waste_kg", icon: Trash2, color: "var(--chart-5)" },
];

function intensity(entry: MonthlyEntry | undefined, key: keyof MonthlyEntry): number | null {
  if (!entry) return null;
  const v = entry[key] as number | null | undefined;
  if (v === null || v === undefined) return null;
  if (!entry.occupied_room_nights || entry.occupied_room_nights <= 0) return null;
  return v / entry.occupied_room_nights;
}

function pctChange(prev: number | null, curr: number | null): number | null {
  if (prev === null || curr === null || prev === 0) return null;
  return ((curr - prev) / prev) * 100;
}

function formatPct(n: number | null): string {
  if (n === null) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(1)}%`;
}

interface PerfRow {
  key: Utility;
  label: string;
  unit: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  color: string;
  value: number | null;
  momPct: number | null;
  yoyPct: number | null;
  rank: number | null; // 0-100, lower better
  position: number | null;
}

export function OverviewPerformanceSummary({
  hotel,
  entries,
  score,
  scoreDelta,
  cohortSize,
}: {
  hotel: Hotel;
  entries: MonthlyEntry[];
  score: number | null;
  scoreDelta: number | null;
  cohortSize: number;
}) {
  const { profileType } = useProfileType();
  const filters = {
    sizeBand: hotel.size_band,
    region: hotel.region,
    starRating: hotel.star_rating,
  };

  const sorted = React.useMemo(
    () =>
      [...entries].sort((a, b) =>
        a.year !== b.year ? a.year - b.year : a.month - b.month,
      ),
    [entries],
  );

  const latest = sorted[sorted.length - 1];
  const prev = sorted[sorted.length - 2];
  const lastYearSame = latest
    ? sorted.find((e) => e.year === latest.year - 1 && e.month === latest.month)
    : undefined;

  const rows: PerfRow[] = React.useMemo(() => {
    if (!latest) return [];
    return UTILITIES.map((u) => {
      const value = intensity(latest, u.entryKey);
      const prevValue = intensity(prev, u.entryKey);
      const lyValue = intensity(lastYearSame, u.entryKey);
      const stats = getPeerStats(u.key, latest.month, filters);
      const rank = value !== null ? getPeerRank(value, stats) : null;
      const position =
        rank !== null ? Math.max(1, Math.round((rank / 100) * cohortSize)) : null;
      return {
        key: u.key,
        label: u.label,
        unit: u.unit,
        icon: u.icon,
        color: u.color,
        value,
        momPct: pctChange(prevValue, value),
        yoyPct: pctChange(lyValue, value),
        rank,
        position,
      };
    });
  }, [latest, prev, lastYearSame, filters, cohortSize]);

  if (!latest) {
    return (
      <Card className="rounded-3xl border-border/70 p-6">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-secondary text-primary-foreground shadow-md">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-serif text-xl font-semibold">Performance summary</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Log this month's electricity, gas, water, waste and occupancy to
              unlock your performance recap.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  const monthLabel = `${MONTH_NAMES[latest.month - 1]} ${latest.year}`;
  const validRanked = rows.filter((r) => r.rank !== null);
  const sortedByRank = [...validRanked].sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));
  const bestRow = sortedByRank[0] ?? null;
  const worstRow = sortedByRank[sortedByRank.length - 1] ?? null;

  // Compose a plain-language headline
  let headline: string;
  if (!bestRow || !worstRow) {
    headline = `Recap for ${monthLabel}.`;
  } else if (
    bestRow.rank !== null &&
    bestRow.rank <= 25 &&
    worstRow.rank !== null &&
    worstRow.rank <= 50
  ) {
    headline = `Strong month — you're ahead of similar hotels in ${monthLabel}, led by ${bestRow.label.toLowerCase()}.`;
  } else if (
    worstRow.rank !== null &&
    worstRow.rank >= 75 &&
    bestRow.rank !== null &&
    bestRow.rank >= 50
  ) {
    headline = `${monthLabel} is trailing your cohort — ${worstRow.label.toLowerCase()} is the biggest gap.`;
  } else if (worstRow.rank !== null && worstRow.rank >= 75) {
    headline = `Mixed performance in ${monthLabel} — strong on ${bestRow.label.toLowerCase()}, lagging on ${worstRow.label.toLowerCase()}.`;
  } else {
    headline = `You're sitting mid-pack in ${monthLabel} versus ${cohortSize} similar hotels.`;
  }

  // Score tone
  const scoreDisplay = score !== null ? Math.round(score) : null;
  const scoreTrend =
    scoreDelta === null
      ? null
      : scoreDelta > 0.5
        ? "up"
        : scoreDelta < -0.5
          ? "down"
          : "flat";

  // Occupancy
  const occThis = latest.occupied_room_nights ?? null;
  const occPrev = prev?.occupied_room_nights ?? null;
  const occMomPct = pctChange(occPrev, occThis);

  // AI: explain score drivers + quickest wins
  const send = useServerFn(sendAssistantMessage);
  const [aiPending, setAiPending] = React.useState(false);
  const [aiAnswer, setAiAnswer] = React.useState<string | null>(null);

  async function explainScoreDrivers() {
    if (aiPending) return;
    setAiPending(true);
    setAiAnswer(null);
    try {
      const utilityLines = rows
        .map((r) => {
          const valStr =
            r.value !== null ? `${formatNumber(r.value, 2)} ${r.unit}` : "—";
          const mom = r.momPct !== null ? formatPct(r.momPct) : "—";
          const yoy = r.yoyPct !== null ? formatPct(r.yoyPct) : "—";
          const rank =
            r.position !== null
              ? `#${r.position} of ${cohortSize} (percentile ${Math.round(r.rank ?? 0)})`
              : "no peer data";
          return `- ${r.label}: ${valStr} — MoM ${mom}, YoY ${yoy}, peer rank ${rank}`;
        })
        .join("\n");

      const scoreLine =
        scoreDisplay !== null
          ? `${scoreDisplay}/100${
              scoreDelta !== null
                ? ` (${scoreDelta > 0 ? "+" : ""}${scoreDelta.toFixed(1)} vs last month)`
                : ""
            }`
          : "not yet computed";

      const prompt = `My sustainability score for ${monthLabel} at ${hotel.name} (${hotel.rooms} rooms, ${hotel.size_band} band, ${hotel.region}, ${hotel.star_rating}★) is **${scoreLine}**.

Per-utility intensities (per occupied room-night) vs last month, last year, and ${cohortSize} similar Mediterranean hotels:
${utilityLines}

Occupancy this month: ${occThis !== null ? formatNumber(occThis, 0) : "—"} room-nights${occMomPct !== null ? ` (${formatPct(occMomPct)} MoM)` : ""}.

Please:
1. In 2–3 plain-language sentences, explain what is **driving my score up or down** this month — call out which utilities helped and which hurt, and reference the peer ranks and trends above.
2. Then list **2–3 quickest wins for next month** as a short bullet list, prioritised by impact and ease. For each, name the utility, the concrete action, and a rough expected improvement (% or absolute). Skip generic advice.`;

      const res = await send({
        data: {
          message: prompt,
          hotelId: getActiveHotelId(),
          history: [],
        },
      });
      if (res.ok) {
        setAiAnswer(res.content);
      } else {
        toast.error(res.error);
      }
    } catch {
      toast.error("Couldn't reach Sera. Please try again.");
    } finally {
      setAiPending(false);
    }
  }

  return (
    <Card className="rounded-3xl border-border/70 bg-card/60 p-6 backdrop-blur-sm">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-secondary text-primary-foreground shadow-md">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-serif text-xl font-semibold">
                Performance summary
              </h2>
              <Badge
                variant="secondary"
                className="rounded-full text-[10px] uppercase tracking-wider"
              >
                {monthLabel}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {profileType === "hotel_user"
                ? `A snapshot of how ${hotel.name} performed this month versus last month, last year, and ${cohortSize} similar hotels.`
                : profileType === "vpo"
                  ? "Same hotel KPIs, rolled up to your portfolio — with target tracking and hotel-level contributions."
                  : "Same hotel KPIs, viewed through a programme governance lens — completeness, validity and reporting readiness."}
            </p>
          </div>
        </div>
      </div>

      <RolePerfBanner role={profileType} />

      <p className="mb-5 font-serif text-lg leading-snug text-foreground">
        {profileType === "hotel_user"
          ? headline
          : profileType === "vpo"
            ? `Portfolio recap for ${monthLabel} — ${PORTFOLIO_SUMMARY.onTrack}/${PORTFOLIO_SUMMARY.total} hotels on track on energy intensity.`
            : `Network recap for ${monthLabel} — ${PORTFOLIO_SUMMARY.completeness}% reporting completeness, ${PORTFOLIO_SUMMARY.late} late submissions to chase.`}
      </p>

      {/* Stat strip */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatPill
          label="Sustainability score"
          value={scoreDisplay !== null ? `${scoreDisplay}` : "—"}
          unit="/ 100"
          trend={scoreTrend}
          deltaText={
            scoreDelta === null
              ? null
              : `${scoreDelta > 0 ? "+" : ""}${scoreDelta.toFixed(1)} vs last month`
          }
          accent="primary"
        />
        <StatPill
          label="Occupied room-nights"
          value={occThis !== null ? formatNumber(occThis, 0) : "—"}
          unit="nights"
          trend={occMomPct === null ? null : occMomPct > 0 ? "up" : occMomPct < 0 ? "down" : "flat"}
          deltaText={occMomPct === null ? null : `${formatPct(occMomPct)} MoM`}
          accent="neutral"
        />
        {bestRow && bestRow.position !== null ? (
          <StatPill
            label="Best ranking"
            value={`#${bestRow.position}`}
            unit={`of ${cohortSize}`}
            trend="up"
            deltaText={bestRow.label}
            accent="positive"
          />
        ) : (
          <StatPill label="Best ranking" value="—" unit="" trend={null} deltaText={null} accent="neutral" />
        )}
        {worstRow && worstRow.position !== null ? (
          <StatPill
            label="Biggest gap"
            value={`#${worstRow.position}`}
            unit={`of ${cohortSize}`}
            trend="down"
            deltaText={worstRow.label}
            accent="negative"
          />
        ) : (
          <StatPill label="Biggest gap" value="—" unit="" trend={null} deltaText={null} accent="neutral" />
        )}
      </div>

      {/* Per-utility recap */}
      <div className="overflow-hidden rounded-2xl border border-border/60">
        <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="sticky left-0 z-10 bg-muted/95 px-4 py-2 text-left font-medium backdrop-blur-sm">Utility</th>
              <th className="px-3 py-2 text-right font-medium">This month</th>
              <th className="px-3 py-2 text-right font-medium">vs last month</th>
              <th className="px-3 py-2 text-right font-medium">vs last year</th>
              <th className="px-3 py-2 text-right font-medium">Peer rank</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const Icon = r.icon;
              return (
                <tr
                  key={r.key}
                  className={
                    i < rows.length - 1
                      ? "border-b border-border/50"
                      : ""
                  }
                >
                  <td className="sticky left-0 z-10 bg-card/95 px-4 py-3 backdrop-blur-sm">
                    <div className="flex items-center gap-2">
                      <div
                        className="flex h-7 w-7 items-center justify-center rounded-lg"
                        style={{
                          backgroundColor: `color-mix(in oklab, ${r.color} 15%, transparent)`,
                        }}
                      >
                        <Icon className="h-3.5 w-3.5" style={{ color: r.color }} />
                      </div>
                      <span className="font-medium text-foreground">
                        {r.label}
                      </span>
                    </div>
                  </td>
                  <td className="num px-3 py-3 text-right text-foreground">
                    {r.value !== null ? (
                      <>
                        {formatNumber(r.value, 2)}
                        <span className="ml-1 text-[11px] text-muted-foreground">
                          {r.unit}
                        </span>
                      </>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right">
                    <DeltaCell pct={r.momPct} />
                  </td>
                  <td className="px-3 py-3 text-right">
                    <DeltaCell pct={r.yoyPct} />
                  </td>
                  <td className="px-3 py-3 text-right">
                    {r.position !== null ? (
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                          (r.rank ?? 100) <= 25
                            ? "bg-primary/10 text-primary"
                            : (r.rank ?? 0) >= 75
                              ? "bg-destructive/10 text-destructive"
                              : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {(r.rank ?? 100) <= 25 && (
                          <Trophy className="h-3 w-3" />
                        )}
                        #{r.position} of {cohortSize}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        All values are intensities per occupied room-night. Trends compare the
        latest month to the previous month and to the same month last year (when
        available). Peer rank uses {cohortSize} similar Mediterranean hotels.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border/50 pt-4">
        <Button
          type="button"
          size="sm"
          onClick={() => void explainScoreDrivers()}
          disabled={aiPending}
          className="rounded-full border border-foreground/20 bg-foreground text-background shadow-sm hover:bg-foreground/90 disabled:opacity-70"
        >
          {aiPending ? (
            <>
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              Sera is analysing…
            </>
          ) : (
            <>
              <Sparkles className="mr-1.5 h-3.5 w-3.5" />
              Explain my score & quickest wins
            </>
          )}
        </Button>
        {aiAnswer && !aiPending && (
          <button
            type="button"
            onClick={() => setAiAnswer(null)}
            className="text-[11px] text-muted-foreground hover:text-foreground"
          >
            Clear
          </button>
        )}
      </div>

      {aiAnswer && (
        <div className="mt-3 rounded-2xl border border-primary/25 bg-primary/5 p-4">
          <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">
            <Sparkles className="h-3.5 w-3.5" />
            Sera's take on your score
          </div>
          <div className="prose prose-sm max-w-none prose-p:my-1.5 prose-p:text-foreground prose-strong:text-foreground prose-li:my-0.5 prose-ul:my-1.5 prose-ol:my-1.5">
            <ReactMarkdown>{aiAnswer}</ReactMarkdown>
          </div>
        </div>
      )}
    </Card>
  );
}

function StatPill({
  label,
  value,
  unit,
  trend,
  deltaText,
  accent,
}: {
  label: string;
  value: string;
  unit: string;
  trend: "up" | "down" | "flat" | null;
  deltaText: string | null;
  accent: "primary" | "positive" | "negative" | "neutral";
}) {
  const accentBg =
    accent === "primary"
      ? "bg-primary/10"
      : accent === "positive"
        ? "bg-primary/10"
        : accent === "negative"
          ? "bg-destructive/10"
          : "bg-muted/40";
  const accentText =
    accent === "primary"
      ? "text-primary"
      : accent === "positive"
        ? "text-primary"
        : accent === "negative"
          ? "text-destructive"
          : "text-muted-foreground";
  const TrendIcon =
    trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : Minus;

  return (
    <div className="rounded-2xl border border-border/60 bg-background/40 p-3">
      <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="font-serif text-2xl font-semibold text-foreground">
          {value}
        </span>
        {unit && (
          <span className="text-[11px] text-muted-foreground">{unit}</span>
        )}
      </div>
      {deltaText && (
        <div
          className={`mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${accentBg} ${accentText}`}
        >
          {trend !== null && <TrendIcon className="h-3 w-3" />}
          {deltaText}
        </div>
      )}
    </div>
  );
}

function DeltaCell({ pct }: { pct: number | null }) {
  if (pct === null)
    return <span className="text-xs text-muted-foreground">—</span>;
  const tone =
    pct < -1 ? "positive" : pct > 1 ? "negative" : "neutral";
  const Icon =
    tone === "positive"
      ? ArrowDownRight
      : tone === "negative"
        ? ArrowUpRight
        : Minus;
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-medium ${
        tone === "positive"
          ? "text-primary"
          : tone === "negative"
            ? "text-destructive"
            : "text-muted-foreground"
      }`}
    >
      <Icon className="h-3 w-3" />
      {formatPct(pct)}
    </span>
  );
}
