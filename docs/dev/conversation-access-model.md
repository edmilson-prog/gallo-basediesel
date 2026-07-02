# Modelo de acesso a conversas — "2 portões"

> Como papéis **não-staff** (vendedor, SDR, externo, financeiro) enxergam
> conversas, mensagens, fichas e clientes — e o padrão de performance que
> mantém isso barato sob RLS. Reescrito com o dono em 2026-06-20 após uma série
> de bugs de "Lead anônimo", 406 e 500 na Inbox.
>
> **TL;DR:** leitura comercial para não-staff resolve em **dois portões
> independentes (OU)**. Tudo que é **escopado por conversa** (mensagens, ficha
> aberta da conversa, contato, copiloto, agendador) lê por **RPC
> `SECURITY DEFINER` gated por `can_access_conversation` UMA vez** — nunca por
> RLS por-linha nem `customers.get` direto. Caso contrário você reintroduz o
> 406 (ficha do pool) ou o 500 (statement_timeout).

---

## 1. A regra de negócio (os 2 portões)

A leitura de dados comerciais para um papel não-staff é liberada se **qualquer**
um dos portões abrir:

- **Portão A — Atendimento** (conversas / mensagens / **ficha aberta a partir da
  conversa**): governado pela **INSTÂNCIA** (o número de origem conectado) =
  a função `public.can_access_conversation(uuid)`. É literalmente o painel
  *"Quem acessa esta instância"*.
  - **Fila** (conversa não atribuída) → visível a quem tem a instância.
  - Conversa **atribuída** → **exclusiva** do atendente (some para os demais).
  - **A instância é o portão-MESTRE:** perdeu o número, perde tudo daquele
    número **inclusive os atribuídos**.
  - Usado por: **Vendedor interno + SDR + staff**.

- **Portão B — Carteira** (meus clientes em `/app/clientes`, orçamentos,
  pedidos): governado por **DONO** (`customers.seller_id = current_seller_id()`)
  — o ramo `seller_id = me` de `customers_select`.
  - Usado por: **Vendedor interno (a carteira dele) + Vendedor externo**.

### Matriz por papel

| Papel              | Portão A (atendimento) | Portão B (carteira) |
|--------------------|:----------------------:|:-------------------:|
| Dono / Gestor      | tudo da loja (`is_staff()`) | tudo da loja |
| Vendedor interno   | ✅ (por instância)     | ✅ (carteira dele)  |
| SDR                | ✅ (triagem)           | ❌ (sem carteira)   |
| Vendedor externo   | ❌ (sem atendimento)   | ✅ (só carteira)    |
| Financeiro         | ❌                     | ❌                  |

**A carteira (dono) NUNCA muda por atendimento.** Atribuir uma conversa ≠ virar
dono do cliente. Só **Owner/Gestor** mudam o dono via `/app/carteira` ou no
detalhe do cliente.

---

## 2. A arquitetura: uma função é o portão

`public.can_access_conversation(conv uuid)` (`STABLE SECURITY DEFINER
SET search_path TO ''`) é a **única fonte de verdade** do Portão A. As policies
de leitura **delegam** a ela:

- `conversations_select USING ( (select can_access_conversation(id)) )`
- `messages_select USING ( (select can_access_conversation(conversation_id)) )`

E todas as RPCs escopadas por conversa a chamam como gate. Mudar a regra de
acesso = mudar **uma** função (altitude certa; nada de casos especiais).

Os 5 ramos do `OR` (basta um):

```text
is_staff()                                              -- Owner/Gestor
OR (atribuída a mim  AND (instância acessível OR sem número))   -- Portão A: atribuídas
OR (sou co-responsável AND (flag global OR instância acessível OR sem número))
OR (fila AND número acessível)                          -- Portão A: fila na minha instância
OR (fila AND sem número)                                -- fila legada (pré multi-instância)
```

Edges decididos com o dono:
- **Conversa sem número** (`whatsapp_account_id` null — canais não-WhatsApp ou
  legado): não tem instância a checar → permanece visível ao atribuído (não
  regride). 
- **Co-responsável** (`conversation_participants`): por padrão respeita a
  instância (Opção X); um parâmetro global por loja
  `stores.settings.participantCrossInstance` (lido por
  `store_allows_participant_cross_instance`) libera o convite a transitar entre
  instâncias (Opção Y). Default OFF.
- **NÃO é leitura store-wide** — o dono recusou. É por-conversa+instância
  (Portão A) e por-dono (Portão B).

---

## 3. O padrão de performance (a parte que custou caro)

> **Regra de ouro:** toda leitura **escopada por uma conversa** passa por um RPC
> `SECURITY DEFINER` que chama `can_access_conversation` **UMA vez** (argumento
> constante) sobre um conjunto **limitado** de ids. Nunca:
> 1. afrouxe `customers_select` global com `can_access` por-linha, nem
> 2. confie na RLS por-linha de `messages` para uma página grande, nem
> 3. faça `customers.get(conversation.customerId)` direto (`.single` → 406 no pool).

### RPCs e métodos de provider

| RPC (DB) | Provider (front) | Para quê |
|---|---|---|
| `conversation_contacts(uuid[])` | `conversations.listContacts(ids)` | nome/telefone/avatar da **lista** da Inbox + cabeçalho |
| `search_conversations(...)` (DEFINER) | `conversations.list({search})` | busca de conversas por nome (inclui fila) |
| `conversation_customer(uuid)` | `customers.getViaConversation(convId)` | **o cliente** da conversa (ficha, cabeçalho, copiloto, agendador) |
| `last_messages_for_conversations(uuid[])` | `messages.listLastMessages(ids)` | preview da última mensagem na **lista** |
| `conversation_messages(uuid,int,int,text)` | `messages.list({conversationId,...})` | **a página de mensagens** da conversa aberta |
| `store_allows_participant_cross_instance(uuid)` | — | helper do flag do co-responsável |

Todos: `STABLE SECURITY DEFINER SET search_path TO ''`, `revoke … from public,
anon` + `grant execute … to authenticated`, e gate por `can_access_conversation`.

### Por que não a RLS direta?

- **`customers` (Portão B intacto):** o cliente do **pool** não é da carteira do
  vendedor → `customers_select` o esconde → `customers.get(id).single()` →
  **406**. **Não** alargue `customers_select` para olhar a conversa: isso foi o
  PR #120, revertido no #124 porque o `can_access` **por-linha** num scan em
  massa de clientes (a Inbox lista `customers limit 1000`) estourou
  `statement_timeout`. Em vez disso, a ficha-da-conversa lê por
  `conversation_customer` (bounded, gated 1×).
- **`messages` (o 500):** `messages_select` roda `can_access` **por linha**.
  Abrir uma conversa de 638 mensagens = `can_access` × **200 loops** (~3ms cada)
  ≈ **642ms/página** (EXPLAIN: `SubPlan 1 … loops=200`); alternando rápido entre
  conversas grandes do pool, acumula → `statement_timeout` (8s) → **500**. O RPC
  `conversation_messages` checa 1× e devolve a página pelo índice
  `(conversation_id, sent_at)` → **~8ms**.

---

## 4. Lições (não repetir)

1. **Predicado de RLS que chama função pesada POR LINHA não escala.** Mede sob
   **carga/bulk e concorrência**, não só single-row — um `.get` isolado de 5ms
   engana (saga #120/#124: revert por perf em prod).
2. **Leitura de página (mensagens) ≠ leitura de 1 linha.** A RLS por-linha vira
   O(linhas). Roteie por RPC gated-once com `LIMIT`/`OFFSET` (#133).
3. **Varra TODOS os call sites, não só os óbvios.** O 406 sobreviveu a duas
   rodadas porque, além do cabeçalho e da ficha, o **copiloto** (`getPanelData`,
   auto-busca em toda conversa aberta) e o **agendador** (`SchedulingCenter`)
   também liam `customers.get(conversation.customerId)` (#134). Grep:
   `customers.get(` e `messages.list(` dentro da feature de conversas.
4. **Deploy de frontend é cacheado.** Uma migration sozinha **não** conserta
   leituras do front; e o bundle antigo continua servindo até **hard-reload**
   (Ctrl+Shift+R). O hash do chunk não mudar = deploy não chegou.
5. **`total` virou best-effort.** `messages.list` agora devolve `total` como
   lower-bound (o RPC retorna só a página) — paginação deve usar
   `data.length < pageSize`, **nunca** `>= total` (isso truncou o contexto do
   copiloto até o #134 corrigir o `listAllMessages`).

---

## 5. Como testar RLS com segurança (contra prod, sem alterar prod)

Impersonação read-only por claims do JWT, dentro de uma transação revertida — dá
pra inclusive criar a função nova e medir antes de aplicar:

```sql
begin;
-- (opcional) testar a NOVA definição sem persistir:
create or replace function public.can_access_conversation(conv uuid) ... ;

set local role authenticated;  -- aplica a RLS (omita para simular o DEFINER/service-role)
select set_config('request.jwt.claims',
  '{"role":"authenticated","app_metadata":{"seller_id":"<uuid>","store_id":"<uuid>","role":"seller_internal"}}',
  true);

-- conversas que o vendedor enxerga sob a RLS real:
select count(*) from public.conversations;

-- procurar o gargalo: SubPlan com loops=N = avaliação por linha
explain (analyze, buffers)
select * from public.messages where conversation_id = '<conv>' order by sent_at limit 200;

rollback;  -- prod intacto
```

Pós-`apply_migration`, rode `get_advisors(security)` — os WARN de
*SECURITY DEFINER executable* são abrangentes/pré-existentes (dezenas de funções
do projeto); o que importa é que RPCs que **retornam dados** estejam só em
`authenticated` (não `anon`) e gated.

---

## 6. Linha do tempo (rastreável)

| PR | O quê | Migration |
|---|---|---|
| #131 | "Lead anônimo" na lista/cabeçalho/busca: `conversation_contacts` + `search_conversations` viram DEFINER | `20260619210000_inbox_pool_contact_names.sql` |
| #132 | Regra dos 2 portões: instância vira portão-mestre no `can_access`; `last_messages_for_conversations`; `conversation_customer`; flag `participantCrossInstance` + toggle Owner-only | `20260620120000_access_model_two_gates.sql` |
| #133 | 500 da conversa aberta: `conversation_messages` (gated-once) + `messages.list` roteado; cabeçalho/ficha via `getViaConversation` | `20260620140000_conversation_messages_rpc.sql` |
| #134 | 406 residual: copiloto (`getPanelData`) + agendador (`SchedulingCenter`) via `getViaConversation`; fix da paginação do `listAllMessages` | — (frontend) |

Decisão de negócio detalhada: memória `project_access_model_decision`.
Relacionados: [whatsapp-multi-instance / "Quem acessa"](#), `rls_seller_handoff_pattern`.

---

## Listagem da Inbox (2026-07-02 — fix do statement timeout)

A query principal da lista era a última leitura escopada ainda em SELECT
direto com `count: "exact"` sob a RLS por-linha — o count reavaliava
`can_access_conversation(id)` sobre TODO o conjunto candidato a cada página
(medido: 5,3s dos 5,4s da request de um não-staff; teto de 8s do papel
`authenticated`). O caminho quente agora usa `withTotal: false` (sem count) e
o total do header vem da RPC `count_conversations` (migration
`20260702180000`), que expressa os 5 ramos do `can_access_conversation` como
predicados de conjunto — contas acessíveis materializadas 1x (padrão
gated-once aplicado à contagem). ⚠️ Se os ramos da função mudarem, a RPC de
count PRECISA acompanhar (paridade verificável com
`docs/dev/sql/verify-count-conversations.sql`).

No frontend (`useConversationsList` + `engine/listFetchPolicy.ts`): o painel
de erro ficou reservado para "replace falhou com lista vazia"; falhas de
background mantêm a lista stale e vão para o Sentry; primeira carga tem 1
retry; `hasMore` deriva de página cheia; um token de geração descarta
respostas órfãs de filtros antigos.
