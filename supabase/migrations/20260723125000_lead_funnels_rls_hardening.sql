-- Hardens two live RLS gaps in the multi-funnel model, plus recreates the
-- overdue predicate in lead_funnel_board_summary to agree with the client on
-- what "overdue" means. All three items are safe to apply on top of
-- 20260723120000..20260723124000 (already applied): every object touched
-- here already exists, and every recreate is idempotent (drop-if-exists /
-- create-or-replace) so this migration can be re-run.

-- =============================================================================
-- 1. lead_id (and funnel_id) must be immutable on lead_funnel_entries UPDATE.
-- =============================================================================
-- lead_funnel_entries_update (20260723121000) re-validates only store_id and
-- seller_id. Unlike INSERT, there is no BEFORE UPDATE trigger re-deriving
-- those from the lead, so lead_id itself is freely mutable: a seller can
-- PATCH their own membership's lead_id onto a colleague's lead. store_id and
-- seller_id stay unchanged (still the seller's own), so the with check keeps
-- passing, and the row gets repointed — the seller's own lead is left with
-- zero memberships (breaking the "every lead has >=1 membership" invariant
-- planRemoveFromFunnel relies on) while the victim's lead gains a membership
-- whose owner is wrong, corrupting staff's forecast. A unique index
-- accidentally hid this while every store had exactly one funnel (every lead
-- already held a membership in it); the hole opens the moment a store gets a
-- second funnel.
--
-- funnel_id is made immutable too. Nothing in the app ever updates it: the
-- supabase provider's moveEntry(entryId, stageId) only patches stage_id, and
-- moving a lead INTO a new funnel always goes through addEntry (an INSERT of
-- a new row), never an UPDATE of an existing one (src/providers/data/impl/
-- supabase/leadFunnels.ts). Leaving funnel_id mutable would reopen the exact
-- same repointing hole one column over — a seller could patch funnel_id on
-- their own membership onto a foreign lead's funnel_id instead of lead_id
-- and land on the same outcome.
create or replace function public.guard_lead_funnel_entry_update()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  lead_store  uuid;
  lead_seller uuid;
begin
  if new.lead_id is distinct from old.lead_id then
    raise exception 'lead_funnel_entries.lead_id is immutable; delete and re-insert to move a membership to another lead';
  end if;

  if new.funnel_id is distinct from old.funnel_id then
    raise exception 'lead_funnel_entries.funnel_id is immutable; delete and re-insert to move a membership to another funnel';
  end if;

  -- Symmetry with derive_lead_funnel_entry_owner (20260723121000): re-derive
  -- store_id/seller_id from the (unchanged) lead on every UPDATE too, so
  -- neither can be forged via UPDATE either. Redundant on the common path
  -- (moveEntry/updateEntry never touch these columns) but harmless — matches
  -- the style already established for the INSERT-time trigger.
  select l.store_id, l.seller_id into lead_store, lead_seller
    from public.leads l where l.id = new.lead_id;

  if lead_store is null then
    raise exception 'lead % not found', new.lead_id;
  end if;

  new.store_id  := lead_store;
  new.seller_id := lead_seller;
  return new;
end $$;

drop trigger if exists lead_funnel_entries_guard_update on public.lead_funnel_entries;
create trigger lead_funnel_entries_guard_update
  before update on public.lead_funnel_entries
  for each row execute function public.guard_lead_funnel_entry_update();

-- =============================================================================
-- 2. lead_funnel_access_select has no store scoping.
-- =============================================================================
-- It currently reads `using (seller_id = current_seller_id() or is_staff())`.
-- public.is_staff() is a pure role check (role in ('owner','manager') from
-- profiles) with no store dimension, so any Owner/Gestor — of ANY store —
-- reads every store's funnel-access grants. Its sibling lead_funnel_access_
-- write already scopes to the funnel's store via an exists(...) against
-- lead_funnels, as do lead_funnels_select, lead_funnel_stages_select and
-- lead_funnel_entries_select. Recreate to match, mirroring
-- lead_funnel_access_write's exists(...) idiom exactly.
drop policy if exists lead_funnel_access_select on public.lead_funnel_access;
create policy lead_funnel_access_select on public.lead_funnel_access
  for select to authenticated
  using (
    seller_id = (select public.current_seller_id())
    or (
      (select public.is_staff())
      and exists (
        select 1 from public.lead_funnels f
         where f.id = funnel_id and f.store_id = (select public.current_store_id())
      )
    )
  );

-- =============================================================================
-- 3. lead_funnel_board_summary: overdue must be day-granular in São Paulo,
--    not a raw instant comparison.
-- =============================================================================
-- next_action_at is stored as UTC midnight of a date-only picker value, so
-- its UTC date part IS the intended due date. "Overdue" means: the due DATE
-- is before TODAY's date in São Paulo. Brazil has had no DST since 2019, and
-- this project already standardises on a fixed -03:00 offset (see
-- src/features/access/engine/workSchedule.ts) — so today's date in São Paulo
-- is computed by subtracting a flat 3 hours from UTC "now" and taking its
-- date, WITHOUT ever shifting next_action_at itself to São Paulo first (doing
-- that would shift the due date back a day). Signature, argument name and
-- returned column names are kept byte-identical — a live provider
-- (leadFunnels.ts getBoardSummary) calls this RPC by those exact names.
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
    count(e.id) filter (
      where l.next_action_at is not null
        and (l.next_action_at at time zone 'UTC')::date
            < ((now() at time zone 'UTC') - interval '3 hours')::date
    )
  from public.lead_funnel_stages s
  left join public.lead_funnel_entries e on e.stage_id = s.id
  left join public.leads l on l.id = e.lead_id
  where s.funnel_id = p_funnel_id
  group by s.id, s.position
  order by s.position;
$$;
