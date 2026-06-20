-- Mensagens da conversa aberta: acesso checado UMA vez, não por linha.
--
-- Problema (pré-existente, exposto pelo uso real da fila por vendedores): a
-- policy `messages_select` é `can_access_conversation(messages.conversation_id)`,
-- avaliada POR LINHA (SubPlan correlacionado). Numa conversa grande (ex.: 638
-- mensagens) abrir = `messages.list` (página de 50/200) faz o can_access rodar
-- ~3ms × até 200 linhas ≈ 640ms por query; alternando rápido entre conversas de
-- fila isso acumula e estoura o `statement_timeout` (8s) → 500 em /messages.
-- (EXPLAIN comprovou: SubPlan 1 ... loops=200, Execution Time 642ms.)
--
-- Fix: ler a página por um RPC SECURITY DEFINER que checa `can_access` UMA vez
-- (argumento constante = o id da conversa, não a coluna por-linha) e então
-- devolve a página direto pelo índice (conversation_id, sent_at). ~5ms.
-- Mesma técnica das demais RPCs do modelo de 2 portões (gating sobre conjunto
-- limitado, nunca por linha em volume).

create or replace function public.conversation_messages(
  p_conversation_id uuid,
  p_limit integer default 50,
  p_offset integer default 0,
  p_order_dir text default 'asc'
)
returns setof public.messages
language plpgsql
stable
security definer
set search_path to ''
as $function$
begin
  -- Gate ONCE. If the caller can't access the conversation, return no rows
  -- (mirrors the RLS outcome, without the per-row cost).
  if not public.can_access_conversation(p_conversation_id) then
    return;
  end if;

  if p_order_dir = 'desc' then
    return query
      select m.*
      from public.messages m
      where m.conversation_id = p_conversation_id
      order by m.sent_at desc, m.created_at desc
      limit p_limit offset p_offset;
  else
    return query
      select m.*
      from public.messages m
      where m.conversation_id = p_conversation_id
      order by m.sent_at asc, m.created_at asc
      limit p_limit offset p_offset;
  end if;
end;
$function$;

revoke all on function public.conversation_messages(uuid, integer, integer, text) from public, anon;
grant execute on function public.conversation_messages(uuid, integer, integer, text) to authenticated;
