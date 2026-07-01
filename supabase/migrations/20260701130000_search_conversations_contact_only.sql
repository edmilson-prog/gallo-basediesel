-- Narrow the Inbox free-text search to contact identity only (name/phone of the
-- customer or lead). The cross-entity match against message text is being split
-- into a DEDICATED search (see search_conversation_messages, next migration) so
-- the two behaviours never mix in the same box: this one stays instantaneous and
-- predictable (only what the eye sees in the row can match); the other is an
-- explicit, heavier action the user opts into.
--
-- Same signature as the currently deployed function (20260623120000) — only the
-- WHERE clause's third OR-branch (messages EXISTS) is removed. No drop needed.

create or replace function public.search_conversations(
  p_search text,
  p_store_id uuid default null,
  p_status text[] default null,
  p_channel text default null,
  p_whatsapp_account_id uuid default null,
  p_assigned_seller_id uuid default null,
  p_unassigned boolean default false,
  p_is_sdr_active boolean default null,
  p_tags text[] default null,
  p_from_date timestamptz default null,
  p_to_date timestamptz default null,
  p_order_dir text default 'desc',
  p_limit integer default 30,
  p_offset integer default 0,
  p_assigned_seller_ids uuid[] default null,
  p_include_queue boolean default false
)
returns table (
  id uuid,
  store_id uuid,
  customer_id uuid,
  lead_id text,
  assigned_seller_id uuid,
  channel text,
  whatsapp_account_id uuid,
  status text,
  is_sdr_active boolean,
  tags text[],
  linked_order_id text,
  last_message_at timestamptz,
  unread_count integer,
  created_at timestamptz,
  total_count bigint
)
language sql
stable
security definer
set search_path to ''
as $$
  with q as (select '%' || coalesce(trim(p_search), '') || '%' as term)
  select
    c.id,
    c.store_id,
    c.customer_id,
    c.lead_id,
    c.assigned_seller_id,
    c.channel,
    c.whatsapp_account_id,
    c.status,
    c.is_sdr_active,
    c.tags,
    c.linked_order_id,
    c.last_message_at,
    c.unread_count,
    c.created_at,
    count(*) over () as total_count
  from public.conversations c, q
  where
    public.can_access_conversation(c.id)
    and (p_store_id is null or c.store_id = p_store_id)
    and (p_status is null or c.status = any (p_status))
    and (p_channel is null or c.channel = p_channel)
    and (p_whatsapp_account_id is null or c.whatsapp_account_id = p_whatsapp_account_id)
    and (
      ( p_assigned_seller_id is null
        and (p_assigned_seller_ids is null or cardinality(p_assigned_seller_ids) = 0)
        and not p_unassigned
        and not p_include_queue )
      or (p_assigned_seller_id is not null and c.assigned_seller_id = p_assigned_seller_id)
      or (p_assigned_seller_ids is not null and c.assigned_seller_id = any (p_assigned_seller_ids))
      or (p_unassigned and c.assigned_seller_id is null)
      or (p_include_queue and c.assigned_seller_id is null
            and c.is_sdr_active = false and c.status = 'aguardando')
    )
    and (p_is_sdr_active is null or c.is_sdr_active = p_is_sdr_active)
    and (p_tags is null or c.tags && p_tags)
    and (p_from_date is null or c.last_message_at >= p_from_date)
    and (p_to_date is null or c.last_message_at <= p_to_date)
    and (
      exists (
        select 1 from public.customers cu
        where cu.id = c.customer_id
          and (cu.full_name ilike q.term or cu.nome_fantasia ilike q.term or cu.phone ilike q.term)
      )
      or exists (
        select 1 from public.leads l
        where l.id::text = c.lead_id
          and (l.name ilike q.term or l.phone ilike q.term)
      )
    )
  order by
    case when p_order_dir = 'asc' then c.last_message_at end asc,
    case when p_order_dir <> 'asc' then c.last_message_at end desc
  limit greatest(p_limit, 1)
  offset greatest(p_offset, 0);
$$;

revoke all on function public.search_conversations(
  text, uuid, text[], text, uuid, uuid, boolean, boolean, text[], timestamptz, timestamptz, text, integer, integer, uuid[], boolean
) from public, anon;
grant execute on function public.search_conversations(
  text, uuid, text[], text, uuid, uuid, boolean, boolean, text[], timestamptz, timestamptz, text, integer, integer, uuid[], boolean
) to authenticated;
