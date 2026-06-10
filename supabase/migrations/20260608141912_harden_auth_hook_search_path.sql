-- Pin the hook's search_path (advisor: function_search_path_mutable). All
-- referenced objects are already schema-qualified (public.profiles); built-ins
-- resolve via pg_catalog regardless.
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  prof   record;
  claims jsonb;
begin
  select seller_id, store_id, role
    into prof
    from public.profiles
   where auth_user_id = (event ->> 'user_id')::uuid;

  claims := coalesce(event -> 'claims', '{}'::jsonb);

  if found then
    claims := jsonb_set(
      claims,
      '{app_metadata}',
      coalesce(claims -> 'app_metadata', '{}'::jsonb) || jsonb_build_object(
        'seller_id', prof.seller_id,
        'store_id', prof.store_id,
        'role', prof.role
      )
    );
  end if;

  return jsonb_set(event, '{claims}', claims);
end;
$$;
