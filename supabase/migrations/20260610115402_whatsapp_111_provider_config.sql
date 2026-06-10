-- PRD-111 — WhatsApp provider interface: non-secret per-account engine config.
--
-- The PRD models a `provider_credentials` jsonb holding vault refs. The house
-- pattern keeps SECRETS out of the database entirely (they live as Edge
-- Function secrets, like RESEND_API_KEY), so this column carries only the
-- NON-SECRET engine configuration and the existing `credentials_ref` column
-- names the function secret that completes it:
--   meta:      { "phoneNumberId": "...", "businessAccountId": "..." }
--   evolution: { "baseUrl": "https://...", "instanceName": "..." }
alter table public.whatsapp_accounts
  add column provider_config jsonb;

comment on column public.whatsapp_accounts.provider_config is
  'Non-secret engine config (PRD-111). meta: phoneNumberId/businessAccountId; evolution: baseUrl/instanceName. Secrets live in Edge Function secrets, named by credentials_ref.';

-- Shape guard (PRD-111 RF-032): null while unconfigured; when present, the
-- minimum keys of the account''s engine must exist.
alter table public.whatsapp_accounts
  add constraint whatsapp_accounts_provider_config_shape check (
    provider_config is null
    or (
      provider = 'meta'
      and provider_config ? 'phoneNumberId'
      and provider_config ? 'businessAccountId'
    )
    or (
      provider = 'evolution'
      and provider_config ? 'baseUrl'
      and provider_config ? 'instanceName'
    )
  );
