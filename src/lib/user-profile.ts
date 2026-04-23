// Demo profile id used while there is no auth wired up yet.
// Mirrors the DEMO_HOTEL_ID pattern in src/lib/hotel.ts.
export const DEMO_PROFILE_ID = "00000000-0000-0000-0000-0000000000aa";

export interface UserProfile {
  id: string;
  display_name: string | null;
  email: string | null;
  timezone: string;
  company_name: string | null;
  company_role: string | null;
  preferred_units: string;
  email_notifications: boolean;
}

// A small curated list — covers the most common hotel ops time zones.
export const TIMEZONES: { value: string; label: string }[] = [
  { value: "Europe/London", label: "London (GMT/BST)" },
  { value: "Europe/Paris", label: "Paris (CET/CEST)" },
  { value: "Europe/Rome", label: "Rome (CET/CEST)" },
  { value: "Europe/Madrid", label: "Madrid (CET/CEST)" },
  { value: "Europe/Berlin", label: "Berlin (CET/CEST)" },
  { value: "Europe/Athens", label: "Athens (EET/EEST)" },
  { value: "Africa/Cairo", label: "Cairo (EET)" },
  { value: "Asia/Dubai", label: "Dubai (GST)" },
  { value: "Asia/Singapore", label: "Singapore (SGT)" },
  { value: "Asia/Tokyo", label: "Tokyo (JST)" },
  { value: "Australia/Sydney", label: "Sydney (AEST/AEDT)" },
  { value: "America/New_York", label: "New York (ET)" },
  { value: "America/Chicago", label: "Chicago (CT)" },
  { value: "America/Denver", label: "Denver (MT)" },
  { value: "America/Los_Angeles", label: "Los Angeles (PT)" },
  { value: "America/Sao_Paulo", label: "São Paulo (BRT)" },
];
