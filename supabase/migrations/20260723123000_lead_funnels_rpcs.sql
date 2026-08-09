-- Aggregates and gated reads for the multi-funnel board.
-- Counting in the browser is what makes the current leads list fetch 1000 rows
-- and filter client-side; these keep it on the server.

-- Funnels the caller can open. Mirrors resolveAccessibleFunnels exactly:
-- staff sees all; the default funnel and open-to-store funnels are always in.
create or replace function public.accessible_lead_funnel_ids(p_store_id uuid)
returns table (funnel_id uuid)
language sql
stable
security invoker
set search_path = ''
as $$
  select f.id
    from public.lead_funnels f
   where f.store_id = p_store_id
     and f.archived_at is null
     and (
       (select public.is_staff())
       or f.is_default
       or f.open_to_store
       or exists (
         select 1 from public.lead_funnel_access a
          where a.funnel_id = f.id
            and a.seller_id = (select public.current_seller_id())
       )
     )
   order by f.position;
$$;

-- Distinct leads per funnel. Never sum these across funnels: a lead in three
-- funnels appears in three rows by design.
create or replace function public.count_leads_by_funnel(p_store_id uuid)
returns table (funnel_id uuid, lead_count bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select e.funnel_id, count(distinct e.lead_id)
    from public.lead_funnel_entries e
   where e.store_id = p_store_id
   group by e.funnel_id;
$$;

-- Column header aggregate. sum_value adds the MEMBERSHIP value, so the same
-- opportunity is not counted in full inside every funnel it touches. LEFT JOINs
-- keep every stage in the result even with zero entries, so the board renders
-- an empty column instead of dropping it.
create or replace function public.lead_funnel_board_summary(p_funnel_id uuid)
returns table (stage_id uuid, lead_count bigint, sum_value numeric, overdue_count bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    s.id,
    count(e.id),
    coalesce(sum(e.estimated_value), 0),
    count(e.id) filter (where l.next_action_at is not null and l.next_action_at < now())
  from public.lead_funnel_stages s
  left join public.lead_funnel_entries e on e.stage_id = s.id
  left join public.leads l on l.id = e.lead_id
  where s.funnel_id = p_funnel_id
  group by s.id, s.position
  order by s.position;
$$;

-- Memberships of the lead anchored to a conversation, gated ONCE by the
-- conversation instead of the per-owner entries RLS — so a pool attendant can
-- open the fiche without owning the lead. Mirrors lead_via_conversation
-- (20260720142051, "2 portoes" model): conversations.lead_id is TEXT, so the
-- join casts l.id::text = c.lead_id rather than casting a possibly malformed
-- text value to uuid (which would raise instead of yielding zero rows).
-- leads.conversations (a legacy text[] column, unused anywhere else in the
-- schema) is deliberately NOT the join key — conversations.lead_id is the
-- linkage the rest of the codebase already relies on.
create or replace function public.lead_funnel_entries_via_conversation(p_conversation_id uuid)
returns setof public.lead_funnel_entries
language sql
stable
security definer
set search_path = ''
as $$
  select e.*
    from public.conversations c
    join public.leads l on l.id::text = c.lead_id
    join public.lead_funnel_entries e on e.lead_id = l.id
   where c.id = p_conversation_id
     and public.can_access_conversation(p_conversation_id);
$$;

revoke all on function public.lead_funnel_entries_via_conversation(uuid) from public, anon;
grant execute on function public.lead_funnel_entries_via_conversation(uuid) to authenticated;
