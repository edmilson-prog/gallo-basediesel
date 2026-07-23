-- AI budget check (spec 2026-07-22, A6; revised 2026-07-22 for per-store scoping).
--
-- The previous check summed `ai_usage_events` in the Edge Function and compared
-- in JavaScript, across two round-trips. With a human pressing a button that
-- never failed; with the automatic analysis of sub-project B, concurrent calls
-- could read the same stale total and all pass the cap together.
--
-- This takes a transaction-level advisory lock keyed on the current month, so
-- concurrent CHECKS serialise. That is all it guarantees.
--
-- HONEST FRAMING — this is a BEST-EFFORT monthly ceiling, not a hard atomic
-- cap. The spend itself (the `ai_usage_events` INSERT) is only recorded after
-- the LLM call completes, several seconds later and OUTSIDE this function's
-- transaction. The advisory lock only serialises the CHECK, not the spend, so
-- two (or more) requests can each pass the gate while the other is still
-- in-flight — jointly overspending the cap by up to the sum of their
-- in-flight costs before the next check catches it. Sub-project A accepts
-- this: the copilot is a manual button pressed by a human, not automatic
-- dispatch, so the blast radius of a brief overspend is small. True atomic
-- reservation (reserve an estimated amount inside this same lock, then
-- settle it to the actual cost after the call) is deferred to sub-project B,
-- which introduces the automatic dispatch that actually needs that guarantee.
-- The lock stays in place as-is — it is harmless and is the serialisation
-- point sub-project B will extend, not replace.
--
-- Returns TRUE when there is room under both the platform-wide cap and (for
-- the conversation_copilot feature) the store-scoped feature sub-cap.

create or replace function public.ai_budget_try_consume(
  p_feature text,
  p_estimated_brl numeric default 0,
  p_store_id text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_month_start timestamptz := date_trunc('month', now() at time zone 'utc');
  v_lock_key bigint := hashtext('ai_budget:' || to_char(v_month_start, 'YYYY-MM'));
  v_spent numeric;
  v_platform_cap numeric;
  v_feature_spent numeric;
  v_feature_cap numeric;
begin
  -- Serialise concurrent budget checks for the current month.
  perform pg_advisory_xact_lock(v_lock_key);

  -- Platform-wide cap: correctly global, checked against ALL ai_usage_events
  -- for the month regardless of store. Unchanged by the per-store scoping below.
  select coalesce((budget->>'monthlyCapBRL')::numeric, 0)
    into v_platform_cap
    from public.ai_settings
   where id = 1;

  select coalesce(sum(cost_brl), 0)
    into v_spent
    from public.ai_usage_events
   where ts >= v_month_start;

  if coalesce(v_platform_cap, 0) > 0
     and v_spent + coalesce(p_estimated_brl, 0) >= v_platform_cap then
    return false;
  end if;

  -- The assistant keeps its own sub-cap inside the platform-wide one, scoped
  -- to the single store that owns the conversation — a per-store setting,
  -- not a platform-wide max() across all stores. Skipped defensively when
  -- p_store_id is absent (never block on a missing store id).
  if p_feature = 'conversation_copilot' and p_store_id is not null then
    select (settings->'copilotAssistant'->>'monthlyCapBRL')::numeric
      into v_feature_cap
      from public.stores
     where id = p_store_id;

    if coalesce(v_feature_cap, 0) > 0 then
      select coalesce(sum(cost_brl), 0)
        into v_feature_spent
        from public.ai_usage_events
       where ts >= v_month_start
         and feature = p_feature
         and store_id = p_store_id;

      if v_feature_spent + coalesce(p_estimated_brl, 0) >= v_feature_cap then
        return false;
      end if;
    end if;
  end if;

  return true;
end;
$$;

revoke all on function public.ai_budget_try_consume(text, numeric, text) from public;
revoke all on function public.ai_budget_try_consume(text, numeric, text) from anon, authenticated;
grant execute on function public.ai_budget_try_consume(text, numeric, text) to service_role;

comment on function public.ai_budget_try_consume(text, numeric, text) is
  'Best-effort monthly AI budget gate: global platform cap + per-store conversation_copilot sub-cap (spec 2026-07-22). service_role only — called from Edge Functions. Serialises the CHECK via an advisory lock; does not atomically reserve the spend (see header comment) — true reservation deferred to sub-project B.';
