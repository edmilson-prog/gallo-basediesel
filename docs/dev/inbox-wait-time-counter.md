# Contador de tempo de espera na fila do Atendimento

> **Documento técnico consolidado.** Cobre a feature de ponta a ponta, entregue em **duas ondas** (PR #226 e PR #229) em 2026-07-03. Ambas em produção.

## 1. Problema e objetivo

Nos cards do **Atendimento (Inbox)**, as conversas **"Em fila"** (aguardando, sem dono e sem SDR ativo) não davam nenhuma pista de **há quanto tempo o cliente estava esperando**. O objetivo foi exibir, de forma **discreta**, um contador de tempo de espera que:

- aparece **apenas** enquanto a conversa está na fila;
- **some sozinho** quando alguém assume (atribuição) **ou** responde;
- **não reinicia** quando o cliente manda mais mensagens enquanto espera;
- sobrevive a **reaberturas** (conversa resolvida que volta à fila reinicia a contagem).

## 2. Mapa de PRs e entregas

| PR | Escopo | Migration | Commits | Estado |
|----|--------|-----------|---------|--------|
| **#226** `feat/inbox-wait-time-counter` | Feature base: coluna + trigger, engine, plumbing, UI | `20260703140000_conversation_queued_at.sql` | spec `aadb7a8e` · plano `5802efa3` · engine `59ca9310` · plumbing `5cfecb2e` · UI `7e1e3a4b` · migration `3efb4268` | Merge `fb9f2857`, **em prod** |
| **#229** `feat/search-rpcs-queued-at` | Paridade na **busca**: os RPCs de busca passam a retornar `queued_at` | `20260703160000_search_rpcs_return_queued_at.sql` | spec `034df901` · plano `388cde61` · migration `d9ff701c` | Merge `548c9bea`, **em prod** |

> **Sem version bump / sem entrada no CHANGELOG.** Ambos foram fixes diretos (não PRDs), então nenhum recebeu bump próprio nem linha no `CHANGELOG.md`. A feature é funcional em produção, mas **invisível no changelog** — ver §9 (follow-ups) caso se queira registrá-la num release futuro.

## 3. Arquitetura (como funciona)

### 3.1 Fonte da verdade: coluna `conversations.queued_at` + trigger

O tempo de espera **não** é derivado no frontend a partir de proxies. A verdade vive numa **coluna dedicada** `conversations.queued_at`, mantida por um **trigger no banco** que espelha exatamente a regra `isQueuedConversation` (`status = 'aguardando'` **e** sem `assigned_seller_id` **e** `is_sdr_active = false`):

- **entra/reentra na fila** → `queued_at := now()`;
- **sai da fila** → `queued_at := null`;
- **permanece na fila** (ex.: mais uma mensagem do cliente) → **mantém** o valor anterior.

Foram **recusadas** as alternativas sem backend: `last_message_at` (reinicia a cada mensagem recebida durante a espera) e `created_at` (quebra em reabertura — a conversa foi criada há muito tempo, mas voltou à fila agora). Só a coluna com trigger satisfaz os quatro requisitos do §1.

### 3.2 Engine puro `waitTime.ts`

Lógica de formatação e severidade isolada e testada (TDD), sem dependência de React/relógio:

- `WAIT_WARNING_MS = 10 min` (`600_000`), `WAIT_CRITICAL_MS = 30 min` (`1_800_000`);
- `waitSeverity(ms): "neutral" | "warning" | "critical"` — `>= 30min` crítico, `>= 10min` alerta, senão neutro;
- `formatWaitTime(ms)` em quatro faixas: `<1 min` · `N min` · `Hh MM` · `N d`.

### 3.3 Frontend

- **Tipo de domínio:** `IConversation.queuedAt?: ISO8601` (`src/shared/types/conversation.ts`).
- **Provider Supabase** (`src/providers/data/impl/supabase/conversations.ts`): `ConversationRow.queued_at`, incluído em `COLUMNS`, mapeado em `rowToConversation` como `queuedAt: row.queued_at ?? undefined`. **Não** entra em `conversationPatchToRow` — é coluna derivada, nunca escrita pelo app.
- **Mock** (`src/mocks/generators/conversation.ts`): gera `queuedAt = lastMessageAt` quando a conversa nasce na fila, senão `undefined`.
- **UI** (`src/features/conversations/components/ConversationListItem.tsx`): renderiza o contador no **canto superior direito** do card, apenas quando `isQueuedConversation(conversation) && waitMs >= 0`. Base do cálculo: `conversation.queuedAt ?? conversation.lastMessageAt` (o `??` é a rede de segurança para linhas pré-backfill). Atualiza a cada **60s** reusando o `useTimeTick` que o card já possui. Ícone `mdi:timer-outline` + `aria-label`.

### 3.4 Semáforo (tokens semânticos)

A cor mapeia a severidade via um record `WAIT_TONE`, sempre com **tokens semânticos** (nunca hex/`--gallo-*`):

| Faixa | Severidade | Token |
|-------|-----------|-------|
| `< 10 min` | neutral | `text-muted-foreground` |
| `10–30 min` | warning | `text-severity-warning` |
| `> 30 min` | critical | `text-severity-critical` |

## 4. Onda 1 — PR #226 (feature base)

### 4.1 Migration `20260703140000_conversation_queued_at.sql`

Ordem **importa** (o backfill precisa rodar **antes** do trigger existir, senão a atualização em massa seria interceptada e revertida):

1. `alter table … add column if not exists queued_at timestamptz`;
2. **backfill**: `queued_at = coalesce(last_message_at, created_at)` para as linhas atualmente na fila;
3. função `set_conversation_queued_at()` (`language plpgsql`, `set search_path = ''`);
4. trigger `trg_set_conversation_queued_at` **BEFORE INSERT OR UPDATE**.

### 4.2 O invariante do trigger

O núcleo correto é o ramo **"permaneceu na fila"**: quando a conversa continua na fila entre dois estados (`new_q` e `old_q` ambos verdadeiros), o trigger **não toca** `queued_at` — preserva o valor original (semântica de BEFORE-trigger). É isso que impede o reinício em rajada de mensagens. Confirmado que `conversations.status` é `NOT NULL` em prod, então o predicado nunca resulta `NULL`.

### 4.3 Validação (aplicada em prod, 2026-07-03)

`coluna existe` · `backfill 1998/1998` (100% da fila) · `0 linhas com queued_at fora da fila` · `trigger ativo` · `função com search_path=''`. Build verde + **1494 testes**.

## 5. Onda 2 — PR #229 (paridade na busca)

### 5.1 O buraco

A **listagem padrão** da fila já carregava `queued_at` (a coluna está em `COLUMNS`). Mas a **busca por texto** do Inbox não usa a listagem — usa dois RPCs `SECURITY DEFINER`:

- `search_conversations` — busca por **identidade do contato** (nome/telefone do cliente ou lead);
- `search_conversation_messages` — busca dedicada no **texto das mensagens**.

Nenhum dos dois **projetava** `queued_at`. Durante a busca, `row.queued_at` chegava `undefined`, o mapeador caía no fallback `lastMessageAt` e o contador exibia um valor **subestimado**. O plano do PR #226 deixou isso **fora de escopo por decisão** (os RPCs de busca são zona sensível de performance).

### 5.2 Migration `20260703160000_search_rpcs_return_queued_at.sql`

`DROP + CREATE` de **cada** RPC (não `CREATE OR REPLACE` — alargar o `RETURNS TABLE` muda o tipo de retorno, o Postgres recusa), reproduzindo o **corpo verbatim** das definições vigentes com **uma única adição** por função: `queued_at` no `RETURNS TABLE` (após `created_at`) e `c.queued_at` / `cc.queued_at` no `SELECT`. Os `revoke`/`grant` são **reemitidos** (somem no `DROP`).

### 5.3 Zero frontend

O provider **já** mapeava `queued_at` por **nome** nos dois caminhos de busca — `ConversationRow` declara a coluna, `ConversationMessageMatchRow` a herda, e `searchConversations`/`searchConversationMessages` reusam `rowToConversation`/`rowToConversationWithMatch`. Assim que o RPC projeta a coluna, o contador funciona na busca **sem tocar em `src/`**.

### 5.4 Desempenho

`queued_at` é **coluna de passagem** da mesma linha já varrida — **sem novo JOIN, predicado ou índice**. Custo idêntico. Foi exatamente por isso que dá para tocar os RPCs de busca com segurança apesar de serem zona sensível: não há alargamento de varredura, só uma coluna a mais na projeção.

### 5.5 Validação (aplicada em prod, 2026-07-03)

Pré-flight limpo (`dependent_objects = 0`, então o `DROP` não encontra dependência). Pós-aplicação: **estrutural** — ambos os RPCs expõem `queued_at` como coluna OUT (`timestamptz`); **dados** — 2006/2006 conversas em fila com `queued_at` preenchido, trigger da migration-mãe ativo em tempo real. **Smoke de UI validado pelo dono** (paridade lista ↔ busca com usuário logado). Build verde.

## 6. Rollout e a armadilha de ordem

O PR #226 tinha uma **armadilha real**: adicionar `queued_at` ao `COLUMNS` do SELECT faz o PostgREST devolver **400** (e o Atendimento inteiro deixa de carregar) enquanto a coluna não existir. **Ordem obrigatória:** aplicar a migration em prod **antes** de mergear/deployar o frontend. (No dev, que aponta para prod, o contorno é o modo Demonstração.) Isso espelha o padrão do PR #218 (anexos) — "coluna nova em `COLUMNS` ⇒ merge gated na migration".

O PR #229 **não** teve essa armadilha: sem mudança de frontend e com a coluna de retorno retrocompatível (`?? undefined`), a migration pôde ser aplicada isolada, em qualquer ordem.

## 7. Decisões e desvios

- **Reset da contagem** — some quando a conversa sai da fila, seja por **atribuição** **ou** por **primeira resposta** (ambos zeram `isQueuedConversation`). Não há timestamp de "parada" separado; a saída da fila é o evento.
- **Limiares fixos no código** (10/30 min), não configuráveis — YAGNI para o MVP.
- **Posição** canto superior direito, abaixo da data (layout escolhido no brainstorming com o visual companion).
- **Busca fora do escopo no #226**, corrigida no #229 — decisão consciente de não misturar uma feature cosmética com a zona sensível de performance dos RPCs de busca.
- **Sem validação em modo Demonstração no #229** — o fix vive no RPC do Supabase, que só roda com dados de produção; o mock usa outro caminho de busca. A única validação real é contra prod, após aplicar.
- **Sem version bump nos dois PRs** (não solicitado; fixes diretos).

## 8. Lições aprendidas

- **`git stash` é compartilhado entre worktrees.** Durante o #226, um subagente usou `git stash`/`pop` puro e puxou um WIP órfão de outra sessão (módulo inexistente `conversationActivity`, 4 arquivos mock), quebrando o build. Isolado em `.superpowers/sdd/orphan-conversationActivity-wip.patch` e revertido. **Nunca** usar `git stash` puro aqui — usar WIP commit.
- **Alargar `RETURNS TABLE` exige `DROP + CREATE`** (não `CREATE OR REPLACE`) e **reemitir os grants** (somem no `DROP`).
- **Coluna nova no `COLUMNS` do SELECT antes da migration = 400 em prod.** Migration sempre **antes** do deploy/merge do frontend que a referencia.

## 9. Limitações e follow-ups

- **Sem entrada no CHANGELOG.** A feature é user-facing mas não aparece no `CHANGELOG.md` (consequência da decisão de não bumpar). Registrar num release futuro se desejado.
- **`count_conversations` não precisou mudar** — retorna apenas contagem, não alimenta a renderização dos cards.
- **Nenhum follow-up funcional aberto** — a paridade na busca (o único buraco conhecido do #226) foi fechada pelo #229.

## 10. Referências

**Migrations**
- `supabase/migrations/20260703140000_conversation_queued_at.sql` (coluna + backfill + trigger)
- `supabase/migrations/20260703160000_search_rpcs_return_queued_at.sql` (RPCs de busca)

**Código (frontend)**
- `src/features/conversations/engine/waitTime.ts` (+ `waitTime.test.ts`)
- `src/features/conversations/components/ConversationListItem.tsx`
- `src/shared/types/conversation.ts`
- `src/providers/data/impl/supabase/conversations.ts`
- `src/mocks/generators/conversation.ts`

**Specs e planos (superpowers)**
- `docs/superpowers/specs/2026-07-03-inbox-wait-time-counter-design.md`
- `docs/superpowers/plans/2026-07-03-inbox-wait-time-counter.md`
- `docs/superpowers/specs/2026-07-03-search-rpcs-queued-at-design.md`
- `docs/superpowers/plans/2026-07-03-search-rpcs-queued-at.md`

**PRs**
- #226 — feature base (merge `fb9f2857`)
- #229 — paridade na busca (merge `548c9bea`)
