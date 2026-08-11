-- Fire push-dispatch on every INBOUND message (PRD-145, atendimento PWA slice).
--
-- ORDER OF OPERATIONS: apply this AFTER `push-dispatch` is deployed and AFTER
-- VAPID_PRIVATE_KEY / VAPID_PUBLIC_KEY / PUSH_DISPATCH_WORKER_SECRET exist in
-- the Vault. Applied earlier, every inbound message would fire an HTTP call
-- that answers 401 or 503.
--
-- Why a trigger and not a call inside waha-webhook / whatsapp-webhook: those
-- functions are in production and carry message ingestion. A trigger keeps the
-- notification path strictly downstream of the write, so a push outage cannot
-- delay or drop a customer's message. `net.http_post` is fire-and-forget (it
-- queues the request and returns immediately), which is what keeps the INSERT
-- cheap.

create extension if not exists pg_net;

create or replace function public.notify_push_on_inbound_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_secret text;
begin
  -- Outbound echoes and system rows never wake a phone.
  if new.direction is distinct from 'in' then
    return new;
  end if;

  -- No secret provisioned yet → stay silent instead of hammering the function
  -- with unauthorized calls. This is what makes the migration safe to apply
  -- before the Vault entries exist, should the order above slip.
  v_secret := public.integration_secret_get('PUSH_DISPATCH_WORKER_SECRET');
  if v_secret is null or v_secret = '' then
    return new;
  end if;

  perform net.http_post(
    url := 'https://njizaasajkdqptlxddqn.supabase.co/functions/v1/push-dispatch',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-worker-secret', v_secret
    ),
    body := jsonb_build_object(
      'messageId', new.id,
      'conversationId', new.conversation_id
    ),
    timeout_milliseconds := 10000
  );

  return new;
end;
$$;

drop trigger if exists messages_push_dispatch on public.messages;
create trigger messages_push_dispatch
  after insert on public.messages
  for each row
  execute function public.notify_push_on_inbound_message();

comment on function public.notify_push_on_inbound_message is
  'Fire-and-forget Web Push dispatch for inbound messages. No-ops while PUSH_DISPATCH_WORKER_SECRET is absent from the Vault.';
