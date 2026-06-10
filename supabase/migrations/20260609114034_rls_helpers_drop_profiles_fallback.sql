-- ============================================================================
-- PRD-108: drop the profiles fallback from RLS identity helpers.
-- The Custom Access Token Hook is now universal, so app_metadata is always
-- present in the JWT for signed-in users. The coalesce(..., profiles subquery)
-- is dead at runtime (short-circuits) and only masked a missing hook. Read the
-- JWT claim as the single source of truth -> fail-closed if app_metadata absent.
-- is_staff() is unchanged (it just calls current_app_role()).
-- All stay: language sql, stable, security invoker, set search_path = ''.
-- ============================================================================

create or replace function public.current_app_role()
returns text
language sql
stable
set search_path = ''
as $$
  select nullif(auth.jwt() -> 'app_metadata' ->> 'role', '');
$$;

create or replace function public.current_store_id()
returns uuid
language sql
stable
set search_path = ''
as $$
  select nullif(auth.jwt() -> 'app_metadata' ->> 'store_id', '')::uuid;
$$;

create or replace function public.current_seller_id()
returns uuid
language sql
stable
set search_path = ''
as $$
  select nullif(auth.jwt() -> 'app_metadata' ->> 'seller_id', '')::uuid;
$$;
