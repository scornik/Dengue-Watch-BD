-- Support inbox: anyone can send the team a message from /contact; only the support team
-- (moderators and superadmins) can read it. Ward admins and inspectors work for city
-- corporations and do not see messages written to the project.
--
-- Writes go through submit_support_message() only (validation + per-sender rate limit),
-- never a direct insert. The sender needs a (possibly anonymous) session, like reports.

create type public.support_status as enum ('new', 'read', 'resolved');

create table public.support_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid references auth.users (id) on delete set null,
  topic text not null check (topic in ('question', 'problem', 'idea', 'city_corporation', 'volunteer', 'other')),
  name text check (char_length(name) <= 80),
  contact text check (char_length(contact) <= 120),
  message text not null check (char_length(message) between 5 and 2000),
  page text check (char_length(page) <= 200),
  locale text not null default 'bn' check (locale in ('bn', 'en')),
  status public.support_status not null default 'new',
  staff_note text check (char_length(staff_note) <= 1000),
  handled_by uuid references auth.users (id) on delete set null,
  handled_at timestamptz,
  created_at timestamptz not null default now()
);

create index support_messages_inbox_idx on public.support_messages (status, created_at desc);
create index support_messages_sender_idx on public.support_messages (sender_id, created_at);

alter table public.support_messages enable row level security;

create policy support_messages_team_read on public.support_messages for select to authenticated
  using (public.has_role('moderator', 'superadmin'));
create policy support_messages_team_update on public.support_messages for update to authenticated
  using (public.has_role('moderator', 'superadmin'))
  with check (public.has_role('moderator', 'superadmin'));

revoke all on public.support_messages from anon, authenticated;
grant select on public.support_messages to authenticated;
grant update (status, staff_note) on public.support_messages to authenticated;

-- Who handled it and when, set by the server, not the client.
create or replace function public.support_message_handled()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.status is distinct from old.status or new.staff_note is distinct from old.staff_note then
    new.handled_by := auth.uid();
    new.handled_at := now();
  end if;
  return new;
end;
$$;

create trigger support_messages_handled
  before update on public.support_messages
  for each row execute function public.support_message_handled();

create or replace function public.submit_support_message(
  p_topic text,
  p_message text,
  p_name text default null,
  p_contact text default null,
  p_page text default null,
  p_locale text default 'bn'
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'sign in required' using errcode = '42501';
  end if;
  -- 5 messages an hour and 20 a day per sender: enough for a real conversation, too few to spam.
  if (select count(*) from public.support_messages where sender_id = v_uid and created_at > now() - interval '1 hour') >= 5
     or (select count(*) from public.support_messages where sender_id = v_uid and created_at > now() - interval '1 day') >= 20 then
    raise exception 'too_many_messages' using errcode = 'P0001';
  end if;

  insert into public.support_messages (sender_id, topic, name, contact, message, page, locale)
  values (
    v_uid,
    p_topic,
    nullif(btrim(p_name), ''),
    nullif(btrim(p_contact), ''),
    btrim(p_message),
    nullif(left(btrim(p_page), 200), ''),
    case when p_locale = 'en' then 'en' else 'bn' end
  )
  returning id into v_id;
  return v_id;
end;
$$;

revoke execute on function public.submit_support_message(text, text, text, text, text, text) from public, anon;
grant execute on function public.submit_support_message(text, text, text, text, text, text) to authenticated;
