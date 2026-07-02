-- Fast exact count for the Inbox conversations list (no-search path).
--
-- WHY: PostgREST `count: "exact"` on public.conversations evaluates the
-- per-row RLS gate can_access_conversation(id) over EVERY candidate row on
-- EVERY page fetch. Measured for a non-staff seller (2026-07-02 incident,
-- "Não foi possível carregar conversas"): 5.3s of a 5.4s request was the
-- count CTE alone — intermittently crossing the 8s authenticated
-- statement_timeout under load (Postgres 57014 → PostgREST 500).
--
-- This RPC computes the same total with the access model expressed as SET
-- predicates: the accessible-account set is materialized ONCE and the five
-- can_access_conversation branches (see 20260620120000_access_model_two_gates.sql)
-- become plain predicates over the filtered set — the "gated-once" pattern of
-- docs/dev/conversation-access-model.md applied to counting.
--
-- Scope: mirrors ONLY the Inbox no-search list filters
-- (supabaseConversationsProvider.list). Text search keeps using
-- search_conversations (which already returns total_count). The scalar
-- assignedSellerId/unassigned/customerId/leadId params used by other list
-- callers are NOT mirrored here — those callers keep count:"exact" (cheap on
-- their small, indexed slices).
--
-- SECURITY: SECURITY DEFINER bypasses the per-row policy; the function
-- returns a bare count, so worst-case divergence is a cosmetic header number,
-- never leaked rows. Store-gated via current_store_id() (NULL claims → 0,
-- fail-closed). EXECUTE revoked from public/anon.

create or replace function public.count_conversations(
  p_status text[] default null,
  p_channel text default null,
  p_whatsapp_account_id uuid default null,
  p_is_sdr_active boolean default null,
  p_tags text[] default null,
  p_from_date timestamptz default null,
  p_to_date timestamptz default null,
  p_assigned_seller_ids uuid[] default null,
  p_unassigned boolean default false,
  p_include_queue boolean default false
)
returns bigint
language sql
stable
security definer
set search_path to ''
as $$
  with acc as (
    select public.current_seller_accessible_account_ids() as id
  )
  select count(*)
  from public.conversations c
  where c.store_id = public.current_store_id()
    -- filters (mirror supabaseConversationsProvider.list, no-search path)
    and (p_status is null or c.status = any(p_status))
    and (p_channel is null or c.channel = p_channel)
    and (p_whatsapp_account_id is null or c.whatsapp_account_id = p_whatsapp_account_id)
    and (p_is_sdr_active is null or c.is_sdr_active = p_is_sdr_active)
    and (p_tags is null or c.tags && p_tags)
    and (p_from_date is null or c.last_message_at >= p_from_date)
    and (p_to_date is null or c.last_message_at <= p_to_date)
    -- assignmentAny OR-combination (mirror buildAssignmentOrFilter):
    -- no criterion set = "Todas" (no assignment constraint at all)
    and (
      (p_assigned_seller_ids is null and not p_unassigned and not p_include_queue)
      or (p_assigned_seller_ids is not null
          and c.assigned_seller_id = any(p_assigned_seller_ids))
      or (p_unassigned and c.assigned_seller_id is null)
      or (p_include_queue
          and c.assigned_seller_id is null
          and c.is_sdr_active = false
          and c.status = 'aguardando')
    )
    -- access model: the five can_access_conversation branches as set
    -- predicates (keep in lockstep with 20260620120000 + 20260615130400)
    and (
      public.is_staff()
      or (
        c.assigned_seller_id = public.current_seller_id()
        and (c.whatsapp_account_id is null
             or c.whatsapp_account_id in (select id from acc))
      )
      or (
        exists (
          select 1 from public.conversation_participants p
          where p.conversation_id = c.id
            and p.seller_id = public.current_seller_id()
        )
        and (
          public.store_allows_participant_cross_instance(c.store_id)
          or c.whatsapp_account_id is null
          or c.whatsapp_account_id in (select id from acc)
        )
      )
      or (
        c.assigned_seller_id is null
        and c.whatsapp_account_id is not null
        and c.whatsapp_account_id in (select id from acc)
      )
      or (c.assigned_seller_id is null and c.whatsapp_account_id is null)
    );
$$;

revoke all on function public.count_conversations(
  text[], text, uuid, boolean, text[], timestamptz, timestamptz, uuid[], boolean, boolean
) from public, anon;

grant execute on function public.count_conversations(
  text[], text, uuid, boolean, text[], timestamptz, timestamptz, uuid[], boolean, boolean
) to authenticated, service_role;
