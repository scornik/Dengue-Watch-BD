-- Moderation queue, nearby sites, merge, paid-tier quota.
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

update public.wards set geom = extensions.st_multi(extensions.st_makeenvelope(90.40, 23.80, 90.41, 23.81, 4326)) where id = 1;
insert into auth.users (id, email, aud, role, instance_id) values
  ('00000000-0000-0000-0000-0000000000a1', 'm@test.bd', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('00000000-0000-0000-0000-0000000000a2', 'c@test.bd', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000');
update public.profiles set role = 'moderator' where id = '00000000-0000-0000-0000-0000000000a1';

insert into public.reports (id, photo_path, geom, device_hash, ai_label, site_type) values
  ('20000000-0000-0000-0000-000000000001', 'a.jpg', extensions.st_setsrid(extensions.st_makepoint(90.401, 23.801), 4326), 'dev-mod-00000000001', 'likely', 'tire'),
  ('20000000-0000-0000-0000-000000000002', 'b.jpg', extensions.st_setsrid(extensions.st_makepoint(90.405, 23.805), 4326), 'dev-mod-00000000002', 'pending', 'drain'),
  ('20000000-0000-0000-0000-000000000003', 'c.jpg', extensions.st_setsrid(extensions.st_makepoint(90.4058, 23.8055), 4326), 'dev-mod-00000000003', 'unclear', 'drain');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}';
select is((select count(*)::int from public.moderation_queue), 0, 'citizen sees an empty moderation queue');
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
select results_eq(
  $$select id from public.moderation_queue order by priority, created_at$$,
  $$values ('20000000-0000-0000-0000-000000000002'::uuid), ('20000000-0000-0000-0000-000000000003'::uuid), ('20000000-0000-0000-0000-000000000001'::uuid)$$,
  'queue orders pending, unclear, then likely');
select is(
  (select count(*)::int from public.nearby_open_sites((select site_id from public.reports where id = '20000000-0000-0000-0000-000000000002'))),
  1, 'nearby_open_sites finds the site ~100 m away');
select lives_ok(
  $$select public.merge_sites(
      (select site_id from public.reports where id = '20000000-0000-0000-0000-000000000003'),
      (select site_id from public.reports where id = '20000000-0000-0000-0000-000000000002'))$$,
  'moderator merges duplicate sites');
select is(
  (select report_count from public.sites where id = (select site_id from public.reports where id = '20000000-0000-0000-0000-000000000002')),
  2, 'merged site carries both reports');
select is(
  (select site_id from public.reports where id = '20000000-0000-0000-0000-000000000003'),
  (select site_id from public.reports where id = '20000000-0000-0000-0000-000000000002'),
  'report moved to the target site');
select lives_ok($$select public.moderate_report('20000000-0000-0000-0000-000000000001', 'relabel', 'bucket_drum')$$, 'relabel');
select is((select site_type::text from public.reports where id = '20000000-0000-0000-0000-000000000001'), 'bucket_drum', 'relabel changes type');
select is((select count(*)::int from public.moderation_queue where id = '20000000-0000-0000-0000-000000000001'), 0,
  'human-labelled report leaves the queue');
reset role;

-- Paid tier daily cap
select ok(public.claim_ai_quota('test', 2), 'quota call 1 allowed');
select ok(public.claim_ai_quota('test', 2), 'quota call 2 allowed');
select ok(not public.claim_ai_quota('test', 2), 'quota call 3 refused at cap');

select * from finish();
rollback;
