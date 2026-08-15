-- Two gaps left by the backfill (20260723122000), which only ran ONCE over the
-- leads that existed at that moment:
--   1. No trigger gave a NEWLY created lead a membership, so every lead created
--      after the backfill violated the "at least one membership" invariant that
--      planRemoveFromFunnel (src/features/funnels/engine/membershipRules.ts)
--      exists to protect.
--   2. Re-running the backfill cannot repair that gap: it `continue`s past any
--      store that already has a default funnel, so it never revisits leads
--      created since, and its final assertion would raise on them anyway.
--
-- This migration closes both, and is safe to apply whether the backfill ran
-- seconds ago or long ago: the trigger only affects leads inserted AFTER this
-- migration runs, and the repair pass below only touches leads that currently
-- have zero memberships (none, if the backfill+trigger already cover them).

-- ---------- 1. trigger: give every new lead a membership on insert ----------
-- security definer + pinned search_path, matching the sibling functions in
-- 20260723121000 (derive_lead_funnel_entry_owner / sync_lead_funnel_entries_owner).
create or replace function public.assign_lead_default_funnel_membership()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  target_funnel uuid;
  target_stage  uuid;
begin
  select id into target_funnel
    from public.lead_funnels
   where store_id = new.store_id and is_default and archived_at is null
   limit 1;

  -- A store provisioned before this model existed (or mid-setup) may not have
  -- a default funnel yet. Lead creation must never fail because of that — the
  -- repair pass below (and any later manual fix) can catch this lead up once
  -- the store has one.
  if target_funnel is null then
    return new;
  end if;

  select id into target_stage
    from public.lead_funnel_stages
   where funnel_id = target_funnel and kind = 'entrada'
   limit 1;

  -- Same defensive no-op: a default funnel should always have an entrada stage
  -- (assert_funnel_has_terminal_stages enforces it deferred), but a trigger on
  -- lead creation is the wrong place to ever block a lead from being created.
  if target_stage is null then
    return new;
  end if;

  -- store_id is set from the lead directly (new.store_id) rather than via the
  -- app's UUID-zero placeholder: in SQL we already have the real value at
  -- hand, so there is no reason to lean on the before-insert trigger to
  -- replace a placeholder. lead_funnel_entries_derive_owner still fires (it is
  -- unconditional) and re-derives store_id/seller_id/estimated_value from the
  -- lead row — which by now holds identical values — so this is redundant but
  -- harmless, and estimated_value is still correctly inherited from the lead.
  insert into public.lead_funnel_entries (lead_id, funnel_id, stage_id, store_id)
  values (new.id, target_funnel, target_stage, new.store_id)
  on conflict (lead_id, funnel_id) do nothing;

  return new;
end $$;

drop trigger if exists leads_assign_default_funnel_membership on public.leads;
create trigger leads_assign_default_funnel_membership
  after insert on public.leads
  for each row execute function public.assign_lead_default_funnel_membership();

-- ---------- 2. repair pass: catch up leads with zero memberships ----------
-- Idempotent: on a database where the backfill already ran and the trigger
-- above already covers every lead created since, this affects zero rows.
do $$
declare
  repaired_count int;
begin
  insert into public.lead_funnel_entries (lead_id, funnel_id, stage_id, store_id)
  select l.id, f.id, s.id, l.store_id
    from public.leads l
    join public.lead_funnels f
      on f.store_id = l.store_id and f.is_default and f.archived_at is null
    join public.lead_funnel_stages s
      on s.funnel_id = f.id and s.kind = 'entrada'
   where not exists (
     select 1 from public.lead_funnel_entries e where e.lead_id = l.id
   )
  on conflict (lead_id, funnel_id) do nothing;

  get diagnostics repaired_count = row_count;
  raise notice 'lead_default_membership repair pass: % lead(s) given a membership', repaired_count;
end $$;
