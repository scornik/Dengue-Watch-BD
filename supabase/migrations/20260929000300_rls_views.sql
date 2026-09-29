-- DengueWatch BD — row level security, grants and public views
--
-- Principles
--  * RLS is enabled on every table. Default is deny.
--  * anon: may only read the public_* views (and call public RPCs). Reports are
--    inserted through the submit-report Edge Function (service role), where
--    rate limits are checked; the reports trigger re-checks them in the DB.
--  * Exact coordinates and reporter data never leave the tables except to staff.

alter table public.wards enable row level security;
alter table public.profiles enable row level security;
alter table public.staff_invites enable row level security;
alter table public.sites enable row level security;
alter table public.reports enable row level security;
alter table public.site_events enable row level security;
alter table public.ward_risk enable row level security;
alter table public.case_counts enable row level security;
alter table public.ai_labels enable row level security;
alter table public.ai_usage enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.digest_log enable row level security;

-- Start from zero: Supabase grants broad table privileges to anon/authenticated
-- by default. We revoke and grant back only what each role needs.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from anon, authenticated, public;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke execute on functions from anon, authenticated, public;

-- ---------------------------------------------------------------------------
-- wards: staff read the table; everyone else uses public_wards
-- ---------------------------------------------------------------------------
grant select on public.wards to authenticated;
create policy wards_staff_read on public.wards for select to authenticated
  using (public.has_role('moderator', 'inspector', 'ward_admin', 'researcher', 'superadmin'));

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
grant select on public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;
create policy profiles_self_read on public.profiles for select to authenticated
  using (id = (select auth.uid()));
create policy profiles_staff_read on public.profiles for select to authenticated
  using (
    public.has_role('superadmin')
    or (public.has_role('ward_admin') and (city_corp = public.current_city_corp()
        or exists (select 1 from public.wards w where w.id = profiles.ward_id and w.city_corp = public.current_city_corp())))
  );
create policy profiles_self_update on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- staff_invites: superadmin all; ward admins manage inspectors in their corp
-- ---------------------------------------------------------------------------
grant select, insert, delete on public.staff_invites to authenticated;
create policy invites_superadmin on public.staff_invites for all to authenticated
  using (public.has_role('superadmin')) with check (public.has_role('superadmin'));
create policy invites_ward_admin_read on public.staff_invites for select to authenticated
  using (public.has_role('ward_admin') and exists (
    select 1 from public.wards w where w.id = staff_invites.ward_id and w.city_corp = public.current_city_corp()));
create policy invites_ward_admin_insert on public.staff_invites for insert to authenticated
  with check (public.has_role('ward_admin') and role = 'inspector' and exists (
    select 1 from public.wards w where w.id = staff_invites.ward_id and w.city_corp = public.current_city_corp()));
create policy invites_ward_admin_delete on public.staff_invites for delete to authenticated
  using (public.has_role('ward_admin') and role = 'inspector' and accepted_at is null and exists (
    select 1 from public.wards w where w.id = staff_invites.ward_id and w.city_corp = public.current_city_corp()));

-- ---------------------------------------------------------------------------
-- sites: exact data for staff in scope; updates only via state machine
-- ---------------------------------------------------------------------------
grant select on public.sites to authenticated;
grant update (status, assigned_to, after_photo_path, after_photo_geom, not_found_reason)
  on public.sites to authenticated;
create policy sites_staff_read on public.sites for select to authenticated
  using (public.can_read_ward(ward_id));
create policy sites_reporter_read on public.sites for select to authenticated
  using (exists (select 1 from public.reports r where r.site_id = sites.id and r.reporter_id = (select auth.uid())));
create policy sites_staff_update on public.sites for update to authenticated
  using (public.can_manage_ward(ward_id) or public.has_role('moderator'))
  with check (public.can_manage_ward(ward_id) or public.has_role('moderator'));

-- ---------------------------------------------------------------------------
-- reports: reporters read their own; staff in scope read; no direct writes
-- ---------------------------------------------------------------------------
grant select on public.reports to authenticated;
create policy reports_own_read on public.reports for select to authenticated
  using (reporter_id = (select auth.uid()));
create policy reports_staff_read on public.reports for select to authenticated
  using (public.can_read_ward(ward_id));

-- ---------------------------------------------------------------------------
-- site_events: staff in scope and the site's reporters may read
-- ---------------------------------------------------------------------------
grant select on public.site_events to authenticated;
create policy site_events_read on public.site_events for select to authenticated
  using (exists (
    select 1 from public.sites s where s.id = site_events.site_id
      and (public.can_read_ward(s.ward_id)
           or exists (select 1 from public.reports r where r.site_id = s.id and r.reporter_id = (select auth.uid())))));

-- ---------------------------------------------------------------------------
-- ward_risk, case_counts: public via views; admins may enter cases manually
-- ---------------------------------------------------------------------------
grant select on public.ward_risk to authenticated;
create policy ward_risk_staff_read on public.ward_risk for select to authenticated
  using (public.has_role('moderator', 'inspector', 'ward_admin', 'researcher', 'superadmin'));

grant select, insert, update on public.case_counts to authenticated;
create policy case_counts_staff_read on public.case_counts for select to authenticated
  using (public.has_role('ward_admin', 'researcher', 'superadmin'));
create policy case_counts_admin_insert on public.case_counts for insert to authenticated
  with check (public.has_role('ward_admin', 'superadmin') and entered_by = (select auth.uid()));
create policy case_counts_admin_update on public.case_counts for update to authenticated
  using (public.has_role('ward_admin', 'superadmin'))
  with check (public.has_role('ward_admin', 'superadmin') and entered_by = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- ai_labels: moderators read; writes via moderate_report() / service role
-- ---------------------------------------------------------------------------
grant select on public.ai_labels to authenticated;
create policy ai_labels_mod_read on public.ai_labels for select to authenticated
  using (public.has_role('moderator', 'superadmin'));

-- ai_usage, digest_log: service role only (no policies => deny).

-- ---------------------------------------------------------------------------
-- push_subscriptions: users manage their own
-- ---------------------------------------------------------------------------
grant select, insert, delete on public.push_subscriptions to authenticated;
create policy push_own on public.push_subscriptions for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Public views (owner-rights views: they deliberately bypass table RLS and
-- expose only safe columns). Points are snapped to a ~50 m grid.
-- ---------------------------------------------------------------------------
create or replace view public.public_sites as
select
  s.id,
  extensions.st_snaptogrid(s.geom, 0.0005)::extensions.geometry(Point, 4326) as geom,
  extensions.st_y(extensions.st_snaptogrid(s.geom, 0.0005)) as lat,
  extensions.st_x(extensions.st_snaptogrid(s.geom, 0.0005)) as lng,
  s.ward_id,
  s.status,
  s.site_type,
  s.larvae_reported,
  s.report_count,
  s.first_reported_at,
  s.verified_at,
  s.cleared_at,
  s.closed_at,
  (select r.thumb_public_path from public.reports r
    where r.site_id = s.id and r.thumb_status = 'ok' and r.thumb_public_path is not null
      and r.ai_label <> 'not_relevant'
    order by r.created_at limit 1) as thumb_public_path
from public.sites s
where s.status <> 'rejected' and s.merged_into is null;

create or replace view public.public_wards as
select
  w.id, w.city_corp, w.ward_no, w.name_bn, w.name_en, w.area_km2,
  w.geom is not null as has_boundary,
  lr.week as risk_week, lr.score as risk_score, lr.level as risk_level,
  lr.ndvi, lr.ndwi, lr.ndbi, lr.lst_c, lr.rain_14d_mm, lr.report_density, lr.cases_area
from public.wards w
left join lateral (
  select * from public.ward_risk r where r.ward_id = w.id order by r.week desc limit 1
) lr on true;

create or replace view public.public_ward_risk as
select ward_id, week, ndvi, ndwi, ndbi, lst_c, rain_14d_mm, report_density, cases_area, score, level, method_version
from public.ward_risk;

create or replace view public.public_case_counts as
select date, area, admissions, deaths, source_url, (entered_by is not null) as manual_entry
from public.case_counts;

-- Scorecard: last 28 days. Sites younger than 72 h that are still open are not
-- counted against the ward yet.
create or replace view public.public_ward_scorecard as
with recent as (
  select s.*
  from public.sites s
  where s.first_reported_at > now() - interval '28 days'
    and s.status <> 'rejected' and s.merged_into is null
)
select
  w.id as ward_id,
  w.city_corp,
  w.ward_no,
  w.name_bn,
  w.name_en,
  count(r.id)::integer as sites_28d,
  count(r.id) filter (where r.status = 'cleared')::integer as cleared_28d,
  count(r.id) filter (where r.status in ('new', 'verified', 'assigned'))::integer as open_28d,
  count(r.id) filter (where r.status in ('new', 'verified', 'assigned')
                        and r.first_reported_at < now() - interval '72 hours')::integer as overdue_28d,
  round((extract(epoch from percentile_cont(0.5) within group (order by (r.cleared_at - r.first_reported_at))
         filter (where r.status = 'cleared')) / 3600)::numeric, 1) as median_hours_to_clear,
  round(100.0 * count(r.id) filter (where r.status = 'cleared' and r.cleared_at - r.first_reported_at <= interval '72 hours')
        / nullif(count(r.id) filter (where r.status in ('cleared', 'not_found')
                                  or r.first_reported_at < now() - interval '72 hours'), 0), 1) as pct_cleared_72h
from public.wards w
left join recent r on r.ward_id = w.id
group by w.id;

-- Researcher export: report-level, anonymised (no reporter, device, note or photo).
create or replace view public.research_reports as
select
  md5(r.id::text || coalesce(current_setting('app.export_salt', true), 'dw'))::text as report_key,
  md5(r.site_id::text || coalesce(current_setting('app.export_salt', true), 'dw'))::text as site_key,
  r.ward_id,
  w.city_corp,
  round(extensions.st_y(extensions.st_snaptogrid(r.geom, 0.0005))::numeric, 4) as lat,
  round(extensions.st_x(extensions.st_snaptogrid(r.geom, 0.0005))::numeric, 4) as lng,
  r.site_type, r.larvae_seen, r.self_cleaned, r.ai_label, r.ai_source,
  date_trunc('day', r.created_at)::date as report_date,
  s.status as site_status,
  round((extract(epoch from (s.cleared_at - s.first_reported_at)) / 3600)::numeric, 1) as hours_to_clear
from public.reports r
join public.sites s on s.id = r.site_id
left join public.wards w on w.id = r.ward_id
where public.has_role('researcher', 'superadmin');

grant select on public.public_sites, public.public_wards, public.public_ward_risk,
  public.public_case_counts, public.public_ward_scorecard to anon, authenticated;
grant select on public.research_reports to authenticated;

-- ---------------------------------------------------------------------------
-- Public GeoJSON RPCs for the map (small payloads, cacheable)
-- ---------------------------------------------------------------------------
create or replace function public.public_wards_geojson(p_tolerance double precision default 0.0001)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object('type', 'FeatureCollection', 'features', coalesce(jsonb_agg(
    jsonb_build_object(
      'type', 'Feature',
      'id', w.id,
      'geometry', extensions.st_asgeojson(extensions.st_simplifypreservetopology(w.geom, p_tolerance), 5)::jsonb,
      'properties', jsonb_build_object(
        'id', w.id, 'city_corp', w.city_corp, 'ward_no', w.ward_no,
        'name_bn', w.name_bn, 'name_en', w.name_en,
        'risk_level', pw.risk_level, 'risk_score', pw.risk_score, 'risk_week', pw.risk_week)
    )), '[]'::jsonb))
  from public.wards w
  join public.public_wards pw on pw.id = w.id
  where w.geom is not null;
$$;

create or replace function public.public_sites_geojson(
  p_statuses public.site_status[] default null,
  p_types public.site_type[] default null,
  p_since timestamptz default null,
  p_ward integer default null
)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object('type', 'FeatureCollection', 'features', coalesce(jsonb_agg(
    jsonb_build_object(
      'type', 'Feature',
      'geometry', jsonb_build_object('type', 'Point', 'coordinates', jsonb_build_array(round(p.lng::numeric, 5), round(p.lat::numeric, 5))),
      'properties', jsonb_build_object(
        'id', p.id, 'status', p.status, 'site_type', p.site_type, 'ward_id', p.ward_id,
        'report_count', p.report_count, 'larvae', p.larvae_reported,
        'first_reported_at', p.first_reported_at, 'cleared_at', p.cleared_at,
        'thumb', p.thumb_public_path)
    ) order by p.first_reported_at desc), '[]'::jsonb))
  from (
    select * from public.public_sites ps
    where (p_statuses is null or ps.status = any (p_statuses))
      and (p_types is null or ps.site_type = any (p_types))
      and (p_since is null or ps.first_reported_at >= p_since)
      and (p_ward is null or ps.ward_id = p_ward)
    order by ps.first_reported_at desc
    limit 5000
  ) p;
$$;

-- ---------------------------------------------------------------------------
-- Function grants
-- ---------------------------------------------------------------------------
grant execute on function public.public_wards_geojson(double precision) to anon, authenticated;
grant execute on function public.public_sites_geojson(public.site_status[], public.site_type[], timestamptz, integer) to anon, authenticated;
grant execute on function public.current_app_role() to authenticated;
grant execute on function public.current_ward_id() to authenticated;
grant execute on function public.current_city_corp() to authenticated;
grant execute on function public.has_role(public.user_role[]) to authenticated;
grant execute on function public.can_manage_ward(integer) to authenticated;
grant execute on function public.can_read_ward(integer) to authenticated;
grant execute on function public.is_end_user_context() to authenticated, anon;
grant execute on function public.profile_brief(uuid) to authenticated;
grant execute on function public.site_transition_allowed(public.user_role, public.site_status, public.site_status) to authenticated;
grant execute on function public.transition_site(uuid, public.site_status, text, text, double precision, double precision, uuid) to authenticated;
grant execute on function public.moderate_report(uuid, text, public.site_type, text) to authenticated;
grant execute on function public.merge_sites(uuid, uuid) to authenticated;
grant execute on function public.upsert_wards_geojson(jsonb, text) to authenticated;
-- report_quota and claim_ai_quota are service-role only.
