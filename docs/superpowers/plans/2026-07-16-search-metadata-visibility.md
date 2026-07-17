# Busca acha conversas de outros atendentes (metadados, sem abrir) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> ⚠️ **Worktree:** todo o trabalho acontece em
> `D:\claude\gallo-basediesel\.claude\worktrees\investigate-msg-553398888`
> (branch `worktree-investigate-msg-553398888`). Subagente despachado DEVE começar com
> `cd "D:\claude\gallo-basediesel\.claude\worktrees\investigate-msg-553398888"` e conferir
> `git branch --show-current` == `worktree-investigate-msg-553398888` antes de qualquer edição.
> **NEVER use `git stash`.**

**Goal:** A busca da Inbox encontra conversas da mesma loja atribuídas a outros atendentes (metadados: existência + responsável), mas o clique não abre o thread — mostra um aviso "Em atendimento com {nome}". Conteúdo das mensagens segue protegido.

**Architecture:** 3ª redefinição da RPC `search_conversations` (arm de visibilidade de busca para quem opera instância + coluna `is_accessible` calculada por `can_access_conversation` nas linhas retornadas); mapeamento `isAccessible` no provider/tipo; guard de clique no `ConversationListItem` + toast na InboxPage. Spec: `docs/superpowers/specs/2026-07-16-search-metadata-visibility-design.md`.

**Tech Stack:** Postgres/PostgREST (Supabase), React 19, TypeScript strict, Vitest, sonner.

## Global Constraints

- Comentários em **inglês**; strings de UI em **pt-BR com acentos**; Conventional Commits em inglês, atômicos.
- Gate = `bun run test` + `bun run build`; tsc/eslint por delta (baseline pré-existente não conta; ruído CRLF do lint é falso positivo conhecido).
- Migration **só criada no Git** — NUNCA aplicar em prod (gate do dono, fora do plano). **NUNCA mergear o PR.**
- `search_conversation_messages`, `list_conversations`, `count_conversations`, `can_access_conversation`, RLS e RPCs do thread: **intocados**.
- Cache do atendimento: **intocado**.

---

### Task 1: Migration — arm de visibilidade + coluna `is_accessible`

**Files:**
- Create: `supabase/migrations/20260716233000_search_metadata_visibility.sql`
- Read (fonte do corpo): `supabase/migrations/20260716210000_digit_search_columns_and_rpc.sql:40-188` (seção 2 — definição vigente da RPC)

**Interfaces:**
- Consumes: definição vigente de `search_conversations` (17 parâmetros, criada hoje pela `20260716210000`).
- Produces: mesma assinatura de 17 parâmetros; RETURNS TABLE ganha `is_accessible boolean` (entre `is_collaborator` e `total_count`); Task 2 consome a coluna.
- ⚠️ SÓ cria o arquivo. NÃO aplicar em banco algum.

- [ ] **Step 1: Criar o arquivo copiando a definição vigente e aplicando EXATAMENTE 4 mudanças**

Criar `supabase/migrations/20260716233000_search_metadata_visibility.sql` com:

1. Cabeçalho de comentário:

```sql
-- Search finds conversations assigned to OTHER sellers — metadata only
-- (spec: docs/superpowers/specs/2026-07-16-search-metadata-visibility-design.md).
--
-- Owner decision (2026-07-16): an attendant searching a customer must FIND the
-- conversation and see WHO handles it, even when it is assigned to a colleague
-- — but must NOT open it (message content stays gated). Two changes:
--  1) a search-visibility arm in the access block: same-store conversations
--     with an assignee become visible to users operating >= 1 instance
--     (Financeiro/SDR keep seeing nothing);
--  2) is_accessible boolean in the result (can_access_conversation per
--     RETURNED row — page <= 30 rows, gated-once pattern preserved) so the
--     frontend blocks opening with a notice instead of navigating.
-- Same 17-arg signature ⇒ DROP by exact signature + re-grant (PostgREST
-- cannot change RETURNS TABLE via CREATE OR REPLACE: 42P13).
```

2. `drop function if exists public.search_conversations(text, uuid, text[], text, uuid, uuid, boolean, boolean, text[], timestamptz, timestamptz, text, integer, integer, uuid[], boolean, text[]);`

3. `create function public.search_conversations(...)` — copiar INTEGRALMENTE a definição da
   `20260716210000_digit_search_columns_and_rpc.sql` (linhas 50–178: assinatura de 17 params,
   RETURNS TABLE, `language sql stable security definer set search_path = ''` e corpo) com
   EXATAMENTE estas 4 mudanças:

   a. No RETURNS TABLE, entre `is_collaborator boolean,` e `total_count bigint`, inserir:
   ```sql
  is_accessible boolean,
   ```

   b. No SELECT, logo após o `) as is_collaborator,` e antes de `count(*) over () as total_count`, inserir:
   ```sql
    public.can_access_conversation(c.id) as is_accessible,
   ```

   c. No bloco de acesso do WHERE, logo após o arm
   `or (c.assigned_seller_id is null and c.whatsapp_account_id is null)` e antes do `)` que
   fecha o bloco, inserir:
   ```sql
      or (
        -- Search-visibility (metadata-only) arm: attendants can FIND same-store
        -- conversations assigned to any seller — who has it is the answer this
        -- search exists to give. Opening stays gated: is_accessible mirrors
        -- can_access_conversation and the frontend blocks navigation on false.
        -- Restricted to users operating at least one instance so roles with no
        -- attendance surface (Financeiro/SDR) keep seeing nothing.
        c.assigned_seller_id is not null
        and exists (select 1 from acc)
      )
   ```

   d. Após o `$$;`, re-emitir o grant (mesma lista de tipos da drop acima):
   ```sql
-- DROP FUNCTION clears prior grants; PostgREST callers rely on execute
-- rights on the authenticated role (postgres/service_role kept for parity).
grant execute on function public.search_conversations(
  text, uuid, text[], text, uuid, uuid, boolean, boolean, text[],
  timestamptz, timestamptz, text, integer, integer, uuid[], boolean, text[]
) to authenticated, postgres, service_role;

notify pgrst, 'reload schema';
   ```

- [ ] **Step 2: Sanity check obrigatório**

Comparar o corpo do novo arquivo com a definição da `20260716210000` (linhas 50–178):
o texto deve ser idêntico exceto pelas 4 mudanças acima (a–d). Relatar no report o método
de comparação usado e o resultado.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260716233000_search_metadata_visibility.sql
git commit -m "feat: search-visibility arm and is_accessible flag in search_conversations"
```

---

### Task 2: Provider + tipo + mock — `isAccessible`

**Files:**
- Modify: `src/providers/data/impl/supabase/conversations.ts` (tipo `ConversationRow` + função `rowToConversation`)
- Modify: `src/shared/types/conversation.ts` (interface `IConversation`)
- Modify: `src/mocks/api/conversations.ts` (função `list`, ramo com `params.search`)

**Interfaces:**
- Consumes: coluna `is_accessible` da Task 1.
- Produces: `IConversation.isAccessible?: boolean` — a Task 3 lê `conversation.isAccessible === false` para o guard.

- [ ] **Step 1: Tipo de domínio**

Em `src/shared/types/conversation.ts`, na interface `IConversation`, junto ao campo
`isCollaborator` (que já tem o precedente "só presente na busca"), adicionar:

```ts
  /**
   * Only present on rows returned by the `search_conversations` RPC: false when
   * the current user can FIND this conversation (search metadata) but cannot
   * OPEN it (assigned to another seller — 2026-07-16 metadata-visibility spec).
   * Undefined elsewhere; treat undefined as accessible.
   */
  isAccessible?: boolean;
```

- [ ] **Step 2: Provider supabase**

Em `src/providers/data/impl/supabase/conversations.ts`:
- No tipo `ConversationRow`, junto ao campo `is_collaborator` (comentário "Only present on
  rows returned by the `search_conversations` RPC."), adicionar:
```ts
  is_accessible?: boolean;
```
- Em `rowToConversation`, junto ao mapeamento de `isCollaborator`, adicionar:
```ts
    isAccessible: row.is_accessible,
```
(Linhas vindas de `list_conversations`/realtime não trazem a coluna ⇒ `undefined` ⇒ os
consumidores tratam como acessível.)

- [ ] **Step 3: Paridade do mock**

Em `src/mocks/api/conversations.ts`, no `list`, o ramo de busca hoje é:
```ts
        if (params.search) all = all.filter((c) => matchesSearch(c, params.search!));
```
Trocar por (rows de busca do demo são sempre acessíveis — o demo é operado como staff;
nuance documentada no spec da busca global):
```ts
        if (params.search) {
          all = all
            .filter((c) => matchesSearch(c, params.search!))
            .map((c) => ({ ...c, isAccessible: true }));
        }
```

- [ ] **Step 4: Verificar e commitar**

Run: `bunx tsc --noEmit 2>&1 | grep -E "impl/supabase/conversations|shared/types/conversation|mocks/api/conversations"` → nenhuma linha nova.
Run: `bun run test` → PASS.

```bash
git add src/providers/data/impl/supabase/conversations.ts src/shared/types/conversation.ts src/mocks/api/conversations.ts
git commit -m "feat: map is_accessible search flag into IConversation"
```

---

### Task 3: Guard de clique + toast "Em atendimento com {nome}"

**Files:**
- Modify: `src/features/conversations/i18n/pt-BR.ts` (2 itens no `INBOX_STRINGS`)
- Modify: `src/features/conversations/components/ConversationListItem.tsx` (prop nova + guard no `Link`)
- Modify: `src/features/conversations/pages/InboxPage.tsx` (passar o handler com toast)

**Interfaces:**
- Consumes: `IConversation.isAccessible` (Task 2); `sellersById`/`showAssignee` já existentes na InboxPage.
- Produces: prop opcional `onLockedSelect?: () => void` em `IConversationListItemProps`.

- [ ] **Step 1: i18n**

Em `src/features/conversations/i18n/pt-BR.ts`, no `INBOX_STRINGS` (perto de
`searchIgnoresFilters`), adicionar:

```ts
  searchLockedWith: (name: string) => `Em atendimento com ${name}`,
  searchLockedFallbackName: "outro atendente",
```

- [ ] **Step 2: ConversationListItem — guard no Link**

Em `src/features/conversations/components/ConversationListItem.tsx`:
- Na interface de props (junto a `onSelect?: () => void;`):
```ts
  /** Called instead of navigating when the row is search-visible but not openable. */
  onLockedSelect?: () => void;
```
- Adicionar `onLockedSelect,` na destructuring de props (junto a `onSelect`).
- Trocar o `onClick` do `<Link>` (hoje `onClick={() => onSelect?.()}`):
```tsx
      onClick={(e) => {
        // Metadata-only search result: block navigation, let the page explain
        // who is handling it (2026-07-16 metadata-visibility spec).
        if (conversation.isAccessible === false) {
          e.preventDefault();
          onLockedSelect?.();
          return;
        }
        onSelect?.();
      }}
```

- [ ] **Step 3: InboxPage — handler com toast**

Em `src/features/conversations/pages/InboxPage.tsx`:
- Garantir import do toast: `import { toast } from "sonner";` (adicionar se ausente).
- No `items.map(...)` (render do `ConversationListItem`, ~linha 377), adicionar a prop:
```tsx
                onLockedSelect={() => {
                  const name = conversation.assignedSellerId
                    ? (sellersById.get(conversation.assignedSellerId)?.fullName ??
                      INBOX_STRINGS.searchLockedFallbackName)
                    : INBOX_STRINGS.searchLockedFallbackName;
                  toast.info(INBOX_STRINGS.searchLockedWith(name));
                }}
```
- Conferir que `INBOX_STRINGS` já é importado no arquivo (é — usado em `ariaLoadMore` etc.).

- [ ] **Step 4: Verificar e commitar**

Run: `bunx tsc --noEmit 2>&1 | grep -E "ConversationListItem|InboxPage|i18n/pt-BR"` → nenhuma linha NOVA (há baseline pré-existente de `search: (prev)` TS7006 no InboxPage — ignorar).
Run: `bun run test` → PASS.

```bash
git add src/features/conversations/i18n/pt-BR.ts src/features/conversations/components/ConversationListItem.tsx src/features/conversations/pages/InboxPage.tsx
git commit -m "feat: block opening metadata-only search results with an assignee notice"
```

---

### Task 4: Gate final, push e PR (SEM merge, SEM aplicar migration)

- [ ] **Step 1: Gate**

```bash
bun run test
bun run build
```
Expected: ambos passam. ESLint só nos arquivos tocados, filtrando CRLF:
`bunx eslint <arquivos das Tasks 1-3> 2>&1 | grep -v 'Delete `␍`'` → sem erros novos.

- [ ] **Step 2: Push e PR**

```bash
git push origin worktree-investigate-msg-553398888
gh pr create --title "feat: search surfaces colleagues' conversations as metadata (no open)" --body "$(cat <<'EOF'
## Resumo
- A busca da Inbox agora ENCONTRA conversas da mesma loja atribuídas a outros atendentes (caso real: Tiago × conversa do Lucas) — com o chip mostrando o responsável.
- O clique NÃO abre o thread: toast "Em atendimento com {nome}". Conteúdo das mensagens segue protegido (can_access_conversation intocado; só a RPC de busca expõe metadados).
- Guarda de papel: visibilidade só para quem opera ≥1 instância (Financeiro/SDR seguem sem ver nada). "Buscar nas mensagens" NÃO foi ampliado.
- Spec: `docs/superpowers/specs/2026-07-16-search-metadata-visibility-design.md`.

## ⚠️ Rollout
1. Aplicar `supabase/migrations/20260716233000_search_metadata_visibility.sql` em prod (MCP, OK do dono). Janela mista é segura nos dois sentidos (flag undefined ⇒ acessível; frontend antigo cai na tela "Conversa indisponível" existente).
2. Merge (OK do dono) → deploy.
3. Smoke: Tiago busca `11995218891` → resultado com chip "Lucas"; clique → toast, sem abrir.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: PR criado. **NÃO mergear; NÃO aplicar a migration.**
