-- Modelo de acesso "2 portões" — Portão A (Atendimento) endurecido pela INSTÂNCIA.
--
-- Regra de negócio reescrita com o dono (2026-06-20): a leitura de dados
-- comerciais para papéis não-staff resolve em dois portões independentes —
--   A) Atendimento (conversas/mensagens/ficha-aberta-da-conversa) governado pela
--      INSTÂNCIA (número de origem) = public.can_access_conversation;
--   B) Carteira (clientes/orçamentos/pedidos) governado pelo DONO
--      (customers.seller_id = current_seller_id()).
-- Esta migration mexe SÓ no Portão A. O Portão B (customers_select) é
-- intencionalmente NÃO tocado — foi o alargamento por-linha do customers_select
-- que estourou statement_timeout em prod no #120/#124.
--
-- Três entregas:
--   1) can_access_conversation: a INSTÂNCIA vira o portão-MESTRE. O ramo das
--      conversas atribuídas passa a exigir acesso ao número (conserta o gap em
--      que um vendedor que perdeu a instância mantinha as conversas atribuídas).
--      O ramo do co-responsável respeita a instância por padrão, com um parâmetro
--      global por loja (participantCrossInstance) que o libera a transitar.
--   2) last_messages_for_conversations(uuid[]): batch do preview de mensagens da
--      Inbox — 1 chamada gated por can_access em vez de ~50 queries concorrentes
--      (cada uma reavaliando can_access) que saturavam o banco (500 em /messages).
--   3) conversation_customer(uuid): a ficha aberta a partir da conversa lê o
--      cliente por RPC de contexto gated por can_access (mata o 406 do pool) SEM
--      tocar a RLS global de customers.
--
-- Todas as funções são STABLE SECURITY DEFINER SET search_path TO '' e gated por
-- can_access_conversation sobre um conjunto LIMITADO de ids (nunca um scan da
-- tabela de clientes) — exatamente o padrão performático que o revert do #124
-- prescreveu.

-- ---------------------------------------------------------------------------
-- Parâmetro global por loja: convidados/co-responsáveis podem transitar entre
-- instâncias? Vive no jsonb stores.settings (sem tabela nova). Default = false
-- (Opção X: o co-responsável só vê a conversa se também acessar o número).
-- ---------------------------------------------------------------------------
create or replace function public.store_allows_participant_cross_instance(store uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  -- Compare the extracted TEXT to 'true' rather than ::boolean: the settings jsonb
  -- is app-written and unvalidated, and a non-canonical value (e.g. "yes") would
  -- make ::boolean RAISE inside can_access_conversation — erroring the whole
  -- conversations/messages SELECT instead of failing closed. `= 'true'` never
  -- throws: missing key / any non-"true" value → false.
  select coalesce(
    (
      select s.settings ->> 'participantCrossInstance'
      from public.stores s
      where s.id = store
    ) = 'true',
    false
  );
$function$;

revoke all on function public.store_allows_participant_cross_instance(uuid) from public, anon;
grant execute on function public.store_allows_participant_cross_instance(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- can_access_conversation: a instância é o portão-mestre.
--
-- Mudanças vs. a versão anterior:
--  - ramo das ATRIBUÍDAS: agora exige a instância (ou conversa sem número, p/ não
--    regredir canais não-WhatsApp/legados). Conserta o gap do número desvinculado.
--  - ramo do CO-RESPONSÁVEL: respeita a instância por padrão; o flag global
--    (participantCrossInstance) o libera a transitar entre instâncias.
--  - ramos da FILA (pool) preservados exatamente como antes (inclusive a fila
--    legada sem número, visível na loja) — fora do escopo desta reescrita.
-- ---------------------------------------------------------------------------
create or replace function public.can_access_conversation(conv uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select exists (
    select 1 from public.conversations c
    where c.id = conv
      and c.store_id = public.current_store_id()
      and (
        public.is_staff()
        -- Atribuída a mim — MAS a instância é o portão-mestre: perdi o número,
        -- perco os atribuídos daquele número. Conversa sem número (canal
        -- não-WhatsApp ou legado) não tem instância a checar → permanece visível.
        or (
          c.assigned_seller_id = public.current_seller_id()
          and (
            c.whatsapp_account_id is null
            or c.whatsapp_account_id in (select public.current_seller_accessible_account_ids())
          )
        )
        -- Co-responsável (convite explícito por conversa). Por padrão respeita a
        -- instância (Opção X); com o flag global ON o convite transita.
        or (
          public.is_conversation_participant(conv)
          and (
            public.store_allows_participant_cross_instance(c.store_id)
            or c.whatsapp_account_id is null
            or c.whatsapp_account_id in (select public.current_seller_accessible_account_ids())
          )
        )
        -- Fila (não atribuída) num número que eu acesso.
        or (
          c.assigned_seller_id is null
          and c.whatsapp_account_id is not null
          and c.whatsapp_account_id in (select public.current_seller_accessible_account_ids())
        )
        -- Fila legada sem número (pré-multi-instância) — preservado como antes.
        or (
          c.assigned_seller_id is null
          and c.whatsapp_account_id is null
        )
      )
  );
$function$;

-- ---------------------------------------------------------------------------
-- last_messages_for_conversations(uuid[]): última mensagem por conversa, para as
-- conversas que o chamador pode acessar — em UMA chamada. Substitui as ~50
-- queries `messages limit 1` concorrentes do Inbox (cada uma reavaliando
-- can_access para o vendedor → saturava → 500). O can_access roda só sobre os
-- ids passados (no máximo a página, ~50), nunca por mensagem.
-- ---------------------------------------------------------------------------
create or replace function public.last_messages_for_conversations(p_ids uuid[])
returns setof public.messages
language sql
stable
security definer
set search_path to ''
as $function$
  -- LATERAL limit-1 per conversation rides the (conversation_id, sent_at) index
  -- (backward scan) — ~16ms for a 50-conversation page vs ~140ms for a
  -- distinct-on full sort. can_access runs once per id (bounded), never per row.
  with accessible as (
    select t.cid
    from unnest(p_ids) as t(cid)
    where public.can_access_conversation(t.cid)
  )
  select m.*
  from accessible a
  cross join lateral (
    select msg.*
    from public.messages msg
    where msg.conversation_id = a.cid
    order by msg.sent_at desc, msg.created_at desc
    limit 1
  ) m;
$function$;

revoke all on function public.last_messages_for_conversations(uuid[]) from public, anon;
grant execute on function public.last_messages_for_conversations(uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- conversation_customer(uuid): o cliente vinculado a uma conversa, gated por
-- can_access. A ficha aberta a partir da conversa lê por aqui (fallback) quando o
-- customers_select por carteira esconderia o cliente do pool — matando o 406 SEM
-- alargar a RLS global de customers (Portão B intacto). Retorna 0 ou 1 linha.
-- ---------------------------------------------------------------------------
create or replace function public.conversation_customer(conv uuid)
returns setof public.customers
language sql
stable
security definer
set search_path to ''
as $function$
  select cu.*
  from public.conversations c
  join public.customers cu on cu.id = c.customer_id
  where c.id = conv
    and public.can_access_conversation(conv);
$function$;

revoke all on function public.conversation_customer(uuid) from public, anon;
grant execute on function public.conversation_customer(uuid) to authenticated;
