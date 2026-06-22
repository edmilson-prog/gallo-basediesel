-- Inbox pool contact names — performant, BOUNDED replacement for the reverted
-- per-row customers RLS widening.
--
-- Background: migration 20260619103000 loosened customers_select / leads_select to
-- call public.can_access_conversation(id) PER ROW so a non-staff seller could read
-- the contact of any POOL conversation they can see. It was correct but not
-- scalable: those policies short-circuit on is_staff()/ownership and then run the
-- helper for EVERY remaining row, so the inbox's bulk `customers list (limit 500)`
-- (the tag collector) ran can_access_conversation for hundreds of rows and tripped
-- statement_timeout — surfacing as 500s on /customers, /messages. It was reverted by
-- 20260619170000, which prescribed "a performant pool-aware replacement (avoiding a
-- per-row can_access_conversation call — e.g. a set-based / indexed predicate proven
-- under load)". This is that replacement.
--
-- Approach: DO NOT touch customers_select / leads_select (so bulk customer scans
-- keep their fast, index-backed predicate). Instead expose the contact name ONLY
-- for conversations the caller can already access, over a BOUNDED set, through two
-- SECURITY DEFINER reads gated by can_access_conversation:
--   1. conversation_contacts(uuid[]) — resolves display name/phone/avatar for a
--      GIVEN list of conversations (the inbox passes the page's ~30-50 ids; the
--      header passes a single id). can_access_conversation runs only over that
--      bounded array, never a full-table customers scan.
--   2. search_conversations(...) becomes SECURITY DEFINER with an EXPLICIT
--      can_access_conversation(c.id) gate (replacing the implicit conversations-RLS
--      the INVOKER version relied on), so a seller's name search again matches POOL
--      conversations — the INVOKER version filtered them out because the customer
--      row was RLS-hidden inside the name-match EXISTS.
--
-- Both functions read customers/leads under DEFINER privileges, but the
-- can_access_conversation gate ensures a row is only ever returned for a
-- conversation the caller is already allowed to see. customers_select /
-- leads_select are UNCHANGED.

-- 1) Bounded contact resolver for a list of conversations -----------------------
create or replace function public.conversation_contacts(p_ids uuid[])
returns table (
  conversation_id uuid,
  ref_id text,
  is_lead boolean,
  name text,
  phone text,
  avatar_url text,
  temperature text
)
language sql
stable
security definer
set search_path to ''
as $$
  select
    c.id as conversation_id,
    coalesce(cu.id::text, l.id::text) as ref_id,
    (cu.id is null and l.id is not null) as is_lead,
    coalesce(
      case when cu.type = 'B2B' then cu.nome_fantasia else cu.full_name end,
      l.name
    ) as name,
    coalesce(cu.phone, l.phone) as phone,
    cu.avatar_url as avatar_url,
    l.temperature::text as temperature
  from public.conversations c
  left join public.customers cu on cu.id = c.customer_id
  left join public.leads l on l.id::text = c.lead_id
  where c.id = any (p_ids)
    and public.can_access_conversation(c.id);
$$;

revoke all on function public.conversation_contacts(uuid[]) from public, anon;
grant execute on function public.conversation_contacts(uuid[]) to authenticated;

-- 2) Pool-aware search for sellers ----------------------------------------------
-- Same signature / returns / filters / ordering / pagination as 20260615131000.
-- The ONLY changes: SECURITY DEFINER, fully-qualified identifiers (required under
-- an empty search_path), and the can_access_conversation(c.id) gate that REPLACES
-- the implicit conversations-RLS the INVOKER version relied on — so it cannot leak
-- conversations the caller cannot access, while the customer/lead name match now
-- sees pool contacts the seller is allowed to handle.
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

revoke all on function public.search_conversations(
  text, uuid, text[], text, uuid, uuid, boolean, boolean, text[], timestamptz, timestamptz, text, integer, integer
) from public, anon;
grant execute on function public.search_conversations(
  text, uuid, text[], text, uuid, uuid, boolean, boolean, text[], timestamptz, timestamptz, text, integer, integer
) to authenticated;
