import { createFileRoute, Link } from "@tanstack/react-router";
import * as React from "react";
import { motion } from "framer-motion";
import {
  ArrowDownRight,
  ArrowUpRight,
  Bolt,
  Droplets,
  Flame,
  Trash2,
  Sparkles,
  ArrowRight,
  Info,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  Line,
  LineChart,
  XAxis,
  YAxis,
  Tooltip as ReTooltip,
  CartesianGrid,
  ComposedChart,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { DEMO_HOTEL_ID, type Hotel, type MonthlyEntry } from "@/lib/hotel";
import {
  MONTH_NAMES,
  MONTH_SHORT,
  calculateCO2e,
  formatNumber,
  formatPct,
  pctChange,
} from "@/lib/format";
import {
  getPeerCohortSize,
  getPeerRank,
  getPeerStats,
} from "@/lib/peer-benchmarks";
import { PageContainer, PageHeader } from "@/components/page-shell";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { generateInsights, type Insight } from "@/server/assistant.functions";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard — Verdance" },
      {
        name: "description",
        content: "Your hotel's sustainability performance at a glance.",
      },
    ],
  }),
  component: DashboardPage,
});

interface KpiDef {
  key: "electricity_kwh" | "gas_kwh" | "water_m3" | "waste_kg";
  label: string;
  unit: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}

const KPIS: KpiDef[] = [
  { key: "electricity_kwh", label: "Electricity", unit: "kWh", icon: Bolt, color: "var(--chart-3)" },
  { key: "gas_kwh", label: "Gas", unit: "kWh", icon: Flame, color: "var(--chart-1)" },
  { key: "water_m3", label: "Water", unit: "m³", icon: Droplets, color: "var(--chart-2)" },
  { key: "waste_kg", label: "Waste", unit: "kg", icon: Trash2, color: "var(--chart-5)" },
];

function DashboardPage() {
  const [hotel, setHotel] = React.useState<Hotel | null>(null);
  const [entries, setEntries] = React.useState<MonthlyEntry[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [perRoom, setPerRoom] = React.useState(false);
  const [insights, setInsights] = React.useState<Insight[]>([]);
  const [insightsLoading, setInsightsLoading] = React.useState(false);

  React.useEffect(() => {
    void (async () => {
      const [{ data: h }, { data: e }] = await Promise.all([
        supabase.from("hotels").select("*").eq("id", DEMO_HOTEL_ID).maybeSingle(),
        supabase
          .from("monthly_entries")
          .select("*")
          .eq("hotel_id", DEMO_HOTEL_ID)
          .order("year", { ascending: true })
          .order("month", { ascending: true }),
      ]);
      setHotel(h as Hotel | null);
      setEntries((e as MonthlyEntry[]) ?? []);
      setLoading(false);
    })();
  }, []);

  React.useEffect(() => {
    if (!loading) {
      setInsightsLoading(true);
      generateInsights()
        .then((r) => setInsights(r.insights))
        .catch(() => setInsights([]))
        .finally(() => setInsightsLoading(false));
    }
  }, [loading]);

  if (loading || !hotel) {
    return (
      <PageContainer>
        <div className="space-y-4">
          <div className="h-12 w-72 animate-pulse rounded-lg bg-muted" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-40 animate-pulse rounded-2xl bg-muted" />
            ))}
          </div>
        </div>
      </PageContainer>
    );
  }

  const sorted = [...entries].sort((a, b) =>
    a.year !== b.year ? a.year - b.year : a.month - b.month
  );
  const latest = sorted[sorted.length - 1];
  const prev = sorted[sorted.length - 2];
  const lastYearSame = sorted.find(
    (e) => latest && e.year === latest.year - 1 && e.month === latest.month
  );

  // Sustainability score: weighted, lower-is-better intensities vs peer median
  const sustainabilityScore = (() => {
    if (!latest || !latest.occupied_room_nights) return 70;
    const filters = {
      sizeBand: hotel.size_band,
      region: hotel.region,
      starRating: hotel.star_rating,
    };
    const utils: { key: keyof MonthlyEntry; util: "electricity" | "gas" | "water" | "waste"; weight: number }[] =
      [
        { key: "electricity_kwh", util: "electricity", weight: 0.35 },
        { key: "gas_kwh", util: "gas", weight: 0.2 },
        { key: "water_m3", util: "water", weight: 0.25 },
        { key: "waste_kg", util: "waste", weight: 0.2 },
      ];
    let total = 0;
    for (const u of utils) {
      const v = (latest[u.key] as number | null) ?? 0;
      const intensity = v / latest.occupied_room_nights;
      const stats = getPeerStats(u.util, latest.month, filters);
      // Score: 100 if at p10, 50 if at median, 0 if at p90
      const ratio = (intensity - stats.p10) / (stats.p90 - stats.p10);
      const sub = Math.max(0, Math.min(100, 100 - ratio * 100));
      total += sub * u.weight;
    }
    return Math.round(total);
  })();

  const filters = {
    sizeBand: hotel.size_band,
    region: hotel.region,
    starRating: hotel.star_rating,
  };

  // Peer position for electricity intensity
  const peerPosition = (() => {
    if (!latest || !latest.electricity_kwh || !latest.occupied_room_nights)
      return null;
    const intensity = latest.electricity_kwh / latest.occupied_room_nights;
    const stats = getPeerStats("electricity", latest.month, filters);
    const rank = getPeerRank(intensity, stats);
    return rank;
  })();

  const cohortSize = getPeerCohortSize(filters);

  // 12-month trend with CO₂e
  const trendData = sorted.slice(-12).map((e) => ({
    label: `${MONTH_SHORT[e.month - 1]} ${String(e.year).slice(2)}`,
    electricity: e.electricity_kwh ?? 0,
    gas: e.gas_kwh ?? 0,
    water: (e.water_m3 ?? 0) * 100, // scale to be visible alongside kWh
    waste: (e.waste_kg ?? 0) * 10,
    co2e: calculateCO2e(e),
  }));

  const currentMonth = new Date();
  const isCurrentLogged =
    latest &&
    latest.year === currentMonth.getFullYear() &&
    latest.month === currentMonth.getMonth() + 1;

  return (
    <PageContainer>
      <PageHeader
        eyebrow={`${hotel.name} · ${hotel.region}`}
        title="Sustainability dashboard"
        subtitle={`Performance for ${
          latest ? `${MONTH_NAMES[latest.month - 1]} ${latest.year}` : "this month"
        }, with peer comparisons and AI insights tailored to your property.`}
        actions={
          <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-2.5 text-sm">
            <span className="text-muted-foreground">Per occupied room</span>
            <Switch checked={perRoom} onCheckedChange={setPerRoom} />
          </div>
        }
      />

      {!isCurrentLogged && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-accent/40 bg-accent/15 px-5 py-4"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent/40 text-accent-foreground">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <div className="font-medium text-foreground">
                Log {MONTH_NAMES[currentMonth.getMonth()]} {currentMonth.getFullYear()} data
              </div>
              <div className="text-sm text-muted-foreground">
                Take 2 minutes to keep your insights up to date.
              </div>
            </div>
          </div>
          <Button asChild className="rounded-xl">
            <Link to="/log">
              Log data <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </motion.div>
      )}

      {/* Score hero strip */}
      <Card className="mb-8 overflow-hidden rounded-3xl border-border/70 bg-gradient-to-br from-secondary to-primary text-primary-foreground">
        <div className="flex flex-wrap items-center justify-between gap-6 px-8 py-7">
          <div>
            <div className="text-xs uppercase tracking-[0.18em] text-primary-foreground/70">
              Sustainability score
            </div>
            <div className="mt-2 flex items-baseline gap-3">
              <span className="font-serif num text-6xl md:text-7xl font-semibold leading-none">
                {sustainabilityScore}
              </span>
              <span className="text-primary-foreground/70">/100</span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-4 w-4 cursor-help text-primary-foreground/60" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  Weighted average of your performance versus similar
                  Mediterranean hotels (electricity, gas, water, waste). Higher
                  is better.
                </TooltipContent>
              </Tooltip>
            </div>
            <div className="mt-2 text-sm text-primary-foreground/70">
              Updated {latest ? `${MONTH_NAMES[latest.month - 1]} ${latest.year}` : "—"}
            </div>
          </div>
          {peerPosition !== null && (
            <Link
              to="/benchmarks"
              className="group rounded-2xl bg-primary-foreground/10 px-5 py-4 text-left backdrop-blur-sm transition hover:bg-primary-foreground/15"
            >
              <div className="text-xs uppercase tracking-[0.14em] text-primary-foreground/70">
                Peer position
              </div>
              <div className="mt-1 font-serif text-2xl">
                Top {peerPosition}%
              </div>
              <div className="mt-0.5 text-xs text-primary-foreground/70">
                vs {cohortSize} similar hotels for electricity intensity
                <ArrowRight className="ml-1 inline h-3 w-3 transition group-hover:translate-x-0.5" />
              </div>
            </Link>
          )}
        </div>
      </Card>

      {/* KPIs */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {KPIS.map((kpi) => (
          <KpiCard
            key={kpi.key}
            kpi={kpi}
            latest={latest}
            prev={prev}
            lastYearSame={lastYearSame}
            sorted={sorted}
            perRoom={perRoom}
          />
        ))}
      </div>

      {/* Trend */}
      <Card className="mt-8 rounded-3xl border-border/70">
        <div className="px-6 pt-6 pb-2 md:px-8 md:pt-8">
          <div className="flex items-baseline justify-between">
            <div>
              <h2 className="font-serif text-2xl font-semibold">
                12-month trend
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Utility consumption by month with CO₂e overlay.
              </p>
            </div>
            <div className="hidden items-center gap-3 text-xs text-muted-foreground md:flex">
              <LegendDot color="var(--chart-3)" label="Electricity" />
              <LegendDot color="var(--chart-1)" label="Gas" />
              <LegendDot color="var(--chart-2)" label="Water" />
              <LegendDot color="var(--chart-5)" label="Waste" />
              <LegendDot color="var(--champagne)" label="CO₂e" line />
            </div>
          </div>
        </div>
        <div className="h-80 px-2 pb-4 md:px-4">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={trendData} margin={{ top: 16, right: 16, left: 0, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
              <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
              <ReTooltip
                contentStyle={{
                  backgroundColor: "var(--card)",
                  border: "1px solid var(--border)",
                  borderRadius: 12,
                  fontSize: 12,
                }}
              />
              <Area dataKey="electricity" stackId="1" stroke="var(--chart-3)" fill="var(--chart-3)" fillOpacity={0.65} />
              <Area dataKey="gas" stackId="1" stroke="var(--chart-1)" fill="var(--chart-1)" fillOpacity={0.65} />
              <Area dataKey="water" stackId="1" stroke="var(--chart-2)" fill="var(--chart-2)" fillOpacity={0.45} />
              <Area dataKey="waste" stackId="1" stroke="var(--chart-5)" fill="var(--chart-5)" fillOpacity={0.45} />
              <Line dataKey="co2e" stroke="var(--champagne)" strokeWidth={2.5} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Insights */}
      <div className="mt-8">
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="font-serif text-2xl font-semibold">This month's insights</h2>
          <Link
            to="/assistant"
            className="text-sm text-primary hover:underline underline-offset-4"
          >
            Open AI assistant <ArrowRight className="ml-1 inline h-3 w-3" />
          </Link>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {insightsLoading && insights.length === 0
            ? [0, 1, 2].map((i) => (
                <Card key={i} className="h-36 animate-pulse rounded-2xl bg-muted" />
              ))
            : insights.length === 0
              ? (
                <Card className="col-span-full rounded-2xl border-dashed bg-card/50 p-6 text-sm text-muted-foreground">
                  Insights will appear here once enough data is logged.
                </Card>
              )
              : insights.map((ins, i) => <InsightCard key={i} insight={ins} />)}
        </div>
      </div>
    </PageContainer>
  );
}

function LegendDot({ color, label, line }: { color: string; label: string; line?: boolean }) {
  return (
    <span className="flex items-center gap-1.5">
      {line ? (
        <span className="h-0.5 w-4 rounded-full" style={{ backgroundColor: color }} />
      ) : (
        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
      )}
      {label}
    </span>
  );
}

function KpiCard({
  kpi,
  latest,
  prev,
  lastYearSame,
  sorted,
  perRoom,
}: {
  kpi: KpiDef;
  latest: MonthlyEntry | undefined;
  prev: MonthlyEntry | undefined;
  lastYearSame: MonthlyEntry | undefined;
  sorted: MonthlyEntry[];
  perRoom: boolean;
}) {
  const Icon = kpi.icon;

  const norm = (e: MonthlyEntry | undefined) => {
    if (!e) return null;
    const raw = (e[kpi.key] as number | null) ?? null;
    if (raw === null) return null;
    if (perRoom && e.occupied_room_nights) return raw / e.occupied_room_nights;
    return raw;
  };

  const cur = norm(latest);
  const last = norm(prev);
  const lastYr = norm(lastYearSame);
  const change = pctChange(cur, last);
  const yoy = pctChange(cur, lastYr);

  const spark = sorted.slice(-12).map((e, i) => ({
    i,
    v: norm(e) ?? 0,
  }));

  // Lower is better
  const isImprovement = change !== null && change < 0;
  const trendColor = isImprovement
    ? "text-success"
    : change !== null && change > 0
      ? "text-destructive"
      : "text-muted-foreground";

  return (
    <Card className="group relative overflow-hidden rounded-2xl border-border/70 p-5 transition hover:shadow-lg">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {kpi.label}
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="font-serif num text-3xl font-semibold text-foreground">
              {cur === null ? "—" : formatNumber(cur, perRoom ? 2 : 0)}
            </span>
            <span className="text-xs text-muted-foreground">
              {kpi.unit}
              {perRoom && "/room-night"}
            </span>
          </div>
        </div>
        <div
          className="flex h-10 w-10 items-center justify-center rounded-xl"
          style={{ backgroundColor: `color-mix(in oklab, ${kpi.color} 15%, transparent)` }}
        >
          <Icon className="h-5 w-5" style={{ color: kpi.color }} />
        </div>
      </div>

      <div className="mt-3 flex items-center gap-3 text-xs">
        <span className={`flex items-center gap-1 font-medium ${trendColor}`}>
          {change !== null && change < 0 ? (
            <ArrowDownRight className="h-3.5 w-3.5" />
          ) : change !== null && change > 0 ? (
            <ArrowUpRight className="h-3.5 w-3.5" />
          ) : null}
          {change === null ? "—" : formatPct(change)} MoM
        </span>
        {yoy !== null && (
          <span className="text-muted-foreground">{formatPct(yoy)} YoY</span>
        )}
      </div>

      <div className="mt-2 -mx-1 h-12">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={spark}>
            <defs>
              <linearGradient id={`grad-${kpi.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={kpi.color} stopOpacity={0.4} />
                <stop offset="100%" stopColor={kpi.color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <Area
              type="monotone"
              dataKey="v"
              stroke={kpi.color}
              strokeWidth={1.75}
              fill={`url(#grad-${kpi.key})`}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

function InsightCard({ insight }: { insight: Insight }) {
  const tone = insight.tone;
  const toneClasses =
    tone === "positive"
      ? "border-l-success bg-success/5"
      : tone === "warning"
        ? "border-l-warning bg-warning/5"
        : "border-l-secondary bg-secondary/5";
  const toneLabel = tone === "positive" ? "Win" : tone === "warning" ? "Watch" : "Note";
  return (
    <Card className={`rounded-2xl border border-border/70 border-l-4 p-5 ${toneClasses}`}>
      <Badge variant="outline" className="mb-3 border-border/70 bg-card text-[10px] uppercase tracking-wider">
        {toneLabel}
      </Badge>
      <h3 className="font-serif text-lg font-semibold leading-snug text-foreground">
        {insight.title}
      </h3>
      <p className="mt-2 text-sm text-muted-foreground">{insight.body}</p>
    </Card>
  );
}
