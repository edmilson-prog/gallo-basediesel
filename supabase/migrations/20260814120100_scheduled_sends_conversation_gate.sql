-- Fecha o bypass do modelo de "2 portões" via `scheduled_sends`.
--
-- Problema (auditoria de segurança de 2026-08-14):
-- as quatro policies de `scheduled_sends` exigiam apenas `store_id = current_store_id()`,
-- sem nenhuma checagem por conversa. Como o worker de despacho roda com
-- `buildSystemSender()` -> `role: "owner"` (supabase/functions/_shared/whatsapp/scheduled/core.ts),
-- ele passa direto pelo gate de permissão do envio, e no ramo WAHA não há gate algum.
--
-- Cadeia de exploração:
--   1. um vendedor colhe `conversation_id` de conversas que a RLS lhe nega;
--   2. insere uma linha em `scheduled_sends` apontando para essa conversa,
--      com `scheduled_for = now()`;
--   3. em até 1 minuto o cron dispara o worker, que envia a mensagem pela
--      instância da conversa, em nome da empresa;
--   4. a mensagem grava `author_id: null` e não gera trilha de auditoria, e a
--      linha de `scheduled_sends` — cujo `created_by` é `text` sem FK, portanto
--      forjável — pode ser apagada pelo próprio autor.
--
-- Correção: exigir `can_access_conversation(conversation_id)` nas quatro
-- operações. É a mesma função que já governa `messages` e a mídia no Storage,
-- então o agendamento passa a respeitar exatamente o mesmo alcance do envio
-- imediato — que era a intenção original.
--
-- `conversation_id` é NOT NULL na tabela, então não há caso de linha órfã a
-- considerar. O worker não é afetado: ele opera com service_role, que não passa
-- por RLS.

alter policy scheduled_sends_select on public.scheduled_sends
  using (
    store_id = (select public.current_store_id())
    and public.can_access_conversation(conversation_id)
  );

alter policy scheduled_sends_insert on public.scheduled_sends
  with check (
    store_id = (select public.current_store_id())
    and public.can_access_conversation(conversation_id)
  );

alter policy scheduled_sends_update on public.scheduled_sends
  using (
    store_id = (select public.current_store_id())
    and public.can_access_conversation(conversation_id)
  )
  with check (
    store_id = (select public.current_store_id())
    and public.can_access_conversation(conversation_id)
  );

alter policy scheduled_sends_delete on public.scheduled_sends
  using (
    store_id = (select public.current_store_id())
    and public.can_access_conversation(conversation_id)
  );
