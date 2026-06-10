-- Lets staff (owner/manager) read all profiles in their store, so the Usuários
-- screen can show which sellers already have platform access. Reads role/store
-- DIRECTLY from the JWT app_metadata (NOT via is_staff(), which queries profiles
-- and would cause infinite RLS recursion on this very table). Additive to
-- profiles_select_self / profiles_select_auth_admin.
create policy profiles_select_staff on public.profiles
  for select to authenticated
  using (
    coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('owner','manager')
    and (auth.jwt() -> 'app_metadata' ->> 'store_id')::uuid = store_id
  );
