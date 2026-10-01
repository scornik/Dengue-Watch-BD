-- RLS, triggers and views. Run with: supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(69);

-- ---------------------------------------------------------------------------
-- Fixtures (as postgres). Two synthetic square wards near Dhaka.
-- ---------------------------------------------------------------------------
update public.wards set geom = extensions.st_multi(extensions.st_makeenvelope(90.40, 23.80, 90.41, 23.81, 4326)) where id = 1;   -- DNCC 1
update public.wards set geom = extensions.st_multi(extensions.st_makeenvelope(90.41, 23.80, 90.42, 23.81, 4326)) where id = 2;   -- DNCC 2
update public.wards set geom = extensions.st_multi(extensions.st_makeenvelope(90.40, 23.70, 90.41, 23.71, 4326)) where id = 101; -- DSCC 1

insert into auth.users (id, email, aud, role, instance_id) values
  ('00000000-0000-0000-0000-00000000000a', 'citizen@test.bd', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('00000000-0000-0000-0000-00000000000b', 'mod@test.bd', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('00000000-0000-0000-0000-00000000000c', 'insp1@test.bd', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('00000000-0000-0000-0000-00000000000d', 'insp2@test.bd', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('00000000-0000-0000-0000-00000000000e', 'admin@test.bd', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('00000000-0000-0000-0000-00000000000f', 'research@test.bd', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000');

select is((select count(*)::int from public.profiles where id::text like '00000000-0000-0000-0000-00000000000%'), 6,
  'profiles are created for new auth users');

update public.profiles set role = 'moderator' where id = '00000000-0000-0000-0000-00000000000b';
update public.profiles set role = 'inspector', ward_id = 1 where id = '00000000-0000-0000-0000-00000000000c';
update public.profiles set role = 'inspector', ward_id = 101 where id = '00000000-0000-0000-0000-00000000000d';
update public.profiles set role = 'ward_admin', city_corp = 'DSCC' where id = '00000000-0000-0000-0000-00000000000e';
update public.profiles set role = 'researcher' where id = '00000000-0000-0000-0000-00000000000f';

-- Staff invite applied on signup
insert into public.staff_invites (email, role, ward_id) values ('invited@test.bd', 'inspector', 2);
-- Magic-link sign-in confirms the email; only then does the invite apply.
insert into auth.users (id, email, aud, role, instance_id, email_confirmed_at) values
  ('00000000-0000-0000-0000-000000000010', 'Invited@test.bd', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', now());
select results_eq(
  $$select role::text, ward_id from public.profiles where id = '00000000-0000-0000-0000-000000000010'$$,
  $$values ('inspector', 2)$$,
  'staff invite sets role and ward on signup');

-- ---------------------------------------------------------------------------
-- RLS is enabled on every table in public
-- ---------------------------------------------------------------------------
select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity),
  0, 'RLS enabled on every public table');

-- ---------------------------------------------------------------------------
-- Report insert trigger: ward lookup, site creation, duplicate merge
-- ---------------------------------------------------------------------------
insert into public.reports (id, reporter_id, photo_path, geom, site_type, larvae_seen, device_hash)
values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 'r/1.jpg',
        extensions.st_setsrid(extensions.st_makepoint(90.405, 23.805), 4326), 'tire', 'yes', 'device-aaaaaaaaaaaaaaaa');
select is((select ward_id from public.reports where id = '10000000-0000-0000-0000-000000000001'), 1, 'report ward set by ST_Contains');
select isnt((select site_id from public.reports where id = '10000000-0000-0000-0000-000000000001'), null, 'report attached to a site');
select is((select status::text from public.sites s join public.reports r on r.site_id = s.id
           where r.id = '10000000-0000-0000-0000-000000000001'), 'new', 'new site has status new');
select is((select count(*)::int from public.site_events e join public.reports r on r.site_id = e.site_id
           where r.id = '10000000-0000-0000-0000-000000000001'), 1, 'site creation is logged in site_events');

-- ~11 m away -> same site
insert into public.reports (id, photo_path, geom, device_hash)
values ('10000000-0000-0000-0000-000000000002', 'r/2.jpg',
        extensions.st_setsrid(extensions.st_makepoint(90.4051, 23.8050), 4326), 'device-bbbbbbbbbbbbbbbb');
select is(
  (select site_id from public.reports where id = '10000000-0000-0000-0000-000000000002'),
  (select site_id from public.reports where id = '10000000-0000-0000-0000-000000000001'),
  'report within 25 m joins the existing site');
select is((select report_count from public.sites where id = (select site_id from public.reports where id = '10000000-0000-0000-0000-000000000001')),
  2, 'site report_count incremented');

-- ~100 m away -> new site
insert into public.reports (id, photo_path, geom, device_hash)
values ('10000000-0000-0000-0000-000000000003', 'r/3.jpg',
        extensions.st_setsrid(extensions.st_makepoint(90.4060, 23.8050), 4326), 'device-bbbbbbbbbbbbbbbb');
select isnt(
  (select site_id from public.reports where id = '10000000-0000-0000-0000-000000000003'),
  (select site_id from public.reports where id = '10000000-0000-0000-0000-000000000001'),
  'report beyond 25 m creates a new site');

-- Same spot but the site was last reported 8 days ago -> new site
update public.sites set last_reported_at = now() - interval '8 days', first_reported_at = now() - interval '8 days'
  where id = (select site_id from public.reports where id = '10000000-0000-0000-0000-000000000003');
insert into public.reports (id, photo_path, geom, device_hash)
values ('10000000-0000-0000-0000-000000000004', 'r/4.jpg',
        extensions.st_setsrid(extensions.st_makepoint(90.4060, 23.8050), 4326), 'device-cccccccccccccccc');
select isnt(
  (select site_id from public.reports where id = '10000000-0000-0000-0000-000000000004'),
  (select site_id from public.reports where id = '10000000-0000-0000-0000-000000000003'),
  'report 8 days after the last report creates a new site');

-- DSCC ward 1 report
insert into public.reports (id, photo_path, geom, device_hash, site_type)
values ('10000000-0000-0000-0000-000000000005', 'r/5.jpg',
        extensions.st_setsrid(extensions.st_makepoint(90.405, 23.705), 4326), 'device-dddddddddddddddd', 'drain');
select is((select ward_id from public.reports where id = '10000000-0000-0000-0000-000000000005'), 101, 'DSCC report ward = 101');

-- Report outside every ward
insert into public.reports (id, photo_path, geom, device_hash)
values ('10000000-0000-0000-0000-000000000006', 'r/6.jpg',
        extensions.st_setsrid(extensions.st_makepoint(91.0, 22.0), 4326), 'device-eeeeeeeeeeeeeeee');
select is((select ward_id from public.reports where id = '10000000-0000-0000-0000-000000000006'), null, 'report outside wards has null ward');

-- ---------------------------------------------------------------------------
-- Rate limits: 10 per device per hour, 30 per day
-- ---------------------------------------------------------------------------
insert into public.reports (photo_path, geom, device_hash)
select 'r/rl' || g || '.jpg', extensions.st_setsrid(extensions.st_makepoint(90.3 + g * 0.001, 23.9), 4326), 'device-ratelimit-hour00'
from generate_series(1, 10) g;
select throws_ok(
  $$insert into public.reports (photo_path, geom, device_hash) values ('r/x.jpg', extensions.st_setsrid(extensions.st_makepoint(90.35, 23.95), 4326), 'device-ratelimit-hour00')$$,
  'P0429', null, '11th report in an hour is rejected');

insert into public.reports (photo_path, geom, device_hash, created_at)
select 'r/rd' || g || '.jpg', extensions.st_setsrid(extensions.st_makepoint(90.3 + g * 0.001, 23.95), 4326), 'device-ratelimit-day000', now() - interval '2 hours'
from generate_series(1, 10) g;
insert into public.reports (photo_path, geom, device_hash, created_at)
select 'r/rd2' || g || '.jpg', extensions.st_setsrid(extensions.st_makepoint(90.3 + g * 0.001, 23.96), 4326), 'device-ratelimit-day000', now() - interval '3 hours'
from generate_series(1, 10) g;
insert into public.reports (photo_path, geom, device_hash, created_at)
select 'r/rd3' || g || '.jpg', extensions.st_setsrid(extensions.st_makepoint(90.3 + g * 0.001, 23.97), 4326), 'device-ratelimit-day000', now() - interval '4 hours'
from generate_series(1, 10) g;
select throws_ok(
  $$insert into public.reports (photo_path, geom, device_hash) values ('r/y.jpg', extensions.st_setsrid(extensions.st_makepoint(90.36, 23.95), 4326), 'device-ratelimit-day000')$$,
  'P0429', null, '31st report in a day is rejected');

-- ---------------------------------------------------------------------------
-- anon: public views only
-- ---------------------------------------------------------------------------
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select throws_ok($$select * from public.reports$$, '42501', null, 'anon cannot read reports');
select throws_ok($$select * from public.sites$$, '42501', null, 'anon cannot read sites');
select throws_ok($$select * from public.profiles$$, '42501', null, 'anon cannot read profiles');
select throws_ok($$select * from public.site_events$$, '42501', null, 'anon cannot read site_events');
select throws_ok($$select * from public.case_counts$$, '42501', null, 'anon cannot read case_counts table');
select throws_ok(
  $$insert into public.reports (photo_path, geom, device_hash) values ('x', extensions.st_setsrid(extensions.st_makepoint(90.4, 23.8), 4326), 'device-anon-direct-000')$$,
  '42501', null, 'anon cannot insert reports directly (must use submit-report function)');
select ok((select count(*) from public.public_sites) > 0, 'anon can read public_sites');
select ok((select count(*) from public.public_wards) = 129, 'anon can read public_wards (129 wards)');
select lives_ok($$select * from public.public_ward_scorecard$$, 'anon can read public_ward_scorecard');
select lives_ok($$select * from public.public_case_counts$$, 'anon can read public_case_counts');
select ok((public.public_sites_geojson() -> 'features') is not null, 'anon can call public_sites_geojson');
select throws_ok($$select public.moderate_report('10000000-0000-0000-0000-000000000001', 'approve')$$, '42501', null, 'anon cannot moderate');
select throws_ok($$select * from public.research_reports$$, '42501', null, 'anon cannot read research export');
reset role;

-- public_sites exposes no reporter data and snaps coordinates to ~50 m
select is(
  (select count(*)::int from information_schema.columns
    where table_schema = 'public' and table_name = 'public_sites'
      and column_name in ('reporter_id', 'device_hash', 'photo_path', 'note', 'assigned_to')),
  0, 'public_sites has no reporter/private columns');
select ok(
  (select bool_and(abs(lat / 0.0005 - round(lat / 0.0005)) < 1e-6 and abs(lng / 0.0005 - round(lng / 0.0005)) < 1e-6) from public.public_sites),
  'public_sites coordinates are snapped to a 0.0005 degree grid');
select ok(
  not exists (select 1 from public.public_sites ps join public.sites s on s.id = ps.id
              where extensions.st_equals(ps.geom, s.geom) and not extensions.st_equals(s.geom, extensions.st_snaptogrid(s.geom, 0.0005))),
  'public_sites never returns the exact point');

-- ---------------------------------------------------------------------------
-- citizen: own reports only; cannot escalate role
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
select is((select count(*)::int from public.reports), 1, 'citizen sees only own report');
select is((select count(*)::int from public.sites), 1, 'citizen sees only sites they reported');
select throws_ok($$update public.profiles set role = 'superadmin' where id = auth.uid()$$, '42501', null, 'citizen cannot change own role');
select lives_ok($$update public.profiles set display_name = 'Rahim' where id = auth.uid()$$, 'citizen can set display_name');
select is((select count(*)::int from public.research_reports), 0, 'citizen gets nothing from research export');
select throws_ok($$select public.moderate_report('10000000-0000-0000-0000-000000000001', 'approve')$$, '42501', null, 'citizen cannot moderate');
select is((select count(*)::int from public.sites where status = 'new'), 1, 'sanity: citizen still sees own site');
select results_eq(
  $$update public.sites set status = 'rejected' returning id$$,
  $$select null::uuid where false$$,
  'citizen update of sites affects no rows');
reset role;

-- ---------------------------------------------------------------------------
-- moderator: sees everything, approves/rejects, labels are logged
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';
select ok((select count(*) from public.reports) >= 6, 'moderator sees all reports');
select lives_ok($$select public.moderate_report('10000000-0000-0000-0000-000000000001', 'approve', 'tire')$$, 'moderator approves a report');
select is((select status::text from public.sites where id = (select site_id from public.reports where id = '10000000-0000-0000-0000-000000000001')),
  'verified', 'approval verifies the site');
select is((select moderator_label from public.ai_labels where report_id = '10000000-0000-0000-0000-000000000001' order by id desc limit 1),
  'tire', 'moderator decision stored in ai_labels.moderator_label');
select lives_ok($$select public.moderate_report('10000000-0000-0000-0000-000000000006', 'reject')$$, 'moderator rejects a report');
select is((select status::text from public.sites where id = (select site_id from public.reports where id = '10000000-0000-0000-0000-000000000006')),
  'rejected', 'rejecting the only report rejects the site');
select throws_ok(
  $$select public.transition_site((select site_id from public.reports where id = '10000000-0000-0000-0000-000000000005'), 'assigned')$$,
  '42501', null, 'moderator cannot assign');
reset role;

-- ---------------------------------------------------------------------------
-- inspector: own ward only; closing needs an on-site photo within 50 m
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated"}';
select ok((select bool_and(ward_id = 1) from public.sites), 'inspector sees only sites in own ward');
select is((select count(*)::int from public.sites where ward_id = 101), 0, 'inspector cannot see other ward sites');
select lives_ok(
  $$select public.transition_site((select site_id from public.reports where id = '10000000-0000-0000-0000-000000000001'), 'assigned')$$,
  'inspector assigns a site in own ward');
select is((select assigned_to from public.sites where id = (select site_id from public.reports where id = '10000000-0000-0000-0000-000000000001')),
  '00000000-0000-0000-0000-00000000000c'::uuid, 'assigned to self');
select throws_ok(
  $$select public.transition_site((select site_id from public.reports where id = '10000000-0000-0000-0000-000000000001'), 'cleared')$$,
  '23514', null, 'cleared without after photo is rejected');
select throws_ok(
  $$select public.transition_site((select site_id from public.reports where id = '10000000-0000-0000-0000-000000000001'), 'cleared', null, 'x/after.jpg', 23.806, 90.405)$$,
  '23514', null, 'cleared with photo >50 m away is rejected');
select lives_ok(
  $$select public.transition_site((select site_id from public.reports where id = '10000000-0000-0000-0000-000000000001'), 'cleared', 'dumped water', 'x/after.jpg', 23.8051, 90.4051)$$,
  'cleared with photo within 50 m succeeds');
select is((select count(*)::int from public.site_events where site_id = (select site_id from public.reports where id = '10000000-0000-0000-0000-000000000001')),
  4, 'every status change wrote a site_event (new, verified, assigned, cleared)');
select is((select note from public.site_events where site_id = (select site_id from public.reports where id = '10000000-0000-0000-0000-000000000001') and to_status = 'cleared'),
  'dumped water', 'transition note stored');
select results_eq(
  $$update public.sites set status = 'assigned' where ward_id = 101 returning id$$,
  $$select null::uuid where false$$,
  'inspector cannot update sites in another ward');
select throws_ok(
  $$select public.transition_site((select site_id from public.reports where id = '10000000-0000-0000-0000-000000000003'), 'not_found', '')$$,
  '23514', null, 'not_found requires a reason');
select lives_ok(
  $$select public.transition_site((select site_id from public.reports where id = '10000000-0000-0000-0000-000000000003'), 'not_found', 'container already removed')$$,
  'not_found with reason succeeds');
select throws_ok($$delete from public.site_events$$, '42501', null, 'inspector cannot delete audit events');
reset role;

-- site_events append-only even for the owner
select throws_ok($$update public.site_events set note = 'tampered'$$, '42501', null, 'site_events cannot be edited');
select throws_ok($$delete from public.site_events$$, '42501', null, 'site_events cannot be deleted');

-- ---------------------------------------------------------------------------
-- ward admin: own city corporation
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000e","role":"authenticated"}';
select ok((select count(*) from public.sites) > 0 and (select bool_and(ward_id between 101 and 175) from public.sites),
  'DSCC ward admin sees only DSCC sites');
select lives_ok(
  $$select public.transition_site((select site_id from public.reports where id = '10000000-0000-0000-0000-000000000005'), 'assigned', null, null, null, null, '00000000-0000-0000-0000-00000000000d')$$,
  'ward admin assigns a DSCC site to a DSCC inspector');
select lives_ok(
  $$select public.transition_site((select site_id from public.reports where id = '10000000-0000-0000-0000-000000000005'), 'verified')$$,
  'ward admin can unassign (assigned -> verified)');
select throws_ok(
  $$select public.transition_site((select site_id from public.reports where id = '10000000-0000-0000-0000-000000000005'), 'assigned', null, null, null, null, '00000000-0000-0000-0000-00000000000c')$$,
  '23514', null, 'ward admin cannot assign to an inspector of another ward');
reset role;

-- ---------------------------------------------------------------------------
-- researcher: anonymised export only
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000f","role":"authenticated"}';
select is((select count(*)::int from public.reports), 0, 'researcher cannot read raw reports');
select ok((select count(*) from public.research_reports) >= 6, 'researcher reads the anonymised export');
select is(
  (select count(*)::int from information_schema.columns
    where table_schema = 'public' and table_name = 'research_reports'
      and column_name in ('reporter_id', 'device_hash', 'photo_path', 'note', 'id')),
  0, 'research export has no identifying columns');
reset role;

-- Scorecard reflects the cleared site
select ok((select cleared_28d from public.public_ward_scorecard where ward_id = 1) = 1, 'scorecard counts the cleared site');

select * from finish();
rollback;
