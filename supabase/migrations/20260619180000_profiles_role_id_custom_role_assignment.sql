-- Custom role assignment (Problema B): link a user's profile to a specific role
-- (system or custom) without weakening RLS.
--
-- `profiles.role` stays the *base role* (one of the 8 base values), so every RLS
-- predicate (is_staff / current_app_role) keeps working unchanged. The new
-- `profiles.role_id` points at the *effective* role the UI resolves permissions
-- from. NULL = the user runs purely on its base role (today's behavior). System
-- roles also store NULL (the base role already resolves them); only custom roles
-- pin a role_id. ON DELETE SET NULL makes deleting an in-use role non-destructive
-- (affected users fall back to their base role).

alter table public.profiles
  add column if not exists role_id text
    references public.roles (id) on delete set null;

comment on column public.profiles.role_id is
  'Effective RBAC role (system or custom). NULL = base role only. RLS power is still governed by profiles.role (base_role); role_id only drives UI permission resolution.';

create index if not exists profiles_role_id_idx on public.profiles (role_id);

-- The Users screen (staff-only) needs the current effective role to pre-select
-- the dialog. Adding an OUT column changes the return type, so drop + recreate.
drop function if exists public.seller_access_info();

create function public.seller_access_info()
  returns table (
    seller_id uuid,
    role text,
    role_id text,
    last_sign_in_at timestamptz
  )
  language sql
  stable
  security definer
  set search_path to 'public'
as $$
  select p.seller_id, p.role, p.role_id, u.last_sign_in_at
  from public.profiles p
  join auth.users u on u.id = p.auth_user_id
  where p.store_id = public.current_store_id()
    and p.seller_id is not null
    and public.is_staff();
$$;

-- Recreate drops the original grants; restore the locked-down posture (the
-- bare CREATE would otherwise leave EXECUTE granted to PUBLIC).
revoke execute on function public.seller_access_info() from public, anon;
grant execute on function public.seller_access_info() to authenticated;

-- Real usage count for the role editor's delete guard (PRD-211 T15/T16). Counts
-- users in the caller's store assigned to a custom role; staff-only and NULL-safe
-- (non-staff/unknown role => 0). The editor is Owner-gated, so 0 for non-staff is
-- harmless; deletion also cascades role_permissions and SET NULLs profiles.role_id.
create or replace function public.role_assignment_count(p_role_id text)
  returns integer
  language sql
  stable
  security definer
  set search_path to 'public'
as $$
  select case
    when public.is_staff() then (
      select count(*)::int
      from public.profiles p
      where p.role_id = p_role_id
        and p.store_id = public.current_store_id()
    )
    else 0
  end;
$$;

revoke execute on function public.role_assignment_count(text) from public, anon;
grant execute on function public.role_assignment_count(text) to authenticated;
