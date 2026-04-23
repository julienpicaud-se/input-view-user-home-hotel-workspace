CREATE TABLE public.user_profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  display_name TEXT,
  email TEXT,
  timezone TEXT NOT NULL DEFAULT 'Europe/Rome',
  company_name TEXT,
  company_role TEXT,
  preferred_units TEXT NOT NULL DEFAULT 'metric',
  email_notifications BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read profiles"
ON public.user_profiles
FOR SELECT
USING (true);

CREATE POLICY "Public write profiles"
ON public.user_profiles
FOR ALL
USING (true)
WITH CHECK (true);

CREATE TRIGGER user_profiles_set_updated_at
BEFORE UPDATE ON public.user_profiles
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- Seed a default demo profile that matches the local id used by the app
INSERT INTO public.user_profiles (id, display_name, email, timezone, company_name, company_role)
VALUES (
  '00000000-0000-0000-0000-0000000000aa',
  'Hotel Manager',
  'manager@example.com',
  'Europe/Rome',
  'RA+ Hospitality',
  'Sustainability Manager'
);