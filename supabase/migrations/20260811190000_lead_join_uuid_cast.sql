-- Casts the PARAMETER instead of the indexed column in the three RPCs that
-- still join `conversations` to `leads` the wrong way round.
--
-- `leads.id` is uuid and `conversations.lead_id` is text, and these functions
-- bridged them as `l.id::text = c.lead_id`. Casting the INDEXED column makes
-- `leads_pkey` unusable, so each call pays a full sequential scan of `leads`
-- (3.607 rows / ~170 buffers) — a fixed cost, regardless of how few rows the
-- call actually wants. Same defect fixed in `search_conversations` earlier
-- today (migration 20260811150000).
--
-- Honest sizing: the win here is SMALL. These are joins, not the correlated
-- subquery that made search_conversations pay the scan per row, so the planner
-- was already coping. Measured per call: conversation_contacts −1,3 ms
-- (455 → 348 buffers), lead_via_conversation −1,2 ms (178 → 11), and
-- lead_funnel_entries_via_conversation −1,17 ms (195 → 29). Against 27 days of
-- real traffic (24.073 + 10.984 + 1.556 calls) that is roughly 46 s of database
-- CPU, about 8% of these RPCs' total — not something a user will notice.
--
-- What justifies the change is the SLOPE, not today's number: a sequential scan
-- of `leads` grows with the lead base while an index scan stays flat. The base
-- went from ~0 to 3.598 leads in two months.
--
-- `idle_conversations_summary` has the same text and is deliberately NOT here.
-- Its planner estimate is pinned at rows=11 (the seller comes from the opaque
-- `current_seller_id()`), so it never abandons the nested loop on its own, and
-- the measured break-even is ~300-310 idle conversations per seller. The
-- busiest seller has 174 today, with 1.331 ownerless idle conversations waiting
-- to be distributed — one carteira reshuffle would cross that line and turn the
-- "fix" into a silent regression the planner cannot undo. Three independent
-- measurements also disagreed on its buffer count, so the gain was never
-- established. Its real cost is `idle_business_seconds()` per row plus a
-- SubPlan over `messages`, neither of which this touches.
--
-- Safety of the cast: it relies on `conversations_lead_id_is_uuid` (CHECK,
-- validated, zero violations, added with migration 20260811150000). DO NOT drop
-- that constraint without first reverting these three functions — without it a
-- malformed lead_id stops returning zero rows and starts raising 22P02, which
-- PostgREST surfaces as HTTP 500.
--
-- Equivalence was verified by exhaustive comparison rather than assumed:
-- conversation_contacts returned 0 divergences across all 4.510 conversations
-- (match, name, temperature, ref_id; the LEFT JOIN still yields NULL for
-- conversations with no lead), and the two lead RPCs returned 3.898 = 3.898
-- rows with EXCEPT empty in both directions.
--
-- `create or replace` throughout: no signature change, no return-type change,
-- no DROP. That keeps the ACL (postgres/authenticated/service_role) and every
-- dependency intact — a drop+create would silently lose the service_role grant.

begin;

-- A definition swap only needs a brief lock; fail fast rather than queue behind
-- a long reader and stall the Inbox.
set local lock_timeout = '3s';

create or replace function public.conversation_contacts(p_ids uuid[])
 returns table(conversation_id uuid, ref_id text, is_lead boolean, name text, phone text, avatar_url text, temperature text)
 language sql
 stable security definer
 set search_path to ''
as $function$
  select
    c.id as conversation_id,
    coalesce(cu.id::text, l.id::text) as ref_id,
    (cu.id is null and l.id is not null) as is_lead,
    coalesce(
      case when cu.type = 'B2B'
        then coalesce(nullif(cu.nome_fantasia, ''), nullif(cu.razao_social, ''), cu.full_name)
        else cu.full_name end,
      l.name
    ) as name,
    coalesce(cu.phone, l.phone) as phone,
    coalesce(cu.avatar_url, l.avatar_url) as avatar_url,
    l.temperature::text as temperature
  from public.conversations c
  left join public.customers cu on cu.id = c.customer_id
  -- was: l.id::text = c.lead_id
  left join public.leads l on l.id = c.lead_id::uuid
  where c.id = any (p_ids)
    and public.can_access_conversation(c.id);
$function$;

create or replace function public.lead_via_conversation(conv uuid)
 returns setof public.leads
 language sql
 stable security definer
 set search_path to ''
as $function$
  select l.*
  from public.conversations c
  -- was: l.id::text = c.lead_id
  join public.leads l on l.id = c.lead_id::uuid
  where c.id = conv
    and public.can_access_conversation(conv);
$function$;

create or replace function public.lead_funnel_entries_via_conversation(p_conversation_id uuid)
 returns setof public.lead_funnel_entries
 language sql
 stable security definer
 set search_path to ''
as $function$
  select e.*
    from public.conversations c
    -- was: l.id::text = c.lead_id
    join public.leads l on l.id = c.lead_id::uuid
    join public.lead_funnel_entries e on e.lead_id = l.id
   where c.id = p_conversation_id
     and public.can_access_conversation(p_conversation_id);
$function$;

commit;
