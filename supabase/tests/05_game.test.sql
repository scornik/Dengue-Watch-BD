-- Volunteer cleanup game: claims, cleanups, points, leaderboard, review.
begin;
create extension if not exists pgtap with schema extensions;
select plan(34);

update public.wards set geom = extensions.st_multi(extensions.st_makeenvelope(90.40, 23.80, 90.41, 23.81, 4326)) where id = 1;
insert into auth.users (id, email, aud, role, instance_id, is_anonymous) values
  ('00000000-0000-0000-0000-0000000000d1', null, 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', true),
  ('00000000-0000-0000-0000-0000000000d2', null, 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', true),
  ('00000000-0000-0000-0000-0000000000d3', 'mod5@test.bd', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', false);
update public.profiles set role = 'moderator' where id = '00000000-0000-0000-0000-0000000000d3';

-- d1 reports two sites; one with larvae, one old (overdue)
insert into public.reports (id, reporter_id, photo_path, geom, device_hash, larvae_seen, thumb_status, thumb_public_path) values
  ('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000d1', 'g1.jpg',
   extensions.st_setsrid(extensions.st_makepoint(90.401, 23.801), 4326), 'dev-game-00000001', 'yes', 'ok', 'g1.jpg'),
  ('30000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000d1', 'g2.jpg',
   extensions.st_setsrid(extensions.st_makepoint(90.405, 23.805), 4326), 'dev-game-00000002', 'no', 'pending', null);
insert into public.reports (id, photo_path, geom, device_hash, created_at) values
  ('30000000-0000-0000-0000-000000000003', 'g3.jpg',
   extensions.st_setsrid(extensions.st_makepoint(90.408, 23.808), 4326), 'dev-game-00000003', now() - interval '5 days');

select is((select sum(points)::int from public.points_ledger where user_id = '00000000-0000-0000-0000-0000000000d1'), 10,
  'reporter gets 5 points per report');
select is((select thumb_public_path from public.public_sites where id = (select site_id from public.reports where id = '30000000-0000-0000-0000-000000000001')),
  'g1.jpg', 'blurred report photo is public immediately');
select is((select thumb_public_path from public.public_sites where id = (select site_id from public.reports where id = '30000000-0000-0000-0000-000000000002')),
  null, 'unblurred photo is never public');

create table public._game_sites as
  select id as report_id, site_id from public.reports where id::text like '30000000-%';
grant select on public._game_sites to anon, authenticated;

-- Photos the volunteers "uploaded"
insert into storage.objects (bucket_id, name, owner) values
  ('cleanup-photos', '00000000-0000-0000-0000-0000000000d2/a.jpg', '00000000-0000-0000-0000-0000000000d2'),
  ('cleanup-photos', '00000000-0000-0000-0000-0000000000d2/b.jpg', '00000000-0000-0000-0000-0000000000d2'),
  ('cleanup-photos', '00000000-0000-0000-0000-0000000000d1/c.jpg', '00000000-0000-0000-0000-0000000000d1');

-- ---- volunteer d2 ----
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d2","role":"authenticated"}';
select throws_like(
  $$select public.claim_site((select site_id from public._game_sites where report_id = '30000000-0000-0000-0000-000000000001'))$$,
  '%handle_required%', 'claiming needs a hunter name');
select lives_ok($$update public.profiles set handle = 'MoshaShikari' where id = auth.uid()$$, 'volunteer sets a hunter name');
select throws_ok($$update public.profiles set avatar_path = 'someone-else/x.jpg' where id = auth.uid()$$,
  '42501', null, 'avatar must live in own folder');
select lives_ok($$update public.profiles set avatar_path = auth.uid()::text || '/me.jpg' where id = auth.uid()$$, 'own avatar path ok');
select throws_ok($$update public.profiles set role = 'superadmin' where id = auth.uid()$$, '42501', null, 'still cannot change role');

select lives_ok(
  $$select public.claim_site((select site_id from public._game_sites where report_id = '30000000-0000-0000-0000-000000000001'))$$,
  'volunteer claims a site');
select is((select claimed from public.public_sites where id = (select site_id from public._game_sites where report_id = '30000000-0000-0000-0000-000000000001')),
  true, 'public list shows the site as claimed');
select throws_like(
  $$select public.complete_cleanup((select id from public.cleanups where volunteer_id = auth.uid() limit 1),
      '00000000-0000-0000-0000-0000000000d2/a.jpg', 23.803, 90.401)$$,
  '%too_far%', 'photo taken 220 m away is refused');
select throws_like(
  $$select public.complete_cleanup((select id from public.cleanups where volunteer_id = auth.uid() limit 1),
      '00000000-0000-0000-0000-0000000000d2/nope.jpg', 23.8011, 90.401)$$,
  '%photo_missing%', 'photo must exist in storage');
select throws_like(
  $$select public.complete_cleanup((select id from public.cleanups where volunteer_id = auth.uid() limit 1),
      '00000000-0000-0000-0000-0000000000d1/c.jpg', 23.8011, 90.401)$$,
  '%photo_missing%', 'cannot use someone else''s photo');
select is(
  (select points from public.complete_cleanup((select id from public.cleanups where volunteer_id = auth.uid() limit 1),
      '00000000-0000-0000-0000-0000000000d2/a.jpg', 23.8011, 90.401, 'emptied the tire')),
  30, 'cleaning a larvae site earns 20 + 10 bonus');
select is((select status::text from public.public_sites where id = (select site_id from public._game_sites where report_id = '30000000-0000-0000-0000-000000000001')),
  'cleared', 'site is cleared by the volunteer');
reset role;
select is((select to_status::text from public.site_events where site_id = (select site_id from public._game_sites where report_id = '30000000-0000-0000-0000-000000000001') order by id desc limit 1),
  'cleared', 'audit trail records the cleanup');
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d2","role":"authenticated"}';

select lives_ok($$select public.claim_site((select site_id from public._game_sites where report_id = '30000000-0000-0000-0000-000000000003'))$$, 'claim overdue site');
select is(
  (select points from public.complete_cleanup((select id from public.cleanups where volunteer_id = auth.uid() and status = 'claimed' limit 1),
      '00000000-0000-0000-0000-0000000000d2/b.jpg', 23.8081, 90.408)),
  30, 'overdue site earns 20 + 10 bonus');
select results_eq(
  $$select points, cleans, reports from public.my_stats()$$,
  $$values (60, 2, 0)$$, 'my_stats totals');
select throws_ok($$insert into public.points_ledger (user_id, kind, points) values (auth.uid(), 'clean', 1000)$$,
  '42501', null, 'nobody can write points directly');
reset role;

-- ---- volunteer d1 (the reporter) tries to steal the claim / cleans own site ----
update public.profiles set handle = 'Rahim' where id = '00000000-0000-0000-0000-0000000000d1';
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d2","role":"authenticated"}';
select lives_ok($$select public.claim_site((select site_id from public._game_sites where report_id = '30000000-0000-0000-0000-000000000002'))$$, 'd2 claims site 2');
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}';
select throws_like($$select public.claim_site((select site_id from public._game_sites where report_id = '30000000-0000-0000-0000-000000000002'))$$,
  '%already_claimed%', 'someone else''s active claim blocks a second claim');
reset role;
update public.cleanups set status = 'expired' where site_id = (select site_id from public._game_sites where report_id = '30000000-0000-0000-0000-000000000002');
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}';
select lives_ok($$select public.claim_site((select site_id from public._game_sites where report_id = '30000000-0000-0000-0000-000000000002'))$$, 'reporter claims own site');
select is(
  (select points from public.complete_cleanup((select id from public.cleanups where volunteer_id = auth.uid() and status = 'claimed' limit 1),
      '00000000-0000-0000-0000-0000000000d1/c.jpg', 23.8051, 90.405)),
  10, 'cleaning your own report earns 10');
reset role;

-- ---- public leaderboard ----
set local role anon;
select results_eq(
  $$select handle, points, rank from public.public_leaderboard order by rank, handle$$,
  $$values ('MoshaShikari'::text, 60, 1), ('Rahim'::text, 20, 2)$$,
  'leaderboard ranks hunters by points');
select is(
  (select count(*)::int from information_schema.columns where table_name = 'public_leaderboard' and column_name in ('user_id', 'id', 'email')),
  0, 'leaderboard exposes no user ids');
select is((select cleaned_by from public.public_sites where id = (select site_id from public._game_sites where report_id = '30000000-0000-0000-0000-000000000001')),
  'MoshaShikari', 'public site shows who cleaned it');
select ok((public.public_wards_geojson() -> 'features' -> 0 -> 'properties' ->> 'reports_28d') is not null,
  'ward GeoJSON carries report counts');
reset role;

-- ---- moderator reverses a fake cleanup ----
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d2","role":"authenticated"}';
select throws_ok($$select public.reject_cleanup((select id from public.cleanups where status = 'done' limit 1))$$,
  '42501', null, 'volunteers cannot reject cleanups');
select is((select count(*)::int from public.cleanup_review_queue), 0, 'volunteers cannot see the review queue');
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d3","role":"authenticated"}';
select ok((select bool_and(handle is not null) and count(*) > 0 from public.cleanup_review_queue),
  'moderators see cleanups with hunter names');
select lives_ok($$select public.reject_cleanup(
    (select c.id from public.cleanups c
     where c.volunteer_id = '00000000-0000-0000-0000-0000000000d2' and c.status = 'done' order by c.done_at, c.claimed_at limit 1), 'photo shows a different place')$$,
  'moderator rejects a cleanup');
reset role;
select is((select points from public.public_leaderboard where handle = 'MoshaShikari'), 30, 'points are revoked');
select is((select status::text from public.sites where id = (select site_id from public._game_sites where report_id = '30000000-0000-0000-0000-000000000001')),
  'verified', 'site reopens for someone else');

select * from finish();
rollback;
