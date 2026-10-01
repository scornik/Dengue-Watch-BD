-- Email the support team when a contact-form message arrives (Edge Function notify-support).
--
-- An insert queues an immediate call to the function (pg_net is asynchronous, so sending a
-- message never waits on email), and a 10-minute sweep catches anything the immediate call
-- missed. Both paths claim messages through claim_support_notifications(), so a message is
-- emailed once even if they overlap. Without the Vault secrets (local dev, CI) the call is a
-- no-op, exactly like the other scheduled jobs.

alter table public.support_messages
  add column notify_claimed_at timestamptz,
  add column notified_at timestamptz;

-- Hands out messages that still need an email; a claim older than 10 minutes (a crashed or
-- failed send) can be taken again. Only the service role (the Edge Function) may call it.
create or replace function public.claim_support_notifications(p_limit integer default 20)
returns setof public.support_messages
language sql security definer set search_path = ''
as $$
  update public.support_messages m
  set notify_claimed_at = now()
  where m.id in (
    select s.id from public.support_messages s
    where s.notified_at is null
      and s.created_at > now() - interval '7 days'
      and (s.notify_claimed_at is null or s.notify_claimed_at < now() - interval '10 minutes')
    order by s.created_at
    limit greatest(1, least(p_limit, 50))
    for update skip locked
  )
  returning m.*;
$$;
revoke execute on function public.claim_support_notifications(integer) from public, anon, authenticated;
grant execute on function public.claim_support_notifications(integer) to service_role;

create or replace function public.support_message_notify()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform public.invoke_edge_function('notify-support');
  return null;
end;
$$;

create trigger support_messages_notify
  after insert on public.support_messages
  for each statement execute function public.support_message_notify();

select cron.schedule('notify-support', '*/10 * * * *', $$select public.invoke_edge_function('notify-support')$$);
