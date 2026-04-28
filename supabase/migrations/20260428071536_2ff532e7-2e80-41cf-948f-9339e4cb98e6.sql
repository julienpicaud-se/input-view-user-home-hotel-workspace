-- 1. Add profile_type to user_profiles
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS profile_type text NOT NULL DEFAULT 'hotel_user';

ALTER TABLE public.user_profiles
  DROP CONSTRAINT IF EXISTS user_profiles_profile_type_check;

ALTER TABLE public.user_profiles
  ADD CONSTRAINT user_profiles_profile_type_check
  CHECK (profile_type IN ('hotel_user', 'vpo', 'super_admin'));

-- 2. Seed extra demo hotels for portfolio / group views
INSERT INTO public.hotels (id, name, rooms, region, star_rating, climate_zone, size_band, total_surface_m2, year_built, floors, property_type)
VALUES
  ('00000000-0000-0000-0000-0000000000b1', 'Azure Bay Resort', 180, 'Southern Europe', 5, 'Mediterranean', '150-250', 9800, 2012, 6, 'Resort'),
  ('00000000-0000-0000-0000-0000000000b2', 'Northwind City Hotel', 120, 'Northern Europe', 4, 'Continental', '100-150', 6200, 2005, 8, 'City'),
  ('00000000-0000-0000-0000-0000000000b3', 'Olive Grove Inn', 75, 'Southern Europe', 3, 'Mediterranean', '50-100', 3800, 1998, 4, 'Boutique'),
  ('00000000-0000-0000-0000-0000000000b4', 'Skyline Business Hotel', 240, 'Western Europe', 4, 'Oceanic', '150-250', 11200, 2018, 12, 'City'),
  ('00000000-0000-0000-0000-0000000000b5', 'Desert Pearl Lodge', 95, 'Middle East', 5, 'Arid', '50-100', 5400, 2015, 3, 'Resort')
ON CONFLICT (id) DO NOTHING;