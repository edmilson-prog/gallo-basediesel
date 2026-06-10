-- PRD-108 perf — collapse the two permissive authenticated SELECT policies on
-- profiles into one, and wrap auth.uid()/auth.jwt() in (select ...) so they are
-- evaluated once (InitPlan) instead of per row. Semantically identical: permissive
-- policies are OR'd, and (select fn()) only changes the evaluation strategy.
-- Reads JWT claims directly (no is_staff()/current_*()) to avoid recursion on profiles.
-- The supabase_auth_admin policy (used by the access-token hook) is left untouched.

drop policy if exists profiles_select_self on public.profiles;
drop policy if exists profiles_select_staff on public.profiles;

create policy profiles_select_self_or_staff on public.profiles
  for select to authenticated
  using (
    auth_user_id = (select auth.uid())
    or (
      coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'role'), '') in ('owner', 'manager')
      and (((select auth.jwt()) -> 'app_metadata' ->> 'store_id'))::uuid = store_id
    )
  );
