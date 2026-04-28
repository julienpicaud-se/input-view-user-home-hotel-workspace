import * as React from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as ReTooltip,
  CartesianGrid,
  ReferenceLine,
  Cell,
  LineChart,
  Line,
  Legend,
} from "recharts";
import {
  Building2,
  Users,
  ShieldCheck,
  Target,
  TrendingDown,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Trophy,
  Info,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { ChartBlock } from "@/components/chart-block";
import type { ProfileType } from "@/lib/profile-type";

/* ------------------------------------------------------------------ */
/*  Mock portfolio (deterministic, hospitality-plausible)             */
/* ------------------------------------------------------------------ */

export interface PortfolioHotel {
  id: string;
  name: string;
  rooms: number;
  region: string;
  /** Energy intensity — kWh per occupied room-night. */
  energyIntensity: number;
  /** Water intensity — L per occupied room-night. */
  waterIntensity: number;
  /** Waste intensity — kg per guest. */
  wasteIntensity: number;
  /** Carbon intensity — kg CO₂e per occupied room-night. */
  carbonIntensity: number;
  /** YoY change on energy intensity, in %. Negative = improvement. */
  yoyEnergy: number;
  /** Reporting completeness over the campaign (0–100). */
  completeness: number;
  /** Number of late submissions in the last 12 months. */
  lateSubmissions: number;
  /** Number of flagged anomalies open. */
  flagged: number;
}

const PORTFOLIO: PortfolioHotel[] = [
  { id: "h1", name: "The Marbella Grand",     rooms: 120, region: "Mediterranean",    energyIntensity: 41, waterIntensity: 540, wasteIntensity: 2.3, carbonIntensity: 11.2, yoyEnergy: -4.6, completeness: 96, lateSubmissions: 1, flagged: 0 },
  { id: "h2", name: "Costa Azul Resort",      rooms: 220, region: "Mediterranean",    energyIntensity: 47, waterIntensity: 612, wasteIntensity: 2.6, carbonIntensity: 12.8, yoyEnergy: -1.8, completeness: 88, lateSubmissions: 3, flagged: 2 },
  { id: "h3", name: "Alpine Sky Lodge",       rooms:  80, region: "Mountain / Alpine", energyIntensity: 53, waterIntensity: 470, wasteIntensity: 2.1, carbonIntensity: 14.9, yoyEnergy: -2.9, completeness: 92, lateSubmissions: 2, flagged: 1 },
  { id: "h4", name: "Azure Bay Resort",       rooms: 180, region: "Southern Europe",   energyIntensity: 38, waterIntensity: 505, wasteIntensity: 2.0, carbonIntensity: 10.4, yoyEnergy: -5.4, completeness: 99, lateSubmissions: 0, flagged: 0 },
  { id: "h5", name: "Northwind City Hotel",   rooms: 120, region: "Northern Europe",   energyIntensity: 44, waterIntensity: 445, wasteIntensity: 2.4, carbonIntensity: 13.1, yoyEnergy: -3.1, completeness: 84, lateSubmissions: 4, flagged: 1 },
  { id: "h6", name: "Olive Grove Inn",        rooms:  75, region: "Southern Europe",   energyIntensity: 36, waterIntensity: 498, wasteIntensity: 1.9, carbonIntensity:  9.8, yoyEnergy: -6.0, completeness: 100, lateSubmissions: 0, flagged: 0 },
  { id: "h7", name: "Skyline Business Hotel", rooms: 240, region: "Western Europe",    energyIntensity: 49, waterIntensity: 560, wasteIntensity: 2.7, carbonIntensity: 13.6, yoyEnergy: -2.2, completeness: 78, lateSubmissions: 5, flagged: 3 },
  { id: "h8", name: "Desert Pearl Lodge",     rooms:  95, region: "Middle East",       energyIntensity: 58, waterIntensity: 690, wasteIntensity: 2.5, carbonIntensity: 16.1, yoyEnergy: -1.1, completeness: 81, lateSubmissions: 4, flagged: 2 },
];

/** Plausible portfolio targets aligned with Accor-style ambitions. */
export const PORTFOLIO_TARGETS = {
  energyIntensity: 42,    // kWh / occupied room-night
  waterIntensity: 500,    // L / occupied room-night (≈ Accor anchor)
  wasteIntensity: 2.2,    // kg / guest
  carbonIntensity: 11.5,  // kg CO₂e / occupied room-night
  completeness: 95,       // % of monthly entries reported
  yoyEnergy: -4,          // % YoY reduction ambition
};

function avg(nums: number[]): number {
  return nums.reduce((s, n) => s + n, 0) / Math.max(nums.length, 1);
}

/* ------------------------------------------------------------------ */
/*  Section banner — explains what THIS role should look at           */
/* ------------------------------------------------------------------ */

const ROLE_META: Record<ProfileType, { label: string; icon: LucideIcon; tone: string }> = {
  hotel_user: { label: "Hotel view",     icon: Building2,   tone: "bg-primary/10 text-primary border-primary/20" },
  vpo:        { label: "Portfolio view", icon: Users,       tone: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20" },
  super_admin:{ label: "Governance view",icon: ShieldCheck, tone: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20" },
};

const BANNER_COPY: Record<string, Record<ProfileType, { question: string; focus: string }>> = {
  ops: {
    hotel_user:  { question: "How is my hotel running this month vs last year and target?",            focus: "Operational KPIs at site level — energy, water, waste and carbon per occupied room." },
    vpo:         { question: "Is the portfolio reaching group targets, and which hotels are driving it?", focus: "Same operational KPIs, aggregated. Hotel ranking, contributions, and gap to target." },
    super_admin: { question: "Do we have complete, current and valid operational data network-wide?",  focus: "Coverage of operational reporting across hotels — not site-level performance steering." },
  },
  "energy-water": {
    hotel_user:  { question: "Where can we save energy and water this quarter?",                       focus: "Local steering — intensity trends, anomalies, fuel mix and load profile." },
    vpo:         { question: "Which hotels are pushing the portfolio above or below the target?",     focus: "Hotel comparison on energy/water intensity, target attainment, on-track ratio." },
    super_admin: { question: "Are energy & water readings complete, fresh and consistent?",            focus: "Reporting coverage and consistency for energy and water across the network." },
  },
  carbon: {
    hotel_user:  { question: "How is my hotel's carbon footprint evolving?",                            focus: "Site emissions trend, intensity, and trajectory vs the Accor reduction target." },
    vpo:         { question: "Is the portfolio decarbonisation trajectory on track?",                   focus: "Aggregate trajectory, hotel contributions, and gap to group target." },
    super_admin: { question: "Are scope coverage and emission factors consistent across hotels?",       focus: "Carbon reporting completeness and methodology consistency across the network." },
  },
  benchmarks: {
    hotel_user:  { question: "Where does my hotel rank vs similar peers?",                              focus: "Peer rank by metric, percentile position, and improvement headroom." },
    vpo:         { question: "How is the portfolio distributed against external benchmarks?",           focus: "Hotel distribution inside the portfolio and cross-benchmark performance." },
    super_admin: { question: "Are benchmarks well-populated and methodologically sound?",               focus: "Coverage of the benchmarking programme — which hotels feed which cohorts." },
  },
  "data-quality": {
    hotel_user:  { question: "What's missing for my hotel this campaign?",                              focus: "Local reporting completeness, missing values, and what to fix in the Log tab." },
    vpo:         { question: "Which hotels in my portfolio are late or flagged?",                       focus: "Portfolio reporting health — late submissions, missing data, flagged anomalies." },
    super_admin: { question: "Is the network reporting complete, valid and audit-ready?",               focus: "Programme governance — completeness, validity, late submissions and exception management." },
  },
};

export function RoleLensBanner({
  role,
  section,
}: {
  role: ProfileType;
  section: string;
}) {
  const meta = ROLE_META[role];
  const copy = BANNER_COPY[section]?.[role];
  if (!copy) return null;
  const Icon = meta.icon;
  return (
    <div className={`flex items-start gap-3 rounded-xl border px-4 py-3 ${meta.tone}`}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em]">
          {meta.label}
          <span className="text-muted-foreground">· same data, different lens</span>
        </div>
        <div className="mt-1 text-sm font-medium text-foreground">{copy.question}</div>
        <div className="mt-0.5 text-xs text-muted-foreground">{copy.focus}</div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  VPO — Portfolio overlays                                          */
/* ------------------------------------------------------------------ */

type MetricKey = "energyIntensity" | "waterIntensity" | "carbonIntensity" | "wasteIntensity";

const METRIC_META: Record<
  MetricKey,
  { label: string; unit: string; targetKey: keyof typeof PORTFOLIO_TARGETS; lowerIsBetter: true }
> = {
  energyIntensity: { label: "Energy",  unit: "kWh / room-night", targetKey: "energyIntensity",  lowerIsBetter: true },
  waterIntensity:  { label: "Water",   unit: "L / room-night",   targetKey: "waterIntensity",   lowerIsBetter: true },
  carbonIntensity: { label: "Carbon",  unit: "kg CO₂e / room-night", targetKey: "carbonIntensity", lowerIsBetter: true },
  wasteIntensity:  { label: "Waste",   unit: "kg / guest",       targetKey: "wasteIntensity",   lowerIsBetter: true },
};

export function PortfolioTargetTracker({ metric }: { metric: MetricKey }) {
  const meta = METRIC_META[metric];
  const target = PORTFOLIO_TARGETS[meta.targetKey] as number;
  const portfolioAvg = avg(PORTFOLIO.map((h) => h[metric]));
  const onTrack = PORTFOLIO.filter((h) => h[metric] <= target).length;
  const offTrack = PORTFOLIO.length - onTrack;
  const onTrackPct = Math.round((onTrack / PORTFOLIO.length) * 100);
  const gap = ((portfolioAvg - target) / target) * 100;
  const gapAbs = Math.abs(gap);
  const beatingTarget = portfolioAvg <= target;
  return (
    <ChartBlock
      title={`${meta.label} — portfolio vs target`}
      subtitle={`${PORTFOLIO.length} hotels · target ${target} ${meta.unit}`}
      status="complete"
      howToRead={{
        intro:
          "Portfolio average compared to the group target. The on-track ratio and gap tell you whether the network as a whole is delivering — and how far the laggards still are.",
        bullets: [
          "Lower is better for all intensity metrics.",
          "Use the hotel ranking below to spot who is pulling the average up.",
          "Targets are illustrative, aligned with Accor-style hospitality ambitions.",
        ],
      }}
    >
      <div className="grid grid-cols-1 gap-4 px-5 pb-5 pt-2 sm:grid-cols-3">
        <Stat
          label="Portfolio average"
          value={`${portfolioAvg.toFixed(meta.unit.startsWith("kg") || meta.unit.startsWith("L") ? 0 : 1)}`}
          unit={meta.unit}
          tone={beatingTarget ? "good" : "warn"}
          icon={beatingTarget ? TrendingDown : TrendingUp}
          hint={beatingTarget
            ? `${gapAbs.toFixed(1)}% below target`
            : `${gapAbs.toFixed(1)}% above target`}
        />
        <Stat
          label="Hotels on track"
          value={`${onTrack}/${PORTFOLIO.length}`}
          unit={`${onTrackPct}% of portfolio`}
          tone={onTrackPct >= 60 ? "good" : "warn"}
          icon={CheckCircle2}
          hint={`${offTrack} hotel${offTrack === 1 ? "" : "s"} off-track`}
        />
        <Stat
          label="Group target"
          value={`${target}`}
          unit={meta.unit}
          tone="neutral"
          icon={Target}
          hint="Illustrative, aligned with Accor ambitions"
        />
      </div>
    </ChartBlock>
  );
}

export function PortfolioHotelRanking({ metric }: { metric: MetricKey }) {
  const meta = METRIC_META[metric];
  const target = PORTFOLIO_TARGETS[meta.targetKey] as number;
  const data = [...PORTFOLIO]
    .sort((a, b) => a[metric] - b[metric])
    .map((h) => ({
      name: h.name.replace(/^The /, ""),
      value: Number(h[metric].toFixed(1)),
      onTrack: h[metric] <= target,
    }));
  return (
    <ChartBlock
      title={`${meta.label} — hotel ranking`}
      subtitle={`Best to worst on ${meta.unit}. Bars left of the dashed line beat the target.`}
      status="complete"
      howToRead={{
        intro:
          "Each bar is one hotel in the portfolio. The dashed line is the group target — anything to the left of it is on track.",
        bullets: [
          "The two left-most hotels are best-in-class — share their playbook.",
          "The two right-most are where field support has the highest ROI.",
        ],
      }}
    >
      <div className="h-[280px] px-2 pb-3 md:px-4">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 8, right: 24, left: 8, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
            <YAxis
              type="category"
              dataKey="name"
              tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              width={140}
            />
            <ReTooltip
              contentStyle={{ backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, fontSize: 12 }}
              formatter={(v: number) => `${v} ${meta.unit}`}
            />
            <ReferenceLine x={target} stroke="var(--champagne)" strokeDasharray="4 4" label={{ value: "Target", fill: "var(--muted-foreground)", fontSize: 11, position: "top" }} />
            <Bar dataKey="value" radius={[0, 6, 6, 0]}>
              {data.map((d) => (
                <Cell key={d.name} fill={d.onTrack ? "var(--chart-4, #16a34a)" : "var(--chart-1)"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartBlock>
  );
}

export function PortfolioContributors({ metric }: { metric: MetricKey }) {
  const meta = METRIC_META[metric];
  const sorted = [...PORTFOLIO].sort((a, b) => a[metric] - b[metric]);
  const best = sorted.slice(0, 3);
  const worst = sorted.slice(-3).reverse();
  return (
    <ChartBlock
      title={`${meta.label} — contributors`}
      subtitle="Best-in-class playbooks vs hotels needing field support."
      status="complete"
      howToRead={{
        intro:
          "A two-column view that turns the ranking into a coaching list — who to learn from, and who to support next.",
      }}
    >
      <div className="grid grid-cols-1 gap-4 px-5 pb-5 pt-2 md:grid-cols-2">
        <div>
          <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-600 dark:text-emerald-400">
            <Trophy className="h-3.5 w-3.5" /> Best in class
          </div>
          <ul className="space-y-1.5">
            {best.map((h) => (
              <li key={h.id} className="flex items-center justify-between rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-xs">
                <span className="font-medium text-foreground">{h.name}</span>
                <span className="tabular-nums text-emerald-700 dark:text-emerald-300">
                  {h[metric].toFixed(1)} {meta.unit}
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-600 dark:text-amber-400">
            <AlertTriangle className="h-3.5 w-3.5" /> Need support
          </div>
          <ul className="space-y-1.5">
            {worst.map((h) => (
              <li key={h.id} className="flex items-center justify-between rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs">
                <span className="font-medium text-foreground">{h.name}</span>
                <span className="tabular-nums text-amber-700 dark:text-amber-300">
                  {h[metric].toFixed(1)} {meta.unit}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </ChartBlock>
  );
}

export function PortfolioTrajectory({ metric }: { metric: MetricKey }) {
  const meta = METRIC_META[metric];
  const target = PORTFOLIO_TARGETS[meta.targetKey] as number;
  const startAvg = avg(PORTFOLIO.map((h) => h[metric])) * 1.06;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const data = months.map((m, i) => {
    const prog = i / (months.length - 1);
    const portfolio = startAvg + (avg(PORTFOLIO.map((h) => h[metric])) - startAvg) * prog;
    return {
      label: m,
      portfolio: Number(portfolio.toFixed(1)),
      target: target,
    };
  });
  return (
    <ChartBlock
      title={`${meta.label} — portfolio trajectory`}
      subtitle="12-month moving portfolio average vs group target."
      status="complete"
      howToRead={{
        intro:
          "Smoothed portfolio average over the campaign. Watch the gap to the target line close — or widen — over time.",
      }}
    >
      <div className="h-56 px-2 pb-3 md:px-4">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 12, right: 16, left: 0, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
            <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} domain={["auto", "auto"]} />
            <ReTooltip contentStyle={{ backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, fontSize: 12 }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line type="monotone" dataKey="portfolio" stroke="var(--chart-3)" strokeWidth={2.5} dot={false} name={`Portfolio (${meta.unit})`} />
            <Line type="monotone" dataKey="target" stroke="var(--champagne)" strokeDasharray="5 4" strokeWidth={2} dot={false} name="Group target" />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </ChartBlock>
  );
}

/* ------------------------------------------------------------------ */
/*  Admin — Governance overlays                                       */
/* ------------------------------------------------------------------ */

export function NetworkCompleteness() {
  const portfolioCompleteness = avg(PORTFOLIO.map((h) => h.completeness));
  const hotelsAt100 = PORTFOLIO.filter((h) => h.completeness === 100).length;
  const lateTotal = PORTFOLIO.reduce((s, h) => s + h.lateSubmissions, 0);
  const flaggedTotal = PORTFOLIO.reduce((s, h) => s + h.flagged, 0);
  return (
    <ChartBlock
      title="Network reporting health"
      subtitle="Programme-wide completeness, late submissions and open flags."
      status="complete"
      howToRead={{
        intro:
          "The four headline numbers your central team should watch every week. Anything below 95% completeness or above zero on flags deserves a follow-up.",
      }}
    >
      <div className="grid grid-cols-2 gap-3 px-5 pb-5 pt-2 md:grid-cols-4">
        <Stat
          label="Network completeness"
          value={`${portfolioCompleteness.toFixed(0)}%`}
          unit={`Target ${PORTFOLIO_TARGETS.completeness}%`}
          tone={portfolioCompleteness >= PORTFOLIO_TARGETS.completeness ? "good" : "warn"}
          icon={CheckCircle2}
        />
        <Stat
          label="Hotels at 100%"
          value={`${hotelsAt100}/${PORTFOLIO.length}`}
          unit="Fully reported"
          tone={hotelsAt100 >= PORTFOLIO.length * 0.6 ? "good" : "warn"}
          icon={Building2}
        />
        <Stat
          label="Late submissions"
          value={`${lateTotal}`}
          unit="Last 12 months"
          tone={lateTotal === 0 ? "good" : lateTotal < 10 ? "warn" : "bad"}
          icon={AlertTriangle}
        />
        <Stat
          label="Open anomalies"
          value={`${flaggedTotal}`}
          unit="Awaiting review"
          tone={flaggedTotal === 0 ? "good" : "warn"}
          icon={Info}
        />
      </div>
    </ChartBlock>
  );
}

export function HotelReportingTable() {
  const rows = [...PORTFOLIO].sort((a, b) => a.completeness - b.completeness);
  return (
    <ChartBlock
      title="Reporting status by hotel"
      subtitle="Sorted by completeness — start the week with the top of the list."
      status="complete"
      howToRead={{
        intro: "A single-glance triage view. Each row is a hotel; the colour shows reporting health.",
      }}
    >
      <div className="px-5 pb-5 pt-2">
        <div className="overflow-hidden rounded-lg border border-border/60">
          <table className="w-full text-xs">
            <thead className="bg-muted/40 text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Hotel</th>
                <th className="px-3 py-2 text-right font-medium">Completeness</th>
                <th className="px-3 py-2 text-right font-medium">Late</th>
                <th className="px-3 py-2 text-right font-medium">Flagged</th>
                <th className="px-3 py-2 text-right font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((h) => {
                const ok = h.completeness >= 95 && h.lateSubmissions <= 1 && h.flagged === 0;
                const warn = !ok && h.completeness >= 85;
                return (
                  <tr key={h.id} className="border-t border-border/60">
                    <td className="px-3 py-2 font-medium text-foreground">{h.name}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{h.completeness}%</td>
                    <td className="px-3 py-2 text-right tabular-nums">{h.lateSubmissions}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{h.flagged}</td>
                    <td className="px-3 py-2 text-right">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                        ok
                          ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                          : warn
                            ? "bg-amber-500/10 text-amber-700 dark:text-amber-300"
                            : "bg-red-500/10 text-red-700 dark:text-red-300"
                      }`}>
                        {ok ? "Ready" : warn ? "Watch" : "At risk"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </ChartBlock>
  );
}

/* ------------------------------------------------------------------ */
/*  Reusable stat tile                                                */
/* ------------------------------------------------------------------ */

function Stat({
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
    <div className={`rounded-xl border p-3 ${toneCls}`}>
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] opacity-80">
        <Icon className="h-3 w-3" />
        {label}
      </div>
      <div className="mt-1 text-lg font-semibold tabular-nums text-foreground">{value}</div>
      {unit ? <div className="text-[11px] text-muted-foreground">{unit}</div> : null}
      {hint ? <div className="mt-0.5 text-[11px] text-muted-foreground">{hint}</div> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Section composer — drops in the right overlays per role           */
/* ------------------------------------------------------------------ */

export function RoleSectionOverlays({
  role,
  section,
}: {
  role: ProfileType;
  section: string;
}) {
  if (role === "hotel_user") return null; // Hotel view keeps existing charts as-is.

  if (role === "vpo") {
    switch (section) {
      case "ops":
        return (
          <>
            <PortfolioTargetTracker metric="energyIntensity" />
            <PortfolioHotelRanking metric="energyIntensity" />
            <PortfolioContributors metric="energyIntensity" />
          </>
        );
      case "energy-water":
        return (
          <>
            <PortfolioTargetTracker metric="waterIntensity" />
            <PortfolioHotelRanking metric="waterIntensity" />
            <PortfolioTrajectory metric="energyIntensity" />
          </>
        );
      case "carbon":
        return (
          <>
            <PortfolioTargetTracker metric="carbonIntensity" />
            <PortfolioTrajectory metric="carbonIntensity" />
            <PortfolioHotelRanking metric="carbonIntensity" />
          </>
        );
      case "benchmarks":
        return (
          <>
            <PortfolioHotelRanking metric="energyIntensity" />
            <PortfolioContributors metric="carbonIntensity" />
          </>
        );
      case "data-quality":
        return (
          <>
            <NetworkCompleteness />
            <HotelReportingTable />
          </>
        );
    }
  }

  if (role === "super_admin") {
    // Admin always leads with governance — even in operational tabs.
    switch (section) {
      case "ops":
      case "energy-water":
      case "carbon":
      case "benchmarks":
        return <NetworkCompleteness />;
      case "data-quality":
        return (
          <>
            <NetworkCompleteness />
            <HotelReportingTable />
          </>
        );
    }
  }

  return null;
}
