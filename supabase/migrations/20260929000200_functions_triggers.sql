-- DengueWatch BD — helper functions, triggers and RPCs

-- ---------------------------------------------------------------------------
-- Role helpers (security definer so they can read profiles under RLS)
-- ---------------------------------------------------------------------------
create or replace function public.current_app_role()
returns public.user_role
language sql stable security definer set search_path = ''
as $$
  select coalesce(
    (select p.role from public.profiles p where p.id = (select auth.uid())),
    'citizen'::public.user_role
  );
$$;

create or replace function public.current_ward_id()
returns integer
language sql stable security definer set search_path = ''
as $$
  select p.ward_id from public.profiles p where p.id = (select auth.uid());
$$;

create or replace function public.current_city_corp()
returns public.city_corp
language sql stable security definer set search_path = ''
as $$
  select coalesce(p.city_corp, w.city_corp)
  from public.profiles p
  left join public.wards w on w.id = p.ward_id
  where p.id = (select auth.uid());
$$;

create or replace function public.has_role(variadic roles public.user_role[])
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.current_app_role() = any (roles);
$$;

-- True when the caller may work (update) sites in the given ward.
create or replace function public.can_manage_ward(p_ward integer)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select case public.current_app_role()
    when 'superadmin' then true
    when 'inspector' then p_ward is not null and p_ward = public.current_ward_id()
    when 'ward_admin' then p_ward is not null and exists (
      select 1 from public.wards w where w.id = p_ward and w.city_corp = public.current_city_corp())
    else false
  end;
$$;

-- True when the caller may read exact site/report data for the given ward.
create or replace function public.can_read_ward(p_ward integer)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.has_role('moderator', 'superadmin') or public.can_manage_ward(p_ward);
$$;

-- Is this statement running on behalf of an end user (PostgREST anon/authenticated)?
-- Inside security definer functions current_user is the owner, which counts as system.
create or replace function public.is_end_user_context()
returns boolean
language sql stable set search_path = ''
as $$
  select current_user in ('anon', 'authenticated');
$$;

-- ---------------------------------------------------------------------------
-- New auth user -> profile (applies staff invite when the email matches)
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  inv public.staff_invites%rowtype;
begin
  if new.email is not null then
    select * into inv from public.staff_invites where email = lower(new.email);
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

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- An existing (e.g. anonymous) user who later confirms email/phone.
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
  if new.email is not null and new.email is distinct from old.email then
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

create trigger on_auth_user_updated
  after update on auth.users
  for each row execute function public.handle_user_updated();

-- ---------------------------------------------------------------------------
-- Report rate limits (rules tier). Enforced in the DB so no path bypasses it;
-- the submit-report Edge Function calls report_quota() first for nice errors.
-- ---------------------------------------------------------------------------
create or replace function public.report_quota(p_device_hash text)
returns table (last_hour integer, last_day integer, total integer, hour_limit integer, day_limit integer)
language sql stable security definer set search_path = ''
as $$
  select
    count(*) filter (where r.created_at > now() - interval '1 hour')::integer,
    count(*) filter (where r.created_at > now() - interval '1 day')::integer,
    count(*)::integer,
    10,
    30
  from public.reports r
  where r.device_hash = p_device_hash;
$$;

-- ---------------------------------------------------------------------------
-- Report insert: rate limit, ward lookup and duplicate merge into sites
-- ---------------------------------------------------------------------------
create or replace function public.reports_before_insert()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  q record;
  v_site uuid;
begin
  select * into q from public.report_quota(new.device_hash);
  if q.last_hour >= q.hour_limit then
    raise exception 'rate_limited: max % reports per hour', q.hour_limit using errcode = 'P0429';
  end if;
  if q.last_day >= q.day_limit then
    raise exception 'rate_limited: max % reports per day', q.day_limit using errcode = 'P0429';
  end if;

  new.created_at := coalesce(new.created_at, now());

  -- Ward by point-in-polygon.
  select w.id into new.ward_id
  from public.wards w
  where w.geom is not null and extensions.st_contains(w.geom, new.geom)
  limit 1;

  -- Serialise site matching so two simultaneous reports of the same spot
  -- cannot both create a new site.
  perform pg_advisory_xact_lock(hashtext('denguewatch.site_merge'));

  select s.id into v_site
  from public.sites s
  where s.status in ('new', 'verified', 'assigned')
    and s.last_reported_at > new.created_at - interval '7 days'
    and extensions.st_dwithin(s.geom::extensions.geography, new.geom::extensions.geography, 25)
  order by extensions.st_distance(s.geom::extensions.geography, new.geom::extensions.geography)
  limit 1;

  if v_site is null then
    insert into public.sites (geom, ward_id, site_type, larvae_reported, report_count, first_reported_at, last_reported_at)
    values (new.geom, new.ward_id, new.site_type, new.larvae_seen = 'yes', 1, new.created_at, new.created_at)
    returning id into v_site;
  else
    update public.sites
      set report_count = report_count + 1,
          last_reported_at = greatest(last_reported_at, new.created_at),
          larvae_reported = larvae_reported or new.larvae_seen = 'yes',
          updated_at = now()
      where id = v_site;
  end if;

  new.site_id := v_site;
  return new;
end;
$$;

create trigger reports_before_insert
  before insert on public.reports
  for each row execute function public.reports_before_insert();

-- ---------------------------------------------------------------------------
-- Site status state machine
-- ---------------------------------------------------------------------------
create or replace function public.site_transition_allowed(
  p_role public.user_role, p_from public.site_status, p_to public.site_status)
returns boolean
language sql immutable set search_path = ''
as $$
  select case
    when p_from = p_to then false
    when p_role = 'superadmin' then true
    when p_role = 'moderator' then (p_from, p_to) in (
      ('new', 'verified'), ('new', 'rejected'), ('verified', 'rejected'),
      ('verified', 'new'), ('rejected', 'new'))
    when p_role = 'inspector' then (p_from in ('new', 'verified') and p_to = 'assigned')
      or (p_from = 'assigned' and p_to = 'verified')
      or (p_from in ('new', 'verified', 'assigned') and p_to in ('cleared', 'not_found'))
    when p_role = 'ward_admin' then
      (p_from in ('new', 'verified') and p_to in ('verified', 'assigned', 'rejected'))
      or (p_from = 'assigned' and p_to in ('verified', 'assigned', 'cleared', 'not_found'))
      or (p_from = 'new' and p_to in ('cleared', 'not_found'))
      or (p_from = 'verified' and p_to in ('cleared', 'not_found'))
      or (p_from in ('cleared', 'not_found', 'rejected') and p_to = 'verified')
    else false
  end;
$$;

-- Security invoker on purpose: is_end_user_context() must see the caller's
-- role. RPCs that run as definer (moderation, merge) are treated as system.
create or replace function public.profile_brief(p_id uuid)
returns table (role public.user_role, ward_id integer)
language sql stable security definer set search_path = ''
as $$
  select p.role, p.ward_id from public.profiles p where p.id = p_id;
$$;

create or replace function public.sites_before_update()
returns trigger
language plpgsql security invoker set search_path = ''
as $$
declare
  v_role public.user_role;
  v_assignee record;
begin
  new.updated_at := now();

  if new.status is distinct from old.status then
    if public.is_end_user_context() then
      v_role := public.current_app_role();
      if not public.site_transition_allowed(v_role, old.status, new.status) then
        raise exception 'transition % -> % not allowed for role %', old.status, new.status, v_role
          using errcode = '42501';
      end if;
    end if;

    case new.status
      when 'verified' then
        new.verified_at := coalesce(old.verified_at, now());
        new.assigned_to := null;
        new.assigned_at := null;
        new.closed_at := null;
      when 'assigned' then
        new.verified_at := coalesce(old.verified_at, now());
        new.assigned_at := now();
        if new.assigned_to is null then
          new.assigned_to := auth.uid();
        end if;
      when 'cleared' then
        if new.after_photo_path is null or new.after_photo_geom is null then
          raise exception 'cleared requires an on-site after photo with GPS' using errcode = '23514';
        end if;
        if not extensions.st_dwithin(new.after_photo_geom::extensions.geography, new.geom::extensions.geography, 50) then
          raise exception 'after photo must be taken within 50 m of the site' using errcode = '23514';
        end if;
        new.cleared_at := now();
        new.closed_at := now();
      when 'not_found' then
        if coalesce(trim(new.not_found_reason), '') = '' then
          raise exception 'not_found requires a reason' using errcode = '23514';
        end if;
        new.closed_at := now();
      when 'rejected' then
        new.closed_at := now();
      when 'new' then
        new.verified_at := null;
        new.closed_at := null;
    end case;
  end if;

  -- Inspectors may only assign sites to themselves; admins only to inspectors of that ward.
  if new.assigned_to is distinct from old.assigned_to and new.assigned_to is not null
     and public.is_end_user_context() then
    select * into v_assignee from public.profile_brief(new.assigned_to);
    if public.current_app_role() = 'inspector' and new.assigned_to <> auth.uid() then
      raise exception 'inspectors can only assign sites to themselves' using errcode = '42501';
    end if;
    if v_assignee.role is distinct from 'inspector' and public.current_app_role() <> 'superadmin'
       and new.assigned_to <> auth.uid() then
      raise exception 'assignee must be an inspector' using errcode = '23514';
    end if;
    if v_assignee.role = 'inspector' and v_assignee.ward_id is distinct from new.ward_id then
      raise exception 'assignee must be an inspector of this ward' using errcode = '23514';
    end if;
  end if;

  -- Location and ward are immutable for end users.
  if public.is_end_user_context() and (
       not extensions.st_equals(new.geom, old.geom) or new.ward_id is distinct from old.ward_id) then
    raise exception 'site location cannot be changed' using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger sites_before_update
  before update on public.sites
  for each row execute function public.sites_before_update();

-- Every status change writes an audit event.
create or replace function public.sites_log_event()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.site_events (site_id, actor_id, from_status, to_status, note)
    values (new.id, auth.uid(), null, new.status, 'created');
  elsif new.status is distinct from old.status then
    insert into public.site_events (site_id, actor_id, from_status, to_status, photo_path, note)
    values (
      new.id, auth.uid(), old.status, new.status,
      case when new.status = 'cleared' then new.after_photo_path end,
      coalesce(nullif(current_setting('app.transition_note', true), ''),
               case when new.status = 'not_found' then new.not_found_reason end)
    );
  end if;
  return null;
end;
$$;

create trigger sites_log_event
  after insert or update on public.sites
  for each row execute function public.sites_log_event();

-- site_events is append-only (only notified_at may be stamped by the notifier).
create or replace function public.site_events_append_only()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'site_events is append-only' using errcode = '42501';
  end if;
  if (new.site_id, new.actor_id, new.from_status, new.to_status, new.photo_path, new.note, new.created_at)
     is distinct from
     (old.site_id, old.actor_id, old.from_status, old.to_status, old.photo_path, old.note, old.created_at) then
    raise exception 'site_events is append-only' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger site_events_append_only
  before update or delete on public.site_events
  for each row execute function public.site_events_append_only();

-- ---------------------------------------------------------------------------
-- RPC: status transition with an audit note (runs with caller's rights + RLS)
-- ---------------------------------------------------------------------------
create or replace function public.transition_site(
  p_site uuid,
  p_to public.site_status,
  p_note text default null,
  p_photo_path text default null,
  p_lat double precision default null,
  p_lng double precision default null,
  p_assignee uuid default null
)
returns public.sites
language plpgsql security invoker set search_path = ''
as $$
declare
  v_row public.sites;
begin
  perform set_config('app.transition_note', coalesce(left(p_note, 500), ''), true);

  update public.sites s
    set status = p_to,
        assigned_to = case
          when p_to = 'assigned' then coalesce(p_assignee, auth.uid())
          else s.assigned_to end,
        after_photo_path = case when p_to = 'cleared' then p_photo_path else s.after_photo_path end,
        after_photo_geom = case
          when p_to = 'cleared' and p_lat is not null and p_lng is not null
            then extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)
          else s.after_photo_geom end,
        not_found_reason = case when p_to = 'not_found' then left(p_note, 500) else s.not_found_reason end
    where s.id = p_site
    returning * into v_row;

  if v_row.id is null then
    raise exception 'site not found or not permitted' using errcode = '42501';
  end if;
  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: moderation (approve / reject / relabel) — logs ai_labels for training
-- ---------------------------------------------------------------------------
create or replace function public.moderate_report(
  p_report uuid,
  p_decision text,
  p_site_type public.site_type default null,
  p_note text default null
)
returns public.reports
language plpgsql security definer set search_path = ''
as $$
declare
  r public.reports;
  s public.sites;
  v_label text;
begin
  if not public.has_role('moderator', 'ward_admin', 'superadmin') then
    raise exception 'moderator role required' using errcode = '42501';
  end if;
  if p_decision not in ('approve', 'reject', 'relabel') then
    raise exception 'unknown decision %', p_decision using errcode = '22023';
  end if;

  select * into r from public.reports where id = p_report for update;
  if r.id is null then
    raise exception 'report not found' using errcode = 'P0002';
  end if;
  select * into s from public.sites where id = r.site_id for update;

  perform set_config('app.transition_note', coalesce(left(p_note, 500), 'moderation: ' || p_decision), true);

  if p_decision = 'approve' then
    update public.reports
      set ai_label = 'likely', ai_source = 'human', site_type = coalesce(p_site_type, site_type)
      where id = r.id returning * into r;
    if s.status = 'new' then
      update public.sites set status = 'verified', site_type = r.site_type where id = s.id;
    end if;
    v_label := r.site_type::text;
  elsif p_decision = 'reject' then
    update public.reports
      set ai_label = 'not_relevant', ai_source = 'human'
      where id = r.id returning * into r;
    -- Reject the site only if no other report on it is still plausible.
    if s.status in ('new', 'verified') and not exists (
         select 1 from public.reports o
         where o.site_id = s.id and o.id <> r.id and o.ai_label <> 'not_relevant') then
      update public.sites set status = 'rejected' where id = s.id;
    end if;
    v_label := 'not_relevant';
  else
    if p_site_type is null then
      raise exception 'relabel needs p_site_type' using errcode = '22023';
    end if;
    update public.reports
      set site_type = p_site_type, ai_source = 'human'
      where id = r.id returning * into r;
    if s.report_count <= 1 then
      update public.sites set site_type = p_site_type where id = s.id;
    end if;
    v_label := p_site_type::text;
  end if;

  insert into public.ai_labels (report_id, source, model, label, moderator_label, moderator_id, raw_json)
  values (r.id, 'human', 'moderator', r.ai_label, v_label, auth.uid(),
          jsonb_build_object('decision', p_decision, 'note', p_note));
  return r;
end;
$$;

-- RPC: merge duplicate site p_from into p_into.
create or replace function public.merge_sites(p_from uuid, p_into uuid)
returns public.sites
language plpgsql security definer set search_path = ''
as $$
declare
  a public.sites;
  b public.sites;
begin
  if not public.has_role('moderator', 'ward_admin', 'superadmin') then
    raise exception 'moderator role required' using errcode = '42501';
  end if;
  if p_from = p_into then
    raise exception 'cannot merge a site into itself' using errcode = '22023';
  end if;
  select * into a from public.sites where id = p_from for update;
  select * into b from public.sites where id = p_into for update;
  if a.id is null or b.id is null then
    raise exception 'site not found' using errcode = 'P0002';
  end if;
  if b.status in ('rejected') or b.merged_into is not null then
    raise exception 'target site is closed' using errcode = '22023';
  end if;

  update public.reports set site_id = b.id where site_id = a.id;
  update public.sites
    set report_count = b.report_count + a.report_count,
        first_reported_at = least(b.first_reported_at, a.first_reported_at),
        last_reported_at = greatest(b.last_reported_at, a.last_reported_at),
        larvae_reported = b.larvae_reported or a.larvae_reported
    where id = b.id returning * into b;

  perform set_config('app.transition_note', 'merged into ' || b.id::text, true);
  update public.sites set status = 'rejected', merged_into = b.id, report_count = 0 where id = a.id;
  return b;
end;
$$;

-- ---------------------------------------------------------------------------
-- Paid screening tier: atomic daily cap
-- ---------------------------------------------------------------------------
create or replace function public.claim_ai_quota(p_provider text, p_cap integer)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_calls integer;
  v_day date := (now() at time zone 'Asia/Dhaka')::date;
begin
  insert into public.ai_usage (day, provider, calls) values (v_day, p_provider, 0)
  on conflict (day, provider) do nothing;
  update public.ai_usage set calls = calls + 1
    where day = v_day and provider = p_provider and calls < p_cap
    returning calls into v_calls;
  return v_calls is not null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Admin: load ward boundaries from a GeoJSON FeatureCollection
-- Feature properties: city_corp (DNCC|DSCC), ward_no, optional name_bn/name_en.
-- ---------------------------------------------------------------------------
create or replace function public.upsert_wards_geojson(p_fc jsonb, p_source text default 'manual')
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  f jsonb;
  v_corp public.city_corp;
  v_no integer;
  v_geom extensions.geometry;
  n integer := 0;
begin
  if public.is_end_user_context() and not public.has_role('superadmin', 'ward_admin') then
    raise exception 'admin role required' using errcode = '42501';
  end if;
  for f in select * from jsonb_array_elements(p_fc -> 'features') loop
    v_corp := upper(f -> 'properties' ->> 'city_corp')::public.city_corp;
    v_no := (f -> 'properties' ->> 'ward_no')::integer;
    if public.is_end_user_context() and public.current_app_role() = 'ward_admin'
       and v_corp <> public.current_city_corp() then
      raise exception 'ward admins can only load their own city corporation' using errcode = '42501';
    end if;
    v_geom := extensions.st_multi(extensions.st_makevalid(
      extensions.st_setsrid(extensions.st_geomfromgeojson((f -> 'geometry')::text), 4326)));
    v_geom := extensions.st_multi(extensions.st_collectionextract(v_geom, 3));
    insert into public.wards (id, city_corp, ward_no, name_bn, name_en, geom, geom_source)
    values (
      case v_corp when 'DNCC' then v_no else 100 + v_no end,
      v_corp, v_no,
      coalesce(f -> 'properties' ->> 'name_bn', 'ওয়ার্ড ' || v_no),
      coalesce(f -> 'properties' ->> 'name_en', 'Ward ' || v_no),
      v_geom, p_source)
    on conflict (city_corp, ward_no) do update
      set geom = excluded.geom,
          geom_source = excluded.geom_source,
          name_bn = coalesce(f -> 'properties' ->> 'name_bn', public.wards.name_bn),
          name_en = coalesce(f -> 'properties' ->> 'name_en', public.wards.name_en),
          updated_at = now();
    n := n + 1;
  end loop;

  -- Backfill ward on reports/sites that were outside every known polygon.
  update public.reports r set ward_id = w.id
    from public.wards w
    where r.ward_id is null and w.geom is not null and extensions.st_contains(w.geom, r.geom);
  update public.sites s set ward_id = w.id
    from public.wards w
    where s.ward_id is null and w.geom is not null and extensions.st_contains(w.geom, s.geom);
  return n;
end;
$$;
