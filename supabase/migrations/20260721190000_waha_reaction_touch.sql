-- Atomic conversation "touch" for a customer reaction (waha-webhook).
-- Replaces the webhook's read-modify-write (SELECT unread_count, then UPDATE
-- with value+1 computed in JS), which silently overwrote a concurrent
-- markRead, and adds the advance-only guard on last_message_at (greatest) so
-- a redelivered event can never walk the Inbox ordering backwards. The row is
-- still written even when last_message_at is unchanged, so Realtime still
-- emits the conversations touch that drives the open thread's syncLatest.
--
-- Closed conversations are not touched at all (owner decision 2026-07-24): a
-- reaction on a resolved conversation is almost always a thank-you, not a new
-- demand — a real message reopens, a reaction must not. This also keeps the
-- resolved-conversation KPIs (avg last_message_at - first_in) honest and
-- prevents a phantom unread_count on conversations the Inbox hides.
create or replace function public.waha_reaction_touch(
  p_conversation_id uuid,
  p_ts timestamptz
) returns void
language sql
security definer
set search_path = ''
as $$
  update public.conversations
     set unread_count = unread_count + 1,
         last_message_at = greatest(coalesce(last_message_at, p_ts), p_ts)
   where id = p_conversation_id
     and status not in ('resolvida', 'arquivada');
$$;

revoke all on function public.waha_reaction_touch(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.waha_reaction_touch(uuid, timestamptz) to service_role;

-- PostgREST caches the schema; the new RPC stays invisible to the API
-- until a reload.
notify pgrst, 'reload schema';
