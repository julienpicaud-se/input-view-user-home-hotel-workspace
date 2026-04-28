import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
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
  Download,
  Users,
  History,
  Lock,
  Unlock,
  MessageCircle,
  Mic,
  Plane,
  X,
  Lightbulb,
  Plus,
  Recycle,
  Leaf,
  CalendarCheck,
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
import { getActiveHotelId, type Hotel, type MonthlyEntry } from "@/lib/hotel";
import { HotelSwitcher } from "@/components/hotel-switcher";
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
import { InvoiceUploadCard } from "@/components/invoice-upload-card";
import { SmartPasteCard } from "@/components/smart-paste-card";
import { VoiceLogCard } from "@/components/voice-log-card";
import { AutopilotLogCard } from "@/components/autopilot-log-card";
import { PastDataActivity } from "@/components/past-data-activity";
import { DashboardSection } from "@/components/dashboard-section";
import { DashboardSectionNav } from "@/components/dashboard-section-nav";

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  generateInsights,
  sendAssistantMessage,
  explainChart,
  generateAiTodos,
  type Insight,
  type ChartExplanation,
  type AiTodo,
} from "@/server/assistant.functions";
import { BenchmarksPanel } from "@/components/benchmarks-panel";
import { OverviewPerformanceSummary } from "@/components/overview-performance-summary";

type IndexSearch = { tab?: "overview" | "log" | "analyze" | "settings" | "benchmarks" };

export const Route = createFileRoute("/workspace")({
  validateSearch: (search: Record<string, unknown>): IndexSearch => {
    const tab = search.tab;
    if (tab === "overview" || tab === "log" || tab === "analyze" || tab === "settings" || tab === "benchmarks") {
      return { tab };
    }
    return {};
  },
  head: () => ({
    meta: [
      { title: "Dashboard — RA+" },
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
  const [perRoom, setPerRoom] = React.useState(true);
  const [insights, setInsights] = React.useState<Insight[]>([]);
  const [insightsLoading, setInsightsLoading] = React.useState(false);
  const [activeChart, setActiveChart] = React.useState<ChartId>("consumption");
  const [explainerChart, setExplainerChart] = React.useState<ChartId | null>(null);
  const [dashSection, setDashSection] = React.useState<string>("ops");
  const [dashDirection, setDashDirection] = React.useState<1 | -1>(1);
  const SECTION_ORDER = React.useMemo(() => ["ops", "energy-water", "carbon", "benchmarks", "data-quality"], []);
  const goToSection = React.useCallback((id: string) => {
    setDashSection((prev) => {
      const a = SECTION_ORDER.indexOf(prev);
      const b = SECTION_ORDER.indexOf(id);
      setDashDirection(b >= a ? 1 : -1);
      return id;
    });
  }, [SECTION_ORDER]);
  const search = Route.useSearch();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = React.useState<string>(search.tab ?? "overview");
  React.useEffect(() => {
    if (search.tab && search.tab !== activeTab) {
      setActiveTab(search.tab);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.tab]);
  const [pendingPrompt, setPendingPrompt] = React.useState<string | null>(null);
  const [highlightFields, setHighlightFields] = React.useState<HighlightedField[]>([]);
  const [utilityFilter, setUtilityFilter] = React.useState<Utility | null>(null);
  const [benchmarkOverride, setBenchmarkOverride] = React.useState<{
    sizeBand: string;
    region: string;
    starRating: number;
  } | null>(null);
  const [savingProfile, setSavingProfile] = React.useState(false);

  const reload = React.useCallback(async () => {
    const hotelId = getActiveHotelId();
    const [{ data: h }, { data: e }] = await Promise.all([
      supabase.from("hotels").select("*").eq("id", hotelId).maybeSingle(),
      supabase
        .from("monthly_entries")
        .select("*")
        .eq("hotel_id", hotelId)
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
      generateInsights({ data: { hotelId: getActiveHotelId() } })
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

  const benchmarkFilters = benchmarkOverride ?? filters;
  const benchmarkCohortSize = getPeerCohortSize(benchmarkFilters);
  const profileMatchesHotel =
    !benchmarkOverride ||
    (benchmarkOverride.sizeBand === filters.sizeBand &&
      benchmarkOverride.region === filters.region &&
      benchmarkOverride.starRating === filters.starRating);

  const handleSaveProfile = React.useCallback(async () => {
    if (!hotel || !benchmarkOverride) return;
    setSavingProfile(true);
    const { error } = await supabase
      .from("hotels")
      .update({
        size_band: benchmarkOverride.sizeBand,
        region: benchmarkOverride.region,
        star_rating: benchmarkOverride.starRating,
      })
      .eq("id", hotel.id);
    setSavingProfile(false);
    if (error) {
      toast.error("Could not save profile");
      return;
    }
    toast.success("Hotel profile updated");
    setBenchmarkOverride(null);
    void reload();
  }, [hotel, benchmarkOverride, reload]);

  const computeScoreBreakdown = React.useCallback(
    (entry: MonthlyEntry | undefined) => {
      const utils: { key: keyof MonthlyEntry; util: Utility; weight: number; label: string; unit: string }[] = [
        { key: "electricity_kwh", util: "electricity", weight: 0.35, label: "Electricity", unit: "kWh" },
        { key: "gas_kwh", util: "gas", weight: 0.2, label: "Gas", unit: "kWh" },
        { key: "water_m3", util: "water", weight: 0.25, label: "Water", unit: "m³" },
        { key: "waste_kg", util: "waste", weight: 0.2, label: "Waste", unit: "kg" },
      ];
      const parts: {
        key: string;
        label: string;
        unit: string;
        weight: number;
        sub: number | null;
        intensity: number | null;
        contribution: number;
      }[] = utils.map((u) => ({
        key: u.key as string,
        label: u.label,
        unit: u.unit,
        weight: u.weight,
        sub: null,
        intensity: null,
        contribution: 0,
      }));
      if (!entry || !entry.occupied_room_nights) {
        return { score: null as number | null, parts };
      }
      let total = 0;
      let weightUsed = 0;
      utils.forEach((u, i) => {
        const v = entry[u.key] as number | null;
        if (v === null || v === undefined) return;
        const intensity = v / entry.occupied_room_nights!;
        const stats = getPeerStats(u.util, entry.month, filters);
        const span = stats.p90 - stats.p10 || 1;
        const ratio = (intensity - stats.p10) / span;
        const sub = Math.max(0, Math.min(100, 100 - ratio * 80));
        parts[i].sub = Math.round(sub);
        parts[i].intensity = intensity;
        parts[i].contribution = sub * u.weight;
        total += sub * u.weight;
        weightUsed += u.weight;
      });
      if (weightUsed === 0) return { score: null, parts };
      return { score: Math.round(total / weightUsed), parts };
    },
    [filters],
  );

  const computeScore = React.useCallback(
    (entry: MonthlyEntry | undefined) => computeScoreBreakdown(entry).score,
    [computeScoreBreakdown],
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
        <Link
          to="/"
          className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary px-3.5 py-1.5 text-xs font-medium text-primary-foreground shadow-sm transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Back to My home
        </Link>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="mb-2 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              {hotel.name} · {hotel.region}
            </div>
            <h1 className="font-serif text-3xl sm:text-4xl md:text-5xl font-semibold leading-[1.05]">
              Hotel workspace
            </h1>
            <p className="mt-3 max-w-xl text-sm md:text-base text-muted-foreground">
              Log data, spot trends, compare to peers and act on insights — all in one focused workspace.
            </p>
          </div>
        </div>
        <div className="mt-6 h-px gold-divider" />
      </header>

      {/* Tabbed workspace — Ask Sera is now embedded inside Overview & Analyze */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <TabsList className="inline-flex h-auto w-max justify-start gap-1 rounded-2xl border border-border bg-card p-1.5 sm:w-auto">
          <TabsTrigger value="overview" className="rounded-xl px-3 py-2 text-xs sm:px-4 sm:text-sm data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm">
            Overview
          </TabsTrigger>
          <TabsTrigger value="log" className="rounded-xl px-3 py-2 text-xs sm:px-4 sm:text-sm data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm">
            Add data
          </TabsTrigger>
          <TabsTrigger value="analyze" className="rounded-xl px-3 py-2 text-xs sm:px-4 sm:text-sm data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm">
            Hotel Insights
          </TabsTrigger>
          <Link
            to="/workspace"
            search={{ tab: "settings" } as never}
            className="inline-flex items-center justify-center whitespace-nowrap rounded-xl px-3 py-2 text-xs sm:px-4 sm:text-sm font-medium text-muted-foreground transition-colors data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm hover:bg-muted hover:text-foreground"
            data-state={activeTab === "settings" ? "active" : "inactive"}
            onClick={(e) => {
              e.preventDefault();
              setActiveTab("settings");
            }}
          >
            Hotel settings
          </Link>
          <Link
            to="/workspace"
            search={{ tab: "benchmarks" } as never}
            className="inline-flex items-center justify-center whitespace-nowrap rounded-xl px-3 py-2 text-xs sm:px-4 sm:text-sm font-medium text-muted-foreground transition-colors data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm hover:bg-muted hover:text-foreground"
            data-state={activeTab === "benchmarks" ? "active" : "inactive"}
            onClick={(e) => {
              e.preventDefault();
              setActiveTab("benchmarks");
            }}
          >
            Peers Benchmark
          </Link>
        </TabsList>
        </div>
        <HotelSwitcher />
        </div>

        {/* OVERVIEW — score, KPIs, insights + Sera chat */}
        <TabsContent value="overview" className="mt-0 space-y-6 focus-visible:outline-none">

          <OverviewPerformanceSummary
            hotel={hotel}
            entries={entries}
            score={computeScore(latest)}
            scoreDelta={
              computeScore(latest) !== null && computeScore(prev) !== null
                ? (computeScore(latest) as number) - (computeScore(prev) as number)
                : null
            }
            cohortSize={benchmarkCohortSize}
          />

          <TodosCard
            hotel={hotel}
            latest={latest}
            prev={prev}
            lastYearSame={lastYearSame}
            sorted={sorted}
            isCurrentLogged={!!isCurrentLogged}
            worstUtility={worstUtility}
            missingFields={missingFields}
            cohortSize={benchmarkCohortSize}
            filters={benchmarkFilters}
            onGoToLog={(fields) => {
              if (fields && fields.length) setHighlightFields(fields);
              setActiveTab("log");
            }}
            onGoToAnalyze={() => setActiveTab("analyze")}
            onAskSera={(prompt) => {
              toast.success("Sera is on it");
              void navigate({ to: "/assistant", search: { prompt } });
            }}
          />

        </TabsContent>

        {/* LOG DATA — three methods: Manual, Survey, Import */}
        <TabsContent value="log" className="mt-0 focus-visible:outline-none">
          <LogDataTabs
            entries={entries}
            isCurrentLogged={!!isCurrentLogged}
            onSaved={() => void reload()}
            sorted={sorted}
            rooms={hotel.rooms}
            hotel={hotel}
            highlightFields={highlightFields}
            onHighlightConsumed={() => setHighlightFields([])}
          />
        </TabsContent>

        {/* ANALYZE — KPIs, multiple charts, peer benchmarks + Sera chart chat */}
        <TabsContent value="analyze" className="mt-0 space-y-6 focus-visible:outline-none">
          {/* AI summary (replaces previous Smart insights block) */}
          <MonthlyChangeSummary
            latest={latest}
            prev={prev}
            currentScore={computeScore(latest)}
            previousScore={computeScore(prev)}
            currentBreakdown={computeScoreBreakdown(latest)}
            previousBreakdown={computeScoreBreakdown(prev)}
            onDriverClick={(fieldKey) => {
              const kpi = KPIS.find((k) => k.key === fieldKey);
              setActiveChart("peer");
              if (kpi) {
                setUtilityFilter(kpi.utility);
              }
              window.setTimeout(() => {
                const el = document.getElementById(`kpi-${fieldKey}`);
                if (el) {
                  el.scrollIntoView({ behavior: "smooth", block: "center" });
                  el.classList.add("ring-2", "ring-primary/60", "ring-offset-2", "ring-offset-background");
                  window.setTimeout(() => {
                    el.classList.remove("ring-2", "ring-primary/60", "ring-offset-2", "ring-offset-background");
                  }, 2200);
                }
              }, 80);
            }}
            onAskSera={(prompt) => {
              toast.success("Sera is on it");
              void navigate({ to: "/assistant", search: { prompt } });
            }}
          />

          {/* Active utility filter chip */}
          {utilityFilter && (() => {
            const activeKpi = KPIS.find((k) => k.utility === utilityFilter);
            if (!activeKpi) return null;
            const FilterIcon = activeKpi.icon;
            return (
              <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-primary/30 bg-primary/5 px-4 py-2.5">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Filtered by driver
                </span>
                <span
                  className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium"
                  style={{ borderColor: activeKpi.color, color: activeKpi.color }}
                >
                  <FilterIcon className="h-3.5 w-3.5" />
                  {activeKpi.label}
                </span>
                <span className="text-xs text-muted-foreground">
                  Showing only {activeKpi.label.toLowerCase()} across all charts.
                </span>
                <button
                  type="button"
                  onClick={() => setUtilityFilter(null)}
                  className="ml-auto inline-flex items-center gap-1 rounded-full border border-border bg-background px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
                  aria-label="Clear utility filter"
                >
                  <RotateCcw className="h-3 w-3" />
                  Show all utilities
                </button>
              </div>
            );
          })()}

          {/* KPIs again here as quick reference */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {KPIS.filter((kpi) => !utilityFilter || kpi.utility === utilityFilter).map((kpi) => (
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
            {/* Charts column — organised into interest-based sections */}
            <div className="space-y-10 lg:col-span-3">
              {/* Section 1 — Hotel Operational Performance */}
              <DashboardSection
                id="ops"
                title="Hotel operational performance"
                subtitle="Your full activity footprint at a glance — utilities and CO₂e in one view."
                help={{
                  intro:
                    "This is the snapshot view of how the hotel ran over the last 12 months. Bars stack each utility so you see the full activity, the line shows the resulting CO₂e.",
                  items: [
                    {
                      q: "Why are utilities stacked?",
                      a: "Stacking shows total operational footprint per month. A taller stack means a busier or less efficient month — useful to spot peaks at a glance.",
                    },
                    {
                      q: "How does seasonality affect it?",
                      a: "Heating in winter, cooling and water in summer. Compare the same month year-over-year rather than month-to-month to remove the seasonal effect.",
                    },
                    {
                      q: "Why look at intensity (per room/guest)?",
                      a: "Intensity removes the effect of occupancy. A drop in absolute consumption with rising intensity means the hotel got less efficient even though it was quieter.",
                    },
                  ],
                }}
              >
                <ChartCard
                  id="consumption"
                  active={activeChart}
                  onSelect={setActiveChart}
                  onExplain={setExplainerChart}
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
                        {(!utilityFilter || utilityFilter === "electricity") && (
                          <Area dataKey="electricity" stackId="1" stroke="var(--chart-3)" fill="var(--chart-3)" fillOpacity={0.65} />
                        )}
                        {(!utilityFilter || utilityFilter === "gas") && (
                          <Area dataKey="gas" stackId="1" stroke="var(--chart-1)" fill="var(--chart-1)" fillOpacity={0.65} />
                        )}
                        {(!utilityFilter || utilityFilter === "water") && (
                          <Area dataKey="water" stackId="1" stroke="var(--chart-2)" fill="var(--chart-2)" fillOpacity={0.45} />
                        )}
                        {(!utilityFilter || utilityFilter === "waste") && (
                          <Area dataKey="waste" stackId="1" stroke="var(--chart-5)" fill="var(--chart-5)" fillOpacity={0.45} />
                        )}
                        <Line dataKey="co2e" stroke="var(--champagne)" strokeWidth={2.5} dot={false} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </ChartCard>
              </DashboardSection>

              {/* Section 2 — Energy & Water Performance */}
              <DashboardSection
                id="energy-water"
                title="Energy & water performance"
                subtitle="Trends over time, normalised by activity — spot drift early."
                help={{
                  intro:
                    "Energy and water are your biggest operational levers. This view focuses on intensity (per room-night) so a busy month doesn't look like a problem.",
                  items: [
                    {
                      q: "What usually drives variation?",
                      a: "HVAC set-points, kitchen activity, laundry volumes, leaks, guest behaviour. A sudden change in one curve is usually traceable to one driver.",
                    },
                    {
                      q: "How do I spot an abnormal peak?",
                      a: "A spike that breaks the seasonal pattern (versus the same month last year) is the strongest signal. Single isolated peaks often point to a meter or invoice issue.",
                    },
                    {
                      q: "Which actions move these curves?",
                      a: "Setpoint optimisation, BMS scheduling, leak detection and laundry contracts typically have the fastest impact on the next 1–3 months.",
                    },
                  ],
                }}
              >
                <ChartCard
                  id="intensity"
                  active={activeChart}
                  onSelect={setActiveChart}
                  onExplain={setExplainerChart}
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
                        {(!utilityFilter || utilityFilter === "electricity") && (
                          <Line type="monotone" dataKey="electricity" stroke="var(--chart-3)" strokeWidth={2} dot={false} name="Elec kWh/rn" />
                        )}
                        {(!utilityFilter || utilityFilter === "gas") && (
                          <Line type="monotone" dataKey="gas" stroke="var(--chart-1)" strokeWidth={2} dot={false} name="Gas kWh/rn" />
                        )}
                        {(!utilityFilter || utilityFilter === "water") && (
                          <Line type="monotone" dataKey="water" stroke="var(--chart-2)" strokeWidth={2} dot={false} name="Water m³/rn" />
                        )}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </ChartCard>
              </DashboardSection>

              {/* Section 3 — Carbon Footprint */}
              <DashboardSection
                id="carbon"
                title="Carbon footprint"
                subtitle="CO₂e trajectory and the energy mix behind it."
                help={{
                  intro:
                    "CO₂e is computed from your utility consumption and the emission factor of each energy source. It can move even if consumption stays flat.",
                  items: [
                    {
                      q: "Why can emissions change at constant consumption?",
                      a: "Because the emission factor changes — for example a greener electricity grid, or a switch from gas to electric heating. Same kWh, different CO₂e.",
                    },
                    {
                      q: "Scope 1 vs Scope 2 at hotel level?",
                      a: "Scope 1 = fuels burned on-site (gas, fuel oil). Scope 2 = electricity and district heating/cooling bought from a utility.",
                    },
                    {
                      q: "What does ‘on track’ mean here?",
                      a: "A trajectory aligned with the Accor reduction target (about –5% vs the same month last year). Below the line is good news.",
                    },
                  ],
                }}
              >
                <ChartCard
                  id="co2e"
                  active={activeChart}
                  onSelect={setActiveChart}
                  onExplain={setExplainerChart}
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
              </DashboardSection>

              {/* Section 4 — Benchmarking & Peer Comparison */}
              <DashboardSection
                id="benchmarks"
                title="Benchmarking & peer comparison"
                subtitle={`How this hotel compares with ${cohortSize} similar Mediterranean hotels.`}
                help={{
                  intro:
                    "Peer comparison places the hotel within a cohort of similar properties (size, climate, segment). It tells you whether your numbers are normal for that profile.",
                  items: [
                    {
                      q: "What does ‘peer rank’ mean?",
                      a: "It's your position in the cohort for one metric. Rank 1 means most efficient, last rank means least efficient — for that utility only.",
                    },
                    {
                      q: "Why normalise the data?",
                      a: "Hotels of different sizes can't be compared in absolute kWh. We use intensity (per room-night) so a 50-room and a 300-room hotel can sit on the same scale.",
                    },
                    {
                      q: "How do I read percentile positioning?",
                      a: "‘Top 25%’ means you're more efficient than 75% of similar hotels. ‘Bottom 25%’ flags a clear improvement opportunity.",
                    },
                  ],
                }}
              >
                <ChartCard
                  id="peer"
                  active={activeChart}
                  onSelect={setActiveChart}
                  onExplain={setExplainerChart}
                  title="Peer comparison"
                  subtitle={`vs ${cohortSize} similar Mediterranean hotels`}
                  aside={<Trophy className="h-5 w-5" style={{ color: "var(--champagne)" }} />}
                >
                  <div className="grid grid-cols-1 gap-3 px-6 pb-6 sm:grid-cols-2">
                    {KPIS.filter((kpi) => !utilityFilter || kpi.utility === utilityFilter).map((kpi) => (
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
              </DashboardSection>

              {/* Section 5 — Data Quality & Reporting Confidence */}
              <DashboardSection
                id="data-quality"
                title="Data quality & reporting confidence"
                subtitle="Whether you can trust the numbers above — and what's still missing."
                help={{
                  intro:
                    "Every chart on this page reflects what has been reported. This section tells you how complete and recent that input is, so you know when to trust a trend.",
                  items: [
                    {
                      q: "Why do data gaps matter?",
                      a: "A missing month makes year-over-year and peer comparisons unreliable. Trends look like drops or peaks that are really just gaps.",
                    },
                    {
                      q: "How do reporting cycles work?",
                      a: "Each utility is reported monthly, ideally within 30 days of the period close. Late submissions delay the comparison versus peers.",
                    },
                    {
                      q: "What if my data looks incomplete?",
                      a: "Open the Log tab to fill the missing fields, or upload an invoice — the platform will pre-fill the values for you to review.",
                    },
                  ],
                }}
              >
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl border border-border bg-card/60 p-4">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      Latest reporting period
                    </div>
                    <div className="mt-1.5 text-base font-semibold text-foreground">
                      {latest
                        ? `${MONTH_NAMES[latest.month - 1]} ${latest.year}`
                        : "No submissions yet"}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {isCurrentLogged
                        ? "Current period reported."
                        : "Current period not yet reported."}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-border bg-card/60 p-4">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      Months covered (12m)
                    </div>
                    <div className="mt-1.5 text-base font-semibold text-foreground">
                      {Math.min(sorted.length, 12)} / 12
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {sorted.length >= 12
                        ? "Continuous 12-month history available."
                        : `${12 - Math.min(sorted.length, 12)} month(s) missing for full year-over-year comparison.`}
                    </div>
                  </div>
                  <div
                    className={`rounded-2xl border p-4 ${
                      missingFields.length === 0
                        ? "border-emerald-500/30 bg-emerald-500/5"
                        : "border-amber-500/30 bg-amber-500/5"
                    }`}
                  >
                    <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      Missing values (latest period)
                    </div>
                    <div className="mt-1.5 text-base font-semibold text-foreground">
                      {missingFields.length === 0
                        ? "All clear"
                        : `${missingFields.length} field${missingFields.length > 1 ? "s" : ""} missing`}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {missingFields.length === 0
                        ? "Submission complete for the most recent period."
                        : "Open the Log tab to complete the submission."}
                    </div>
                  </div>
                </div>
              </DashboardSection>
            </div>

            {/* Right rail: chart explainer (opens when "How to read this chart" is clicked) */}
            <div className="space-y-6 lg:col-span-2">
              <div className="lg:sticky lg:top-6 space-y-6">
                {explainerChart ? (
                  <ChartExplainerCard
                    chartId={explainerChart}
                    isLatestLogged={!!isCurrentLogged}
                    hasMissingFields={missingFields.length > 0}
                    worstUtilityLabel={worstUtility?.label ?? null}
                    onClose={() => setExplainerChart(null)}
                    onDraftLog={() => {
                      setHighlightFields([]);
                      setActiveTab("log");
                      toast.success(`Draft started for ${latest ? `${MONTH_NAMES[latest.month - 1]} ${latest.year}` : "this month"}`);
                    }}
                    onAskSera={(prompt) => {
                      toast.success("Sera is on it");
                      void navigate({ to: "/assistant", search: { prompt } });
                    }}
                    onHighlightFix={() => {
                      const fields =
                        explainerChart === "peer" && worstUtility
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
                ) : (
                  <div className="rounded-3xl border border-dashed border-border/70 bg-card/40 p-8 text-center">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted/60">
                      <BookOpen className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <h3 className="mt-4 font-serif text-base font-semibold">Need help reading a chart?</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Click <span className="font-medium text-foreground">“How to read this chart”</span> on any chart and a plain-language explanation will appear here.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </TabsContent>

        {/* SETTINGS — edit hotel profile */}
        <TabsContent value="settings" className="mt-0 focus-visible:outline-none">
          <HotelSettingsPanel hotel={hotel} onSaved={reload} />
        </TabsContent>

        {/* BENCHMARKS — peer comparison, in-page (no header change) */}
        <TabsContent value="benchmarks" className="mt-0 focus-visible:outline-none">
          <BenchmarksPanel showHeader={false} />
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
  onExplain,
  children,
}: {
  id: ChartId;
  active: ChartId;
  onSelect: (id: ChartId) => void;
  title: string;
  subtitle: string;
  aside?: React.ReactNode;
  onExplain?: (id: ChartId) => void;
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
      {onExplain && (
        <div className="flex justify-end border-t border-border/60 px-6 py-3">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onExplain(id);
            }}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-foreground/20 bg-foreground px-3 py-1.5 text-xs font-medium text-background shadow-sm transition hover:bg-foreground/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={`How to read ${title}`}
          >
            <BookOpen className="h-3.5 w-3.5" />
            How to read this chart
          </button>
        </div>
      )}
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
  onClose,
}: {
  chartId: ChartId;
  isLatestLogged: boolean;
  hasMissingFields: boolean;
  worstUtilityLabel: string | null;
  onDraftLog: () => void;
  onAskSera: (prompt: string) => void;
  onHighlightFix: () => void;
  onClose?: () => void;
}) {
  const explain = useServerFn(explainChart);
  const [data, setData] = React.useState<ChartExplanation | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [actionPanel, setActionPanel] = React.useState<{
    action: string;
    prompt: string;
  } | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setData(null);
    explain({ data: { chartId, hotelId: getActiveHotelId() } })
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
    <>
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
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="-mr-1 -mt-1 inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
            aria-label="Close explainer"
          >
            <X className="h-4 w-4" />
          </button>
        )}
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
            {data.actions?.length ? (
              <div className="rounded-2xl border border-primary/25 bg-primary/5 p-3.5">
                <div className="mb-2 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-primary">
                  <Target className="h-3.5 w-3.5" />
                  Action ideas
                </div>
                <p className="mb-2.5 text-[11px] leading-snug text-muted-foreground">
                  Specific suggested steps based on this chart's drivers in your data.
                </p>
                <ul className="space-y-2">
                  {data.actions.map((action, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-2.5 rounded-lg bg-background/60 px-2.5 py-2 text-xs leading-relaxed text-foreground"
                    >
                      <span className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[10px] font-semibold text-primary">
                        {i + 1}
                      </span>
                      <span className="flex-1">{action}</span>
                      <button
                        type="button"
                        onClick={() =>
                          setActionPanel({
                            action,
                            prompt: `Looking at my "${CHART_TITLES[chartId]}" chart, walk me through this action step in detail for my hotel:\n\n"${action}"\n\nExplain the specific driver, expected impact (with units), and how to execute it.`,
                          })
                        }
                        className="ml-1 inline-flex shrink-0 items-center gap-1 rounded-full border border-primary/30 bg-background px-2 py-0.5 text-[10px] font-medium text-primary transition hover:bg-primary hover:text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        title="Ask Sera about this action"
                        aria-label="Ask Sera about this action"
                      >
                        <Sparkles className="h-3 w-3" />
                        Ask Sera
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        )}
      </div>

      {/* One-click actions */}
      <div className="mt-5 border-t border-border/60 pt-4">
        <div className="flex flex-wrap gap-2">
          <ActionChip
            icon={<Wand2 className="h-3.5 w-3.5" />}
            label="Ask Sera for more recommendations"
            primary
            onClick={() =>
              setActionPanel({
                action: `More recommendations for "${CHART_TITLES[chartId]}"`,
                prompt: actionConfig.ask,
              })
            }
          />
        </div>
      </div>
    </Card>
    <ActionAskSeraPanel
      open={!!actionPanel}
      action={actionPanel?.action ?? ""}
      prompt={actionPanel?.prompt ?? ""}
      chartTitle={CHART_TITLES[chartId]}
      onClose={() => setActionPanel(null)}
    />
    </>
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

function ActionAskSeraPanel({
  open,
  action,
  prompt,
  chartTitle,
  onClose,
}: {
  open: boolean;
  action: string;
  prompt: string;
  chartTitle: string;
  onClose: () => void;
}) {
  const send = useServerFn(sendAssistantMessage);
  const [messages, setMessages] = React.useState<ChatMsg[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [input, setInput] = React.useState("");
  const sentRef = React.useRef<string | null>(null);
  const scrollRef = React.useRef<HTMLDivElement | null>(null);

  // Reset and auto-send when a new prompt opens the panel
  React.useEffect(() => {
    if (!open) return;
    if (sentRef.current === prompt) return;
    sentRef.current = prompt;
    setMessages([{ role: "user", content: prompt }]);
    setLoading(true);
    send({ data: { message: prompt, history: [], hotelId: getActiveHotelId() } })
      .then((res) => {
        if (res.ok) {
          setMessages((m) => [...m, { role: "assistant", content: res.content }]);
        } else {
          toast.error(res.error);
        }
      })
      .catch(() => toast.error("Something went wrong"))
      .finally(() => setLoading(false));
  }, [open, prompt, send]);

  // Reset state fully when closed
  React.useEffect(() => {
    if (!open) {
      sentRef.current = null;
      setMessages([]);
      setInput("");
      setLoading(false);
    }
  }, [open]);

  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  async function handleSend(text: string) {
    const t = text.trim();
    if (!t || loading) return;
    const userMsg: ChatMsg = { role: "user", content: t };
    const history = messages.slice(-10);
    setMessages((m) => [...m, userMsg]);
    setInput("");
    setLoading(true);
    try {
      const res = await send({ data: { message: t, history, hotelId: getActiveHotelId() } });
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
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-foreground/20 backdrop-blur-[2px]"
            onClick={onClose}
          />
          <motion.aside
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 280 }}
            className="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col border-l border-border bg-card shadow-2xl"
          >
            <div className="flex items-start gap-3 border-b border-border/70 bg-gradient-to-br from-card to-accent/10 px-5 py-4">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
                <Sparkles className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  Ask Sera · {chartTitle}
                </div>
                <h3 className="mt-0.5 line-clamp-2 font-serif text-sm font-semibold leading-snug text-foreground">
                  {action}
                </h3>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="-mr-1 -mt-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
                aria-label="Close panel"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
              {messages.map((m, i) =>
                m.role === "user" ? (
                  <div key={i} className="flex justify-end">
                    <div className="max-w-[90%] rounded-2xl bg-secondary px-3.5 py-2.5 text-sm text-secondary-foreground">
                      <div className="whitespace-pre-wrap">{m.content}</div>
                    </div>
                  </div>
                ) : (
                  <div key={i} className="flex justify-start">
                    <div className="max-w-[95%] rounded-2xl border border-border bg-background px-3.5 py-2.5 text-sm text-foreground">
                      <div className="prose prose-sm max-w-none prose-headings:font-serif prose-headings:font-semibold prose-p:my-2 prose-p:text-foreground prose-strong:text-foreground prose-li:my-0.5 prose-ul:my-2">
                        <ReactMarkdown>{m.content}</ReactMarkdown>
                      </div>
                    </div>
                  </div>
                ),
              )}
              {loading && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Sera is thinking…
                </div>
              )}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                void handleSend(input);
              }}
              className="border-t border-border bg-card px-4 py-3"
            >
              <div className="flex items-center gap-2 rounded-2xl border border-border bg-background px-3 py-2 focus-within:ring-1 focus-within:ring-ring">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask a follow-up…"
                  autoComplete="off"
                  disabled={loading}
                  className="flex-1 bg-transparent py-1 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none disabled:opacity-60"
                />
                <Button
                  type="submit"
                  size="icon"
                  disabled={loading || !input.trim()}
                  className="h-8 w-8 shrink-0 rounded-xl"
                >
                  <Send className="h-3.5 w-3.5" />
                </Button>
              </div>
            </form>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
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
const AI_TODOS_STORAGE_KEY = "verdance:ai-todos:v1";

const DEFAULT_PRIORITY_ORDER: TodoCategory[] = ["data", "compliance", "cost", "waste"];

const AI_CATEGORY_ICON: Record<TodoCategory, React.ComponentType<React.SVGProps<SVGSVGElement>>> = {
  cost: Bolt,
  compliance: ClipboardList,
  waste: Recycle,
  data: BarChart3,
};

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

type ScoreBreakdown = {
  score: number | null;
  parts: {
    key: string;
    label: string;
    unit: string;
    weight: number;
    sub: number | null;
    intensity: number | null;
    contribution: number;
  }[];
};

function MonthlyChangeSummary({
  latest,
  prev,
  currentScore,
  previousScore,
  currentBreakdown,
  previousBreakdown,
  onDriverClick,
  onAskSera,
}: {
  latest: MonthlyEntry | undefined;
  prev: MonthlyEntry | undefined;
  currentScore: number | null;
  previousScore: number | null;
  currentBreakdown: ScoreBreakdown;
  previousBreakdown: ScoreBreakdown;
  onDriverClick?: (fieldKey: HighlightedField) => void;
  onAskSera?: (prompt: string) => void;
}) {
  const send = useServerFn(sendAssistantMessage);
  const [chatTurns, setChatTurns] = React.useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = React.useState("");
  const [chatPending, setChatPending] = React.useState(false);
  const chatScrollRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    chatScrollRef.current?.scrollTo({
      top: chatScrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [chatTurns, chatPending]);

  const summary = React.useMemo(() => {
    type Driver = {
      key: HighlightedField;
      label: string;
      delta: number;
      weighted: number;
      tone: "positive" | "negative";
    };
    if (!latest) {
      return {
        headline: "Log this month's data to unlock your AI summary.",
        body:
          "Once you've logged electricity, gas, water and waste for the current month, we'll explain what changed since last month and highlight the top drivers.",
        drivers: [] as Driver[],
      };
    }
    if (!prev) {
      return {
        headline: `${MONTH_NAMES[latest.month - 1]} ${latest.year} is your first logged month.`,
        body:
          "Once you log a second month, this summary will explain what changed and highlight the top two drivers behind your score.",
        drivers: [] as Driver[],
      };
    }

    // Per-utility sub-score deltas
    const deltas: Driver[] = currentBreakdown.parts
      .map((p, i) => {
        const prevPart = previousBreakdown.parts[i];
        if (p.sub === null || prevPart?.sub === null || prevPart?.sub === undefined) return null;
        const delta = p.sub - prevPart.sub;
        const weighted = delta * p.weight;
        return {
          key: p.key as HighlightedField,
          label: p.label,
          delta: Math.round(delta),
          weighted,
          tone: delta >= 0 ? ("positive" as const) : ("negative" as const),
        };
      })
      .filter((d): d is Driver => d !== null);

    // Top 2 by absolute weighted impact
    const topDrivers = [...deltas]
      .sort((a, b) => Math.abs(b.weighted) - Math.abs(a.weighted))
      .slice(0, 2);

    const scoreDelta =
      currentScore !== null && previousScore !== null ? currentScore - previousScore : null;

    const monthLabel = `${MONTH_NAMES[latest.month - 1]} ${latest.year}`;
    const prevLabel = `${MONTH_NAMES[prev.month - 1]}`;

    let headline: string;
    if (scoreDelta === null) {
      headline = `${monthLabel} performance is in — here's how it compares to ${prevLabel}.`;
    } else if (scoreDelta > 2) {
      headline = `Your score climbed ${scoreDelta} points since ${prevLabel} — solid progress.`;
    } else if (scoreDelta < -2) {
      headline = `Your score slipped ${Math.abs(scoreDelta)} points since ${prevLabel} — worth a closer look.`;
    } else if (scoreDelta === 0) {
      headline = `Your score held steady versus ${prevLabel}, but the underlying mix shifted.`;
    } else {
      headline = `Small move (${scoreDelta > 0 ? "+" : ""}${scoreDelta}) versus ${prevLabel} — directionally ${scoreDelta > 0 ? "improving" : "softer"}.`;
    }

    let body: string;
    if (topDrivers.length === 0) {
      body = `Not enough overlapping utility data with ${prevLabel} to identify drivers yet — log the same fields both months for a full breakdown.`;
    } else {
      const driverPhrases = topDrivers.map((d) => {
        if (d.delta === 0) return `${d.label} held flat`;
        const dir = d.tone === "positive" ? "improved" : "weakened";
        return `${d.label} ${dir} by ${Math.abs(d.delta)} pts`;
      });
      const joined =
        driverPhrases.length === 2
          ? `${driverPhrases[0]} and ${driverPhrases[1]}`
          : driverPhrases[0];
      const positives = topDrivers.filter((d) => d.tone === "positive").length;
      const negatives = topDrivers.filter((d) => d.tone === "negative" && d.delta !== 0).length;
      let nuance = "";
      if (positives > 0 && negatives > 0) {
        nuance = " Mixed signals — the gains partly offset the slips.";
      } else if (negatives === topDrivers.length && negatives > 0) {
        nuance = " Both moved the wrong way — prioritise these in your to-dos this month.";
      } else if (positives === topDrivers.length && positives > 0) {
        nuance = " Keep these habits going next month to compound the gain.";
      }
      body = `The biggest movers were ${joined} (versus peer benchmarks per occupied room-night). Click a pill below to inspect the chart.${nuance}`;
    }

    return { headline, body, drivers: topDrivers };
  }, [latest, prev, currentScore, previousScore, currentBreakdown, previousBreakdown]);

  return (
    <Card className="relative overflow-hidden rounded-3xl border-border/70 bg-card/60 p-6 backdrop-blur-sm">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-accent/15 blur-3xl"
      />
      <div className="relative flex flex-col gap-4 md:flex-row md:items-start">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-secondary text-primary-foreground shadow-md">
          <Sparkles className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              AI summary
            </span>
            <span className="rounded-full bg-accent/20 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-accent-foreground">
              Auto
            </span>
          </div>
          <p className="mt-2 font-serif text-lg leading-snug text-foreground">
            {summary.headline}
          </p>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {summary.body}
          </p>
          {summary.drivers.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {summary.drivers.map((d) => {
                const isInteractive = !!onDriverClick;
                const baseClass = `group/pill inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition ${
                  d.tone === "positive"
                    ? "border-primary/30 bg-primary/10 text-primary"
                    : "border-destructive/30 bg-destructive/10 text-destructive"
                } ${
                  isInteractive
                    ? d.tone === "positive"
                      ? "cursor-pointer hover:bg-primary/15 hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                      : "cursor-pointer hover:bg-destructive/15 hover:border-destructive/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/40"
                    : ""
                }`;
                const inner = (
                  <>
                    {d.tone === "positive" ? (
                      <ArrowUpRight className="h-3 w-3" />
                    ) : (
                      <ArrowDownRight className="h-3 w-3" />
                    )}
                    {d.label} {d.delta > 0 ? "+" : ""}
                    {d.delta} pts
                    {isInteractive && (
                      <ChevronRight className="h-3 w-3 -mr-0.5 opacity-50 transition group-hover/pill:translate-x-0.5 group-hover/pill:opacity-100" />
                    )}
                  </>
                );
                if (isInteractive) {
                  return (
                    <button
                      key={d.key}
                      type="button"
                      onClick={() => onDriverClick!(d.key)}
                      className={baseClass}
                      aria-label={`Open ${d.label} chart and field`}
                      title={`Review ${d.label} in Hotel Insights`}
                    >
                      {inner}
                    </button>
                  );
                }
                return (
                  <span key={d.key} className={baseClass}>
                    {inner}
                  </span>
                );
              })}
            </div>
          )}

          {latest && prev && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-background/60 px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Info className="h-3 w-3" />
                    How this changed
                  </button>
                </PopoverTrigger>
              <PopoverContent
                align="start"
                side="bottom"
                className="w-[min(22rem,calc(100vw-2rem))] rounded-2xl border-border/70 p-4 text-xs leading-relaxed"
              >
                <div className="mb-2 flex items-center gap-1.5">
                  <Info className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    How this changed
                  </span>
                </div>

                {/* Score formula */}
                <div className="space-y-1.5">
                  <p className="font-medium text-foreground">Score delta</p>
                  <p className="text-muted-foreground">
                    Δscore = score(<span className="text-foreground">{MONTH_NAMES[latest.month - 1]}</span>) − score(<span className="text-foreground">{MONTH_NAMES[prev.month - 1]}</span>)
                  </p>
                  <p className="font-mono text-[11px] text-foreground">
                    {currentScore ?? "—"} − {previousScore ?? "—"} ={" "}
                    <span className={
                      currentScore !== null && previousScore !== null && currentScore - previousScore > 0
                        ? "text-primary"
                        : currentScore !== null && previousScore !== null && currentScore - previousScore < 0
                          ? "text-destructive"
                          : ""
                    }>
                      {currentScore !== null && previousScore !== null
                        ? `${currentScore - previousScore > 0 ? "+" : ""}${currentScore - previousScore}`
                        : "—"} pts
                    </span>
                  </p>
                </div>

                <Separator className="my-3" />

                {/* Sub-score formula */}
                <div className="space-y-1.5">
                  <p className="font-medium text-foreground">Per-utility sub-score</p>
                  <p className="text-muted-foreground">
                    Each utility scores 0–100 based on its intensity (per occupied room-night) vs your peer cohort:
                  </p>
                  <p className="font-mono text-[11px] text-foreground">
                    sub = 100 − ((intensity − p10) ÷ (p90 − p10)) × 80
                  </p>
                  <p className="text-muted-foreground">
                    Score is the weighted average: <span className="text-foreground">Electricity 35% · Gas 20% · Water 25% · Waste 20%</span>.
                  </p>
                </div>

                <Separator className="my-3" />

                {/* Top driver math */}
                <div className="space-y-1.5">
                  <p className="font-medium text-foreground">Top drivers</p>
                  <p className="text-muted-foreground">
                    Drivers are ranked by absolute weighted impact: |Δsub × weight|.
                  </p>
                  {summary.drivers.length > 0 ? (
                    <ul className="mt-1 space-y-1">
                      {summary.drivers.map((d) => {
                        const part = currentBreakdown.parts.find((p) => p.key === d.key);
                        const prevPart = previousBreakdown.parts.find((p) => p.key === d.key);
                        const w = part?.weight ?? 0;
                        const weighted = d.delta * w;
                        return (
                          <li key={d.key} className="font-mono text-[11px] text-foreground">
                            <span className="font-sans text-muted-foreground">{d.label}: </span>
                            ({part?.sub ?? "—"} − {prevPart?.sub ?? "—"}) × {w} ={" "}
                            <span className={d.delta > 0 ? "text-primary" : d.delta < 0 ? "text-destructive" : ""}>
                              {weighted > 0 ? "+" : ""}{weighted.toFixed(1)} pts
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className="text-muted-foreground italic">No drivers — log matching utilities both months.</p>
                  )}
                </div>
              </PopoverContent>
            </Popover>
            </div>
          )}

          {/* Inline mini chat with Sera */}
          {latest && prev && (() => {
            const monthLabel = `${MONTH_NAMES[latest.month - 1]} ${latest.year}`;
            const prevLabel = `${MONTH_NAMES[prev.month - 1]} ${prev.year}`;
            const driverList =
              summary.drivers.length > 0
                ? summary.drivers
                    .map((d) => `${d.label} ${d.delta > 0 ? "+" : ""}${d.delta} pts`)
                    .join(", ")
                : "no clear drivers identified";
            const summaryContext = `Context — AI summary for ${monthLabel} vs ${prevLabel}.\nHeadline: ${summary.headline}\nBody: ${summary.body}\nTop movers: ${driverList}.`;

            const starters: string[] = [];
            if (summary.drivers.length > 0) {
              const worst = summary.drivers.find((d) => d.tone === "negative");
              const best = summary.drivers.find((d) => d.tone === "positive");
              if (worst) starters.push(`Why did ${worst.label.toLowerCase()} weaken in ${MONTH_NAMES[latest.month - 1]}?`);
              if (best) starters.push(`What drove the ${best.label.toLowerCase()} improvement?`);
            }
            starters.push("What 2 actions would lift my score most next month?");
            starters.push(`Compare ${monthLabel} to the same month last year.`);

            async function handleAsk(text: string) {
              const trimmed = text.trim();
              if (!trimmed || chatPending) return;

              const history: ChatMsg[] = [];
              if (chatTurns.length === 0) {
                history.push({ role: "assistant", content: summaryContext });
              }
              history.push(...chatTurns);

              const userTurn: ChatMsg = { role: "user", content: trimmed };
              setChatTurns((t) => [...t, userTurn]);
              setChatInput("");
              setChatPending(true);

              try {
                const res = await send({
                  data: {
                    message: trimmed,
                    history,
                    hotelId: getActiveHotelId(),
                  },
                });
                if (res.ok) {
                  setChatTurns((t) => [...t, { role: "assistant", content: res.content }]);
                } else {
                  toast.error(res.error);
                  setChatTurns((t) => t.slice(0, -1));
                }
              } catch {
                toast.error("Something went wrong");
                setChatTurns((t) => t.slice(0, -1));
              } finally {
                setChatPending(false);
              }
            }

            const showChat = chatTurns.length > 0 || chatPending;

            return (
              <div className="mt-4 rounded-2xl border border-border/50 bg-background/40">
                <div className="flex items-center justify-between gap-2 border-b border-border/50 px-3 py-2">
                  <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                    <MessageCircle className="h-3.5 w-3.5" />
                    Ask Sera about this summary
                  </div>
                  {chatTurns.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setChatTurns([])}
                      className="text-[11px] text-muted-foreground hover:text-foreground"
                    >
                      Clear
                    </button>
                  )}
                </div>

                {showChat && (
                  <div
                    ref={chatScrollRef}
                    className="max-h-72 space-y-3 overflow-y-auto px-3 py-3"
                  >
                    {chatTurns.map((t, i) => (
                      <div
                        key={i}
                        className={`flex ${t.role === "user" ? "justify-end" : "justify-start"}`}
                      >
                        <div
                          className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                            t.role === "user"
                              ? "bg-primary text-primary-foreground"
                              : "border border-border/60 bg-card text-foreground"
                          }`}
                        >
                          {t.role === "user" ? (
                            <div className="whitespace-pre-wrap">{t.content}</div>
                          ) : (
                            <div className="prose prose-sm max-w-none prose-p:my-1.5 prose-p:text-foreground prose-strong:text-foreground prose-li:my-0.5 prose-ul:my-1.5">
                              <ReactMarkdown>{t.content}</ReactMarkdown>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                    {chatPending && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Sera is thinking…
                      </div>
                    )}
                  </div>
                )}

                {/* Suggested starter questions */}
                {!chatPending && chatTurns.length === 0 && (
                  <div className="flex flex-wrap gap-1.5 px-3 pt-3">
                    {starters.map((q) => (
                      <button
                        key={q}
                        type="button"
                        onClick={() => void handleAsk(q)}
                        className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-background/60 px-2.5 py-1 text-xs text-foreground transition hover:border-primary/40 hover:bg-primary/5"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                )}

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void handleAsk(chatInput);
                  }}
                  className="flex items-end gap-2 px-3 py-3"
                >
                  <textarea
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        void handleAsk(chatInput);
                      }
                    }}
                    placeholder="Ask a follow-up question…"
                    rows={1}
                    className="flex-1 resize-none rounded-lg border border-border/60 bg-background px-3 py-2 text-sm focus:border-primary/40 focus:outline-none focus:ring-1 focus:ring-primary/30"
                  />
                  <Button
                    type="submit"
                    size="icon"
                    disabled={chatPending || !chatInput.trim()}
                    className="h-9 w-9 shrink-0 rounded-lg"
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </form>
              </div>
            );
          })()}
        </div>
      </div>
    </Card>
  );
}

function TodosCard({
  hotel,
  latest,
  prev,
  lastYearSame,
  sorted,
  isCurrentLogged,
  worstUtility,
  missingFields,
  cohortSize,
  filters,
  onGoToLog,
  onGoToAnalyze,
  onAskSera,
}: {
  hotel: Hotel | null;
  latest: MonthlyEntry | undefined;
  prev: MonthlyEntry | undefined;
  lastYearSame: MonthlyEntry | undefined;
  sorted: MonthlyEntry[];
  isCurrentLogged: boolean;
  worstUtility: { key: HighlightedField; label: string; rank: number } | null;
  missingFields: HighlightedField[];
  cohortSize: number;
  filters: { sizeBand: string; region: string; starRating: number };
  onGoToLog: (highlight?: HighlightedField[]) => void;
  onGoToAnalyze: () => void;
  onAskSera: (prompt: string) => void;
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
        cta: "Open Input form",
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
        cta: "Open Input form",
        icon: Upload,
        tone: "routine",
        category: "compliance",
        onClick: () => onGoToLog(),
      });
    }

    // Recycled %: encourage uplift if low or missing
    if (latest) {
      const rec = latest.recycled_pct;
      if (rec === null || rec === undefined) {
        items.push({
          id: "recycled-missing",
          title: `Add ${prevMonthLabel} recycled %`,
          description: "Recycled rate is missing — add it so waste benchmarks reflect your real performance.",
          cta: "Open form",
          icon: Recycle,
          tone: "important",
          category: "waste",
          onClick: () => onGoToLog(["waste_kg"]),
        });
      } else if (rec < 35) {
        items.push({
          id: "recycled-low",
          title: "Lift recycled rate above 35%",
          description: `Only ${rec.toFixed(0)}% of waste was recycled — quick wins on glass and cardboard separation can move the needle.`,
          cta: "Ask Sera",
          icon: Recycle,
          tone: "important",
          category: "waste",
          onClick: () =>
            onAskSera(
              `My recycled rate last month was ${rec.toFixed(1)}%. Suggest 3 concrete actions to lift it above 35% this month.`,
            ),
        });
      }
    }

    // Renewable %: nudge if low
    if (latest && latest.renewable_pct !== null && latest.renewable_pct !== undefined && latest.renewable_pct < 25) {
      items.push({
        id: "renewable-low",
        title: "Increase renewable share",
        description: `Only ${latest.renewable_pct.toFixed(0)}% of electricity was renewable. A green tariff switch is usually a 1-week task.`,
        cta: "Ask Sera",
        icon: Leaf,
        tone: "routine",
        category: "cost",
        onClick: () =>
          onAskSera(
            `My renewable electricity share is ${latest.renewable_pct?.toFixed(1)}%. What are the fastest ways to lift it this quarter?`,
          ),
      });
    }

    // YoY drift on a key utility (only if not already flagged as worst)
    if (latest && lastYearSame) {
      const checks: Array<{ key: HighlightedField; label: string; ratio: number; icon: React.ComponentType<React.SVGProps<SVGSVGElement>>; cat: TodoCategory }> = [];
      const occL = latest.occupied_room_nights ?? 0;
      const occLY = lastYearSame.occupied_room_nights ?? 0;
      if (occL > 0 && occLY > 0) {
        const utils: Array<{ key: HighlightedField; label: string; field: keyof MonthlyEntry; icon: React.ComponentType<React.SVGProps<SVGSVGElement>>; cat: TodoCategory }> = [
          { key: "electricity_kwh", label: "electricity", field: "electricity_kwh", icon: Bolt, cat: "cost" },
          { key: "gas_kwh", label: "gas", field: "gas_kwh", icon: Flame, cat: "cost" },
          { key: "water_m3", label: "water", field: "water_m3", icon: Droplets, cat: "cost" },
        ];
        for (const u of utils) {
          if (worstUtility?.key === u.key) continue;
          const cur = latest[u.field] as number | null | undefined;
          const ly = lastYearSame[u.field] as number | null | undefined;
          if (cur != null && ly != null && ly > 0) {
            const curIntensity = cur / occL;
            const lyIntensity = ly / occLY;
            const ratio = (curIntensity - lyIntensity) / lyIntensity;
            checks.push({ key: u.key, label: u.label, ratio, icon: u.icon, cat: u.cat });
          }
        }
        const drifted = checks.filter((c) => c.ratio > 0.08).sort((a, b) => b.ratio - a.ratio)[0];
        if (drifted) {
          items.push({
            id: `yoy-${drifted.key}`,
            title: `Investigate ${drifted.label} YoY drift`,
            description: `${drifted.label.charAt(0).toUpperCase() + drifted.label.slice(1)} intensity is ${(drifted.ratio * 100).toFixed(0)}% above the same month last year — worth a closer look.`,
            cta: "Open analysis",
            icon: drifted.icon,
            tone: "important",
            category: drifted.cat,
            onClick: onGoToAnalyze,
          });
        }
      }
    }

    // Notes hygiene
    if (latest && (!latest.notes || latest.notes.trim().length < 8)) {
      items.push({
        id: "log-notes",
        title: `Add a note for ${prevMonthLabel}`,
        description: "A short context note (events, weather, renovations) helps explain anomalies later.",
        cta: "Open Input form",
        icon: Pencil,
        tone: "routine",
        category: "compliance",
        onClick: () => onGoToLog(),
      });
    }

    // Monthly close ritual: end of month
    if (today.getDate() >= 25) {
      items.push({
        id: "month-close",
        title: `Plan ${monthLabel} month-close`,
        description: "Block 30 minutes this week to gather invoices and meter readings before the new month starts.",
        cta: "Open Input form",
        icon: CalendarCheck,
        tone: "routine",
        category: "compliance",
        onClick: () => onGoToLog(),
      });
    }

    // Best-in-class gap (top utility where you're already strong → push to top 10%)
    if (worstUtility && worstUtility.rank <= 50 && sorted.length >= 6) {
      items.push({
        id: "best-in-class-push",
        title: "Push your best utility into top 10%",
        description: "You're already mid-pack or better — Sera can outline the last-mile actions to reach the top decile.",
        cta: "Ask Sera",
        icon: Trophy,
        tone: "routine",
        category: "cost",
        onClick: () =>
          onAskSera(
            `Looking at my latest month, what 3 actions would push my best-performing utility into the top 10% of similar Mediterranean hotels?`,
          ),
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
    lastYearSame,
    onGoToLog,
    onGoToAnalyze,
    onAskSera,
    today,
  ]);

  // AI-suggested to-dos (persisted per period)
  const [aiPending, setAiPending] = React.useState(false);
  const [aiTodos, setAiTodos] = React.useState<AiTodo[]>([]);
  const [acceptedAiTodos, setAcceptedAiTodos] = React.useState<Record<string, AiTodo[]>>({});

  React.useEffect(() => {
    try {
      const raw = window.localStorage.getItem(AI_TODOS_STORAGE_KEY);
      if (raw) setAcceptedAiTodos(JSON.parse(raw));
    } catch {
      // ignore
    }
  }, []);

  const persistAccepted = React.useCallback((next: Record<string, AiTodo[]>) => {
    setAcceptedAiTodos(next);
    try {
      window.localStorage.setItem(AI_TODOS_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore quota
    }
  }, []);

  const acceptedForPeriod = acceptedAiTodos[periodKey] ?? [];

  const generateAiTodosFn = useServerFn(generateAiTodos);

  async function suggestAiTodos() {
    if (aiPending) return;
    setAiPending(true);
    try {
      const res = await generateAiTodosFn({
        data: { hotelId: getActiveHotelId() },
      });
      if (res.ok) {
        // Filter out already-accepted ones (case-insensitive title match)
        const acceptedTitles = new Set(
          acceptedForPeriod.map((t) => t.title.trim().toLowerCase()),
        );
        const fresh = res.todos.filter(
          (t) => !acceptedTitles.has(t.title.trim().toLowerCase()),
        );
        setAiTodos(fresh);
        if (fresh.length === 0) {
          toast.info("Sera couldn't find anything new — your list is already strong.");
        }
      } else {
        toast.error(res.error);
      }
    } catch {
      toast.error("Couldn't reach Sera. Please try again.");
    } finally {
      setAiPending(false);
    }
  }

  function acceptAiTodo(todo: AiTodo) {
    const next = {
      ...acceptedAiTodos,
      [periodKey]: [...acceptedForPeriod, todo],
    };
    persistAccepted(next);
    setAiTodos((prev) => prev.filter((t) => t.title !== todo.title));
    toast.success("Added to your list");
  }

  function dismissAiTodo(todo: AiTodo) {
    setAiTodos((prev) => prev.filter((t) => t.title !== todo.title));
  }

  // Convert accepted AI todos into TodoItems for the main list
  const aiAcceptedItems = React.useMemo<TodoItem[]>(() => {
    return acceptedForPeriod.map((t, i) => {
      const Icon = AI_CATEGORY_ICON[t.category] ?? Sparkles;
      return {
        id: `ai-${periodKey}-${i}-${t.title.slice(0, 12)}`,
        title: t.title,
        description: t.description,
        cta: "Ask Sera",
        icon: Icon,
        tone: t.tone,
        category: t.category,
        onClick: () => onAskSera(t.askSeraPrompt),
      };
    });
  }, [acceptedForPeriod, onAskSera, periodKey]);

  // Sort by priority order (urgent always first within its category bucket)
  const sortedTodos = React.useMemo<TodoItem[]>(() => {
    const toneRank: Record<TodoItem["tone"], number> = { urgent: 0, important: 1, routine: 2 };
    const catRank = (c: TodoCategory) => {
      const idx = priorityOrder.indexOf(c);
      return idx === -1 ? 99 : idx;
    };
    return [...baseTodos, ...aiAcceptedItems]
      .sort((a, b) => {
        // Always show urgent first regardless of priority preference
        if (a.tone === "urgent" && b.tone !== "urgent") return -1;
        if (b.tone === "urgent" && a.tone !== "urgent") return 1;
        const c = catRank(a.category) - catRank(b.category);
        if (c !== 0) return c;
        return toneRank[a.tone] - toneRank[b.tone];
      })
      .slice(0, 8);
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
                size="sm"
                className="h-8 gap-1.5 rounded-full border border-foreground/20 bg-foreground text-background shadow-sm hover:bg-foreground/90"
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

      {/* AI suggestions section */}
      <div className="mb-4 rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/5 via-primary/[0.03] to-transparent p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-secondary text-primary-foreground shadow-md">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-serif text-base font-semibold">AI suggestions</h3>
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
                  Sera
                </span>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {hotel?.name
                  ? `Personalised to-dos for ${hotel.name} based on this month's data and your peer position.`
                  : "Personalised to-dos based on this month's data and your peer position."}
                {cohortSize ? ` Cohort: ${cohortSize} similar hotels.` : ""}
              </p>
            </div>
          </div>
          <Button
            type="button"
            size="sm"
            onClick={() => void suggestAiTodos()}
            disabled={aiPending}
            className="rounded-full border border-foreground/20 bg-foreground text-background shadow-sm hover:bg-foreground/90 disabled:opacity-70"
          >
            {aiPending ? (
              <>
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                Sera is thinking…
              </>
            ) : (
              <>
                <Wand2 className="mr-1.5 h-3.5 w-3.5" />
                {aiTodos.length > 0 || acceptedForPeriod.length > 0
                  ? "Suggest more"
                  : "Suggest with AI"}
              </>
            )}
          </Button>
        </div>

        {aiTodos.length > 0 && (
          <ul className="mt-4 grid grid-cols-1 gap-2.5 md:grid-cols-2">
            {aiTodos.map((t, i) => {
              const Icon = AI_CATEGORY_ICON[t.category] ?? Sparkles;
              return (
                <li
                  key={`ai-suggestion-${i}-${t.title}`}
                  className="flex flex-col gap-2.5 rounded-xl border border-border/70 bg-card/80 p-3"
                >
                  <div className="flex items-start gap-2.5">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <h4 className="text-sm font-semibold leading-snug">
                          {t.title}
                        </h4>
                        <span className="rounded-full border border-border bg-card px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                          {CATEGORY_META[t.category].label}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{t.description}</p>
                      <div className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                        <Lightbulb className="h-3 w-3" />
                        {t.expectedImpact}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => dismissAiTodo(t)}
                      className="text-muted-foreground hover:text-foreground"
                      aria-label="Dismiss suggestion"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 border-t border-border/50 pt-2">
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => acceptAiTodo(t)}
                      className="h-7 rounded-full border border-foreground/20 bg-foreground px-3 text-xs text-background shadow-sm hover:bg-foreground/90"
                    >
                      <Plus className="mr-1 h-3 w-3" />
                      Add to my list
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => onAskSera(t.askSeraPrompt)}
                      className="h-7 rounded-full px-3 text-xs"
                    >
                      <MessageCircle className="mr-1 h-3 w-3" />
                      Ask Sera
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {aiTodos.length === 0 && acceptedForPeriod.length === 0 && !aiPending && (
          <p className="mt-3 text-xs text-muted-foreground">
            Tap <span className="font-medium text-foreground">Suggest with AI</span> for 3–4 specific actions tailored to this month, with expected impact and a one-click way to ask Sera for details.
          </p>
        )}
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
                className={`group flex flex-col gap-3 rounded-2xl border border-border/70 p-4 transition hover:bg-card/80 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4 ${toneStyles}`}
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
                  variant={done ? "ghost" : undefined}
                  onClick={todo.onClick}
                  className={
                    done
                      ? "w-full shrink-0 sm:w-auto"
                      : "w-full shrink-0 rounded-full border border-foreground/20 bg-foreground text-background shadow-sm hover:bg-foreground/90 sm:w-auto"
                  }
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

/* ---------- To-do completion insights ---------- */

// Friendly labels for known to-do IDs (matches TodosCard generators).
const TODO_LABELS: Record<string, string> = {
  "log-month": "Log this month's consumption",
  "missing-electricity_kwh": "Add electricity invoice",
  "missing-gas_kwh": "Add gas reading",
  "missing-water_m3": "Add water meter reading",
  "missing-waste_kg": "Add waste collection data",
  "missing-occupied_room_nights": "Confirm occupied room-nights",
  "investigate-worst": "Investigate worst-performing utility",
  "quarterly": "Review last quarter's trends",
  "attach-invoice": "Attach supporting invoices",
  "all-good": "Caught up — explored trends",
};

function humanizeTodoId(id: string): string {
  if (TODO_LABELS[id]) return TODO_LABELS[id];
  return id
    .replace(/^missing-/, "Add ")
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function TodoCompletionInsights({
  sorted,
  computeScore,
  computeScoreBreakdown,
}: {
  sorted: MonthlyEntry[];
  computeScore: (entry: MonthlyEntry | undefined) => number | null;
  computeScoreBreakdown: (entry: MonthlyEntry | undefined) => {
    score: number | null;
    parts: {
      key: string;
      label: string;
      unit: string;
      weight: number;
      sub: number | null;
      intensity: number | null;
      contribution: number;
    }[];
  };
}) {
  const [completionMap, setCompletionMap] = React.useState<Record<string, string[]>>({});
  const [selectedKey, setSelectedKey] = React.useState<string | null>(null);

  React.useEffect(() => {
    setCompletionMap(loadCompletionMap());
    const onStorage = (e: StorageEvent) => {
      if (e.key === COMPLETION_STORAGE_KEY) setCompletionMap(loadCompletionMap());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // Infer category from todo id (mirrors logic in TodosCard).
  const categorize = React.useCallback((id: string): TodoCategory => {
    if (id === "log-month") return "data";
    if (id === "missing-electricity_kwh" || id === "missing-gas_kwh") return "cost";
    if (id === "missing-water_m3" || id === "missing-occupied_room_nights") return "data";
    if (id === "missing-waste_kg") return "waste";
    if (id === "investigate-worst") return "cost";
    if (id === "quarterly" || id === "attach-invoice") return "compliance";
    return "data";
  }, []);

  const monthlyData = React.useMemo(() => {
    // Build last 6 months that have a logged entry, with score and completed-by-category.
    const recent = sorted.slice(-6);
    return recent.map((entry, idx, arr) => {
      const key = `${entry.year}-${String(entry.month).padStart(2, "0")}`;
      const ids = completionMap[key] ?? [];
      const counts: Record<TodoCategory, number> = { cost: 0, compliance: 0, waste: 0, data: 0 };
      const idsByCategory: Record<TodoCategory, string[]> = { cost: [], compliance: [], waste: [], data: [] };
      for (const id of ids) {
        const c = categorize(id);
        counts[c]++;
        idsByCategory[c].push(id);
      }
      const total = ids.length;
      const score = computeScore(entry);
      const prevEntry = idx > 0 ? arr[idx - 1] : undefined;
      const prevScore = computeScore(prevEntry);
      const delta =
        score !== null && prevScore !== null ? score - prevScore : null;
      return {
        key,
        label: `${MONTH_SHORT[entry.month - 1]} ${String(entry.year).slice(2)}`,
        fullLabel: `${MONTH_NAMES[entry.month - 1]} ${entry.year}`,
        score,
        delta,
        total,
        counts,
        idsByCategory,
        entry,
        prevEntry,
      };
    });
  }, [sorted, completionMap, categorize, computeScore]);

  const selectedMonth = React.useMemo(
    () => monthlyData.find((m) => m.key === selectedKey) ?? null,
    [monthlyData, selectedKey],
  );

  // Correlation: Pearson between completions count and score delta across months where both exist.
  const correlation = React.useMemo(() => {
    const pairs = monthlyData
      .map((m) => (m.delta !== null ? { x: m.total, y: m.delta } : null))
      .filter((p): p is { x: number; y: number } => p !== null);
    if (pairs.length < 3) return null;
    const n = pairs.length;
    const mx = pairs.reduce((s, p) => s + p.x, 0) / n;
    const my = pairs.reduce((s, p) => s + p.y, 0) / n;
    let num = 0;
    let dx2 = 0;
    let dy2 = 0;
    for (const p of pairs) {
      const dx = p.x - mx;
      const dy = p.y - my;
      num += dx * dy;
      dx2 += dx * dx;
      dy2 += dy * dy;
    }
    const denom = Math.sqrt(dx2 * dy2);
    if (denom === 0) return null;
    return num / denom;
  }, [monthlyData]);

  const totalCompleted = monthlyData.reduce((s, m) => s + m.total, 0);
  const totalsByCategory = React.useMemo(() => {
    const acc: Record<TodoCategory, number> = { cost: 0, compliance: 0, waste: 0, data: 0 };
    for (const m of monthlyData) {
      (Object.keys(acc) as TodoCategory[]).forEach((k) => (acc[k] += m.counts[k]));
    }
    return acc;
  }, [monthlyData]);

  const topCategory = (Object.entries(totalsByCategory) as [TodoCategory, number][])
    .sort((a, b) => b[1] - a[1])[0];

  const correlationLabel = (() => {
    if (correlation === null) return null;
    const abs = Math.abs(correlation);
    const strength = abs >= 0.6 ? "strong" : abs >= 0.3 ? "moderate" : "weak";
    const direction = correlation > 0 ? "positive" : correlation < 0 ? "negative" : "no";
    return { strength, direction, value: correlation };
  })();

  const maxTotal = Math.max(1, ...monthlyData.map((m) => m.total));

  // Color tokens per category — reuse chart palette
  const catColor: Record<TodoCategory, string> = {
    cost: "var(--chart-3)",
    compliance: "var(--chart-1)",
    waste: "var(--chart-5)",
    data: "var(--chart-2)",
  };

  if (monthlyData.length === 0) return null;

  return (
    <>
    <Card className="rounded-3xl border-border/70 p-6">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/30 text-accent-foreground">
              <BarChart3 className="h-4 w-4" />
            </div>
            <h2 className="font-serif text-xl font-semibold">To-do impact</h2>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            How completed actions correlate with your sustainability score.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="rounded-full border border-border bg-muted/40 px-3 py-1 text-xs text-muted-foreground">
            {totalCompleted} completed · last {monthlyData.length} months
          </div>
          {topCategory && topCategory[1] > 0 && (
            <div className="rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground">
              Most focus: <span className="font-medium text-foreground">{CATEGORY_META[topCategory[0]].label}</span>
            </div>
          )}
        </div>
      </div>

      {totalCompleted === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card/50 p-6 text-sm text-muted-foreground">
          Tick off to-dos as you complete them — this panel will show how your actions move your score.
        </div>
      ) : (
        <>
          {/* Per-month stacked bars + score delta */}
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-6">
            {monthlyData.map((m) => {
              const heightPct = (m.total / maxTotal) * 100;
              const deltaTone =
                m.delta === null
                  ? "text-muted-foreground"
                  : m.delta > 0
                    ? "text-primary"
                    : m.delta < 0
                      ? "text-destructive"
                      : "text-muted-foreground";
              return (
                <li
                  key={m.key}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedKey(m.key)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setSelectedKey(m.key);
                    }
                  }}
                  aria-label={`View ${m.fullLabel} to-do breakdown`}
                  className="group flex w-full cursor-pointer flex-col items-stretch gap-2 rounded-2xl border border-border/70 bg-card/40 p-3 text-left transition hover:bg-card hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div className="flex items-baseline justify-between">
                    <span className="text-xs font-medium text-foreground">{m.label}</span>
                    <span className="text-[11px] text-muted-foreground">
                      {m.total} done
                    </span>
                  </div>

                  <div className="relative h-20 w-full overflow-hidden rounded-lg bg-muted/40">
                    {m.total > 0 && (
                      <div
                        className="absolute inset-x-0 bottom-0 flex flex-col"
                        style={{ height: `${Math.max(8, heightPct)}%` }}
                      >
                        {(["cost", "compliance", "waste", "data"] as TodoCategory[]).map((c) => {
                          const share = m.counts[c] / m.total;
                          if (share === 0) return null;
                          return (
                            <div
                              key={c}
                              style={{
                                height: `${share * 100}%`,
                                backgroundColor: catColor[c],
                              }}
                              title={`${CATEGORY_META[c].label}: ${m.counts[c]}`}
                            />
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-muted-foreground">
                      Score {m.score ?? "—"}
                    </span>
                    <span className={`font-medium ${deltaTone}`}>
                      {m.delta === null
                        ? "—"
                        : m.delta > 0
                          ? `+${m.delta}`
                          : m.delta === 0
                            ? "±0"
                            : m.delta}
                    </span>
                  </div>
                  <span className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground/70 opacity-0 transition group-hover:opacity-100">
                    Click for details →
                  </span>
                </li>
              );
            })}
          </ul>

          {/* Legend */}
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-muted-foreground">
            {(["cost", "compliance", "waste", "data"] as TodoCategory[]).map((c) => (
              <div key={c} className="flex items-center gap-1.5">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-sm"
                  style={{ backgroundColor: catColor[c] }}
                />
                <span>{CATEGORY_META[c].label}</span>
                <span className="text-muted-foreground/70">({totalsByCategory[c]})</span>
              </div>
            ))}
          </div>

          {/* Correlation summary */}
          {correlationLabel && (
            <div className="mt-4 flex items-start gap-3 rounded-2xl border border-border/70 bg-accent/10 p-4">
              <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-accent-foreground" />
              <div className="text-sm">
                <p className="text-foreground">
                  <span className="font-medium">{correlationLabel.strength} {correlationLabel.direction} correlation</span>
                  {" "}between to-dos completed and score change
                  <span className="ml-1 text-muted-foreground">
                    (r = {correlationLabel.value.toFixed(2)})
                  </span>
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {correlationLabel.direction === "positive"
                    ? "Months with more completed actions tend to see your score rise — keep checking them off."
                    : correlationLabel.direction === "negative"
                      ? "Score moved opposite to completion — external factors (occupancy, season) may be dominating. Ask Sera for a deeper look."
                      : "No clear link yet — log a few more months to see the pattern emerge."}
                </p>
              </div>
            </div>
          )}
        </>
      )}
    </Card>

    <Dialog open={!!selectedKey} onOpenChange={(o) => !o && setSelectedKey(null)}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        {selectedMonth && (() => {
          const breakdown = computeScoreBreakdown(selectedMonth.entry);
          const prevBreakdown = computeScoreBreakdown(selectedMonth.prevEntry);
          const subDeltas = breakdown.parts.map((p, i) => {
            const prev = prevBreakdown.parts[i];
            const subDelta =
              p.sub !== null && prev?.sub !== null && prev?.sub !== undefined
                ? p.sub - prev.sub
                : null;
            const contribDelta =
              prev !== undefined ? (p.contribution - prev.contribution) * (1 / 1) : 0;
            return { ...p, prevSub: prev?.sub ?? null, subDelta, contribDelta };
          });
          const orderedCats: TodoCategory[] = ["cost", "compliance", "waste", "data"];
          return (
            <>
              <DialogHeader>
                <DialogTitle className="font-serif text-2xl">
                  {selectedMonth.fullLabel}
                </DialogTitle>
                <DialogDescription>
                  {selectedMonth.total} to-do{selectedMonth.total !== 1 ? "s" : ""} completed
                  {selectedMonth.score !== null ? ` · score ${selectedMonth.score}` : ""}
                  {selectedMonth.delta !== null
                    ? ` (${selectedMonth.delta > 0 ? "+" : ""}${selectedMonth.delta} vs previous)`
                    : ""}
                </DialogDescription>
              </DialogHeader>

              {/* Completed to-dos by category */}
              <section className="mt-2 space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Completed actions by category
                </h3>
                {selectedMonth.total === 0 ? (
                  <div className="rounded-xl border border-dashed border-border bg-card/40 p-4 text-sm text-muted-foreground">
                    No to-dos completed for this month.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {orderedCats
                      .filter((c) => selectedMonth.idsByCategory[c].length > 0)
                      .map((c) => {
                        const ids = selectedMonth.idsByCategory[c];
                        const meta = CATEGORY_META[c];
                        const Icon = meta.icon;
                        return (
                          <div
                            key={c}
                            className="rounded-xl border border-border bg-card p-3"
                          >
                            <div className="mb-2 flex items-center gap-2">
                              <span
                                className="inline-block h-2.5 w-2.5 rounded-sm"
                                style={{ backgroundColor: catColor[c] }}
                              />
                              <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                              <span className="text-sm font-medium">{meta.label}</span>
                              <span className="ml-auto text-xs text-muted-foreground">
                                {ids.length} done
                              </span>
                            </div>
                            <ul className="space-y-1.5 pl-1">
                              {ids.map((id) => (
                                <li
                                  key={id}
                                  className="flex items-start gap-2 text-sm text-foreground"
                                >
                                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                                  <span>{humanizeTodoId(id)}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        );
                      })}
                  </div>
                )}
              </section>

              {/* Score delta breakdown */}
              <section className="mt-5 space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Score breakdown
                </h3>
                {selectedMonth.score === null ? (
                  <div className="rounded-xl border border-dashed border-border bg-card/40 p-4 text-sm text-muted-foreground">
                    Not enough data this month to compute a score.
                  </div>
                ) : (
                  <div className="overflow-hidden rounded-xl border border-border">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/40 text-xs text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium">Utility</th>
                          <th className="px-3 py-2 text-right font-medium">Weight</th>
                          <th className="px-3 py-2 text-right font-medium">Sub-score</th>
                          <th className="px-3 py-2 text-right font-medium">vs prev</th>
                          <th className="px-3 py-2 text-right font-medium">Weighted Δ</th>
                        </tr>
                      </thead>
                      <tbody>
                        {subDeltas.map((p) => {
                          const tone =
                            p.subDelta === null
                              ? "text-muted-foreground"
                              : p.subDelta > 0
                                ? "text-primary"
                                : p.subDelta < 0
                                  ? "text-destructive"
                                  : "text-muted-foreground";
                          const wDelta = (p.subDelta ?? 0) * p.weight;
                          return (
                            <tr key={p.key} className="border-t border-border">
                              <td className="px-3 py-2 font-medium text-foreground">
                                {p.label}
                              </td>
                              <td className="px-3 py-2 text-right text-muted-foreground">
                                {Math.round(p.weight * 100)}%
                              </td>
                              <td className="px-3 py-2 text-right">
                                {p.sub ?? "—"}
                              </td>
                              <td className={`px-3 py-2 text-right font-medium ${tone}`}>
                                {p.subDelta === null
                                  ? "—"
                                  : p.subDelta > 0
                                    ? `+${p.subDelta}`
                                    : p.subDelta === 0
                                      ? "±0"
                                      : p.subDelta}
                              </td>
                              <td className={`px-3 py-2 text-right ${tone}`}>
                                {p.subDelta === null
                                  ? "—"
                                  : `${wDelta > 0 ? "+" : ""}${wDelta.toFixed(1)}`}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot className="bg-muted/40">
                        <tr>
                          <td className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground" colSpan={3}>
                            Total score change
                          </td>
                          <td
                            colSpan={2}
                            className={`px-3 py-2 text-right font-semibold ${
                              selectedMonth.delta === null
                                ? "text-muted-foreground"
                                : selectedMonth.delta > 0
                                  ? "text-primary"
                                  : selectedMonth.delta < 0
                                    ? "text-destructive"
                                    : "text-muted-foreground"
                            }`}
                          >
                            {selectedMonth.delta === null
                              ? "—"
                              : selectedMonth.delta > 0
                                ? `+${selectedMonth.delta}`
                                : selectedMonth.delta === 0
                                  ? "±0"
                                  : selectedMonth.delta}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  Each utility's sub-score (0–100) reflects your intensity per occupied
                  room-night vs similar hotels. Weighted Δ shows how much each utility moved
                  the overall score this month.
                </p>
              </section>
            </>
          );
        })()}
      </DialogContent>
    </Dialog>
    </>
  );
}

const REGION_OPTIONS = [
  "Mediterranean",
  "Northern Europe",
  "Central Europe",
  "Southern Europe",
  "Middle East",
  "Asia Pacific",
  "North America",
  "Latin America",
  "Africa",
];
const CLIMATE_OPTIONS = ["Mediterranean", "Tropical", "Continental", "Arid", "Temperate", "Alpine"];
const SIZE_BANDS = ["<50", "50-100", "100-150", "150-250", "250+"];
const STAR_OPTIONS = [3, 4, 5];

interface SettingsChange {
  id: string;
  hotel_id: string;
  changed_by: string | null;
  field: string;
  old_value: string | null;
  new_value: string | null;
  created_at: string;
}

const FIELD_LABELS: Record<string, string> = {
  name: "Hotel name",
  rooms: "Number of rooms",
  region: "Region",
  star_rating: "Star rating",
  climate_zone: "Climate zone",
  size_band: "Size band",
  total_surface_m2: "Total surface (m²)",
  year_built: "Year built",
  floors: "Floors",
  property_type: "Property type",
};

const PROPERTY_TYPES = [
  "Resort",
  "Boutique",
  "Business",
  "City hotel",
  "Bed & breakfast",
  "Eco-lodge",
];

const CHANGED_BY_KEY = "ra-plus-changed-by";

function formatChangeValue(field: string, value: string | null): string {
  if (value === null || value === "") return "—";
  if (field === "star_rating") return `${value} stars`;
  return value;
}

function formatChangedAt(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function HotelSettingsPanel({
  hotel,
  onSaved,
}: {
  hotel: Hotel | null;
  onSaved: () => Promise<void>;
}) {
  const [name, setName] = React.useState("");
  const [rooms, setRooms] = React.useState<string>("");
  const [region, setRegion] = React.useState("");
  const [starRating, setStarRating] = React.useState<number>(4);
  const [climateZone, setClimateZone] = React.useState("");
  const [sizeBand, setSizeBand] = React.useState("");
  const [totalSurface, setTotalSurface] = React.useState<string>("");
  const [yearBuilt, setYearBuilt] = React.useState<string>("");
  const [floors, setFloors] = React.useState<string>("");
  const [propertyType, setPropertyType] = React.useState("");
  const [changedBy, setChangedBy] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [changes, setChanges] = React.useState<SettingsChange[]>([]);
  const [logLoading, setLogLoading] = React.useState(false);
  // The form is read-only by default; user must explicitly unlock to edit.
  const [locked, setLocked] = React.useState(true);

  React.useEffect(() => {
    if (hotel) {
      setName(hotel.name ?? "");
      setRooms(String(hotel.rooms ?? ""));
      setRegion(hotel.region ?? "");
      setStarRating(hotel.star_rating ?? 4);
      setClimateZone(hotel.climate_zone ?? "");
      setSizeBand(hotel.size_band ?? "");
      setTotalSurface(hotel.total_surface_m2 != null ? String(hotel.total_surface_m2) : "");
      setYearBuilt(hotel.year_built != null ? String(hotel.year_built) : "");
      setFloors(hotel.floors != null ? String(hotel.floors) : "");
      setPropertyType(hotel.property_type ?? "");
      // Re-lock whenever the active hotel changes
      setLocked(true);
    }
  }, [hotel?.id]);

  // Restore "changed by" name from localStorage
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = window.localStorage.getItem(CHANGED_BY_KEY);
      if (stored) setChangedBy(stored);
    } catch {
      // ignore
    }
  }, []);

  const loadChanges = React.useCallback(async (hotelId: string) => {
    setLogLoading(true);
    const { data } = await supabase
      .from("hotel_settings_changes")
      .select("*")
      .eq("hotel_id", hotelId)
      .order("created_at", { ascending: false })
      .limit(100);
    setChanges((data as SettingsChange[]) ?? []);
    setLogLoading(false);
  }, []);

  React.useEffect(() => {
    if (hotel?.id) void loadChanges(hotel.id);
  }, [hotel?.id, loadChanges]);

  if (!hotel) {
    return (
      <Card className="rounded-3xl border-border/70 p-8">
        <div className="h-6 w-48 animate-pulse rounded-md bg-muted" />
        <div className="mt-4 h-4 w-72 animate-pulse rounded-md bg-muted" />
      </Card>
    );
  }

  const roomsNum = Number(rooms);
  const surfaceNum = totalSurface === "" ? null : Number(totalSurface);
  const yearNum = yearBuilt === "" ? null : Number(yearBuilt);
  const floorsNum = floors === "" ? null : Number(floors);
  const isValid =
    name.trim().length > 0 &&
    Number.isFinite(roomsNum) &&
    roomsNum > 0 &&
    sizeBand.trim().length > 0 &&
    propertyType.trim().length > 0 &&
    (surfaceNum === null || (Number.isFinite(surfaceNum) && surfaceNum > 0)) &&
    (yearNum === null || (Number.isFinite(yearNum) && yearNum >= 1800 && yearNum <= new Date().getFullYear())) &&
    (floorsNum === null || (Number.isFinite(floorsNum) && floorsNum > 0));

  async function onSave() {
    if (!isValid || !hotel) return;
    setSaving(true);

    // Build a diff between current hotel values and the form
    const next = {
      name: name.trim(),
      rooms: roomsNum,
      size_band: sizeBand,
      total_surface_m2: surfaceNum,
      year_built: yearNum,
      floors: floorsNum,
      property_type: propertyType,
    };
    const current: Record<string, string> = {
      name: String(hotel.name ?? ""),
      rooms: String(hotel.rooms ?? ""),
      size_band: String(hotel.size_band ?? ""),
      total_surface_m2: hotel.total_surface_m2 != null ? String(hotel.total_surface_m2) : "",
      year_built: hotel.year_built != null ? String(hotel.year_built) : "",
      floors: hotel.floors != null ? String(hotel.floors) : "",
      property_type: String(hotel.property_type ?? ""),
    };
    const nextStr: Record<string, string> = {
      name: next.name,
      rooms: String(next.rooms),
      size_band: next.size_band,
      total_surface_m2: surfaceNum != null ? String(surfaceNum) : "",
      year_built: yearNum != null ? String(yearNum) : "",
      floors: floorsNum != null ? String(floorsNum) : "",
      property_type: next.property_type,
    };
    const diffs = Object.keys(nextStr).filter(
      (k) => current[k] !== nextStr[k],
    );

    const { error } = await supabase
      .from("hotels")
      .update(next)
      .eq("id", hotel.id);

    if (error) {
      setSaving(false);
      toast.error("Could not save hotel settings");
      return;
    }

    // Persist "changed by" for next time and write change-log rows
    const author = changedBy.trim() || "Anonymous";
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(CHANGED_BY_KEY, author);
      } catch {
        // ignore
      }
    }

    if (diffs.length > 0) {
      const rows = diffs.map((field) => ({
        hotel_id: hotel.id,
        changed_by: author,
        field,
        old_value: current[field] || null,
        new_value: nextStr[field] || null,
      }));
      const { error: logError } = await supabase
        .from("hotel_settings_changes")
        .insert(rows);
      if (logError) {
        toast.error("Saved settings, but couldn't record change log entry");
      }
      await loadChanges(hotel.id);
    }

    setSaving(false);
    setLocked(true);
    toast.success(
      diffs.length > 0
        ? `Saved · ${diffs.length} change${diffs.length === 1 ? "" : "s"} recorded`
        : "No changes to save",
    );
    await onSaved();
  }

  function onReset() {
    if (!hotel) return;
    setName(hotel.name);
    setRooms(String(hotel.rooms));
    setRegion(hotel.region);
    setStarRating(hotel.star_rating);
    setClimateZone(hotel.climate_zone);
    setSizeBand(hotel.size_band);
    setTotalSurface(hotel.total_surface_m2 != null ? String(hotel.total_surface_m2) : "");
    setYearBuilt(hotel.year_built != null ? String(hotel.year_built) : "");
    setFloors(hotel.floors != null ? String(hotel.floors) : "");
    setPropertyType(hotel.property_type ?? "");
    setLocked(true);
  }

  return (
    <div className="space-y-6">
      <Card className="rounded-3xl border-border/70 p-8">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h2 className="font-serif text-2xl font-semibold text-foreground">
              Hotel settings
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Update your property profile. These values shape your benchmarks
              and per-room intensity calculations.
            </p>
            {locked && (
              <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <Lock className="h-3 w-3" />
                Read-only — click <span className="font-medium text-foreground">Edit</span> to make changes.
              </p>
            )}
          </div>
          {locked ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setLocked(false)}
              className="shrink-0"
            >
              <Unlock className="mr-2 h-4 w-4" />
              Edit
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                onReset();
              }}
              className="shrink-0 text-muted-foreground"
              disabled={saving}
            >
              <Lock className="mr-2 h-4 w-4" />
              Lock
            </Button>
          )}
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="hotel-name" className="mb-1.5 block text-xs uppercase tracking-wider text-muted-foreground">
              Hotel name
            </Label>
            <Input
              id="hotel-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Hotel Aurora"
              disabled={locked}
            />
          </div>

          <div>
            <Label htmlFor="hotel-rooms" className="mb-1.5 block text-xs uppercase tracking-wider text-muted-foreground">
              Number of rooms
            </Label>
            <Input
              id="hotel-rooms"
              type="number"
              min={1}
              value={rooms}
              onChange={(e) => setRooms(e.target.value)}
              placeholder="120"
              disabled={locked}
            />
          </div>

          <div>
            <Label htmlFor="hotel-surface" className="mb-1.5 block text-xs uppercase tracking-wider text-muted-foreground">
              Total surface (m²)
            </Label>
            <Input
              id="hotel-surface"
              type="number"
              min={1}
              value={totalSurface}
              onChange={(e) => setTotalSurface(e.target.value)}
              placeholder="8500"
              disabled={locked}
            />
          </div>

          <div>
            <Label htmlFor="hotel-year" className="mb-1.5 block text-xs uppercase tracking-wider text-muted-foreground">
              Year built
            </Label>
            <Input
              id="hotel-year"
              type="number"
              min={1800}
              max={new Date().getFullYear()}
              value={yearBuilt}
              onChange={(e) => setYearBuilt(e.target.value)}
              placeholder="1998"
              disabled={locked}
            />
          </div>

          <div>
            <Label htmlFor="hotel-floors" className="mb-1.5 block text-xs uppercase tracking-wider text-muted-foreground">
              Floors
            </Label>
            <Input
              id="hotel-floors"
              type="number"
              min={1}
              value={floors}
              onChange={(e) => setFloors(e.target.value)}
              placeholder="6"
              disabled={locked}
            />
          </div>

          <div>
            <Label className="mb-1.5 block text-xs uppercase tracking-wider text-muted-foreground">
              Property type
            </Label>
            <Select value={propertyType} onValueChange={setPropertyType} disabled={locked}>
              <SelectTrigger>
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                {PROPERTY_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="mb-1.5 block text-xs uppercase tracking-wider text-muted-foreground">
              Size band (rooms)
            </Label>
            <Select value={sizeBand} onValueChange={setSizeBand} disabled={locked}>
              <SelectTrigger>
                <SelectValue placeholder="Select size band" />
              </SelectTrigger>
              <SelectContent>
                {SIZE_BANDS.map((b) => (
                  <SelectItem key={b} value={b}>
                    {b}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {!locked && (
          <div className="mt-8 flex flex-wrap items-center justify-end gap-2 border-t border-border pt-5">
            <Button variant="ghost" onClick={onReset} disabled={saving}>
              <RotateCcw className="mr-2 h-4 w-4" />
              Reset
            </Button>
            <Button onClick={onSave} disabled={!isValid || saving}>
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving…
                </>
              ) : (
                "Save changes"
              )}
            </Button>
          </div>
        )}
      </Card>

      <Card className="rounded-2xl border-dashed bg-card/50 p-5 text-sm text-muted-foreground">
        <strong className="text-foreground">Heads up.</strong> Changing rooms,
        surface, property type or size band will recompute your peer benchmarks
        and per-room-night intensity figures across the workspace.
      </Card>

      {/* Change log */}
      <Card className="rounded-3xl border-border/70 p-8">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h3 className="font-serif text-xl font-semibold text-foreground">
              Change log
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Every edit to your hotel profile, with who made it and when.
            </p>
          </div>
          <History className="h-5 w-5 text-muted-foreground" />
        </div>

        {logLoading ? (
          <div className="space-y-2">
            <div className="h-10 animate-pulse rounded-md bg-muted" />
            <div className="h-10 animate-pulse rounded-md bg-muted" />
            <div className="h-10 animate-pulse rounded-md bg-muted" />
          </div>
        ) : changes.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/70 bg-muted/30 px-5 py-8 text-center text-sm text-muted-foreground">
            No changes yet. Edits to this hotel's profile will appear here.
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 text-left font-medium">When</th>
                  <th className="px-4 py-2.5 text-left font-medium">Who</th>
                  <th className="px-4 py-2.5 text-left font-medium">Field</th>
                  <th className="px-4 py-2.5 text-left font-medium">From</th>
                  <th className="px-4 py-2.5 text-left font-medium">To</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {changes.map((c) => (
                  <tr key={c.id} className="hover:bg-muted/30">
                    <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground">
                      {formatChangedAt(c.created_at)}
                    </td>
                    <td className="px-4 py-2.5 text-foreground">
                      {c.changed_by || "Anonymous"}
                    </td>
                    <td className="px-4 py-2.5 text-foreground">
                      {FIELD_LABELS[c.field] ?? c.field}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground line-through decoration-muted-foreground/40">
                      {formatChangeValue(c.field, c.old_value)}
                    </td>
                    <td className="px-4 py-2.5 font-medium text-foreground">
                      {formatChangeValue(c.field, c.new_value)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
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
    <Card id={`kpi-${kpi.key}`} className="group relative scroll-mt-24 overflow-hidden rounded-2xl border-border/70 p-5 transition hover:shadow-lg target:ring-2 target:ring-primary/60">
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
  hotel,
  highlightFields = [],
  onHighlightConsumed,
}: {
  entries: MonthlyEntry[];
  isCurrentLogged: boolean;
  onSaved: () => void;
  sorted: MonthlyEntry[];
  rooms: number;
  hotel: Hotel;
  highlightFields?: HighlightedField[];
  onHighlightConsumed?: () => void;
}) {
  const [method, setMethod] = React.useState<
    "manual" | "survey" | "import" | "smart" | "voice" | "autopilot"
  >("autopilot");

  // When highlighted fields arrive, force-switch to manual entry so user sees them.
  React.useEffect(() => {
    if (highlightFields.length > 0 && method !== "manual") {
      setMethod("manual");
    }
  }, [highlightFields, method]);

  const METHODS: {
    key: "manual" | "survey" | "import" | "smart" | "voice" | "autopilot";
    label: string;
    desc: string;
    icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
    badge?: string;
  }[] = [
    { key: "autopilot", label: "Sera Autopilot", desc: "Sera predicts each value from your history and asks one quick question — usually just say 'yes'", icon: Plane, badge: "New" },
    { key: "voice", label: "Voice journal", desc: "Just talk — Sera transcribes, normalises units and turns your sentence into rows", icon: Mic },
    { key: "smart", label: "Smart data input", desc: "Paste an email, a sentence, or a screenshot — Sera turns it into clean rows", icon: Sparkles },
    { key: "import", label: "Guided invoice upload", desc: "Snap a bill, Sera reads and saves it", icon: FileSpreadsheet },
    { key: "manual", label: "Manual entry", desc: "Type values from your bills", icon: Pencil },
    { key: "survey", label: "Guided survey", desc: "Step-by-step questions", icon: ClipboardList },
  ];

  return (
    <div className="space-y-8">
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
                  <div className="flex items-center gap-2">
                    <div className="text-sm font-semibold">{m.label}</div>
                    {m.badge && (
                      <span className="rounded-full bg-gradient-to-r from-primary to-secondary px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-primary-foreground">
                        {m.badge}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">{m.desc}</div>
                </div>
                <ChevronRight
                  className={`h-4 w-4 ${active ? "text-primary" : "text-muted-foreground"}`}
                />
              </button>
            );
          })}
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
          {method === "import" && (
            <InvoiceUploadCard entries={entries} onSaved={onSaved} />
          )}
          {method === "smart" && (
            <SmartPasteCard entries={entries} onSaved={onSaved} />
          )}
          {method === "voice" && (
            <VoiceLogCard entries={entries} onSaved={onSaved} />
          )}
          {method === "autopilot" && (
            <AutopilotLogCard entries={entries} onSaved={onSaved} />
          )}
        </div>
      </div>

      {/* Data activity & history — accessible via scroll */}
      <div>
        <PastDataActivity entries={sorted} hotel={hotel} onChanged={onSaved} />
      </div>
    </div>
  );
}

/* PastDataSection has been replaced by PastDataActivity (see src/components/past-data-activity.tsx) */

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
          hotel_id: getActiveHotelId(),
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
  metricType: string;
  category: string;
  scope: string;
  question: string;
  helper: string;
  unit: string;
  unitLabel: string;
  source: string;
  examples: { label: string; value: string }[];
  subTypes?: string[];
  tip?: string;
  conversions?: { from: string; to: string; factor: string }[];
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
    metricType: "Energy · Electricity",
    category: "Purchased grid electricity",
    scope: "GHG Scope 2",
    question: "How much electricity did the property consume?",
    helper: "Sum every electricity meter (main building, annexes, EV chargers).",
    unit: "kWh",
    unitLabel: "kilowatt-hours",
    source: "Find it on your utility invoice under “Total energy used” or “Consumption (kWh)”.",
    examples: [
      { label: "Boutique hotel · 40 rooms", value: "≈ 28,000 kWh / month" },
      { label: "Mid-size hotel · 120 rooms", value: "≈ 95,000 kWh / month" },
      { label: "Resort · 250 rooms + spa", value: "≈ 240,000 kWh / month" },
    ],
    tip: "If your bill shows MWh, multiply by 1,000.",
    conversions: [
      { from: "1 MWh", to: "kWh", factor: "× 1,000" },
      { from: "1 GWh", to: "kWh", factor: "× 1,000,000" },
    ],
    icon: Bolt,
    color: "var(--chart-3)",
  },
  {
    key: "gas_kwh",
    metricType: "Energy · Natural gas",
    category: "On-site fuel combustion",
    scope: "GHG Scope 1",
    question: "How much natural gas was burned on-site?",
    helper: "Boilers, kitchens, laundry, pool heating — combine all gas meters.",
    unit: "kWh",
    unitLabel: "kilowatt-hours",
    source: "Most invoices show kWh directly. If shown in m³, multiply by 10.55. If in therms, multiply by 29.3.",
    examples: [
      { label: "No on-site gas (all-electric)", value: "0 kWh" },
      { label: "Hotel with gas boiler", value: "≈ 18,000 kWh / month" },
      { label: "Hotel + heated pool & laundry", value: "≈ 60,000 kWh / month" },
    ],
    tip: "Leave at 0 if your property is fully electric.",
    conversions: [
      { from: "1 m³ natural gas", to: "kWh", factor: "× 10.55" },
      { from: "1 therm", to: "kWh", factor: "× 29.3" },
      { from: "1 MWh", to: "kWh", factor: "× 1,000" },
    ],
    icon: Flame,
    color: "var(--chart-1)",
  },
  {
    key: "water_m3",
    metricType: "Water · Potable",
    category: "Municipal water withdrawal",
    scope: "Resource use",
    question: "How much water did the property withdraw?",
    helper: "Cubic metres from your water utility bill (1 m³ = 1,000 litres).",
    unit: "m³",
    unitLabel: "cubic metres",
    source: "Look for “Consommation” / “Volume facturé” on the water invoice.",
    examples: [
      { label: "City hotel · 80 rooms", value: "≈ 420 m³ / month" },
      { label: "Hotel with spa & pool", value: "≈ 950 m³ / month" },
      { label: "Resort · 250 rooms + irrigation", value: "≈ 2,400 m³ / month" },
    ],
    tip: "If your bill is in litres, divide by 1,000.",
    conversions: [
      { from: "1,000 L", to: "m³", factor: "÷ 1,000" },
      { from: "1 US gallon", to: "m³", factor: "× 0.003785" },
      { from: "1 ft³", to: "m³", factor: "× 0.02832" },
    ],
    icon: Droplets,
    color: "var(--chart-2)",
  },
  {
    key: "waste_kg",
    metricType: "Waste · All streams",
    category: "Operational waste generated",
    scope: "Scope 3 · Category 5",
    question: "How much waste was collected this month?",
    helper: "Add up every waste stream the hauler picked up — in kilograms.",
    unit: "kg",
    unitLabel: "kilograms",
    source: "Use your waste collection invoices or hauler manifests (weight tickets).",
    subTypes: [
      "Mixed / general waste",
      "Food & organic waste",
      "Paper & cardboard",
      "Glass",
      "Plastic & metal packaging",
      "Hazardous (batteries, oils, e-waste)",
    ],
    examples: [
      { label: "Boutique hotel · 40 rooms", value: "≈ 850 kg / month" },
      { label: "Mid-size hotel · 120 rooms", value: "≈ 3,100 kg / month" },
      { label: "Resort with F&B outlets", value: "≈ 7,500 kg / month" },
    ],
    tip: "1 m³ of mixed waste ≈ 100 kg. 1 standard 240 L bin ≈ 25 kg.",
    conversions: [
      { from: "1 tonne", to: "kg", factor: "× 1,000" },
      { from: "1 lb", to: "kg", factor: "× 0.4536" },
      { from: "1 m³ mixed waste", to: "kg", factor: "≈ × 100" },
      { from: "1 × 240 L bin", to: "kg", factor: "≈ × 25" },
    ],
    icon: Trash2,
    color: "var(--chart-5)",
  },
  {
    key: "occupied_room_nights",
    metricType: "Activity · Occupancy",
    category: "Normalisation denominator",
    scope: "Operational metric",
    question: "How many occupied room-nights this month?",
    helper: "One room sold for one night = 1 room-night. Used to compare against peers.",
    unit: "rn",
    unitLabel: "room-nights",
    source: "Pull from your PMS occupancy report (e.g. Opera, Mews, Cloudbeds).",
    examples: [
      { label: "80 rooms · 65% occupancy · 30 days", value: "≈ 1,560 room-nights" },
      { label: "120 rooms · 75% occupancy · 31 days", value: "≈ 2,790 room-nights" },
      { label: "250 rooms · 80% occupancy · 30 days", value: "≈ 6,000 room-nights" },
    ],
    tip: "Formula: rooms × occupancy % × nights in the month.",
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
          hotel_id: getActiveHotelId(),
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
          <div className="flex items-start gap-3">
            <div
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl"
              style={{ backgroundColor: `color-mix(in oklab, ${current.color} 15%, transparent)` }}
            >
              <Icon className="h-6 w-6" style={{ color: current.color }} />
            </div>
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className="rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider"
                  style={{
                    backgroundColor: `color-mix(in oklab, ${current.color} 15%, transparent)`,
                    color: current.color,
                  }}
                >
                  {current.metricType}
                </span>
                <span className="rounded-full border border-border px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                  {current.scope}
                </span>
              </div>
              <div className="mt-2 font-serif text-lg font-semibold leading-snug">
                {current.question}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">{current.helper}</div>
            </div>
          </div>

          <div className="mt-4 grid gap-3 rounded-2xl border border-border/70 bg-background/50 p-4 sm:grid-cols-2">
            <div>
              <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Billing period
              </div>
              <div className="mt-1 text-sm font-medium">
                {(() => {
                  const last = new Date(initial.y, initial.m, 0).getDate();
                  const mm = String(initial.m).padStart(2, "0");
                  return `${initial.y}-${mm}-01 → ${initial.y}-${mm}-${String(last).padStart(2, "0")}`;
                })()}
              </div>
              <div className="mt-0.5 text-[11px] text-muted-foreground">
                {MONTH_NAMES[initial.m - 1]} {initial.y} · full month
              </div>
            </div>
            <div>
              <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Where to find it
              </div>
              <div className="mt-1 text-xs leading-relaxed text-foreground/80">
                {current.source}
              </div>
            </div>
          </div>

          {current.subTypes && (
            <div className="mt-3 rounded-2xl border border-dashed border-border/70 p-3">
              <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Include all waste streams
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {current.subTypes.map((s) => (
                  <span
                    key={s}
                    className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-foreground/80"
                  >
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="mt-4">
            <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Typical values for reference
            </div>
            <div className="mt-2 grid gap-1.5">
              {current.examples.map((ex) => (
                <button
                  key={ex.label}
                  type="button"
                  onClick={() => {
                    const match = ex.value.match(/[\d,]+(?:\.\d+)?/);
                    if (match) {
                      const num = match[0].replace(/,/g, "");
                      setForm((s) => ({ ...s, [current.key]: num }));
                    }
                  }}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-background/40 px-3 py-2 text-left text-xs transition hover:border-primary/50 hover:bg-primary/5"
                >
                  <span className="text-muted-foreground">{ex.label}</span>
                  <span className="font-medium text-foreground">{ex.value}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4 flex items-center gap-3 rounded-xl border border-border bg-background px-4 py-3">
            <Input
              autoFocus
              type="number"
              inputMode="decimal"
              value={form[current.key]}
              onChange={(e) =>
                setForm((s) => ({ ...s, [current.key]: e.target.value }))
              }
              placeholder={`Enter value in ${current.unit}`}
              className="num h-10 flex-1 border-0 bg-transparent text-right text-2xl font-semibold focus-visible:ring-0"
            />
            <span
              className="rounded-md border border-border/60 bg-muted/40 px-2 py-1 font-mono text-xs font-semibold text-foreground"
              title={current.unitLabel}
            >
              {current.unit}
            </span>
            <span className="hidden text-sm text-muted-foreground sm:inline">
              {current.unitLabel}
            </span>
          </div>

          <div className="mt-1.5 flex items-center justify-end pr-1 text-[11px] text-muted-foreground">
            Enter the total in <span className="mx-1 font-semibold text-foreground">{current.unit}</span>
            ({current.unitLabel})
          </div>

          {current.conversions && current.conversions.length > 0 && (
            <div className="mt-3 rounded-lg border border-dashed border-border/60 bg-muted/20 px-3 py-2">
              <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Convert to {current.unit}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {current.conversions.map((c) => (
                  <span
                    key={`${c.from}-${c.to}`}
                    className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-background/60 px-2 py-1 text-[11px]"
                  >
                    <span className="text-muted-foreground">{c.from}</span>
                    <span className="text-muted-foreground/70">→</span>
                    <span className="font-mono font-medium text-foreground">{c.factor}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {current.tip && (
            <div className="mt-2 text-[11px] italic text-muted-foreground">
              💡 {current.tip}
            </div>
          )}
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
        hotel_id: getActiveHotelId(),
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
            const res = await send({ data: { message: userMsg.content, history, hotelId: getActiveHotelId() } });
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
    <Card data-sera-assistant className="flex h-full flex-col overflow-hidden rounded-3xl border-border/70 p-0">
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

/* ---------- Benchmark Comparison Card (with CSV download) ---------- */

function BenchmarkComparisonCard({
  kpi,
  entries,
  filters,
  cohortSize,
  hotelName,
}: {
  kpi: KpiDef;
  entries: MonthlyEntry[];
  filters: { sizeBand: string; region: string; starRating: number };
  cohortSize: number;
  hotelName: string;
}) {
  const Icon = kpi.icon;
  const unitLabel =
    kpi.utility === "water" ? "m³/room-night" : kpi.utility === "waste" ? "kg/room-night" : "kWh/room-night";

  const recent = entries.slice(-12);
  const data = recent.map((e) => {
    const stats = getPeerStats(kpi.utility, e.month, filters);
    const raw = (e[kpi.key] as number | null) ?? null;
    const yours =
      raw !== null && e.occupied_room_nights ? raw / e.occupied_room_nights : null;
    return {
      label: `${MONTH_SHORT[e.month - 1]} ${String(e.year).slice(2)}`,
      year: e.year,
      month: e.month,
      yours,
      median: stats.median,
      p25: stats.p25,
      p75: stats.p75,
      bandLow: stats.p25,
      bandHeight: stats.p75 - stats.p25,
      bestInClass: stats.p10,
    };
  });

  const latest = data[data.length - 1];
  const latestStats =
    recent.length > 0
      ? getPeerStats(kpi.utility, recent[recent.length - 1].month, filters)
      : null;
  const rank =
    latest?.yours !== null && latest?.yours !== undefined && latestStats
      ? getPeerRank(latest.yours, latestStats)
      : null;
  const rankPosition =
    rank !== null ? Math.max(1, Math.round((rank / 100) * cohortSize)) : null;
  const vsMedianPct =
    latest?.yours && latestStats
      ? ((latest.yours - latestStats.median) / latestStats.median) * 100
      : null;
  const better = vsMedianPct !== null && vsMedianPct < 0;

  const handleDownloadCSV = React.useCallback(() => {
    const header = [
      "month",
      "year",
      `${hotelName} (${unitLabel})`,
      `peer p25 (${unitLabel})`,
      `peer median (${unitLabel})`,
      `peer p75 (${unitLabel})`,
      `best-in-class p10 (${unitLabel})`,
    ];
    const rows = data.map((d) => [
      MONTH_SHORT[d.month - 1],
      d.year,
      d.yours !== null ? d.yours.toFixed(4) : "",
      d.p25.toFixed(4),
      d.median.toFixed(4),
      d.p75.toFixed(4),
      d.bestInClass.toFixed(4),
    ]);
    const csv = [header, ...rows]
      .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `benchmark-${kpi.utility}-${hotelName.replace(/\s+/g, "-").toLowerCase()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(`Downloaded ${kpi.label} benchmark data`);
  }, [data, hotelName, kpi.label, kpi.utility, unitLabel]);

  return (
    <div className="rounded-2xl border border-border/70 bg-card">
      <div className="flex items-start justify-between gap-3 border-b border-border/60 px-5 py-4">
        <div className="flex items-center gap-3">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-xl"
            style={{ backgroundColor: `color-mix(in oklab, ${kpi.color} 15%, transparent)` }}
          >
            <Icon className="h-4 w-4" style={{ color: kpi.color }} />
          </div>
          <div>
            <h3 className="font-serif text-base font-semibold">{kpi.label}</h3>
            <p className="text-[11px] text-muted-foreground">{unitLabel}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {rankPosition !== null && (
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Rank
              </div>
              <div className="font-serif text-base font-semibold leading-tight">
                {rankPosition}
                <span className="ml-1 text-xs font-normal text-muted-foreground">
                  /{cohortSize}
                </span>
              </div>
            </div>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleDownloadCSV}
            className="h-8 gap-1.5 px-2.5 text-xs"
            aria-label={`Download ${kpi.label} benchmark data as CSV`}
          >
            <Download className="h-3.5 w-3.5" />
            CSV
          </Button>
        </div>
      </div>

      <div className="h-48 px-2 pt-3">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
            />
            <YAxis tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} />
            <ReTooltip
              contentStyle={{
                backgroundColor: "var(--card)",
                border: "1px solid var(--border)",
                borderRadius: 12,
                fontSize: 12,
              }}
              formatter={(v: number, name: string) => {
                const labels: Record<string, string> = {
                  yours: hotelName,
                  median: "Peer median",
                  bandLow: "Peer p25",
                  bandHeight: "Peer p25–p75",
                };
                return [v?.toFixed(2), labels[name] ?? name];
              }}
            />
            <Area
              dataKey="bandLow"
              stackId="band"
              stroke="none"
              fill="transparent"
              isAnimationActive={false}
            />
            <Area
              dataKey="bandHeight"
              stackId="band"
              stroke="none"
              fill={kpi.color}
              fillOpacity={0.16}
              isAnimationActive={false}
            />
            <Line
              dataKey="median"
              stroke={kpi.color}
              strokeDasharray="4 4"
              strokeWidth={1.5}
              dot={false}
            />
            <Line
              dataKey="yours"
              stroke={kpi.color}
              strokeWidth={2.5}
              dot={{ r: 2.5, fill: kpi.color }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-3 gap-2 border-t border-border/60 px-5 py-3 text-xs">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            You
          </div>
          <div className="num font-serif text-sm font-semibold">
            {latest?.yours ? formatNumber(latest.yours, 2) : "—"}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Median
          </div>
          <div className="num font-serif text-sm font-semibold text-muted-foreground">
            {latestStats ? formatNumber(latestStats.median, 2) : "—"}
          </div>
        </div>
        <div>
          <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
            <Trophy className="h-3 w-3" style={{ color: "var(--champagne)" }} />
            Best
          </div>
          <div className="num font-serif text-sm font-semibold">
            {latestStats ? formatNumber(latestStats.bestInClass, 2) : "—"}
          </div>
        </div>
        {vsMedianPct !== null && (
          <div className="col-span-3 flex items-center gap-1.5 pt-1">
            {better ? (
              <ArrowDownRight className="h-3.5 w-3.5 text-success" />
            ) : (
              <ArrowUpRight className="h-3.5 w-3.5 text-destructive" />
            )}
            <span
              className={`text-xs font-medium ${better ? "text-success" : "text-destructive"}`}
            >
              {formatPct(vsMedianPct)} vs peer median
            </span>
            <span className="text-[11px] text-muted-foreground">
              — {better ? "better than" : "above"} typical
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
