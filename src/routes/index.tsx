import { createFileRoute } from "@tanstack/react-router";
import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";
import { z } from "zod";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowDownRight,
  ArrowUpRight,
  Bolt,
  Droplets,
  Flame,
  Trash2,
  Sparkles,
  Send,
  Loader2,
  Info,
  CheckCircle2,
  Trophy,
  ChevronRight,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  Line,
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
  type Utility,
} from "@/lib/peer-benchmarks";
import { PageContainer } from "@/components/page-shell";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  generateInsights,
  sendAssistantMessage,
  type Insight,
} from "@/server/assistant.functions";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard — Verdance" },
      {
        name: "description",
        content:
          "Your hotel's full sustainability workspace — log data, see trends, compare peers and ask the AI assistant, all in one view.",
      },
    ],
  }),
  component: HomePage,
});

interface KpiDef {
  key: "electricity_kwh" | "gas_kwh" | "water_m3" | "waste_kg";
  label: string;
  unit: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  color: string;
  utility: Utility;
}

const KPIS: KpiDef[] = [
  { key: "electricity_kwh", label: "Electricity", unit: "kWh", icon: Bolt, color: "var(--chart-3)", utility: "electricity" },
  { key: "gas_kwh", label: "Gas", unit: "kWh", icon: Flame, color: "var(--chart-1)", utility: "gas" },
  { key: "water_m3", label: "Water", unit: "m³", icon: Droplets, color: "var(--chart-2)", utility: "water" },
  { key: "waste_kg", label: "Waste", unit: "kg", icon: Trash2, color: "var(--chart-5)", utility: "waste" },
];

function HomePage() {
  const [hotel, setHotel] = React.useState<Hotel | null>(null);
  const [entries, setEntries] = React.useState<MonthlyEntry[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [perRoom, setPerRoom] = React.useState(false);
  const [insights, setInsights] = React.useState<Insight[]>([]);
  const [insightsLoading, setInsightsLoading] = React.useState(false);

  const reload = React.useCallback(async () => {
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
  }, []);

  React.useEffect(() => {
    void reload();
  }, [reload]);

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

  const filters = {
    sizeBand: hotel.size_band,
    region: hotel.region,
    starRating: hotel.star_rating,
  };

  const sustainabilityScore = (() => {
    if (!latest || !latest.occupied_room_nights) return 70;
    const utils: { key: keyof MonthlyEntry; util: Utility; weight: number }[] = [
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
      const ratio = (intensity - stats.p10) / (stats.p90 - stats.p10);
      const sub = Math.max(0, Math.min(100, 100 - ratio * 100));
      total += sub * u.weight;
    }
    return Math.round(total);
  })();

  const peerPosition = (() => {
    if (!latest || !latest.electricity_kwh || !latest.occupied_room_nights)
      return null;
    const intensity = latest.electricity_kwh / latest.occupied_room_nights;
    const stats = getPeerStats("electricity", latest.month, filters);
    return getPeerRank(intensity, stats);
  })();

  const cohortSize = getPeerCohortSize(filters);

  const trendData = sorted.slice(-12).map((e) => ({
    label: `${MONTH_SHORT[e.month - 1]} ${String(e.year).slice(2)}`,
    electricity: e.electricity_kwh ?? 0,
    gas: e.gas_kwh ?? 0,
    water: (e.water_m3 ?? 0) * 100,
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
      {/* Hero header */}
      <header className="mb-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="mb-2 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              {hotel.name} · {hotel.region}
            </div>
            <h1 className="font-serif text-4xl md:text-5xl font-semibold leading-[1.05]">
              Sustainability workspace
            </h1>
            <p className="mt-3 max-w-xl text-sm md:text-base text-muted-foreground">
              Log data, spot trends, compare to peers and act on insights — all in one focused workspace.
            </p>
          </div>
          <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-2.5 text-sm">
            <span className="text-muted-foreground">Per occupied room</span>
            <Switch checked={perRoom} onCheckedChange={setPerRoom} />
          </div>
        </div>
        <div className="mt-6 h-px gold-divider" />
      </header>

      {/* Tabbed workspace */}
      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="mb-6 inline-flex h-auto w-full justify-start gap-1 rounded-2xl border border-border bg-card p-1.5 sm:w-auto">
          <TabsTrigger value="overview" className="rounded-xl px-4 py-2 text-sm data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm">
            Overview
          </TabsTrigger>
          <TabsTrigger value="log" className="rounded-xl px-4 py-2 text-sm data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm">
            Log data
          </TabsTrigger>
          <TabsTrigger value="analyze" className="rounded-xl px-4 py-2 text-sm data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm">
            Analyze
          </TabsTrigger>
          <TabsTrigger value="assistant" className="rounded-xl px-4 py-2 text-sm data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm">
            Ask Verdance
          </TabsTrigger>
        </TabsList>

        {/* OVERVIEW — score, KPIs, insights */}
        <TabsContent value="overview" className="mt-0 space-y-6 focus-visible:outline-none">
          <Card className="overflow-hidden rounded-3xl border-border/70 bg-gradient-to-br from-secondary to-primary text-primary-foreground">
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
                      Mediterranean hotels (electricity, gas, water, waste).
                    </TooltipContent>
                  </Tooltip>
                </div>
                <div className="mt-2 text-sm text-primary-foreground/70">
                  Updated {latest ? `${MONTH_NAMES[latest.month - 1]} ${latest.year}` : "—"}
                </div>
              </div>
              {peerPosition !== null && (
                <div className="rounded-2xl bg-primary-foreground/10 px-5 py-4 text-left backdrop-blur-sm">
                  <div className="text-xs uppercase tracking-[0.14em] text-primary-foreground/70">
                    Peer position
                  </div>
                  <div className="mt-1 font-serif text-2xl">
                    Top {peerPosition}%
                  </div>
                  <div className="mt-0.5 text-xs text-primary-foreground/70">
                    vs {cohortSize} similar hotels
                  </div>
                </div>
              )}
            </div>
          </Card>

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
                filters={filters}
              />
            ))}
          </div>

          <Card className="rounded-3xl border-border/70 p-6">
            <div className="mb-4 flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/30 text-accent-foreground">
                <Sparkles className="h-4 w-4" />
              </div>
              <h2 className="font-serif text-xl font-semibold">This month's insights</h2>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              {insightsLoading && insights.length === 0
                ? [0, 1, 2].map((i) => (
                    <div key={i} className="h-32 animate-pulse rounded-2xl bg-muted" />
                  ))
                : insights.length === 0
                  ? (
                    <div className="col-span-full rounded-2xl border border-dashed border-border bg-card/50 p-6 text-sm text-muted-foreground">
                      Insights will appear here once enough data is logged.
                    </div>
                  )
                  : insights.map((ins, i) => <InsightCard key={i} insight={ins} />)}
            </div>
          </Card>
        </TabsContent>

        {/* LOG DATA — quick log + recent history */}
        <TabsContent value="log" className="mt-0 focus-visible:outline-none">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
            <div className="lg:col-span-2">
              <QuickLogCard
                entries={entries}
                isCurrentLogged={!!isCurrentLogged}
                onSaved={() => void reload()}
              />
            </div>
            <Card className="overflow-hidden rounded-3xl border-border/70 lg:col-span-3">
              <div className="flex items-center justify-between px-6 pt-6 pb-3">
                <div>
                  <h2 className="font-serif text-xl font-semibold">Recent history</h2>
                  <p className="mt-1 text-xs text-muted-foreground">Last 12 months of logged data</p>
                </div>
                <span className="text-xs text-muted-foreground">{sorted.length} entries</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="px-6 py-3 font-medium">Period</th>
                      <th className="px-4 py-3 font-medium text-right">Elec</th>
                      <th className="px-4 py-3 font-medium text-right">Gas</th>
                      <th className="px-4 py-3 font-medium text-right">Water</th>
                      <th className="px-4 py-3 font-medium text-right">Waste</th>
                      <th className="px-4 py-3 font-medium text-right">Occ.</th>
                      <th className="px-6 py-3 font-medium text-right">CO₂e</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...sorted].reverse().slice(0, 12).map((e) => (
                      <tr key={`${e.year}-${e.month}`} className="border-t border-border">
                        <td className="px-6 py-3 font-medium">
                          {MONTH_SHORT[e.month - 1]} {e.year}
                        </td>
                        <td className="num px-4 py-3 text-right">{formatNumber(e.electricity_kwh)}</td>
                        <td className="num px-4 py-3 text-right">{formatNumber(e.gas_kwh)}</td>
                        <td className="num px-4 py-3 text-right">{formatNumber(e.water_m3)}</td>
                        <td className="num px-4 py-3 text-right">{formatNumber(e.waste_kg)}</td>
                        <td className="num px-4 py-3 text-right text-muted-foreground">
                          {formatNumber(e.occupied_room_nights)}
                        </td>
                        <td className="num px-6 py-3 text-right font-medium">
                          {formatNumber(calculateCO2e(e))} kg
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        </TabsContent>

        {/* ANALYZE — trend chart + peer benchmarks */}
        <TabsContent value="analyze" className="mt-0 space-y-6 focus-visible:outline-none">
          <Card className="rounded-3xl border-border/70">
            <div className="px-6 pt-6 pb-2 md:px-8 md:pt-8">
              <div className="flex items-baseline justify-between">
                <div>
                  <h2 className="font-serif text-2xl font-semibold">12-month trend</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Utility consumption with CO₂e overlay.
                  </p>
                </div>
                <div className="hidden items-center gap-3 text-xs text-muted-foreground md:flex">
                  <LegendDot color="var(--chart-3)" label="Elec" />
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

          <Card className="rounded-3xl border-border/70 p-6">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Trophy className="h-5 w-5" style={{ color: "var(--champagne)" }} />
                <h2 className="font-serif text-xl font-semibold">Peer comparison</h2>
              </div>
              <span className="text-xs text-muted-foreground">
                vs {cohortSize} similar Mediterranean hotels
              </span>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {KPIS.map((kpi) => (
                <PeerMiniCard
                  key={kpi.key}
                  kpi={kpi}
                  latest={latest}
                  filters={filters}
                  cohortSize={cohortSize}
                />
              ))}
            </div>
          </Card>
        </TabsContent>

        {/* ASK VERDANCE — full assistant */}
        <TabsContent value="assistant" className="mt-0 focus-visible:outline-none">
          <div className="mx-auto max-w-3xl">
            <MiniAssistantCard />
          </div>
        </TabsContent>
      </Tabs>
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
  filters,
}: {
  kpi: KpiDef;
  latest: MonthlyEntry | undefined;
  prev: MonthlyEntry | undefined;
  lastYearSame: MonthlyEntry | undefined;
  sorted: MonthlyEntry[];
  perRoom: boolean;
  filters: { sizeBand: string; region: string; starRating: number };
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

  // peer rank for this utility
  const rank = (() => {
    if (!latest || !latest.occupied_room_nights) return null;
    const raw = (latest[kpi.key] as number | null) ?? null;
    if (raw === null) return null;
    const intensity = raw / latest.occupied_room_nights;
    const stats = getPeerStats(kpi.utility, latest.month, filters);
    return getPeerRank(intensity, stats);
  })();

  const spark = sorted.slice(-12).map((e, i) => ({ i, v: norm(e) ?? 0 }));

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
            <span className="font-serif num text-3xl font-semibold">
              {cur === null ? "—" : formatNumber(cur, perRoom ? 2 : 0)}
            </span>
            <span className="text-xs text-muted-foreground">
              {kpi.unit}
              {perRoom && "/rn"}
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
              dataKey="v"
              stroke={kpi.color}
              strokeWidth={1.5}
              fill={`url(#grad-${kpi.key})`}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {rank !== null && (
        <div className="mt-2 text-[11px] text-muted-foreground">
          Peer rank: <span className="font-medium text-foreground">Top {rank}%</span>
        </div>
      )}
    </Card>
  );
}

function InsightCard({ insight }: { insight: Insight }) {
  const tone =
    insight.tone === "positive"
      ? "border-success/40 bg-success/5"
      : insight.tone === "warning"
        ? "border-warning/40 bg-warning/5"
        : "border-border bg-card";
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-2xl border p-4 ${tone}`}
    >
      <div className="font-serif text-base font-semibold">{insight.title}</div>
      <p className="mt-1.5 text-sm text-muted-foreground">{insight.body}</p>
    </motion.div>
  );
}

/* ---------- Quick Log Card ---------- */

const quickEntrySchema = z.object({
  electricity_kwh: z.number().min(0).max(10_000_000).nullable(),
  gas_kwh: z.number().min(0).max(10_000_000).nullable(),
  water_m3: z.number().min(0).max(1_000_000).nullable(),
  waste_kg: z.number().min(0).max(10_000_000).nullable(),
  occupied_room_nights: z.number().int().min(0).max(100_000).nullable(),
});

function QuickLogCard({
  entries,
  isCurrentLogged,
  onSaved,
}: {
  entries: MonthlyEntry[];
  isCurrentLogged: boolean;
  onSaved: () => void;
}) {
  // Default to most recent unlogged month
  const initial = React.useMemo(() => {
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const y = d.getFullYear();
      const m = d.getMonth() + 1;
      const found = entries.find((e) => e.year === y && e.month === m);
      const hasAll =
        found &&
        found.electricity_kwh !== null &&
        found.gas_kwh !== null &&
        found.water_m3 !== null &&
        found.waste_kg !== null;
      if (!hasAll) return { y, m };
    }
    return { y: now.getFullYear(), m: now.getMonth() + 1 };
  }, [entries]);

  const [form, setForm] = React.useState({
    electricity_kwh: "",
    gas_kwh: "",
    water_m3: "",
    waste_kg: "",
    occupied_room_nights: "",
  });
  const [submitting, setSubmitting] = React.useState(false);
  const [saved, setSaved] = React.useState(false);

  const num = (s: string) => (s.trim() === "" ? null : Number(s));

  async function handleSave() {
    setSubmitting(true);
    try {
      const parsed = quickEntrySchema.parse({
        electricity_kwh: num(form.electricity_kwh),
        gas_kwh: num(form.gas_kwh),
        water_m3: num(form.water_m3),
        waste_kg: num(form.waste_kg),
        occupied_room_nights: num(form.occupied_room_nights),
      });
      // Need at least one value
      if (Object.values(parsed).every((v) => v === null)) {
        toast.error("Enter at least one value before saving");
        return;
      }
      const { error } = await supabase.from("monthly_entries").upsert(
        {
          hotel_id: DEMO_HOTEL_ID,
          year: initial.y,
          month: initial.m,
          ...parsed,
        },
        { onConflict: "hotel_id,year,month" },
      );
      if (error) throw error;
      toast.success(`${MONTH_NAMES[initial.m - 1]} ${initial.y} saved`);
      setSaved(true);
      setForm({
        electricity_kwh: "",
        gas_kwh: "",
        water_m3: "",
        waste_kg: "",
        occupied_room_nights: "",
      });
      onSaved();
      setTimeout(() => setSaved(false), 2200);
    } catch (e) {
      const msg = e instanceof z.ZodError ? e.issues[0].message : "Could not save";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  const FIELDS: {
    key: keyof typeof form;
    label: string;
    unit: string;
    icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
    color: string;
  }[] = [
    { key: "electricity_kwh", label: "Electricity", unit: "kWh", icon: Bolt, color: "var(--chart-3)" },
    { key: "gas_kwh", label: "Gas", unit: "kWh", icon: Flame, color: "var(--chart-1)" },
    { key: "water_m3", label: "Water", unit: "m³", icon: Droplets, color: "var(--chart-2)" },
    { key: "waste_kg", label: "Waste", unit: "kg", icon: Trash2, color: "var(--chart-5)" },
  ];

  return (
    <Card className="rounded-3xl border-border/70 bg-gradient-to-br from-card to-accent/5 p-6">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">
            Log monthly data
          </div>
          <h2 className="mt-1 font-serif text-2xl font-semibold">
            {MONTH_NAMES[initial.m - 1]} {initial.y}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {isCurrentLogged ? "Update any field below." : "Takes about 2 minutes."}
          </p>
        </div>
        {saved && (
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-success/15 text-success"
          >
            <CheckCircle2 className="h-5 w-5" />
          </motion.div>
        )}
      </div>

      <div className="mt-5 space-y-3">
        {FIELDS.map((f) => {
          const Icon = f.icon;
          return (
            <div
              key={f.key}
              className="flex items-center gap-3 rounded-xl border border-border bg-background/60 px-3 py-2"
            >
              <div
                className="flex h-8 w-8 items-center justify-center rounded-lg"
                style={{ backgroundColor: `color-mix(in oklab, ${f.color} 15%, transparent)` }}
              >
                <Icon className="h-4 w-4" style={{ color: f.color }} />
              </div>
              <span className="flex-1 text-sm font-medium">{f.label}</span>
              <Input
                type="number"
                inputMode="decimal"
                value={form[f.key]}
                onChange={(e) => setForm((s) => ({ ...s, [f.key]: e.target.value }))}
                placeholder="0"
                className="num h-9 w-24 rounded-lg border-border bg-background text-right text-sm"
              />
              <span className="w-10 text-xs text-muted-foreground">{f.unit}</span>
            </div>
          );
        })}
        <div className="flex items-center gap-3 rounded-xl border border-border bg-background/60 px-3 py-2">
          <span className="ml-11 flex-1 text-sm font-medium">Occupied room-nights</span>
          <Input
            type="number"
            value={form.occupied_room_nights}
            onChange={(e) =>
              setForm((s) => ({ ...s, occupied_room_nights: e.target.value }))
            }
            placeholder="0"
            className="num h-9 w-24 rounded-lg border-border bg-background text-right text-sm"
          />
          <span className="w-10 text-xs text-muted-foreground">rn</span>
        </div>
      </div>

      <Button
        onClick={handleSave}
        disabled={submitting}
        className="mt-5 w-full rounded-xl py-5"
      >
        {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Save {MONTH_SHORT[initial.m - 1]} {initial.y}
      </Button>
    </Card>
  );
}

/* ---------- Mini Assistant Card ---------- */

interface ChatMsg {
  role: "user" | "assistant";
  content: string;
}

const STARTERS = [
  "Why did electricity rise?",
  "Top 3 actions to cut water?",
  "How do I compare?",
];

function MiniAssistantCard() {
  const send = useServerFn(sendAssistantMessage);
  const [messages, setMessages] = React.useState<ChatMsg[]>([]);
  const [input, setInput] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const scrollRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, loading]);

  async function handleSend(text: string) {
    if (!text.trim() || loading) return;
    const userMsg: ChatMsg = { role: "user", content: text.trim() };
    const history = messages.slice(-10);
    setMessages((m) => [...m, userMsg]);
    setInput("");
    setLoading(true);
    try {
      const res = await send({ data: { message: userMsg.content, history } });
      if (res.ok) {
        setMessages((m) => [...m, { role: "assistant", content: res.content }]);
      } else {
        toast.error(res.error);
        setMessages((m) => m.slice(0, -1));
      }
    } catch {
      toast.error("Something went wrong");
      setMessages((m) => m.slice(0, -1));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="flex flex-col overflow-hidden rounded-3xl border-border/70 p-0">
      <div className="flex items-center gap-2 border-b border-border/60 px-5 py-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Sparkles className="h-4 w-4" />
        </div>
        <div>
          <h2 className="font-serif text-lg font-semibold leading-tight">Ask Verdance</h2>
          <p className="text-[11px] text-muted-foreground">Grounded in your data</p>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4 max-h-[360px] min-h-[280px]">
        {messages.length === 0 ? (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">Try a quick question:</p>
            {STARTERS.map((s) => (
              <button
                key={s}
                onClick={() => handleSend(s)}
                className="flex w-full items-center justify-between rounded-xl border border-border bg-card px-3 py-2.5 text-left text-sm transition hover:border-accent hover:bg-accent/10"
              >
                <span>{s}</span>
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            <AnimatePresence initial={false}>
              {messages.map((m, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[90%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                      m.role === "user"
                        ? "bg-secondary text-secondary-foreground"
                        : "border border-border bg-card"
                    }`}
                  >
                    {m.role === "user" ? (
                      <div className="whitespace-pre-wrap">{m.content}</div>
                    ) : (
                      <div className="prose prose-sm max-w-none prose-p:my-1.5 prose-ul:my-1.5 prose-li:my-0.5">
                        <ReactMarkdown>{m.content}</ReactMarkdown>
                      </div>
                    )}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
            {loading && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Thinking…
              </div>
            )}
          </div>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void handleSend(input);
        }}
        className="border-t border-border bg-card/40 px-3 py-3"
      >
        <div className="flex items-center gap-2 rounded-2xl border border-border bg-background px-3 py-1.5 focus-within:ring-1 focus-within:ring-ring">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask anything…"
            className="flex-1 bg-transparent py-1.5 text-sm focus:outline-none"
          />
          <Button
            type="submit"
            size="icon"
            disabled={loading || !input.trim()}
            className="h-8 w-8 rounded-lg"
          >
            <Send className="h-3.5 w-3.5" />
          </Button>
        </div>
      </form>
    </Card>
  );
}

/* ---------- Peer Mini Card ---------- */

function PeerMiniCard({
  kpi,
  latest,
  filters,
  cohortSize,
}: {
  kpi: KpiDef;
  latest: MonthlyEntry | undefined;
  filters: { sizeBand: string; region: string; starRating: number };
  cohortSize: number;
}) {
  const Icon = kpi.icon;
  if (!latest || !latest.occupied_room_nights) {
    return (
      <div className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground">
        No data
      </div>
    );
  }
  const raw = (latest[kpi.key] as number | null) ?? null;
  if (raw === null) {
    return (
      <div className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground">
        {kpi.label}: no data
      </div>
    );
  }
  const intensity = raw / latest.occupied_room_nights;
  const stats = getPeerStats(kpi.utility, latest.month, filters);
  const rank = getPeerRank(intensity, stats);
  const rankPosition = Math.max(1, Math.round((rank / 100) * cohortSize));
  const vsMedianPct = ((intensity - stats.median) / stats.median) * 100;
  const better = vsMedianPct < 0;

  // Position bar: 0 (best p10) → 100 (worst p90)
  const barPos = Math.max(
    0,
    Math.min(100, ((intensity - stats.p10) / (stats.p90 - stats.p10)) * 100),
  );

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div
            className="flex h-7 w-7 items-center justify-center rounded-lg"
            style={{ backgroundColor: `color-mix(in oklab, ${kpi.color} 15%, transparent)` }}
          >
            <Icon className="h-3.5 w-3.5" style={{ color: kpi.color }} />
          </div>
          <span className="text-sm font-medium">{kpi.label}</span>
        </div>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
          #{rankPosition}/{cohortSize}
        </span>
      </div>

      <div className="mt-3">
        <div className="relative h-1.5 rounded-full bg-muted">
          <div
            className="absolute inset-y-0 left-0 rounded-full"
            style={{
              width: "100%",
              background: `linear-gradient(90deg, color-mix(in oklab, var(--success) 50%, transparent) 0%, color-mix(in oklab, var(--warning) 50%, transparent) 50%, color-mix(in oklab, var(--destructive) 50%, transparent) 100%)`,
              opacity: 0.35,
            }}
          />
          <div
            className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background"
            style={{ left: `${barPos}%`, backgroundColor: kpi.color }}
          />
        </div>
        <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
          <span>Best</span>
          <span>Median</span>
          <span>Worst</span>
        </div>
      </div>

      <div className="mt-3 flex items-baseline gap-2">
        <span className="num font-serif text-lg font-semibold">
          {formatNumber(intensity, 2)}
        </span>
        <span className={`text-xs font-medium ${better ? "text-success" : "text-destructive"}`}>
          {formatPct(vsMedianPct)} vs median
        </span>
      </div>
    </div>
  );
}
