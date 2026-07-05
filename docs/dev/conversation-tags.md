# Tags de conversa + hub unificado de tags

> **Status:** ✅ COMPLETO, MERGEADO e EM PRODUÇÃO
> **Release:** `v0.130.0` — codinome **Marker** (2026-07-03)
> **PR:** [#221](https://github.com/edmilson-prog/gallo-basediesel/pull/221) — merge commit `da7f1d09`
> **Migration:** `supabase/migrations/20260703120000_conversation_tags_catalog.sql` — **aplicada em produção** (2026-07-03, via MCP)
> **Spec:** `docs/superpowers/specs/2026-07-02-conversation-tags-design.md`
> **Plano:** `docs/superpowers/plans/2026-07-02-conversation-tags.md` (14 tasks TDD)

Documento de referência da feature. Consolida o que foi entregue, a arquitetura, o mapa de arquivos por camada, a associação de cada commit à seção da spec, o status de rollout e os itens deferidos.

---

## 1. Problema que a feature resolve

O filtro **"Tags"** da Inbox exibia **tags de cliente** (`customer.tags`, agregadas de até 500 clientes via `useAvailableTags`). Em produção esse filtro estava **inerte**: a query filtrava a coluna `conversations.tags` (`.overlaps` / `p_tags` nas RPCs de busca), que estava **sempre vazia** — nenhum fluxo gravava nela (creates inserem `[]`; não havia UI). No mock o filtro "funcionava" porque dobrava tags de cliente/lead, **mascarando o gap**.

Tags de conversa e tags de cliente são coisas distintas. Esta feature entrega **tags de conversa de verdade** (associação, exibição, filtro e catálogo gerenciado) e organiza a gestão das duas famílias num hub único.

---

## 2. O que foi entregue

| Bloco | Descrição |
|---|---|
| **Catálogo `conversation_tags`** | Tabela nova, por loja, RLS de escrita **Owner-estrita**. Os **IDs** das tags vivem na coluna já existente `conversations.tags text[]` (GIN + filtros prontos) — renomear/recolorir/arquivar **nunca reescreve conversas**. |
| **Associação no painel de atendimento** | Seção "Tags da conversa" na aba **Atendimento** da ficha; picker `Popover`+`cmdk` com busca, multi-seleção sem fechar, criação inline só para Owner; mutação **otimista** que toca apenas `["conversation-detail", id]` (zona congelada intacta). |
| **Header parametrizável** | 3 modos, default `readonly`: `readonly` (chips leitura), `quick-add` (chips + botão "+"), `band` (faixa dedicada com remover). Selecionável na tela de gestão. |
| **Chips** | Pill neutra (`rounded-full`) + dot colorido — gramática visual distinta de status/severidade (`rounded-md`). Mini-chips (2 + "+N") na linha da Inbox. |
| **Filtro "Tags" da Inbox** | Passa a operar **só sobre tags de conversa** (por ID, semântica OR). De carona, o menu deixa de fechar a cada clique (`onSelect preventDefault`, paridade com filtro de Atribuição). |
| **Hub de gestão** | `Configurações → Atendimento → Tags` com 2 abas: "Tags de conversa" (nova, Owner-only) e "Tags de cliente" (a tela existente, intacta). |

### Ajustes do smoke do dono (pós-review)

- **Normalização para MAIÚSCULAS** — tags de conversa são sempre criadas/renomeadas em uppercase (pt-BR), no ponto único `normalizeTagLabel`, tanto na UI (input + prévia ao vivo) quanto no banco. Dedup segue case-insensitive (índice único é `lower(label)`).
- **Cor personalizada** — além das 10 cores curadas (padrão recomendado), um seletor de cor nativo ao lado da última cor permite escolher um hex livre. `tagColorHex` resolve id-da-paleta **ou** hex no ponto único, então chips/prévia/filtro renderizam a cor custom em todo lugar.

---

## 3. Modelo de dados

### Tabela `conversation_tags` (catálogo)

```sql
create table public.conversation_tags (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  label text not null,
  color text not null default 'slate',   -- id de cor da paleta OU hex livre; resolvido no app
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index conversation_tags_store_label_uq on public.conversation_tags (store_id, lower(label));
create index conversation_tags_store_idx on public.conversation_tags (store_id);
```

- **RLS:** `SELECT` para qualquer membro autenticado da loja (`store_id = current_store_id()`); `INSERT/UPDATE/DELETE` **Owner-only estrito** (`current_app_role() = 'owner'`, fail-closed pela semântica NULL). 4 policies, 3 índices.
- Escopo **por loja** (sem `store_id null` global), consistente com `tagSuggestions` de cliente.

### Associação: coluna existente `conversations.tags text[]`

- Já existia com `not null default '{}'` e **índice GIN** (desde `20260608151350`). Leitura pronta: `.overlaps` no list, `p_tags` nas RPCs `search_conversations` / `search_conversation_messages`.
- A coluna passa a guardar **IDs** de `conversation_tags` (uuid como texto). Consequências:
  - Renomear/recolorir/arquivar = **1 UPDATE no catálogo**; propagação instantânea, **zero escrita em massa** (evita o risco de `statement_timeout` da lição #124).
  - O filtro envia IDs (não labels); `.overlaps` / `p_tags` funcionam sem mudança.
  - IDs órfãos (id no array sem correspondente no catálogo) simplesmente não renderizam chip; o picker permite remover.
- **Sem RPC de escrita** — `conversationsProvider.update(id, { tags })` já existia. A policy de UPDATE vigente em prod (verificada em `pg_policies`) cobre atendente em conversa **própria** e **da fila**. Casos fora disso falham na RLS e a UI trata com toast.

### Parâmetro de layout do header

- `IPlatformSettings.conversationTags?: { headerMode: 'readonly' | 'quick-add' | 'band' }`, default `'readonly'`.
- Persistido no jsonb `stores.settings` via provider `settings` existente. É preferência de exibição, **não** fronteira de segurança; edição exposta apenas na tela Owner.

---

## 4. Mapa de arquivos por camada (38 arquivos, +4293 −59)

### Domínio & engine (feature `conversations`)
- `src/shared/types/conversation.ts` (+17) — tipos de domínio de tag de conversa.
- `src/shared/types/platform.ts` (+10) — `IPlatformSettings.conversationTags.headerMode`.
- `src/shared/types/index.ts` (+3) — barrel.
- `src/features/conversations/engine/tagCatalog.ts` (+100) + `tagCatalog.test.ts` (+104) — **engine puro**: `TAG_PALETTE` (10 cores curadas), `normalizeTagLabel` (uppercase pt-BR), `validateTagLabel`, `resolveConversationTags`, `splitVisibleTags` (overflow), `tagColorHex` (id-da-paleta **ou** hex), `isCustomTagColor`.

### Provider Pattern (camada de dados — 39º provider)
- `src/providers/data/contracts/conversationTags.ts` (+35) — `IConversationTagsProvider` (`list`/`create`/`update`/`delete`/`usageCount`).
- `src/providers/data/contracts/index.ts` (+8), `src/providers/data/index.ts` (+5) — export pelo barrel público.
- `src/providers/data/impl/mock/conversationTags.ts` (+117) + `.test.ts` (+52) — mock determinístico (seed de tags plausíveis, agora UPPERCASE).
- `src/providers/data/impl/supabase/conversationTags.ts` (+102) — implementação real.
- `src/providers/data/hooks/useConversationTagsProvider.ts` (+6), `src/providers/data/factory.ts` (+4) — registro e hook.
- `src/providers/data/engine/buildDefaultSettings.ts` (+1) — default `headerMode: 'readonly'`.

### Hooks & componentes de atendimento (feature `conversations`)
- `src/features/conversations/hooks/useConversationTags.ts` (+31) — leitura do catálogo.
- `src/features/conversations/hooks/useConversationTagsMutation.ts` (+79) — **mutação otimista** (só `["conversation-detail", id]` + `refetch` da lista + audit `conversation.tags_update`).
- `src/features/conversations/hooks/useConversationTagsHeaderMode.ts` (+22) — lê o parâmetro (compartilha cache `platform-settings`; `.catch(() => null)` espelhando o `TagsCard`).
- `src/features/conversations/components/tags/ConversationTagChip.tsx` (+77), `ConversationTagPicker.tsx` (+152), `ConversationHeaderTags.tsx` (+83).
- `src/features/conversations/components/ConversationHeader.tsx` (+11), `ConversationListItem.tsx` (+10) — chips no header e mini-chips na linha.
- `src/features/conversations/components/InboxFilters.tsx` (+31/−…), `pages/InboxPage.tsx` (+34/−…) — filtro por catálogo, remoção de `useAvailableTags`.
- `src/features/conversations/hooks/useInboxFilters.test.ts` (+14) — filtro por ID.
- `src/features/conversations/i18n/pt-BR.ts` (+18) — strings.

### Ficha do cliente (feature `customers`)
- `src/features/customers/components/tabs/AtendimentoTab.tsx` (+31) — seção "Tags da conversa".
- `src/features/customers/i18n/pt-BR.ts` (+2).

### Hub de gestão (feature `admin-settings`) + shell
- `src/features/admin-settings/pages/ConversationTagsSettingsTab.tsx` (+519) — aba nova Owner-only (criar/renomear/recolorir/arquivar/excluir com uso, swatch grid + cor personalizada, seletor de header mode).
- `src/features/admin-settings/pages/TagsHubPage.tsx` (+25) — hub de 2 abas.
- `src/features/admin-settings/index.ts` (+1).
- `src/routes/app.configuracoes.atendimento.tags.tsx` (+4/−…) — rota renderiza o hub.
- `src/features/shell/layouts/SettingsLayout.tsx` (+2/−…) — rótulo de menu "Tags".

### Paridade mock
- `src/mocks/api/conversations.ts` (+10/−…) — `matchesTags` casa **apenas** `conversation.tags`.
- `src/mocks/generators/scriptedConversations.ts` (+34/−…) — conversas seed recebem IDs de tag do catálogo mock.

### Banco & docs
- `supabase/migrations/20260703120000_conversation_tags_catalog.sql` (+55).
- `docs/superpowers/specs/2026-07-02-conversation-tags-design.md` (+147), `docs/superpowers/plans/2026-07-02-conversation-tags.md` (+2396).

---

## 5. Commits → seção da spec

| Commit | Entrega | Spec |
|---|---|---|
| `6bc2828e` | docs: design spec | — |
| `1ccbd274` | docs: plano (14 tasks TDD) | — |
| `ed25b0b2` | tipos de domínio + engine `tagCatalog` | §1, §3 (paleta) |
| `b990716b` | fix: azul da paleta fora do hex sev-info dark (`#60a5fa`→`#3b82f6`) | §3 |
| `deb2aefb` | migration do catálogo (RLS owner-strict, ainda não aplicada) | §1 |
| `70da2cec` | contrato + mock provider + registro | §2 |
| `7832bb15` | supabase provider | §2 |
| `bd5035f5` | seeds com IDs de tag + filtro mock só-de-conversa | §5 |
| `85ad8a51` | chips + picker cmdk + mutação otimista | §3 |
| `e6b8ddae` | bloco de tags na aba Atendimento da ficha | §3 |
| `3ffe7502` | header parametrizado (readonly/quick-add/band) | §3 |
| `1eb2ad1e` | fix: espelhar queryFn do `TagsCard` no cache de settings | §2 |
| `7f7a19a6` | mini-chips na linha da Inbox | §3 |
| `16acf9a2` | filtro da Inbox dirigido pelo catálogo | §3 |
| `e174540e` | aba de gestão Owner-only | §4 |
| `aa5a73ec` | fix: error handling no save do header-mode + archive não-otimista | §4 |
| `a90e4324` | hub unificado (2 abas) | §4 |
| `3ba349ae` | chore: import não usado + comentário de RLS da migration | — |
| `d45c6180` | **normalização uppercase (UI + DB)** — smoke | pós-review |
| `25ad1e08` | **cor personalizada no swatch grid** — smoke | pós-review |
| `1e9178dc` | merge de `origin/main` (0.129.0) na branch | — |

---

## 6. Rollout — status

1. ✅ Implementação completa na worktree `feat/conversation-tags` (mock + supabase + testes verdes).
2. ✅ **Migration aplicada em produção** (2026-07-03, via MCP) — tabela + RLS owner-strict + 4 policies + 3 índices verificados. Nasce vazia; só é lida quando o código novo entra.
3. ✅ **PR #221 mergeado** (merge `da7f1d09`). Regra do dono respeitada: nunca merge sem OK.
4. ✅ **Version bump** `v0.130.0` Marker (CHANGELOG + `package.json` + `CLAUDE.md`), tag pushada.
5. ✅ **Em produção** — `crm.gallobasediesel.com.br` servindo a v0.130.0 (verificado HTTP 200).

**Gates de CI no merge:** `bun run test` 1409/1409 (1467 pós-merge com main) · `bun run build` OK · `tsc` delta 0 (baseline 333). Zona congelada do atendimento verificada intacta. Whole-branch review = **Ready to merge** (0 Critical/Important).

---

## 7. Fora de escopo (deferido — spec §7)

- **Limpeza em massa** das conversas ao excluir uma tag — IDs órfãos apenas deixam de renderizar (exigiria RPC `SECURITY DEFINER` dedicada).
- **Auto-tag no webhook/import** — creates continuam inserindo `[]`; o webhook real (`whatsapp-webhook`) **não é tocado**.
- **Enforcement server-side** de tag-contra-catálogo — v1 confia na UI; a RLS de escrita continua a da conversa.
- **Tag arquivada-mas-em-uso** não aparece no filtro da Inbox a menos que já selecionada (simplificação v1).
- **Menu "Trocar cor" (⋮)** ainda lista só as cores da paleta — o seletor livre de hex está apenas na criação por ora.
- **Métricas por tag** no painel Atendimento de `/app/inicio` — candidato natural de evolução.
- **Nível "completo" da unificação** com tags de cliente (cor/renomear/merge/contagem server-side para clientes).

---

## 8. Decisões & lições

**Decisões do dono (registro):**
1. Associação na aba **Atendimento** da ficha.
2. Header **parametrizável** em 3 modos, default `readonly`.
3. Catálogo **Owner-only estrito** (Gestor não edita).
4. Filtro da Inbox **só** com tags de conversa; tags de cliente seguem filtráveis na tela de Clientes.
5. Hub de 2 abas na rota existente; a tela de tags de cliente entra **intacta** como 2ª aba.
6. Pós-smoke: normalização uppercase e cor personalizada.

**Lições registradas:**
- **IDs no `text[]`, não labels** — desacopla exibição (rename/recolor) de armazenamento; propagação instantânea sem `UPDATE` em massa, matando o risco de `statement_timeout` (lição do #124).
- **Ponto único de normalização/cor** — `normalizeTagLabel` e `tagColorHex` centralizam o comportamento; uppercase e cor custom foram adicionadas sem espalhar branches pela UI.
- **Cache compartilhado exige queryFn idêntico** — `useConversationTagsHeaderMode` divide `["platform-settings", storeId]` com o `TagsCard`; faltava o `.catch(() => null)`, corrigido no `1eb2ad1e`.
- **Gramática visual** — tag = `rounded-full` + dot; status/severidade = `rounded-md` + token semântico. A cor nunca é o único sinal (rótulo textual sempre acompanha o dot).
- **Zona congelada do atendimento** — integração restrita a mutação própria + `setQueryData` em `["conversation-detail", id]` + `refetch` da lista. Nenhum toque em `useMessages`, realtime, RPCs gated-once ou signing em lote.
