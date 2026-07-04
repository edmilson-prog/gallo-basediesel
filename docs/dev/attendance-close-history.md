# Encerramento de atendimento + Histórico de atendimento

> **Status:** em produção desde 2026-07-04 (v0.132.0 `Epilogue`, PR #227).
> **Spec:** [`docs/superpowers/specs/2026-07-03-attendance-close-and-history-design.md`](../superpowers/specs/2026-07-03-attendance-close-and-history-design.md)
> **Plano:** [`docs/superpowers/plans/2026-07-03-attendance-close-and-history.md`](../superpowers/plans/2026-07-03-attendance-close-and-history.md)

Documento de entrega/consolidação da feature. Registra o que foi construído, as regras de negócio, a arquitetura por camada, o rollout em produção, os follow-ups pós-validação e as lições. Referência de inspiração (só visual): tela "HISTÓRICO DE ATENDIMENTO" do ChatGuru — a identidade final usa os tokens GALLO.

---

## 1. O que foi entregue

Duas frentes ligadas, pedidas juntas:

### Frente 1 — Encerramento (eixo "encerrado")

`resolvida` ∪ `arquivada` passam a se comportar como um **único eixo terminal ("encerrado")**:

- **Some da lista** do Inbox por padrão (continua acessível por filtro explícito).
- Fica **sem dono** (desatribuída automaticamente ao encerrar).
- Quando **o cliente manda mensagem de novo**, a conversa **reabre em fila** (`aguardando`) no topo, com o chip "em fila".

### Frente 2 — Histórico de atendimento (por cliente)

Uma **timeline append-only** do ciclo de atendimento do **cliente inteiro** (não de uma conversa só), exibida:

- no **rail da conversa** (painel lateral, variante `Sheet`);
- na **ficha do cliente** (aba "Histórico", variante inline — espelha o padrão da aba "Mídias").

Cada evento mostra: badge de status colorido, quem mudou (atendente ou **"Sistema"**), timestamp relativo e duração em cada etapa. Layout **híbrido B+C**: um card colapsável por conversa (o mais recente já aberto) com um trilho conectado de transições dentro.

---

## 2. Regras de negócio

| Situação | Comportamento |
| --- | --- |
| Encerrar (resolver/arquivar) uma conversa com dono | Atômico: status terminal **+** dono `null` **+** `is_sdr_active=false` em um único UPDATE (RPC `close_conversation`). |
| Conversa terminal na fila (`aguardando`) sendo desatribuída | Isenta do "requeue" — terminal nunca volta para `aguardando` por desatribuição. |
| **Inbound do cliente** (mensagem recebida) numa conversa encerrada | **Reabre** para `aguardando` (topo da fila). |
| **Eco do celular** (mensagem enviada pelo aparelho / outbound) | **NÃO reabre** — não reusa a conversa terminal; uma conversa nova é criada. |
| Reabertura manual (kebab) | Assume a conversa (`em_andamento`) — reabertura manual atômica dedicada ficou **deferida** (precisa de RPC próprio). |

O eixo terminal e o acoplamento status↔atribuição vivem em engine puro testado (`assignmentStatusCoupling`): `TERMINAL_STATUSES`, `statusOnUnassign` (isenta ambos os terminais), `coupleManualStatusChange` (+ ação `'close'`) e `reopenOnInbound`.

---

## 3. Arquitetura por camada

### 3.1 Banco (server) — emissão via trigger

Decisão-chave: a captura do histórico é feita por um **trigger `SECURITY DEFINER`** em `conversations`, não por chamadas explícitas por-RPC. Motivo: a desatribuição (`unassign`) é um `UPDATE` direto do cliente e não conseguiria emitir para uma tabela deny-write. O trigger captura **todos os caminhos** (RPCs, update direto, reabertura pelo webhook) de forma uniforme.

- **Tabela** `conversation_activity` (append-only): uma linha por transição, carregando os deltas de status **e** de dono; o `type` é derivado (`created` / `status` / `assignment` / `reopen`).
- **Ator**: resolvido via `current_seller_id()` — `NULL` = "Sistema".
- **Leitura**: RPC `get_customer_activity(p_customer_id uuid)`, gated (is_staff **OU** dono da carteira **OU** `can_access_conversation` em alguma conversa do cliente).

### 3.2 Engines puros (testados com Vitest)

- `providers/data/engine/assignmentStatusCoupling.ts` — eixo terminal + acoplamento.
- `providers/data/engine/conversationActivity.ts` — `deriveActivityDelta(before, after, actorId)`, espelho em TS do trigger SQL (usado pelo mock para paridade).
- `features/attendance-history/engine/attendanceTimeline.ts` — `buildAttendanceTimeline` agrupa eventos por conversa, calcula duração por nó e sumário (dono final, contagem, transferências).

### 3.3 Tipos de domínio

`AttendanceActivityType` + `IConversationActivityEvent` em `shared/types/conversation.ts` (re-exportados no barrel).

### 3.4 Camada de dados (Provider Pattern)

- Novo provider **`activity`** com `getCustomerActivity` — mock e supabase em paridade, via `@/providers/data`.
- `conversations.close()` (contrato novo) — mock + supabase; o supabase chama a RPC `close_conversation`.
- **Cache isolado**: nova query key `["customer-activity", customerId]`. O cache do atendimento (signing em lote #137, Realtime, query keys existentes, RPCs gated-once) foi **mantido congelado** — nada tocado.

### 3.5 Webhook (recepção real)

`reopenConversation` no `webhook/core.ts` (+ espelho `_shared/` + `functions/whatsapp-webhook/index.ts`): `findOpenConversation` ganhou o parâmetro `includeTerminal` — `true` no caminho inbound (reabre), `false` no eco (não reusa terminal, cria nova). Predicado local `TERMINAL_STATUSES`/`reopenOnInbound`.

### 3.6 Frontend

- `features/attendance-history/`: `AttendanceHistoryPanel` (Sheet no rail + inline na ficha), `hooks/useCustomerActivity`, `engine/attendanceTimeline`, `utils/` (`formatDuration`, `eventDescription`), `i18n/pt-BR`.
- Montagem: rail da conversa **e** aba "Histórico" da ficha.

### 3.7 Mock (paridade determinística)

`mocks/api/conversationActivity.ts`, `mocks/api/_emitConversationActivity.ts` (emissão centralizada espelhando o trigger), edições em `mocks/api/conversations.ts` (close + emissão no update) e `mocks/api/messages.ts` (`simulateIncoming` reabre no inbound).

---

## 4. Migrations e RPCs

Todas **versionadas em `supabase/migrations/`** e **aplicadas em produção** (`njizaasajkdqptlxddqn`, 2026-07-03, com OK do dono):

| Arquivo | Conteúdo |
| --- | --- |
| `20260703170000_conversation_activity.sql` | Tabela `conversation_activity` + trigger `conversation_activity_capture` + RPC `get_customer_activity`. Trigger **LIVE**. |
| `20260703171000_close_conversation_rpc.sql` | RPC `close_conversation(p_conversation_id uuid, p_status text)` (terminal + desatribuir, atômico). |
| `20260703172000_backfill_conversation_activity.sql` | Backfill best-effort a partir do `audit_logs`. |

**Backfill = 0 linhas** por design: o `audit_logs` de produção só tem a ação `seed_conversations_archived` (não há `conversation.status_change/resolve/archive`). A timeline é completa **daqui pra frente**; histórico anterior à tabela não é reconstruível.

---

## 5. Rollout em produção

Executado em ordem, com OK do dono em cada gate:

1. **3 migrations aplicadas** em prod (tabela+trigger+RPC, `close_conversation`, backfill).
2. **PR #227 mergeado** (frontend na `main` → deploy Vercel).
3. **`whatsapp-webhook` deployado v37** — `verify_jwt=false`, ACTIVE, via
   `npx supabase functions deploy whatsapp-webhook --project-ref njizaasajkdqptlxddqn --no-verify-jwt`.
   ⚠️ O `config.toml` **não** fixa `verify_jwt` para o webhook → o `--no-verify-jwt` é **obrigatório**, senão o endpoint vira privado e quebra Evolution/Meta.
4. **Version bump** v0.132.0 `Epilogue` (PR #228).

Encerramento, filtro, histórico e reabertura no inbound: **todos ativos em produção**.

---

## 6. Follow-ups pós-validação (2026-07-04)

Durante a validação em produção o dono reportou dois warnings de console. Investigados via systematic-debugging:

### 6.1 `Missing Description for {DialogContent}` — corrigido (PR #230, mergeado)

O `SheetContent` do shadcn/Radix é um `DialogContent` por baixo e exige `SheetDescription` ou `aria-describedby`. O `AttendanceHistoryPanel` renderizava o Sheet só com `SheetTitle`. **Fix:** `SheetDescription` screen-reader-only (`sr-only`) + string de i18n `panelDescription` — zero mudança visual ao layout aprovado. Build + 19 testes verdes.

### 6.2 `POST /rest/v1/audit_logs → 403` — pré-existente e sistêmico (issue #231, aberta)

**Não é desta feature.** A RLS `audit_logs_insert` exige `store_id = current_store_id()` (do JWT); o helper client-side `auditLog()` cai no `FALLBACK_STORE_ID` na corrida de hidratação do `MultistoreProvider` → descasamento → 403. É fire-and-forget engolido por `try/catch` (não quebra nada), mas a trilha de auditoria disparada por ~40 componentes client-side vem sendo perdida silenciosamente em prod. Prova de que não é da feature: o provider **supabase** de conversations não chama `auditLog`; a auditoria da feature é 100% server-side via trigger. Detalhes e 3 opções de remediação na **issue #231**.

---

## 7. Decisões e desvios

- **Trigger em vez de emissão por-RPC** (§3.1) — para capturar o `unassign` (UPDATE direto do cliente) de forma uniforme.
- **Uma linha por transição** carregando ambos os deltas (status + dono), `type` derivado — em vez de linhas separadas por dimensão.
- **Reabertura só no inbound** (eco não reabre) — evita que o eco do próprio aparelho reative uma conversa encerrada.
- **Enforcement do gate de leitura server-side** via RPC gated `get_customer_activity` — o painel nunca lê a tabela direto.
- **Deferidos:** reabertura manual atômica (precisa RPC dedicado); `createOutbound` não emite evento `created` (demo-only); enforcement da fila no webhook real (espelha o server-side deferido do PRD-212).

---

## 8. Lições

- **Stash compartilhado entre worktrees:** um subagente usou `git stash pop` e puxou arquivos de outra branch (`feat/inbox-wait-time-counter`) para dentro da worktree via o **stash global**, quebrando o build. Regra reforçada: **proibir `git stash` em prompts de subagente**; o stack de stash é global entre worktrees.
- **`audit_logs.actor_id` é `uuid` NOT NULL** (não `text`): o backfill tinha um guard de regex (`~`) sobre `actor_id` que estourava `operator does not exist: uuid ~ unknown`. Fix: remover o guard do `actor_id` (manter só o de `resource_id`, que é `text`).
- **Webhook precisa continuar público:** redeploy sem `--no-verify-jwt` o tornaria privado (o `config.toml` não fixa isso).
- **Cache do atendimento congelado:** toda a feature escopou uma query key nova e nunca tocou signing/realtime/RPCs gated-once existentes.

---

## 9. Referências

- **Spec:** `docs/superpowers/specs/2026-07-03-attendance-close-and-history-design.md`
- **Plano:** `docs/superpowers/plans/2026-07-03-attendance-close-and-history.md`
- **PRs:** #227 (feature), #228 (bump v0.132.0 `Epilogue`), #230 (fix a11y do Sheet)
- **Issue:** #231 (audit_logs 403 client-side — pré-existente)
- **Migrations:** `supabase/migrations/2026070317{0000,1000,2000}_*.sql`
- **Edge Function:** `whatsapp-webhook` v37 (público)
