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
import { Link } from "@tanstack/react-router";
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
  const periodParam = `${latest.year}-${String(latest.month).padStart(2, "0")}`;

  /** Builds a deep-link from the Performance Summary to Data Insights,
   *  preserving role intent (operational / portfolio / governance). */
  type Focus = "electricity" | "gas" | "water" | "waste" | "score" | "best" | "gap" | "occupancy";
  type LinkDest = {
    to: "/workspace";
    search: { tab: "log" | "analyze"; from: "summary"; focus: Focus; period: string; intent: "review" | "missing" | "flagged" | "portfolio" | "governance" };
  };
  function buildDest(focus: Focus, opts?: { missing?: boolean; flagged?: boolean }): LinkDest {
    let intent: LinkDest["search"]["intent"] = "review";
    if (opts?.missing) intent = "missing";
    else if (opts?.flagged) intent = "flagged";
    else if (profileType === "vpo") intent = "portfolio";
    else if (profileType === "super_admin") intent = "governance";
    // Hotel users land in the Add-data tab to fix/review; VPO & Admin land in
    // the dashboard with the relevant role overlays already in scope.
    const tab: "log" | "analyze" =
      profileType === "hotel_user" || opts?.missing ? "log" : "analyze";
    return { to: "/workspace", search: { tab, from: "summary", focus, period: periodParam, intent } };
  }

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

      {profileType === "hotel_user" && (
      <>
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
          to={buildDest("score") as never}
          hint="Open the dashboard to see what drove the score"
        />
        <StatPill
          label="Occupied room-nights"
          value={occThis !== null ? formatNumber(occThis, 0) : "—"}
          unit="nights"
          trend={occMomPct === null ? null : occMomPct > 0 ? "up" : occMomPct < 0 ? "down" : "flat"}
          deltaText={occMomPct === null ? null : `${formatPct(occMomPct)} MoM`}
          accent="neutral"
          to={buildDest("occupancy", { missing: occThis === null }) as never}
          hint={occThis === null ? "Add occupancy for this period" : "Review occupancy entry"}
        />
        {bestRow && bestRow.position !== null ? (
          <StatPill
            label="Best ranking"
            value={`#${bestRow.position}`}
            unit={`of ${cohortSize}`}
            trend="up"
            deltaText={bestRow.label}
            accent="positive"
            to={buildDest(bestRow.key as Focus) as never}
            hint={`Drill into ${bestRow.label.toLowerCase()}`}
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
            to={buildDest(worstRow.key as Focus) as never}
            hint={`Drill into ${worstRow.label.toLowerCase()}`}
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
      </>
      )}

      {profileType === "vpo" && <VpoPortfolioSummary />}
      {profileType === "super_admin" && <AdminGovernanceSummary />}

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
  to,
  hint,
}: {
  label: string;
  value: string;
  unit: string;
  trend: "up" | "down" | "flat" | null;
  deltaText: string | null;
  accent: "primary" | "positive" | "negative" | "neutral";
  /** Optional deep-link destination — when provided, the tile becomes clickable. */
  to?: { to: "/workspace"; search: Record<string, string> };
  /** Tooltip-like hover hint shown when the tile is clickable. */
  hint?: string;
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

  const inner = (
    <>
      <div className="flex items-center justify-between gap-2">
        <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </div>
        {to ? (
          <span className="text-[10px] text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
            View →
          </span>
        ) : null}
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
    </>
  );

  if (to) {
    return (
      <Link
        to={to.to}
        search={to.search as never}
        title={hint}
        className="group block rounded-2xl border border-border/60 bg-background/40 p-3 text-left transition hover:border-primary/40 hover:bg-primary/5 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        {inner}
      </Link>
    );
  }
  return (
    <div className="rounded-2xl border border-border/60 bg-background/40 p-3">
      {inner}
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

/* ------------------------------------------------------------------ */
/*  Role-aware additions                                              */
/* ------------------------------------------------------------------ */

/** Mock portfolio aggregates — kept in sync with dashboard-role-lenses. */
const PORTFOLIO_SUMMARY = {
  total: 8,
  onTrack: 5,
  completeness: 90,
  late: 19,
  flagged: 9,
  energyAvg: 45.8,
  waterAvg: 540,
  carbonAvg: 12.7,
  yoyEnergy: -3.4,
};

const ROLE_BANNER: Record<
  ProfileType,
  { label: string; icon: LucideIcon; tone: string; question: string }
> = {
  hotel_user:  { label: "Hotel view",     icon: Building2,   tone: "bg-primary/10 text-primary border-primary/20",                                          question: "How is my hotel performing this month vs last year and target?" },
  vpo:         { label: "Portfolio view", icon: Users,       tone: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20",                question: "Is the portfolio reaching group targets, and which hotels are driving it?" },
  super_admin: { label: "Governance view",icon: ShieldCheck, tone: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20",        question: "Is the network reporting complete, valid and audit-ready?" },
};

function RolePerfBanner({ role }: { role: ProfileType }) {
  const meta = ROLE_BANNER[role];
  const Icon = meta.icon;
  return (
    <div className={`mb-4 flex items-start gap-3 rounded-xl border px-3 py-2 ${meta.tone}`}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em]">
          {meta.label}
          <span className="text-muted-foreground">· same data, different lens</span>
        </div>
        <div className="mt-0.5 text-xs font-medium text-foreground">{meta.question}</div>
      </div>
    </div>
  );
}

function PerfStat({
  label,
  value,
  unit,
  tone,
  icon: Icon,
  hint,
}: {
  label: string;
  value: string;
  unit?: string;
  tone: "good" | "warn" | "bad" | "neutral";
  icon: LucideIcon;
  hint?: string;
}) {
  const toneCls =
    tone === "good"
      ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300"
      : tone === "warn"
        ? "border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-300"
        : tone === "bad"
          ? "border-red-500/30 bg-red-500/5 text-red-700 dark:text-red-300"
          : "border-border bg-card/60 text-foreground";
  return (
    <div className={`rounded-2xl border p-3 ${toneCls}`}>
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] opacity-80">
        <Icon className="h-3 w-3" />
        {label}
      </div>
      <div className="mt-1 font-serif text-2xl font-semibold tabular-nums text-foreground">{value}</div>
      {unit ? <div className="text-[11px] text-muted-foreground">{unit}</div> : null}
      {hint ? <div className="mt-0.5 text-[11px] text-muted-foreground">{hint}</div> : null}
    </div>
  );
}

const VPO_HOTELS = [
  { name: "Olive Grove Inn",        energy: 36, on: true },
  { name: "Azure Bay Resort",       energy: 38, on: true },
  { name: "Marbella Grand",         energy: 41, on: true },
  { name: "Northwind City Hotel",   energy: 44, on: false },
  { name: "Costa Azul Resort",      energy: 47, on: false },
  { name: "Skyline Business Hotel", energy: 49, on: false },
  { name: "Alpine Sky Lodge",       energy: 53, on: false },
  { name: "Desert Pearl Lodge",     energy: 58, on: false },
];

function VpoPortfolioSummary() {
  const onTrackPct = Math.round((PORTFOLIO_SUMMARY.onTrack / PORTFOLIO_SUMMARY.total) * 100);
  const energyTarget = PORTFOLIO_TARGETS.energyIntensity;
  const energyGap = ((PORTFOLIO_SUMMARY.energyAvg - energyTarget) / energyTarget) * 100;
  const beating = PORTFOLIO_SUMMARY.energyAvg <= energyTarget;

  return (
    <>
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <PerfStat
          label="Hotels on track"
          value={`${PORTFOLIO_SUMMARY.onTrack}/${PORTFOLIO_SUMMARY.total}`}
          unit={`${onTrackPct}% of portfolio`}
          tone={onTrackPct >= 60 ? "good" : "warn"}
          icon={CheckCircle2}
        />
        <PerfStat
          label="Energy intensity"
          value={`${PORTFOLIO_SUMMARY.energyAvg.toFixed(1)}`}
          unit="kWh / room-night"
          tone={beating ? "good" : "warn"}
          icon={beating ? TrendingDown : TrendingUp}
          hint={`${beating ? "" : "+"}${energyGap.toFixed(1)}% vs target ${energyTarget}`}
        />
        <PerfStat
          label="YoY energy"
          value={`${PORTFOLIO_SUMMARY.yoyEnergy.toFixed(1)}%`}
          unit={`Target ${PORTFOLIO_TARGETS.yoyEnergy}%`}
          tone={PORTFOLIO_SUMMARY.yoyEnergy <= PORTFOLIO_TARGETS.yoyEnergy ? "good" : "warn"}
          icon={TrendingDown}
        />
        <PerfStat
          label="Group target"
          value={`${energyTarget}`}
          unit="kWh / room-night"
          tone="neutral"
          icon={Target}
          hint="Illustrative — Accor-style"
        />
      </div>

      <div className="overflow-hidden rounded-2xl border border-border/60">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-2 text-left font-medium">Hotel</th>
              <th className="px-3 py-2 text-right font-medium">Energy intensity</th>
              <th className="px-3 py-2 text-right font-medium">vs target ({energyTarget})</th>
              <th className="px-3 py-2 text-right font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {VPO_HOTELS.map((h, i) => {
              const gap = ((h.energy - energyTarget) / energyTarget) * 100;
              return (
                <tr key={h.name} className={i < VPO_HOTELS.length - 1 ? "border-b border-border/50" : ""}>
                  <td className="px-4 py-2.5 font-medium text-foreground">{h.name}</td>
                  <td className="num px-3 py-2.5 text-right tabular-nums text-foreground">
                    {h.energy} <span className="text-[11px] text-muted-foreground">kWh/rn</span>
                  </td>
                  <td className="num px-3 py-2.5 text-right tabular-nums">
                    <span className={h.on ? "text-emerald-700 dark:text-emerald-300" : "text-amber-700 dark:text-amber-300"}>
                      {gap > 0 ? "+" : ""}{gap.toFixed(1)}%
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                      h.on
                        ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                        : "bg-amber-500/10 text-amber-700 dark:text-amber-300"
                    }`}>
                      {h.on ? "On track" : "Off track"}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        Portfolio aggregate of {PORTFOLIO_SUMMARY.total} hotels, normalised per occupied
        room-night. Targets are illustrative, aligned with Accor-style ambitions.
      </p>
    </>
  );
}

function AdminGovernanceSummary() {
  return (
    <>
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <PerfStat
          label="Network completeness"
          value={`${PORTFOLIO_SUMMARY.completeness}%`}
          unit={`Target ${PORTFOLIO_TARGETS.completeness}%`}
          tone={PORTFOLIO_SUMMARY.completeness >= PORTFOLIO_TARGETS.completeness ? "good" : "warn"}
          icon={CheckCircle2}
        />
        <PerfStat
          label="Hotels at 100%"
          value={`5/${PORTFOLIO_SUMMARY.total}`}
          unit="Fully reported"
          tone="warn"
          icon={Building2}
        />
        <PerfStat
          label="Late submissions"
          value={`${PORTFOLIO_SUMMARY.late}`}
          unit="Last 12 months"
          tone={PORTFOLIO_SUMMARY.late === 0 ? "good" : PORTFOLIO_SUMMARY.late < 10 ? "warn" : "bad"}
          icon={AlertTriangle}
        />
        <PerfStat
          label="Open anomalies"
          value={`${PORTFOLIO_SUMMARY.flagged}`}
          unit="Awaiting review"
          tone={PORTFOLIO_SUMMARY.flagged === 0 ? "good" : "warn"}
          icon={AlertTriangle}
        />
      </div>

      <div className="overflow-hidden rounded-2xl border border-border/60">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-2 text-left font-medium">Reporting health checkpoint</th>
              <th className="px-3 py-2 text-right font-medium">Status</th>
              <th className="px-3 py-2 text-right font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {[
              { label: "Monthly utility submissions complete", ok: false, action: "Chase 3 hotels" },
              { label: "Reading dates within 30-day SLA",       ok: false, action: "Review late list" },
              { label: "Validity rules — no flagged anomalies", ok: false, action: `${PORTFOLIO_SUMMARY.flagged} to clear` },
              { label: "Carbon scope coverage consistent",      ok: true,  action: "—" },
              { label: "Campaign continuity vs prior year",     ok: true,  action: "—" },
            ].map((row, i, arr) => (
              <tr key={row.label} className={i < arr.length - 1 ? "border-b border-border/50" : ""}>
                <td className="px-4 py-2.5 font-medium text-foreground">{row.label}</td>
                <td className="px-3 py-2.5 text-right">
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                    row.ok
                      ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                      : "bg-amber-500/10 text-amber-700 dark:text-amber-300"
                  }`}>
                    {row.ok ? "OK" : "Watch"}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-right text-xs text-muted-foreground">{row.action}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        Programme-wide governance snapshot across {PORTFOLIO_SUMMARY.total} hotels —
        completeness, validity and audit readiness rather than site performance.
      </p>
    </>
  );
}
