-- PRD-107 (Fase 1): identity helpers now read from JWT app_metadata claims,
-- falling back to the profiles subquery (PRD-103 MVP) when the claim is absent.
-- This makes the subquery->JWT cutover regression-safe: stale tokens / a not-yet-
-- enabled hook keep working via the fallback, while tokens carrying claims skip
-- the subquery. Policies are unchanged; only the helper bodies change.
-- All identifiers are schema-qualified because of `set search_path = ''`.

create or replace function public.current_store_id()
returns uuid
language sql
stable
set search_path = ''
as $function$
  select coalesce(
    nullif(auth.jwt() -> 'app_metadata' ->> 'store_id', '')::uuid,
    (select store_id from public.profiles where auth_user_id = (select auth.uid()) limit 1)
  );
$function$;

create or replace function public.current_seller_id()
returns uuid
language sql
stable
set search_path = ''
as $function$
  select coalesce(
    nullif(auth.jwt() -> 'app_metadata' ->> 'seller_id', '')::uuid,
    (select seller_id from public.profiles where auth_user_id = (select auth.uid()) limit 1)
  );
$function$;

create or replace function public.current_app_role()
returns text
language sql
stable
set search_path = ''
as $function$
  select coalesce(
    nullif(auth.jwt() -> 'app_metadata' ->> 'role', ''),
    (select role from public.profiles where auth_user_id = (select auth.uid()) limit 1)
  );
$function$;

create or replace function public.is_staff()
returns boolean
language sql
stable
set search_path = ''
as $function$
  select coalesce(public.current_app_role() in ('owner','manager'), false);
$function$;
