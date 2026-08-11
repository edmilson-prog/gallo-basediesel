# Conversas fixadas no Inbox — Design

> **Data:** 2026-08-11
> **Branch:** `feat/inbox-conversas-fixadas`
> **Estado:** spec aprovada pendente de revisão do dono
> **Área:** `src/features/conversations/`, `src/features/admin-settings/`, `src/providers/data/`, `supabase/migrations/`

---

## 1. Problema

O Inbox ordena por "Mais recentes". Uma conversa importante — o cliente que vai fechar
pedido amanhã, o orçamento que depende de uma peça chegando — envelhece e afunda na lista à
medida que o tráfego novo empurra tudo para baixo. Com 3.634 conversas e 179 não lidas, o
atendente perde de vista o que ele mesmo decidiu que era prioritário e passa a caçar pela
busca.

Não existe hoje nenhuma forma de o atendente marcar "essa aqui fica à mão". O que existe é o
oposto: a lista decide a ordem por recência, e o atendente obedece.

## 2. Decisões do dono (2026-08-11)

| # | Decisão | Escolha |
|---|---|---|
| D-1 | Escopo do pin | **Pessoal por atendente** — fixar não muda o Inbox de mais ninguém |
| D-2 | Onde vive o limite | **Configurações → Atendimento, por loja** (Owner define para todos) |
| D-3 | Pin vs. filtros | **Sempre no topo, ignorando os filtros** — exceto durante busca por texto |
| D-4 | Limite padrão | **5**, ajustável de 1 a 20 |

## 3. Restrições que moldaram o desenho

Três fatos do repositório que o desenho respeita — não são preferência, são cerca:

1. **O cache do Atendimento está congelado por ordem expressa** (2026-06-23): signing de mídia
   em lote, realtime de mensagens/conversas e as query keys de mensagens não podem ser
   tocados. O desenho é **aditivo** — `useConversationsList`, `useRealtimeMessages`,
   `useSeedSignedMediaUrls` e `useResolvedMediaUrl` ficam byte-a-byte iguais.
2. **O hot path do Inbox já derrubou produção por `statement_timeout`** (2026-07-02): a RLS
   por-linha (`can_access_conversation`) reavaliada sobre todo o conjunto candidato. Por isso
   **nenhuma coluna nova em `conversations`** e nenhuma alteração na query de listagem —
   as fixadas são um segundo fetch, limitado a no máximo 20 ids.
3. **Migration não sobe sozinha.** Vai versionada em `supabase/migrations/` no PR, mas a
   aplicação em produção é manual e exige OK explícito do dono.

## 4. Modelo de dados

### 4.1 Tabela `conversation_pins`

```sql
create table if not exists public.conversation_pins (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  seller_id       uuid not null references public.sellers(id) on delete cascade,
  store_id        uuid not null references public.stores(id),
  created_at      timestamptz not null default now(),
  primary key (seller_id, conversation_id)
);

create index if not exists conversation_pins_seller_created_idx
  on public.conversation_pins (seller_id, created_at desc);
```

A PK composta `(seller_id, conversation_id)` já é o índice de leitura principal (todo SELECT
filtra por `seller_id`) e, de quebra, torna o duplo-pin impossível no banco em vez de só na
UI. O `on delete cascade` em `conversation_id` limpa o pin se a conversa for removida.

**RLS** — só o dono do pin lê e escreve o próprio, dentro da loja ativa:

```sql
alter table public.conversation_pins enable row level security;

create policy "conversation_pins_select"
  on public.conversation_pins for select to authenticated
  using (
    seller_id = (select public.current_seller_id())
    and store_id = (select public.current_store_id())
  );

create policy "conversation_pins_insert"
  on public.conversation_pins for insert to authenticated
  with check (
    seller_id = (select public.current_seller_id())
    and store_id = (select public.current_store_id())
  );

create policy "conversation_pins_delete"
  on public.conversation_pins for delete to authenticated
  using (seller_id = (select public.current_seller_id()));

grant select, insert, delete on public.conversation_pins to authenticated;
```

Sem policy de UPDATE: fixar e desafixar são INSERT e DELETE. As funções `current_seller_id()`
e `current_store_id()` são as mesmas já usadas por `conversation_notes`.

**O pin não é um portão de acesso.** A tabela guarda apenas a intenção "quero essa à mão"; ler
a conversa continua governado pela RLS de `conversations` (modelo de 2 portões). Se o
atendente perder acesso à instância ou à carteira, a conversa fixada simplesmente não volta no
fetch e o bloco não a renderiza — sem erro, sem vazamento. O pin órfão fica no banco, inerte,
e some quando o atendente desafixar (ou quando a conversa for deletada).

### 4.2 Parâmetro do limite

Vai em `stores.settings` (jsonb) — sem migration:

```ts
/** Conversas fixadas do Inbox (spec 2026-08-11). Ausente ⇒ DEFAULT_INBOX_PINS_SETTINGS. */
export interface IInboxPinsSettings {
  /** Teto de conversas fixadas por atendente. 1–20. */
  maxPinned: number;
}
```

Adicionado a `IPlatformSettings` como `inboxPins?: IInboxPinsSettings`, com
`DEFAULT_INBOX_PINS_SETTINGS = { maxPinned: 5 }` em
`src/features/conversations/config/pinDefaults.ts`. Chave opcional, como `idleAlerts` e
`echoContinuity` — lojas legadas caem no default sem migração de dados.

## 5. Camada de dados (Provider Pattern)

### 5.1 Contrato novo

`src/providers/data/contracts/conversationPins.ts`:

```ts
export interface IConversationPin {
  conversationId: ID;
  sellerId: ID;
  storeId: ID;
  createdAt: ISO8601;
}

export interface IConversationPinsProvider {
  /** Pins do atendente, mais recente primeiro. */
  list(sellerId: ID): Promise<IConversationPin[]>;
  pin(input: { conversationId: ID; sellerId: ID; storeId: ID }): Promise<IConversationPin>;
  unpin(conversationId: ID, sellerId: ID): Promise<void>;
}
```

O `sellerId` é explícito mesmo no supabase (onde a RLS já o imporia) — mantém o mock honesto e
o índice usado.

Implementações em `impl/mock/conversationPins.ts` e `impl/supabase/conversationPins.ts`,
registradas em `factory.ts` (duas entradas, `conversationPins:`), com o hook
`hooks/useConversationPinsProvider.ts` exportado pelo barrel `@/providers/data` e o tipo
reexportado em `contracts/index.ts` — o caminho que todo provider do projeto já segue.

O mock guarda os pins no store Zustand da camada de mocks, na mesma forma da tabela.

### 5.2 Busca das conversas fixadas

`IListConversationsParams` ganha um campo:

```ts
/** Restringe a estes ids (bloco de fixadas do Inbox). Lista curta — nunca a lista inteira. */
ids?: ID[];
```

- **supabase** (`impl/supabase/conversations.ts:list`): `query = query.in("id", params.ids)`,
  junto dos outros filtros, antes do `.range()`. Com `withTotal: false` e no máximo 20 ids, a
  RLS por-linha roda sobre 20 linhas — não sobre o conjunto candidato inteiro.
- **mock** (`src/mocks/api/conversations.ts`): `filtered = filtered.filter(c => set.has(c.id))`
  junto dos filtros existentes.

Um array vazio nunca chega ao provider — o hook curto-circuita antes (§6.1). O tamanho é
naturalmente limitado pelo teto (≤ 20), então não reencosta no overflow de URL do `.in()` que
já mordeu analytics.

## 6. Camada de feature

### 6.1 `usePinnedConversations(sellerId, storeId, options)`

Novo hook em `src/features/conversations/hooks/`. Responsabilidade única: devolver as conversas
fixadas do atendente, prontas para render.

- Lê os pins via `useConversationPinsProvider` com TanStack Query, key
  `["conversation-pins", sellerId]` — **key nova, não colide com nenhuma existente**.
- Com a lista de ids, busca as conversas por `list({ ids, withTotal: false, pageSize: 20 })`,
  key `["pinned-conversations", sellerId, idsKey]`. Sem ids → não dispara fetch nenhum.
- Ordena o resultado por `lastMessageAt` desc (a mesma leitura de recência da lista; a ordem em
  que foram fixadas não importa para quem olha).
- `refetch()` disparado quando o `realtime.tick` do Inbox muda, com o mesmo debounce de 300ms
  que a lista usa — assim o preview da fixada não fica velho. Isso **consome** o tick que o
  `useRealtimeConversations` já emite; não cria assinatura nova nem toca no realtime existente.
- Expõe `pinnedItems`, `pinnedIds` (Set), `isPinned(id)`, `pin(id)`, `unpin(id)`,
  `canPin`, `maxPinned`, `pinnedCount`.
- `pin`/`unpin` invalidam a key dos pins e fazem update otimista da lista local, com rollback
  em falha e `toast.error(INBOX_STRINGS.actionFailed)` — o padrão das outras mutações do Inbox.

Sem `sellerId` (perfil sem vendedor vinculado), o hook devolve estado vazio e `canPin: false` —
a UI de fixar não aparece. Não é caso de erro: quem não é vendedor não tem conversa atribuída.

### 6.2 Engine puro `engine/pinPolicy.ts`

Toda a regra testável fica fora do React:

```ts
/** Pode fixar mais uma? Falso ao atingir/ultrapassar o teto — nunca desafixa por conta própria. */
export function canPinMore(pinnedCount: number, maxPinned: number): boolean;

/** Teto saneado: inteiro em [1, 20]; valor ausente/inválido → 5. */
export function resolveMaxPinned(raw: number | undefined): number;

/** O bloco de fixadas aparece? Some durante busca por texto e no modo "buscar em mensagens". */
export function shouldShowPinnedBlock(ctx: {
  searchActive: boolean;
  messageSearchActive: boolean;
  pinnedCount: number;
}): boolean;

/** Lista de exibição: fixadas no topo, seguidas da lista normal SEM os ids já fixados. */
export function mergePinnedFirst(
  pinned: IConversation[],
  list: IConversation[],
): { items: IConversation[]; pinnedCount: number };
```

`mergePinnedFirst` é o ponto central do desenho: a página passa a renderizar **uma lista só**
(`displayItems`) com um contador de corte. Isso não é só cosmético — resolve de graça quatro
comportamentos que quebrariam se o bloco fosse uma lista paralela:

| Comportamento | Por que quebraria com lista paralela |
|---|---|
| Setas ↑/↓ | A navegação salta as fixadas (percorre só `items`) |
| Zerar o badge ao abrir | O efeito procura a conversa em `rawItems`; a fixada fora da janela não está lá |
| Reabrir a última conversa | `items.find(lastId)` falha se a última era uma fixada fora da janela |
| Linha duplicada | A fixada que também está na página 1 apareceria duas vezes |

`displayItems` também é o que a página passa para `useRelatedEntities` (contatos e preview da
última mensagem), no lugar de `items`. O hook **não muda** — só recebe uma lista maior, e seu
cache por id já evita re-buscar quem ele conhece. Uma chamada em lote, não duas.

### 6.3 UI

**Bloco no topo da lista** (`InboxPage`): cabeçalho discreto "Fixadas · 3/5" antes do índice 0
e um separador antes do índice `pinnedCount`, ambos só quando os dois lados existem. As linhas
usam o mesmo `ConversationListItem`, com um ícone `mdi:pin` pequeno junto ao horário para
distinguir a fixada da conversa comum. Tokens semânticos apenas (`text-muted-foreground`,
`border-border`) — nada de primitivo `--gallo-*`.

**Gesto de fixar** em dois lugares, o mesmo par de sempre:

- `QuickActions` (hover na linha): botão de pin, `mdi:pin-outline` ↔ `mdi:pin-off-outline`,
  com tooltip "Fixar conversa" / "Desafixar". Ao lado das ações que já existem, respeitando o
  `conversation.isAccessible === false` que já esconde o grupo inteiro.
- `ConversationMenu` (kebab da conversa aberta): item "Fixar conversa" / "Desafixar conversa".

**Sem gate de permissão.** Fixar é preferência pessoal sobre uma conversa que o atendente já
enxerga; não altera dado de negócio nem a visão de terceiros. Quem vê a conversa pode fixá-la
para si. Também **sem audit log** — trilha de auditoria é para mutação de negócio, e isso não é.

**Limite atingido:** o botão fica desabilitado com tooltip explicando, e o item do kebab dispara
`toast.info("Limite de N conversas fixadas — desafixe uma para fixar outra.")`. Nunca desafixo
nada automaticamente.

**Teto reduzido depois:** se o Owner baixar `maxPinned` abaixo do que alguém já fixou, as
fixadas existentes **continuam todas visíveis** (o contador mostra "7/5") e novos pins ficam
bloqueados até o atendente desafixar. Nada some silenciosamente — a alternativa (cortar no
render) esconderia conversa sem o dono do pin saber.

**Durante busca:** o bloco some inteiro (D-3). A busca já é global por decisão do dono — ela
ignora todos os filtros — e um bloco fixo acima do resultado só competiria com o que foi
buscado. Ao limpar a busca, o bloco volta.

## 7. Configuração

Nova tela **Configurações → Atendimento → "Conversas fixadas"**:

- Rota `src/routes/app.configuracoes.atendimento.fixadas.tsx`, com o mesmo
  `requireAuth(location.pathname, ["Owner"], { resource: "settings", action: "edit" })` das
  vizinhas — **sem recurso RBAC novo**, portanto sem seed no banco.
- Item em `SettingsLayout` no grupo de Atendimento (`roles: ["Owner"]`, ícone `mdi:pin-outline`).
- `InboxPinsSettingsPage` em `src/features/admin-settings/pages/`, um campo numérico (1–20) com
  texto de ajuda, no formato das outras telas do grupo.
- Hook `useInboxPinsSettings(storeId)` espelhando `useIdleAlertsSettings`: lê
  `platform.inboxPins`, escreve via `provider.update(storeId, { inboxPins })` e grava
  `auditLog({ action: "inbox_pins_settings.update", ... })` — aqui a auditoria **é** devida,
  porque muda regra da loja.

## 8. Testes (Vitest)

`engine/pinPolicy.test.ts` cobre o que tem regra:

- `canPinMore`: abaixo do teto → true; no teto → false; acima do teto (teto reduzido depois)
  → false.
- `resolveMaxPinned`: ausente → 5; `0` → 1; `999` → 20; `7.5` → 7; `NaN` → 5.
- `shouldShowPinnedBlock`: zero fixadas → false; busca ativa → false; modo mensagens → false;
  caso normal → true.
- `mergePinnedFirst`: dedupe (fixada que também está na página 1 aparece uma vez, no topo);
  `pinnedCount` correto; listas vazias dos dois lados; ordem preservada.

Sem teste de UI — o projeto não tem Testing Library montado, e a validação visual é do dono.

## 9. Arquivos

**Novos**

| Arquivo | Papel |
|---|---|
| `supabase/migrations/<ts>_conversation_pins.sql` | tabela + RLS + grants |
| `src/providers/data/contracts/conversationPins.ts` | contrato |
| `src/providers/data/impl/mock/conversationPins.ts` | impl mock |
| `src/providers/data/impl/supabase/conversationPins.ts` | impl supabase |
| `src/providers/data/hooks/useConversationPinsProvider.ts` | hook do provider |
| `src/features/conversations/engine/pinPolicy.ts` (+ `.test.ts`) | regra pura |
| `src/features/conversations/hooks/usePinnedConversations.ts` | leitura + mutação |
| `src/features/conversations/config/pinDefaults.ts` | `DEFAULT_INBOX_PINS_SETTINGS` |
| `src/features/admin-settings/hooks/useInboxPinsSettings.ts` | settings da loja |
| `src/features/admin-settings/pages/InboxPinsSettingsPage.tsx` | tela |
| `src/routes/app.configuracoes.atendimento.fixadas.tsx` | rota |

**Alterados**

| Arquivo | Mudança |
|---|---|
| `src/shared/types/platform.ts` | `IInboxPinsSettings` + `inboxPins?` em `IPlatformSettings` |
| `src/providers/data/contracts/conversations.ts` | `ids?: ID[]` em `IListConversationsParams` |
| `src/providers/data/impl/supabase/conversations.ts` | `.in("id", params.ids)` no `list` |
| `src/mocks/api/conversations.ts` | filtro por `ids` |
| `src/providers/data/factory.ts` | registro do provider (mock + supabase) |
| `src/providers/data/index.ts`, `contracts/index.ts` | exports do barrel |
| `src/features/conversations/pages/InboxPage.tsx` | `displayItems`, bloco fixadas, separador |
| `src/features/conversations/components/QuickActions.tsx` | botão de pin |
| `src/features/conversations/components/ConversationMenu.tsx` | item de pin |
| `src/features/conversations/components/ConversationListItem.tsx` | ícone de fixada |
| `src/features/conversations/i18n/pt-BR.ts` | strings novas |
| `src/features/shell/layouts/SettingsLayout.tsx` | item de menu |
| `src/features/admin-settings/index.ts`, `conversations/index.ts` | barrels |

**Intocados por decisão:** `useConversationsList.ts`, `useRealtimeConversations.ts`,
`useRealtimeMessages.ts`, `useMessages.ts`, `useSeedSignedMediaUrls.ts`,
`useResolvedMediaUrl.ts`, `useConversationMessageMedia.ts` e qualquer query key de
mensagem/mídia.

## 10. Riscos

| Risco | Mitigação |
|---|---|
| Migration não aplicada → tela quebra | O `list` do provider supabase trata **apenas** `42P01` (relação inexistente) como "zero pins" e reporta uma vez via `captureObservabilityException`: o Inbox segue idêntico ao de hoje, sem bloco e sem toast. Qualquer outro erro propaga normalmente — nada de engolir falha de RLS ou de rede. A feature fica inerte até a migration subir. |
| Fetch extra no Inbox | Um `select` de ≤ 20 linhas por carga, `withTotal: false`, só quando há pins. Sem pin nenhum (estado inicial de todo mundo), custo zero. |
| Pin órfão após perda de acesso | Não renderiza (RLS de `conversations`); some ao desafixar. Sem erro visível. |
| Conflito de merge em `routeTree.gen.ts` | Arquivo gerado — descartar e regenerar, conforme o hábito do repositório. |

## 11. Fora de escopo

- Fixar em nome de outro atendente, ou pin global da loja (D-1 decidiu pessoal).
- Reordenar manualmente as fixadas (arrastar) — elas seguem a recência.
- Pin no PWA do vendedor externo e no portal B2B — só o Inbox web nesta entrega.
- Backfill ou sugestão automática do que fixar.
- Bump de versão e changelog: entram no fechamento, não neste PR.

## 12. Critérios de aceite

1. Fixo uma conversa pelo hover da linha; ela sobe para o bloco "Fixadas" e some da posição
   antiga — sem duplicar.
2. Troco o filtro de status/atribuição/instância: a fixada continua no topo.
3. Fixo uma conversa antiga que não está na primeira página; ela aparece no topo mesmo assim.
4. Fixo 5 e tento a 6ª: recebo o aviso do limite e nada é desafixado.
5. O Owner muda o teto para 3 em Configurações; um atendente com 5 fixadas continua vendo as 5
   e não consegue fixar mais.
6. Faço uma busca por texto: o bloco some. Limpo a busca: volta.
7. Outro atendente abre o mesmo Inbox e **não** vê minhas fixadas.
8. Navego com ↑/↓ do topo: a primeira parada é a primeira fixada.
9. `bun run test` e `bun run build` passam.
