-- Inbox search was timing out (HTTP 500) — `search_conversations` averaged
-- 3.457 ms and peaked at 7.980 ms against the `authenticated` role's 8 s
-- statement_timeout (7.611 calls / 26.314 s of database time in 26 days).
--
-- Root cause: `leads.id` is `uuid` but `conversations.lead_id` is `text`, and
-- the function bridged them as `l.id::text = c.lead_id` — casting the INDEXED
-- side. That makes `leads_pkey` unusable, so every conversation row triggered a
-- sequential scan of `leads`; 3.890 of 4.499 conversations are lead-only, so it
-- fired on 86% of rows. Casting the other way (`l.id = c.lead_id::uuid`) keeps
-- the index: 306.516 -> 12.897 buffers, 2.534 ms -> 487 ms on the generic plan,
-- and 46 ms with a real search term.
--
-- Three occurrences change together — the WHERE arm plus the two contact
-- subqueries in the SELECT list, which were each doing their own seq scan.
--
-- Guard first: `conversations.lead_id` has no FK and no CHECK (the types differ,
-- so a FK is impossible). With the cast in a per-row filter, ONE malformed value
-- would raise 22P02 and break search for EVERY user — a total failure, not a
-- per-row one. Zero rows violate it today, so the constraint validates clean and
-- closes that door for good.
alter table public.conversations
  add constraint conversations_lead_id_is_uuid
  check (
    lead_id is null
    or lead_id ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
  )
  not valid;

alter table public.conversations validate constraint conversations_lead_id_is_uuid;

create or replace function public.search_conversations(
  p_search text,
  p_store_id uuid default null::uuid,
  p_status text[] default null::text[],
  p_channel text default null::text,
  p_whatsapp_account_id uuid default null::uuid,
  p_assigned_seller_id uuid default null::uuid,
  p_unassigned boolean default false,
  p_is_sdr_active boolean default null::boolean,
  p_tags text[] default null::text[],
  p_from_date timestamp with time zone default null::timestamp with time zone,
  p_to_date timestamp with time zone default null::timestamp with time zone,
  p_order_dir text default 'desc'::text,
  p_limit integer default 30,
  p_offset integer default 0,
  p_assigned_seller_ids uuid[] default null::uuid[],
  p_include_queue boolean default false,
  p_search_digit_variants text[] default null::text[]
)
returns table(
  id uuid, store_id uuid, customer_id uuid, lead_id text, assigned_seller_id uuid,
  channel text, whatsapp_account_id uuid, status text, is_sdr_active boolean,
  tags text[], linked_order_id text, last_message_at timestamp with time zone,
  unread_count integer, created_at timestamp with time zone,
  queued_at timestamp with time zone, ad_referral jsonb, is_collaborator boolean,
  is_accessible boolean, contact_name text, contact_phone text, total_count bigint
)
language sql
stable security definer
set search_path to ''
as $function$
  with acc as materialized (
    select public.current_seller_accessible_account_ids() as id
  ),
  q as (select '%' || coalesce(trim(p_search), '') || '%' as term)
  select
    c.id, c.store_id, c.customer_id, c.lead_id, c.assigned_seller_id, c.channel,
    c.whatsapp_account_id, c.status, c.is_sdr_active, c.tags, c.linked_order_id,
    c.last_message_at, c.unread_count, c.created_at, c.queued_at, c.ad_referral,
    exists (
      select 1 from public.conversation_participants p
      where p.conversation_id = c.id
        and p.seller_id = public.current_seller_id()
    ) as is_collaborator,
    public.can_access_conversation(c.id) as is_accessible,
    -- Contact identity for the search card (owner decision, post-review): the
    -- searcher typed the phone — hiding the name only hurts identification.
    -- Same name resolution as conversation_contacts; exposed HERE (search RPC,
    -- behind the search-visibility arm) instead of un-gating that RPC, which
    -- also feeds the openable inbox.
    coalesce(
      (select case when cu.type = 'B2B'
                then coalesce(nullif(cu.nome_fantasia, ''), nullif(cu.razao_social, ''), cu.full_name)
                else cu.full_name end
         from public.customers cu where cu.id = c.customer_id),
      (select l.name from public.leads l where l.id = c.lead_id::uuid)
    ) as contact_name,
    coalesce(
      (select cu.phone from public.customers cu where cu.id = c.customer_id),
      (select l.phone from public.leads l where l.id = c.lead_id::uuid)
    ) as contact_phone,
    count(*) over () as total_count
  from public.conversations c, q
  where
    c.store_id = public.current_store_id()
    -- An empty term matches EVERY row through the search arm below, turning this
    -- RPC into a full-inbox scan. The provider already refuses to route here
    -- without a term (supabase/conversations.ts) and its comment claimed each
    -- RPC "already treats an empty term as 0 rows" — which was not true. Now it is.
    and length(trim(coalesce(p_search, ''))) > 0
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
      or (
        -- Search-visibility (metadata-only) arm: attendants can FIND same-store
        -- conversations assigned to any seller — who has it is the answer this
        -- search exists to give. Opening stays gated: is_accessible mirrors
        -- can_access_conversation and the frontend blocks navigation on false.
        -- Restricted to users operating at least one instance so roles with no
        -- attendance surface (Financeiro/SDR) keep seeing nothing.
        c.assigned_seller_id is not null
        and exists (select 1 from acc)
      )
    )
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
      or (p_assigned_seller_ids is not null
          and exists (
            select 1 from public.conversation_participants p
            where p.conversation_id = c.id
              and p.seller_id = any (p_assigned_seller_ids)
          ))
      or (p_unassigned and c.assigned_seller_id is null)
      or (p_include_queue and c.assigned_seller_id is null
            and c.is_sdr_active = false and c.status = 'aguardando')
    )
    and (p_is_sdr_active is null or c.is_sdr_active = p_is_sdr_active)
    and (p_tags is null or c.tags && p_tags)
    and (p_from_date is null or c.last_message_at >= p_from_date)
    and (p_to_date is null or c.last_message_at <= p_to_date)
    -- Merge husks (2026-07-23): an archived conversation with no messages is a
    -- shell kept only so media storage paths and the attendance-history trail
    -- stay anchored — never surface it as a search result.
    and not (
      c.status = 'arquivada'
      and not exists (select 1 from public.messages m where m.conversation_id = c.id)
    )
    and (
      exists (select 1 from public.customers cu where cu.id = c.customer_id
        and (cu.full_name ilike q.term or cu.nome_fantasia ilike q.term or cu.phone ilike q.term
             or (p_search_digit_variants is not null and exists (
                   select 1 from unnest(p_search_digit_variants) as v(variant)
                   where cu.phone_digits like '%' || v.variant || '%'))))
      -- `l.id = c.lead_id::uuid`, never `l.id::text = c.lead_id`: casting the
      -- indexed column is what cost 2 s per call (see header).
      or exists (select 1 from public.leads l where l.id = c.lead_id::uuid
        and (l.name ilike q.term or l.phone ilike q.term
             or (p_search_digit_variants is not null and exists (
                   select 1 from unnest(p_search_digit_variants) as v(variant)
                   where l.phone_digits like '%' || v.variant || '%'))))
    )
  order by
    case when p_order_dir = 'asc' then c.last_message_at end asc,
    case when p_order_dir <> 'asc' then c.last_message_at end desc
  limit greatest(p_limit, 1)
  offset greatest(p_offset, 0);
$function$;
