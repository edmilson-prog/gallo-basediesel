-- Guarded, atomic delete of a WhatsApp account/instance (escopo A).
--
-- Replaces the previous multi-step edge mutation (count -> disable-failover ->
-- delete) which was non-atomic and could (a) fail OPEN if a count query erred,
-- (b) orphan dependents' failover if a later step failed, or (c) half-delete
-- (row survives, Evolution instance already destroyed) on a TOCTOU race. Doing
-- it in ONE function = ONE transaction makes it atomic and fail-CLOSED: any
-- failure rolls back everything, and the FKs are the ultimate guard. The Edge
-- Function performs the (irreversible) Evolution teardown only AFTER this
-- returns, so a race/FK failure leaves the live instance intact and recoverable.
--
-- Returns true when a row was deleted, false when the id no longer exists
-- (concurrent delete) -- lets the caller audit exactly once.

create or replace function public.delete_whatsapp_account(p_account_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conversations int;
  v_templates int;
  v_deleted int;
begin
  -- escopo-A guard: refuse if any conversation or template references it. The
  -- FKs are NO ACTION so the delete would fail anyway; raising here gives the
  -- edge a clean, named error to map to HAS_LINKED_DATA. Counted inside the
  -- transaction, so a row inserted concurrently still fails the delete's FK.
  select count(*) into v_conversations
    from public.conversations where whatsapp_account_id = p_account_id;
  select count(*) into v_templates
    from public.message_templates where whatsapp_account_id = p_account_id;
  if v_conversations > 0 or v_templates > 0 then
    raise exception 'WHATSAPP_ACCOUNT_HAS_LINKED_DATA';
  end if;

  -- Disable failover on dependents BEFORE the delete so the FK ON DELETE SET
  -- NULL won't violate whatsapp_accounts_failover_policy_requires_target.
  -- Atomic with the delete: rolls back together on any failure.
  update public.whatsapp_accounts
     set failover_policy = 'disabled', failover_account_id = null, is_failover_active = false
   where failover_account_id = p_account_id;

  delete from public.whatsapp_accounts where id = p_account_id;
  get diagnostics v_deleted = row_count;
  return v_deleted > 0;
end;
$$;

-- service_role (the Edge Function) is the only caller; SECURITY DEFINER runs as
-- the function owner. Lock it down from the client roles.
revoke all on function public.delete_whatsapp_account(uuid) from public;
revoke all on function public.delete_whatsapp_account(uuid) from anon;
revoke all on function public.delete_whatsapp_account(uuid) from authenticated;
