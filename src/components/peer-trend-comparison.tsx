import * as React from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as ReTooltip,
  CartesianGrid,
  Legend,
  ReferenceLine,
} from "recharts";
import {
  ArrowDownRight,
  ArrowUpRight,
  Bolt,
  Droplets,
  Flame,
  LineChart,
  Loader2,
  Minus,
  Sparkles,
  Trash2,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MONTH_NAMES, MONTH_SHORT, formatNumber } from "@/lib/format";
import { getPeerStats, type Utility } from "@/lib/peer-benchmarks";
import { getActiveHotelId, type Hotel, type MonthlyEntry } from "@/lib/hotel";
import { sendAssistantMessage } from "@/server/assistant.functions";


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

interface UtilityDelta {
  key: Utility;
  label: string;
  unit: string;
  color: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  yoursDeltaPct: number | null;
  peersDeltaPct: number | null;
  gapPct: number | null;
  yoursPrev: number | null;
  yoursCurr: number | null;
  peersPrev: number | null;
  peersCurr: number | null;
}

function intensity(entry: MonthlyEntry | undefined, key: keyof MonthlyEntry): number | null {
  if (!entry) return null;
  const v = entry[key] as number | null | undefined;
  if (v === null || v === undefined) return null;
  if (!entry.occupied_room_nights || entry.occupied_room_nights <= 0) return null;
  return v / entry.occupied_room_nights;
}

function pctChange(prev: number | null, curr: number | null): number | null {
  if (prev === null || curr === null) return null;
  if (prev === 0) return null;
  return ((curr - prev) / prev) * 100;
}

// Clamp implausibly large month-over-month changes to keep visuals readable
// while still flagging extreme outliers. Real-world hotel utility MoM swings
// rarely exceed ±60% (apart from gas in shoulder seasons).
function clampPct(n: number | null, max = 80): number | null {
  if (n === null) return null;
  if (n > max) return max;
  if (n < -max) return -max;
  return n;
}

function findConsecutiveMonths(
  entries: MonthlyEntry[],
): { previous: MonthlyEntry; latest: MonthlyEntry } | null {
  if (entries.length < 2) return null;
  // entries are pre-sorted ascending by year/month; walk from the end.
  for (let i = entries.length - 1; i >= 1; i--) {
    const curr = entries[i];
    const prev = entries[i - 1];
    const monthsApart =
      (curr.year - prev.year) * 12 + (curr.month - prev.month);
    if (monthsApart === 1) {
      return { previous: prev, latest: curr };
    }
  }
  return null;
}

export function PeerTrendComparison({
  hotel,
  entries,
  cohortSize,
}: {
  hotel: Hotel;
  entries: MonthlyEntry[];
  cohortSize: number;
}) {
  const send = useServerFn(sendAssistantMessage);
  const [aiPending, setAiPending] = React.useState(false);
  const [aiAnswer, setAiAnswer] = React.useState<string | null>(null);

  const filters = {
    sizeBand: hotel.size_band,
    region: hotel.region,
    starRating: hotel.star_rating,
  };

  const pair = React.useMemo(() => findConsecutiveMonths(entries), [entries]);

  const deltas: UtilityDelta[] = React.useMemo(() => {
    if (!pair) return [];
    const { previous, latest } = pair;

    return UTILITIES.map((u) => {
      const yoursPrev = intensity(previous, u.entryKey);
      const yoursCurr = intensity(latest, u.entryKey);
      const peersPrev = getPeerStats(u.key, previous.month, filters).median;
      const peersCurr = getPeerStats(u.key, latest.month, filters).median;

      const yoursDeltaPct = pctChange(yoursPrev, yoursCurr);
      const peersDeltaPct = pctChange(peersPrev, peersCurr);
      const gapPct =
        yoursDeltaPct !== null && peersDeltaPct !== null
          ? yoursDeltaPct - peersDeltaPct
          : null;

      return {
        key: u.key,
        label: u.label,
        unit: u.unit,
        color: u.color,
        icon: u.icon,
        yoursDeltaPct,
        peersDeltaPct,
        gapPct,
        yoursPrev,
        yoursCurr,
        peersPrev,
        peersCurr,
      };
    });
  }, [pair, filters]);

  if (!pair) {
    return (
      <Card className="mb-6 rounded-3xl border-border/70 p-6">
        <div className="mb-2 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-secondary text-primary-foreground shadow-md">
            <LineChart className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-serif text-xl font-semibold">Month-to-month vs peers</h2>
            <p className="text-sm text-muted-foreground">
              Log two consecutive months of utilities and occupancy to unlock the
              trend comparison.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  const { previous, latest } = pair;
  const monthLabel = `${MONTH_NAMES[latest.month - 1]} ${latest.year}`;
  const prevMonthLabel = `${MONTH_SHORT[previous.month - 1]} ${String(previous.year).slice(2)}`;
  const currMonthLabel = `${MONTH_SHORT[latest.month - 1]} ${String(latest.year).slice(2)}`;

  // Chart-friendly data: side-by-side "you" vs "peers" MoM %
  const chartData = deltas
    .filter((d) => d.yoursDeltaPct !== null && d.peersDeltaPct !== null)
    .map((d) => ({
      label: d.label,
      yours: clampPct(d.yoursDeltaPct)!,
      peers: clampPct(d.peersDeltaPct)!,
    }));

  // Driver narrative — based on raw (unclamped) gap so flagged extremes are honest
  const valid = deltas.filter((d) => d.gapPct !== null);
  const sortedByGap = [...valid].sort((a, b) => (a.gapPct ?? 0) - (b.gapPct ?? 0));
  const bestDriver = sortedByGap[0] ?? null;
  const worstDriver = sortedByGap[sortedByGap.length - 1] ?? null;

  let headline: string;
  if (!bestDriver || !worstDriver || valid.length === 0) {
    headline = `Not enough utility coverage to compare ${prevMonthLabel} → ${currMonthLabel}.`;
  } else if (
    bestDriver.gapPct !== null &&
    worstDriver.gapPct !== null &&
    bestDriver.gapPct < -2 &&
    worstDriver.gapPct < 2
  ) {
    headline = `You moved better than peers across the board in ${monthLabel} — led by ${bestDriver.label.toLowerCase()}.`;
  } else if (
    worstDriver.gapPct !== null &&
    bestDriver.gapPct !== null &&
    worstDriver.gapPct > 2 &&
    bestDriver.gapPct > -2
  ) {
    headline = `Your ${monthLabel} trend is rising faster than peers — ${worstDriver.label.toLowerCase()} is the main driver.`;
  } else if (worstDriver.gapPct !== null && bestDriver.gapPct !== null) {
    headline = `Mixed month-to-month picture: ${bestDriver.label.toLowerCase()} beat the cohort, ${worstDriver.label.toLowerCase()} lagged it.`;
  } else {
    headline = `Trend comparison for ${monthLabel}.`;
  }

  function describeDriver(d: UtilityDelta, kind: "best" | "worst"): string {
    if (d.gapPct === null || d.yoursDeltaPct === null || d.peersDeltaPct === null) return "";
    const yoursWord =
      d.yoursDeltaPct > 1 ? "rose" : d.yoursDeltaPct < -1 ? "fell" : "held steady";
    const peersWord =
      d.peersDeltaPct > 1 ? "rose" : d.peersDeltaPct < -1 ? "fell" : "held steady";
    const gapMag = Math.abs(d.gapPct).toFixed(1);
    if (kind === "best") {
      return `${d.label} ${yoursWord} ${formatPct(d.yoursDeltaPct)} while peers ${peersWord} ${formatPct(d.peersDeltaPct)} — a ${gapMag} pp advantage.`;
    }
    return `${d.label} ${yoursWord} ${formatPct(d.yoursDeltaPct)} versus peers ${peersWord} ${formatPct(d.peersDeltaPct)} — a ${gapMag} pp shortfall.`;
  }

  return (
    <Card className="mb-6 rounded-3xl border-border/70 bg-card/60 p-6 backdrop-blur-sm">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-secondary text-primary-foreground shadow-md">
            <LineChart className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-serif text-xl font-semibold">Month-to-month vs peers</h2>
              <Badge
                variant="secondary"
                className="rounded-full text-[10px] uppercase tracking-wider"
              >
                {prevMonthLabel} → {currMonthLabel}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              How your trend moved compared with the median of {cohortSize} similar hotels.
            </p>
          </div>
        </div>
      </div>

      <p className="mb-4 font-serif text-lg leading-snug text-foreground">{headline}</p>

      {chartData.length > 0 && (
        <div className="mb-5 h-60 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              margin={{ top: 10, right: 16, left: 0, bottom: 10 }}
              barCategoryGap="25%"
            >
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              />
              <YAxis
                tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                tickFormatter={(v: number) => `${v > 0 ? "+" : ""}${v.toFixed(0)}%`}
              />
              <ReferenceLine y={0} stroke="var(--border)" />
              <ReTooltip
                contentStyle={{
                  backgroundColor: "var(--card)",
                  border: "1px solid var(--border)",
                  borderRadius: 12,
                  fontSize: 12,
                }}
                formatter={(value: number, name: string) => {
                  const label = name === "yours" ? "Your hotel" : "Peer median";
                  return [formatPct(value), label];
                }}
              />
              <Legend
                verticalAlign="top"
                height={28}
                iconType="circle"
                wrapperStyle={{ fontSize: 11, color: "var(--muted-foreground)" }}
                formatter={(v) => (v === "yours" ? "Your hotel" : "Peer median")}
              />
              <Bar
                dataKey="yours"
                fill="color-mix(in oklab, var(--primary) 80%, transparent)"
                radius={[6, 6, 0, 0]}
              />
              <Bar
                dataKey="peers"
                fill="color-mix(in oklab, var(--muted-foreground) 35%, transparent)"
                radius={[6, 6, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {deltas.map((d) => {
          const Icon = d.icon;
          const tone =
            d.gapPct === null
              ? "neutral"
              : d.gapPct < -1
                ? "positive"
                : d.gapPct > 1
                  ? "negative"
                  : "neutral";
          const TrendIcon =
            tone === "positive"
              ? ArrowDownRight
              : tone === "negative"
                ? ArrowUpRight
                : Minus;
          return (
            <div
              key={d.key}
              className="flex items-start gap-3 rounded-2xl border border-border/60 bg-background/40 p-3"
            >
              <div
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                style={{
                  backgroundColor: `color-mix(in oklab, ${d.color} 15%, transparent)`,
                }}
              >
                <Icon className="h-4 w-4" style={{ color: d.color }} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-medium text-foreground">{d.label}</div>
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                      tone === "positive"
                        ? "bg-primary/10 text-primary"
                        : tone === "negative"
                          ? "bg-destructive/10 text-destructive"
                          : "bg-muted text-muted-foreground"
                    }`}
                  >
                    <TrendIcon className="h-3 w-3" />
                    {d.gapPct === null ? "—" : `${formatPct(d.gapPct)} vs peers`}
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    {(d.yoursDeltaPct ?? 0) >= 0 ? (
                      <TrendingUp className="h-3 w-3" />
                    ) : (
                      <TrendingDown className="h-3 w-3" />
                    )}
                    You {d.yoursDeltaPct === null ? "—" : formatPct(d.yoursDeltaPct)}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    Peers {d.peersDeltaPct === null ? "—" : formatPct(d.peersDeltaPct)}
                  </span>
                </div>
                <div className="mt-1 text-[11px] text-muted-foreground">
                  {d.yoursPrev !== null && d.yoursCurr !== null ? (
                    <>
                      {formatNumber(d.yoursPrev, 2)} → {formatNumber(d.yoursCurr, 2)} {d.unit}
                    </>
                  ) : (
                    <>Missing data for {d.label.toLowerCase()}</>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {bestDriver && worstDriver && bestDriver.key !== worstDriver.key && (
        <div className="mt-5 rounded-2xl border border-border/60 bg-background/40 p-4 text-sm leading-relaxed">
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            What's driving the gap
          </div>
          <ul className="space-y-1 text-foreground">
            <li className="flex gap-2">
              <ArrowDownRight className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span>{describeDriver(bestDriver, "best")}</span>
            </li>
            <li className="flex gap-2">
              <ArrowUpRight className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              <span>{describeDriver(worstDriver, "worst")}</span>
            </li>
          </ul>
          <p className="mt-2 text-xs text-muted-foreground">
            Comparison uses your last two consecutive months ({prevMonthLabel} →{" "}
            {currMonthLabel}). "Gap vs peers" = your % change minus the peer
            median's % change. Negative is better.
          </p>
        </div>
      )}
    </Card>
  );
}

function formatPct(n: number): string {
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(1)}%`;
}
