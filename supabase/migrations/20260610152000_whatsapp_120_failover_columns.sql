-- PRD-120 — failover model on whatsapp_accounts (additive).
--
-- failover_account_id: backup account used for NEW outbound when the primary
-- is down/paused (history never migrates — Meta/Evolution are silos).
-- current_state is maintained by the health tick (pg_cron) and by manual
-- owner action; 'paused' is reserved for Meta account-paused (manual restore).

alter table public.whatsapp_accounts
  add column failover_account_id uuid references public.whatsapp_accounts(id) on delete set null,
  add column failover_policy text not null default 'disabled'
    check (failover_policy in ('disabled', 'manual', 'automatic')),
  add column current_state text not null default 'healthy'
    check (current_state in ('healthy', 'degraded', 'down', 'paused')),
  add column state_changed_at timestamptz,
  add column is_failover_active boolean not null default false;

-- RF-002: an account cannot fail over to itself.
alter table public.whatsapp_accounts
  add constraint whatsapp_accounts_failover_not_self
    check (failover_account_id is null or failover_account_id <> id);

-- RF-003: a non-disabled policy requires a configured backup account.
alter table public.whatsapp_accounts
  add constraint whatsapp_accounts_failover_policy_requires_target
    check (failover_policy = 'disabled' or failover_account_id is not null);

comment on column public.whatsapp_accounts.failover_account_id is
  'Backup account for NEW outbound while primary is down/paused (PRD-120). History never migrates.';
comment on column public.whatsapp_accounts.current_state is
  'Health state maintained by whatsapp_health_tick + manual owner action (PRD-120).';

create index idx_whatsapp_accounts_failover_account
  on public.whatsapp_accounts (failover_account_id)
  where failover_account_id is not null;
