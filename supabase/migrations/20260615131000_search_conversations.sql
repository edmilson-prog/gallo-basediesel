-- Inbox text search (multi-instância era): the Supabase conversations.list
-- could not honor the `search` param because the term spans three tables
-- (customer name/phone, lead name/phone, message text). This RPC does the
-- cross-table match server-side and returns the SAME shape as the table query
-- (conversation columns + a window total_count), honoring every other inbox
-- filter plus ordering and pagination.
--
-- SECURITY INVOKER: runs as the calling user, so RLS on conversations,
-- customers, leads and messages all apply unchanged — searching never widens
-- what a seller can see. p_store_id is optional (RLS already scopes by
-- store/seller); it is kept as an extra narrowing hook for staff.
--
-- NOTE: conversations.lead_id is TEXT (not a uuid FK), hence the leads.id::text
-- cast. No trigram index is created here — at current volume the ILIKE scan is
-- cheap and runs debounced; a GIN/trigram index on messages.text is the future
-- optimization if the messages table grows large.

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
  total_count bigint
)
language sql
stable
security invoker
set search_path = public
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
    (p_store_id is null or c.store_id = p_store_id)
    and (p_status is null or c.status = any (p_status))
    and (p_channel is null or c.channel = p_channel)
    and (p_whatsapp_account_id is null or c.whatsapp_account_id = p_whatsapp_account_id)
    and (p_assigned_seller_id is null or c.assigned_seller_id = p_assigned_seller_id)
    and (not p_unassigned or c.assigned_seller_id is null)
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
      or exists (
        select 1 from public.messages m
        where m.conversation_id = c.id
          and m.text ilike q.term
      )
    )
  order by
    case when p_order_dir = 'asc' then c.last_message_at end asc,
    case when p_order_dir <> 'asc' then c.last_message_at end desc
  limit greatest(p_limit, 1)
  offset greatest(p_offset, 0);
$$;

grant execute on function public.search_conversations(
  text, uuid, text[], text, uuid, uuid, boolean, boolean, text[], timestamptz, timestamptz, text, integer, integer
) to authenticated;
