import { createFileRoute } from "@tanstack/react-router";
import * as React from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip as ReTooltip,
  CartesianGrid,
} from "recharts";
import { Bolt, Droplets, Flame, Trash2, Trophy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { DEMO_HOTEL_ID, type Hotel, type MonthlyEntry } from "@/lib/hotel";
import { MONTH_SHORT, formatNumber } from "@/lib/format";
import {
  getPeerCohortSize,
  getPeerRank,
  getPeerStats,
  type Utility,
} from "@/lib/peer-benchmarks";
import { PageContainer, PageHeader } from "@/components/page-shell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/benchmarks")({
  head: () => ({
    meta: [
      { title: "Benchmarks — Verdance" },
      {
        name: "description",
        content: "Compare your hotel against similar Mediterranean properties.",
      },
    ],
  }),
  component: BenchmarksPage,
});

const UTILITIES: {
  key: Utility;
  label: string;
  unit: string;
  entryKey: keyof MonthlyEntry;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}[] = [
  { key: "electricity", label: "Electricity", unit: "kWh/room-night", entryKey: "electricity_kwh", icon: Bolt, color: "var(--chart-3)" },
  { key: "gas", label: "Gas", unit: "kWh/room-night", entryKey: "gas_kwh", icon: Flame, color: "var(--chart-1)" },
  { key: "water", label: "Water", unit: "m³/room-night", entryKey: "water_m3", icon: Droplets, color: "var(--chart-2)" },
  { key: "waste", label: "Waste", unit: "kg/room-night", entryKey: "waste_kg", icon: Trash2, color: "var(--chart-5)" },
];

function BenchmarksPage() {
  const [hotel, setHotel] = React.useState<Hotel | null>(null);
  const [entries, setEntries] = React.useState<MonthlyEntry[]>([]);

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
    })();
  }, []);

  if (!hotel) {
    return (
      <PageContainer>
        <div className="space-y-4">
          <div className="h-12 w-72 animate-pulse rounded-lg bg-muted" />
        </div>
      </PageContainer>
    );
  }

  const filters = {
    sizeBand: hotel.size_band,
    region: hotel.region,
    starRating: hotel.star_rating,
  };
  const cohortSize = getPeerCohortSize(filters);

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Peer comparison"
        title="How do you compare?"
        subtitle={`We compare The Marbella Grand against ${cohortSize} similar Mediterranean hotels of ${hotel.size_band} rooms. Your data stays anonymous.`}
      />

      <div className="mb-8 flex flex-wrap gap-2">
        <FilterChip label={`Size: ${hotel.size_band} rooms`} />
        <FilterChip label={`Region: ${hotel.region}`} />
        <FilterChip label={`${hotel.star_rating}-star`} />
        <FilterChip label="All seasons" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {UTILITIES.map((u) => (
          <BenchmarkCard
            key={u.key}
            utility={u}
            entries={entries}
            filters={filters}
            cohortSize={cohortSize}
          />
        ))}
      </div>
    </PageContainer>
  );
}

function FilterChip({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground">
      {label}
    </span>
  );
}

function BenchmarkCard({
  utility,
  entries,
  filters,
  cohortSize,
}: {
  utility: typeof UTILITIES[number];
  entries: MonthlyEntry[];
  filters: { sizeBand: string; region: string; starRating: number };
  cohortSize: number;
}) {
  const Icon = utility.icon;
  const recent = entries.slice(-12);

  const data = recent.map((e) => {
    const stats = getPeerStats(utility.key, e.month, filters);
    const intensity =
      e.occupied_room_nights && e[utility.entryKey] !== null
        ? ((e[utility.entryKey] as number) ?? 0) / e.occupied_room_nights
        : null;
    return {
      label: `${MONTH_SHORT[e.month - 1]} ${String(e.year).slice(2)}`,
      yours: intensity,
      median: stats.median,
      p25: stats.p25,
      p75: stats.p75,
      // For shaded band — render as stacked area: lower = p25, band = p75-p25
      bandLow: stats.p25,
      bandHeight: stats.p75 - stats.p25,
      bestInClass: stats.p10,
    };
  });

  // Latest values
  const latest = data[data.length - 1];
  const latestStats =
    recent.length > 0
      ? getPeerStats(utility.key, recent[recent.length - 1].month, filters)
      : null;
  const rank = latest?.yours && latestStats ? getPeerRank(latest.yours, latestStats) : null;
  const rankPosition = rank !== null ? Math.max(1, Math.round((rank / 100) * cohortSize)) : null;

  return (
    <Card className="overflow-hidden rounded-2xl border-border/70 p-0">
      <div className="flex items-start justify-between gap-4 border-b border-border/60 px-6 py-5">
        <div className="flex items-center gap-3">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-xl"
            style={{ backgroundColor: `color-mix(in oklab, ${utility.color} 15%, transparent)` }}
          >
            <Icon className="h-5 w-5" style={{ color: utility.color }} />
          </div>
          <div>
            <h3 className="font-serif text-xl font-semibold">{utility.label}</h3>
            <p className="text-xs text-muted-foreground">{utility.unit}</p>
          </div>
        </div>
        {rankPosition !== null && (
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Your rank
            </div>
            <div className="font-serif text-2xl font-semibold">
              {rankPosition}
              <span className="ml-1 text-sm font-normal text-muted-foreground">
                of {cohortSize}
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="h-56 px-2 pt-4">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} />
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
                  yours: "Your hotel",
                  median: "Peer median",
                  bandLow: "Peer p25",
                  bandHeight: "Peer p25–p75",
                };
                return [v?.toFixed(2), labels[name] ?? name];
              }}
            />
            {/* shaded band */}
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
              fill={utility.color}
              fillOpacity={0.18}
              isAnimationActive={false}
            />
            <Line
              dataKey="median"
              stroke={utility.color}
              strokeDasharray="4 4"
              strokeWidth={1.5}
              dot={false}
            />
            <Line
              dataKey="yours"
              stroke={utility.color}
              strokeWidth={3}
              dot={{ r: 3, fill: utility.color }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-2 gap-3 border-t border-border/60 px-6 py-4 text-sm">
        <div>
          <div className="text-xs text-muted-foreground">You (latest)</div>
          <div className="num font-serif text-lg font-semibold">
            {latest?.yours ? formatNumber(latest.yours, 2) : "—"}
          </div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Peer median</div>
          <div className="num font-serif text-lg font-semibold text-muted-foreground">
            {latestStats ? formatNumber(latestStats.median, 2) : "—"}
          </div>
        </div>
        <div className="col-span-2 mt-2 flex items-center gap-2 rounded-xl bg-accent/15 px-3 py-2">
          <Trophy className="h-4 w-4 text-champagne" style={{ color: "var(--champagne)" }} />
          <div className="text-xs">
            <span className="font-medium">Best-in-class:</span>{" "}
            <span className="num">
              {latestStats ? formatNumber(latestStats.bestInClass, 2) : "—"} {utility.unit}
            </span>{" "}
            <span className="text-muted-foreground">— what the top 10% achieve</span>
          </div>
        </div>
      </div>
    </Card>
  );
}
