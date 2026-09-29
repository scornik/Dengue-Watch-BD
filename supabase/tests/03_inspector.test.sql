begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

update public.wards set geom = extensions.st_multi(extensions.st_makeenvelope(90.40, 23.80, 90.41, 23.81, 4326)) where id = 1;
update public.wards set geom = extensions.st_multi(extensions.st_makeenvelope(90.41, 23.80, 90.42, 23.81, 4326)) where id = 2;
insert into public.ward_risk (ward_id, week, score, level) values (1, current_date, 1.2, 'red');
insert into auth.users (id, email, aud, role, instance_id) values
  ('00000000-0000-0000-0000-0000000000b1', 'i@test.bd', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000');
update public.profiles set role = 'inspector', ward_id = 1 where id = '00000000-0000-0000-0000-0000000000b1';

insert into public.reports (photo_path, geom, device_hash, created_at) values
  ('old.jpg', extensions.st_setsrid(extensions.st_makepoint(90.401, 23.801), 4326), 'dev-insp-000000001', now() - interval '3 days'),
  ('new.jpg', extensions.st_setsrid(extensions.st_makepoint(90.409, 23.809), 4326), 'dev-insp-000000002', now()),
  ('w2.jpg', extensions.st_setsrid(extensions.st_makepoint(90.415, 23.805), 4326), 'dev-insp-000000003', now());

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}';
select is((select count(*)::int from public.inspector_queue), 2, 'inspector queue shows only own ward');
select is((select photo_path from public.inspector_queue order by risk_rank, first_reported_at limit 1), 'old.jpg', 'oldest first within the same risk');
select is((select risk_level::text from public.inspector_queue limit 1), 'red', 'queue carries the ward risk level');
reset role;
set local role anon;
select throws_ok($$select * from public.inspector_queue$$, '42501', null, 'anon cannot read the inspector queue');
reset role;

select * from finish();
rollback;
