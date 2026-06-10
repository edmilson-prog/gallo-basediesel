-- PRD-054 — operational expense ledger (IExpense). text PK; faker → no seed.
create table if not exists public.expenses (
  id                   text primary key,
  description          text not null,
  category             text not null check (category = any (array[
                         'folha','aluguel','infraestrutura','marketing','impostos',
                         'fornecedores','logistica','manutencao','outros'
                       ]::text[])),
  amount               numeric not null default 0,
  competence_date      timestamptz not null,
  payment_date         timestamptz,
  status               text not null default 'pendente' check (status = any (array[
                         'pendente','pago','atrasado','cancelado'
                       ]::text[])),
  due_date             timestamptz,
  is_recurring         boolean not null default false,
  recurrence_parent_id text,
  recurrence_config    jsonb,
  supplier             text,
  payment_method       text check (payment_method is null or payment_method = any (array[
                         'pix','boleto','transferencia','dinheiro','cartao','debito_automatico'
                       ]::text[])),
  attachment_url       text,
  notes                text,
  store_id             text not null references public.stores (id),
  created_by           text not null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'expenses_recurrence_parent_id_fkey') then
    alter table public.expenses
      add constraint expenses_recurrence_parent_id_fkey
      foreign key (recurrence_parent_id) references public.expenses (id);
  end if;
end $$;

create index if not exists expenses_store_id_idx on public.expenses (store_id);
create index if not exists expenses_status_idx on public.expenses (status);
create index if not exists expenses_category_idx on public.expenses (category);
create index if not exists expenses_competence_date_idx on public.expenses (competence_date);
create index if not exists expenses_payment_date_idx on public.expenses (payment_date);
create index if not exists expenses_due_date_idx on public.expenses (due_date);
create index if not exists expenses_recurrence_parent_id_idx on public.expenses (recurrence_parent_id);

alter table public.expenses enable row level security;
drop policy if exists "expenses_select_poc_temp" on public.expenses;
create policy "expenses_select_poc_temp" on public.expenses for select to anon, authenticated using (true);
