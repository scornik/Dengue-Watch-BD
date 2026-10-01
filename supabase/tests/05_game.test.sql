-- Volunteer cleanup game: claims, cleanups, points, leaderboard, review,
-- plus the 2026-10-01 security hardening.
begin;
create extension if not exists pgtap with schema extensions;
select plan(50);

update public.wards set geom = extensions.st_multi(extensions.st_makeenvelope(90.40, 23.80, 90.41, 23.81, 4326)) where id = 1;
insert into auth.users (id, email, aud, role, instance_id, is_anonymous) values
  ('00000000-0000-0000-0000-0000000000d1', null, 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', true),
  ('00000000-0000-0000-0000-0000000000d2', null, 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', true),
  ('00000000-0000-0000-0000-0000000000d3', 'mod5@test.bd', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', false),
  ('00000000-0000-0000-0000-0000000000d4', 'wa5@test.bd', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', false);
update public.profiles set role = 'moderator' where id = '00000000-0000-0000-0000-0000000000d3';
update public.profiles set role = 'ward_admin', city_corp = 'DSCC' where id = '00000000-0000-0000-0000-0000000000d4';

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
select is(public.live_points('00000000-0000-0000-0000-0000000000d1'), 0,
  'report points wait until a moderator verifies the site');
select is((select thumb_public_path from public.public_sites where id = (select site_id from public.reports where id = '30000000-0000-0000-0000-000000000001')),
  'g1.jpg', 'blurred report photo is public immediately');
select is((select thumb_public_path from public.public_sites where id = (select site_id from public.reports where id = '30000000-0000-0000-0000-000000000002')),
  null, 'unblurred photo is never public');

create table public._game_sites as
  select id as report_id, site_id from public.reports where id::text like '30000000-%';
grant select on public._game_sites to anon, authenticated;
-- "Upload" the after photo for every open claim (as the storage API would).
create function public._upload_claim_photos() returns void language sql as $$
  insert into storage.objects (bucket_id, name, owner)
  select 'cleanup-photos', c.volunteer_id::text || '/' || c.id::text || '.jpg', c.volunteer_id
  from public.cleanups c where c.status = 'claimed'
  on conflict do nothing;
$$;
insert into storage.objects (bucket_id, name, owner) values
  ('cleanup-photos', '00000000-0000-0000-0000-0000000000d2/old.jpg', '00000000-0000-0000-0000-0000000000d2');

-- ---- volunteer d2 ----
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d2","role":"authenticated"}';
select throws_like(
  $$select public.claim_site((select site_id from public._game_sites where report_id = '30000000-0000-0000-0000-000000000001'))$$,
  '%handle_required%', 'claiming needs a hunter name');
select lives_ok($$update public.profiles set handle = 'MoshaShikari' where id = auth.uid()$$, 'volunteer sets a hunter name');
select throws_ok($$update public.profiles set avatar_path = 'someone-else/x.jpg' where id = auth.uid()$$,
  '42501', null, 'avatar must live in own folder');
select throws_ok($$update public.profiles set avatar_path = auth.uid()::text || '/../../public-thumbs/g1.jpg' where id = auth.uid()$$,
  '42501', null, 'avatar path cannot climb out of the folder');
select lives_ok($$update public.profiles set avatar_path = auth.uid()::text || '/1727740800000.jpg' where id = auth.uid()$$, 'own avatar path ok');
select throws_ok($$update public.profiles set role = 'superadmin' where id = auth.uid()$$, '42501', null, 'still cannot change role');

select lives_ok(
  $$select public.claim_site((select site_id from public._game_sites where report_id = '30000000-0000-0000-0000-000000000001'))$$,
  'volunteer claims a site');
select throws_like(
  $$select public.claim_site((select site_id from public._game_sites where report_id = '30000000-0000-0000-0000-000000000003'))$$,
  '%too_many_claims%', 'a new hunter holds one spot at a time');
select is((select claimed from public.public_sites where id = (select site_id from public._game_sites where report_id = '30000000-0000-0000-0000-000000000001')),
  true, 'public list shows the site as claimed');
reset role;
select public._upload_claim_photos();
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d2","role":"authenticated"}';
select throws_like(
  $$select public.complete_cleanup(c.id, auth.uid()::text || '/' || c.id::text || '.jpg', 23.803, 90.401)
    from public.cleanups c where c.volunteer_id = auth.uid() and c.status = 'claimed'$$,
  '%too_far%', 'photo taken 220 m away is refused');
select throws_like(
  $$select public.complete_cleanup(c.id, auth.uid()::text || '/old.jpg', 23.8011, 90.401)
    from public.cleanups c where c.volunteer_id = auth.uid() and c.status = 'claimed'$$,
  '%photo_missing%', 'an older photo cannot be reused');
select throws_like(
  $$select public.complete_cleanup(c.id, '00000000-0000-0000-0000-0000000000d1/' || c.id::text || '.jpg', 23.8011, 90.401)
    from public.cleanups c where c.volunteer_id = auth.uid() and c.status = 'claimed'$$,
  '%photo_missing%', 'cannot use someone else''s photo');
select is(
  (select (public.complete_cleanup(c.id, auth.uid()::text || '/' || c.id::text || '.jpg', 23.8011, 90.401, 'emptied the tire')).points
   from public.cleanups c where c.volunteer_id = auth.uid() and c.status = 'claimed'),
  30, 'cleaning a larvae site earns 20 + 10 bonus');
select is((select status::text from public.public_sites where id = (select site_id from public._game_sites where report_id = '30000000-0000-0000-0000-000000000001')),
  'cleared', 'site is cleared by the volunteer');
reset role;
select is((select to_status::text from public.site_events where site_id = (select site_id from public._game_sites where report_id = '30000000-0000-0000-0000-000000000001') order by id desc limit 1),
  'cleared', 'audit trail records the cleanup');
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d2","role":"authenticated"}';

select lives_ok($$select public.claim_site((select site_id from public._game_sites where report_id = '30000000-0000-0000-0000-000000000003'))$$, 'claim overdue site');
reset role;
select public._upload_claim_photos();
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d2","role":"authenticated"}';
select is(
  (select (public.complete_cleanup(c.id, auth.uid()::text || '/' || c.id::text || '.jpg', 23.8081, 90.408)).points
   from public.cleanups c where c.volunteer_id = auth.uid() and c.status = 'claimed'),
  30, 'overdue site earns 20 + 10 bonus');
select results_eq(
  $$select points, points_pending, cleans, reports, tier_claims, tier_cleans, streak_weeks from public.my_stats()$$,
  $$values (60, 60, 2, 0, 1, 3, 1)$$, 'my_stats: points are confirming, rookie limits, one-week streak');
select throws_ok($$insert into public.points_ledger (user_id, kind, points) values (auth.uid(), 'clean', 1000)$$,
  '42501', null, 'nobody can write points directly');
reset role;

set local role anon;
select is((select points from public.public_leaderboard where handle = 'MoshaShikari'), 0,
  'clean points are not public while they are confirming');
reset role;
update public.points_ledger set created_at = created_at - interval '3 days' where kind = 'clean';
set local role anon;
select is((select points from public.public_leaderboard where handle = 'MoshaShikari'), 60,
  'clean points count publicly after 48 h');
reset role;

-- ---- volunteer d1 (the reporter) tries to steal the claim / cleans own site ----
update public.profiles set handle = 'Rahim' where id = '00000000-0000-0000-0000-0000000000d1';
update public.points_ledger set created_at = created_at - interval '3 days';  -- d2 earned 60: next tier
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d2","role":"authenticated"}';
select lives_ok($$select public.claim_site((select site_id from public._game_sites where report_id = '30000000-0000-0000-0000-000000000002'))$$, 'd2 claims site 2');
select is((select tier_claims from public.my_stats()), 2, 'confirmed XP unlocks more claims');
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
reset role;
select public._upload_claim_photos();
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}';
select is(
  (select (public.complete_cleanup(c.id, auth.uid()::text || '/' || c.id::text || '.jpg', 23.8051, 90.405)).points
   from public.cleanups c where c.volunteer_id = auth.uid() and c.status = 'claimed'),
  10, 'cleaning your own report earns 10');
reset role;

-- ---- public leaderboard and ward board ----
update public.points_ledger set created_at = created_at - interval '3 days' where kind = 'clean' and created_at > now() - interval '1 day';
set local role anon;
select results_eq(
  $$select handle, points, rank from public.public_leaderboard order by rank, handle$$,
  $$values ('MoshaShikari'::text, 60, 1), ('Rahim'::text, 10, 2)$$,
  'leaderboard ranks hunters by confirmed points (reports not yet verified)');
select is(
  (select count(*)::int from information_schema.columns where table_name = 'public_leaderboard' and column_name in ('user_id', 'id', 'email')),
  0, 'leaderboard exposes no user ids');
select is((select cleaned_by from public.public_sites where id = (select site_id from public._game_sites where report_id = '30000000-0000-0000-0000-000000000001')),
  'MoshaShikari', 'public site shows who cleaned it');
select ok((public.public_wards_geojson() -> 'features' -> 0 -> 'properties' ->> 'reports_28d') is not null,
  'ward GeoJSON carries report counts');
select is((select cleans_week from public.public_ward_board where ward_id = 1), 3, 'ward board counts this week''s cleanups');
reset role;

-- ---- review: volunteers see nothing; ward admins only their city corporation ----
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d2","role":"authenticated"}';
select throws_ok($$select public.reject_cleanup((select id from public.cleanups where status = 'done' limit 1))$$,
  '42501', null, 'volunteers cannot reject cleanups');
select is((select count(*)::int from public.cleanup_review_queue), 0, 'volunteers cannot see the review queue');
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d4","role":"authenticated"}';
select throws_ok($$select public.reject_cleanup((select id from public.cleanups where status = 'done' limit 1))$$,
  '42501', null, 'a DSCC ward admin cannot reject a DNCC cleanup');
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d3","role":"authenticated"}';
select is((select count(*)::int from public.cleanup_review_queue where handle is not null), 3,
  'moderators see every unreviewed cleanup with hunter names');
select lives_ok($$select public.approve_cleanup(
    (select c.id from public.cleanups c where c.volunteer_id = '00000000-0000-0000-0000-0000000000d1' and c.status = 'done'))$$,
  'moderator approves the reporter''s cleanup');
select lives_ok($$select public.reject_cleanup(
    (select c.id from public.cleanups c
     where c.volunteer_id = '00000000-0000-0000-0000-0000000000d2' and c.status = 'done' order by c.done_at, c.claimed_at limit 1), 'photo shows a different place')$$,
  'moderator rejects a cleanup');
select is((select count(*)::int from public.cleanup_review_queue), 1, 'reviewed cleanups leave the queue');
reset role;
select is((select points from public.public_leaderboard where handle = 'MoshaShikari'), 30, 'points are revoked');
select is((select status::text from public.sites where id = (select site_id from public._game_sites where report_id = '30000000-0000-0000-0000-000000000001')),
  'verified', 'site reopens for someone else');
select is((select count(*)::int from public.points_ledger
           where report_id = '30000000-0000-0000-0000-000000000002' and confirmed_at is not null), 1,
  'approving a cleanup confirms the spot''s report points');
select is((select points from public.public_leaderboard where handle = 'Rahim'), 10,
  'confirmed report points reach the public board only the next day');

-- ---- staff invites need a confirmed email ----
insert into public.staff_invites (email, role) values ('boss5@test.bd', 'superadmin');
insert into auth.users (id, email, aud, role, instance_id, email_confirmed_at) values
  ('00000000-0000-0000-0000-0000000000d6', 'boss5@test.bd', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', null);
select is((select role::text from public.profiles where id = '00000000-0000-0000-0000-0000000000d6'), 'citizen',
  'signing up with an invited but unconfirmed email gives no staff role');
update auth.users set email_confirmed_at = now() where id = '00000000-0000-0000-0000-0000000000d6';
select is((select role::text from public.profiles where id = '00000000-0000-0000-0000-0000000000d6'), 'superadmin',
  'the invite applies once the email is confirmed');

-- ---- per-reporter limit and push endpoints ----
insert into public.reports (reporter_id, photo_path, geom, device_hash)
select '00000000-0000-0000-0000-0000000000d1', 'q' || g || '.jpg',
       extensions.st_setsrid(extensions.st_makepoint(90.402 + g * 0.0003, 23.802), 4326), 'dev-quota-' || lpad(g::text, 8, '0')
from generate_series(1, 8) g;
select throws_like($$insert into public.reports (reporter_id, photo_path, geom, device_hash)
    values ('00000000-0000-0000-0000-0000000000d1', 'q99.jpg',
            extensions.st_setsrid(extensions.st_makepoint(90.409, 23.809), 4326), 'dev-quota-fresh-device')$$,
  '%rate_limited%', 'a new device id does not reset the reporter''s hourly limit');
select throws_ok($$insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
    values ('00000000-0000-0000-0000-0000000000d1', 'http://169.254.169.254/latest', 'k', 'a')$$,
  '23514', null, 'push endpoints must be a browser push service');

select * from finish();
rollback;
