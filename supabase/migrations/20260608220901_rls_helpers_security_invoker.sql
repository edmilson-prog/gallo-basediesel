-- Switch identity helpers from SECURITY DEFINER to SECURITY INVOKER. They only
-- read the caller's own profile row, which profiles_select_self already permits
-- (auth_user_id = auth.uid()), so DEFINER was unnecessary and the linter flagged
-- the RPC exposure. INVOKER removes that surface. No recursion: profiles' own
-- policies do not reference these helpers. Also restrict EXECUTE to authenticated
-- (policies are authenticated-only; anon never needs them).

create or replace function public.current_store_id()
returns uuid language sql stable security invoker set search_path = '' as $$
  select store_id from public.profiles where auth_user_id = (select auth.uid()) limit 1;
$$;

create or replace function public.current_seller_id()
returns uuid language sql stable security invoker set search_path = '' as $$
  select seller_id from public.profiles where auth_user_id = (select auth.uid()) limit 1;
$$;

create or replace function public.current_app_role()
returns text language sql stable security invoker set search_path = '' as $$
  select role from public.profiles where auth_user_id = (select auth.uid()) limit 1;
$$;

create or replace function public.is_staff()
returns boolean language sql stable security invoker set search_path = '' as $$
  select coalesce(
    (select role in ('owner','manager') from public.profiles
     where auth_user_id = (select auth.uid()) limit 1),
    false);
$$;

revoke execute on function
  public.current_store_id(),
  public.current_seller_id(),
  public.current_app_role(),
  public.is_staff()
from public, anon;

grant execute on function
  public.current_store_id(),
  public.current_seller_id(),
  public.current_app_role(),
  public.is_staff()
to authenticated;
