# Busca ignora filtros + chip de atendente — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> ⚠️ **Worktree:** todo o trabalho acontece em
> `D:\claude\gallo-basediesel\.claude\worktrees\investigate-msg-553398888`
> (branch `worktree-investigate-msg-553398888`). Subagente despachado DEVE começar com
> `cd "D:\claude\gallo-basediesel\.claude\worktrees\investigate-msg-553398888"` e conferir
> `git branch --show-current` == `worktree-investigate-msg-553398888` antes de qualquer edição.

**Goal:** Com termo de busca ativo na Inbox, todos os filtros são ignorados (busca global, incluindo conversas fechadas) e o card do resultado mostra o chip de quem está com a conversa, para qualquer papel.

**Architecture:** Ramo de busca na função pura `filtersToListParams` (um único ponto; vale para modo lista, modo mensagens e mock); `showAssignee` da InboxPage passa a ligar também com busca ativa; nota visual no painel de filtros. Sem migration, sem RPC, sem tocar no cache do atendimento. Spec: `docs/superpowers/specs/2026-07-16-search-ignores-filters-design.md`.

**Tech Stack:** React 19 + TanStack Router, TypeScript strict, Vitest, Tailwind v4 + shadcn/ui.

## Global Constraints

- Comentários de código em **inglês**; strings de UI em **pt-BR com acentos corretos**; commits Conventional Commits em inglês, atômicos.
- Gate de CI = `bun run test` + `bun run build` (build não type-checka; tsc tem baseline — avaliar só o delta dos arquivos tocados).
- **NÃO tocar** no cache do atendimento (signing de mídia, realtime, query keys, RPCs gated-once) — congelado por decisão do dono.
- **NUNCA mergear o PR** — apenas abrir e aguardar aprovação do dono.
- Ordenação durante a busca é fixa em `lastMessageAt desc` (decisão de spec: os outros sorts embutem filtro ou não são suportados pela RPC de busca).

---

### Task 1: Ramo de busca em `filtersToListParams` (TDD)

**Files:**
- Modify: `src/features/conversations/hooks/useInboxFilters.ts:279-283` (início de `filtersToListParams`)
- Modify: `src/features/conversations/hooks/useInboxFilters.test.ts` (append)

**Interfaces:**
- Consumes: nada novo.
- Produces: `filtersToListParams` retorna `{ search, orderBy: "lastMessageAt", orderDir: "desc" }` quando `filters.search.length > 0` — o InboxPage (Task 2) e ambos os modos do `useConversationsList` consomem sem mudança de assinatura.

- [ ] **Step 1: Escrever os testes que falham**

Acrescentar ao final de `src/features/conversations/hooks/useInboxFilters.test.ts`:

```ts
describe("filtersToListParams — search mode ignores filters", () => {
  it("with a term, returns only search + default ordering (global search)", () => {
    const p = filtersToListParams(
      baseState({
        search: "98888-4188",
        status: "em_andamento",
        channel: "whatsapp",
        instance: "acc-1",
        tags: ["tag-1"],
        period: "7d",
        assignment: ["me", "queue"],
        sort: "waiting",
        escalated: true,
      }),
      { currentSellerId: SELLER },
    );
    expect(p).toEqual({ search: "98888-4188", orderBy: "lastMessageAt", orderDir: "desc" });
  });
  it("without a term, keeps the filtered behavior unchanged", () => {
    const p = filtersToListParams(baseState({ status: "em_andamento" }), {
      currentSellerId: SELLER,
    });
    expect(p.search).toBeUndefined();
    expect(p.status).toBe("em_andamento");
    expect(p.assignmentAny).toEqual({ sellerIds: [SELLER] });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `bun run test src/features/conversations/hooks/useInboxFilters.test.ts`
Expected: FAIL — o primeiro teste novo recebe um objeto com `status`/`assignmentAny`/etc. em vez do objeto de 3 chaves.

- [ ] **Step 3: Implementar o ramo**

Em `useInboxFilters.ts`, dentro de `filtersToListParams`, inserir logo APÓS a abertura da função (antes de `const params: Record<string, unknown> = {};`):

```ts
  // Search is GLOBAL by design (owner decision, 2026-07-16 spec): with a term
  // active every filter is ignored — including the closed-statuses default —
  // so a match is never hidden by status/assignment/instance/tags/period.
  // Access control still applies (RLS two-gate model). Ordering is pinned to
  // most-recent because the search RPC only orders by last_message_at.
  if (filters.search.length > 0) {
    return { search: filters.search, orderBy: "lastMessageAt", orderDir: "desc" };
  }
```

- [ ] **Step 4: Rodar e ver passar**

Run: `bun run test src/features/conversations/hooks/useInboxFilters.test.ts`
Expected: PASS (todos os casos existentes + 2 novos — nenhum caso existente usa `search` não-vazio, então seguem verdes).

- [ ] **Step 5: Commit**

```bash
git add src/features/conversations/hooks/useInboxFilters.ts src/features/conversations/hooks/useInboxFilters.test.ts
git commit -m "feat: inbox search ignores active filters (global search)"
```

---

### Task 2: InboxPage — chip de atendente na busca + bypass do filtro de escaladas

**Files:**
- Modify: `src/features/conversations/pages/InboxPage.tsx:54-80` (bloco do assignee — será movido) e `:154-157` (pós-filtro de escaladas)

**Interfaces:**
- Consumes: `filters` de `useInboxFilters` (já existente na página).
- Produces: nada novo para outras tasks — mudanças internas da página.

- [ ] **Step 1: Mover o bloco do assignee para depois dos filtros e ligar na busca**

Hoje o bloco vive nas linhas 54–80, ANTES de `useInboxFilters` (linhas 84–97) — ele precisa de `filters.search`, então deve ser movido para logo APÓS o fechamento da destructuring de `useInboxFilters` (após a linha `} = useInboxFilters(sellerId);`). Conteúdo final do bloco movido (as únicas mudanças vs. o atual são a linha `searchActive` e a expressão de `showAssignee`):

```tsx
  // Assignee oversight: staff (Owner/Gestor) see store-wide conversations and
  // need to know who is handling each. During an active search EVERY role sees
  // the chip (results may surface other sellers' conversations — owner decision,
  // 2026-07-16 spec); sellers RLS is store-scoped, so non-staff can resolve
  // names. Outside search, non-staff never load the roster (chip hidden).
  const searchActive = filters.search.length > 0;
  const showAssignee = isStaffView || searchActive;
  const sellersProvider = useSellersProvider();
  const [sellersById, setSellersById] = useState<Map<ID, ISeller>>(new Map());
  useEffect(() => {
    if (!showAssignee) {
      setSellersById(new Map());
      return;
    }
    let cancelled = false;
    void sellersProvider
      .list({ storeId })
      .then((list) => {
        if (cancelled) return;
        const map = new Map<ID, ISeller>();
        for (const s of list) map.set(s.id, s);
        setSellersById(map);
      })
      .catch(() => {
        if (!cancelled) setSellersById(new Map());
      });
    return () => {
      cancelled = true;
    };
  }, [sellersProvider, storeId, showAssignee]);
```

(Nada mais muda no bloco; o `ConversationListItem` já recebe `showAssignee` e `assignedSeller` — linhas ~390–395 — e renderiza o chip sozinho.)

- [ ] **Step 2: Bypass do pós-filtro de escaladas na busca**

Substituir o `useMemo` das linhas 154–157:

```tsx
  const items = useMemo(() => {
    // Escalated is a client-side post-filter; search mode ignores it like every
    // other filter (global search — see filtersToListParams).
    if (!filters.escalated || searchActive) return rawItems;
    return rawItems.filter((c) => escalationsByConversation.has(c.id));
  }, [rawItems, escalationsByConversation, filters.escalated, searchActive]);
```

- [ ] **Step 3: Verificar tipos e suíte**

Run: `bunx tsc --noEmit 2>&1 | grep "InboxPage"` — Expected: nenhuma linha (sem erros novos neste arquivo).
Run: `bun run test` — Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/features/conversations/pages/InboxPage.tsx
git commit -m "feat: show assignee chip to every role during inbox search"
```

---

### Task 3: Nota "Filtros ignorados durante a busca" no painel

**Files:**
- Modify: `src/features/conversations/i18n/pt-BR.ts` (novo item no objeto `INBOX_STRINGS`)
- Modify: `src/features/conversations/components/InboxFilters.tsx:135-180`

**Interfaces:**
- Consumes: `state.search` (a prop `state: IInboxFiltersState` já chega no componente).
- Produces: nada — mudança visual local.

- [ ] **Step 1: Adicionar a string de i18n**

Em `src/features/conversations/i18n/pt-BR.ts`, dentro do objeto `INBOX_STRINGS`, junto às demais strings do painel de filtros (ex.: perto de `filtersToggle`/`clearAll`), adicionar:

```ts
  searchIgnoresFilters: "Filtros ignorados durante a busca",
```

- [ ] **Step 2: Renderizar a nota e esmaecer os chips**

Em `InboxFilters.tsx`, dentro do componente (após a linha `const { collapsed, setCollapsed } = useInboxFiltersCollapsed();`), derivar:

```tsx
  const searchActive = state.search.length > 0;
```

Na linha do cabeçalho (o `<div className="flex items-center justify-between gap-2 border-b border-border px-3 py-1.5">`), inserir a nota ENTRE o `</CollapsibleTrigger>` e o bloco `{activeCount > 0 && (` do botão "Limpar tudo":

```tsx
        {searchActive && (
          <span
            className="inline-flex min-w-0 items-center gap-1 text-[11px] text-muted-foreground"
            title={INBOX_STRINGS.searchIgnoresFilters}
          >
            <Icon icon="mdi:information-outline" size={12} className="shrink-0" />
            <span className="truncate">{INBOX_STRINGS.searchIgnoresFilters}</span>
          </span>
        )}
```

E no wrapper dos chips (o `<div className="flex flex-wrap items-center gap-1.5 border-b border-border px-3 pb-2 pt-1">`, primeiro filho do `CollapsibleContent`), trocar o `className` fixo por:

```tsx
        <div
          className={cn(
            "flex flex-wrap items-center gap-1.5 border-b border-border px-3 pb-2 pt-1",
            searchActive && "opacity-50",
          )}
        >
```

(`cn` já é importado no arquivo. Os chips permanecem clicáveis de propósito: as escolhas persistem na URL e voltam a valer quando a busca é limpa.)

- [ ] **Step 3: Verificar tipos e suíte**

Run: `bunx tsc --noEmit 2>&1 | grep -E "InboxFilters|i18n/pt-BR"` — Expected: nenhuma linha.
Run: `bun run test` — Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/features/conversations/i18n/pt-BR.ts src/features/conversations/components/InboxFilters.tsx
git commit -m "feat: hint that filters are ignored while searching"
```

---

### Task 4: Gate final, push e PR (SEM merge)

**Files:**
- Nenhum arquivo novo — verificação, push e abertura de PR.

**Interfaces:**
- Consumes: commits das Tasks 1–3.
- Produces: PR aberto aguardando o dono.

- [ ] **Step 1: Gate completo**

```bash
bun run test
bun run build
```

Expected: ambos passam (lint global tem ruído CRLF pré-existente do checkout Windows — conferir apenas que os arquivos tocados não têm erros próprios: `bunx eslint <arquivos tocados> | grep -v 'Delete `␍`'`).

- [ ] **Step 2: Type-check por delta**

Run: `bunx tsc --noEmit 2>&1 | grep -E "useInboxFilters|InboxPage|InboxFilters|i18n/pt-BR"`
Expected: nenhuma linha nova.

- [ ] **Step 3: Push e PR**

```bash
git push origin worktree-investigate-msg-553398888
gh pr create --title "feat: inbox search ignores filters and shows assignee chip" --body "$(cat <<'EOF'
## Resumo
- Com termo de busca ativo na Inbox, TODOS os filtros são ignorados (busca global): status — incluindo resolvidas/arquivadas —, canal, instância, atribuição, tags, período e escaladas. A RLS (2 portões) segue governando o acesso.
- O card do resultado mostra o chip de quem está com a conversa (AssigneeChip) para QUALQUER papel durante a busca; fora da busca, permanece staff-only.
- Nota "Filtros ignorados durante a busca" + chips esmaecidos no painel de filtros enquanto há termo.
- Ordenação durante a busca fixa em "Mais recentes".
- Spec: `docs/superpowers/specs/2026-07-16-search-ignores-filters-design.md` · Plano: `docs/superpowers/plans/2026-07-16-search-ignores-filters.md`.

## Validação
- Ramo de busca de `filtersToListParams` coberto por testes unitários (com/sem termo).
- `bun run test` + `bun run build` verdes; tsc sem erros novos nos arquivos tocados.

## Rollout
Sem migration, sem RPC — deploy simples pós-merge.
Smoke: buscar `98888-4188` com "Atribuídas a mim" ativo → conversa resolvida do +55 33 8888-4188 aparece com o chip do atendente.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: PR criado. **NÃO mergear** — aguarda OK do dono.
