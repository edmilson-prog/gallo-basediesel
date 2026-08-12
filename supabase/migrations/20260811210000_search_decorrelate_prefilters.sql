-- Decorrelates the search block of both Inbox search RPCs.
--
-- ============================ search_conversations ============================
-- The final search block was an OR of two CORRELATED EXISTS — they run ONCE PER
-- ROW of `conversations`:
--
--   SubPlan customers -> Index Scan customers_pkey  loops=3665   1.110 buffers
--   SubPlan leads     -> Index Scan leads_pkey      loops=3651   9.882 buffers  (81%)
--
-- The signature of the defect is that cost did NOT follow selectivity: a term
-- matching 0 rows cost the same ~14k buffers as one matching 4.384. The cost was
-- a function of how many CONVERSATIONS exist, not how many RESULTS there are.
--
-- Materialising both match sets before the join fixes that. `as materialized`
-- guarantees ONE scan of each table instead of 3.6k, and `IN (select ... from cte)`
-- lets the planner build a `hashed SubPlan` with loops=1 — one hash, then O(1)
-- per conversation. The win is STRUCTURAL: it does not depend on an estimate or
-- on picking the right index (this arm was already seen oscillating 60x).
--
-- Measured (black-box on the live RPC, non-staff seller JWT, p_limit := 30):
--   silva    14.875 -> 3.365 buffers   376 ms -> 124 ms
--   zanella  14.091 -> 2.566           320 ms ->  43 ms
--   xkqzvw   14.065 -> 2.221           318 ms ->  33 ms   (rare term = biggest win)
--   %        14.872 -> 3.959           433 ms -> 362 ms   (worst case, still better)
-- No case regresses. The rare term was the WORST case of the old shape and is the
-- best of the new one: the single 170-buffer scan of `leads` is nothing next to
-- the 9.882 the correlated form pays precisely BECAUSE nothing matches — it probes
-- leads_pkey 3.651 times to find that out.
--
-- SEMANTICS — READ BEFORE EDITING: `IN` yields NULL where `EXISTS` yielded FALSE
-- (null customer_id/lead_id, or orphans). Under a plain `AND` in the WHERE the two
-- are equivalent — both drop the row. If anyone ever wraps this block in a `NOT`,
-- NULL and FALSE diverge and search breaks silently.
--
-- `mc`/`ml` must NOT reference `c`. Being decorrelated is the whole point. They are
-- deliberately not filtered by store: measured, zero gain (production has one store)
-- and correlating them would reintroduce the defect.
--
-- KNOWN CLIFF: `subplan_is_hashable()` decides from the PLANNING-TIME ESTIMATE.
-- With work_mem=3500kB and hash_mem_multiplier=2 the ceiling is ~179k estimated
-- rows; the estimate is ~50% of the table (the digit_variants branch drags in the
-- default 0.5 EXISTS selectivity), so the cliff sits near ~358k rows in `leads` OR
-- `customers`. There are 3.6k today — ~99x of headroom. Crossing it drops the
-- `hashed` and the SubPlan goes back to per-row (measured: 464 ms -> 11.612 ms).
-- Lowering work_mem (a smaller instance) trips the same cliff.
--
-- ======================= search_conversation_messages ========================
-- This one was not slow — it was FAILING. Verified against production with a
-- non-staff seller JWT and the role's real 8s statement_timeout:
--   'bom dia' -> ERROR 57014 canceling statement due to statement timeout
--   'ok'      -> 7.300 ms (700 ms short of the ceiling)
-- Searching for a greeting simply did not return.
--
-- Defect 1: the `ilike` was a per-conversation post-filter —
--   Nested Loop: CTE Scan candidate_conversations (rows=3596)
--     -> Index Scan messages_conversation_id_idx loops=3596
--          Filter: (text ~~* ...)   44.378 buffers (98% of the cost)
-- `messages_text_trgm_idx` exists and IS usable with the runtime pattern: in
-- isolation the same step costs 112 buffers / 100 ms. A 396x difference.
--
-- Defect 2: fixing only defect 1 is not enough. Materialising the hits drops
-- buffers (45.106 -> 840) but 'bom dia' still took 18.835 ms, CPU-bound: the outer
-- join was a Nested Loop with `Join Filter (cc.id = mm.conversation_id)` over
-- `mm.rn = 1` — 3.596 x 1.845 ~= 6,6M comparisons. Moving `rn = 1` INSIDE a
-- materialised CTE turns that node into a pure equijoin.
--
-- Both together (black-box, full function, 22 columns):
--   'bom dia'  TIMEOUT -> 5.764 buffers /   973 ms
--   'ok'       46.680  -> 10.303 buffers / 1.045 ms
--
-- ================================ equivalence ================================
-- Proven, not assumed: EXCEPT ALL in BOTH directions over the sensitive columns
-- (id, lead_id, is_collaborator, is_accessible, contact_name, contact_phone,
-- total_count), across ~58 comparisons in three independent harnesses — accent,
-- empty term, whitespace-only term, LIKE escape (`\`, `%`), digit variants (null,
-- empty array, several), status filters, unassigned, include_queue, and asc
-- pagination with offset. Zero divergences. A synthetic 32-row truth table covered
-- the both-arms case, because production never exercises it (0 conversations carry
-- customer_id AND lead_id at once).

begin;

set local lock_timeout = '3s';

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
  q as (select '%' || coalesce(trim(p_search), '') || '%' as term),
  -- MATERIALISED pre-filters: one scan of each table, not 3.6k.
  -- The empty-term guard is repeated here on purpose — it becomes a One-Time
  -- Filter on the CTE's Result node, so an empty term never scans these tables
  -- even if the planner reorders.
  mc as materialized (
    select cu.id
    from public.customers cu, q
    where length(trim(coalesce(p_search, ''))) > 0
      and (cu.full_name ilike q.term or cu.nome_fantasia ilike q.term or cu.phone ilike q.term
           or (p_search_digit_variants is not null and exists (
                 select 1 from unnest(p_search_digit_variants) as v(variant)
                 where cu.phone_digits like '%' || v.variant || '%')))
  ),
  -- `l.id`, never `l.id::text`: `ml` yields native uuid, so the comparison with
  -- `c.lead_id::uuid` is uuid vs uuid. The cast fix does NOT regress here.
  ml as materialized (
    select l.id
    from public.leads l, q
    where length(trim(coalesce(p_search, ''))) > 0
      and (l.name ilike q.term or l.phone ilike q.term
           or (p_search_digit_variants is not null and exists (
                 select 1 from unnest(p_search_digit_variants) as v(variant)
                 where l.phone_digits like '%' || v.variant || '%')))
  )
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
  -- `q` left the main FROM: only `mc`/`ml` consume `q.term` now. It was a
  -- one-row cross join; removing it changes neither cardinality nor count(*) over ().
  from public.conversations c
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
    -- THE ONLY LOGIC CHANGE: this was an OR of two correlated EXISTS.
    -- See the header, especially the NULL-vs-FALSE note.
    and (
      c.customer_id in (select id from mc)
      or c.lead_id::uuid in (select id from ml)
    )
  order by
    case when p_order_dir = 'asc' then c.last_message_at end asc,
    case when p_order_dir <> 'asc' then c.last_message_at end desc
  limit greatest(p_limit, 1)
  offset greatest(p_offset, 0);
$function$;

create or replace function public.search_conversation_messages(
  p_search text,
  p_store_id uuid default null::uuid,
  p_status text[] default null::text[],
  p_channel text default null::text,
  p_whatsapp_account_id uuid default null::uuid,
  p_assigned_seller_id uuid default null::uuid,
  p_unassigned boolean default false,
  p_assigned_seller_ids uuid[] default null::uuid[],
  p_include_queue boolean default false,
  p_is_sdr_active boolean default null::boolean,
  p_tags text[] default null::text[],
  p_from_date timestamp with time zone default null::timestamp with time zone,
  p_to_date timestamp with time zone default null::timestamp with time zone,
  p_order_dir text default 'desc'::text,
  p_limit integer default 30,
  p_offset integer default 0
)
returns table(
  id uuid, store_id uuid, customer_id uuid, lead_id text, assigned_seller_id uuid,
  channel text, whatsapp_account_id uuid, status text, is_sdr_active boolean,
  tags text[], linked_order_id text, last_message_at timestamp with time zone,
  unread_count integer, created_at timestamp with time zone,
  queued_at timestamp with time zone, ad_referral jsonb,
  matched_message_text text, matched_message_sent_at timestamp with time zone,
  matched_message_direction text, matched_message_extra_count integer,
  is_collaborator boolean, total_count bigint
)
language sql
stable security definer
set search_path to ''
as $function$
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
  -- Defect 1: without the join in here, the `ilike` stops being a per-conversation
  -- post-filter and the planner uses `messages_text_trgm_idx` ONCE.
  msg_hits as materialized (
    select m.conversation_id, m.text, m.sent_at, m.direction
    from public.messages m, esc
    where length(esc.raw_term) > 0
      and m.text ilike ('%' || esc.escaped_term || '%') escape '\'
  ),
  -- Defect 2: `rn = 1` MUST stay in here. Back on the outer join's ON clause the
  -- node becomes a Nested Loop with a Join Filter (~6,6M comparisons) and the
  -- msg_hits win disappears in the worst case.
  matched as materialized (
    select t.conversation_id, t.text, t.sent_at, t.direction, t.match_count
    from (
      select
        mh.conversation_id, mh.text, mh.sent_at, mh.direction,
        row_number() over (
          partition by mh.conversation_id order by mh.sent_at desc, mh.text desc
        ) as rn,
        count(*) over (partition by mh.conversation_id) as match_count
      from msg_hits mh
      join candidate_conversations cc on cc.id = mh.conversation_id
    ) t
    where t.rn = 1
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
    cc.ad_referral,
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
  -- `and mm.rn = 1` left this ON clause — it now lives inside `matched`.
  join matched mm on mm.conversation_id = cc.id
  order by
    case when p_order_dir = 'asc' then cc.last_message_at end asc,
    case when p_order_dir <> 'asc' then cc.last_message_at end desc
  limit greatest(p_limit, 1)
  offset greatest(p_offset, 0);
$function$;

commit;
