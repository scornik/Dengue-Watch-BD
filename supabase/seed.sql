-- DengueWatch BD seed: the 129 Dhaka wards (DNCC 1-54, DSCC 1-75).
-- Boundaries are loaded separately from supabase/seed/wards.geojson
-- (see supabase/seed/README.md); wards without a boundary have geom = null.
create or replace function pg_temp.bn_digits(n integer) returns text language sql immutable as $$
  select translate(n::text, '0123456789', '০১২৩৪৫৬৭৮৯');
$$;

insert into public.wards (id, city_corp, ward_no, name_bn, name_en)
select n, 'DNCC', n, 'ডিএনসিসি ওয়ার্ড ' || pg_temp.bn_digits(n), 'DNCC Ward ' || n
from generate_series(1, 54) n
on conflict (city_corp, ward_no) do nothing;

insert into public.wards (id, city_corp, ward_no, name_bn, name_en)
select 100 + n, 'DSCC', n, 'ডিএসসিসি ওয়ার্ড ' || pg_temp.bn_digits(n), 'DSCC Ward ' || n
from generate_series(1, 75) n
on conflict (city_corp, ward_no) do nothing;
