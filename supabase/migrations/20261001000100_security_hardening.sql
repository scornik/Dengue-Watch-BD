-- Security hardening after the pre-launch review (2026-10-01).
--
-- 1. Staff invites apply only to confirmed email addresses.
-- 2. Volunteer cleanups: the 50 m check is made against the public (snapped)
--    point, so the RPC reveals nothing about a reporter's exact location; the
--    after photo must be uploaded for that claim, after the claim; limits grow
--    with trust (confirmed XP); clean points are "confirming" for 48 h, during
--    which a moderator can approve or reverse them.
-- 3. Report points are earned when a moderator verifies the site (or approves
--    its cleanup) and reach the public leaderboard in a daily batch, so a
--    hunter name cannot be matched to the site they just reported.
-- 4. Per-reporter report limits (not only per device), ward-scoped cleanup
--    review, avatar path/quota checks, push endpoint allow-list.

-- ---------------------------------------------------------------------------
-- 1. Staff invites need a confirmed email
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  inv public.staff_invites%rowtype;
begin
  -- An unconfirmed email proves nothing: anyone could sign up with an invited address.
  if new.email is not null and new.email_confirmed_at is not null then
    select * into inv from public.staff_invites where email = lower(new.email) and accepted_at is null;
  end if;

  insert into public.profiles (id, role, ward_id, city_corp, display_name, phone_verified)
  values (
    new.id,
    coalesce(inv.role, 'citizen'),
    inv.ward_id,
    inv.city_corp,
    inv.display_name,
    new.phone_confirmed_at is not null
  )
  on conflict (id) do nothing;

  if inv.email is not null then
    update public.staff_invites set accepted_at = now() where email = inv.email;
  end if;
  return new;
end;
$$;

create or replace function public.handle_user_updated()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  inv public.staff_invites%rowtype;
begin
  if new.phone_confirmed_at is distinct from old.phone_confirmed_at then
    update public.profiles set phone_verified = new.phone_confirmed_at is not null where id = new.id;
  end if;
  -- Apply an invite when a confirmed email appears: a new address, or the first confirmation.
  if new.email is not null and new.email_confirmed_at is not null
     and (new.email is distinct from old.email or old.email_confirmed_at is null) then
    select * into inv from public.staff_invites where email = lower(new.email) and accepted_at is null;
    if inv.email is not null then
      update public.profiles
        set role = inv.role, ward_id = inv.ward_id, city_corp = inv.city_corp,
            display_name = coalesce(inv.display_name, display_name)
        where id = new.id;
      update public.staff_invites set accepted_at = now() where email = inv.email;
    end if;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Rules, trust tiers and point confirmation
-- ---------------------------------------------------------------------------
create or replace function public.game_rules()
returns jsonb
language sql immutable set search_path = ''
as $$
  select jsonb_build_object(
    'report', 5,          -- a report on a site a moderator verified
    'clean', 20,          -- cleaning someone else's reported site
    'clean_own', 10,      -- cleaning a site you reported yourself
    'larvae_bonus', 10,   -- larvae were reported there
    'overdue_bonus', 10,  -- site was open more than 72 h
    'claim_hours', 3,
    'confirm_hours', 48,  -- clean points count publicly after this unless reversed
    'radius_m', 80,       -- from the public (~50 m snapped) point
    'report_per_hour', 10,
    'report_per_day', 30,
    -- Limits grow with confirmed XP so a throwaway account can do little harm.
    'tiers', jsonb_build_array(
      jsonb_build_object('min', 0, 'claims', 1, 'cleans', 3),
      jsonb_build_object('min', 50, 'claims', 2, 'cleans', 6),
      jsonb_build_object('min', 150, 'claims', 3, 'cleans', 10))
  );
$$;

alter table public.points_ledger add column confirmed_at timestamptz;
update public.points_ledger set confirmed_at = created_at where confirmed_at is null;
alter table public.cleanups add column reviewed_at timestamptz;

-- Does a ledger row count on the public leaderboard yet?
-- Cleans: once confirmed by a moderator or after confirm_hours. Reports (and
-- their reversals): once confirmed, from the next day on (daily batch).
create or replace function public.ledger_row_live(
  p_kind text, p_report_id uuid, p_confirmed_at timestamptz, p_created_at timestamptz)
returns boolean
language sql stable set search_path = ''
as $$
  select case
    when p_report_id is not null then
      p_confirmed_at is not null and p_confirmed_at < date_trunc('day', now())
    when p_kind = 'clean' then
      p_confirmed_at is not null or p_created_at < now() - interval '48 hours'
    else true
  end;
$$;

-- Confirmed (live) XP of a user: decides their trust tier.
create or replace function public.live_points(p_uid uuid)
returns integer
language sql stable security definer set search_path = ''
as $$
  select coalesce(sum(l.points), 0)::integer
  from public.points_ledger l
  where l.user_id = p_uid and public.ledger_row_live(l.kind, l.report_id, l.confirmed_at, l.created_at);
$$;
revoke execute on function public.live_points(uuid) from public, anon, authenticated;

create or replace function public.hunter_tier(p_uid uuid)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select t.value
  from jsonb_array_elements(public.game_rules() -> 'tiers') as t(value)
  where (t.value ->> 'min')::int <= public.live_points(p_uid)
  order by (t.value ->> 'min')::int desc
  limit 1;
$$;
revoke execute on function public.hunter_tier(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Report points: earned on moderator verification, not on submission
-- ---------------------------------------------------------------------------
create or replace function public.reports_award_points()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.reporter_id is not null and new.ai_label <> 'not_relevant' then
      insert into public.points_ledger (user_id, kind, points, site_id, report_id, confirmed_at)
      select new.reporter_id, 'report', (public.game_rules() ->> 'report')::int, new.site_id, new.id,
             case when s.verified_at is not null then now() end
      from public.sites s where s.id = new.site_id;
    end if;
  elsif new.ai_label = 'not_relevant' and old.ai_label is distinct from 'not_relevant' and new.reporter_id is not null then
    -- Rejected by a moderator: take the report points back (once). Both rows
    -- become public together, so the net effect is zero.
    update public.points_ledger set confirmed_at = coalesce(confirmed_at, now())
      where report_id = new.id and kind = 'report';
    insert into public.points_ledger (user_id, kind, points, site_id, report_id, confirmed_at)
    select new.reporter_id, 'revoked', -sum(l.points), new.site_id, new.id, now()
    from public.points_ledger l
    where l.report_id = new.id
    having sum(l.points) > 0;
  end if;
  return null;
end;
$$;

create or replace function public.confirm_report_points(p_site uuid)
returns void
language sql security definer set search_path = ''
as $$
  update public.points_ledger set confirmed_at = now()
  where site_id = p_site and kind = 'report' and confirmed_at is null;
$$;
revoke execute on function public.confirm_report_points(uuid) from public, anon, authenticated;

create or replace function public.sites_confirm_report_points()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform public.confirm_report_points(new.id);
  return null;
end;
$$;

-- verified_at is set by a BEFORE trigger, so watch every update, not "update of".
create trigger sites_confirm_report_points
  after update on public.sites
  for each row when (old.verified_at is null and new.verified_at is not null)
  execute function public.sites_confirm_report_points();

-- Per-reporter limits (the per-device limit alone trusts a client-chosen id).
create or replace function public.reports_reporter_quota()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_rules jsonb := public.game_rules();
begin
  if new.reporter_id is null then
    return new;
  end if;
  if (select count(*) from public.reports
      where reporter_id = new.reporter_id and created_at > now() - interval '1 hour')
     >= (v_rules ->> 'report_per_hour')::int then
    raise exception 'rate_limited: max % reports per hour', v_rules ->> 'report_per_hour' using errcode = 'P0429';
  end if;
  if (select count(*) from public.reports
      where reporter_id = new.reporter_id and created_at > now() - interval '1 day')
     >= (v_rules ->> 'report_per_day')::int then
    raise exception 'rate_limited: max % reports per day', v_rules ->> 'report_per_day' using errcode = 'P0429';
  end if;
  return new;
end;
$$;

create trigger reports_reporter_quota
  before insert on public.reports
  for each row execute function public.reports_reporter_quota();
create index if not exists reports_reporter_created_idx on public.reports (reporter_id, created_at);

-- ---------------------------------------------------------------------------
-- Claims and cleanups
-- ---------------------------------------------------------------------------
create or replace function public.claim_site(p_site uuid)
returns public.cleanups
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_rules jsonb := public.game_rules();
  v_tier jsonb;
  v_site public.sites;
  v_claim public.cleanups;
begin
  if v_uid is null then
    raise exception 'sign in required' using errcode = '42501';
  end if;
  if (select handle from public.profiles where id = v_uid) is null then
    raise exception 'handle_required' using errcode = 'P0001', hint = 'Pick a hunter name first';
  end if;
  v_tier := public.hunter_tier(v_uid);

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
     >= (v_tier ->> 'claims')::int then
    raise exception 'too_many_claims' using errcode = 'P0001';
  end if;
  -- Stops one account from cycling claims to lock spots away from others.
  if (select count(*) from public.cleanups where volunteer_id = v_uid and claimed_at > now() - interval '1 day')
     >= 2 * (v_tier ->> 'cleans')::int then
    raise exception 'daily_limit' using errcode = 'P0001';
  end if;

  insert into public.cleanups (site_id, volunteer_id, expires_at)
  values (p_site, v_uid, now() + make_interval(hours => (v_rules ->> 'claim_hours')::int))
  returning * into v_claim;
  return v_claim;
end;
$$;

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
  v_public extensions.geometry;
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
  -- Limits before anything location-related.
  if (select count(*) from public.cleanups
      where volunteer_id = v_uid and status = 'done' and done_at > now() - interval '1 day')
     >= (public.hunter_tier(v_uid) ->> 'cleans')::int then
    raise exception 'daily_limit' using errcode = 'P0001';
  end if;

  -- One fresh photo per claim: <uid>/<claim id>.jpg, uploaded after claiming.
  if p_photo_path is distinct from v_uid::text || '/' || v_claim.id::text || '.jpg' or not exists (
       select 1 from storage.objects o
       where o.bucket_id = 'cleanup-photos' and o.name = p_photo_path
         and coalesce(o.updated_at, o.created_at) >= v_claim.claimed_at) then
    raise exception 'photo_missing' using errcode = 'P0001';
  end if;

  select * into v_site from public.sites where id = v_claim.site_id for update;
  if v_site.status not in ('new', 'verified', 'assigned') then
    raise exception 'site_not_open' using errcode = 'P0001';
  end if;

  -- Compared with the point everyone can see, so the answer leaks nothing
  -- about the exact (often a reporter's home) location.
  v_point := extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326);
  v_public := extensions.st_snaptogrid(v_site.geom, 0.0005);
  if not extensions.st_dwithin(v_point::extensions.geography, v_public::extensions.geography,
                               (v_rules ->> 'radius_m')::int) then
    raise exception 'too_far' using errcode = 'P0001';
  end if;

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

  -- "Confirming" until a moderator approves it or confirm_hours pass.
  insert into public.points_ledger (user_id, kind, points, site_id, cleanup_id)
  values (v_uid, 'clean', v_points, v_site.id, v_claim.id);
  return v_claim;
end;
$$;

-- Moderators working in the cleanup's ward (ward admins only for their city corporation).
create or replace function public.can_review_cleanup(p_site uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.has_role('moderator', 'superadmin')
    or (public.has_role('ward_admin')
        and public.can_manage_ward((select s.ward_id from public.sites s where s.id = p_site)));
$$;
revoke execute on function public.can_review_cleanup(uuid) from public, anon;
grant execute on function public.can_review_cleanup(uuid) to authenticated;

create or replace function public.approve_cleanup(p_cleanup uuid)
returns public.cleanups
language plpgsql security definer set search_path = ''
as $$
declare
  v_claim public.cleanups;
begin
  select * into v_claim from public.cleanups where id = p_cleanup for update;
  if v_claim.id is null or not public.can_review_cleanup(v_claim.site_id) then
    raise exception 'moderator role required' using errcode = '42501';
  end if;
  if v_claim.status <> 'done' then
    raise exception 'cleanup not found or not done' using errcode = 'P0001';
  end if;
  update public.cleanups set reviewed_by = auth.uid(), reviewed_at = now()
    where id = v_claim.id returning * into v_claim;
  update public.points_ledger set confirmed_at = now()
    where cleanup_id = v_claim.id and kind = 'clean' and confirmed_at is null;
  -- A confirmed cleanup also confirms the spot was real: credit its reporters.
  perform public.confirm_report_points(v_claim.site_id);
  return v_claim;
end;
$$;

create or replace function public.reject_cleanup(p_cleanup uuid, p_note text default null)
returns public.cleanups
language plpgsql security definer set search_path = ''
as $$
declare
  v_claim public.cleanups;
begin
  select * into v_claim from public.cleanups where id = p_cleanup for update;
  if v_claim.id is null or not public.can_review_cleanup(v_claim.site_id) then
    raise exception 'moderator role required' using errcode = '42501';
  end if;
  if v_claim.status <> 'done' then
    raise exception 'cleanup not found or not done' using errcode = 'P0001';
  end if;

  update public.cleanups
    set status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(), review_note = left(p_note, 300)
    where id = v_claim.id returning * into v_claim;

  -- Make the original row and its reversal public together (net zero).
  update public.points_ledger set confirmed_at = coalesce(confirmed_at, now())
    where cleanup_id = v_claim.id and kind = 'clean';
  insert into public.points_ledger (user_id, kind, points, site_id, cleanup_id, confirmed_at)
  values (v_claim.volunteer_id, 'revoked', -v_claim.points, v_claim.site_id, v_claim.id, now());

  perform set_config('app.transition_note', coalesce('cleanup rejected: ' || p_note, 'cleanup rejected'), true);
  update public.sites
    set status = 'verified', cleared_at = null, closed_at = null, after_photo_path = null,
        after_photo_geom = null, cleared_cleanup_id = null
    where id = v_claim.site_id and cleared_cleanup_id = v_claim.id;
  return v_claim;
end;
$$;

revoke execute on function public.approve_cleanup(uuid) from public, anon;
grant execute on function public.approve_cleanup(uuid) to authenticated;

-- Every unreviewed volunteer cleanup, oldest first, with what helps judge it.
drop view public.cleanup_review_queue;
create view public.cleanup_review_queue as
select
  c.id, c.site_id, c.done_at, c.points, c.note, c.after_photo_path,
  p.handle,
  s.site_type, s.ward_id,
  (select r.photo_path from public.reports r where r.site_id = s.id order by r.created_at limit 1) as before_photo_path,
  round(extensions.st_distance(c.after_geom::extensions.geography,
        extensions.st_snaptogrid(s.geom, 0.0005)::extensions.geography)::numeric, 1) as distance_m,
  (select count(*)::int from public.cleanups c2 where c2.volunteer_id = c.volunteer_id and c2.status = 'done') as hunter_cleans,
  (select count(*)::int from public.cleanups c2 where c2.volunteer_id = c.volunteer_id and c2.status = 'rejected') as hunter_rejected
from public.cleanups c
join public.sites s on s.id = c.site_id
left join public.profiles p on p.id = c.volunteer_id
where c.status = 'done' and c.reviewed_at is null
  and public.can_review_cleanup(c.site_id);
revoke all on public.cleanup_review_queue from anon, public;
grant select on public.cleanup_review_queue to authenticated;

-- ---------------------------------------------------------------------------
-- Leaderboard, stats, ward board
-- ---------------------------------------------------------------------------
create or replace view public.public_leaderboard as
with live as (
  select l.*
  from public.points_ledger l
  where public.ledger_row_live(l.kind, l.report_id, l.confirmed_at, l.created_at)
), totals as (
  select l.user_id,
    sum(l.points)::integer as points,
    coalesce(sum(l.points) filter (where l.created_at > now() - interval '7 days'), 0)::integer as points_week,
    (count(*) filter (where l.kind = 'clean') - count(*) filter (where l.kind = 'revoked' and l.cleanup_id is not null))::integer as cleans,
    (count(*) filter (where l.kind = 'report') - count(*) filter (where l.kind = 'revoked' and l.report_id is not null))::integer as reports
  from live l
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

drop function public.my_stats();
create function public.my_stats()
returns table (handle text, avatar_path text, points integer, points_pending integer, points_week integer,
               cleans integer, reports integer, rank integer, active_claims integer, streak_weeks integer,
               tier_claims integer, tier_cleans integer)
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_tier jsonb;
begin
  if v_uid is null then
    return;
  end if;
  v_tier := public.hunter_tier(v_uid);
  return query
  with mine as (
    select l.*, public.ledger_row_live(l.kind, l.report_id, l.confirmed_at, l.created_at) as live
    from public.points_ledger l where l.user_id = v_uid
  ), weeks as (
    -- Weeks (Asia/Dhaka) with at least one report or clean that was not reversed.
    select distinct date_trunc('week', m.created_at at time zone 'Asia/Dhaka')::date as wk
    from mine m
    where m.kind in ('report', 'clean')
      and not exists (select 1 from mine r where r.kind = 'revoked'
                      and (r.cleanup_id = m.cleanup_id or r.report_id = m.report_id))
  ), islands as (
    select wk, wk - (row_number() over (order by wk) * 7)::int as grp from weeks
  ), streak as (
    select count(*)::int as n, max(wk) as last_wk from islands group by grp
  )
  select
    p.handle, p.avatar_path,
    coalesce((select sum(m.points) from mine m), 0)::integer,
    coalesce((select sum(m.points) from mine m where not m.live), 0)::integer,
    coalesce((select sum(m.points) from mine m where m.created_at > now() - interval '7 days'), 0)::integer,
    ((select count(*) from mine m where m.kind = 'clean')
      - (select count(*) from mine m where m.kind = 'revoked' and m.cleanup_id is not null))::integer,
    ((select count(*) from mine m where m.kind = 'report')
      - (select count(*) from mine m where m.kind = 'revoked' and m.report_id is not null))::integer,
    (select lb.rank from public.public_leaderboard lb where lb.handle = p.handle),
    (select count(*)::integer from public.cleanups c
      where c.volunteer_id = p.id and c.status = 'claimed' and c.expires_at > now()),
    -- A streak survives until the current week ends.
    coalesce((select s.n from streak s
              where s.last_wk >= (date_trunc('week', now() at time zone 'Asia/Dhaka')::date - 7)
              order by s.last_wk desc limit 1), 0),
    (v_tier ->> 'claims')::integer,
    (v_tier ->> 'cleans')::integer
  from public.profiles p
  where p.id = v_uid;
end;
$$;
revoke execute on function public.my_stats() from public, anon;
grant execute on function public.my_stats() to authenticated;

-- Ward vs ward: spots destroyed by volunteers this week (aggregates only).
create view public.public_ward_board as
select
  w.id as ward_id, w.city_corp, w.ward_no, w.name_bn, w.name_en,
  count(c.id) filter (where c.done_at > now() - interval '7 days')::integer as cleans_week,
  count(distinct c.volunteer_id) filter (where c.done_at > now() - interval '7 days')::integer as hunters_week,
  count(c.id)::integer as cleans_28d
from public.wards w
join public.sites s on s.ward_id = w.id
join public.cleanups c on c.site_id = s.id and c.status = 'done' and c.done_at > now() - interval '28 days'
group by w.id;
grant select on public.public_ward_board to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Storage and profile checks
-- ---------------------------------------------------------------------------
-- After photos: only <uid>/<active claim id>.jpg (one per claim, retake overwrites).
drop policy cleanup_photos_insert on storage.objects;
create policy cleanup_photos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'cleanup-photos' and exists (
    select 1 from public.cleanups c
    where c.volunteer_id = (select auth.uid()) and c.status = 'claimed'
      and name = c.volunteer_id::text || '/' || c.id::text || '.jpg'));
create policy cleanup_photos_update on storage.objects for update to authenticated
  using (bucket_id = 'cleanup-photos' and name like (select auth.uid())::text || '/%')
  with check (bucket_id = 'cleanup-photos' and exists (
    select 1 from public.cleanups c
    where c.volunteer_id = (select auth.uid()) and c.status = 'claimed'
      and name = c.volunteer_id::text || '/' || c.id::text || '.jpg'));

-- Avatars: hunters only, <uid>/<timestamp>.jpg, a small number per person.
create or replace function public.avatar_upload_allowed(p_name text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select auth.uid() is not null
    and p_name ~ ('^' || auth.uid()::text || '/[0-9]{10,16}\.jpg$')
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.handle is not null)
    and (select count(*) from storage.objects o
         where o.bucket_id = 'avatars' and o.name like auth.uid()::text || '/%') < 10;
$$;
revoke execute on function public.avatar_upload_allowed(text) from public, anon;
grant execute on function public.avatar_upload_allowed(text) to authenticated;

drop policy avatars_insert on storage.objects;
create policy avatars_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and public.avatar_upload_allowed(name));
drop policy avatars_update on storage.objects;
update storage.buckets set allowed_mime_types = array['image/jpeg'] where id = 'avatars';

drop policy profiles_self_update on public.profiles;
create policy profiles_self_update on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (
    id = (select auth.uid())
    and (avatar_path is null or avatar_path ~ ('^' || id::text || '/[0-9]{10,16}\.jpg$'))
  );
alter table public.profiles add constraint profiles_avatar_path_format
  check (avatar_path is null or avatar_path ~ '^[0-9a-f-]{36}/[0-9]{10,16}\.jpg$') not valid;

-- Web push only to the browsers' push services (no requests to arbitrary hosts).
alter table public.push_subscriptions add constraint push_subscriptions_endpoint_host
  check (endpoint ~ '^https://(fcm\.googleapis\.com|([a-z0-9-]+\.)*push\.services\.mozilla\.com|([a-z0-9-]+\.)*notify\.windows\.com|([a-z0-9-]+\.)*push\.apple\.com)/')
  not valid;
