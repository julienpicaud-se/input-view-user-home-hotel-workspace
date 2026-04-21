// Single-tenant demo hotel constants
export const DEMO_HOTEL_ID = "00000000-0000-0000-0000-000000000001";

export interface Hotel {
  id: string;
  name: string;
  rooms: number;
  region: string;
  star_rating: number;
  climate_zone: string;
  size_band: string;
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
}
