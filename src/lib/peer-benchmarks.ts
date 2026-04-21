/**
 * Deterministic seeded peer benchmark generator.
 * Returns realistic intensity distributions (per occupied room-night)
 * for hotels of similar size, region and season.
 */

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(parts: (string | number)[]): number {
  let h = 2166136261;
  for (const p of parts) {
    const s = String(p);
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
  }
  return h >>> 0;
}

export interface PeerStats {
  p10: number;
  p25: number;
  median: number;
  p75: number;
  p90: number;
  bestInClass: number; // top 10% benchmark (lowest)
  count: number;
}

// Seasonal multipliers for a Mediterranean property
const SEASONAL = {
  electricity: [0.7, 0.65, 0.7, 0.75, 0.85, 1.05, 1.25, 1.3, 1.1, 0.85, 0.75, 0.78],
  gas:         [1.4, 1.3, 1.05, 0.75, 0.5, 0.3, 0.2, 0.2, 0.3, 0.6, 1.0, 1.35],
  water:       [0.65, 0.62, 0.7, 0.85, 1.05, 1.3, 1.5, 1.55, 1.3, 1.0, 0.78, 0.72],
  waste:       [0.75, 0.72, 0.8, 0.9, 1.0, 1.15, 1.3, 1.32, 1.2, 1.0, 0.85, 0.82],
};

// Base intensities (per occupied room-night) — typical mid-luxury Mediterranean hotel
const BASE = {
  electricity_kwh: 38,
  gas_kwh: 14,
  water_m3: 1.1,
  waste_kg: 2.4,
};

export type Utility = "electricity" | "gas" | "water" | "waste";

const UTIL_KEY: Record<Utility, keyof typeof BASE> = {
  electricity: "electricity_kwh",
  gas: "gas_kwh",
  water: "water_m3",
  waste: "waste_kg",
};

export function getPeerStats(
  utility: Utility,
  month: number, // 1-12
  filters: { sizeBand: string; region: string; starRating: number }
): PeerStats {
  const seed = hashSeed([utility, month, filters.sizeBand, filters.region, filters.starRating]);
  const rng = mulberry32(seed);

  const baseKey = UTIL_KEY[utility];
  const seasonalMult = SEASONAL[utility][month - 1];
  const center = BASE[baseKey] * seasonalMult;

  // Generate 42 simulated peers
  const peers = Array.from({ length: 42 }, () => {
    // Log-normal-ish distribution
    const noise = (rng() + rng() + rng()) / 3; // tends to center
    const variance = 0.45; // ±45% spread
    return center * (1 + (noise - 0.5) * variance * 2);
  }).sort((a, b) => a - b);

  const pct = (p: number) => peers[Math.floor(p * peers.length)];

  return {
    p10: pct(0.1),
    p25: pct(0.25),
    median: pct(0.5),
    p75: pct(0.75),
    p90: pct(0.9),
    bestInClass: pct(0.1),
    count: peers.length,
  };
}

export function getPeerCohortSize(filters: {
  sizeBand: string;
  region: string;
  starRating: number;
}): number {
  // Stable cohort size based on filters
  const seed = hashSeed(["cohort", filters.sizeBand, filters.region, filters.starRating]);
  return 32 + (seed % 18); // 32-49 peers
}

/**
 * Returns the percentile rank of `value` within the peer distribution.
 * Lower value = better rank (e.g., 12 means top 12%).
 */
export function getPeerRank(value: number, stats: PeerStats): number {
  // Lower is better — rank 0 = best
  if (value <= stats.p10) return 5;
  if (value <= stats.p25) return 18;
  if (value <= stats.median) return 38;
  if (value <= stats.p75) return 62;
  if (value <= stats.p90) return 82;
  return 95;
}
