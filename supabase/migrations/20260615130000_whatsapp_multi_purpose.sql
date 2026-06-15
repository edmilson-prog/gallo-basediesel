-- Multi-instância — finalidade da instância (atendimento/campanha/ambos).
-- Default 'atendimento' cobre as contas existentes sem backfill manual.
alter table public.whatsapp_accounts
  add column if not exists purpose text not null default 'atendimento'
    check (purpose in ('atendimento','campanha','ambos'));

comment on column public.whatsapp_accounts.purpose is
  'Multi-instância: onde a instância aparece — atendimento (caixa), campanha (disparo) ou ambos.';
