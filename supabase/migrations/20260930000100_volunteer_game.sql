-- Volunteer cleanup game.
--
-- Anyone (including anonymous citizens) can pick a public "hunter" name and
-- photo, claim an open breeding site, clean it and prove it with an on-site
-- photo taken within 50 m. Points go to a ledger; a public leaderboard ranks
-- hunters. Moderators can reverse a fake cleanup (site reopens, points revoked).
-- The moderator/inspector workflow stays as it was.

-- ---------------------------------------------------------------------------
-- Hunter identity on profiles
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column handle text
    check (handle is null or (char_length(handle) between 3 and 24 and handle !~ '[[:space:]<>"''/\\@]')),
  add column avatar_path text;
create unique index profiles_handle_key on public.profiles (lower(handle));

grant update (display_name, handle, avatar_path) on public.profiles to authenticated;
drop policy profiles_self_update on public.profiles;
create policy profiles_self_update on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (
    id = (select auth.uid())
    and (avatar_path is null or avatar_path like id::text || '/%')
  );

-- ---------------------------------------------------------------------------
-- Cleanups and points
-- ---------------------------------------------------------------------------
create type public.cleanup_status as enum ('claimed', 'done', 'rejected', 'expired');

create table public.cleanups (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites (id) on delete cascade,
  volunteer_id uuid not null references auth.users (id) on delete cascade,
  status public.cleanup_status not null default 'claimed',
  claimed_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '3 hours',
  done_at timestamptz,
  after_photo_path text,
  after_geom extensions.geometry(Point, 4326),
  note text check (char_length(note) <= 300),
  points integer not null default 0,
  thumb_status public.thumb_status not null default 'pending',
  thumb_public_path text,
  reviewed_by uuid references auth.users (id) on delete set null,
  review_note text,
  created_at timestamptz not null default now()
);
create index cleanups_site_idx on public.cleanups (site_id, status);
create index cleanups_volunteer_idx on public.cleanups (volunteer_id, status, done_at);
create index cleanups_thumb_idx on public.cleanups (thumb_status) where thumb_status = 'pending' and status = 'done';

alter table public.sites add column cleared_cleanup_id uuid references public.cleanups (id) on delete set null;

create table public.points_ledger (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('report', 'clean', 'revoked')),
  points integer not null,
  site_id uuid references public.sites (id) on delete set null,
  report_id uuid references public.reports (id) on delete set null,
  cleanup_id uuid references public.cleanups (id) on delete set null,
  created_at timestamptz not null default now()
);
create index points_ledger_user_idx on public.points_ledger (user_id, created_at);

alter table public.cleanups enable row level security;
alter table public.points_ledger enable row level security;

grant select on public.cleanups, public.points_ledger to authenticated;
create policy cleanups_own_read on public.cleanups for select to authenticated
  using (volunteer_id = (select auth.uid()));
create policy cleanups_staff_read on public.cleanups for select to authenticated
  using (exists (select 1 from public.sites s where s.id = cleanups.site_id and public.can_read_ward(s.ward_id)));
create policy points_own_read on public.points_ledger for select to authenticated
  using (user_id = (select auth.uid()));

-- Scoring (kept in one place so the UI can explain it).
create or replace function public.game_rules()
returns jsonb
language sql immutable set search_path = ''
as $$
  select jsonb_build_object(
    'report', 5,          -- a report that is not rejected
    'clean', 20,          -- cleaning someone else's reported site
    'clean_own', 10,      -- cleaning a site you reported yourself
    'larvae_bonus', 10,   -- larvae were reported there
    'overdue_bonus', 10,  -- site was open more than 72 h
    'claim_hours', 3,
    'max_active_claims', 3,
    'max_cleans_per_day', 10,
    'radius_m', 50
  );
$$;
grant execute on function public.game_rules() to anon, authenticated;

-- +5 for every report made by a signed-in (incl. anonymous) user.
create or replace function public.reports_award_points()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.reporter_id is not null and new.ai_label <> 'not_relevant' then
      insert into public.points_ledger (user_id, kind, points, site_id, report_id)
      values (new.reporter_id, 'report', (public.game_rules() ->> 'report')::int, new.site_id, new.id);
    end if;
  elsif new.ai_label = 'not_relevant' and old.ai_label is distinct from 'not_relevant' and new.reporter_id is not null then
    -- Rejected by a moderator: take the report points back (once).
    insert into public.points_ledger (user_id, kind, points, site_id, report_id)
    select new.reporter_id, 'revoked', -sum(l.points), new.site_id, new.id
    from public.points_ledger l
    where l.report_id = new.id
    having sum(l.points) > 0;
  end if;
  return null;
end;
$$;

create trigger reports_award_points
  after insert or update of ai_label on public.reports
  for each row execute function public.reports_award_points();

-- ---------------------------------------------------------------------------
-- RPC: claim a site (3 h lock so two volunteers don't walk to the same spot)
-- ---------------------------------------------------------------------------
create or replace function public.claim_site(p_site uuid)
returns public.cleanups
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_rules jsonb := public.game_rules();
  v_site public.sites;
  v_claim public.cleanups;
begin
  if v_uid is null then
    raise exception 'sign in required' using errcode = '42501';
  end if;
  if (select handle from public.profiles where id = v_uid) is null then
    raise exception 'handle_required' using errcode = 'P0001', hint = 'Pick a hunter name first';
  end if;

  update public.cleanups set status = 'expired'
    where status = 'claimed' and expires_at < now();

  select * into v_site from public.sites where id = p_site for update;
  if v_site.id is null or v_site.merged_into is not null or v_site.status not in ('new', 'verified', 'assigned') then
    raise exception 'site_not_open' using errcode = 'P0001';
  end if;

  select * into v_claim from public.cleanups where site_id = p_site and status = 'claimed';
  if v_claim.id is not null then
    if v_claim.volunteer_id = v_uid then
      return v_claim;
    end if;
    raise exception 'already_claimed' using errcode = 'P0001';
  end if;

  if (select count(*) from public.cleanups where volunteer_id = v_uid and status = 'claimed')
     >= (v_rules ->> 'max_active_claims')::int then
    raise exception 'too_many_claims' using errcode = 'P0001';
  end if;

  insert into public.cleanups (site_id, volunteer_id, expires_at)
  values (p_site, v_uid, now() + make_interval(hours => (v_rules ->> 'claim_hours')::int))
  returning * into v_claim;
  return v_claim;
end;
$$;

create or replace function public.release_claim(p_cleanup uuid)
returns void
language sql security definer set search_path = ''
as $$
  update public.cleanups set status = 'expired'
  where id = p_cleanup and volunteer_id = auth.uid() and status = 'claimed';
$$;

-- ---------------------------------------------------------------------------
-- RPC: finish a cleanup with an on-site photo -> site cleared, points awarded
-- ---------------------------------------------------------------------------
create or replace function public.complete_cleanup(
  p_cleanup uuid,
  p_photo_path text,
  p_lat double precision,
  p_lng double precision,
  p_note text default null
)
returns public.cleanups
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_rules jsonb := public.game_rules();
  v_claim public.cleanups;
  v_site public.sites;
  v_point extensions.geometry;
  v_points integer;
begin
  if v_uid is null then
    raise exception 'sign in required' using errcode = '42501';
  end if;
  select * into v_claim from public.cleanups where id = p_cleanup for update;
  if v_claim.id is null or v_claim.volunteer_id <> v_uid then
    raise exception 'not your claim' using errcode = '42501';
  end if;
  if v_claim.status <> 'claimed' or v_claim.expires_at < now() - interval '30 minutes' then
    raise exception 'claim_expired' using errcode = 'P0001';
  end if;

  -- The photo must be the volunteer's own upload in the private bucket.
  if p_photo_path is null or p_photo_path not like v_uid::text || '/%' or not exists (
       select 1 from storage.objects o where o.bucket_id = 'cleanup-photos' and o.name = p_photo_path) then
    raise exception 'photo_missing' using errcode = 'P0001';
  end if;

  select * into v_site from public.sites where id = v_claim.site_id for update;
  if v_site.status not in ('new', 'verified', 'assigned') then
    raise exception 'site_not_open' using errcode = 'P0001';
  end if;

  v_point := extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326);
  if not extensions.st_dwithin(v_point::extensions.geography, v_site.geom::extensions.geography,
                               (v_rules ->> 'radius_m')::int) then
    raise exception 'too_far' using errcode = 'P0001';
  end if;

  if (select count(*) from public.cleanups
      where volunteer_id = v_uid and status = 'done' and done_at > now() - interval '1 day')
     >= (v_rules ->> 'max_cleans_per_day')::int then
    raise exception 'daily_limit' using errcode = 'P0001';
  end if;

  -- Scoring
  if exists (select 1 from public.reports r where r.site_id = v_site.id and r.reporter_id = v_uid) then
    v_points := (v_rules ->> 'clean_own')::int;
  else
    v_points := (v_rules ->> 'clean')::int
      + case when v_site.larvae_reported then (v_rules ->> 'larvae_bonus')::int else 0 end
      + case when v_site.first_reported_at < now() - interval '72 hours' then (v_rules ->> 'overdue_bonus')::int else 0 end;
  end if;

  update public.cleanups
    set status = 'done', done_at = now(), after_photo_path = p_photo_path, after_geom = v_point,
        note = left(nullif(trim(p_note), ''), 300), points = v_points
    where id = v_claim.id
    returning * into v_claim;

  perform set_config('app.transition_note', 'volunteer cleanup', true);
  update public.sites
    set status = 'cleared', after_photo_path = 'cleanup-photos/' || p_photo_path,
        after_photo_geom = v_point, cleared_cleanup_id = v_claim.id
    where id = v_site.id;

  insert into public.points_ledger (user_id, kind, points, site_id, cleanup_id)
  values (v_uid, 'clean', v_points, v_site.id, v_claim.id);
  return v_claim;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: moderator reverses a fake/bad cleanup
-- ---------------------------------------------------------------------------
create or replace function public.reject_cleanup(p_cleanup uuid, p_note text default null)
returns public.cleanups
language plpgsql security definer set search_path = ''
as $$
declare
  v_claim public.cleanups;
begin
  if not public.has_role('moderator', 'ward_admin', 'superadmin') then
    raise exception 'moderator role required' using errcode = '42501';
  end if;
  select * into v_claim from public.cleanups where id = p_cleanup for update;
  if v_claim.id is null or v_claim.status <> 'done' then
    raise exception 'cleanup not found or not done' using errcode = 'P0001';
  end if;

  update public.cleanups
    set status = 'rejected', reviewed_by = auth.uid(), review_note = left(p_note, 300)
    where id = v_claim.id returning * into v_claim;

  insert into public.points_ledger (user_id, kind, points, site_id, cleanup_id)
  values (v_claim.volunteer_id, 'revoked', -v_claim.points, v_claim.site_id, v_claim.id);

  perform set_config('app.transition_note', coalesce('cleanup rejected: ' || p_note, 'cleanup rejected'), true);
  update public.sites
    set status = 'verified', cleared_at = null, closed_at = null, after_photo_path = null,
        after_photo_geom = null, cleared_cleanup_id = null
    where id = v_claim.site_id and cleared_cleanup_id = v_claim.id;
  return v_claim;
end;
$$;

-- ---------------------------------------------------------------------------
-- Player stats and leaderboard
-- ---------------------------------------------------------------------------
create or replace view public.public_leaderboard as
with totals as (
  select l.user_id,
    sum(l.points)::integer as points,
    coalesce(sum(l.points) filter (where l.created_at > now() - interval '7 days'), 0)::integer as points_week,
    (count(*) filter (where l.kind = 'clean') - count(*) filter (where l.kind = 'revoked' and l.cleanup_id is not null))::integer as cleans,
    (count(*) filter (where l.kind = 'report') - count(*) filter (where l.kind = 'revoked' and l.report_id is not null))::integer as reports
  from public.points_ledger l
  group by l.user_id
)
select
  p.handle,
  p.avatar_path,
  coalesce(t.points, 0) as points,
  coalesce(t.points_week, 0) as points_week,
  coalesce(t.cleans, 0) as cleans,
  coalesce(t.reports, 0) as reports,
  rank() over (order by coalesce(t.points, 0) desc)::integer as rank,
  rank() over (order by coalesce(t.points_week, 0) desc)::integer as rank_week
from public.profiles p
left join totals t on t.user_id = p.id
where p.handle is not null;

grant select on public.public_leaderboard to anon, authenticated;

create or replace function public.my_stats()
returns table (handle text, avatar_path text, points integer, points_week integer, cleans integer,
               reports integer, rank integer, active_claims integer)
language sql stable security definer set search_path = ''
as $$
  select
    p.handle, p.avatar_path,
    coalesce(sum(l.points), 0)::integer,
    coalesce(sum(l.points) filter (where l.created_at > now() - interval '7 days'), 0)::integer,
    (count(l.id) filter (where l.kind = 'clean') - count(l.id) filter (where l.kind = 'revoked' and l.cleanup_id is not null))::integer,
    (count(l.id) filter (where l.kind = 'report') - count(l.id) filter (where l.kind = 'revoked' and l.report_id is not null))::integer,
    (select lb.rank from public.public_leaderboard lb where lb.handle = p.handle),
    (select count(*)::integer from public.cleanups c
      where c.volunteer_id = p.id and c.status = 'claimed' and c.expires_at > now())
  from public.profiles p
  left join public.points_ledger l on l.user_id = p.id
  where p.id = auth.uid()
  group by p.id;
$$;

-- ---------------------------------------------------------------------------
-- Public views: photos are public once blurred; claims and cleaners visible
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
  -- Public once faces/plates are blurred (workers/thumbs); rejected reports never.
  (select r.thumb_public_path from public.reports r
    where r.site_id = s.id and r.thumb_status = 'ok' and r.thumb_public_path is not null
      and r.ai_label <> 'not_relevant'
    order by r.created_at limit 1) as thumb_public_path,
  exists (select 1 from public.cleanups c
          where c.site_id = s.id and c.status = 'claimed' and c.expires_at > now()) as claimed,
  (select p.handle from public.cleanups c join public.profiles p on p.id = c.volunteer_id
    where c.id = s.cleared_cleanup_id) as cleaned_by,
  (select c.thumb_public_path from public.cleanups c
    where c.id = s.cleared_cleanup_id and c.thumb_status = 'ok') as after_thumb_path
from public.sites s
where s.status <> 'rejected' and s.merged_into is null;

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
        'thumb', p.thumb_public_path, 'claimed', p.claimed, 'cleaned_by', p.cleaned_by,
        'after_thumb', p.after_thumb_path)
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

-- Ward-level report activity for the "reports" map mode (last 28 days).
create or replace function public.ward_report_counts()
returns table (ward_id integer, reports_28d integer, open_sites integer, cleared_28d integer)
language sql stable security definer set search_path = ''
as $$
  select w.id,
    (select count(*)::integer from public.reports r
      where r.ward_id = w.id and r.ai_label <> 'not_relevant' and r.created_at > now() - interval '28 days'),
    (select count(*)::integer from public.sites s
      where s.ward_id = w.id and s.status in ('new', 'verified', 'assigned') and s.merged_into is null),
    (select count(*)::integer from public.sites s
      where s.ward_id = w.id and s.status = 'cleared' and s.cleared_at > now() - interval '28 days')
  from public.wards w;
$$;
grant execute on function public.ward_report_counts() to anon, authenticated;

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
        'risk_level', pw.risk_level, 'risk_score', pw.risk_score, 'risk_week', pw.risk_week,
        'reports_28d', rc.reports_28d, 'open_sites', rc.open_sites, 'cleared_28d', rc.cleared_28d)
    )), '[]'::jsonb))
  from public.wards w
  join public.public_wards pw on pw.id = w.id
  join public.ward_report_counts() rc on rc.ward_id = w.id
  where w.geom is not null;
$$;

-- ---------------------------------------------------------------------------
-- Storage: cleanup photos (private, own folder) and avatars (public, own folder)
-- Photos are compressed on the phone; limits are deliberately small.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('cleanup-photos', 'cleanup-photos', false, 524288, array['image/jpeg']),
  ('avatars', 'avatars', true, 131072, array['image/jpeg', 'image/webp'])
on conflict (id) do nothing;
update storage.buckets set file_size_limit = 2097152 where id in ('report-photos', 'after-photos');

create policy cleanup_photos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'cleanup-photos' and name like (select auth.uid())::text || '/%');
create policy cleanup_photos_read on storage.objects for select to authenticated
  using (bucket_id = 'cleanup-photos' and (
    name like (select auth.uid())::text || '/%' or public.has_role('moderator', 'ward_admin', 'superadmin')));

create policy avatars_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and name like (select auth.uid())::text || '/%');
create policy avatars_update on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and name like (select auth.uid())::text || '/%')
  with check (bucket_id = 'avatars' and name like (select auth.uid())::text || '/%');
create policy avatars_delete on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and name like (select auth.uid())::text || '/%');
-- Upsert needs to see the existing object.
create policy avatars_own_read on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and name like (select auth.uid())::text || '/%');

-- ---------------------------------------------------------------------------
-- Moderator review of volunteer cleanups (most recent first)
-- ---------------------------------------------------------------------------
-- Owner-rights view (moderators cannot read profiles under RLS, but hunter
-- handles are public anyway); the where clause limits it to moderation staff.
create or replace view public.cleanup_review_queue as
select
  c.id, c.site_id, c.done_at, c.points, c.note, c.after_photo_path,
  p.handle,
  s.site_type, s.ward_id,
  (select r.photo_path from public.reports r where r.site_id = s.id order by r.created_at limit 1) as before_photo_path,
  round(extensions.st_distance(c.after_geom::extensions.geography, s.geom::extensions.geography)::numeric, 1) as distance_m
from public.cleanups c
join public.sites s on s.id = c.site_id
left join public.profiles p on p.id = c.volunteer_id
where c.status = 'done' and c.done_at > now() - interval '14 days'
  and public.has_role('moderator', 'ward_admin', 'superadmin');
revoke all on public.cleanup_review_queue from anon, public;
grant select on public.cleanup_review_queue to authenticated;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke execute on function public.claim_site(uuid), public.release_claim(uuid),
  public.complete_cleanup(uuid, text, double precision, double precision, text),
  public.reject_cleanup(uuid, text), public.my_stats() from public, anon;
grant execute on function public.claim_site(uuid) to authenticated;
grant execute on function public.release_claim(uuid) to authenticated;
grant execute on function public.complete_cleanup(uuid, text, double precision, double precision, text) to authenticated;
grant execute on function public.reject_cleanup(uuid, text) to authenticated;
grant execute on function public.my_stats() to authenticated;
