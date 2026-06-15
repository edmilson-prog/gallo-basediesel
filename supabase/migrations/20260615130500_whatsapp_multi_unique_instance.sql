-- Multi-instância — resolução determinística: cada instanceName (evolution) e cada
-- phoneNumberId (meta) identifica NO MÁXIMO uma conta. O webhook resolve por esses
-- valores; sem unicidade, multi-instância colidiria silenciosamente.
create unique index if not exists whatsapp_accounts_evolution_instance_uq
  on public.whatsapp_accounts ((provider_config ->> 'instanceName'))
  where provider = 'evolution' and provider_config ? 'instanceName';

create unique index if not exists whatsapp_accounts_meta_phone_number_id_uq
  on public.whatsapp_accounts ((provider_config ->> 'phoneNumberId'))
  where provider = 'meta' and provider_config ? 'phoneNumberId';
