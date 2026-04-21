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
  ChevronLeft,
  Pencil,
  ClipboardList,
  Upload,
  FileSpreadsheet,
  BarChart3,
  AlertTriangle,
  AlertCircle,
  BookOpen,
  Target,
  FilePlus,
  Wand2,
  Settings2,
  GripVertical,
  RotateCcw,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  Line,
  LineChart,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as ReTooltip,
  CartesianGrid,
  ComposedChart,
  Legend,
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
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  generateInsights,
  sendAssistantMessage,
  explainChart,
  type Insight,
  type ChartExplanation,
} from "@/server/assistant.functions";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard — Verdance" },
      {
        name: "description",
        content:
          "Your hotel's full sustainability workspace — log data, see trends, compare peers and ask Sera, all in one view.",
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
  const [activeChart, setActiveChart] = React.useState<ChartId>("consumption");
  const [activeTab, setActiveTab] = React.useState<string>("overview");
  const [pendingPrompt, setPendingPrompt] = React.useState<string | null>(null);
  const [highlightFields, setHighlightFields] = React.useState<HighlightedField[]>([]);

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

  const sorted = [...entries].sort((a, b) =>
    a.year !== b.year ? a.year - b.year : a.month - b.month
  );
  const latest = sorted[sorted.length - 1];
  const prev = sorted[sorted.length - 2];
  const lastYearSame = sorted.find(
    (e) => latest && e.year === latest.year - 1 && e.month === latest.month
  );

  const filters = {
    sizeBand: hotel?.size_band ?? "medium",
    region: hotel?.region ?? "",
    starRating: hotel?.star_rating ?? 4,
  };

  const computeScore = React.useCallback(
    (entry: MonthlyEntry | undefined) => {
      if (!entry || !entry.occupied_room_nights) return null;
      const utils: { key: keyof MonthlyEntry; util: Utility; weight: number }[] = [
        { key: "electricity_kwh", util: "electricity", weight: 0.35 },
        { key: "gas_kwh", util: "gas", weight: 0.2 },
        { key: "water_m3", util: "water", weight: 0.25 },
        { key: "waste_kg", util: "waste", weight: 0.2 },
      ];
      let total = 0;
      let weightUsed = 0;
      for (const u of utils) {
        const v = entry[u.key] as number | null;
        if (v === null || v === undefined) continue;
        const intensity = v / entry.occupied_room_nights;
        const stats = getPeerStats(u.util, entry.month, filters);
        const span = stats.p90 - stats.p10 || 1;
        const ratio = (intensity - stats.p10) / span;
        const sub = Math.max(0, Math.min(100, 100 - ratio * 80));
        total += sub * u.weight;
        weightUsed += u.weight;
      }
      if (weightUsed === 0) return null;
      return Math.round(total / weightUsed);
    },
    [filters],
  );

  const sustainabilityScore = computeScore(latest) ?? 70;


  const peerPosition = (() => {
    if (!latest || !latest.electricity_kwh || !latest.occupied_room_nights)
      return null;
    const intensity = latest.electricity_kwh / latest.occupied_room_nights;
    const stats = getPeerStats("electricity", latest.month, filters);
    return getPeerRank(intensity, stats);
  })();

  const cohortSize = getPeerCohortSize(filters);

  // Worst-performing utility vs peers — used for "highlight fields to fix" action
  const worstUtility = React.useMemo<{
    key: HighlightedField;
    label: string;
    rank: ReturnType<typeof getPeerRank>;
  } | null>(() => {
    if (!latest || !latest.occupied_room_nights) return null;
    const rn = latest.occupied_room_nights;
    const checks: { key: HighlightedField; label: string; util: Utility; v: number | null }[] = [
      { key: "electricity_kwh", label: "Electricity", util: "electricity", v: latest.electricity_kwh },
      { key: "gas_kwh", label: "Gas", util: "gas", v: latest.gas_kwh },
      { key: "water_m3", label: "Water", util: "water", v: latest.water_m3 },
      { key: "waste_kg", label: "Waste", util: "waste", v: latest.waste_kg },
    ];
    let worst: { key: HighlightedField; label: string; rank: ReturnType<typeof getPeerRank>; ratio: number } | null = null;
    for (const c of checks) {
      if (c.v === null || c.v === undefined) continue;
      const intensity = c.v / rn;
      const stats = getPeerStats(c.util, latest.month, filters);
      const span = stats.p90 - stats.p10 || 1;
      const ratio = (intensity - stats.p10) / span;
      if (!worst || ratio > worst.ratio) {
        worst = { key: c.key, label: c.label, rank: getPeerRank(intensity, stats), ratio };
      }
    }
    return worst;
  }, [latest, filters]);

  // Fields missing in the latest entry — used for "highlight fields to fix"
  const missingFields = React.useMemo<HighlightedField[]>(() => {
    if (!latest) return [];
    const out: HighlightedField[] = [];
    if (latest.electricity_kwh === null) out.push("electricity_kwh");
    if (latest.gas_kwh === null) out.push("gas_kwh");
    if (latest.water_m3 === null) out.push("water_m3");
    if (latest.waste_kg === null) out.push("waste_kg");
    if (!latest.occupied_room_nights) out.push("occupied_room_nights");
    return out;
  }, [latest]);

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

  const trendData = sorted.slice(-12).map((e) => ({
    label: `${MONTH_SHORT[e.month - 1]} ${String(e.year).slice(2)}`,
    electricity: e.electricity_kwh ?? 0,
    gas: e.gas_kwh ?? 0,
    water: (e.water_m3 ?? 0) * 100,
    waste: (e.waste_kg ?? 0) * 10,
    co2e: calculateCO2e(e),
  }));

  // Per-utility intensity (per occupied room-night) for 12 months
  const intensityData = sorted.slice(-12).map((e) => {
    const rn = e.occupied_room_nights || 1;
    return {
      label: `${MONTH_SHORT[e.month - 1]} ${String(e.year).slice(2)}`,
      electricity: e.electricity_kwh ? e.electricity_kwh / rn : 0,
      gas: e.gas_kwh ? e.gas_kwh / rn : 0,
      water: e.water_m3 ? e.water_m3 / rn : 0,
      waste: e.waste_kg ? e.waste_kg / rn : 0,
    };
  });

  // CO2e bar data (12 months)
  const co2Data = sorted.slice(-12).map((e) => ({
    label: `${MONTH_SHORT[e.month - 1]} ${String(e.year).slice(2)}`,
    co2e: Math.round(calculateCO2e(e)),
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

      {/* Tabbed workspace — Ask Sera is now embedded inside Overview & Analyze */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
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
        </TabsList>

        {/* OVERVIEW — score, KPIs, insights + Sera chat */}
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

          <TodosCard
            latest={latest}
            sorted={sorted}
            isCurrentLogged={!!isCurrentLogged}
            worstUtility={worstUtility}
            missingFields={missingFields}
            onGoToLog={(fields) => {
              if (fields && fields.length) setHighlightFields(fields);
              setActiveTab("log");
            }}
            onGoToAnalyze={() => setActiveTab("analyze")}
          />

          <TodoCompletionInsights sorted={sorted} computeScore={computeScore} />

          {/* Insights + Sera chat side-by-side */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
            <Card className="rounded-3xl border-border/70 p-6 lg:col-span-3">
              <div className="mb-4 flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/30 text-accent-foreground">
                  <Sparkles className="h-4 w-4" />
                </div>
                <h2 className="font-serif text-xl font-semibold">Smart insights</h2>
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
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

            <div className="lg:col-span-2">
              <MiniAssistantCard
                title="Ask Sera"
                subtitle="Your sustainability copilot"
                starters={[
                  "Why did electricity rise?",
                  "Top 3 actions to cut water?",
                  "How do I compare to peers?",
                ]}
              />
            </div>
          </div>
        </TabsContent>

        {/* LOG DATA — three methods: Manual, Survey, Import */}
        <TabsContent value="log" className="mt-0 focus-visible:outline-none">
          <LogDataTabs
            entries={entries}
            isCurrentLogged={!!isCurrentLogged}
            onSaved={() => void reload()}
            sorted={sorted}
            rooms={hotel.rooms}
            highlightFields={highlightFields}
            onHighlightConsumed={() => setHighlightFields([])}
          />
        </TabsContent>

        {/* ANALYZE — KPIs, multiple charts, peer benchmarks + Sera chart chat */}
        <TabsContent value="analyze" className="mt-0 space-y-6 focus-visible:outline-none">
          {/* KPIs again here as quick reference */}
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

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
            {/* Charts column */}
            <div className="space-y-6 lg:col-span-3">
              {/* Stacked utility chart */}
              <ChartCard
                id="consumption"
                active={activeChart}
                onSelect={setActiveChart}
                title="12-month consumption"
                subtitle="Stacked utilities with CO₂e overlay."
                aside={
                  <div className="hidden items-center gap-3 text-xs text-muted-foreground md:flex">
                    <LegendDot color="var(--chart-3)" label="Elec" />
                    <LegendDot color="var(--chart-1)" label="Gas" />
                    <LegendDot color="var(--chart-2)" label="Water" />
                    <LegendDot color="var(--chart-5)" label="Waste" />
                    <LegendDot color="var(--champagne)" label="CO₂e" line />
                  </div>
                }
              >
                <div className="h-72 px-2 pb-4 md:px-4">
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
              </ChartCard>

              {/* CO2e bar chart */}
              <ChartCard
                id="co2e"
                active={activeChart}
                onSelect={setActiveChart}
                title="CO₂e emissions"
                subtitle="Estimated kg CO₂e per month."
                aside={<BarChart3 className="h-5 w-5 text-muted-foreground" />}
              >
                <div className="h-60 px-2 pb-4 md:px-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={co2Data} margin={{ top: 12, right: 16, left: 0, bottom: 8 }}>
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
                      <Bar dataKey="co2e" fill="var(--champagne)" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </ChartCard>

              {/* Intensity chart (per room-night) */}
              <ChartCard
                id="intensity"
                active={activeChart}
                onSelect={setActiveChart}
                title="Intensity per room-night"
                subtitle="Normalised consumption — independent of occupancy."
                aside={
                  <div className="hidden items-center gap-3 text-xs text-muted-foreground md:flex">
                    <LegendDot color="var(--chart-3)" label="Elec" line />
                    <LegendDot color="var(--chart-1)" label="Gas" line />
                    <LegendDot color="var(--chart-2)" label="Water" line />
                  </div>
                }
              >
                <div className="h-60 px-2 pb-4 md:px-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={intensityData} margin={{ top: 12, right: 16, left: 0, bottom: 8 }}>
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
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Line type="monotone" dataKey="electricity" stroke="var(--chart-3)" strokeWidth={2} dot={false} name="Elec kWh/rn" />
                      <Line type="monotone" dataKey="gas" stroke="var(--chart-1)" strokeWidth={2} dot={false} name="Gas kWh/rn" />
                      <Line type="monotone" dataKey="water" stroke="var(--chart-2)" strokeWidth={2} dot={false} name="Water m³/rn" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </ChartCard>

              {/* Peer comparison */}
              <ChartCard
                id="peer"
                active={activeChart}
                onSelect={setActiveChart}
                title="Peer comparison"
                subtitle={`vs ${cohortSize} similar Mediterranean hotels`}
                aside={<Trophy className="h-5 w-5" style={{ color: "var(--champagne)" }} />}
              >
                <div className="grid grid-cols-1 gap-3 px-6 pb-6 sm:grid-cols-2">
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
              </ChartCard>
            </div>

            {/* Right rail: chart explainer + Sera chat */}
            <div className="space-y-6 lg:col-span-2">
              <div className="lg:sticky lg:top-6 space-y-6">
                <ChartExplainerCard
                  chartId={activeChart}
                  isLatestLogged={!!isCurrentLogged}
                  hasMissingFields={missingFields.length > 0}
                  worstUtilityLabel={worstUtility?.label ?? null}
                  onDraftLog={() => {
                    setHighlightFields([]);
                    setActiveTab("log");
                    toast.success(`Draft started for ${latest ? `${MONTH_NAMES[latest.month - 1]} ${latest.year}` : "this month"}`);
                  }}
                  onAskSera={(prompt) => {
                    setPendingPrompt(prompt);
                    toast.success("Sera is on it");
                  }}
                  onHighlightFix={() => {
                    const fields =
                      activeChart === "peer" && worstUtility
                        ? [worstUtility.key]
                        : missingFields.length > 0
                          ? missingFields
                          : worstUtility
                            ? [worstUtility.key]
                            : [];
                    if (fields.length === 0) {
                      toast.info("Nothing to flag — your data looks complete.");
                      return;
                    }
                    setHighlightFields(fields);
                    setActiveTab("log");
                    toast.success(
                      fields.length === 1
                        ? `Highlighted ${labelOf(fields[0])} in the log form`
                        : `Highlighted ${fields.length} fields in the log form`,
                    );
                  }}
                />
                <MiniAssistantCard
                  title="Ask Sera about your charts"
                  subtitle="Spot trends, compare months, plan actions"
                  starters={[
                    "What does my CO₂e trend tell me?",
                    "Which utility moved the most this month?",
                    "Where am I worst vs peers?",
                    "Explain my intensity per room-night",
                  ]}
                  height="default"
                  pendingPrompt={pendingPrompt}
                  onPromptConsumed={() => setPendingPrompt(null)}
                />
              </div>
            </div>
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

/* ---------- Chart wrapper + Explainer ---------- */

type ChartId = "consumption" | "co2e" | "intensity" | "peer";

type HighlightedField =
  | "electricity_kwh"
  | "gas_kwh"
  | "water_m3"
  | "waste_kg"
  | "occupied_room_nights";

function ChartCard({
  id,
  active,
  onSelect,
  title,
  subtitle,
  aside,
  children,
}: {
  id: ChartId;
  active: ChartId;
  onSelect: (id: ChartId) => void;
  title: string;
  subtitle: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  const isActive = active === id;
  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={() => onSelect(id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(id);
        }
      }}
      aria-pressed={isActive}
      className={`cursor-pointer rounded-3xl border transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        isActive
          ? "border-primary/60 ring-2 ring-primary/30 shadow-md"
          : "border-border/70 hover:border-primary/40"
      }`}
    >
      <div className="px-6 pt-6 pb-2">
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-serif text-xl font-semibold">{title}</h2>
              {isActive && (
                <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-primary">
                  Selected
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
          </div>
          {aside}
        </div>
      </div>
      {children}
    </Card>
  );
}

const CHART_TITLES: Record<ChartId, string> = {
  consumption: "12-month consumption",
  co2e: "CO₂e emissions",
  intensity: "Intensity per room-night",
  peer: "Peer comparison",
};

function ChartExplainerCard({
  chartId,
  isLatestLogged,
  hasMissingFields,
  worstUtilityLabel,
  onDraftLog,
  onAskSera,
  onHighlightFix,
}: {
  chartId: ChartId;
  isLatestLogged: boolean;
  hasMissingFields: boolean;
  worstUtilityLabel: string | null;
  onDraftLog: () => void;
  onAskSera: (prompt: string) => void;
  onHighlightFix: () => void;
}) {
  const explain = useServerFn(explainChart);
  const [data, setData] = React.useState<ChartExplanation | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setData(null);
    explain({ data: { chartId } })
      .then((r) => {
        if (cancelled) return;
        if (r.ok) setData(r.explanation);
        else setError(r.error);
      })
      .catch(() => !cancelled && setError("Could not load explanation."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [chartId, explain]);

  // Per-chart action labels and AI prompts
  const actionConfig = React.useMemo(() => {
    const recBase = `Looking at my "${CHART_TITLES[chartId]}" chart`;
    switch (chartId) {
      case "consumption":
        return {
          ask: `${recBase}, what is the single highest-impact action I should take this month? Be specific with numbers.`,
          highlightLabel: hasMissingFields ? "Fix missing data" : "Flag worst utility",
        };
      case "co2e":
        return {
          ask: `${recBase}, give me 2 concrete CO₂e reduction actions ranked by ROI for my hotel.`,
          highlightLabel: hasMissingFields ? "Fix missing data" : "Flag biggest emitter",
        };
      case "intensity":
        return {
          ask: `${recBase}, which utility has the worst intensity per room-night and what should I change?`,
          highlightLabel: hasMissingFields ? "Fix missing data" : "Flag worst intensity",
        };
      case "peer":
        return {
          ask: `${recBase}, where am I worst vs peers and what do top performers do differently?`,
          highlightLabel: worstUtilityLabel
            ? `Flag ${worstUtilityLabel.toLowerCase()}`
            : "Flag worst utility",
        };
    }
  }, [chartId, hasMissingFields, worstUtilityLabel]);

  return (
    <Card className="rounded-3xl border-border/70 bg-gradient-to-br from-card to-accent/5 p-5">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
          <BookOpen className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
            How to read this chart
          </div>
          <h3 className="mt-0.5 font-serif text-lg font-semibold leading-tight">
            {CHART_TITLES[chartId]}
          </h3>
        </div>
      </div>

      <div className="mt-4 min-h-[180px]">
        {loading && (
          <div className="space-y-2">
            <div className="h-3 w-full animate-pulse rounded bg-muted" />
            <div className="h-3 w-5/6 animate-pulse rounded bg-muted" />
            <div className="h-3 w-4/6 animate-pulse rounded bg-muted" />
            <div className="mt-3 h-3 w-3/4 animate-pulse rounded bg-muted" />
          </div>
        )}
        {error && !loading && (
          <p className="text-sm text-muted-foreground">{error}</p>
        )}
        {data && !loading && (
          <div className="space-y-3 text-sm">
            <p className="leading-snug text-foreground">{data.summary}</p>
            <ExplainerSection
              icon={<Info className="h-3.5 w-3.5" />}
              label="How to read it"
              items={data.read}
            />
            <ExplainerSection
              icon={<Sparkles className="h-3.5 w-3.5" />}
              label="What Sera sees in your data"
              items={data.signals}
              accent
            />
            <ExplainerSection
              icon={<ChevronRight className="h-3.5 w-3.5" />}
              label="Next steps"
              items={data.actions}
            />
          </div>
        )}
      </div>

      {/* One-click actions */}
      <div className="mt-5 border-t border-border/60 pt-4">
        <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Quick actions
        </div>
        <div className="flex flex-wrap gap-2">
          <ActionChip
            icon={<FilePlus className="h-3.5 w-3.5" />}
            label={isLatestLogged ? "Update this month" : "Draft a log entry"}
            onClick={onDraftLog}
          />
          <ActionChip
            icon={<Wand2 className="h-3.5 w-3.5" />}
            label="Ask Sera for a recommendation"
            primary
            onClick={() => onAskSera(actionConfig.ask)}
          />
          <ActionChip
            icon={<Target className="h-3.5 w-3.5" />}
            label={actionConfig.highlightLabel}
            onClick={onHighlightFix}
          />
        </div>
      </div>
    </Card>
  );
}

function ActionChip({
  icon,
  label,
  onClick,
  primary,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        primary
          ? "border-primary/40 bg-primary text-primary-foreground hover:bg-primary/90"
          : "border-border bg-background hover:border-primary/40 hover:bg-accent/10"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function ExplainerSection({
  icon,
  label,
  items,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  items: string[];
  accent?: boolean;
}) {
  if (!items?.length) return null;
  return (
    <div>
      <div
        className={`mb-1.5 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider ${
          accent ? "text-primary" : "text-muted-foreground"
        }`}
      >
        {icon}
        {label}
      </div>
      <ul className="space-y-1">
        {items.map((it, i) => (
          <li key={i} className="flex gap-2 text-xs leading-relaxed text-foreground/85">
            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-muted-foreground/60" />
            <span>{it}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------- To-dos of the day ---------- */

type TodoCategory = "cost" | "compliance" | "waste" | "data";

interface TodoItem {
  id: string;
  title: string;
  description: string;
  cta: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  tone: "urgent" | "important" | "routine";
  category: TodoCategory;
  onClick: () => void;
}

const PRIORITY_STORAGE_KEY = "verdance:todo-priorities:v1";
const COMPLETION_STORAGE_KEY = "verdance:todo-completion:v1";

const DEFAULT_PRIORITY_ORDER: TodoCategory[] = ["data", "compliance", "cost", "waste"];

const CATEGORY_META: Record<
  TodoCategory,
  { label: string; description: string; icon: React.ComponentType<React.SVGProps<SVGSVGElement>> }
> = {
  cost: {
    label: "Cost savings",
    description: "Spikes vs peers, energy efficiency",
    icon: Bolt,
  },
  compliance: {
    label: "Compliance & reporting",
    description: "Invoices, audit-ready logs",
    icon: ClipboardList,
  },
  waste: {
    label: "Waste reduction",
    description: "Recycling, waste volumes",
    icon: Trash2,
  },
  data: {
    label: "Data quality",
    description: "Missing readings, complete months",
    icon: FilePlus,
  },
};

function loadPriorityOrder(): TodoCategory[] {
  if (typeof window === "undefined") return DEFAULT_PRIORITY_ORDER;
  try {
    const raw = window.localStorage.getItem(PRIORITY_STORAGE_KEY);
    if (!raw) return DEFAULT_PRIORITY_ORDER;
    const parsed = JSON.parse(raw) as TodoCategory[];
    const valid = parsed.filter((c): c is TodoCategory => c in CATEGORY_META);
    // ensure all categories present
    const merged = [...valid, ...DEFAULT_PRIORITY_ORDER.filter((c) => !valid.includes(c))];
    return merged.slice(0, 4);
  } catch {
    return DEFAULT_PRIORITY_ORDER;
  }
}

function loadCompletionMap(): Record<string, string[]> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(COMPLETION_STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, string[]>;
  } catch {
    return {};
  }
}

function TodosCard({
  latest,
  sorted,
  isCurrentLogged,
  worstUtility,
  missingFields,
  onGoToLog,
  onGoToAnalyze,
}: {
  latest: MonthlyEntry | undefined;
  sorted: MonthlyEntry[];
  isCurrentLogged: boolean;
  worstUtility: { key: HighlightedField; label: string; rank: number } | null;
  missingFields: HighlightedField[];
  onGoToLog: (highlight?: HighlightedField[]) => void;
  onGoToAnalyze: () => void;
}) {
  const today = new Date();
  const monthLabel = MONTH_NAMES[today.getMonth()];
  const prevMonthIdx = today.getMonth() === 0 ? 11 : today.getMonth() - 1;
  const prevMonthLabel = MONTH_NAMES[prevMonthIdx];

  // Per-month completion key: YYYY-MM of the latest logged month (or current month)
  const periodKey = React.useMemo(() => {
    const y = latest?.year ?? today.getFullYear();
    const m = latest?.month ?? today.getMonth() + 1;
    return `${y}-${String(m).padStart(2, "0")}`;
  }, [latest, today]);

  const [priorityOrder, setPriorityOrder] = React.useState<TodoCategory[]>(DEFAULT_PRIORITY_ORDER);
  const [completionMap, setCompletionMap] = React.useState<Record<string, string[]>>({});
  const [settingsOpen, setSettingsOpen] = React.useState(false);

  // Load from localStorage on mount
  React.useEffect(() => {
    setPriorityOrder(loadPriorityOrder());
    setCompletionMap(loadCompletionMap());
  }, []);

  const completedIds = React.useMemo(
    () => new Set(completionMap[periodKey] ?? []),
    [completionMap, periodKey],
  );

  const toggleComplete = React.useCallback(
    (id: string) => {
      setCompletionMap((prev) => {
        const current = new Set(prev[periodKey] ?? []);
        if (current.has(id)) current.delete(id);
        else current.add(id);
        const next = { ...prev, [periodKey]: Array.from(current) };
        try {
          window.localStorage.setItem(COMPLETION_STORAGE_KEY, JSON.stringify(next));
        } catch {
          // ignore quota
        }
        return next;
      });
    },
    [periodKey],
  );

  const persistOrder = React.useCallback((order: TodoCategory[]) => {
    setPriorityOrder(order);
    try {
      window.localStorage.setItem(PRIORITY_STORAGE_KEY, JSON.stringify(order));
    } catch {
      // ignore quota
    }
  }, []);

  const movePriority = React.useCallback(
    (index: number, dir: -1 | 1) => {
      const next = [...priorityOrder];
      const target = index + dir;
      if (target < 0 || target >= next.length) return;
      [next[index], next[target]] = [next[target], next[index]];
      persistOrder(next);
    },
    [priorityOrder, persistOrder],
  );

  const resetPriorities = React.useCallback(() => {
    persistOrder(DEFAULT_PRIORITY_ORDER);
  }, [persistOrder]);

  const baseTodos = React.useMemo<TodoItem[]>(() => {
    const items: TodoItem[] = [];

    if (!isCurrentLogged) {
      items.push({
        id: "log-month",
        title: `Log ${monthLabel} consumption`,
        description: `Add this month's electricity, gas, water and waste readings to keep your score current.`,
        cta: "Open log form",
        icon: ClipboardList,
        tone: "urgent",
        category: "data",
        onClick: () => onGoToLog(),
      });
    }

    const fieldMeta: Record<HighlightedField, { label: string; verb: string; icon: React.ComponentType<React.SVGProps<SVGSVGElement>>; category: TodoCategory }> = {
      electricity_kwh: { label: "electricity invoice", verb: "Add", icon: Bolt, category: "cost" },
      gas_kwh: { label: "gas reading", verb: "Add", icon: Flame, category: "cost" },
      water_m3: { label: "water meter reading", verb: "Add", icon: Droplets, category: "data" },
      waste_kg: { label: "waste collection data", verb: "Add", icon: Trash2, category: "waste" },
      occupied_room_nights: { label: "occupied room-nights", verb: "Confirm", icon: FilePlus, category: "data" },
    };
    const missingPriority: HighlightedField[] = [
      "electricity_kwh",
      "waste_kg",
      "water_m3",
      "gas_kwh",
      "occupied_room_nights",
    ];
    const orderedMissing = missingPriority.filter((f) => missingFields.includes(f));
    for (const f of orderedMissing.slice(0, 2)) {
      const meta = fieldMeta[f];
      items.push({
        id: `missing-${f}`,
        title: `${meta.verb} ${prevMonthLabel} ${meta.label}`,
        description: `Last month is incomplete — your benchmarks need this value to stay accurate.`,
        cta: "Open form",
        icon: meta.icon,
        tone: "important",
        category: meta.category,
        onClick: () => onGoToLog([f]),
      });
    }

    if (worstUtility && worstUtility.rank > 50) {
      const cat: TodoCategory = worstUtility.key === "waste_kg" ? "waste" : "cost";
      items.push({
        id: "investigate-worst",
        title: `Investigate ${worstUtility.label.toLowerCase()} spike`,
        description: `You're in the bottom ${100 - worstUtility.rank}% vs similar hotels. Review the trend and ask Sera for actions.`,
        cta: "Open analysis",
        icon: AlertTriangle,
        tone: "important",
        category: cat,
        onClick: onGoToAnalyze,
      });
    }

    if (sorted.length >= 3 && today.getDate() <= 7) {
      items.push({
        id: "quarterly",
        title: "Review last quarter's trends",
        description: "First week of the month — quickly scan trends and share highlights with your team.",
        cta: "Open analysis",
        icon: BarChart3,
        tone: "routine",
        category: "compliance",
        onClick: onGoToAnalyze,
      });
    }

    if (latest && !latest.attachment_url) {
      items.push({
        id: "attach-invoice",
        title: "Attach supporting invoices",
        description: `Upload PDFs for ${prevMonthLabel} so auditors can verify your figures in one click.`,
        cta: "Open log form",
        icon: Upload,
        tone: "routine",
        category: "compliance",
        onClick: () => onGoToLog(),
      });
    }

    if (items.length === 0) {
      items.push({
        id: "all-good",
        title: "All caught up — explore your trends",
        description: "Nothing critical to action today. Take a moment to review your benchmark performance.",
        cta: "Open analysis",
        icon: CheckCircle2,
        tone: "routine",
        category: "data",
        onClick: onGoToAnalyze,
      });
    }

    return items;
  }, [
    isCurrentLogged,
    monthLabel,
    prevMonthLabel,
    missingFields,
    worstUtility,
    sorted.length,
    latest,
    onGoToLog,
    onGoToAnalyze,
    today,
  ]);

  // Sort by priority order (urgent always first within its category bucket)
  const sortedTodos = React.useMemo<TodoItem[]>(() => {
    const toneRank: Record<TodoItem["tone"], number> = { urgent: 0, important: 1, routine: 2 };
    const catRank = (c: TodoCategory) => {
      const idx = priorityOrder.indexOf(c);
      return idx === -1 ? 99 : idx;
    };
    return [...baseTodos]
      .sort((a, b) => {
        // Always show urgent first regardless of priority preference
        if (a.tone === "urgent" && b.tone !== "urgent") return -1;
        if (b.tone === "urgent" && a.tone !== "urgent") return 1;
        const c = catRank(a.category) - catRank(b.category);
        if (c !== 0) return c;
        return toneRank[a.tone] - toneRank[b.tone];
      })
      .slice(0, 5);
  }, [baseTodos, priorityOrder]);

  const totalCount = sortedTodos.length;
  const completedCount = sortedTodos.filter((t) => completedIds.has(t.id)).length;
  const allDone = totalCount > 0 && completedCount === totalCount;

  return (
    <Card className="rounded-3xl border-border/70 p-6">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/30 text-accent-foreground">
              <Target className="h-4 w-4" />
            </div>
            <h2 className="font-serif text-xl font-semibold">To-dos of the day</h2>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {allDone
              ? `All done for ${MONTH_NAMES[Number(periodKey.slice(5, 7)) - 1]} — great work.`
              : sortedTodos.length === 1 && sortedTodos[0].id === "all-good"
                ? "You're on top of things."
                : `${totalCount - completedCount} action${totalCount - completedCount !== 1 ? "s" : ""} left to keep your data and score on track.`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="rounded-full border border-border bg-muted/40 px-3 py-1 text-xs text-muted-foreground">
            {completedCount}/{totalCount} done this month
          </div>
          <Popover open={settingsOpen} onOpenChange={setSettingsOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1.5"
                aria-label="Priority settings"
              >
                <Settings2 className="h-3.5 w-3.5" />
                Priorities
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 p-4">
              <div className="mb-3 flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold">What matters most?</h3>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Reorder to control how to-dos are sorted.
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1 px-2 text-xs"
                  onClick={resetPriorities}
                >
                  <RotateCcw className="h-3 w-3" />
                  Reset
                </Button>
              </div>
              <ol className="space-y-1.5">
                {priorityOrder.map((cat, i) => {
                  const meta = CATEGORY_META[cat];
                  const CatIcon = meta.icon;
                  return (
                    <li
                      key={cat}
                      className="flex items-center gap-2 rounded-lg border border-border bg-card p-2"
                    >
                      <GripVertical className="h-4 w-4 text-muted-foreground" />
                      <div className="flex h-7 w-7 items-center justify-center rounded-md bg-accent/30 text-accent-foreground">
                        <CatIcon className="h-3.5 w-3.5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold">{i + 1}.</span>
                          <span className="text-sm font-medium">{meta.label}</span>
                        </div>
                        <div className="text-[11px] text-muted-foreground">{meta.description}</div>
                      </div>
                      <div className="flex flex-col">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-5 w-6 p-0"
                          onClick={() => movePriority(i, -1)}
                          disabled={i === 0}
                          aria-label={`Move ${meta.label} up`}
                        >
                          <ChevronLeft className="h-3 w-3 rotate-90" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-5 w-6 p-0"
                          onClick={() => movePriority(i, 1)}
                          disabled={i === priorityOrder.length - 1}
                          aria-label={`Move ${meta.label} down`}
                        >
                          <ChevronRight className="h-3 w-3 rotate-90" />
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ol>
              <p className="mt-3 text-[11px] text-muted-foreground">
                Urgent tasks (like logging this month) always appear first.
              </p>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <ul className="space-y-3">
        <AnimatePresence initial={false}>
          {sortedTodos.map((todo) => {
            const Icon = todo.icon;
            const done = completedIds.has(todo.id);
            const toneStyles = done
              ? "border-l-4 border-l-muted bg-muted/30 opacity-70"
              : todo.tone === "urgent"
                ? "border-l-4 border-l-destructive bg-destructive/5"
                : todo.tone === "important"
                  ? "border-l-4 border-l-primary/70 bg-primary/5"
                  : "border-l-4 border-l-muted bg-card";
            const iconBg = done
              ? "bg-muted text-muted-foreground"
              : todo.tone === "urgent"
                ? "bg-destructive/15 text-destructive"
                : todo.tone === "important"
                  ? "bg-primary/15 text-primary"
                  : "bg-muted text-muted-foreground";
            const catLabel = CATEGORY_META[todo.category].label;

            return (
              <motion.li
                key={todo.id}
                layout
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.18 }}
                className={`group flex flex-wrap items-center gap-4 rounded-2xl border border-border/70 p-4 transition hover:bg-card/80 ${toneStyles}`}
              >
                <div className="flex shrink-0 items-center gap-3">
                  <Checkbox
                    checked={done}
                    onCheckedChange={() => toggleComplete(todo.id)}
                    aria-label={done ? `Mark "${todo.title}" not done` : `Mark "${todo.title}" done`}
                    className="h-5 w-5"
                  />
                  <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${iconBg}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3
                      className={`text-sm font-semibold text-foreground ${done ? "line-through" : ""}`}
                    >
                      {todo.title}
                    </h3>
                    {todo.tone === "urgent" && !done && (
                      <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-destructive">
                        Today
                      </span>
                    )}
                    <span className="rounded-full border border-border bg-card px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      {catLabel}
                    </span>
                    {done && (
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary">
                        Done
                      </span>
                    )}
                  </div>
                  <p
                    className={`mt-0.5 text-xs text-muted-foreground ${done ? "line-through" : ""}`}
                  >
                    {todo.description}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant={done ? "ghost" : todo.tone === "urgent" ? "default" : "outline"}
                  onClick={todo.onClick}
                  className="shrink-0"
                  disabled={done}
                >
                  {done ? "Completed" : todo.cta}
                  {!done && <ChevronRight className="ml-1 h-4 w-4" />}
                </Button>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>
    </Card>
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

/* ---------- LOG DATA — multi-method (Manual / Survey / Import) ---------- */

function LogDataTabs({
  entries,
  isCurrentLogged,
  onSaved,
  sorted,
  rooms,
  highlightFields = [],
  onHighlightConsumed,
}: {
  entries: MonthlyEntry[];
  isCurrentLogged: boolean;
  onSaved: () => void;
  sorted: MonthlyEntry[];
  rooms: number;
  highlightFields?: HighlightedField[];
  onHighlightConsumed?: () => void;
}) {
  const [method, setMethod] = React.useState<"manual" | "survey" | "import">(
    "manual",
  );

  // When highlighted fields arrive, force-switch to manual entry so user sees them.
  React.useEffect(() => {
    if (highlightFields.length > 0 && method !== "manual") {
      setMethod("manual");
    }
  }, [highlightFields, method]);

  const METHODS: {
    key: "manual" | "survey" | "import";
    label: string;
    desc: string;
    icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  }[] = [
    { key: "manual", label: "Manual entry", desc: "Type values from your bills", icon: Pencil },
    { key: "survey", label: "Guided survey", desc: "Step-by-step questions", icon: ClipboardList },
    { key: "import", label: "Import CSV", desc: "Bulk upload past months", icon: Upload },
  ];

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
      <div className="space-y-3 lg:col-span-2">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">
          Choose a method
        </div>
        {METHODS.map((m) => {
          const Icon = m.icon;
          const active = method === m.key;
          return (
            <button
              key={m.key}
              onClick={() => setMethod(m.key)}
              className={`flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition ${
                active
                  ? "border-primary bg-primary/5 shadow-sm"
                  : "border-border bg-card hover:border-accent hover:bg-accent/10"
              }`}
            >
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                  active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                }`}
              >
                <Icon className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <div className="text-sm font-semibold">{m.label}</div>
                <div className="text-xs text-muted-foreground">{m.desc}</div>
              </div>
              <ChevronRight
                className={`h-4 w-4 ${active ? "text-primary" : "text-muted-foreground"}`}
              />
            </button>
          );
        })}

        <Card className="mt-6 rounded-2xl border-border/70 p-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Recent history</h3>
            <span className="text-xs text-muted-foreground">{sorted.length} entries</span>
          </div>
          <div className="max-h-[320px] overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-card text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="py-2 font-medium">Period</th>
                  <th className="py-2 text-right font-medium">CO₂e</th>
                </tr>
              </thead>
              <tbody>
                {[...sorted].reverse().slice(0, 12).map((e) => (
                  <tr key={`${e.year}-${e.month}`} className="border-t border-border">
                    <td className="py-2 font-medium">
                      {MONTH_SHORT[e.month - 1]} {e.year}
                    </td>
                    <td className="num py-2 text-right">
                      {formatNumber(calculateCO2e(e))} kg
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <div className="lg:col-span-3">
        {method === "manual" && (
          <QuickLogCard
            entries={entries}
            isCurrentLogged={isCurrentLogged}
            onSaved={onSaved}
            rooms={rooms}
            highlightFields={highlightFields}
            onHighlightConsumed={onHighlightConsumed}
          />
        )}
        {method === "survey" && (
          <SurveyLogCard entries={entries} onSaved={onSaved} />
        )}
        {method === "import" && <ImportLogCard onSaved={onSaved} />}
      </div>
    </div>
  );
}

/* ---------- Manual Quick Log Card ---------- */

const quickEntrySchema = z.object({
  electricity_kwh: z.number().min(0).max(10_000_000).nullable(),
  gas_kwh: z.number().min(0).max(10_000_000).nullable(),
  water_m3: z.number().min(0).max(1_000_000).nullable(),
  waste_kg: z.number().min(0).max(10_000_000).nullable(),
  occupied_room_nights: z.number().int().min(0).max(100_000).nullable(),
});

type EntryDraft = {
  electricity_kwh: number | null;
  gas_kwh: number | null;
  water_m3: number | null;
  waste_kg: number | null;
  occupied_room_nights: number | null;
};

interface ValidationIssue {
  level: "error" | "warning";
  field?: keyof EntryDraft;
  message: string;
}

function labelOf(k: keyof EntryDraft): string {
  switch (k) {
    case "electricity_kwh": return "Electricity";
    case "gas_kwh": return "Gas";
    case "water_m3": return "Water";
    case "waste_kg": return "Waste";
    case "occupied_room_nights": return "Occupied room-nights";
  }
}

/**
 * Validates a manual entry. Errors block save; warnings are advisory.
 */
function validateEntry(d: EntryDraft, rooms: number | null): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const utilKeys: (keyof EntryDraft)[] = [
    "electricity_kwh",
    "gas_kwh",
    "water_m3",
    "waste_kg",
  ];

  const utilEntered = utilKeys.filter((k) => d[k] !== null);
  const allEmpty = utilEntered.length === 0 && d.occupied_room_nights === null;
  if (allEmpty) {
    issues.push({ level: "error", message: "Enter at least one value before saving." });
    return issues;
  }

  for (const k of [...utilKeys, "occupied_room_nights" as const]) {
    const v = d[k];
    if (v !== null && (Number.isNaN(v) || v < 0)) {
      issues.push({
        level: "error",
        field: k,
        message: `${labelOf(k)} must be a positive number.`,
      });
    }
  }

  const hasAnyUtil = utilEntered.some((k) => (d[k] ?? 0) > 0);

  if (hasAnyUtil && d.occupied_room_nights === 0) {
    issues.push({
      level: "error",
      field: "occupied_room_nights",
      message:
        "Occupancy is 0 but utilities were used. Either correct room-nights or set utilities to 0 too.",
    });
  }

  if (hasAnyUtil && d.occupied_room_nights === null) {
    issues.push({
      level: "warning",
      field: "occupied_room_nights",
      message:
        "Add occupied room-nights — without it we cannot benchmark or normalise this month.",
    });
  }

  if (utilEntered.length > 0 && utilEntered.length < utilKeys.length) {
    const missing = utilKeys.filter((k) => d[k] === null).map(labelOf).join(", ");
    issues.push({
      level: "warning",
      message: `Missing: ${missing}. You can save now and complete later.`,
    });
  }

  const orn = d.occupied_room_nights;
  if (orn && orn > 0) {
    const checks: { key: keyof EntryDraft; max: number; label: string; unit: string }[] = [
      { key: "electricity_kwh", max: 200, label: "Electricity", unit: "kWh/rn" },
      { key: "gas_kwh", max: 200, label: "Gas", unit: "kWh/rn" },
      { key: "water_m3", max: 2, label: "Water", unit: "m³/rn" },
      { key: "waste_kg", max: 10, label: "Waste", unit: "kg/rn" },
    ];
    for (const c of checks) {
      const v = d[c.key];
      if (v !== null && v > 0) {
        const intensity = v / orn;
        if (intensity > c.max) {
          issues.push({
            level: "warning",
            field: c.key,
            message: `${c.label} ≈ ${intensity.toFixed(1)} ${c.unit} — unusually high. Double-check.`,
          });
        }
      }
    }
  }

  if (rooms && orn !== null && orn > rooms * 31) {
    issues.push({
      level: "error",
      field: "occupied_room_nights",
      message: `Room-nights exceed capacity (${rooms} rooms × 31 days = ${rooms * 31}).`,
    });
  }

  return issues;
}

function QuickLogCard({
  entries,
  isCurrentLogged,
  onSaved,
  rooms,
  highlightFields = [],
  onHighlightConsumed,
}: {
  entries: MonthlyEntry[];
  isCurrentLogged: boolean;
  onSaved: () => void;
  rooms: number;
  highlightFields?: HighlightedField[];
  onHighlightConsumed?: () => void;
}) {
  const cardRef = React.useRef<HTMLDivElement | null>(null);
  const highlightSet = React.useMemo(() => new Set(highlightFields), [highlightFields]);

  // Auto-clear the highlight after 8s and scroll into view when it arrives
  React.useEffect(() => {
    if (highlightFields.length === 0) return;
    cardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    const t = window.setTimeout(() => {
      onHighlightConsumed?.();
    }, 8000);
    return () => window.clearTimeout(t);
  }, [highlightFields, onHighlightConsumed]);

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

  const draft: EntryDraft = React.useMemo(
    () => ({
      electricity_kwh: num(form.electricity_kwh),
      gas_kwh: num(form.gas_kwh),
      water_m3: num(form.water_m3),
      waste_kg: num(form.waste_kg),
      occupied_room_nights: num(form.occupied_room_nights),
    }),
    [form],
  );

  const issues = React.useMemo(() => validateEntry(draft, rooms), [draft, rooms]);
  const errors = issues.filter((i) => i.level === "error");
  const warnings = issues.filter((i) => i.level === "warning");
  const blocked = errors.length > 0;
  const fieldErrors = new Set(errors.map((e) => e.field).filter(Boolean));

  async function handleSave() {
    if (blocked) {
      toast.error(errors[0].message);
      return;
    }
    setSubmitting(true);
    try {
      const parsed = quickEntrySchema.parse(draft);
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
    <Card
      ref={cardRef}
      className={`rounded-3xl border bg-gradient-to-br from-card to-accent/5 p-6 transition-all ${
        highlightFields.length > 0
          ? "border-primary/60 ring-2 ring-primary/30 shadow-lg"
          : "border-border/70"
      }`}
    >
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">
            Manual entry
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

      {/* Highlight banner from chart explainer action */}
      <AnimatePresence>
        {highlightFields.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="mt-4 flex items-start gap-2 rounded-xl border border-primary/30 bg-primary/10 px-3 py-2 text-xs text-primary"
          >
            <Target className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="leading-relaxed">
              Sera flagged{" "}
              <strong>{highlightFields.map((f) => labelOf(f)).join(", ")}</strong>{" "}
              based on your selected chart. Review the highlighted fields below.
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mt-5 space-y-3">
        {FIELDS.map((f) => {
          const Icon = f.icon;
          const hasErr = fieldErrors.has(f.key);
          const isHi = highlightSet.has(f.key);
          return (
            <motion.div
              key={f.key}
              animate={isHi ? { scale: [1, 1.015, 1] } : { scale: 1 }}
              transition={{ duration: 0.6, repeat: isHi ? 2 : 0 }}
              className={`flex items-center gap-3 rounded-xl border bg-background/60 px-3 py-2 transition-all ${
                hasErr
                  ? "border-destructive/60"
                  : isHi
                    ? "border-primary/60 ring-2 ring-primary/30 bg-primary/5"
                    : "border-border"
              }`}
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
                aria-invalid={hasErr}
                autoFocus={isHi && highlightFields[0] === f.key}
                className={`num h-9 w-24 rounded-lg bg-background text-right text-sm ${
                  hasErr ? "border-destructive" : isHi ? "border-primary" : "border-border"
                }`}
              />
              <span className="w-10 text-xs text-muted-foreground">{f.unit}</span>
            </motion.div>
          );
        })}
        {(() => {
          const isHi = highlightSet.has("occupied_room_nights");
          const hasErr = fieldErrors.has("occupied_room_nights");
          return (
            <motion.div
              animate={isHi ? { scale: [1, 1.015, 1] } : { scale: 1 }}
              transition={{ duration: 0.6, repeat: isHi ? 2 : 0 }}
              className={`flex items-center gap-3 rounded-xl border bg-background/60 px-3 py-2 transition-all ${
                hasErr
                  ? "border-destructive/60"
                  : isHi
                    ? "border-primary/60 ring-2 ring-primary/30 bg-primary/5"
                    : "border-border"
              }`}
            >
              <span className="ml-11 flex-1 text-sm font-medium">Occupied room-nights</span>
              <Input
                type="number"
                value={form.occupied_room_nights}
                onChange={(e) =>
                  setForm((s) => ({ ...s, occupied_room_nights: e.target.value }))
                }
                placeholder="0"
                aria-invalid={hasErr}
                autoFocus={isHi && highlightFields[0] === "occupied_room_nights"}
                className={`num h-9 w-24 rounded-lg bg-background text-right text-sm ${
                  hasErr ? "border-destructive" : isHi ? "border-primary" : "border-border"
                }`}
              />
              <span className="w-10 text-xs text-muted-foreground">rn</span>
            </motion.div>
          );
        })()}
      </div>

      {/* Validation summary */}
      <AnimatePresence>
        {(errors.length > 0 || warnings.length > 0) && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-4 space-y-2 overflow-hidden"
          >
            {errors.map((iss, i) => (
              <div
                key={`e-${i}`}
                className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{iss.message}</span>
              </div>
            ))}
            {warnings.map((iss, i) => (
              <div
                key={`w-${i}`}
                className="flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300"
              >
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{iss.message}</span>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      <Button
        onClick={handleSave}
        disabled={submitting || blocked}
        className="mt-5 w-full rounded-xl py-5"
      >
        {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {blocked ? "Fix errors to save" : `Save ${MONTH_SHORT[initial.m - 1]} ${initial.y}`}
      </Button>
    </Card>
  );
}

/* ---------- Survey Log Card — guided step-by-step ---------- */

interface SurveyStep {
  key: keyof typeof BLANK_FORM;
  question: string;
  helper: string;
  unit: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  color: string;
}

const BLANK_FORM = {
  electricity_kwh: "",
  gas_kwh: "",
  water_m3: "",
  waste_kg: "",
  occupied_room_nights: "",
};

const SURVEY_STEPS: SurveyStep[] = [
  {
    key: "electricity_kwh",
    question: "How much electricity did you use?",
    helper: "Find this on your power bill, in kWh.",
    unit: "kWh",
    icon: Bolt,
    color: "var(--chart-3)",
  },
  {
    key: "gas_kwh",
    question: "How much gas did you use?",
    helper: "Look for kWh or convert m³ × 10.55.",
    unit: "kWh",
    icon: Flame,
    color: "var(--chart-1)",
  },
  {
    key: "water_m3",
    question: "How much water did you consume?",
    helper: "Cubic metres (m³) from your water bill.",
    unit: "m³",
    icon: Droplets,
    color: "var(--chart-2)",
  },
  {
    key: "waste_kg",
    question: "How much waste did you produce?",
    helper: "Total kilograms collected this month.",
    unit: "kg",
    icon: Trash2,
    color: "var(--chart-5)",
  },
  {
    key: "occupied_room_nights",
    question: "How many occupied room-nights?",
    helper: "Rooms × nights occupied. Used to normalise.",
    unit: "rn",
    icon: ClipboardList,
    color: "var(--champagne)",
  },
];

function SurveyLogCard({
  entries,
  onSaved,
}: {
  entries: MonthlyEntry[];
  onSaved: () => void;
}) {
  const initial = React.useMemo(() => {
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const y = d.getFullYear();
      const m = d.getMonth() + 1;
      const found = entries.find((e) => e.year === y && e.month === m);
      if (!found || found.electricity_kwh === null) return { y, m };
    }
    return { y: now.getFullYear(), m: now.getMonth() + 1 };
  }, [entries]);

  const [step, setStep] = React.useState(0);
  const [form, setForm] = React.useState({ ...BLANK_FORM });
  const [submitting, setSubmitting] = React.useState(false);
  const total = SURVEY_STEPS.length;
  const progress = ((step + 1) / total) * 100;
  const current = SURVEY_STEPS[step];
  const Icon = current.icon;

  async function handleFinish() {
    setSubmitting(true);
    try {
      const num = (s: string) => (s.trim() === "" ? null : Number(s));
      const parsed = quickEntrySchema.parse({
        electricity_kwh: num(form.electricity_kwh),
        gas_kwh: num(form.gas_kwh),
        water_m3: num(form.water_m3),
        waste_kg: num(form.waste_kg),
        occupied_room_nights: num(form.occupied_room_nights),
      });
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
      setForm({ ...BLANK_FORM });
      setStep(0);
      onSaved();
    } catch (e) {
      const msg = e instanceof z.ZodError ? e.issues[0].message : "Could not save";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  const isLast = step === total - 1;

  return (
    <Card className="rounded-3xl border-border/70 bg-gradient-to-br from-card to-accent/5 p-6">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">
            Guided survey · {MONTH_NAMES[initial.m - 1]} {initial.y}
          </div>
          <h2 className="mt-1 font-serif text-xl font-semibold">
            Step {step + 1} of {total}
          </h2>
        </div>
        <div className="text-xs text-muted-foreground">
          {Math.round(progress)}% complete
        </div>
      </div>

      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
        <motion.div
          className="h-full bg-primary"
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.35 }}
        />
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.2 }}
          className="mt-6"
        >
          <div className="flex items-center gap-3">
            <div
              className="flex h-12 w-12 items-center justify-center rounded-2xl"
              style={{ backgroundColor: `color-mix(in oklab, ${current.color} 15%, transparent)` }}
            >
              <Icon className="h-6 w-6" style={{ color: current.color }} />
            </div>
            <div>
              <div className="font-serif text-lg font-semibold">{current.question}</div>
              <div className="text-xs text-muted-foreground">{current.helper}</div>
            </div>
          </div>

          <div className="mt-5 flex items-center gap-3 rounded-xl border border-border bg-background px-4 py-3">
            <Input
              autoFocus
              type="number"
              inputMode="decimal"
              value={form[current.key]}
              onChange={(e) =>
                setForm((s) => ({ ...s, [current.key]: e.target.value }))
              }
              placeholder="Enter a number"
              className="num h-10 flex-1 border-0 bg-transparent text-right text-2xl font-semibold focus-visible:ring-0"
            />
            <span className="text-sm text-muted-foreground">{current.unit}</span>
          </div>
        </motion.div>
      </AnimatePresence>

      <div className="mt-6 flex items-center justify-between">
        <Button
          variant="ghost"
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0}
          className="rounded-xl"
        >
          <ChevronLeft className="mr-1 h-4 w-4" />
          Back
        </Button>
        {isLast ? (
          <Button
            onClick={handleFinish}
            disabled={submitting}
            className="rounded-xl px-6"
          >
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Finish & save
          </Button>
        ) : (
          <Button
            onClick={() => setStep((s) => Math.min(total - 1, s + 1))}
            className="rounded-xl px-6"
          >
            Next
            <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        )}
      </div>
    </Card>
  );
}

/* ---------- Import CSV Card ---------- */

interface ParsedRow {
  year: number;
  month: number;
  electricity_kwh: number | null;
  gas_kwh: number | null;
  water_m3: number | null;
  waste_kg: number | null;
  occupied_room_nights: number | null;
}

function ImportLogCard({ onSaved }: { onSaved: () => void }) {
  const [rows, setRows] = React.useState<ParsedRow[]>([]);
  const [errors, setErrors] = React.useState<string[]>([]);
  const [submitting, setSubmitting] = React.useState(false);
  const [fileName, setFileName] = React.useState<string | null>(null);
  const fileRef = React.useRef<HTMLInputElement | null>(null);

  function parseCSV(text: string) {
    const lines = text.trim().split(/\r?\n/);
    if (lines.length < 2) {
      setErrors(["CSV must have a header row and at least one data row"]);
      setRows([]);
      return;
    }
    const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
    const required = ["year", "month"];
    for (const r of required) {
      if (!header.includes(r)) {
        setErrors([`Missing required column: ${r}`]);
        setRows([]);
        return;
      }
    }
    const idx = (k: string) => header.indexOf(k);
    const out: ParsedRow[] = [];
    const errs: string[] = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(",").map((c) => c.trim());
      const num = (k: string): number | null => {
        const j = idx(k);
        if (j < 0 || !cols[j]) return null;
        const n = Number(cols[j]);
        return isNaN(n) ? null : n;
      };
      const y = num("year");
      const m = num("month");
      if (!y || !m || m < 1 || m > 12) {
        errs.push(`Row ${i + 1}: invalid year/month`);
        continue;
      }
      out.push({
        year: y,
        month: m,
        electricity_kwh: num("electricity_kwh"),
        gas_kwh: num("gas_kwh"),
        water_m3: num("water_m3"),
        waste_kg: num("waste_kg"),
        occupied_room_nights: num("occupied_room_nights"),
      });
    }
    setRows(out);
    setErrors(errs);
  }

  function handleFile(file: File) {
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      parseCSV(String(reader.result ?? ""));
    };
    reader.readAsText(file);
  }

  async function handleImport() {
    if (rows.length === 0) return;
    setSubmitting(true);
    try {
      const payload = rows.map((r) => ({
        hotel_id: DEMO_HOTEL_ID,
        year: r.year,
        month: r.month,
        electricity_kwh: r.electricity_kwh,
        gas_kwh: r.gas_kwh,
        water_m3: r.water_m3,
        waste_kg: r.waste_kg,
        occupied_room_nights: r.occupied_room_nights,
      }));
      const { error } = await supabase
        .from("monthly_entries")
        .upsert(payload, { onConflict: "hotel_id,year,month" });
      if (error) throw error;
      toast.success(`Imported ${rows.length} months`);
      setRows([]);
      setFileName(null);
      setErrors([]);
      onSaved();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Import failed";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  function downloadTemplate() {
    const csv =
      "year,month,electricity_kwh,gas_kwh,water_m3,waste_kg,occupied_room_nights\n" +
      "2025,1,42000,18000,650,1200,2400\n" +
      "2025,2,39000,17000,610,1150,2200\n";
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "verdance-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Card className="rounded-3xl border-border/70 bg-gradient-to-br from-card to-accent/5 p-6">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">
            Import CSV
          </div>
          <h2 className="mt-1 font-serif text-2xl font-semibold">Bulk upload</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Upload many months at once from a spreadsheet export.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={downloadTemplate}
          className="rounded-xl"
        >
          <FileSpreadsheet className="mr-1.5 h-3.5 w-3.5" />
          Template
        </Button>
      </div>

      <div
        className="mt-5 cursor-pointer rounded-2xl border-2 border-dashed border-border bg-background/40 p-8 text-center transition hover:border-primary hover:bg-primary/5"
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const f = e.dataTransfer.files?.[0];
          if (f) handleFile(f);
        }}
      >
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
        />
        <Upload className="mx-auto h-8 w-8 text-muted-foreground" />
        <div className="mt-2 text-sm font-medium">
          {fileName ? fileName : "Drop CSV here or click to browse"}
        </div>
        <div className="mt-1 text-xs text-muted-foreground">
          Columns: year, month, electricity_kwh, gas_kwh, water_m3, waste_kg, occupied_room_nights
        </div>
      </div>

      {errors.length > 0 && (
        <div className="mt-4 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
          {errors.map((e, i) => (
            <div key={i}>{e}</div>
          ))}
        </div>
      )}

      {rows.length > 0 && (
        <div className="mt-4">
          <div className="mb-2 text-xs font-medium text-muted-foreground">
            Preview ({rows.length} rows)
          </div>
          <div className="max-h-48 overflow-y-auto rounded-xl border border-border">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-muted/50 text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Period</th>
                  <th className="px-3 py-2 text-right">Elec</th>
                  <th className="px-3 py-2 text-right">Gas</th>
                  <th className="px-3 py-2 text-right">Water</th>
                  <th className="px-3 py-2 text-right">Waste</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 24).map((r, i) => (
                  <tr key={i} className="border-t border-border">
                    <td className="px-3 py-1.5 font-medium">
                      {MONTH_SHORT[r.month - 1]} {r.year}
                    </td>
                    <td className="num px-3 py-1.5 text-right">{formatNumber(r.electricity_kwh)}</td>
                    <td className="num px-3 py-1.5 text-right">{formatNumber(r.gas_kwh)}</td>
                    <td className="num px-3 py-1.5 text-right">{formatNumber(r.water_m3)}</td>
                    <td className="num px-3 py-1.5 text-right">{formatNumber(r.waste_kg)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Button
        onClick={handleImport}
        disabled={submitting || rows.length === 0}
        className="mt-5 w-full rounded-xl py-5"
      >
        {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Import {rows.length > 0 ? `${rows.length} months` : ""}
      </Button>
    </Card>
  );
}

/* ---------- Mini Assistant Card (Sera) ---------- */

interface ChatMsg {
  role: "user" | "assistant";
  content: string;
}

function MiniAssistantCard({
  title = "Ask Sera",
  subtitle = "Grounded in your data",
  starters,
  height = "default",
  pendingPrompt = null,
  onPromptConsumed,
}: {
  title?: string;
  subtitle?: string;
  starters: string[];
  height?: "default" | "tall";
  pendingPrompt?: string | null;
  onPromptConsumed?: () => void;
}) {
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

  const handleSend = React.useCallback(
    async (text: string) => {
      if (!text.trim() || loading) return;
      const userMsg: ChatMsg = { role: "user", content: text.trim() };
      setMessages((m) => {
        const history = m.slice(-10);
        // Use functional updater to capture latest history; fire request afterwards.
        void (async () => {
          setLoading(true);
          try {
            const res = await send({ data: { message: userMsg.content, history } });
            if (res.ok) {
              setMessages((cur) => [...cur, { role: "assistant", content: res.content }]);
            } else {
              toast.error(res.error);
              setMessages((cur) => cur.slice(0, -1));
            }
          } catch {
            toast.error("Something went wrong");
            setMessages((cur) => cur.slice(0, -1));
          } finally {
            setLoading(false);
          }
        })();
        return [...m, userMsg];
      });
      setInput("");
    },
    [loading, send],
  );

  // Auto-send a prompt that arrives from outside (e.g. chart explainer action)
  React.useEffect(() => {
    if (pendingPrompt && !loading) {
      void handleSend(pendingPrompt);
      onPromptConsumed?.();
    }
  }, [pendingPrompt, loading, handleSend, onPromptConsumed]);


  const heightClass =
    height === "tall"
      ? "max-h-[520px] min-h-[420px]"
      : "max-h-[360px] min-h-[280px]";

  return (
    <Card className="flex h-full flex-col overflow-hidden rounded-3xl border-border/70 p-0">
      <div className="flex items-center gap-2 border-b border-border/60 px-5 py-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Sparkles className="h-4 w-4" />
        </div>
        <div>
          <h2 className="font-serif text-lg font-semibold leading-tight">{title}</h2>
          <p className="text-[11px] text-muted-foreground">{subtitle}</p>
        </div>
      </div>

      <div ref={scrollRef} className={`flex-1 overflow-y-auto px-5 py-4 ${heightClass}`}>
        {messages.length === 0 ? (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">Try a quick question:</p>
            {starters.map((s) => (
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
            placeholder="Ask Sera anything…"
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
