-- DengueWatch BD — storage buckets/policies and scheduled jobs

-- ---------------------------------------------------------------------------
-- Buckets
--  report-photos  private; EXIF-stripped originals, written by submit-report
--  public-thumbs  public;  blurred thumbnails, written only by /workers/thumbs
--  after-photos   private; inspector "cleared" evidence
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('report-photos', 'report-photos', false, 8388608, array['image/jpeg']),
  ('public-thumbs', 'public-thumbs', true, 1048576, array['image/jpeg', 'image/webp']),
  ('after-photos', 'after-photos', false, 8388608, array['image/jpeg'])
on conflict (id) do nothing;

create or replace function public.can_read_report_photo(p_name text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.reports r
    where r.photo_path = p_name
      and (r.reporter_id = (select auth.uid()) or public.can_read_ward(r.ward_id)));
$$;

create or replace function public.can_manage_site_path(p_name text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.sites s
    where s.id::text = split_part(p_name, '/', 1)
      and public.can_manage_ward(s.ward_id));
$$;

create or replace function public.can_read_site_path(p_name text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.sites s
    where s.id::text = split_part(p_name, '/', 1)
      and public.can_read_ward(s.ward_id));
$$;

grant execute on function public.can_read_report_photo(text) to authenticated;
grant execute on function public.can_manage_site_path(text) to authenticated;
grant execute on function public.can_read_site_path(text) to authenticated;

create policy report_photos_read on storage.objects for select to authenticated
  using (bucket_id = 'report-photos' and public.can_read_report_photo(name));

create policy after_photos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'after-photos' and public.can_manage_site_path(name));

create policy after_photos_read on storage.objects for select to authenticated
  using (bucket_id = 'after-photos' and public.can_read_site_path(name));

-- public-thumbs is a public bucket: files are served by URL; no list/write policies.

-- ---------------------------------------------------------------------------
-- Scheduled jobs (pg_cron + pg_net). They call Edge Functions using two Vault
-- secrets the operator creates after deploy (see README "Scheduled jobs"):
--   select vault.create_secret('https://<ref>.supabase.co', 'project_url');
--   select vault.create_secret('<service-role-key>', 'service_role_key');
-- If the secrets are missing the job is a no-op.
-- ---------------------------------------------------------------------------
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

create or replace function public.invoke_edge_function(p_name text, p_body jsonb default '{}'::jsonb)
returns bigint
language plpgsql security definer set search_path = ''
as $$
declare
  v_url text;
  v_key text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'service_role_key';
  if v_url is null or v_key is null then
    raise notice 'invoke_edge_function(%): vault secrets project_url/service_role_key missing', p_name;
    return null;
  end if;
  return net.http_post(
    url := v_url || '/functions/v1/' || p_name,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key),
    body := p_body,
    timeout_milliseconds := 30000
  );
end;
$$;
revoke execute on function public.invoke_edge_function(text, jsonb) from public, anon, authenticated;

-- Web push to reporters for new status events: every 5 minutes.
select cron.schedule('notify-status', '*/5 * * * *', $$select public.invoke_edge_function('notify-status')$$);
-- Paid screening backlog (no-op unless PAID_AI_ENABLED=true): hourly.
select cron.schedule('screen-backlog', '17 * * * *', $$select public.invoke_edge_function('screen-report', '{"backlog": true}'::jsonb)$$);
-- Weekly ward digest: Monday 08:00 Asia/Dhaka = Monday 02:00 UTC.
select cron.schedule('weekly-digest', '0 2 * * 1', $$select public.invoke_edge_function('weekly-digest')$$);
