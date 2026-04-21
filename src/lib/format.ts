export function formatNumber(n: number | null | undefined, digits = 0): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(n);
}

export function formatPct(n: number | null | undefined, digits = 1): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(digits)}%`;
}

export function pctChange(curr: number | null, prev: number | null): number | null {
  if (curr === null || prev === null || prev === 0) return null;
  return ((curr - prev) / prev) * 100;
}

export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export const MONTH_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

// CO2e emission factors (kg CO2e per unit) — simplified averages
export const CO2_FACTORS = {
  electricity_kwh: 0.233,  // grid avg
  gas_kwh: 0.184,
  water_m3: 0.344,
  waste_kg: 0.467,         // landfill mixed waste
};

export function calculateCO2e(entry: {
  electricity_kwh?: number | null;
  gas_kwh?: number | null;
  water_m3?: number | null;
  waste_kg?: number | null;
  renewable_pct?: number | null;
}): number {
  const renewableFactor = 1 - (entry.renewable_pct ?? 0) / 100;
  const elec = (entry.electricity_kwh ?? 0) * CO2_FACTORS.electricity_kwh * renewableFactor;
  const gas = (entry.gas_kwh ?? 0) * CO2_FACTORS.gas_kwh;
  const water = (entry.water_m3 ?? 0) * CO2_FACTORS.water_m3;
  const waste = (entry.waste_kg ?? 0) * CO2_FACTORS.waste_kg;
  return elec + gas + water + waste;
}
