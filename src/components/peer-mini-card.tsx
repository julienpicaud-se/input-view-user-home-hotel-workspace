import * as React from "react";
import { Bolt, Droplets, Flame, Trash2 } from "lucide-react";
import {
  getPeerRank,
  getPeerStats,
  type Utility,
} from "@/lib/peer-benchmarks";
import type { MonthlyEntry } from "@/lib/hotel";
import { formatNumber, formatPct } from "@/lib/format";

export interface PeerMiniKpi {
  key: "electricity_kwh" | "gas_kwh" | "water_m3" | "waste_kg";
  label: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  color: string;
  utility: Utility;
  unit: string;
}

export const PEER_MINI_KPIS: PeerMiniKpi[] = [
  { key: "electricity_kwh", label: "Electricity", icon: Bolt, color: "var(--chart-3)", utility: "electricity", unit: "kWh/rn" },
  { key: "gas_kwh", label: "Gas", icon: Flame, color: "var(--chart-1)", utility: "gas", unit: "kWh/rn" },
  { key: "water_m3", label: "Water", icon: Droplets, color: "var(--chart-2)", utility: "water", unit: "m³/rn" },
  { key: "waste_kg", label: "Waste", icon: Trash2, color: "var(--chart-5)", utility: "waste", unit: "kg/rn" },
];

export function PeerMiniCard({
  kpi,
  latest,
  filters,
  cohortSize,
}: {
  kpi: PeerMiniKpi;
  latest: MonthlyEntry | undefined;
  filters: { sizeBand: string; region: string; starRating: number };
  cohortSize: number;
}) {
  const Icon = kpi.icon;
  if (!latest || !latest.occupied_room_nights) {
    return (
      <div className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground">
        {kpi.label}: no data
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
