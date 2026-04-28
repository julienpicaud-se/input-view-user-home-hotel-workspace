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
      const reported = new Set(inMonth.map((e) => e.hotel_id)).size;
      const onTrack = inMonth.filter((e) => {
        const occ = e.occupied_room_nights ?? 0;
        const elec = Number(e.electricity_kwh ?? 0);
        return occ > 0 && elec / occ < 30; // simple heuristic
      }).length;
      const co2 = inMonth.reduce((s, e) => s + calculateCO2e(e), 0);
      return [
        {
          label: "Hotels reporting",
          value: `${reported}/${hotels.length}`,
          hint: "Latest period",
          icon: Building2,
        },
        {
          label: "On-track vs target",
          value: reported > 0 ? `${Math.round((onTrack / reported) * 100)}` : "—",
          unit: "%",
          hint: `${onTrack} of ${reported} hotels`,
          tone: reported > 0 && onTrack / reported >= 0.6 ? "good" : "warn",
          icon: BarChart3,
        },
        {
          label: "Portfolio CO₂e",
          value: `${formatNumber(Math.round(co2))}`,
          unit: "kg",
          hint: "Sum of latest period",
          icon: Leaf,
        },
      ];
    }
    // super_admin → program health
    const totalHotels = hotels.length;
    const onboarded = new Set(entries.map((e) => e.hotel_id)).size;
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
    return [
      {
        label: "Hotels onboarded",
        value: `${Math.round((onboarded / Math.max(1, totalHotels)) * 100)}%`,
        hint: `${onboarded} of ${totalHotels}`,
        tone: onboarded / Math.max(1, totalHotels) >= 0.8 ? "good" : "warn",
      },
      {
        label: "Data completeness",
        value: `${completeness.toFixed(0)}%`,
        hint: `${filledFields} / ${expectedFields} fields`,
        tone: completeness >= 80 ? "good" : completeness >= 50 ? "neutral" : "warn",
      },
      {
        label: "KPI coverage",
        value: `${entries.length}`,
        hint: "Total monthly entries logged",
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
          <div
            key={t.label}
            className="rounded-2xl border border-border/60 bg-background p-4"
          >
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {t.label}
            </div>
            <div
              className={
                "mt-1 font-serif text-2xl font-semibold num " +
                (t.tone === "good"
                  ? "text-success"
                  : t.tone === "warn"
                    ? "text-warning"
                    : "text-foreground")
              }
            >
              {t.value}
            </div>
            <div className="mt-0.5 text-xs text-muted-foreground">{t.hint}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
