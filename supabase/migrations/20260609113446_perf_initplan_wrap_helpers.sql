-- ============================================================================
-- Perf (PRD-108, Part C): wrap RLS helper calls in (select ...) so STABLE
-- functions evaluate ONCE per query (InitPlan) instead of once per row.
-- Semantics are identical (STABLE fn). Rewrites the 151 policies that call a
-- helper; leaves the rest (profiles auth.* policies, anon, reference) untouched.
-- Atomic: a single failure rolls the whole thing back.
-- ============================================================================
set search_path = public;

do $$
declare
  r record;
begin
  -- Snapshot the target policies BEFORE any DDL, so iteration is stable while
  -- we drop/recreate policies on the same catalog.
  create temp table _pol_rewrite on commit drop as
    select
      tablename, policyname, cmd, permissive, roles,
      case when qual is null then null else
        replace(replace(replace(replace(qual,
          'current_store_id()', '(select current_store_id())'),
          'current_seller_id()', '(select current_seller_id())'),
          'current_app_role()', '(select current_app_role())'),
          'is_staff()', '(select is_staff())') end as new_qual,
      case when with_check is null then null else
        replace(replace(replace(replace(with_check,
          'current_store_id()', '(select current_store_id())'),
          'current_seller_id()', '(select current_seller_id())'),
          'current_app_role()', '(select current_app_role())'),
          'is_staff()', '(select is_staff())') end as new_check
    from pg_policies
    where schemaname = 'public'
      and (coalesce(qual, '') || coalesce(with_check, ''))
          ~ '(current_store_id|current_seller_id|current_app_role|is_staff)\(\)';

  for r in select * from _pol_rewrite loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
    execute format(
      'create policy %I on public.%I as %s for %s to %s%s%s',
      r.policyname, r.tablename, r.permissive, r.cmd,
      array_to_string(r.roles, ', '),
      case when r.new_qual  is not null then ' using ('      || r.new_qual  || ')' else '' end,
      case when r.new_check is not null then ' with check (' || r.new_check || ')' else '' end
    );
  end loop;
end $$;
