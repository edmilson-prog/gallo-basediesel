# Encerramento de atendimento + Histórico de atendimento — Design

> **Status:** aprovado no brainstorming (visual companion) em 2026-07-03. Base: `origin/main` v0.131.0 Ledger. Worktree `attendance-close-history`.

**Objetivo:** dar à conversa um **ciclo de encerramento** consistente (Resolvida/Arquivada = "fechado": some da lista, sem dono, e reabre na fila ao próximo contato) e um **Histórico de Atendimento** por cliente — uma timeline auditável de status, atribuições, transferências e reaberturas.

**Arquitetura (resumo):** um novo eixo semântico "encerrada" que estende a invariante do unify (v0.129.0); uma tabela append-only `conversation_activity` alimentada explicitamente por cada caminho de mutação (RPCs SECURITY DEFINER + webhook + mock); e um painel de UI (híbrido "cards por conversa + trilho por dentro") lido via RPC gated por acesso à conversa.

**Tech stack:** React 19 + TanStack Query/Router, Provider Pattern (`@/providers/data`), Supabase (Postgres + RLS + RPC SECURITY DEFINER + Edge Functions), Vitest (engines puros).

---

## Global Constraints

- **Nenhum status novo.** Continuam os 5 de `ConversationStatus`: `aguardando`, `em_andamento`, `aguardando_cliente`, `resolvida`, `arquivada`. O ajuste é de **comportamento**, não de vocabulário.
- **Provider Pattern:** features só falam com `@/providers/data`; toda mudança de dado tem par mock + supabase. Migrations via MCP **devem** ser espelhadas em `supabase/migrations/` no mesmo PR.
- **Modelo de acesso "2 portões" intacto:** Atendimento por instância (`can_access_conversation`), Carteira por dono. Toda leitura escopada por conversa passa por RPC `SECURITY DEFINER` gated-once. Nada de RLS por-linha em varredura.
- **Cache do atendimento CONGELADO:** signing em lote (#137), Realtime, query keys e RPCs gated-once **não** são reescritos. A reabertura de conversa se propaga pela infra Realtime **já existente** (canal `conversations`), sem novo trabalho de cache.
- **Tokens semânticos:** a UI consome `STATUS_META` (`conversationDisplay.ts`) — dourado=em atendimento, verde=resolvida, âmbar=aguardando, azul ○=aguardando cliente, cinza=arquivada. Nunca hex/`--gallo-*` direto.
- **Prod é owner-gated:** aplicar migration / deploy de Edge em produção exige OK explícito do dono. Integração por push + PR; nunca merge sem OK.
- **UI em pt-BR com acentuação correta; código/identificadores em inglês.**

---

## Contexto & problema

Hoje (v0.131.0):

- O filtro padrão da Inbox esconde **só `arquivada`** — `resolvida` continua aparecendo na lista (`filtersToListParams`, o array default `["aguardando","em_andamento","aguardando_cliente","resolvida"]`).
- **Resolver mantém o dono** (o acoplamento do unify em `coupleManualStatusChange` só trata `aguardando`↔status "de dono"; `resolvida`/`arquivada` passam batido).
- `statusOnUnassign(resolvida)` hoje retorna `aguardando` — ou seja, `resolvida` **não** é tratada como eixo terminal.
- **Não há reabertura automática** ao novo contato (o `autoReopenResolvedOnInbound` foi especificado em 2026-06-14 mas o "Plano B" server-side nunca foi implementado — issue #93).
- **Não existe timeline de ciclo de atendimento.** O `audit_logs` registra trocas manuais de status, mas tem RLS Owner/staff (o atendente não-staff veria vazio), `actor_id` é `NOT NULL`→`sellers` (sem ator "Sistema" limpo) e a cobertura de atribuição/transferência é irregular.

## Objetivos

1. `resolvida` **e** `arquivada` viram um único eixo **"encerrada"**: some da lista por padrão, fica **sem dono**, e **qualquer novo inbound reabre** em `aguardando` (Em fila), sem dono, no topo.
2. Um **Histórico de Atendimento** por cliente (todas as conversas dele) com status + atribuições + transferências + reaberturas, ator (pessoa ou "Sistema"), data/hora e duração em cada estado.

## Não-objetivos

- Criar status novos ou renomear os existentes.
- Reabertura **configurável** por loja (o dono escolheu o comportamento **uniforme** — sempre reabre; o gate `autoReopenResolvedOnInbound` fica **fora de escopo**).
- Gate de login/atendimento server-side (não relacionado).
- Reescrever qualquer parte do cache congelado do atendimento.
- Emissão de "mensagem de sistema" no thread ao reabrir (o sinal visual é o próprio status voltar a Aguardando + unread + a mensagem do cliente; igual à decisão de 2026-06-14).

---

## Decisões aprovadas (brainstorming)

| Tema | Decisão |
|------|---------|
| Reabertura no inbound | **Resolvida e Arquivada reabrem** (uniforme, sem gate por loja). |
| Escopo da timeline | **Cliente inteiro** (agrega todas as conversas do cliente). |
| Granularidade | **Status + atribuições/transferências** (auditoria completa, inclui reabertura pelo Sistema). |
| Fonte de dados | **Tabela dedicada** append-only + **backfill único** do passado. |
| Layout | **Híbrido B+C:** cards colapsáveis por conversa (agrupamento) com **trilho conectado** por dentro (timeline). |

---

## Frente 1 — Encerramento ("fechado" = Resolvida ∪ Arquivada)

### 1.1 Invariante revisada

Estende a invariante do unify (v0.129.0). Definir o conjunto **terminal** `TERMINAL = {resolvida, arquivada}` e **aberta** `OPEN = {aguardando, em_andamento, aguardando_cliente}`.

- **Aberta + sem dono (SDR off) ⇒ `aguardando`** (Em fila). *(inalterado)*
- **Aberta + com dono ⇒ nunca `aguardando`.** *(inalterado)*
- **Terminal ⇒ sempre sem dono** *(novo)*. Encerrar desatribui; a conversa terminal nunca carrega dono.
- **Terminal é isento da invariante da fila** *(novo)* — sem dono + terminal é válido e **não** é forçado a `aguardando`.

### 1.2 Engine (`assignmentStatusCoupling.ts`) — TDD

- `TERMINAL_STATUSES: ReadonlySet<ConversationStatus>` = `{resolvida, arquivada}`; helper `isTerminalStatus(s)`.
- `statusOnUnassign(current)`: retornar `null` para **qualquer terminal** e para `aguardando` (hoje só protege `arquivada`); demais → `aguardando`. *(muda: `resolvida` deixa de re-enfileirar)*
- `coupleManualStatusChange(next, hasAssignee)`: acrescentar a regra **close** — `hasAssignee && isTerminalStatus(next) ⇒ 'close'` (novo retorno). Mantém `assign-self` e `unassign`.
- Novo engine puro `reopenOnInbound(current): ConversationStatus | null` — `isTerminalStatus(current) ? 'aguardando' : null`. Fonte única usada por webhook (via `_shared`), mock e eco.

### 1.3 Encerrar = status terminal + desatribuir, atômico

Encerrar (pelo `StatusControl`, pelo kebab "Resolver/Arquivar" ou por `QuickActions`) deve, **numa só operação**, gravar o status terminal **e** zerar `assigned_seller_id` — sem passar por um `aguardando` transitório (que poluiria a timeline com um evento espúrio).

- **Supabase:** novo RPC `close_conversation(p_conversation_id, p_status)` `SECURITY DEFINER`, espelhando o padrão de `transfer_conversation`/`unassign` (o dono não-staff perde a linha do próprio SELECT ao desatribuir → precisa de DEFINER). Valida `p_status ∈ TERMINAL`, checa `can_access_conversation`, seta `status=p_status, assigned_seller_id=NULL, is_sdr_active=false`, **emite os eventos de atividade** (ver Frente 2) e devolve a linha.
- **Mock:** `MockConversationsProvider.close(id, status)` faz o equivalente in-memory + emite eventos.
- **Contrato:** `IConversationsProvider.close(id, status: 'resolvida' | 'arquivada'): Promise<IConversation>`.
- `useConversationStatusActions`: quando `coupleManualStatusChange` = `'close'`, chamar `close(id, next)` em vez de `update`/`unassign`. Toast de encerramento + "removida da lista".

### 1.4 Some da lista por padrão (mas visível por filtro)

- `filtersToListParams`: default (`status === "all"`) passa a excluir **também** `resolvida` → `["aguardando","em_andamento","aguardando_cliente"]`.
- O dropdown de status (`VALID_STATUS`, `InboxFilters`) **mantém** `Resolvida` e `Arquivada` como opções explícitas — quem quiser ver, filtra. *(paridade com o comportamento atual de `arquivada`)*
- Verificar que **mock e supabase** `list()` filtram estritamente pelo array de status recebido (já filtram; sem default server-side escondido). O `count_conversations` (v0.128.1) lê do mesmo objeto de filtros via `buildCountRpcParams` → consistente sem tocar na RPC.
- "Em fila" (token `queue`) = `aguardando` + sem dono: terminal (sem dono) **não** entra na fila porque não é `aguardando`. Sem regressão.

### 1.5 Reabertura no inbound

Ao chegar um **inbound** (mensagem do cliente) numa conversa **terminal**: `status → aguardando`, `assigned_seller_id → NULL` (já nulo), `lastMessageAt → agora` (sobe ao topo), `unreadCount++`, e **emite evento `reopen` com ator = Sistema**.

- **Prod (webhook):** `whatsapp-webhook` → `whatsapp/webhook/core.ts` aplica `reopenOnInbound(current)` antes de anexar a mensagem. Núcleo runtime-agnostic espelhado em `_shared/` via `scripts/sync-whatsapp-shared.ts` ⇒ **redeploy** da Edge (owner-gated). Passo idempotente: só reabre se terminal.
- **Mock:** o caminho de inbound/**eco** (`SendMessage`) do mock aplica o mesmo engine.
- SDR: conversa terminal tem SDR off; reabertura não liga SDR. Sem interação nova.

### 1.6 Onde muda (Frente 1)

- `src/providers/data/engine/assignmentStatusCoupling.ts` (+ `.test.ts`) — TERMINAL, `statusOnUnassign`, `coupleManualStatusChange` `'close'`, `reopenOnInbound`.
- `src/providers/data/contracts/*` — `IConversationsProvider.close`.
- `src/providers/data/impl/supabase/conversations.ts` + `src/mocks/api/conversations.ts` — `close()`, emissão de eventos, inbound/eco reabrindo.
- `src/features/conversations/hooks/useConversationStatusActions.ts` — rota `'close'`.
- `src/features/conversations/hooks/useInboxFilters.ts` — default de status.
- `src/providers/whatsapp/webhook/core.ts` (+ `_shared/` sync) — reabertura.
- Migration: `close_conversation` RPC (+ grants).

---

## Frente 2 — Histórico de Atendimento (timeline por cliente)

### 2.1 Tabela `conversation_activity` (append-only)

| coluna | tipo | nota |
|--------|------|------|
| `id` | uuid PK | |
| `conversation_id` | uuid | FK `conversations` (ON DELETE CASCADE) |
| `customer_id` | uuid null | denormalizado p/ query "cliente inteiro" (nulo se lead) |
| `lead_id` | text null | idem para leads (`lead_id` é TEXT no projeto) |
| `store_id` | uuid | escopo de RLS |
| `type` | text | `status` · `assignment` · `reopen` (CHECK) |
| `from_status` | text null | quando `type` toca status |
| `to_status` | text null | idem |
| `from_seller_id` | uuid null | quando `type=assignment` |
| `to_seller_id` | uuid null | `NULL` = desatribuída |
| `actor_id` | uuid null | seller que causou; **`NULL` = Sistema** |
| `actor_kind` | text | `seller` · `system` (CHECK) |
| `created_at` | timestamptz | default `now()` |

Índices: `(customer_id, created_at)`, `(conversation_id, created_at)`.

**Semântica dos eventos** (a UI deriva o rótulo; sem enum de rótulo no banco):
- **Encerrar** (`close_conversation`) emite **um** evento `status` com `to_status ∈ TERMINAL` **e** um evento `assignment` com `to_seller_id=NULL` — a UI funde numa linha "Resolvida — encerrada · sem dono".
- **Assumir da fila / desatribuir / transferir** → `assignment` (`from_seller_id`→`to_seller_id`); ator = quem executou.
- **Reabrir no inbound** → `reopen` (`to_status='aguardando'`, `actor_kind='system'`, `actor_id=NULL`).
- Troca manual de status "aberta↔aberta" (ex.: `em_andamento`→`aguardando_cliente`) → `status`.

**Duração** por linha = diferença entre o `created_at` do evento e o do próximo evento **da mesma conversa** — calculada no cliente, não persistida.

### 2.2 Emissão (explícita, ator conhecido no call-site)

Escrita **explícita** em cada caminho (não trigger — o ator é conhecido no ponto de mutação; trigger não sabe distinguir seller vs Sistema):

- RPCs `transfer_conversation` (assign/transfer), `close_conversation` (close), e o caminho de `unassign` → inserem `assignment`/`status` com `actor_id = auth.uid()→seller`.
- Troca manual de status (`update` de `status`) → `status`.
- Webhook (`reopenOnInbound`, service_role) → `reopen` com `actor_kind='system'`.
- Mock: cada op equivalente insere no store in-memory.

INSERT restrito a `service_role` / funções `SECURITY DEFINER` (o cliente nunca escreve direto).

### 2.3 RLS & leitura

- **SELECT** liberado só via RPC `SECURITY DEFINER` gated-once (padrão do modelo 2 portões):
  - `get_customer_activity(p_customer_id)` — usado pela ficha e pelo painel do atendimento (escopo "cliente inteiro"). Gate: staff/owner do cliente **ou** o caller tem acesso a ≥1 conversa daquele cliente (`can_access_conversation`). Retorna eventos ordenados + o nome/kind do ator já resolvido.
- Sem policy SELECT por-linha ampla (evita a assimetria de custo já conhecida).

### 2.4 Backfill único

Migration de dados (idempotente) semeia `conversation_activity` a partir do `audit_logs` existente:

- `conversation.status_change` / `conversation.resolve` / `conversation.archive` (que carregam `before/after` de `status` e `assignedSellerId`) → eventos `status`/`assignment`, `actor_id` = `audit_logs.actor_id`, `actor_kind='seller'`.
- **Best-effort e assumidamente parcial:** onde o audit não cobre atribuição/transferência antiga, a linha fica sem esse evento; o passado de reabertura pelo Sistema não existe no audit → não é reconstruído. Documentar o limite (a timeline fica **completa daqui pra frente**).

### 2.5 UI — painel híbrido (B+C)

Componente `AttendanceHistoryPanel` (nova feature `src/features/attendance-history/`), reutilizado em dois lugares:

- **Atendimento:** uma aba/ícone "Histórico" no rail lateral da conversa (junto de Ficha/Notas/etc.).
- **Ficha do cliente:** uma seção/aba "Histórico de atendimento".

Layout aprovado:
- **Card colapsável por conversa** (mais recente no topo): cabeçalho = conversa + canal + data + **badge do status atual**; recolhido mostra um **resumo** ("5 eventos · dono final X · durou 2d 4h · transferida 1×"); o card mais recente vem aberto.
- **Trilho conectado por dentro** (do mais antigo no topo ao mais novo embaixo): bolinha colorida por status → `pill` (STATUS_META) + ator + data/hora + duração. Ator "Sistema" em verde; transferência em azul ("transferida de Fulano"); reabertura com tag "↻ reabriu no contato".
- Engine puro testável `attendanceTimeline.ts`: agrupa eventos por conversa, ordena, funde close (status+assignment) numa linha, calcula duração, monta o resumo do card recolhido.
- Hook `useCustomerActivity(customerId)` via novo provider `activity` (mock + supabase chamando `get_customer_activity`). Query key nova, isolada; **não** encosta nas keys congeladas.

### 2.6 Onde muda (Frente 2)

- Migration: tabela `conversation_activity` + índices + RLS (deny direto) + `get_customer_activity` RPC + emissão nos RPCs `transfer_conversation`/`close_conversation`/unassign path + backfill.
- `src/shared/types/conversation.ts` — `IConversationActivityEvent`, `AttendanceActivityType`.
- `src/providers/data/contracts` + `impl/{mock,supabase}` — provider `activity` com `getCustomerActivity`.
- `src/features/attendance-history/` — `AttendanceHistoryPanel`, `engine/attendanceTimeline.ts` (+ test), `hooks/useCustomerActivity.ts`, `i18n/pt-BR.ts`.
- Pontos de montagem: rail da conversa (`ConversationPage`) + ficha (`AtendimentoTab`/`ProfileTabs`).

---

## Fluxo de dados (fim-a-fim)

1. Atendente clica **Resolver** → `useConversationStatusActions` → `coupleManualStatusChange='close'` → `close_conversation` RPC → status=resolvida + sem dono + 2 eventos de atividade → Realtime `conversations` atualiza a Inbox → a conversa some da lista default (terminal).
2. Cliente responde depois → `whatsapp-webhook` → `reopenOnInbound` → status=aguardando + sem dono + `lastMessageAt`=agora + evento `reopen`(Sistema) → Realtime → volta ao **topo da fila** com chip "Em fila".
3. Alguém abre a ficha/rail → `get_customer_activity(customerId)` → `attendanceTimeline` agrupa por conversa → painel híbrido renderiza os ciclos.

## Tratamento de erros & edge cases

- **Não-staff encerrando a própria conversa:** o desatribuir tira a linha do SELECT do dono → por isso `close_conversation` é `SECURITY DEFINER` (mesma razão de `unassign`/`transfer`).
- **Reabertura idempotente:** só reabre se terminal; inbound em conversa já aberta não gera `reopen`.
- **Lead vs cliente:** `get_customer_activity` é por cliente; conversa de lead usa `lead_id`. Escopo do painel na ficha do cliente. (Timeline de lead: fora do escopo v1; a coluna existe.)
- **Falha na emissão de evento:** a atividade é secundária ao dado — emissão dentro do mesmo RPC/transaction do close/transfer (consistente) mas a leitura tolera lacunas (backfill parcial).
- **Ordenação:** cards por conversa em ordem decrescente de `lastMessageAt`; eventos internos crescentes por `created_at`.

## Testes

- Engines puros (Vitest, TDD): `assignmentStatusCoupling` (TERMINAL, `statusOnUnassign`, `'close'`, `reopenOnInbound`), `attendanceTimeline` (agrupamento, fusão do close, duração, resumo).
- Mock provider: `close()` desatribui + emite; inbound/eco reabre + emite; `getCustomerActivity` retorna ordenado.
- `filtersToListParams`: default exclui resolvida+arquivada; filtro explícito ainda seleciona.
- Gate prático: `bun run build` + `bun run test`. `bunx tsc --noEmit` por delta nos arquivos novos.

## Rollout & gates (prod, owner-gated)

Ordem sugerida (o plano detalha as fases):

1. Migration `conversation_activity` + RLS + `get_customer_activity` (schema; inócuo sozinho).
2. Migration `close_conversation` + emissão nos RPCs existentes.
3. Frontend Frente 1 (default de filtro, engine, `close()`, UI de encerrar).
4. Redeploy `whatsapp-webhook` (reabertura) — sync `_shared/` + deploy.
5. Backfill (idempotente) + UI do painel (Frente 2).

Cada `apply_migration`/deploy em prod: **confirmar com o dono** e espelhar a migration em `supabase/migrations/`.

## Sequenciamento

Frente 1 e Frente 2 compartilham a tabela e os call-sites de mutação — por isso vão **num spec/plano só**, faseados: schema da atividade → encerramento/reabertura emitindo eventos → backfill → painel. O plano (writing-plans) quebra em tarefas testáveis.

## Fora de escopo (v1)

- Reabertura configurável por loja (`autoReopenResolvedOnInbound`).
- Timeline de leads na UI (dado é capturado; render fica pra depois).
- Métricas/relatórios sobre a atividade (tempo médio em fila etc.) — a tabela habilita, mas o dashboard é outro projeto.
- Mensagem de sistema no thread ao reabrir.
