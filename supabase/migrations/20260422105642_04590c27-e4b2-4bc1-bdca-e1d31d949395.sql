CREATE TABLE public.hotel_settings_changes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  hotel_id UUID NOT NULL REFERENCES public.hotels(id) ON DELETE CASCADE,
  changed_by TEXT,
  field TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_hotel_settings_changes_hotel_created
  ON public.hotel_settings_changes (hotel_id, created_at DESC);

ALTER TABLE public.hotel_settings_changes ENABLE ROW LEVEL SECURITY;

-- Demo app: public read/write (matches existing tables in this project)
CREATE POLICY "Public read settings changes"
  ON public.hotel_settings_changes
  FOR SELECT
  USING (true);

CREATE POLICY "Public write settings changes"
  ON public.hotel_settings_changes
  FOR ALL
  USING (true)
  WITH CHECK (true);