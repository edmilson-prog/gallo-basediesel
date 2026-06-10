-- PRD-103 (adaptado: schema public + identidade via profiles, sem JWT claims).
-- Helpers que resolvem a identidade do chamador a partir da sua linha em
-- public.profiles (auth_user_id = auth.uid()). SECURITY DEFINER + search_path
-- vazio evitam recursão de RLS em profiles e são injection-safe; só retornam a
-- própria linha do usuário. (select auth.uid()) é o padrão de cache do planner.
-- Quando o PRD-107 (Custom Access Token Hook) for habilitado, basta trocar o
-- corpo destas funções para ler o JWT — as policies não mudam.

create or replace function public.current_store_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select store_id from public.profiles where auth_user_id = (select auth.uid()) limit 1;
$$;

create or replace function public.current_seller_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select seller_id from public.profiles where auth_user_id = (select auth.uid()) limit 1;
$$;

create or replace function public.current_app_role()
returns text language sql stable security definer set search_path = '' as $$
  select role from public.profiles where auth_user_id = (select auth.uid()) limit 1;
$$;

create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select role in ('owner','manager') from public.profiles
     where auth_user_id = (select auth.uid()) limit 1),
    false);
$$;

grant execute on function
  public.current_store_id(),
  public.current_seller_id(),
  public.current_app_role(),
  public.is_staff()
to authenticated, anon;
