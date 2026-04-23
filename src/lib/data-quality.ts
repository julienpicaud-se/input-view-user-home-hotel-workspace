import type { Hotel, MonthlyEntry } from "@/lib/hotel";
import { MONTH_NAMES } from "@/lib/format";

export type DqSeverity = "critical" | "warning" | "info";

export type DqKind =
  | "missing-month"
  | "zero-or-negative"
  | "implausible-range"
  | "low-occupancy"
  | "huge-jump"
  | "stale-data";

export interface DataQualityIssue {
  id: string;
  hotelId: string;
  hotelName: string;
  kind: DqKind;
  severity: DqSeverity;
  title: string;
  detail: string;
  // For deep-linking the user to the right place
  year?: number;
  month?: number;
  // For out-of-range issues: the actual value, the expected window and unit.
  // Lets the UI render explicit "Expected 5–150 kWh/room-night · got 212.40" chips.
  observed?: { value: number; unit: string };
  expected?: { min: number; max: number; unit: string };
  // Which monthly_entries column this issue refers to (used to deep-link the
  // user to the editable cell in /history).
  field?:
    | "electricity_kwh"
    | "gas_kwh"
    | "water_m3"
    | "waste_kg"
    | "occupied_room_nights";
}

interface BuildIssuesArgs {
  hotels: Hotel[];
  entries: MonthlyEntry[];
  expectedYear: number;
  expectedMonth: number;
}

/**
 * Build a flat list of data-quality issues across all hotels.
 *
 * Heuristics (kept conservative on purpose to avoid noise):
 *  - missing-month: the expected reporting month exists but has no row
 *  - zero-or-negative: a logged value is <= 0 for a utility that is being tracked
 *  - implausible-range: renewable_pct/recycled_pct outside 0..100, or absurd intensities
 *  - low-occupancy: occupancy < 5% of (rooms * days_in_month) — almost always a typo
 *  - huge-jump: utility moved by ≥75% MoM (different threshold from the "spike" anomaly which is ≥20%)
 *  - stale-data: most recent entry is older than 60 days
 */
export function buildDataQualityIssues({
  hotels,
  entries,
  expectedYear,
  expectedMonth,
}: BuildIssuesArgs): DataQualityIssue[] {
  const issues: DataQualityIssue[] = [];
  const now = new Date();

  for (const hotel of hotels) {
    const hEntries = entries
      .filter((e) => e.hotel_id === hotel.id)
      .sort((a, b) => (a.year !== b.year ? a.year - b.year : a.month - b.month));

    const expectedEntry = hEntries.find(
      (e) => e.year === expectedYear && e.month === expectedMonth
    );

    // 1. Missing expected month
    if (!expectedEntry) {
      issues.push({
        id: `dq-missing-${hotel.id}-${expectedYear}-${expectedMonth}`,
        hotelId: hotel.id,
        hotelName: hotel.name,
        kind: "missing-month",
        severity: "critical",
        title: `No entry for ${MONTH_NAMES[expectedMonth - 1]} ${expectedYear}`,
        detail: "The expected reporting month hasn't been logged yet.",
        year: expectedYear,
        month: expectedMonth,
      });
    }

    // 2. Stale data (no entry in the last ~60 days)
    const last = hEntries[hEntries.length - 1];
    if (last) {
      const lastDate = new Date(last.year, last.month - 1, 1);
      const daysSince = Math.floor(
        (now.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24)
      );
      if (daysSince > 60) {
        issues.push({
          id: `dq-stale-${hotel.id}`,
          hotelId: hotel.id,
          hotelName: hotel.name,
          kind: "stale-data",
          severity: "warning",
          title: `No data for ${daysSince} days`,
          detail: `Latest entry is ${MONTH_NAMES[last.month - 1]} ${last.year}.`,
          year: last.year,
          month: last.month,
        });
      }
    } else if (hEntries.length === 0) {
      issues.push({
        id: `dq-no-data-${hotel.id}`,
        hotelId: hotel.id,
        hotelName: hotel.name,
        kind: "stale-data",
        severity: "warning",
        title: "No data logged at all",
        detail: "Add at least one month so Sera can spot trends.",
      });
    }

    // Per-entry checks on the most recent 3 entries
    const recent = hEntries.slice(-3);
    for (const entry of recent) {
      const period = `${MONTH_NAMES[entry.month - 1]} ${entry.year}`;

      // 3. Zero or negative on logged utilities
      const numericFields: { key: keyof MonthlyEntry; label: string; unit: string }[] = [
        { key: "electricity_kwh", label: "Electricity", unit: "kWh" },
        { key: "gas_kwh", label: "Gas", unit: "kWh" },
        { key: "water_m3", label: "Water", unit: "m³" },
        { key: "waste_kg", label: "Waste", unit: "kg" },
      ];
      for (const f of numericFields) {
        const v = entry[f.key];
        if (v === null || v === undefined) continue;
        const n = Number(v);
        if (Number.isFinite(n) && n < 0) {
          issues.push({
            id: `dq-neg-${entry.id}-${String(f.key)}`,
            hotelId: hotel.id,
            hotelName: hotel.name,
            kind: "zero-or-negative",
            severity: "critical",
            title: `${f.label} is negative in ${period}`,
            detail: `Logged value: ${n}${f.unit}. Likely a typo or sign error.`,
            year: entry.year,
            month: entry.month,
          });
        }
      }

      // 4. Implausible percentages (recycled only — renewable_pct intentionally excluded)
      const pctFields: { key: keyof MonthlyEntry; label: string }[] = [
        { key: "recycled_pct", label: "Recycled %" },
      ];
      for (const f of pctFields) {
        const v = entry[f.key];
        if (v === null || v === undefined) continue;
        const n = Number(v);
        if (!Number.isFinite(n)) continue;
        if (n < 0 || n > 100) {
          issues.push({
            id: `dq-pct-${entry.id}-${String(f.key)}`,
            hotelId: hotel.id,
            hotelName: hotel.name,
            kind: "implausible-range",
            severity: "warning",
            title: `${f.label} out of range in ${period}`,
            detail: `Logged value: ${n}%. Should be between 0 and 100.`,
            year: entry.year,
            month: entry.month,
            observed: { value: n, unit: "%" },
            expected: { min: 0, max: 100, unit: "%" },
          });
        }
      }

      // 5. Low occupancy sanity check (only if rooms is set)
      if (hotel.rooms > 0 && entry.occupied_room_nights !== null && entry.occupied_room_nights !== undefined) {
        const daysInMonth = new Date(entry.year, entry.month, 0).getDate();
        const capacity = hotel.rooms * daysInMonth;
        const occ = Number(entry.occupied_room_nights);
        if (occ > 0 && occ < capacity * 0.05) {
          issues.push({
            id: `dq-low-occ-${entry.id}`,
            hotelId: hotel.id,
            hotelName: hotel.name,
            kind: "low-occupancy",
            severity: "info",
            title: `Very low occupancy in ${period}`,
            detail: `${occ} room-nights vs capacity of ${capacity}. Closure month or typo?`,
            year: entry.year,
            month: entry.month,
          });
        }
        if (occ > capacity) {
          issues.push({
            id: `dq-over-occ-${entry.id}`,
            hotelId: hotel.id,
            hotelName: hotel.name,
            kind: "implausible-range",
            severity: "critical",
            title: `Occupancy exceeds capacity in ${period}`,
            detail: `${occ} room-nights but capacity is only ${capacity}.`,
            year: entry.year,
            month: entry.month,
            observed: { value: occ, unit: "room-nights" },
            expected: { min: 0, max: capacity, unit: "room-nights" },
            field: "occupied_room_nights",
          });
        }
      }

      // 5b. Out-of-range intensities per occupied room-night
      // Typical hotel benchmarks (wide bands to flag only obvious data errors):
      //   Electricity: 5–150 kWh / room-night
      //   Gas:         0–120 kWh / room-night
      //   Water:       0.1–3 m³  / room-night
      //   Waste:       0.2–10 kg / room-night
      const occN = Number(entry.occupied_room_nights ?? 0);
      if (occN > 0) {
        const intensityChecks: {
          key: keyof MonthlyEntry;
          label: string;
          unit: string;
          min: number;
          max: number;
        }[] = [
          { key: "electricity_kwh", label: "Electricity", unit: "kWh/room-night", min: 5, max: 150 },
          { key: "gas_kwh", label: "Gas", unit: "kWh/room-night", min: 0, max: 120 },
          { key: "water_m3", label: "Water", unit: "m³/room-night", min: 0.1, max: 3 },
          { key: "waste_kg", label: "Waste", unit: "kg/room-night", min: 0.2, max: 10 },
        ];
        for (const c of intensityChecks) {
          const raw = entry[c.key];
          if (raw === null || raw === undefined) continue;
          const n = Number(raw);
          if (!Number.isFinite(n) || n <= 0) continue;
          const intensity = n / occN;
          if (intensity < c.min || intensity > c.max) {
            const direction = intensity > c.max ? "above" : "below";
            issues.push({
              id: `dq-range-${entry.id}-${String(c.key)}`,
              hotelId: hotel.id,
              hotelName: hotel.name,
              kind: "implausible-range",
              severity: intensity > c.max * 3 || intensity < c.min / 5 ? "critical" : "warning",
              title: `${c.label} intensity ${direction} expected range in ${period}`,
              detail: `${intensity.toFixed(2)} ${c.unit} (typical: ${c.min}–${c.max}). Check meter reading or unit.`,
              year: entry.year,
              month: entry.month,
              observed: { value: Number(intensity.toFixed(2)), unit: c.unit },
              expected: { min: c.min, max: c.max, unit: c.unit },
              field: c.key as DataQualityIssue["field"],
            });
          }
        }
      }
    }

    // 6. Huge MoM jump (≥75%) on the latest entry
    if (hEntries.length >= 2) {
      const cur = hEntries[hEntries.length - 1];
      const prior = hEntries[hEntries.length - 2];
      const period = `${MONTH_NAMES[cur.month - 1]} ${cur.year}`;
      const utils: { key: keyof MonthlyEntry; label: string; unit: string }[] = [
        { key: "electricity_kwh", label: "Electricity", unit: "kWh" },
        { key: "gas_kwh", label: "Gas", unit: "kWh" },
        { key: "water_m3", label: "Water", unit: "m³" },
        { key: "waste_kg", label: "Waste", unit: "kg" },
      ];
      for (const u of utils) {
        const c = Number(cur[u.key] ?? 0);
        const p = Number(prior[u.key] ?? 0);
        if (p <= 0 || c <= 0) continue;
        const change = ((c - p) / p) * 100;
        if (Math.abs(change) >= 75) {
          issues.push({
            id: `dq-jump-${cur.id}-${String(u.key)}`,
            hotelId: hotel.id,
            hotelName: hotel.name,
            kind: "huge-jump",
            severity: "warning",
            title: `${u.label} ${change > 0 ? "jumped" : "dropped"} ${Math.abs(change).toFixed(0)}% in ${period}`,
            detail: `From ${Math.round(p)}${u.unit} to ${Math.round(c)}${u.unit} vs prior month — please confirm the meter reading.`,
            year: cur.year,
            month: cur.month,
            field: u.key as DataQualityIssue["field"],
          });
        }
      }
    }
  }

  // Sort: critical → warning → info, then by hotel name
  const sevRank: Record<DqSeverity, number> = { critical: 0, warning: 1, info: 2 };
  issues.sort((a, b) => {
    const s = sevRank[a.severity] - sevRank[b.severity];
    if (s !== 0) return s;
    return a.hotelName.localeCompare(b.hotelName);
  });

  return issues;
}

export function summariseIssues(issues: DataQualityIssue[]): {
  critical: number;
  warning: number;
  info: number;
  total: number;
} {
  let critical = 0,
    warning = 0,
    info = 0;
  for (const i of issues) {
    if (i.severity === "critical") critical++;
    else if (i.severity === "warning") warning++;
    else info++;
  }
  return { critical, warning, info, total: issues.length };
}
