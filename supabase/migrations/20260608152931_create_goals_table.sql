-- PRD-042 — sales goals (IGoal), scoped by level (store/team/individual). text PK.
create table if not exists public.goals (
  id                 text primary key,
  store_id           text not null references public.stores (id),
  level              text not null,
  target_id          text not null,
  seller_id          text references public.sellers (id),
  period             jsonb not null,
  metric             text not null,
  target_value       numeric not null default 0,
  current_value      numeric not null default 0,
  progress_percent   numeric not null default 0,
  division           text,
  name               text,
  status             text,
  reward_description text,
  created_by         text references public.sellers (id),
  cancel_reason      text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists goals_store_id_idx on public.goals (store_id);
create index if not exists goals_level_idx on public.goals (level);
create index if not exists goals_target_id_idx on public.goals (target_id);
create index if not exists goals_metric_idx on public.goals (metric);
create index if not exists goals_seller_id_idx on public.goals (seller_id);

alter table public.goals enable row level security;
drop policy if exists "goals_select_poc_temp" on public.goals;
create policy "goals_select_poc_temp" on public.goals for select to anon, authenticated using (true);
