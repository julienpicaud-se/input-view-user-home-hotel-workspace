import * as React from "react";
import {
  Activity,
  Zap,
  Droplets,
  Recycle,
  Cloud,
  ShieldCheck,
  Target,
  BarChart3,
  Globe2,
  Database,
  Settings2,
  Gauge,
  FileCheck2,
  type LucideIcon,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { DEMO_PROFILE_ID } from "@/lib/user-profile";

/**
 * Accor RFP–aligned interest categories (Lot 2a / 2b).
 * Each interest only changes ORDER, EMPHASIS and DEFAULT VISIBILITY of
 * existing widgets — never the data, the navigation or the page set.
 */
export type InterestId =
  | "ops"
  | "energy"
  | "water"
  | "waste"
  | "carbon"
  | "actions"
  | "targets"
  | "benchmarks"
  | "portfolio"
  | "data_quality"
  | "governance"
  | "realtime"
  | "reporting";

export interface InterestMeta {
  id: InterestId;
  label: string;
  tagline: string;
  icon: LucideIcon;
  /** Tailwind classes for the card accent in the onboarding picker. */
  accent: string;
}

export const INTERESTS: InterestMeta[] = [
  {
    id: "ops",
    label: "Hotel operational performance",
    tagline: "Steer ESG at hotel level with activity-based metrics.",
    icon: Activity,
    accent: "from-amber-500/30 to-amber-500/5",
  },
  {
    id: "energy",
    label: "Energy performance & efficiency",
    tagline: "Energy use, intensity and renewable share.",
    icon: Zap,
    accent: "from-yellow-500/30 to-yellow-500/5",
  },
  {
    id: "water",
    label: "Water performance & stewardship",
    tagline: "Consumption and reduction efforts.",
    icon: Droplets,
    accent: "from-sky-500/30 to-sky-500/5",
  },
  {
    id: "waste",
    label: "Waste & circularity",
    tagline: "Reduce waste and food waste, raise diversion rates.",
    icon: Recycle,
    accent: "from-emerald-500/30 to-emerald-500/5",
  },
  {
    id: "carbon",
    label: "Carbon footprint (Scope 1, 2 & 3)",
    tagline: "Understand emissions drivers and intensity.",
    icon: Cloud,
    accent: "from-slate-500/30 to-slate-500/5",
  },
  {
    id: "actions",
    label: "Sustainability actions & compliance",
    tagline: "Implementation of Accor sustainability programs.",
    icon: ShieldCheck,
    accent: "from-violet-500/30 to-violet-500/5",
  },
  {
    id: "targets",
    label: "Progress vs Accor targets",
    tagline: "Trajectory and gap to corporate objectives.",
    icon: Target,
    accent: "from-rose-500/30 to-rose-500/5",
  },
  {
    id: "benchmarks",
    label: "Benchmarking & comparison",
    tagline: "Compare hotels, regions, brands or portfolios.",
    icon: BarChart3,
    accent: "from-indigo-500/30 to-indigo-500/5",
  },
  {
    id: "portfolio",
    label: "Portfolio or regional oversight",
    tagline: "Aggregate and steer multiple hotels.",
    icon: Globe2,
    accent: "from-cyan-500/30 to-cyan-500/5",
  },
  {
    id: "data_quality",
    label: "Data completion & quality",
    tagline: "Missing data, anomalies and readiness.",
    icon: Database,
    accent: "from-orange-500/30 to-orange-500/5",
  },
  {
    id: "governance",
    label: "Program health & governance",
    tagline: "ESG program rollout and group-level coverage.",
    icon: Settings2,
    accent: "from-fuchsia-500/30 to-fuchsia-500/5",
  },
  {
    id: "realtime",
    label: "Real-time energy & water monitoring",
    tagline: "Detect drift with granular data (when available).",
    icon: Gauge,
    accent: "from-lime-500/30 to-lime-500/5",
  },
  {
    id: "reporting",
    label: "Reporting & audit readiness",
    tagline: "Internal and external sustainability reporting.",
    icon: FileCheck2,
    accent: "from-teal-500/30 to-teal-500/5",
  },
];

export const INTEREST_META: Record<InterestId, InterestMeta> = INTERESTS.reduce(
  (acc, i) => {
    acc[i.id] = i;
    return acc;
  },
  {} as Record<InterestId, InterestMeta>,
);

/** Sections we can re-order on the homepage. */
export type SectionId =
  | "briefing"
  | "role_banner"
  | "kpi_glance"
  | "sera"
  | "todos"
  | "data_quality";

/**
 * Map each interest → sections it boosts (ascending priority weight).
 * Section default order is preserved when no interest is selected.
 */
const INTEREST_SECTION_BOOST: Record<InterestId, Partial<Record<SectionId, number>>> = {
  ops: { kpi_glance: 3, briefing: 2 },
  energy: { kpi_glance: 3, briefing: 2 },
  water: { kpi_glance: 3 },
  waste: { kpi_glance: 2 },
  carbon: { kpi_glance: 3, briefing: 2 },
  actions: { todos: 3 },
  targets: { kpi_glance: 3, briefing: 3, role_banner: 2 },
  benchmarks: { role_banner: 3, sera: 2 },
  portfolio: { role_banner: 4, kpi_glance: 2 },
  data_quality: { data_quality: 5, todos: 3 },
  governance: { data_quality: 4, role_banner: 2, todos: 2 },
  realtime: { kpi_glance: 2, sera: 2 },
  reporting: { data_quality: 3, todos: 2 },
};

/** Default order of sections (used as tiebreaker). */
const DEFAULT_SECTION_ORDER: SectionId[] = [
  "briefing",
  "role_banner",
  "kpi_glance",
  "sera",
  "todos",
  "data_quality",
];

export function orderedSections(interests: InterestId[]): SectionId[] {
  const score = new Map<SectionId, number>();
  DEFAULT_SECTION_ORDER.forEach((s, i) => {
    // Negative base score so default order is preserved when no boosts apply.
    score.set(s, -i * 0.01);
  });
  for (const id of interests) {
    const boosts = INTEREST_SECTION_BOOST[id] ?? {};
    for (const [s, w] of Object.entries(boosts)) {
      const sec = s as SectionId;
      score.set(sec, (score.get(sec) ?? 0) + (w ?? 0));
    }
  }
  return [...DEFAULT_SECTION_ORDER].sort(
    (a, b) => (score.get(b) ?? 0) - (score.get(a) ?? 0),
  );
}

/** Whether a given interest is selected (helper). */
export function hasInterest(interests: InterestId[], id: InterestId): boolean {
  return interests.includes(id);
}

// ─── Provider ────────────────────────────────────────────────────────────────
const STORAGE_KEY = "ra-plus-interests";
const ONBOARDED_KEY = "ra-plus-interests-onboarded";

interface InterestsContextValue {
  interests: InterestId[];
  onboarded: boolean;
  setInterests: (ids: InterestId[]) => void;
  markOnboarded: () => void;
  reopenOnboarding: () => void;
  showOnboarding: boolean;
}

const Ctx = React.createContext<InterestsContextValue | null>(null);

function readInitial(): { interests: InterestId[]; onboarded: boolean } {
  if (typeof window === "undefined") return { interests: [], onboarded: false };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const onb = window.localStorage.getItem(ONBOARDED_KEY) === "1";
    if (!raw) return { interests: [], onboarded: onb };
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      const valid = parsed.filter(
        (x): x is InterestId =>
          typeof x === "string" && (INTEREST_META as Record<string, unknown>)[x] !== undefined,
      );
      return { interests: valid, onboarded: onb };
    }
  } catch {
    /* ignore */
  }
  return { interests: [], onboarded: false };
}

export function InterestsProvider({ children }: { children: React.ReactNode }) {
  const [interests, setState] = React.useState<InterestId[]>([]);
  const [onboarded, setOnboarded] = React.useState(false);
  const [showOnboarding, setShowOnboarding] = React.useState(false);

  React.useEffect(() => {
    const initial = readInitial();
    setState(initial.interests);
    setOnboarded(initial.onboarded);
    // Hydrate from DB if present (DB wins).
    void (async () => {
      const { data } = await supabase
        .from("user_profiles")
        .select("interests, interests_onboarded")
        .eq("id", DEMO_PROFILE_ID)
        .maybeSingle();
      const row = data as
        | { interests?: string[] | null; interests_onboarded?: boolean | null }
        | null;
      if (row) {
        if (Array.isArray(row.interests)) {
          const valid = row.interests.filter(
            (x): x is InterestId =>
              (INTEREST_META as Record<string, unknown>)[x] !== undefined,
          );
          setState(valid);
          try {
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(valid));
          } catch {
            /* ignore */
          }
        }
        if (typeof row.interests_onboarded === "boolean") {
          setOnboarded(row.interests_onboarded);
          try {
            window.localStorage.setItem(
              ONBOARDED_KEY,
              row.interests_onboarded ? "1" : "0",
            );
          } catch {
            /* ignore */
          }
          if (!row.interests_onboarded) setShowOnboarding(true);
        }
      } else if (!initial.onboarded) {
        setShowOnboarding(true);
      }
    })();
    if (!initial.onboarded) setShowOnboarding(true);
  }, []);

  const persist = React.useCallback(
    (ids: InterestId[], onbValue?: boolean) => {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
        if (onbValue !== undefined) {
          window.localStorage.setItem(ONBOARDED_KEY, onbValue ? "1" : "0");
        }
      } catch {
        /* ignore */
      }
      const payload: Record<string, unknown> = { interests: ids };
      if (onbValue !== undefined) payload.interests_onboarded = onbValue;
      void supabase
        .from("user_profiles")
        .update(payload)
        .eq("id", DEMO_PROFILE_ID);
    },
    [],
  );

  const setInterests = React.useCallback(
    (ids: InterestId[]) => {
      setState(ids);
      persist(ids);
    },
    [persist],
  );

  const markOnboarded = React.useCallback(() => {
    setOnboarded(true);
    setShowOnboarding(false);
    persist(interests, true);
  }, [interests, persist]);

  const reopenOnboarding = React.useCallback(() => {
    setShowOnboarding(true);
  }, []);

  const value = React.useMemo<InterestsContextValue>(
    () => ({
      interests,
      onboarded,
      setInterests,
      markOnboarded,
      reopenOnboarding,
      showOnboarding,
    }),
    [interests, onboarded, setInterests, markOnboarded, reopenOnboarding, showOnboarding],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useInterests(): InterestsContextValue {
  const ctx = React.useContext(Ctx);
  if (!ctx) {
    return {
      interests: [],
      onboarded: true,
      setInterests: () => {},
      markOnboarded: () => {},
      reopenOnboarding: () => {},
      showOnboarding: false,
    };
  }
  return ctx;
}
