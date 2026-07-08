-- Incident 2026-07-07: sustained statement_timeout storm (~25 min) — 500s on
-- GET /sdr_sessions, GET /conversations (queue filter) and POST
-- /rpc/search_conversations for non-staff sellers.
--
-- Root cause (EXPLAIN ANALYZE under a real seller_internal JWT):
--   the "double RLS" anti-pattern. sdr_sessions policies and both search RPCs
--   evaluate conversations THROUGH its own RLS (or call
--   can_access_conversation(c.id) per row), so every query re-runs
--   can_access_conversation once per row of the WHOLE conversations table
--   (2.614 calls measured):
--     - sdr_sessions SELECT ..... 7.031 ms  (policy subselect over conversations)
--     - search_conversations .... 24.596 ms (per-row can_access + count(*) over())
--   A few concurrent sellers on the Inbox stack these up and push everything
--   else into the 2-min statement_timeout. Same class of problem already fixed
--   for messages/media/count_conversations (see 20260702180000 and
--   docs/dev/conversation-access-model.md) — these three surfaces were missed.
--
-- Fix (same proven pattern as count_conversations):
--   (a) sdr_sessions: gate each row ONCE via can_access_conversation(conversation_id)
--       instead of a full-table IN-subselect over RLS'd conversations.
--       Effective semantics are IDENTICAL: the old subselect already resolved to
--       "conversations visible to the caller" (store check is inside
--       can_access_conversation). Verified on prod data: same 27/27 ids for a
--       real seller; 7.031 ms -> 1.142 ms, no longer scales with conversations.
--   (b) search_conversations / search_conversation_messages: inline the access
--       predicate (verbatim from can_access_conversation, with the accessible
--       account ids materialized ONCE per call) instead of calling the function
--       per row. Verified on prod data in a single snapshot: 485/485 ids, zero
--       symmetric difference; 24.596 ms -> 474 ms.
--
-- NOT touched (checked and bounded): media_assets policies (planner probes
-- conversations via assigned_seller_id index, ~233 ms), conversation_participants
-- policies (correlated PK probe), per-conversation gated-once RPCs.

-- (a) sdr_sessions ------------------------------------------------------------

drop policy if exists sdr_sessions_select on public.sdr_sessions;
create policy sdr_sessions_select on public.sdr_sessions
  for select to authenticated
  using (public.can_access_conversation(conversation_id));

drop policy if exists sdr_sessions_insert on public.sdr_sessions;
create policy sdr_sessions_insert on public.sdr_sessions
  for insert to authenticated
  with check (public.can_access_conversation(conversation_id));

drop policy if exists sdr_sessions_update on public.sdr_sessions;
create policy sdr_sessions_update on public.sdr_sessions
  for update to authenticated
  using (public.can_access_conversation(conversation_id))
  with check (public.can_access_conversation(conversation_id));

drop policy if exists sdr_sessions_delete on public.sdr_sessions;
create policy sdr_sessions_delete on public.sdr_sessions
  for delete to authenticated
  using (public.can_access_conversation(conversation_id));

-- (b) search_conversations ----------------------------------------------------
-- Body is verbatim 20260704120200 except: `public.can_access_conversation(c.id)`
-- is replaced by the hard store gate + the inlined access block (copied from
-- count_conversations / can_access_conversation), with `acc` materialized once.

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
  ),
  q as (select '%' || coalesce(trim(p_search), '') || '%' as term)
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
  from public.conversations c, q
  where
    c.store_id = public.current_store_id()
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
    and (
      exists (select 1 from public.customers cu where cu.id = c.customer_id
        and (cu.full_name ilike q.term or cu.nome_fantasia ilike q.term or cu.phone ilike q.term))
      or exists (select 1 from public.leads l where l.id::text = c.lead_id
        and (l.name ilike q.term or l.phone ilike q.term))
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

-- (c) search_conversation_messages --------------------------------------------
-- Body is verbatim 20260705170000 (d) with the same access-predicate swap in
-- candidate_conversations.

create or replace function public.search_conversation_messages(
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
  id uuid, store_id uuid, customer_id uuid, lead_id text, assigned_seller_id uuid,
  channel text, whatsapp_account_id uuid, status text, is_sdr_active boolean,
  tags text[], linked_order_id text, last_message_at timestamptz, unread_count integer,
  created_at timestamptz, queued_at timestamptz, matched_message_text text,
  matched_message_sent_at timestamptz, matched_message_direction text,
  matched_message_extra_count integer, is_collaborator boolean, total_count bigint
)
language sql
stable
security definer
set search_path to ''
as $$
  with acc as materialized (
    select public.current_seller_accessible_account_ids() as id
  ),
  esc as (
    select
      trim(coalesce(p_search, '')) as raw_term,
      replace(replace(replace(trim(coalesce(p_search, '')), '\', '\\'), '%', '\%'), '_', '\_')
        as escaped_term
  ),
  candidate_conversations as (
    select c.*
    from public.conversations c
    where
      c.store_id = public.current_store_id()
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
    exists (
      select 1 from public.conversation_participants p
      where p.conversation_id = cc.id
        and p.seller_id = public.current_seller_id()
    ) as is_collaborator,
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
  text, uuid, text[], text, uuid, uuid, boolean, uuid[], boolean, boolean, text[],
  timestamptz, timestamptz, text, integer, integer
) from public, anon;
grant execute on function public.search_conversation_messages(
  text, uuid, text[], text, uuid, uuid, boolean, uuid[], boolean, boolean, text[],
  timestamptz, timestamptz, text, integer, integer
) to authenticated, service_role;
