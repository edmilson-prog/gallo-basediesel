-- Multi-instância — Camada 1: regras OU de acesso à instância.
-- kind='seller' (uuid do seller) | 'role' (claim cru, ex. 'seller_internal') | 'store' (uuid da loja).
-- 'department' será adicionado pós-PRD-211 (N:N), fora deste escopo.
create table if not exists public.whatsapp_account_access_rules (
  id uuid primary key default gen_random_uuid(),
  whatsapp_account_id uuid not null
    references public.whatsapp_accounts(id) on delete cascade,
  kind text not null check (kind in ('seller','role','store')),
  target_value text not null,
  created_at timestamptz not null default now(),
  unique (whatsapp_account_id, kind, target_value)
);

create index if not exists waar_account_idx
  on public.whatsapp_account_access_rules (whatsapp_account_id);

alter table public.whatsapp_account_access_rules enable row level security;

-- Staff (owner/manager) da loja da conta gerencia as regras. A leitura funcional
-- do pool passa pelo helper SECURITY DEFINER (migration de helpers), então a RLS
-- aqui é staff-only.
drop policy if exists waar_staff_all on public.whatsapp_account_access_rules;
create policy waar_staff_all on public.whatsapp_account_access_rules
  for all to authenticated
  using (
    exists (
      select 1 from public.whatsapp_accounts a
      where a.id = whatsapp_account_id
        and a.store_id = (select public.current_store_id())
        and (select public.is_staff())
    )
  )
  with check (
    exists (
      select 1 from public.whatsapp_accounts a
      where a.id = whatsapp_account_id
        and a.store_id = (select public.current_store_id())
        and (select public.is_staff())
    )
  );
