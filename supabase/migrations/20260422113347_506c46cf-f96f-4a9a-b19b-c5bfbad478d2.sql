ALTER TABLE public.hotels
  ADD COLUMN IF NOT EXISTS total_surface_m2 integer,
  ADD COLUMN IF NOT EXISTS year_built integer,
  ADD COLUMN IF NOT EXISTS floors integer,
  ADD COLUMN IF NOT EXISTS property_type text;

UPDATE public.hotels SET
  total_surface_m2 = COALESCE(total_surface_m2, 8500),
  year_built = COALESCE(year_built, 1998),
  floors = COALESCE(floors, 6),
  property_type = COALESCE(property_type, 'Resort')
WHERE id = '00000000-0000-0000-0000-000000000001';

UPDATE public.hotels SET
  total_surface_m2 = COALESCE(total_surface_m2, 14200),
  year_built = COALESCE(year_built, 2005),
  floors = COALESCE(floors, 8),
  property_type = COALESCE(property_type, 'Resort')
WHERE id = '00000000-0000-0000-0000-000000000002';

UPDATE public.hotels SET
  total_surface_m2 = COALESCE(total_surface_m2, 4200),
  year_built = COALESCE(year_built, 1985),
  floors = COALESCE(floors, 4),
  property_type = COALESCE(property_type, 'Boutique')
WHERE id = '00000000-0000-0000-0000-000000000003';