-- DengueWatch BD — core schema
-- All geometry is SRID 4326. Distances are computed on geography.

create extension if not exists postgis with schema extensions;
create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.city_corp as enum ('DNCC', 'DSCC');
create type public.user_role as enum ('citizen', 'moderator', 'inspector', 'ward_admin', 'researcher', 'superadmin');
create type public.site_type as enum ('tire', 'bucket_drum', 'ac_drip', 'construction', 'rooftop', 'flower_tub', 'drain', 'other');
create type public.larvae_seen as enum ('yes', 'no', 'unsure');
create type public.ai_label as enum ('likely', 'unclear', 'not_relevant', 'pending');
create type public.ai_source as enum ('device', 'api', 'model', 'human');
create type public.site_status as enum ('new', 'verified', 'assigned', 'cleared', 'not_found', 'rejected');
create type public.risk_level as enum ('green', 'yellow', 'orange', 'red');
create type public.thumb_status as enum ('pending', 'ok', 'failed');

-- ---------------------------------------------------------------------------
-- Wards
-- Ids are deterministic: DNCC ward n -> n, DSCC ward n -> 100 + n.
-- geom may be null until a boundary is loaded (see DECISIONS.md).
-- ---------------------------------------------------------------------------
create table public.wards (
  id integer primary key,
  city_corp public.city_corp not null,
  ward_no integer not null check (ward_no > 0),
  name_bn text not null,
  name_en text not null,
  geom extensions.geometry(MultiPolygon, 4326),
  geom_source text,
  area_km2 real generated always as (
    case when geom is null then null
    else (extensions.st_area(geom::extensions.geography) / 1e6)::real end
  ) stored,
  updated_at timestamptz not null default now(),
  unique (city_corp, ward_no)
);
create index wards_geom_idx on public.wards using gist (geom);

-- ---------------------------------------------------------------------------
-- Profiles (one per auth user, including anonymous citizens)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.user_role not null default 'citizen',
  ward_id integer references public.wards (id),
  city_corp public.city_corp,
  display_name text check (char_length(display_name) <= 80),
  phone_verified boolean not null default false,
  created_at timestamptz not null default now(),
  -- inspectors are tied to a ward; ward admins to a city corporation
  constraint inspector_has_ward check (role <> 'inspector' or ward_id is not null),
  constraint ward_admin_has_corp check (role <> 'ward_admin' or city_corp is not null)
);
create index profiles_ward_idx on public.profiles (ward_id);

-- Invites: staff roles are granted by email before the user first signs in.
create table public.staff_invites (
  email text primary key check (email = lower(email)),
  role public.user_role not null check (role <> 'citizen'),
  ward_id integer references public.wards (id),
  city_corp public.city_corp,
  display_name text,
  invited_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  accepted_at timestamptz
);

-- ---------------------------------------------------------------------------
-- Sites (deduplicated breeding-site locations)
-- ---------------------------------------------------------------------------
create table public.sites (
  id uuid primary key default gen_random_uuid(),
  geom extensions.geometry(Point, 4326) not null,
  ward_id integer references public.wards (id),
  status public.site_status not null default 'new',
  site_type public.site_type not null default 'other',
  larvae_reported boolean not null default false,
  report_count integer not null default 0,
  first_reported_at timestamptz not null default now(),
  last_reported_at timestamptz not null default now(),
  verified_at timestamptz,
  assigned_to uuid references public.profiles (id) on delete set null,
  assigned_at timestamptz,
  cleared_at timestamptz,
  closed_at timestamptz,
  after_photo_path text,
  after_photo_geom extensions.geometry(Point, 4326),
  not_found_reason text check (char_length(not_found_reason) <= 500),
  merged_into uuid references public.sites (id),
  updated_at timestamptz not null default now()
);
create index sites_geom_idx on public.sites using gist (geom);
create index sites_ward_status_idx on public.sites (ward_id, status);
create index sites_status_idx on public.sites (status, first_reported_at);

-- ---------------------------------------------------------------------------
-- Reports (one per citizen submission)
-- ---------------------------------------------------------------------------
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references auth.users (id) on delete set null,
  photo_path text not null,
  thumb_public_path text,
  thumb_status public.thumb_status not null default 'pending',
  geom extensions.geometry(Point, 4326) not null,
  accuracy_m real check (accuracy_m is null or accuracy_m >= 0),
  site_type public.site_type not null default 'other',
  larvae_seen public.larvae_seen not null default 'unsure',
  self_cleaned boolean not null default false,
  note text check (char_length(note) <= 500),
  ai_label public.ai_label not null default 'pending',
  ai_score real,
  ai_source public.ai_source not null default 'device',
  site_id uuid references public.sites (id) on delete set null,
  ward_id integer references public.wards (id),
  device_hash text not null check (char_length(device_hash) between 16 and 128),
  created_at timestamptz not null default now()
);
create index reports_geom_idx on public.reports using gist (geom);
create index reports_device_idx on public.reports (device_hash, created_at desc);
create index reports_site_idx on public.reports (site_id);
create index reports_reporter_idx on public.reports (reporter_id);
create index reports_moderation_idx on public.reports (ai_label, created_at);
create index reports_thumb_idx on public.reports (thumb_status) where thumb_status = 'pending';

-- ---------------------------------------------------------------------------
-- Site events: append-only audit trail of every status change
-- ---------------------------------------------------------------------------
create table public.site_events (
  id bigint generated always as identity primary key,
  site_id uuid not null references public.sites (id) on delete cascade,
  actor_id uuid references auth.users (id) on delete set null,
  from_status public.site_status,
  to_status public.site_status not null,
  photo_path text,
  note text,
  notified_at timestamptz,
  created_at timestamptz not null default now()
);
create index site_events_site_idx on public.site_events (site_id, created_at);
create index site_events_unnotified_idx on public.site_events (created_at) where notified_at is null;

-- ---------------------------------------------------------------------------
-- Ward environmental risk (written weekly by /workers/satellite)
-- ---------------------------------------------------------------------------
create table public.ward_risk (
  ward_id integer not null references public.wards (id) on delete cascade,
  week date not null,
  ndvi real,
  ndwi real,
  ndbi real,
  lst_c real,
  rain_14d_mm real,
  report_density real,
  cases_area real,
  score real,
  level public.risk_level,
  method_version text,
  computed_at timestamptz not null default now(),
  primary key (ward_id, week)
);

-- ---------------------------------------------------------------------------
-- Official case counts (DGHS bulletin scraper or manual admin entry)
-- ---------------------------------------------------------------------------
create table public.case_counts (
  date date not null,
  area text not null check (area ~ '^[A-Z_]+$'),
  admissions integer not null check (admissions >= 0),
  deaths integer not null default 0 check (deaths >= 0),
  source_url text,
  entered_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (date, area)
);

-- ---------------------------------------------------------------------------
-- AI labels: every screening result and moderator decision (P3 training data)
-- ---------------------------------------------------------------------------
create table public.ai_labels (
  id bigint generated always as identity primary key,
  report_id uuid not null references public.reports (id) on delete cascade,
  source public.ai_source not null,
  model text,
  label public.ai_label,
  score real,
  raw_json jsonb,
  moderator_label text,
  moderator_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index ai_labels_report_idx on public.ai_labels (report_id);

-- Daily usage counter for the optional paid screening tier.
create table public.ai_usage (
  day date not null,
  provider text not null,
  calls integer not null default 0,
  primary key (day, provider)
);

-- Web push subscriptions (reporters and staff).
create table public.push_subscriptions (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  locale text not null default 'bn' check (locale in ('bn', 'en')),
  created_at timestamptz not null default now()
);
create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

-- Weekly digest log (M8), so the digest job is idempotent.
create table public.digest_log (
  week date not null,
  recipient text not null,
  ward_scope text not null,
  sent_at timestamptz not null default now(),
  primary key (week, recipient)
);
