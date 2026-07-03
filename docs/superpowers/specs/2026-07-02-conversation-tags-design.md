# Tags de conversa + hub unificado de tags — Design

**Data:** 2026-07-02 · **Branch:** `feat/conversation-tags` · **Status:** aprovado pelo dono (brainstorming 2026-07-02)

## Contexto e problema

As tags exibidas hoje no filtro "Tags" da Inbox são **tags de cliente** (`customer.tags`), agregadas de até 500 clientes (`useAvailableTags`, `src/features/conversations/pages/InboxPage.tsx:35-56`). Em produção esse filtro está **inerte**: a query filtra a coluna `conversations.tags` (`.overlaps`, `src/providers/data/impl/supabase/conversations.ts:302`; `p_tags` nas RPCs de busca), que está sempre vazia — nenhum fluxo grava nela (creates inserem `[]`; não há UI). No mock o filtro "funciona" porque dobra tags de cliente/lead (`src/mocks/api/conversations.ts:92-101`), mascarando o gap.

Tags de conversa e tags de cliente são coisas distintas. Esta feature entrega **tags de conversa de verdade** (associação, exibição, filtro e catálogo gerenciado) e organiza a gestão das duas famílias num hub único.

## Decisões do dono (registro)

1. **Associação no painel de atendimento** — seção "Tags da conversa" na aba **Atendimento** da ficha lateral (`src/features/customers/components/tabs/AtendimentoTab.tsx`), que existe sempre como "casa" da associação.
2. **Layout do header parametrizável** — um parâmetro alterna 3 modos de exibição no header da conversa; **default = A (readonly)**, escolhido no visual companion.
3. **Somente Owner gerencia o catálogo** de tags de conversa (estrito — Gestor não edita).
4. **Filtro "Tags" da Inbox passa a operar só sobre tags de conversa** (opção 1). Tags de cliente continuam filtráveis na tela de Clientes.
5. **Hub unificado (opção "médio")** — a tela atual de tags de cliente vira a segunda aba de um hub, sem mudar seu comportamento nem seu gate atual (Owner+Gestor).
6. Atendente pode taguear conversa **atribuída a ele** e conversa **da fila** (policy de UPDATE vigente em prod já permite; verificado em `pg_policies` em 2026-07-02).

## 1. Modelo de dados

### Tabela nova `conversation_tags` (catálogo)

```sql
create table public.conversation_tags (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  label text not null,
  color text not null,          -- ID de cor da paleta curada (ex.: 'teal'), nunca hex livre
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index conversation_tags_store_label_uq
  on public.conversation_tags (store_id, lower(label));
create index conversation_tags_store_idx on public.conversation_tags (store_id);
```

- **RLS:** `select` para `authenticated` com `store_id = (select public.current_store_id())`; `insert/update/delete` **Owner-only estrito** — `(select public.current_app_role()) = 'owner' and store_id = (select public.current_store_id())` (padrão de `supabase/migrations/20260622130000_store_crud_owner_rpc.sql:26`).
- Escopo **por loja** (sem `store_id null` global) — consistente com `tagSuggestions` de cliente, que é per-store.
- **1 migration** (`supabase/migrations/20260703120000_conversation_tags_catalog.sql`), espelhada no Git no mesmo PR e aplicada via MCP **somente com OK do dono**, antes do merge.

### Associação: a coluna existente `conversations.tags text[]`

- Já existe com `not null default '{}'` e **índice GIN** (`supabase/migrations/20260608151350_create_conversations_table.sql:13,28`). Leitura pronta: `COLUMNS` inclui `tags`, `.overlaps` no list, `p_tags` nas RPCs `search_conversations`/`search_conversation_messages`.
- A coluna passa a guardar **IDs** de `conversation_tags` (uuid como texto). Consequências:
  - Renomear/recolorir/arquivar = 1 UPDATE no catálogo; propagação instantânea, **zero escrita em massa** (evita o risco de `statement_timeout` da lição #124).
  - O filtro envia IDs (não labels); `.overlaps`/`p_tags` funcionam sem mudança.
  - IDs uuid não colidem com o literal `demo-seed` usado pelas MVs de métricas.
- **Sem RPC de escrita**: `conversationsProvider.update(id, { tags })` já existe (`src/providers/data/contracts/conversations.ts:101`; `conversationPatchToRow` traduz `tags` em `src/providers/data/impl/supabase/conversations.ts:125`). Policy vigente em prod (verificada): USING `can_access_conversation(id)`; WITH CHECK `store_id = current_store_id() AND (is_staff() OR assigned_seller_id = current_seller_id() OR assigned_seller_id IS NULL)` — cobre atendente em conversa própria e da fila. Casos fora disso (ex.: externo em conversa de carteira atribuída a outro) falham na RLS e a UI trata com toast de erro.

### Parâmetro de layout do header

- `IPlatformSettings.conversationTags?: { headerMode: 'readonly' | 'quick-add' | 'band' }` — default `'readonly'`.
- Persistido no jsonb `stores.settings` via provider `settings` existente (`src/providers/data/impl/supabase/settings.ts:49-73`). É preferência de exibição, não fronteira de segurança; edição exposta **apenas na tela Owner** (a RLS de `stores_update` continua staff).

## 2. Camada de dados (Provider Pattern)

### Provider novo: `conversationTags`

- Contrato `IConversationTagsProvider` em `src/providers/data/contracts/`:
  - `list(storeId)` → todas (ativas + arquivadas; UI decide o que mostrar);
  - `create({ storeId, label, color })`, `update(id, patch)` (rename/recolor/archive/unarchive), `delete(id)`;
  - `usageCount(storeId)` → mapa tagId→nº de conversas (supabase: 1 count por tag via GIN `cs`/`ov`; aceitável para catálogo de ~10–30 tags; contagem reflete o que o papel do caller enxerga — na prática a tela é do Owner, que vê a loja toda).
- Implementações **mock primeiro** (Zustand mockStore + seed determinístico de 6–8 tags plausíveis: "Garantia", "Orçamento enviado", "Aguardando peça", "Revenda", "Pós-venda"…) e supabase. Registrar em `factory.ts`, `contracts/index`, hook `useConversationTagsProvider`.
- Cache TanStack: `["conversation-tags", storeId]` com staleTime de 30 min (mesmo valor usado pelo `TagsCard` para platform settings) + invalidação nas mutações do catálogo.

### Associação (feature `conversations`)

- Hook novo `useConversationTagsMutation(conversationId)`: mutação otimista — atualiza `["conversation-detail", conversationId]` via `setQueryData`, chama `conversations.update(id, { tags })`, rollback + `toast.error` em falha; sucesso → `recordAuditLog({ action: "conversation.tags_update", before, after })` (padrão `useSelfAssign.ts:58-66`) e `refetch()` da lista quando exposto no contexto da Inbox.
- **Camada congelada intocada:** nenhum toque em `useMessages`, `useRealtimeConversations`/`useRealtimeMessages`, query keys de mensagens, RPCs gated-once ou signing em lote. A lista da Inbox **não** é TanStack Query (`useConversationsList` é `useState`+`refetch`); o realtime existente (canal `conversations`, evento `*`, `src/shared/lib/realtime.ts:91`) já propaga o UPDATE e provoca refetch — comportamento constatado por leitura de código; smoke em prod na validação final.

## 3. UI — atendimento

Componentes novos em `src/features/conversations/components/` (+ engine em `src/features/conversations/engine/` ou `utils/`):

- **`ConversationTagChip`** — pill `rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] text-foreground` + dot colorido `size-2 rounded-full` (`style={{ backgroundColor: hex }}`, `aria-hidden`), truncamento `max-w-[7rem] truncate` + `title`. Gramática visual: tag = redonda com dot (identidade); status/severidade continuam `rounded-md` com tokens semânticos — ninguém confunde.
- **`ConversationTagPicker`** — `Popover` + `Command` (cmdk): busca, itens com dot + check, **multi-select sem fechar** (toggle in place), `Escape` fecha e devolve foco. Criação inline no `CommandEmpty` **somente Owner**. Aciona a mutação otimista.
- **Seção "Tags da conversa" na `AtendimentoTab`** — mais uma linha no padrão dos `ContextRow` (Status/Responsável/Origem), com chips + botão "+ Adicionar" (abre o picker). Gate de edição: `usePermission("conversation", "edit", "own")`; sem permissão, chips read-only.
- **Header (`ConversationHeader.tsx`)** — 3 modos pelo parâmetro:
  - `readonly` (default): até 3 chips + "+N" na linha de chips do título (junto de `TemperatureChip`); sem interação.
  - `quick-add`: idem + botão "+" discreto que abre o **mesmo** picker.
  - `band`: faixa dedicada sempre visível abaixo do header (padrão visual das faixas de escalação/e-commerce, `ConversationHeader.tsx:236-258`), com todos os chips (com "×" para remover) + botão "+ Tag".
- **Linha da Inbox (`ConversationListItem.tsx`)** — máx. **2 mini-chips + "+N"** na linha de badges (`:287-349`), com Tooltip listando as ocultas; preview da mensagem continua a informação primária.
- **Filtro "Tags" (`InboxFilters.tsx:370-400`)** — opções passam a vir do catálogo (`useConversationTagsProvider`), item com dot colorido, valor = **ID**; `useAvailableTags()` (agregação de customer.tags) é removido. Fix de carona: `onSelect={(e) => e.preventDefault()}` nos checkbox items para o menu não fechar a cada toggle (paridade com o filtro de Atribuição). Semântica OR entre selecionadas (comportamento `overlaps` atual). Tags arquivadas aparecem no filtro com sufixo "(arquivada)" apenas quando ainda houver conversa com elas.
- **Resiliência a IDs órfãos:** id no array sem correspondente no catálogo não renderiza chip; o picker mostra a associação e permite removê-la.
- **i18n:** grupo `tags` novo em `CONVERSATION_STRINGS` + strings do filtro em `INBOX_STRINGS` (`src/features/conversations/i18n/pt-BR.ts`); strings da seção da ficha em `CUSTOMER_STRINGS.atendimento`. pt-BR com acentos corretos.

### Paleta de cores curada

- Constante `TAG_PALETTE` (engine da feature): **8–10 entradas** `{ id, label pt-BR, hex }` (ex.: teal "Verde-água", violeta, âmbar-queimado, azul, rosa, índigo, laranja, ciano) no padrão `INSTANCE_PALETTE` (`src/features/conversations/utils/instanceAccent.ts` — "color encodes identity, never state").
- **Exclui** matizes das severidades (verde-sucesso, amarelo-warning, vermelho-crítico puros) e o verde WhatsApp.
- Persiste-se o **id** da cor; hex resolvido na render. Conferência de contraste do dot: **manual**, na rota `/design-system` (light e dark), como se faz com a `INSTANCE_PALETTE` — o rótulo textual sempre acompanha o dot, então a cor nunca é o único sinal (sem teste automatizado de razão de contraste).

## 4. UI — hub de gestão (Configurações → Atendimento → Tags)

A rota existente `/app/configuracoes/atendimento/tags` (gate `settings/view`, `src/routes/app.configuracoes.atendimento.tags.tsx`) passa a renderizar um **hub com 2 abas**:

1. **"Tags de conversa" (nova)** — layout no padrão da página existente (`SectionHeader` + cards `border bg-card` + lista `divide-y`):
   - Criar: input de label (validação: não vazio, ≤ 24 chars, dedup case-insensitive pt-BR) + **swatch grid** da paleta (botões `size-8 rounded-full`, `aria-label` com nome da cor, anel na selecionada) + **preview real do chip** ao vivo.
   - Lista: chip renderizado como aparece na Inbox + contagem "usada em N conversa(s)" + kebab com Renomear (Dialog), Trocar cor (Popover swatch), Arquivar/Reativar, Excluir.
   - **Arquivar ≠ excluir:** arquivada some do picker, permanece no histórico (chip com `opacity-60`). **Excluir só com uso = 0** no v1; com uso > 0 o `AlertDialog` destrutivo explica e oferece "Arquivar" como saída.
   - **Edição Owner-only** (`hasRole(["Owner"])` na UI + RLS estrita no banco); demais papéis com `settings/view` veem read-only.
   - **Seletor do parâmetro de layout do header** (A/B/C com descrição), Owner-only.
   - Auditoria: `settings.conversation_tag.create/rename/recolor/archive/delete`.
2. **"Tags de cliente"** — a `TagsSettingsPage` atual plugada como está (componente sem props, `src/features/admin-settings/pages/TagsSettingsPage.tsx`), gate interno atual preservado (edição Owner+Gestor). Sem mudança de comportamento.

Item do menu em `SettingsLayout` mantém a entrada única (rótulo "Tags").

## 5. Paridade mock

- Catálogo mock com seed determinístico; conversas seed recebem 0–3 tags (IDs do catálogo mock).
- `matchesTags` do mock (`src/mocks/api/conversations.ts:92-101`) muda para casar **apenas `conversation.tags`** (paridade com supabase e com a decisão do filtro).
- Creates mock/supabase continuam inserindo `tags: []` (webhook e import **não são tocados**).

## 6. Testes (Vitest, TDD nos engines)

- `tagCatalog` engine: normalização/dedup de label (case-insensitive pt-BR), validação de tamanho, resolução id→tag com órfãos, ordenação.
- Overflow de chips (função pura que corta em N + resto para header/inbox).
- `useInboxFilters.test.ts` atualizado (tags por ID).
- Testes do mock provider do catálogo (CRUD + archived).
- Gate prático de CI: `bun run build` + `bun run test`; `tsc` avaliado por delta.

## 7. Fora de escopo (deferido)

- Exclusão de tag **com** limpeza em massa das conversas (exigiria RPC SECURITY DEFINER dedicada — fase 2 se necessário).
- Tags automáticas no webhook/import (creates continuam `[]`).
- Nível "completo" da unificação com tags de cliente (cor/renomear/merge/contagem server-side para clientes).
- Métricas por tag no painel Atendimento de `/app/inicio` (candidato natural de evolução).
- Enforcement server-side de restrição das tags ao catálogo (v1 confia na UI; RLS de escrita continua a da conversa).

## 8. Riscos e mitigações

| Risco | Mitigação |
|---|---|
| Tocar sem querer a camada congelada do atendimento | Integração restrita a: mutação própria + `setQueryData` em `["conversation-detail", id]` + `refetch` da lista; revisão com checklist explícito |
| WITH CHECK de prod divergir do esperado | Verificado em `pg_policies` (2026-07-02); smoke pós-deploy cobre atendente + fila |
| Realtime não propagar update só-de-tags para não-staff | Constatação por código (canal `conversations` event `*`); smoke em prod na validação; fallback natural = refetch ao focar |
| Corrida no jsonb `stores.settings` (parâmetro de layout) | Mudança rara, Owner-only, mesma janela de risco já aceita para todos os settings |
| Filtro antigo na URL (labels de cliente em `?tags=`) | IDs não casam com labels antigos → filtro simplesmente não encontra; `parseTags` mantém-se tolerante |

## 9. Rollout

1. Implementação completa na worktree `feat/conversation-tags` (mock + supabase + testes verdes).
2. Migration `conversation_tags_catalog` aplicada via MCP **com OK do dono** (idempotente, espelhada no Git).
3. PR aberto (nunca merge sem OK); smoke do dono: criar tags, associar (ficha e header nos 3 modos), filtro da Inbox, arquivar/excluir, aba de cliente intacta.
4. Version bump MINOR + codinome no merge, conforme fluxo do projeto.
