-- Fix: integration_secret_set failed on the UPDATE path when changing the
-- description — it ran a direct `update vault.secrets ...`, which requires a
-- table grant the function owner does not have (42501 via the MCP/postgres
-- path). Use the official vault.update_secret() API instead, which accepts
-- the new value, name and description and preserves fields passed as null.

create or replace function public.integration_secret_set(
  p_name text,
  p_value text,
  p_description text default null
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_name is null or p_name !~ '^[A-Z][A-Z0-9_]{2,64}$' then
    raise exception 'invalid secret name';
  end if;
  if p_value is null or length(p_value) = 0 or length(p_value) > 8192 then
    raise exception 'invalid secret value';
  end if;

  select id into v_id from vault.secrets where name = p_name;
  if v_id is null then
    perform vault.create_secret(p_value, p_name, coalesce(p_description, ''));
  else
    perform vault.update_secret(v_id, p_value, p_name, p_description);
  end if;
end;
$$;
