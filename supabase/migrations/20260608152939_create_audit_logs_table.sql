-- PRD-006/110+ — append-only audit trail (IAuditLog). Immutable: no updated_at.
create table if not exists public.audit_logs (
  id text primary key,
  store_id text not null references public.stores (id),
  actor_id text not null references public.sellers (id),
  action text not null,
  resource text not null,
  resource_id text not null,
  before jsonb,
  after jsonb,
  "timestamp" timestamptz not null default now()
);

create index if not exists audit_logs_store_id_idx on public.audit_logs (store_id);
create index if not exists audit_logs_actor_id_idx on public.audit_logs (actor_id);
create index if not exists audit_logs_resource_idx on public.audit_logs (resource);
create index if not exists audit_logs_resource_id_idx on public.audit_logs (resource_id);
create index if not exists audit_logs_action_idx on public.audit_logs (action);
create index if not exists audit_logs_timestamp_idx on public.audit_logs ("timestamp" desc);

alter table public.audit_logs enable row level security;
drop policy if exists "audit_logs_select_poc_temp" on public.audit_logs;
create policy "audit_logs_select_poc_temp" on public.audit_logs for select to anon, authenticated using (true);
