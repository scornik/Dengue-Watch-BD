-- ⚠️  DEVELOPMENT / CI DEMO DATA ONLY — NEVER LOAD IN PRODUCTION.
-- Ward "boundaries" here are a synthetic grid over Dhaka (geom_source =
-- 'synthetic-demo'), not real DNCC/DSCC wards. Reports, risk and case numbers
-- are made up. Real boundaries: supabase/seed/README.md.
begin;

-- Synthetic grid: DNCC 54 cells (9 x 6) north, DSCC 75 cells (15 x 5) south.
with dncc as (
  select n, (n - 1) % 9 as c, (n - 1) / 9 as r from generate_series(1, 54) n
)
update public.wards w
set geom = extensions.st_multi(extensions.st_makeenvelope(
      90.34 + d.c * (0.12 / 9), 23.78 + d.r * 0.02,
      90.34 + (d.c + 1) * (0.12 / 9), 23.78 + (d.r + 1) * 0.02, 4326)),
    geom_source = 'synthetic-demo'
from dncc d
where w.id = d.n and w.geom is null;

with dscc as (
  select n, (n - 1) % 15 as c, (n - 1) / 15 as r from generate_series(1, 75) n
)
update public.wards w
set geom = extensions.st_multi(extensions.st_makeenvelope(
      90.34 + d.c * 0.008, 23.68 + d.r * 0.02,
      90.34 + (d.c + 1) * 0.008, 23.68 + (d.r + 1) * 0.02, 4326)),
    geom_source = 'synthetic-demo'
from dscc d
where w.id = 100 + d.n and w.geom is null;

-- Demo reports spread over the last 20 days (each device stays under the rate limit).
insert into public.reports (photo_path, thumb_status, geom, accuracy_m, site_type, larvae_seen, self_cleaned,
                            ai_label, ai_score, ai_source, device_hash, created_at)
select
  'demo/' || g || '.jpg', 'failed',
  extensions.st_setsrid(extensions.st_makepoint(90.345 + random() * 0.11, 23.685 + random() * 0.21), 4326),
  (5 + random() * 30)::real,
  (array['tire','bucket_drum','ac_drip','construction','rooftop','flower_tub','drain','other'])[1 + (g % 8)]::public.site_type,
  (array['yes','no','unsure'])[1 + (g % 3)]::public.larvae_seen,
  g % 5 = 0,
  (array['likely','likely','unclear','pending','not_relevant'])[1 + (g % 5)]::public.ai_label,
  round(random()::numeric, 2)::real, 'device',
  'demo-device-' || lpad((g % 40)::text, 8, '0'),
  now() - (g % 20) * interval '1 day' - (g % 7) * interval '1 hour'
from generate_series(1, 160) g;

-- Move some sites along the workflow (as the system, so no role checks).
update public.sites set status = 'verified' where id in (select id from public.sites where status = 'new' order by random() limit 60);
update public.sites set status = 'assigned' where id in (select id from public.sites where status = 'verified' order by random() limit 25);
update public.sites
  set after_photo_path = 'demo/after.jpg',
      after_photo_geom = geom,
      status = 'cleared'
  where id in (select id from public.sites where status = 'verified' order by random() limit 20);
update public.sites
  set not_found_reason = 'demo: container already removed', status = 'not_found'
  where id in (select id from public.sites where status = 'new' order by random() limit 5);
-- Make clearing times realistic (1-5 days after first report).
update public.sites
  set cleared_at = least(now(), first_reported_at + (12 + random() * 100) * interval '1 hour'),
      closed_at = least(now(), first_reported_at + (12 + random() * 100) * interval '1 hour')
  where status = 'cleared';

-- Demo hunters (volunteer game): six anonymous players who destroyed some spots.
insert into auth.users (id, aud, role, instance_id, is_anonymous)
select ('00000000-0000-0000-0000-00000000de' || lpad(g::text, 2, '0'))::uuid, 'authenticated', 'authenticated',
       '00000000-0000-0000-0000-000000000000', true
from generate_series(1, 6) g
on conflict (id) do nothing;
update public.profiles p set handle = h.handle
from (values (1, 'MoshaShikari'), (2, 'Rima_Mirpur'), (3, 'DhakaDengueBuster'), (4, 'Tanvir12'),
             (5, 'Nusrat.Uttara'), (6, 'LarvaeHunter')) as h(n, handle)
where p.id = ('00000000-0000-0000-0000-00000000de' || lpad(h.n::text, 2, '0'))::uuid;

-- Hunters are assigned by position in the random pick (1 and 2 -> hunter 1, ...,
-- 11+ -> hunter 6), so every demo hunter has cleans and the leaderboard is never
-- empty for one of them; ledger rows are confirmed so they count immediately.
with picked as (
  select x.id, x.geom, x.first_reported_at, row_number() over () as rn
  from (select s.id, s.geom, s.first_reported_at
        from public.sites s where s.status in ('new', 'verified') order by random() limit 18) x
), done as (
  insert into public.cleanups (site_id, volunteer_id, status, claimed_at, expires_at, done_at,
                               after_photo_path, after_geom, points, thumb_status)
  select p.id, ('00000000-0000-0000-0000-00000000de' || lpad((1 + least(5, (p.rn - 1) / 2))::text, 2, '0'))::uuid, 'done',
         least(now(), p.first_reported_at + interval '20 hours'), least(now(), p.first_reported_at + interval '23 hours'),
         least(now(), p.first_reported_at + interval '22 hours'),
         'demo/after.jpg', p.geom, 20 + case when p.rn % 3 = 0 then 10 else 0 end, 'failed'
  from picked p
  returning id, site_id, volunteer_id, points, done_at
), upd as (
  update public.sites s set status = 'cleared', cleared_at = d.done_at, closed_at = d.done_at,
         after_photo_path = 'cleanup-photos/demo/after.jpg', after_photo_geom = s.geom, cleared_cleanup_id = d.id
  from done d where s.id = d.site_id
)
insert into public.points_ledger (user_id, kind, points, site_id, cleanup_id, created_at, confirmed_at)
select volunteer_id, 'clean', points, site_id, id, done_at, done_at from done;

-- Demo environmental risk for the current week.
insert into public.ward_risk (ward_id, week, ndvi, ndwi, ndbi, lst_c, rain_14d_mm, report_density, cases_area, score, level, method_version)
select w.id, date_trunc('week', now())::date,
  (0.1 + random() * 0.3)::real, (-0.3 + random() * 0.3)::real, (0.0 + random() * 0.3)::real,
  (30 + random() * 6)::real, (80 + random() * 120)::real, (random() * 20)::real,
  case when w.city_corp = 'DNCC' then 1450 else 1720 end,
  s.score::real,
  case when s.score < -0.5 then 'green' when s.score < 0.25 then 'yellow' when s.score < 1 then 'orange' else 'red' end::public.risk_level,
  'demo'
from public.wards w
cross join lateral (select (random() * 3 - 1.2 + w.id * 0) as score) s
on conflict (ward_id, week) do nothing;

-- Demo case counts (last 14 days).
insert into public.case_counts (date, area, admissions, deaths, source_url)
select (now() at time zone 'Asia/Dhaka')::date - d, a.area, a.base + (random() * 40)::int, (random() * 2)::int, 'https://example.org/demo'
from generate_series(0, 13) d
cross join (values ('DNCC', 90), ('DSCC', 120), ('BANGLADESH', 900)) as a(area, base)
on conflict (date, area) do nothing;

commit;
