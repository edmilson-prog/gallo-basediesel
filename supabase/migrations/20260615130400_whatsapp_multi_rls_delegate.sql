-- Multi-instância FIX #0 — toda RLS de leitura/escrita de conversas e mensagens
-- passa a delegar ao ponto único can_access_conversation. Fecha o vazamento
-- cross-seller de messages (policies eram store-scoped, não dono/pool-aware) e
-- estende o pool para "instância acessível".
--
-- Estado de prod auditado em 2026-06-15 (Task 0): messages_select/insert/update/delete
-- existiam store-scoped (NÃO espelhadas no Git). Esta migration re-versiona e endurece.

-- ============================ messages ============================
drop policy if exists messages_select_poc_temp on public.messages;
drop policy if exists messages_select on public.messages;
drop policy if exists messages_insert on public.messages;
drop policy if exists messages_update on public.messages;
drop policy if exists messages_delete on public.messages;

alter table public.messages enable row level security;

create policy messages_select on public.messages
  for select to authenticated
  using ((select public.can_access_conversation(conversation_id)));

create policy messages_insert on public.messages
  for insert to authenticated
  with check ((select public.can_access_conversation(conversation_id)));

create policy messages_update on public.messages
  for update to authenticated
  using ((select public.can_access_conversation(conversation_id)))
  with check ((select public.can_access_conversation(conversation_id)));

create policy messages_delete on public.messages
  for delete to authenticated
  using ((select public.can_access_conversation(conversation_id)));

-- ========================== conversations ==========================
-- SELECT passa a usar can_access (own + participante + pool-da-instância + staff).
drop policy if exists conversations_select on public.conversations;
create policy conversations_select on public.conversations
  for select to authenticated
  using ((select public.can_access_conversation(id)));

-- UPDATE: USING usa can_access (fecha o pool por instância); WITH CHECK mantém o
-- invariante de não reatribuir para outro (reivindicar null->self, ou staff).
drop policy if exists conversations_update on public.conversations;
create policy conversations_update on public.conversations
  for update to authenticated
  using ((select public.can_access_conversation(id)))
  with check (
    store_id = (select public.current_store_id())
    and (
      (select public.is_staff())
      or assigned_seller_id = (select public.current_seller_id())
      or assigned_seller_id is null
    )
  );
