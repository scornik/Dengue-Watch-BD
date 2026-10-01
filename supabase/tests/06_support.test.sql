-- Support inbox: anyone with a session can send; only moderators and superadmins read and update.
begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

insert into auth.users (id, email, aud, role, instance_id, is_anonymous) values
  ('00000000-0000-0000-0000-0000000000e1', null, 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', true),
  ('00000000-0000-0000-0000-0000000000e2', 'mod6@test.bd', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', false),
  ('00000000-0000-0000-0000-0000000000e3', 'wa6@test.bd', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', false),
  ('00000000-0000-0000-0000-0000000000e4', 'sa6@test.bd', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', false);
update public.profiles set role = 'moderator' where id = '00000000-0000-0000-0000-0000000000e2';
update public.profiles set role = 'ward_admin', city_corp = 'DNCC' where id = '00000000-0000-0000-0000-0000000000e3';
update public.profiles set role = 'superadmin' where id = '00000000-0000-0000-0000-0000000000e4';

-- ---- anon (no session) ----
set local role anon;
select throws_ok($$select public.submit_support_message('question', 'hello there')$$, '42501', null,
  'anon without a session cannot send');
select throws_ok($$select count(*) from public.support_messages$$, '42501', null, 'anon cannot read the inbox');

-- ---- citizen e1 (anonymous session) ----
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000e1","role":"authenticated"}';
select lives_ok($$select public.submit_support_message('question', '  How do I report a drain?  ', ' Rina ', 'rina@example.com', '/bn/contact', 'bn')$$,
  'citizen sends a message');
select is((select count(*)::int from public.support_messages), 0, 'citizen cannot read messages, not even their own');
select throws_ok($$insert into public.support_messages (topic, message) values ('other', 'direct insert')$$, '42501', null,
  'no direct inserts');
select throws_ok($$select public.submit_support_message('question', 'hi')$$, '23514', null, 'message must be at least 5 characters');
select throws_ok($$select public.submit_support_message('spam', 'hello there')$$, '23514', null, 'topic must be a known one');
select throws_ok($$select public.submit_support_message('other', repeat('x', 2001))$$, '23514', null, 'message is capped at 2000 characters');
select lives_ok($$select public.submit_support_message('idea', 'second message')$$, '2');
select lives_ok($$select public.submit_support_message('idea', 'third message')$$, '3');
select lives_ok($$select public.submit_support_message('idea', 'fourth message')$$, '4');
select lives_ok($$select public.submit_support_message('idea', 'fifth message')$$, '5');
select throws_like($$select public.submit_support_message('idea', 'sixth message')$$, '%too_many_messages%',
  'at most 5 messages an hour per sender');

-- ---- ward admin e3: city corporation staff, not the support team ----
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000e3","role":"authenticated"}';
select is((select count(*)::int from public.support_messages), 0, 'ward admins do not see the support inbox');

-- ---- moderator e2 ----
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000e2","role":"authenticated"}';
select is((select count(*)::int from public.support_messages), 5, 'moderator sees every message');
select is((select name || '|' || contact || '|' || message from public.support_messages where topic = 'question'),
  'Rina|rina@example.com|How do I report a drain?', 'fields are trimmed and stored');
update public.support_messages set status = 'resolved', staff_note = 'Replied by email' where topic = 'question';
select is((select handled_by::text from public.support_messages where topic = 'question'),
  '00000000-0000-0000-0000-0000000000e2', 'the server records who handled it');
select throws_ok($$update public.support_messages set message = 'edited' where topic = 'question'$$, '42501', null,
  'staff cannot rewrite what a citizen wrote');

select * from finish();
rollback;
