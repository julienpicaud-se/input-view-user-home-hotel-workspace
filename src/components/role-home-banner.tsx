import * as React from "react";
import { Hotel, Globe2, ShieldCheck, MapPin, Zap, Droplet, Leaf, ArrowDown, ArrowUp, Minus, Building2, BarChart3, Database } from "lucide-react";
import { useProfileType, PROFILE_TYPE_META, type ProfileType } from "@/lib/profile-type";
import type { Hotel as HotelType, MonthlyEntry } from "@/lib/hotel";
import { calculateCO2e, formatNumber } from "@/lib/format";

const ICONS: Record<ProfileType, React.ComponentType<{ className?: string }>> = {
  hotel_user: Hotel,
  vpo: Globe2,
  super_admin: ShieldCheck,
};

interface Props {
  hotels: HotelType[];
  entries: MonthlyEntry[];
  /** If provided, used as the "active hotel" lens for hotel_user. */
  activeHotelId?: string;
}

type Tone = "good" | "warn" | "neutral";

interface TileData {
  label: string;
  value: string;
  unit?: string;
  hint: string;
  tone?: Tone;
  icon?: React.ComponentType<{ className?: string }>;
  /** % delta vs reference (negative = improvement for "lower is better" metrics) */
  delta?: number | null;
  /** sparkline series (chronological) */
  spark?: number[];
  /** trend card uses big arrow + sparkline emphasis */
  isTrendCard?: boolean;
  /** if true, positive delta = improvement (e.g. % onboarded) */
  higherIsBetter?: boolean;
}

/**
 * Role-aware banner that shows above each homepage.
 * - Confirms scope ("Where am I looking?")
 * - Shows 3 KPI tiles tailored to the current role
 * - Same underlying data, different lens
 */
export function RoleHomeBanner({ hotels, entries, activeHotelId }: Props) {
  const { profileType } = useProfileType();
  const meta = PROFILE_TYPE_META[profileType];
  const Icon = ICONS[profileType];

  const tiles = React.useMemo<TileData[]>(() => {
    if (profileType === "hotel_user") {
      const hotel =
        hotels.find((h) => h.id === activeHotelId) ?? hotels[0] ?? null;
      const myEntries = hotel
        ? entries
            .filter((e) => e.hotel_id === hotel.id)
            .sort((a, b) =>
              a.year !== b.year ? b.year - a.year : b.month - a.month,
            )
        : [];
      const last = myEntries[0];
      const lastYearSame = last
        ? myEntries.find(
            (e) => e.year === last.year - 1 && e.month === last.month,
          )
        : undefined;
      const occ = last?.occupied_room_nights ?? 0;
      const elec = Number(last?.electricity_kwh ?? 0);
      const water = Number(last?.water_m3 ?? 0);
      const ePerRoom = occ > 0 ? elec / occ : null;
      const wPerRoom = occ > 0 ? water / occ : null;

      const occPrev = lastYearSame?.occupied_room_nights ?? 0;
      const ePerRoomPrev = occPrev > 0 ? Number(lastYearSame?.electricity_kwh ?? 0) / occPrev : null;
      const wPerRoomPrev = occPrev > 0 ? Number(lastYearSame?.water_m3 ?? 0) / occPrev : null;
      const eDelta = ePerRoom !== null && ePerRoomPrev ? ((ePerRoom - ePerRoomPrev) / ePerRoomPrev) * 100 : null;
      const wDelta = wPerRoom !== null && wPerRoomPrev ? ((wPerRoom - wPerRoomPrev) / wPerRoomPrev) * 100 : null;

      const co2 = last ? calculateCO2e(last) : 0;
      const co2Prev = lastYearSame ? calculateCO2e(lastYearSame) : 0;
      const yoy =
        co2Prev > 0 ? ((co2 - co2Prev) / co2Prev) * 100 : null;

      // sparkline data: last 12 entries chronologically (CO2e per occ)
      const spark = [...myEntries].slice(0, 12).reverse().map((e) => {
        const o = e.occupied_room_nights ?? 0;
        return o > 0 ? calculateCO2e(e) / o : 0;
      });

      return [
        {
          label: "Energy / occupied room",
          value: ePerRoom !== null ? formatNumber(ePerRoom, 1) : "—",
          unit: "kWh",
          hint: "Last logged month",
          icon: Zap,
          delta: eDelta,
          // for "lower is better" metrics
          tone: eDelta === null ? "neutral" : eDelta < -2 ? "good" : eDelta > 2 ? "warn" : "neutral",
        },
        {
          label: "Water / occupied room",
          value: wPerRoom !== null ? formatNumber(wPerRoom, 2) : "—",
          unit: "m³",
          hint: "Last logged month",
          icon: Droplet,
          delta: wDelta,
          tone: wDelta === null ? "neutral" : wDelta < -2 ? "good" : wDelta > 2 ? "warn" : "neutral",
        },
        {
          label: "CO₂e vs last year",
          value: yoy !== null ? `${yoy > 0 ? "+" : ""}${yoy.toFixed(0)}` : "—",
          unit: "%",
          hint: yoy !== null ? (yoy <= 0 ? "On track" : "Above last year") : "Need 12 months",
          tone: yoy === null ? "neutral" : yoy <= 0 ? "good" : "warn",
          icon: Leaf,
          delta: yoy,
          spark,
          isTrendCard: true,
        },
      ];
    }
    const TARGET_YOY = -5; // Group target: reduce CO₂e by 5% vs last year

    if (profileType === "vpo") {
      // Aggregate latest month available
      const latestPeriod = entries.reduce<{ y: number; m: number } | null>(
        (acc, e) => {
          if (!acc) return { y: e.year, m: e.month };
          if (e.year > acc.y || (e.year === acc.y && e.month > acc.m))
            return { y: e.year, m: e.month };
          return acc;
        },
        null,
      );
      const inMonth = latestPeriod
        ? entries.filter(
            (e) => e.year === latestPeriod.y && e.month === latestPeriod.m,
          )
        : [];
      const inMonthPrev = latestPeriod
        ? entries.filter(
            (e) => e.year === latestPeriod.y - 1 && e.month === latestPeriod.m,
          )
        : [];
      const reported = new Set(inMonth.map((e) => e.hotel_id)).size;
      const reportedPrev = new Set(inMonthPrev.map((e) => e.hotel_id)).size;
      const reportingPct = hotels.length > 0 ? (reported / hotels.length) * 100 : 0;
      const reportingPrevPct = hotels.length > 0 ? (reportedPrev / hotels.length) * 100 : 0;
      const reportingDelta = reportingPrevPct > 0 ? reportingPct - reportingPrevPct : null;

      // "On-target" = hotel beating the -5% YoY CO₂e/occ goal
      const onTarget = inMonth.filter((e) => {
        const occ = e.occupied_room_nights ?? 0;
        const prev = inMonthPrev.find((p) => p.hotel_id === e.hotel_id);
        const occPrev = prev?.occupied_room_nights ?? 0;
        if (occ === 0 || occPrev === 0 || !prev) return false;
        const cur = calculateCO2e(e) / occ;
        const old = calculateCO2e(prev) / occPrev;
        return old > 0 && ((cur - old) / old) * 100 <= TARGET_YOY;
      }).length;
      const onTargetPct = reported > 0 ? (onTarget / reported) * 100 : 0;

      const co2 = inMonth.reduce((s, e) => s + calculateCO2e(e), 0);
      const co2Prev = inMonthPrev.reduce((s, e) => s + calculateCO2e(e), 0);
      const co2Delta = co2Prev > 0 ? ((co2 - co2Prev) / co2Prev) * 100 : null;

      // Sparkline: portfolio CO₂e by month, last 12 months
      const byPeriod = new Map<string, number>();
      entries.forEach((e) => {
        const k = `${e.year}-${String(e.month).padStart(2, "0")}`;
        byPeriod.set(k, (byPeriod.get(k) ?? 0) + calculateCO2e(e));
      });
      const co2Spark = [...byPeriod.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .slice(-12)
        .map(([, v]) => v);

      return [
        {
          label: "Hotels reporting",
          value: `${reported}/${hotels.length}`,
          hint: reportingPct >= 80 ? "Good coverage" : "Coverage below 80%",
          icon: Building2,
          delta: reportingDelta,
          tone: reportingPct >= 80 ? "good" : reportingPct >= 50 ? "neutral" : "warn",
          // override: higher reporting is better
          higherIsBetter: true,
        },
        {
          label: "On target (−5% YoY)",
          value: reported > 0 ? `${Math.round(onTargetPct)}` : "—",
          unit: "%",
          hint: `${onTarget} of ${reported} hotels meeting goal`,
          tone: onTargetPct >= 60 ? "good" : onTargetPct >= 30 ? "neutral" : "warn",
          icon: BarChart3,
          higherIsBetter: true,
          delta: reported > 0 ? onTargetPct - 60 : null, // distance from 60% threshold
        },
        {
          label: "Portfolio CO₂e vs LY",
          value: co2Delta !== null ? `${co2Delta > 0 ? "+" : ""}${co2Delta.toFixed(0)}` : "—",
          unit: "%",
          hint:
            co2Delta === null
              ? "Need 12 months"
              : co2Delta <= TARGET_YOY
                ? "Beating −5% target"
                : co2Delta <= 0
                  ? "Improving, below target"
                  : "Above last year",
          icon: Leaf,
          delta: co2Delta,
          tone:
            co2Delta === null
              ? "neutral"
              : co2Delta <= TARGET_YOY
                ? "good"
                : co2Delta <= 0
                  ? "neutral"
                  : "warn",
          spark: co2Spark,
          isTrendCard: true,
        },
      ];
    }

    // super_admin → program health
    const totalHotels = hotels.length;
    const onboarded = new Set(entries.map((e) => e.hotel_id)).size;
    const onboardedPct = totalHotels > 0 ? (onboarded / totalHotels) * 100 : 0;
    const expectedFields = entries.length * 5;
    const filledFields = entries.reduce((s, e) => {
      let n = 0;
      if (e.electricity_kwh != null) n++;
      if (e.gas_kwh != null) n++;
      if (e.water_m3 != null) n++;
      if (e.waste_kg != null) n++;
      if (e.occupied_room_nights != null) n++;
      return s + n;
    }, 0);
    const completeness =
      expectedFields > 0 ? (filledFields / expectedFields) * 100 : 0;

    // Program-wide CO₂e/occ trend, last 12 months — used as the trend card
    const byPeriodAdmin = new Map<string, { co2: number; occ: number }>();
    entries.forEach((e) => {
      const k = `${e.year}-${String(e.month).padStart(2, "0")}`;
      const cur = byPeriodAdmin.get(k) ?? { co2: 0, occ: 0 };
      cur.co2 += calculateCO2e(e);
      cur.occ += e.occupied_room_nights ?? 0;
      byPeriodAdmin.set(k, cur);
    });
    const sortedPeriods = [...byPeriodAdmin.entries()].sort(([a], [b]) => a.localeCompare(b));
    const intensitySpark = sortedPeriods.slice(-12).map(([, v]) => (v.occ > 0 ? v.co2 / v.occ : 0));
    // YoY delta on intensity (latest vs same month last year)
    let programYoy: number | null = null;
    if (sortedPeriods.length >= 13) {
      const last = sortedPeriods[sortedPeriods.length - 1][1];
      const yearAgo = sortedPeriods[sortedPeriods.length - 13][1];
      const cur = last.occ > 0 ? last.co2 / last.occ : 0;
      const old = yearAgo.occ > 0 ? yearAgo.co2 / yearAgo.occ : 0;
      programYoy = old > 0 ? ((cur - old) / old) * 100 : null;
    }

    return [
      {
        label: "Hotels onboarded",
        value: `${Math.round(onboardedPct)}`,
        unit: "%",
        hint: `${onboarded} of ${totalHotels} hotels`,
        tone: onboardedPct >= 80 ? "good" : onboardedPct >= 50 ? "neutral" : "warn",
        icon: Building2,
        higherIsBetter: true,
        delta: onboardedPct - 80, // distance from 80% adoption goal
      },
      {
        label: "Data completeness",
        value: `${completeness.toFixed(0)}`,
        unit: "%",
        hint: `${filledFields} / ${expectedFields} fields`,
        tone: completeness >= 80 ? "good" : completeness >= 50 ? "neutral" : "warn",
        icon: Database,
        higherIsBetter: true,
        delta: completeness - 80,
      },
      {
        label: "Program CO₂e vs LY",
        value: programYoy !== null ? `${programYoy > 0 ? "+" : ""}${programYoy.toFixed(0)}` : "—",
        unit: "%",
        hint:
          programYoy === null
            ? "Need 12 months"
            : programYoy <= TARGET_YOY
              ? "Beating −5% target"
              : programYoy <= 0
                ? "Improving, below target"
                : "Above last year",
        tone:
          programYoy === null
            ? "neutral"
            : programYoy <= TARGET_YOY
              ? "good"
              : programYoy <= 0
                ? "neutral"
                : "warn",
        icon: Leaf,
        delta: programYoy,
        spark: intensitySpark,
        isTrendCard: true,
      },
    ];
  }, [profileType, hotels, entries, activeHotelId]);

  return (
    <section className="mb-8 rounded-3xl border border-border/60 bg-card p-5 md:p-6">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.14em] text-primary">
          <Icon className="h-3 w-3" />
          {meta.label}
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          <MapPin className="h-3 w-3" />
          Looking at: <span className="text-foreground">{meta.scope}</span>
        </span>
      </div>
      <p className="mt-3 text-sm text-muted-foreground">{meta.tagline}</p>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {tiles.map((t) => (
          <KpiTile key={t.label} tile={t} />
        ))}
      </div>
    </section>
  );
}

function toneTextClass(tone?: Tone) {
  return tone === "good" ? "text-success" : tone === "warn" ? "text-warning" : "text-foreground";
}

function toneBarClass(tone?: Tone) {
  return tone === "good" ? "bg-success" : tone === "warn" ? "bg-warning" : "bg-muted-foreground/40";
}

function KpiTile({ tile }: { tile: TileData }) {
  const TileIcon = tile.icon;
  const delta = tile.delta;
  const hasDelta = delta !== null && delta !== undefined && Number.isFinite(delta);

  // For "lower is better" KPIs (energy/water/CO2), down is good.
  const ArrowIcon = !hasDelta
    ? Minus
    : delta! < -0.5
      ? ArrowDown
      : delta! > 0.5
        ? ArrowUp
        : Minus;

  // micro-bar fill: clamp |delta| between 0 and 30 → 0-100%
  const fillPct = hasDelta ? Math.min(100, Math.max(8, Math.abs(delta!) * 4 + 8)) : 0;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-background p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
          {tile.label}
        </div>
        {TileIcon && (
          <TileIcon className="h-4 w-4 shrink-0 text-muted-foreground/70" />
        )}
      </div>

      <div className="mt-2 flex items-baseline gap-1.5">
        {tile.isTrendCard && hasDelta && (
          <ArrowIcon className={"h-6 w-6 " + toneTextClass(tile.tone)} />
        )}
        <span className={"font-serif text-2xl font-semibold num leading-none " + toneTextClass(tile.tone)}>
          {tile.value}
        </span>
        {tile.unit && (
          <span className="text-sm font-normal text-muted-foreground">{tile.unit}</span>
        )}
      </div>

      {/* Sparkline for trend cards */}
      {tile.isTrendCard && tile.spark && tile.spark.length >= 2 && (
        <Sparkline data={tile.spark} tone={tile.tone} />
      )}

      {/* Micro performance bar for non-trend cards with a delta */}
      {!tile.isTrendCard && hasDelta && (
        <div className="mt-3">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/60">
            <div
              className={"h-full rounded-full transition-all " + toneBarClass(tile.tone)}
              style={{ width: `${fillPct}%` }}
            />
          </div>
          <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground">
            <span className="inline-flex items-center gap-0.5">
              <ArrowIcon className={"h-3 w-3 " + toneTextClass(tile.tone)} />
              <span className={"num " + toneTextClass(tile.tone)}>
                {delta! > 0 ? "+" : ""}{delta!.toFixed(0)}
                {tile.higherIsBetter ? "pp" : "%"}
              </span>
              <span>{tile.higherIsBetter ? "vs target" : "vs last year"}</span>
            </span>
          </div>
        </div>
      )}

      {/* Footer: hint as muted text or status badge */}
      <div className="mt-2">
        {tile.tone === "good" || tile.tone === "warn" ? (
          <span
            className={
              "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium " +
              (tile.tone === "good"
                ? "bg-success/10 text-success"
                : "bg-warning/10 text-warning")
            }
          >
            {tile.hint}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">{tile.hint}</span>
        )}
      </div>
    </div>
  );
}

function Sparkline({ data, tone }: { data: number[]; tone?: Tone }) {
  const w = 120;
  const h = 28;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const step = data.length > 1 ? w / (data.length - 1) : w;
  const points = data
    .map((v, i) => `${(i * step).toFixed(1)},${(h - ((v - min) / range) * h).toFixed(1)}`)
    .join(" ");
  const stroke =
    tone === "good" ? "var(--success)" : tone === "warn" ? "var(--warning)" : "var(--muted-foreground)";
  const fill =
    tone === "good"
      ? "color-mix(in oklab, var(--success) 18%, transparent)"
      : tone === "warn"
        ? "color-mix(in oklab, var(--warning) 18%, transparent)"
        : "color-mix(in oklab, var(--muted-foreground) 14%, transparent)";
  const areaPoints = `0,${h} ${points} ${w},${h}`;
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="mt-3 h-7 w-full"
      preserveAspectRatio="none"
      aria-hidden
    >
      <polygon points={areaPoints} fill={fill} />
      <polyline points={points} fill="none" stroke={stroke} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
