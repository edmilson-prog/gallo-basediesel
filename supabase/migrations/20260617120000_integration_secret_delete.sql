-- Delete an integration secret by name — feature "Integrações & Chaves".
--
-- Companion to integration_secret_set/get (20260610190000). Needed so the
-- Melhor Envio OAuth disconnect can actually remove the auto-managed token
-- triple (ACCESS_TOKEN/REFRESH_TOKEN/TOKEN_EXPIRES_AT) from the Vault —
-- integration_secret_set rejects empty values, so "blank it out" is not an
-- option. SECURITY DEFINER + service_role-only, matching the other wrappers.

create or replace function public.integration_secret_delete(p_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_name is null or p_name !~ '^[A-Z][A-Z0-9_]{2,64}$' then
    raise exception 'invalid secret name';
  end if;
  delete from vault.secrets where name = p_name;
end;
$$;

revoke all on function public.integration_secret_delete(text) from public, anon, authenticated;
grant execute on function public.integration_secret_delete(text) to service_role;
