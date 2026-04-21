
-- Hotels table
CREATE TABLE public.hotels (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  rooms INTEGER NOT NULL,
  region TEXT NOT NULL,
  star_rating INTEGER NOT NULL DEFAULT 4,
  climate_zone TEXT NOT NULL DEFAULT 'Mediterranean',
  size_band TEXT NOT NULL DEFAULT '100-150',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Monthly entries table
CREATE TABLE public.monthly_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  hotel_id UUID NOT NULL REFERENCES public.hotels(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  electricity_kwh NUMERIC,
  gas_kwh NUMERIC,
  water_m3 NUMERIC,
  waste_kg NUMERIC,
  occupied_room_nights INTEGER,
  renewable_pct NUMERIC,
  recycled_pct NUMERIC,
  attachment_url TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (hotel_id, year, month)
);

-- Assistant messages table
CREATE TABLE public.assistant_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  hotel_id UUID NOT NULL REFERENCES public.hotels(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_monthly_entries_hotel ON public.monthly_entries(hotel_id, year DESC, month DESC);
CREATE INDEX idx_assistant_messages_hotel ON public.assistant_messages(hotel_id, created_at DESC);

-- Enable RLS
ALTER TABLE public.hotels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monthly_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assistant_messages ENABLE ROW LEVEL SECURITY;

-- Permissive policies for v1 demo (no auth)
CREATE POLICY "Public read hotels" ON public.hotels FOR SELECT USING (true);
CREATE POLICY "Public write hotels" ON public.hotels FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Public read entries" ON public.monthly_entries FOR SELECT USING (true);
CREATE POLICY "Public write entries" ON public.monthly_entries FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Public read messages" ON public.assistant_messages FOR SELECT USING (true);
CREATE POLICY "Public write messages" ON public.assistant_messages FOR ALL USING (true) WITH CHECK (true);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_hotels_updated BEFORE UPDATE ON public.hotels
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_entries_updated BEFORE UPDATE ON public.monthly_entries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Seed the demo hotel
INSERT INTO public.hotels (id, name, rooms, region, star_rating, climate_zone, size_band)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'The Marbella Grand',
  120,
  'Mediterranean',
  5,
  'Mediterranean',
  '100-150'
);

-- Seed 14 months of realistic data (currently April 2026 — log up through Feb 2026, leave Mar/Apr empty)
-- Marbella: hot summers (high AC = electricity), winter heating (gas), pool/irrigation in summer (water)
INSERT INTO public.monthly_entries (hotel_id, year, month, electricity_kwh, gas_kwh, water_m3, waste_kg, occupied_room_nights, renewable_pct, recycled_pct)
VALUES
  ('00000000-0000-0000-0000-000000000001', 2025, 1, 78500, 42000, 1850, 4200, 1860, 22, 38),
  ('00000000-0000-0000-0000-000000000001', 2025, 2, 72300, 38500, 1720, 3950, 1740, 24, 40),
  ('00000000-0000-0000-0000-000000000001', 2025, 3, 76800, 31000, 1980, 4350, 2100, 25, 41),
  ('00000000-0000-0000-0000-000000000001', 2025, 4, 81200, 22000, 2450, 5100, 2520, 27, 42),
  ('00000000-0000-0000-0000-000000000001', 2025, 5, 92400, 14500, 3120, 6200, 3150, 28, 44),
  ('00000000-0000-0000-0000-000000000001', 2025, 6, 118500, 8200, 4280, 7850, 3480, 30, 45),
  ('00000000-0000-0000-0000-000000000001', 2025, 7, 142800, 5400, 5640, 9200, 3680, 31, 46),
  ('00000000-0000-0000-0000-000000000001', 2025, 8, 148200, 5100, 5820, 9450, 3700, 31, 47),
  ('00000000-0000-0000-0000-000000000001', 2025, 9, 121500, 8800, 4520, 7980, 3420, 30, 46),
  ('00000000-0000-0000-0000-000000000001', 2025, 10, 94600, 18500, 3180, 6100, 2880, 29, 45),
  ('00000000-0000-0000-0000-000000000001', 2025, 11, 82400, 32000, 2240, 4850, 2280, 26, 43),
  ('00000000-0000-0000-0000-000000000001', 2025, 12, 84200, 41500, 2080, 5320, 2520, 24, 42),
  ('00000000-0000-0000-0000-000000000001', 2026, 1, 81100, 43800, 1920, 4380, 1920, 26, 44),
  ('00000000-0000-0000-0000-000000000001', 2026, 2, 74600, 39200, 1780, 4020, 1800, 28, 45);
