-- Integration secrets in Supabase Vault — feature "Integrações & Chaves".
--
-- The platform manages third-party API keys (Resend, WhatsApp engines, future
-- fiscal providers) from an Owner-only screen instead of the Supabase
-- dashboard. Values live ENCRYPTED in `vault.secrets`; these SECURITY DEFINER
-- wrappers are the only door, and only `service_role` can open it (i.e. Edge
-- Functions). App roles — including owners — cannot read or write secrets via
-- PostgREST; everything goes through the audited `integration-secrets` Edge
-- Function, which never echoes a value back to the client.
--
-- Resolution order at runtime (see supabase/functions/_shared/secrets.ts):
-- Vault first, function env secret as fallback — platform rotation takes
-- effect without redeploys, and keys configured the old way keep working.

-- Upsert a secret by name. Names follow the env-style convention used by the
-- engines (e.g. WHATSAPP_META_MATRIZ_ACCESS_TOKEN, RESEND_API_KEY).
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
    perform vault.update_secret(v_id, p_value);
    if p_description is not null then
      update vault.secrets set description = p_description where id = v_id;
    end if;
  end if;
end;
$$;

-- Decrypted read for Edge Functions (service_role only). Returns null when
-- the secret does not exist — callers fall back to env secrets.
create or replace function public.integration_secret_get(p_name text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select decrypted_secret from vault.decrypted_secrets where name = p_name;
$$;

-- Status list for the management screen: never the value — only the name,
-- description, last update and a 4-char hint for recognition.
create or replace function public.integration_secrets_status()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'name', name,
        'description', description,
        'updatedAt', updated_at,
        'hint', right(decrypted_secret, 4)
      )
      order by name
    ),
    '[]'::jsonb
  )
  from vault.decrypted_secrets;
$$;

-- Locked down: only service_role may execute (Edge Functions). Not app roles.
revoke all on function public.integration_secret_set(text, text, text) from public, anon, authenticated;
revoke all on function public.integration_secret_get(text) from public, anon, authenticated;
revoke all on function public.integration_secrets_status() from public, anon, authenticated;
grant execute on function public.integration_secret_set(text, text, text) to service_role;
grant execute on function public.integration_secret_get(text) to service_role;
grant execute on function public.integration_secrets_status() to service_role;
