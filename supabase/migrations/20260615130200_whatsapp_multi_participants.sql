-- Multi-instância — Camada 2: co-responsáveis de uma conversa.
-- FK do seller é NO ACTION (default): soft-delete do seller preserva o histórico.
create table if not exists public.conversation_participants (
  conversation_id uuid not null
    references public.conversations(id) on delete cascade,
  seller_id uuid not null references public.sellers(id),
  added_by uuid references public.sellers(id),
  added_at timestamptz not null default now(),
  primary key (conversation_id, seller_id)
);

create index if not exists cp_seller_idx
  on public.conversation_participants (seller_id);

alter table public.conversation_participants enable row level security;

-- SELECT: staff, o próprio participante, ou o responsável da conversa.
-- (Não usa can_access_conversation para não depender da migration de helpers.)
drop policy if exists cp_select on public.conversation_participants;
create policy cp_select on public.conversation_participants
  for select to authenticated
  using (
    (select public.is_staff())
    or seller_id = (select public.current_seller_id())
    or exists (
      select 1 from public.conversations c
      where c.id = conversation_id
        and c.assigned_seller_id = (select public.current_seller_id())
    )
  );

-- INSERT/UPDATE/DELETE: staff ou o responsável da conversa gerencia co-responsáveis.
drop policy if exists cp_write on public.conversation_participants;
create policy cp_write on public.conversation_participants
  for all to authenticated
  using (
    (select public.is_staff())
    or exists (
      select 1 from public.conversations c
      where c.id = conversation_id
        and c.assigned_seller_id = (select public.current_seller_id())
    )
  )
  with check (
    (select public.is_staff())
    or exists (
      select 1 from public.conversations c
      where c.id = conversation_id
        and c.assigned_seller_id = (select public.current_seller_id())
    )
  );
