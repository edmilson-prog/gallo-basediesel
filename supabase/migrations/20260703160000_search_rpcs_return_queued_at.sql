-- Inbox wait-time counter parity in search: the two search RPCs did not project
-- conversations.queued_at, so during Inbox free-text search the frontend counter
-- fell back to last_message_at (underestimates the wait). Both bodies are
-- reproduced verbatim from their current definitions (search_conversations from
-- 20260701130000, search_conversation_messages from 20260701140000); the ONLY
-- change is adding queued_at (a passthrough column of the same already-scanned
-- row) to the RETURNS TABLE and the SELECT. No new join/predicate/index -> same
-- cost. DROP + CREATE is required because widening RETURNS TABLE changes the
-- return type (CREATE OR REPLACE is rejected); grants are re-emitted post-DROP.

-- === search_conversations (contact identity search) ===

drop function if exists public.search_conversations(
  text, uuid, text[], text, uuid, uuid, boolean, boolean, text[], timestamptz, timestamptz, text, integer, integer, uuid[], boolean
);

create function public.search_conversations(
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
  queued_at timestamptz,
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
    c.queued_at,
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

-- === search_conversation_messages (message-text search) ===

drop function if exists public.search_conversation_messages(
  text, uuid, text[], text, uuid, uuid, boolean, uuid[], boolean, boolean, text[], timestamptz, timestamptz, text, integer, integer
);

create function public.search_conversation_messages(
  p_search text,
  p_store_id uuid default null,
  p_status text[] default null,
  p_channel text default null,
  p_whatsapp_account_id uuid default null,
  p_assigned_seller_id uuid default null,
  p_unassigned boolean default false,
  p_assigned_seller_ids uuid[] default null,
  p_include_queue boolean default false,
  p_is_sdr_active boolean default null,
  p_tags text[] default null,
  p_from_date timestamptz default null,
  p_to_date timestamptz default null,
  p_order_dir text default 'desc',
  p_limit integer default 30,
  p_offset integer default 0
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
  queued_at timestamptz,
  matched_message_text text,
  matched_message_sent_at timestamptz,
  matched_message_direction text,
  matched_message_extra_count integer,
  total_count bigint
)
language sql
stable
security definer
set search_path to ''
as $$
  with esc as (
    select
      trim(coalesce(p_search, '')) as raw_term,
      replace(replace(replace(trim(coalesce(p_search, '')), '\', '\\'), '%', '\%'), '_', '\_')
        as escaped_term
  ),
  candidate_conversations as (
    select c.*
    from public.conversations c
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
  ),
  matched as (
    select
      m.conversation_id,
      m.text,
      m.sent_at,
      m.direction,
      row_number() over (
        partition by m.conversation_id order by m.sent_at desc, m.text desc
      ) as rn,
      count(*) over (partition by m.conversation_id) as match_count
    from public.messages m
    join candidate_conversations cc on cc.id = m.conversation_id
    cross join esc
    where length(esc.raw_term) > 0
      and m.text ilike ('%' || esc.escaped_term || '%') escape '\'
  )
  select
    cc.id,
    cc.store_id,
    cc.customer_id,
    cc.lead_id,
    cc.assigned_seller_id,
    cc.channel,
    cc.whatsapp_account_id,
    cc.status,
    cc.is_sdr_active,
    cc.tags,
    cc.linked_order_id,
    cc.last_message_at,
    cc.unread_count,
    cc.created_at,
    cc.queued_at,
    mm.text as matched_message_text,
    mm.sent_at as matched_message_sent_at,
    mm.direction as matched_message_direction,
    (mm.match_count - 1)::integer as matched_message_extra_count,
    count(*) over () as total_count
  from candidate_conversations cc
  join matched mm on mm.conversation_id = cc.id and mm.rn = 1
  order by
    case when p_order_dir = 'asc' then cc.last_message_at end asc,
    case when p_order_dir <> 'asc' then cc.last_message_at end desc
  limit greatest(p_limit, 1)
  offset greatest(p_offset, 0);
$$;

revoke all on function public.search_conversation_messages(
  text, uuid, text[], text, uuid, uuid, boolean, uuid[], boolean, boolean, text[], timestamptz, timestamptz, text, integer, integer
) from public, anon;
grant execute on function public.search_conversation_messages(
  text, uuid, text[], text, uuid, uuid, boolean, uuid[], boolean, boolean, text[], timestamptz, timestamptz, text, integer, integer
) to authenticated;
