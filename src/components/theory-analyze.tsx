import * as React from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip as ReTooltip,
  CartesianGrid,
} from "recharts";
import {
  Bolt,
  Flame,
  Droplets,
  Trash2,
  Leaf,
  Loader2,
  Sparkles,
} from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  MONTH_SHORT,
  formatNumber,
  calculateCO2e,
} from "@/lib/format";
import type { Hotel, MonthlyEntry } from "@/lib/hotel";
import { explainChart } from "@/server/assistant.functions";

type MetricKey =
  | "electricity_kwh"
  | "gas_kwh"
  | "water_m3"
  | "waste_kg"
  | "co2";

interface MetricMeta {
  key: MetricKey;
  label: string;
  unit: string;
  Icon: React.ComponentType<{ className?: string }>;
  stroke: string;
  fillStart: string;
  fillEnd: string;
}

const METRICS: MetricMeta[] = [
  {
    key: "electricity_kwh",
    label: "Electricity",
    unit: "kWh",
    Icon: Bolt,
    stroke: "#fbbf24",
    fillStart: "rgba(251,191,36,0.45)",
    fillEnd: "rgba(251,191,36,0)",
  },
  {
    key: "gas_kwh",
    label: "Gas",
    unit: "kWh",
    Icon: Flame,
    stroke: "#fb7185",
    fillStart: "rgba(251,113,133,0.4)",
    fillEnd: "rgba(251,113,133,0)",
  },
  {
    key: "water_m3",
    label: "Water",
    unit: "m³",
    Icon: Droplets,
    stroke: "#38bdf8",
    fillStart: "rgba(56,189,248,0.45)",
    fillEnd: "rgba(56,189,248,0)",
  },
  {
    key: "waste_kg",
    label: "Waste",
    unit: "kg",
    Icon: Trash2,
    stroke: "#34d399",
    fillStart: "rgba(52,211,153,0.45)",
    fillEnd: "rgba(52,211,153,0)",
  },
  {
    key: "co2",
    label: "CO₂e",
    unit: "kg",
    Icon: Leaf,
    stroke: "#c084fc",
    fillStart: "rgba(192,132,252,0.45)",
    fillEnd: "rgba(192,132,252,0)",
  },
];

export function TheoryAnalyze({
  hotel,
  entries,
}: {
  hotel: Hotel;
  entries: MonthlyEntry[];
}) {
  const [metric, setMetric] = React.useState<MetricKey>("electricity_kwh");
  const [explanation, setExplanation] = React.useState<string>("");
  const [explaining, setExplaining] = React.useState(false);
  const callExplain = useServerFn(explainChart);
  const meta = METRICS.find((m) => m.key === metric)!;

  const data = React.useMemo(() => {
    const sorted = [...entries].sort(
      (a, b) => (a.year - b.year) * 100 + (a.month - b.month),
    );
    return sorted.slice(-12).map((e) => {
      const value =
        metric === "co2"
          ? calculateCO2e(e)
          : ((e[metric as keyof MonthlyEntry] as number | null) ?? 0);
      return {
        label: `${MONTH_SHORT[e.month - 1]} ${String(e.year).slice(2)}`,
        value,
      };
    });
  }, [entries, metric]);

  async function handleExplain() {
    if (!hotel || data.length === 0) return;
    setExplaining(true);
    setExplanation("");
    try {
      const res = await callExplain({
        data: {
          hotelId: hotel.id,
          chartType: "trend" as const,
          metric:
            metric === "co2"
              ? "co2_total"
              : metric === "electricity_kwh"
                ? "electricity"
                : metric === "gas_kwh"
                  ? "gas"
                  : metric === "water_m3"
                    ? "water"
                    : "waste",
        },
      });
      if ("explanation" in res && res.explanation) {
        setExplanation(res.explanation.summary || "");
      } else if ("error" in res) {
        toast.error(res.error);
      }
    } catch (e) {
      toast.error("Sera couldn't explain right now.");
    } finally {
      setExplaining(false);
    }
  }

  if (entries.length === 0) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-sm text-white/60">
        Once you log a few months I'll start charting trends here.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] backdrop-blur-md">
      {/* Metric switcher */}
      <div className="flex items-center gap-1 overflow-x-auto border-b border-white/10 p-2 scrollbar-thin">
        {METRICS.map((m) => {
          const isActive = metric === m.key;
          return (
            <button
              key={m.key}
              onClick={() => {
                setMetric(m.key);
                setExplanation("");
              }}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
                isActive
                  ? "bg-white/15 text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.18)]"
                  : "text-white/55 hover:bg-white/[0.06] hover:text-white/85"
              }`}
              style={isActive ? { color: m.stroke } : undefined}
            >
              <m.Icon className="h-3.5 w-3.5" />
              {m.label}
            </button>
          );
        })}
      </div>

      {/* Chart */}
      <div className="px-2 py-4 sm:px-5">
        <div className="flex items-baseline justify-between px-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-white/45">
              Last {data.length} months
            </p>
            <p className="mt-1 font-serif text-2xl text-white">
              {formatNumber(data[data.length - 1]?.value ?? 0)}{" "}
              <span className="text-base text-white/50">{meta.unit}</span>
            </p>
          </div>
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
            {explaining ? "Reading…" : "Sera, explain this"}
          </button>
        </div>

        <div className="mt-4 h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -10 }}>
              <defs>
                <linearGradient id={`grad-${metric}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={meta.fillStart} />
                  <stop offset="100%" stopColor={meta.fillEnd} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
              <XAxis
                dataKey="label"
                stroke="rgba(255,255,255,0.4)"
                fontSize={11}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                stroke="rgba(255,255,255,0.4)"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => formatNumber(v)}
              />
              <ReTooltip
                contentStyle={{
                  background: "rgba(10,6,18,0.95)",
                  border: "1px solid rgba(255,255,255,0.15)",
                  borderRadius: 12,
                  color: "#fff",
                  fontSize: 12,
                }}
                formatter={(v: number) => [`${formatNumber(v)} ${meta.unit}`, meta.label]}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke={meta.stroke}
                strokeWidth={2.5}
                fill={`url(#grad-${metric})`}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {explanation && (
        <div className="border-t border-white/10 bg-gradient-to-br from-violet-500/10 to-fuchsia-500/5 p-5">
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
