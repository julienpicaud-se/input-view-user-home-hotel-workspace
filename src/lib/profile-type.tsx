import * as React from "react";
import { supabase } from "@/integrations/supabase/client";
import { DEMO_PROFILE_ID } from "@/lib/user-profile";

/**
 * Three role lenses on the same data.
 *  - hotel_user  → Single Hotel Operator (operational, per-room KPIs)
 *  - vpo         → VPO / Regional Manager (portfolio comparison, outliers)
 *  - super_admin → Central Super Admin (program health, governance, drill-down)
 */
export type ProfileType = "hotel_user" | "vpo" | "super_admin";

const STORAGE_KEY = "ra-plus-profile-type";

interface ProfileTypeContextValue {
  profileType: ProfileType;
  setProfileType: (p: ProfileType) => void;
}

const Ctx = React.createContext<ProfileTypeContextValue | null>(null);

function readInitial(): ProfileType {
  if (typeof window === "undefined") return "hotel_user";
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    if (v === "vpo" || v === "super_admin" || v === "hotel_user") return v;
  } catch {
    /* ignore */
  }
  return "hotel_user";
}

export function ProfileTypeProvider({ children }: { children: React.ReactNode }) {
  const [profileType, setState] = React.useState<ProfileType>("hotel_user");

  // Hydrate from localStorage first, then DB (DB wins if present).
  React.useEffect(() => {
    setState(readInitial());
    void (async () => {
      const { data } = await supabase
        .from("user_profiles")
        .select("profile_type")
        .eq("id", DEMO_PROFILE_ID)
        .maybeSingle();
      const dbVal = (data as { profile_type?: string } | null)?.profile_type;
      if (dbVal === "vpo" || dbVal === "super_admin" || dbVal === "hotel_user") {
        setState(dbVal);
        try {
          window.localStorage.setItem(STORAGE_KEY, dbVal);
        } catch {
          /* ignore */
        }
      }
    })();
  }, []);

  const setProfileType = React.useCallback((p: ProfileType) => {
    setState(p);
    try {
      window.localStorage.setItem(STORAGE_KEY, p);
    } catch {
      /* ignore */
    }
    // Best-effort persist to DB; ignore failures (demo profile may not exist yet).
    void supabase
      .from("user_profiles")
      .update({ profile_type: p })
      .eq("id", DEMO_PROFILE_ID);
  }, []);

  const value = React.useMemo(
    () => ({ profileType, setProfileType }),
    [profileType, setProfileType],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useProfileType(): ProfileTypeContextValue {
  const ctx = React.useContext(Ctx);
  if (!ctx) return { profileType: "hotel_user", setProfileType: () => {} };
  return ctx;
}

export const PROFILE_TYPE_META: Record<
  ProfileType,
  { label: string; short: string; scope: string; tagline: string }
> = {
  hotel_user: {
    label: "Hotel User",
    short: "Hotel",
    scope: "Single hotel",
    tagline: "Operational KPIs, vs last year and target.",
  },
  vpo: {
    label: "VPO / Regional Manager",
    short: "VPO",
    scope: "Portfolio",
    tagline: "Compare hotels, spot outliers, support the network.",
  },
  super_admin: {
    label: "Central Super Admin",
    short: "Group",
    scope: "Group / Program",
    tagline: "Program health, data quality and governance.",
  },
};
