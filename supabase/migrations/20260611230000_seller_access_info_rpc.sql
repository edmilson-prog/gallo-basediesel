-- Staff-scoped access info for the users screen: role + last login per seller.
-- SECURITY DEFINER so it can read auth.users.last_sign_in_at; scoped by the
-- same identity helpers as RLS (store + staff-only), like the PRD-108 MV RPCs.
create or replace function public.seller_access_info()
returns table (seller_id uuid, role text, last_sign_in_at timestamptz)
language sql stable security definer set search_path = public as $$
  select p.seller_id, p.role, u.last_sign_in_at
  from public.profiles p
  join auth.users u on u.id = p.auth_user_id
  where p.store_id = public.current_store_id()
    and p.seller_id is not null
    and public.is_staff();
$$;

revoke execute on function public.seller_access_info() from public, anon;
grant execute on function public.seller_access_info() to authenticated;
