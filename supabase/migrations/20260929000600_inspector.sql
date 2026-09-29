-- Inspector queue (M5). Security-invoker: RLS limits inspectors to their ward
-- and ward admins to their city corporation.
create or replace view public.inspector_queue
with (security_invoker = true) as
select
  s.id,
  s.status,
  s.site_type,
  s.larvae_reported,
  s.report_count,
  s.first_reported_at,
  s.verified_at,
  s.assigned_to,
  s.assigned_at,
  s.ward_id,
  extensions.st_y(s.geom) as lat,
  extensions.st_x(s.geom) as lng,
  w.name_bn as ward_name_bn,
  w.name_en as ward_name_en,
  lr.level as risk_level,
  case lr.level when 'red' then 0 when 'orange' then 1 when 'yellow' then 2 when 'green' then 3 else 4 end as risk_rank,
  (select r.photo_path from public.reports r
    where r.site_id = s.id and r.ai_label <> 'not_relevant'
    order by r.created_at desc limit 1) as photo_path,
  (select r.note from public.reports r
    where r.site_id = s.id and r.note is not null
    order by r.created_at desc limit 1) as note
from public.sites s
left join public.wards w on w.id = s.ward_id
left join lateral (
  select r.level from public.ward_risk r where r.ward_id = s.ward_id order by r.week desc limit 1
) lr on true
where s.status in ('new', 'verified', 'assigned') and s.merged_into is null;

grant select on public.inspector_queue to authenticated;
