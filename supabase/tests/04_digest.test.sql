begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

update public.wards set geom = extensions.st_multi(extensions.st_makeenvelope(90.40, 23.70, 90.41, 23.71, 4326)) where id = 101;
insert into auth.users (id, email, aud, role, instance_id) values
  ('00000000-0000-0000-0000-0000000000c1', 'dscc-admin@test.bd', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('00000000-0000-0000-0000-0000000000c2', 'dncc-admin@test.bd', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000');
update public.profiles set role = 'ward_admin', city_corp = 'DSCC' where id = '00000000-0000-0000-0000-0000000000c1';
update public.profiles set role = 'ward_admin', city_corp = 'DNCC' where id = '00000000-0000-0000-0000-0000000000c2';
insert into public.reports (photo_path, geom, device_hash, created_at, thumb_status, thumb_public_path) values
  ('d1.jpg', extensions.st_setsrid(extensions.st_makepoint(90.401, 23.701), 4326), 'dev-digest-0000001', now() - interval '4 days', 'ok', 'x.jpg'),
  ('d2.jpg', extensions.st_setsrid(extensions.st_makepoint(90.409, 23.709), 4326), 'dev-digest-0000002', now() - interval '1 day', 'ok', 'y.jpg');

select is((select count(*)::int from public.digest_recipients()), 2, 'service role lists ward admin recipients');
select is(
  (select new_sites from public.ward_digest('DSCC', now() - interval '7 days') where ward_id = 101), 2,
  'digest counts new sites in the week');
select is(
  (select overdue from public.ward_digest('DSCC', now() - interval '7 days') where ward_id = 101), 1,
  'digest counts sites open more than 72 h');
select is((select count(*)::int from public.public_sites where thumb_public_path is not null and ward_id = 101), 0,
  'no public thumbnail before a moderator verifies the site');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000c2","role":"authenticated"}';
select is((select count(*)::int from public.ward_digest('DSCC', now() - interval '7 days')), 0,
  'DNCC admin gets nothing for DSCC');
select throws_ok($$select * from public.digest_recipients()$$, '42501', null, 'recipients list is service-role only');
reset role;

-- Ward boundary upload: admins only, own city corporation only
insert into auth.users (id, email, aud, role, instance_id) values
  ('00000000-0000-0000-0000-0000000000c3', 'citizen3@test.bd', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000');
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000c3","role":"authenticated"}';
select throws_ok(
  $$select public.upsert_wards_geojson('{"type":"FeatureCollection","features":[{"type":"Feature","properties":{"city_corp":"DNCC","ward_no":1},"geometry":{"type":"Polygon","coordinates":[[[90,23],[90.1,23],[90.1,23.1],[90,23]]]}}]}'::jsonb)$$,
  '42501', null, 'citizen cannot upload ward boundaries');
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000c2","role":"authenticated"}';
select throws_ok(
  $$select public.upsert_wards_geojson('{"type":"FeatureCollection","features":[{"type":"Feature","properties":{"city_corp":"DSCC","ward_no":1},"geometry":{"type":"Polygon","coordinates":[[[90,23],[90.1,23],[90.1,23.1],[90,23]]]}}]}'::jsonb)$$,
  '42501', null, 'DNCC admin cannot upload DSCC boundaries');
select is(
  public.upsert_wards_geojson('{"type":"FeatureCollection","features":[{"type":"Feature","properties":{"city_corp":"DNCC","ward_no":1},"geometry":{"type":"Polygon","coordinates":[[[90,23],[90.1,23],[90.1,23.1],[90,23]]]}}]}'::jsonb),
  1, 'DNCC admin uploads a DNCC boundary');
reset role;

select * from finish();
rollback;
