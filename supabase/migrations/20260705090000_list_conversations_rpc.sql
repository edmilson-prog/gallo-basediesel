-- Fast, collaborator-aware list for the Inbox "Minhas conversas" no-search
-- path. Reuses count_conversations' WHERE clause verbatim (same filters,
-- same access-model block, same participant-inclusion branch) — only the
-- SELECT list (full row + is_collaborator + window total_count) and the
-- ORDER BY/LIMIT/OFFSET are new. A plain PostgREST `.or()` on the base
-- table cannot express "or I collaborate" (that needs an EXISTS against
-- conversation_participants), hence a dedicated RPC rather than extending
-- the existing raw-query path in conversations.ts.
--
-- Scope restriction mirrors count_conversations exactly (see
-- assertInboxCountParams): callers passing storeId/search/customerId/
-- leadId/scalar assignedSellerId/unassigned keep using the plain table
-- query instead — this RPC is Inbox-"Minhas conversas"-only.

create or replace function public.list_conversations(
  p_status text[] default null,
  p_channel text default null,
  p_whatsapp_account_id uuid default null,
  p_is_sdr_active boolean default null,
  p_tags text[] default null,
  p_from_date timestamptz default null,
  p_to_date timestamptz default null,
  p_assigned_seller_ids uuid[] default null,
  p_unassigned boolean default false,
  p_include_queue boolean default false,
  p_order_dir text default 'desc',
  p_limit integer default 20,
  p_offset integer default 0
)
returns table (
  id uuid, store_id uuid, customer_id uuid, lead_id text, assigned_seller_id uuid,
  channel text, whatsapp_account_id uuid, status text, is_sdr_active boolean,
  tags text[], linked_order_id text, last_message_at timestamptz, unread_count integer,
  created_at timestamptz, queued_at timestamptz, is_collaborator boolean, total_count bigint
)
language sql
stable
security definer
set search_path to ''
as $$
  with acc as materialized (
    select public.current_seller_accessible_account_ids() as id
  )
  select
    c.id, c.store_id, c.customer_id, c.lead_id, c.assigned_seller_id, c.channel,
    c.whatsapp_account_id, c.status, c.is_sdr_active, c.tags, c.linked_order_id,
    c.last_message_at, c.unread_count, c.created_at, c.queued_at,
    exists (
      select 1 from public.conversation_participants p
      where p.conversation_id = c.id
        and p.seller_id = public.current_seller_id()
    ) as is_collaborator,
    count(*) over () as total_count
  from public.conversations c
  where c.store_id = public.current_store_id()
    and (p_status is null or c.status = any(p_status))
    and (p_channel is null or c.channel = p_channel)
    and (p_whatsapp_account_id is null or c.whatsapp_account_id = p_whatsapp_account_id)
    and (p_is_sdr_active is null or c.is_sdr_active = p_is_sdr_active)
    and (p_tags is null or c.tags && p_tags)
    and (p_from_date is null or c.last_message_at >= p_from_date)
    and (p_to_date is null or c.last_message_at <= p_to_date)
    and (
      ((p_assigned_seller_ids is null or cardinality(p_assigned_seller_ids) = 0)
        and not p_unassigned and not p_include_queue)
      or (p_assigned_seller_ids is not null
          and c.assigned_seller_id = any(p_assigned_seller_ids))
      or (p_assigned_seller_ids is not null
          and exists (
            select 1 from public.conversation_participants p
            where p.conversation_id = c.id
              and p.seller_id = any(p_assigned_seller_ids)
          ))
      or (p_unassigned and c.assigned_seller_id is null)
      or (p_include_queue
          and c.assigned_seller_id is null
          and c.is_sdr_active = false
          and c.status = 'aguardando')
    )
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
    )
  order by
    case when p_order_dir = 'asc' then c.last_message_at end asc,
    case when p_order_dir <> 'asc' then c.last_message_at end desc
  limit greatest(p_limit, 1)
  offset greatest(p_offset, 0);
$$;

revoke all on function public.list_conversations(
  text[], text, uuid, boolean, text[], timestamptz, timestamptz, uuid[], boolean, boolean, text, integer, integer
) from public, anon;
grant execute on function public.list_conversations(
  text[], text, uuid, boolean, text[], timestamptz, timestamptz, uuid[], boolean, boolean, text, integer, integer
) to authenticated;
