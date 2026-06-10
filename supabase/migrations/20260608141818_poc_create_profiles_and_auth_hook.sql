-- PRD-107 slice: real-auth profile mapping.
-- Maps a Supabase auth user to their app role/store/seller. The frontend
-- resolves this row right after login; later the access-token hook injects the
-- same data as JWT claims for RLS (PRD-103).

create table public.profiles (
  auth_user_id uuid primary key references auth.users (id) on delete cascade,
  seller_id    text,
  store_id     text not null references public.stores (id),
  role         text not null check (role in (
    'owner', 'manager', 'seller_internal', 'seller_external',
    'sdr', 'financeiro', 'b2b_customer', 'b2c_customer'
  )),
  display_name text not null,
  email        text,
  created_at   timestamptz not null default now()
);

comment on table public.profiles is
  'Maps auth.users to app role/store/seller (PRD-107). Source for JWT custom claims.';

-- RLS: a user may read ONLY their own profile.
alter table public.profiles enable row level security;

create policy "profiles_select_self"
  on public.profiles
  for select
  to authenticated
  using (auth_user_id = auth.uid());

-- Custom Access Token Hook (PRD-107): injects seller_id/store_id/role into the
-- JWT app_metadata on every token issue/refresh. Must be ENABLED in the
-- dashboard (Authentication > Hooks) to take effect; until then the frontend
-- resolves the profile via a table query, so this is prepared-but-optional.
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
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

-- Only the auth admin may execute the hook and read the table it depends on.
grant usage on schema public to supabase_auth_admin;
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook(jsonb) from authenticated, anon, public;
grant all on table public.profiles to supabase_auth_admin;

create policy "profiles_select_auth_admin"
  on public.profiles
  for select
  to supabase_auth_admin
  using (true);
