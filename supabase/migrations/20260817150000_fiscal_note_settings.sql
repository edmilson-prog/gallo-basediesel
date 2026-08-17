-- PRD-216 (Tally) — configuração das origens de ingestão de XML.
--
-- Uma linha por loja. NADA acontece ao aplicar: upload nasce ligado (é a
-- origem que funciona sem infraestrutura), upload_edge desligado, e e-mail e
-- SEFAZ desligados porque dependem de material que o projeto não tem —
-- credencial de caixa e certificado digital A1, ambos no Vault.
--
-- Espelha o formato de nps_settings: staff da loja lê, apenas o Owner escreve.

create table public.fiscal_note_settings (
  store_id             uuid primary key references public.stores(id),
  upload_enabled       boolean not null default true,
  upload_edge_enabled  boolean not null default false,
  email_enabled        boolean not null default false,
  sefaz_enabled        boolean not null default false,
  -- Caixa monitorada, quando a origem de e-mail for ligada.
  inbox_address        text,
  updated_at           timestamptz not null default now(),
  updated_by           uuid references public.sellers(id)
);

comment on table public.fiscal_note_settings is
  'PRD-216: switches das quatro origens de XML. email e sefaz nascem false — faltam credencial e certificado A1 no Vault.';
comment on column public.fiscal_note_settings.upload_enabled is
  'Origem 1: upload com parse no cliente. Única que funciona sem infraestrutura, por isso nasce ligada.';

alter table public.fiscal_note_settings enable row level security;

create policy fiscal_note_settings_select on public.fiscal_note_settings for select to authenticated
using (
  store_id = (select public.current_store_id())
  and (select public.is_staff())
);

create policy fiscal_note_settings_owner_write on public.fiscal_note_settings for all to authenticated
using ((select public.current_app_role()) = 'owner')
with check ((select public.current_app_role()) = 'owner');
