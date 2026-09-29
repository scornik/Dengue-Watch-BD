-- M8: weekly ward digest data + tighter public thumbnails.

-- Public thumbnails only after a human verified the site (in addition to the
-- blur step succeeding). Unverified sites still show as points.
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
  case when s.verified_at is not null then
    (select r.thumb_public_path from public.reports r
      where r.site_id = s.id and r.thumb_status = 'ok' and r.thumb_public_path is not null
        and r.ai_label <> 'not_relevant'
      order by r.created_at limit 1)
  end as thumb_public_path
from public.sites s
where s.status <> 'rejected' and s.merged_into is null;

-- Per-ward weekly numbers for one city corporation (service role / admins).
create or replace function public.ward_digest(p_city_corp public.city_corp, p_week_start timestamptz)
returns table (
  ward_id integer, ward_no integer, name_bn text, name_en text,
  new_sites integer, cleared integer, not_found integer, open_total integer, overdue integer,
  risk_level public.risk_level
)
language sql stable security definer set search_path = ''
as $$
  select
    w.id, w.ward_no, w.name_bn, w.name_en,
    count(s.id) filter (where s.first_reported_at >= p_week_start and s.first_reported_at < p_week_start + interval '7 days')::integer,
    count(s.id) filter (where s.cleared_at >= p_week_start and s.cleared_at < p_week_start + interval '7 days')::integer,
    count(s.id) filter (where s.status = 'not_found' and s.closed_at >= p_week_start and s.closed_at < p_week_start + interval '7 days')::integer,
    count(s.id) filter (where s.status in ('new', 'verified', 'assigned'))::integer,
    count(s.id) filter (where s.status in ('new', 'verified', 'assigned') and s.first_reported_at < now() - interval '72 hours')::integer,
    (select r.level from public.ward_risk r where r.ward_id = w.id order by r.week desc limit 1)
  from public.wards w
  left join public.sites s on s.ward_id = w.id and s.merged_into is null and s.status <> 'rejected'
  where w.city_corp = p_city_corp
    -- Inside a definer function current_user is the owner, so check the JWT:
    -- no user id means service role / cron.
    and ((select auth.uid()) is null
         or public.has_role('superadmin')
         or (public.has_role('ward_admin') and public.current_city_corp() = p_city_corp))
  group by w.id
  order by w.ward_no;
$$;
revoke execute on function public.ward_digest(public.city_corp, timestamptz) from public, anon;
grant execute on function public.ward_digest(public.city_corp, timestamptz) to authenticated;

-- Digest recipients: ward admins with their email (service role only).
create or replace function public.digest_recipients()
returns table (user_id uuid, email text, city_corp public.city_corp, display_name text)
language sql stable security definer set search_path = ''
as $$
  select p.id, u.email::text, p.city_corp, p.display_name
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.role = 'ward_admin' and p.city_corp is not null and u.email is not null;
$$;
revoke execute on function public.digest_recipients() from public, anon, authenticated;
