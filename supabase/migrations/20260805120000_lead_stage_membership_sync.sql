-- Keep the default-funnel membership in step with leads.stage.
--
-- Phase 4 replaces the board columns with the funnel's own stages. From that
-- moment a lead moved on the kanban would leave leads.stage and
-- lead_funnel_entries.stage_id disagreeing, with nothing to notice it. This
-- closes the gap while the phase-3 context is fresh, rather than discovering
-- it as drifted production data later.
--
-- ONLY the default funnel is synced. Moving a lead in one funnel must not
-- touch its position in the others — that is the entire point of the N:N
-- model (owner decision 1). Outcome and estimated value are never synced:
-- they belong to the membership (owner decisions 5 and 6), and copying the
-- lead's single value into every funnel is exactly the double-counting the
-- model exists to prevent.
--
-- Best-effort by design. A stage name matching nothing leaves the membership
-- where it is instead of raising; trading a silent divergence for a blocked
-- screen is not an improvement.

create or replace function public.sync_default_funnel_membership_stage()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_funnel uuid;
  v_stage  uuid;
begin
  if new.stage->>'name' is distinct from old.stage->>'name' then
    select f.id into v_funnel
      from public.lead_funnels f
     where f.store_id = new.store_id
       and f.is_default
       and f.archived_at is null
     limit 1;

    if v_funnel is null then
      return new;
    end if;

    -- Same matching rule as the backfill (20260723122000): truncated to 24
    -- chars, case-insensitive, and never resolving onto a terminal stage.
    -- Diverging from it would make the sync disagree with the migration that
    -- created the very rows it is updating.
    select s.id into v_stage
      from public.lead_funnel_stages s
     where s.funnel_id = v_funnel
       and lower(s.name) = lower(left(new.stage->>'name', 24))
       and s.kind not in ('ganho','perda')
     limit 1;

    if v_stage is null then
      return new;  -- unmatched name: leave the membership alone
    end if;

    -- `stage_id is distinct from` guards entered_stage_at: without it any
    -- unrelated edit to the lead would reset the per-funnel "days in stage"
    -- clock that ILeadFunnelEntry exists to keep honest.
    update public.lead_funnel_entries e
       set stage_id = v_stage,
           entered_stage_at = now(),
           updated_at = now()
     where e.lead_id = new.id
       and e.funnel_id = v_funnel
       and e.stage_id is distinct from v_stage;
  end if;

  return new;
end;
$$;

comment on function public.sync_default_funnel_membership_stage() is
  'Mirrors leads.stage onto the default funnel membership. Best-effort: an '
  'unmatched stage name is a no-op, never an exception.';

drop trigger if exists leads_sync_default_funnel_stage on public.leads;
create trigger leads_sync_default_funnel_stage
  after update of stage on public.leads
  for each row
  execute function public.sync_default_funnel_membership_stage();
