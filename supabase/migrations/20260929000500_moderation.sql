-- Moderation queue (M3). Security-invoker views: the caller's RLS applies,
-- so only moderators/admins in scope see rows.

create or replace view public.moderation_queue
with (security_invoker = true) as
select
  r.id,
  r.created_at,
  r.photo_path,
  r.site_type,
  r.larvae_seen,
  r.self_cleaned,
  r.note,
  r.ai_label,
  r.ai_score,
  r.ai_source,
  r.accuracy_m,
  r.site_id,
  r.ward_id,
  extensions.st_y(r.geom) as lat,
  extensions.st_x(r.geom) as lng,
  s.status as site_status,
  s.report_count,
  -- pending first, then unclear, then not_relevant (likely spam), then likely
  case r.ai_label when 'pending' then 0 when 'unclear' then 1 when 'not_relevant' then 2 else 3 end as priority
from public.reports r
join public.sites s on s.id = r.site_id
where r.ai_source <> 'human'
  and s.status = 'new'
  and s.merged_into is null;

grant select on public.moderation_queue to authenticated;

-- Open sites near a given site, for the merge action.
create or replace function public.nearby_open_sites(p_site uuid, p_radius_m integer default 150)
returns table (id uuid, status public.site_status, site_type public.site_type, report_count integer,
               first_reported_at timestamptz, distance_m real)
language sql stable security invoker set search_path = ''
as $$
  select o.id, o.status, o.site_type, o.report_count, o.first_reported_at,
         extensions.st_distance(o.geom::extensions.geography, s.geom::extensions.geography)::real
  from public.sites s
  join public.sites o on o.id <> s.id
    and o.status in ('new', 'verified', 'assigned')
    and o.merged_into is null
    and extensions.st_dwithin(o.geom::extensions.geography, s.geom::extensions.geography, least(p_radius_m, 1000))
  where s.id = p_site
  order by 6
  limit 10;
$$;
grant execute on function public.nearby_open_sites(uuid, integer) to authenticated;
