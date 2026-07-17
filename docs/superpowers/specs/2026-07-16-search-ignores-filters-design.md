# Busca da Inbox ignora filtros + chip de atendente nos resultados — Design

- **Data:** 2026-07-16
- **Status:** Aprovado (brainstorming com o dono nesta data)
- **Origem:** Pós-rollout da busca por dígitos (PR #312): buscando `98888-4188` com o filtro
  "Atribuição: Atribuídas a mim" ativo, a Inbox retornou "Nada encontrado" — a conversa existe,
  mas está com outro atendente e estava resolvida (o filtro padrão "exceto fechadas" também a
  esconderia). O dono quer: busca com termo acha a conversa **independente dos filtros**, e o
  card do resultado mostra **com quem** a conversa está.

## Decisões de escopo (dono, 2026-07-16)

1. **Busca global total**: com termo ativo, TODOS os filtros são ignorados — status (inclui
   resolvidas/arquivadas), canal, instância, atribuição, tags, período e "Escaladas pelo SDR".
   A RLS continua governando (modelo 2 portões): ninguém vê o que não pode.
2. **Chip de atendente para não-staff só nos resultados de busca** — fora da busca a lista do
   vendedor permanece como hoje (chip segue staff-only). Staff continua vendo o chip sempre.
3. Ordenação durante a busca: fixa em "Mais recentes" (`last_message_at desc`) — as demais
   ordenações da UI ou embutem filtro (`waiting` força status aguardando) ou não são
   suportadas pela RPC de busca.

## Design

### 1. `filtersToListParams` — ramo de busca (função pura)

`src/features/conversations/hooks/useInboxFilters.ts:279`. Quando `filters.search.length > 0`
(mesmo critério que a linha 296 já usa), a função retorna **apenas**:

```ts
{ search: filters.search, orderBy: "lastMessageAt", orderDir: "desc" }
```

— sem `status` (RPC sem `p_status` ⇒ todos os status, incluindo fechadas), sem
`channel`/`whatsappAccountId`/`tags`/`assignmentAny`/`fromDate`. Sem termo: comportamento
atual inalterado. Vale automaticamente para os DOIS modos (lista e "Buscar nas mensagens" —
ambos consomem o mesmo `listParams`) e para o mock (paridade de graça: os filtros morrem antes
de chegar ao provider). Testes em `useInboxFilters.test.ts` cobrindo os dois ramos.

### 2. InboxPage — chip para todos durante a busca + escalated

`src/features/conversations/pages/InboxPage.tsx`:

- `const searchActive = filters.search.length > 0;`
- `showAssignee` (linha 57) passa de `isStaffView` para `isStaffView || searchActive`. O
  efeito que carrega `sellersById` (linhas 60–80) já é chaveado por `showAssignee` — o
  vendedor só carrega a lista de colegas quando busca. A RLS de `sellers` é por loja
  (`sellers_select: store_id = current_store_id()`), então não-staff já pode ler os nomes —
  **sem mudança de banco**. O `ConversationListItem` já renderiza o `AssigneeChip` quando
  `showAssignee && assignedSeller` — zero mudança no componente.
- O pós-filtro client-side de escaladas (linhas 154–157) ganha o mesmo bypass:
  `if (!filters.escalated || searchActive) return rawItems;`.

### 3. InboxFilters — feedback visual

`src/features/conversations/components/InboxFilters.tsx`: com busca ativa, exibir nota
discreta **"Filtros ignorados durante a busca"** (texto muted, ícone informativo) junto ao
cabeçalho do painel, e esmaecer (`opacity`) o bloco de chips de filtro — que permanecem
clicáveis (as escolhas persistem na URL e voltam a valer quando a busca é limpa). String em
pt-BR com acentos corretos, adicionada ao módulo de i18n da feature
(`src/features/conversations/i18n/pt-BR.ts`, no objeto de strings da Inbox já importado pelo
componente).

### 4. Fora de escopo / invariantes

- Nenhuma migration, nenhuma mudança de RPC ou de RLS.
- Cache do atendimento (signing/realtime/query keys/RPCs gated-once) **não é tocado**.
- O donut de status do topo continua descrevendo a Inbox inteira (não muda com a busca).
- `count()` não roda em modo busca (o total já vem da própria RPC de busca) — nada a fazer.

## Testes e validação

- `useInboxFilters.test.ts`: (a) com busca — só `search`/`orderBy`/`orderDir` presentes,
  demais chaves ausentes mesmo com todos os filtros setados; (b) sem busca — snapshot atual
  preservado (casos existentes seguem verdes).
- Gate: `bun run test` + `bun run build`; tsc por delta.
- Smoke do dono: repetir a busca do print (`98888-4188` com "Atribuídas a mim" ativo) → deve
  achar a conversa resolvida do +55 33 8888-4188 exibindo o chip do atendente.

## Rollout

PR único (sem migration). Sem ordem especial de deploy. Merge só com OK do dono.
