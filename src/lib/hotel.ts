// Multi-hotel demo: a stable "default" hotel id, plus a runtime-active hotel id
// stored in localStorage so the dropdown switcher can change scope app-wide.
export const DEMO_HOTEL_ID = "00000000-0000-0000-0000-000000000001";

const ACTIVE_HOTEL_KEY = "ra-plus-active-hotel-id";

/**
 * Returns the currently selected hotel id (localStorage-backed on the client).
 * Falls back to DEMO_HOTEL_ID on the server or when nothing is set.
 */
export function getActiveHotelId(): string {
  if (typeof window === "undefined") return DEMO_HOTEL_ID;
  try {
    return window.localStorage.getItem(ACTIVE_HOTEL_KEY) || DEMO_HOTEL_ID;
  } catch {
    return DEMO_HOTEL_ID;
  }
}

export function setActiveHotelId(id: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ACTIVE_HOTEL_KEY, id);
  } catch {
    // ignore
  }
}

export interface Hotel {
  id: string;
  name: string;
  rooms: number;
  region: string;
  star_rating: number;
  climate_zone: string;
  size_band: string;
  total_surface_m2: number | null;
  year_built: number | null;
  floors: number | null;
  property_type: string | null;
}

export interface MonthlyEntry {
  id: string;
  hotel_id: string;
  year: number;
  month: number;
  electricity_kwh: number | null;
  gas_kwh: number | null;
  water_m3: number | null;
  waste_kg: number | null;
  occupied_room_nights: number | null;
  renewable_pct: number | null;
  recycled_pct: number | null;
  attachment_url: string | null;
  notes: string | null;
  created_at?: string;
  updated_at?: string;
}
