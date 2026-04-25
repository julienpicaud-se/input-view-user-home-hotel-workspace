import * as React from "react";
import { Bolt, Flame, Droplets, Trash2, Sparkles, Loader2 } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  getPeerCohortSize,
  getPeerStats,
  getPeerRank,
  type Utility,
} from "@/lib/peer-benchmarks";
import { formatNumber } from "@/lib/format";
import type { Hotel, MonthlyEntry } from "@/lib/hotel";
import { explainChart } from "@/server/assistant.functions";

interface KpiDef {
  key: "electricity_kwh" | "gas_kwh" | "water_m3" | "waste_kg";
  label: string;
  utility: Utility;
  unit: string;
  Icon: React.ComponentType<{ className?: string }>;
  color: string;
}

const KPIS: KpiDef[] = [
  { key: "electricity_kwh", label: "Electricity", utility: "electricity", unit: "kWh/rn", Icon: Bolt, color: "#fbbf24" },
  { key: "gas_kwh", label: "Gas", utility: "gas", unit: "kWh/rn", Icon: Flame, color: "#fb7185" },
  { key: "water_m3", label: "Water", utility: "water", unit: "m³/rn", Icon: Droplets, color: "#38bdf8" },
  { key: "waste_kg", label: "Waste", utility: "waste", unit: "kg/rn", Icon: Trash2, color: "#34d399" },
];

export function TheoryBenchmarks({
  hotel,
  entries,
}: {
  hotel: Hotel;
  entries: MonthlyEntry[];
}) {
  const callExplain = useServerFn(explainChart);
  const [explanation, setExplanation] = React.useState<string>("");
  const [explaining, setExplaining] = React.useState(false);

  const filters = {
    sizeBand: hotel.size_band,
    region: hotel.region,
    starRating: hotel.star_rating,
  };
  const cohortSize = getPeerCohortSize(filters);

  const latest = React.useMemo(() => {
    if (entries.length === 0) return undefined;
    return [...entries].sort(
      (a, b) => (b.year - a.year) * 100 + (b.month - a.month),
    )[0];
  }, [entries]);

  async function handleExplain() {
    setExplaining(true);
    setExplanation("");
    try {
      const res = await callExplain({
        data: { hotelId: hotel.id, chartId: "peer" as const },
      });
      if ("explanation" in res && res.explanation) {
        setExplanation(res.explanation.summary || "");
      } else if ("error" in res) {
        toast.error(res.error);
      }
    } catch {
      toast.error("Sera couldn't compare right now.");
    } finally {
      setExplaining(false);
    }
  }

  if (!latest || !latest.occupied_room_nights) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-sm text-white/60">
        Once you log a month with room-nights, I'll compare you to {cohortSize} similar hotels here.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-white/55">
          Compared to <span className="text-white/85">{cohortSize}</span> similar
          hotels — {hotel.size_band} rooms, {hotel.region}, {hotel.star_rating}★
        </p>
        <button
          onClick={handleExplain}
          disabled={explaining}
          className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.04] px-3 py-1.5 text-xs text-white/85 backdrop-blur-md transition-colors hover:bg-white/[0.1] disabled:opacity-50"
        >
          {explaining ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Sparkles className="h-3.5 w-3.5 text-amber-200" />
          )}
          {explaining ? "Reading…" : "Sera, compare"}
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {KPIS.map((k) => (
          <PeerCard key={k.key} kpi={k} latest={latest} filters={filters} cohortSize={cohortSize} />
        ))}
      </div>

      {explanation && (
        <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-violet-500/10 to-fuchsia-500/5 p-5">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500/30 to-fuchsia-500/20 text-violet-200">
              <Sparkles className="h-4 w-4" />
            </div>
            <div className="text-sm leading-relaxed text-white/85">
              {explanation}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PeerCard({
  kpi,
  latest,
  filters,
  cohortSize,
}: {
  kpi: KpiDef;
  latest: MonthlyEntry;
  filters: { sizeBand: string; region: string; starRating: number };
  cohortSize: number;
}) {
  const raw = (latest[kpi.key] as number | null) ?? null;
  const nights = latest.occupied_room_nights ?? 0;
  if (raw === null || nights === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-4 text-sm text-white/45">
        {kpi.label}: no data yet
      </div>
    );
  }
  const intensity = raw / nights;
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
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div
            className="flex h-8 w-8 items-center justify-center rounded-lg"
            style={{ background: `${kpi.color}22`, color: kpi.color }}
          >
            <kpi.Icon className="h-4 w-4" />
          </div>
          <span className="text-sm font-medium text-white/90">{kpi.label}</span>
        </div>
        <span className="text-[10px] uppercase tracking-wider text-white/45">
          #{rankPosition}/{cohortSize}
        </span>
      </div>

      <div className="mt-3">
        <div className="relative h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
          <div
            className="absolute inset-y-0 left-0 rounded-full opacity-50"
            style={{
              width: "100%",
              background:
                "linear-gradient(90deg, rgba(52,211,153,0.5) 0%, rgba(251,191,36,0.5) 50%, rgba(244,63,94,0.5) 100%)",
            }}
          />
          <div
            className="absolute top-1/2 h-3 w-1 -translate-y-1/2 rounded-full bg-white shadow-[0_0_8px_rgba(255,255,255,0.7)]"
            style={{ left: `calc(${barPos}% - 2px)` }}
          />
        </div>
        <div className="mt-1.5 flex justify-between text-[10px] text-white/40">
          <span>p10 {formatNumber(stats.p10, 1)}</span>
          <span>median {formatNumber(stats.median, 1)}</span>
          <span>p90 {formatNumber(stats.p90, 1)}</span>
        </div>
      </div>

      <div className="mt-3 flex items-baseline justify-between">
        <p className="font-serif text-xl text-white">
          {formatNumber(intensity, 1)}{" "}
          <span className="text-xs text-white/45">{kpi.unit}</span>
        </p>
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
            better
              ? "bg-emerald-500/15 text-emerald-200"
              : "bg-rose-500/15 text-rose-200"
          }`}
        >
          {better ? "▼" : "▲"} {Math.abs(vsMedianPct).toFixed(0)}% vs peers
        </span>
      </div>
    </div>
  );
}
