-- AI budget check that survives concurrency (spec 2026-07-22, A6).
--
-- The previous check summed `ai_usage_events` in the Edge Function and compared
-- in JavaScript, across two round-trips. With a human pressing a button that
-- never failed; with the automatic analysis of sub-project B, concurrent calls
-- read the same stale total and all pass the cap together.
--
-- This takes a transaction-level advisory lock keyed on the current month, so
-- concurrent callers serialise on the check. Returns TRUE when there is room.

create or replace function public.ai_budget_try_consume(
  p_feature text,
  p_estimated_brl numeric default 0
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

  -- The assistant keeps its own sub-cap inside the platform-wide one.
  if p_feature = 'conversation_copilot' then
    select coalesce(
             max((settings->'copilotAssistant'->>'monthlyCapBRL')::numeric),
             0
           )
      into v_feature_cap
      from public.stores;

    if coalesce(v_feature_cap, 0) > 0 then
      select coalesce(sum(cost_brl), 0)
        into v_feature_spent
        from public.ai_usage_events
       where ts >= v_month_start
         and feature = p_feature;

      if v_feature_spent + coalesce(p_estimated_brl, 0) >= v_feature_cap then
        return false;
      end if;
    end if;
  end if;

  return true;
end;
$$;

revoke all on function public.ai_budget_try_consume(text, numeric) from public;
revoke all on function public.ai_budget_try_consume(text, numeric) from anon, authenticated;
grant execute on function public.ai_budget_try_consume(text, numeric) to service_role;

comment on function public.ai_budget_try_consume(text, numeric) is
  'Concurrency-safe AI budget gate (spec 2026-07-22). service_role only — called from Edge Functions.';
