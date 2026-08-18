# Notas Fiscais de Entrada — Fase 2 (Lista e importação) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Soltar um XML de NF-e na tela cria a nota em conferência, com o fornecedor vinculado pelo CNPJ ou criado do próprio arquivo — e a lista de notas mostra o resultado.

**Architecture:** O grupo SUPRIMENTOS entra na sidebar governado pelo recurso RBAC `supplies`, que nasce no código **e** no banco (sem o seed o menu some para todos). A orquestração da importação fica num módulo puro do `engine/`, testado com Vitest; os hooks só fazem a coreografia assíncrona contra `@/providers/data`, e as duas telas seguem `docs/dev/ux-guidelines.md` à risca.

**Tech Stack:** React 19 · TanStack Router (file-based) · TanStack Query · Tailwind v4 + shadcn/ui · Vitest · Iconify

**Spec:** `docs/prds/PRD-216-notas-fiscais-entrada.md` (Fase 2) · fonte visual: `ui_kits/notas/nf-list.jsx` e `nf-import.jsx`

## Global Constraints

- **Branch nova, empilhada.** Fase 1 vive em `claude/invoice-management-2270ef` (PR #510, não mergeado). Criar `claude/fiscal-notes-fase2` a partir dela e abrir PR com **base = `claude/invoice-management-2270ef`**. ⚠️ O GitHub só reaponta o PR empilhado para `main` se a branch base for **deletada** no merge — conferir com `git ls-tree origin/main` antes de dar por certo que a Fase 2 chegou na main.
- **Tokens semânticos apenas.** `bg-background`, `text-foreground`, `border-border`, `text-primary`, `text-/bg-/border-severity-{info|success|warning|critical}`. O kit é dark-only com hex cru (`#E0BB4E` etc.) — **nada disso entra**. O ouro do kit é `primary`.
- **`docs/dev/ux-guidelines.md` é obrigatório**, não sugestão: header glass (§1), `ScrollProgressBar` na divisa (§2), busca com largura dinâmica + `/` + `kbd` + `Escape` (§3), tabela `table-fixed` com `useResizableColumns` + delimitadores só no header + menu de colunas no clique-direito (§4).
- **Chave de persistência das colunas:** `gallo-fiscal-notes-column-widths` e `gallo-fiscal-notes-columns`.
- **Guard de rota:** `requireAuth(location.pathname, undefined, { resource: "supplies", action: "view" })`. **Passar `undefined` nos papéis** — `roles` e `permission` são AND, e uma lista de papéis anularia o Editor de Papéis para papéis customizados.
- **Features acessam dados só por `@/providers/data`.** Import de `@/mocks`, `@/providers/data/impl/*`, `@/providers/data/contracts/*` ou `factory` é bloqueado por ESLint.
- **Texto de UI em pt-BR com acentuação correta**, centralizado em `i18n/pt-BR.ts` da feature. Código e commits em inglês.
- **`noUncheckedIndexedAccess` está ligado** — todo acesso indexado é `T | undefined`. Estreitar explicitamente; nada de `any` nem `@ts-ignore`.
- **A migration desta fase NÃO é aplicada** — vai para `supabase/migrations/` e aguarda OK explícito do dono.
- **Gate da fase:** `bun run test` verde · `bun run build` verde · `bunx tsc --noEmit` sem erro em arquivo novo ou editado.

---

## File Structure

**Criados:**

| Arquivo | Responsabilidade |
|---|---|
| `supabase/migrations/20260817130000_rbac_supplies_resource.sql` | seed do recurso `supplies` + grants por papel |
| `src/features/rbac/permissions/supplies.test.ts` | trava quem enxerga Suprimentos |
| `src/routes/app.suprimentos.tsx` | rota-pai, só `<Outlet/>` |
| `src/routes/app.suprimentos.notas.tsx` | lista, com guard |
| `src/routes/app.suprimentos.importar.tsx` | importação, com guard |
| `src/features/fiscal-notes/i18n/pt-BR.ts` | todo o texto de UI |
| `src/features/fiscal-notes/engine/importNote.ts` | `supplierDraftFromEmitter`, `buildNoteFromNfe`, `summarizeLinks` |
| `src/features/fiscal-notes/engine/importNote.test.ts` | testes dos três |
| `src/features/fiscal-notes/hooks/useFiscalNotesList.ts` | query da lista |
| `src/features/fiscal-notes/hooks/useImportNfe.ts` | coreografia assíncrona da importação |
| `src/features/fiscal-notes/components/list/FiscalNotesHeader.tsx` | header glass + busca |
| `src/features/fiscal-notes/components/list/FiscalNotesKpis.tsx` | os 5 KPIs do topo |
| `src/features/fiscal-notes/components/list/FiscalNotesTable.tsx` | tabela redimensionável |
| `src/features/fiscal-notes/components/list/FiscalNotesColumnsMenu.tsx` | menu de colunas |
| `src/features/fiscal-notes/components/import/XmlDropzone.tsx` | zona de soltar + seletor |
| `src/features/fiscal-notes/components/import/ImportQueueItem.tsx` | linha da fila + passos + cadastro criado |
| `src/features/fiscal-notes/pages/FiscalNotesListPage.tsx` | tela "Notas de entrada" |
| `src/features/fiscal-notes/pages/FiscalNotesImportPage.tsx` | tela "Importar XML" |

**Modificados:** `src/features/rbac/permissions/{resources,matrix,seed}.ts` · `src/features/shell/config/{routes,navigation}.ts` · `src/features/shell/config/navigation.test.ts` · `src/features/fiscal-notes/index.ts`

---

### Task 1: Recurso RBAC `supplies`

**Files:**
- Modify: `src/features/rbac/permissions/resources.ts`
- Modify: `src/features/rbac/permissions/matrix.ts`
- Modify: `src/features/rbac/permissions/seed.ts`
- Create: `src/features/rbac/permissions/supplies.test.ts`
- Create: `supabase/migrations/20260817130000_rbac_supplies_resource.sql`

**Interfaces:**
- Consumes: `hasPermission(user, resource, action)` de `@/features/rbac/utils/hasPermission`
- Produces: `"supplies"` como `ResourceName` — consumido pela navegação (Task 2) e pelos guards de rota

> Quem recebe o quê, e por quê: **Owner** e **Gestor** conferem e lançam (`supplies.post`). **Financeiro** vê, porque as duplicatas viram o contas a pagar dele, mas não lança. **Vendedor**, **VendedorExterno**, **SDR** e **Cliente** não entram — custo de compra e margem de fornecedor não são deles, e vazamento de custo para Vendedor já foi problema neste projeto.

- [ ] **Step 1: Escrever o teste (vai falhar)**

`src/features/rbac/permissions/supplies.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { RoleName } from "@/shared/types";
import { hasPermission } from "../utils/hasPermission";
import { RESOURCES } from "./resources";
import { buildResourceSeeds, buildPermissionSeeds } from "./seed";

const user = (role: RoleName) => ({ role, roleKey: role });

describe("recurso RBAC supplies", () => {
  it("está no catálogo de recursos", () => {
    expect(RESOURCES).toContain("supplies");
  });

  it("deixa Owner e Gestor conferirem e lançarem", () => {
    for (const role of ["Owner", "Gestor"] as const) {
      expect(hasPermission(user(role), "supplies", "view")).toBe(true);
      expect(hasPermission(user(role), "supplies", "create")).toBe(true);
      expect(hasPermission(user(role), "supplies", "edit")).toBe(true);
    }
  });

  it("deixa Financeiro ver, porque as duplicatas viram contas a pagar", () => {
    expect(hasPermission(user("Financeiro"), "supplies", "view")).toBe(true);
  });

  it("não deixa Financeiro lançar — lançar muda estoque e custo", () => {
    expect(hasPermission(user("Financeiro"), "supplies", "create")).toBe(false);
    expect(hasPermission(user("Financeiro"), "supplies", "edit")).toBe(false);
  });

  it("esconde de quem vende: custo de compra não é do time comercial", () => {
    for (const role of ["Vendedor", "VendedorExterno", "SDR", "Cliente"] as const) {
      expect(hasPermission(user(role), "supplies", "view")).toBe(false);
    }
  });

  it("entra no seed com rótulo e grupo, senão o menu some para todos", () => {
    const resource = buildResourceSeeds().find((r) => r.key === "supplies");
    expect(resource).toBeDefined();
    expect(resource!.label).toBe("Notas de entrada");
    expect(resource!.group).toBe("Suprimentos");
  });

  it("tem linhas de permissão no seed para os três papéis que enxergam", () => {
    const roles = buildPermissionSeeds()
      .filter((p) => p.resource === "supplies")
      .map((p) => p.roleId)
      .sort();
    expect(roles).toEqual(["Financeiro", "Gestor", "Owner"]);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
bun run test -- src/features/rbac/permissions/supplies.test.ts
```

Esperado: FAIL — `RESOURCES` não contém `"supplies"`.

> Se `buildResourceSeeds`/`buildPermissionSeeds` tiverem outro nome em `seed.ts`, ajustar o import do teste para os nomes reais **antes** de seguir — o teste existe para travar comportamento, não para renomear a API.

- [ ] **Step 3: Adicionar o recurso ao catálogo**

Em `src/features/rbac/permissions/resources.ts`, ao fim do array `RESOURCES`, antes do fechamento:

```ts
  // Suprimentos (PRD-216 "Tally") — notas fiscais de entrada, conferência e
  // lançamento. Governa o grupo SUPRIMENTOS inteiro na sidebar.
  "supplies",
```

- [ ] **Step 4: Adicionar as linhas da matriz**

Em `src/features/rbac/permissions/matrix.ts`:

Em `OWNER_ENTRIES`, junto às demais:

```ts
  p("supplies", CRUD, "all"),
```

Em `GESTOR_ENTRIES`:

```ts
  p("supplies", CRUD, "store"),
```

Em `FINANCEIRO_ENTRIES`:

```ts
  // Vê porque as duplicatas da nota alimentam o contas a pagar; não lança,
  // porque lançar move estoque e recalcula custo médio.
  p("supplies", ["view"], "store"),
```

- [ ] **Step 5: Preencher rótulo e grupo no seed**

Em `src/features/rbac/permissions/seed.ts`, no `RESOURCE_LABELS`:

```ts
  supplies: "Notas de entrada",
```

E no `RESOURCE_GROUPS`:

```ts
  supplies: "Suprimentos",
```

> Os dois mapas são `Record<ResourceName, string>` — sem estas linhas o TypeScript já reclama, antes mesmo do teste.

- [ ] **Step 6: Rodar e confirmar que passa**

```bash
bun run test -- src/features/rbac/permissions/
```

Esperado: PASS — incluindo o teste de paridade `seed.test.ts`, que compara matriz e seed.

- [ ] **Step 7: Escrever a migration de seed**

`supabase/migrations/20260817130000_rbac_supplies_resource.sql`:

```sql
-- PRD-216 (Tally) — registra o recurso `supplies` na matriz persistida.
--
-- O app hidrata permissões DESTAS TABELAS, não da matriz em TypeScript. Sem
-- estas linhas, `hasPermission(user, "supplies", "view")` é falso para todo
-- papel e o grupo SUPRIMENTOS some da sidebar para TODO MUNDO, Owner incluso —
-- é o mesmo tropeço de 20260807140000_seed_contact_rbac_resource.sql.
--
-- Grants espelham src/features/rbac/permissions/matrix.ts:
--   Owner      — tudo, todas as lojas
--   Gestor     — tudo, na própria loja
--   Financeiro — só leitura: as duplicatas alimentam o contas a pagar dele,
--                mas lançar move estoque e recalcula custo médio
-- Vendedor, VendedorExterno, SDR e Cliente ficam de fora de propósito: custo
-- de compra e margem de fornecedor não são do time comercial.

insert into public.rbac_resources (key, label, "group", sort_order)
values ('supplies', 'Notas de entrada', 'Suprimentos', 1)
on conflict (key) do nothing;

insert into public.role_permissions (role_id, resource, actions, scope)
values
  ('Owner',      'supplies', array['view','create','edit','delete'], 'all'),
  ('Gestor',     'supplies', array['view','create','edit','delete'], 'store'),
  ('Financeiro', 'supplies', array['view'],                          'store')
on conflict (role_id, resource) do nothing;
```

- [ ] **Step 8: Commit**

```bash
git add src/features/rbac/permissions/resources.ts src/features/rbac/permissions/matrix.ts src/features/rbac/permissions/seed.ts src/features/rbac/permissions/supplies.test.ts supabase/migrations/20260817130000_rbac_supplies_resource.sql
git commit -m "feat(fiscal-notes): add the supplies RBAC resource with its DB seed"
```

---

### Task 2: Rotas e grupo SUPRIMENTOS na sidebar

**Files:**
- Modify: `src/features/shell/config/routes.ts`
- Modify: `src/features/shell/config/navigation.ts`
- Modify: `src/features/shell/config/navigation.test.ts`
- Create: `src/routes/app.suprimentos.tsx`
- Create: `src/routes/app.suprimentos.notas.tsx`
- Create: `src/routes/app.suprimentos.importar.tsx`

**Interfaces:**
- Consumes: `"supplies"` (Task 1) · `requireAuth` de `@/features/auth/guards`
- Produces: `ROUTES.APP_SUPRIMENTOS_NOTAS`, `ROUTES.APP_SUPRIMENTOS_IMPORTAR` · rotas `/app/suprimentos/notas` e `/app/suprimentos/importar`

> As páginas ainda não existem — as rotas montam placeholders nesta task e passam a apontar para as páginas reais nas Tasks 5 e 6. Isso mantém a task testável sozinha: a navegação e o gate podem ser verificados antes de existir UI.

- [ ] **Step 1: Escrever o teste de navegação (vai falhar)**

Acrescentar ao fim de `src/features/shell/config/navigation.test.ts`, dentro do `describe` existente:

```ts
  it("mostra SUPRIMENTOS para quem tem supplies.view", () => {
    const group = APP_NAV_GROUPS.find((g) => g.label === "Suprimentos");
    expect(group).toBeDefined();
    expect(group!.items.map((i) => i.label)).toEqual(["Notas de entrada", "Importar XML"]);
    for (const item of group!.items) {
      expect(isNavItemVisible(item, { role: "Owner", roleKey: "Owner" })).toBe(true);
      expect(isNavItemVisible(item, { role: "Financeiro", roleKey: "Financeiro" })).toBe(true);
    }
  });

  it("esconde SUPRIMENTOS de quem vende", () => {
    const group = APP_NAV_GROUPS.find((g) => g.label === "Suprimentos");
    for (const item of group!.items) {
      expect(isNavItemVisible(item, { role: "Vendedor", roleKey: "Vendedor" })).toBe(false);
      expect(isNavItemVisible(item, { role: "SDR", roleKey: "SDR" })).toBe(false);
    }
  });

  it("gateia SUPRIMENTOS pela matriz, nunca por lista de papéis", () => {
    const group = APP_NAV_GROUPS.find((g) => g.label === "Suprimentos");
    for (const item of group!.items) {
      expect(item.permission?.resource).toBe("supplies");
      expect(item.roles).toBeUndefined();
    }
  });
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
bun run test -- src/features/shell/config/navigation.test.ts
```

Esperado: FAIL — `group` é `undefined`.

- [ ] **Step 3: Declarar as rotas em `routes.ts`**

Em `src/features/shell/config/routes.ts`, junto às constantes `APP_*`:

```ts
  APP_SUPRIMENTOS_NOTAS: "/app/suprimentos/notas",
  APP_SUPRIMENTOS_IMPORTAR: "/app/suprimentos/importar",
```

- [ ] **Step 4: Inserir o grupo na sidebar**

Em `src/features/shell/config/navigation.ts`, dentro de `APP_NAV_GROUPS`, **entre o grupo `Comercial` e o grupo `SDR`**:

```ts
  {
    label: "Suprimentos",
    items: [
      {
        label: "Notas de entrada",
        icon: "mdi:file-document-arrow-right-outline",
        to: ROUTES.APP_SUPRIMENTOS_NOTAS,
        permission: { resource: "supplies" },
      },
      {
        label: "Importar XML",
        icon: "mdi:file-upload-outline",
        to: ROUTES.APP_SUPRIMENTOS_IMPORTAR,
        permission: { resource: "supplies" },
      },
    ],
  },
```

- [ ] **Step 5: Criar os três arquivos de rota**

`src/routes/app.suprimentos.tsx`:

```tsx
import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/app/suprimentos")({
  component: () => <Outlet />,
});
```

`src/routes/app.suprimentos.notas.tsx`:

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { requireAuth } from "@/features/auth/guards";

export const Route = createFileRoute("/app/suprimentos/notas")({
  // roles undefined de propósito: `roles` e `permission` são AND, e uma lista
  // de papéis anularia o Editor de Papéis para papéis customizados.
  beforeLoad: ({ location }) =>
    requireAuth(location.pathname, undefined, { resource: "supplies", action: "view" }),
  component: () => <div />,
});
```

`src/routes/app.suprimentos.importar.tsx`:

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { requireAuth } from "@/features/auth/guards";

export const Route = createFileRoute("/app/suprimentos/importar")({
  beforeLoad: ({ location }) =>
    requireAuth(location.pathname, undefined, { resource: "supplies", action: "view" }),
  component: () => <div />,
});
```

- [ ] **Step 6: Rodar e confirmar que passa**

```bash
bun run test -- src/features/shell/config/navigation.test.ts
```

Esperado: PASS.

- [ ] **Step 7: Confirmar que a árvore de rotas foi regenerada**

```bash
bun run build 2>&1 | tail -3
grep -c "suprimentos" src/routeTree.gen.ts
```

Esperado: build verde e pelo menos 3 ocorrências. `routeTree.gen.ts` é **gerado** — nunca editar à mão.

- [ ] **Step 8: Commit**

```bash
git add src/features/shell/config/routes.ts src/features/shell/config/navigation.ts src/features/shell/config/navigation.test.ts src/routes/app.suprimentos.tsx src/routes/app.suprimentos.notas.tsx src/routes/app.suprimentos.importar.tsx src/routeTree.gen.ts
git commit -m "feat(fiscal-notes): add the SUPRIMENTOS nav group and its guarded routes"
```

---

### Task 3: Strings e o motor da importação

**Files:**
- Create: `src/features/fiscal-notes/i18n/pt-BR.ts`
- Create: `src/features/fiscal-notes/engine/importNote.ts`
- Create: `src/features/fiscal-notes/engine/importNote.test.ts`
- Modify: `src/features/fiscal-notes/engine/index.ts`

**Interfaces:**
- Consumes: `IParsedNfe`, `IParsedNfeEmitter` (Fase 1, `./nfeParser`) · `matchItem`, `IMatchCandidate` (`./itemMatcher`) · `ICreateFiscalNoteInput` de `@/providers/data`
- Produces: `supplierDraftFromEmitter(emitter, storeId): Omit<ISupplier,"id"|"createdAt"|"updatedAt">` · `buildNoteFromNfe(input: IBuildNoteInput): ICreateFiscalNoteInput` · `summarizeLinks(items): { auto: number; ia: number; novo: number; pend: number }`

- [ ] **Step 1: Escrever as strings**

`src/features/fiscal-notes/i18n/pt-BR.ts`:

```ts
export const FISCAL_NOTES_STRINGS = {
  pageTitle: "Notas de entrada",
  pageSubtitle:
    "Toda nota que entra, num lugar só: o XML importado, o fornecedor vinculado, a conferência e o lançamento.",
  importTitle: "Importar XML",
  importSubtitle:
    "Solte o XML da NF-e: a chave é validada, o fornecedor é vinculado pelo CNPJ — ou criado na hora com os dados do próprio XML.",
  list: {
    countOne: (n: number) => `${n} nota`,
    countMany: (n: number) => `${n} notas`,
    searchPlaceholder: "Buscar por número ou chave de acesso…",
    filterAll: "Todas",
    filterConferencia: "Em conferência",
    filterLancada: "Lançadas",
    importCta: "Importar XML",
    emptyTitle: "Nenhuma nota neste filtro",
    emptyDescription: "Importe um XML — a nota entra aqui pronta para a conferência.",
    errorTitle: "Não foi possível carregar as notas",
    retry: "Tentar novamente",
    columnsMenu: { trigger: "Colunas visíveis", showAll: "Exibir todas" },
  },
  kpis: {
    notes: "Notas no período",
    value: "Valor de entrada",
    valueHint: "produtos + frete + IPI",
    review: "Em conferência",
    reviewEmpty: "nada pendente",
    unlinked: "Itens sem vínculo",
    unlinkedHint: "resolver antes de lançar",
    queue: "XML na fila",
    queueEmpty: "fila vazia",
  },
  columns: {
    note: "Nota · fornecedor",
    issued: "Emissão",
    entered: "Entrada",
    items: "Itens",
    total: "Valor",
    duplicates: "Duplicatas",
    status: "Situação",
  },
  status: { conferencia: "Em conferência", lancada: "Lançada", cancelada: "Cancelada" },
  origin: {
    upload: "XML importado",
    upload_edge: "XML importado",
    email: "Recebido por e-mail",
    sefaz: "Baixado da SEFAZ",
    manual: "Digitada",
  },
  import: {
    dropTitle: "Solte o XML da NF-e aqui",
    dropHint: "ou escolha os arquivos",
    dropAccept: "aceita .xml",
    chooseFiles: "escolha os arquivos",
    queueTitle: "Fila de importação",
    supplierLinked: "fornecedor vinculado pelo CNPJ",
    supplierCreated: "fornecedor criado automaticamente",
    createdFromXml: (name: string) => `${name} — cadastro criado do XML`,
    createdFromXmlHint:
      "Contato e categoria não vêm no XML — o cadastro nasce incompleto de propósito, sem dado inventado.",
    linkedByCode: (n: number) => `${n} pelo código`,
    suggestedByAi: (n: number) => `${n} sugeridos pela IA`,
    newParts: (n: number) => `${n} novos`,
    pending: (n: number) => `${n} sem vínculo`,
    reviewCta: "Conferir entrada",
    successToast: (num: string, created: boolean) =>
      `NF ${num} importada — fornecedor ${created ? "criado automaticamente" : "vinculado pelo CNPJ"}`,
    duplicateError: (num: string) => `NF ${num} já foi importada — a chave de acesso já existe.`,
    parseError: "Não foi possível ler o arquivo",
    notXmlError: (name: string) => `${name} não é um XML de NF-e.`,
    fields: {
      corporateName: "Razão social",
      cnpj: "CNPJ",
      stateRegistration: "Inscrição estadual",
      address: "Endereço",
      paymentTerms: "Condição sugerida",
    },
  },
} as const;
```

- [ ] **Step 2: Escrever o teste do motor (vai falhar)**

`src/features/fiscal-notes/engine/importNote.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseNfe } from "./nfeParser";
import { buildNoteFromNfe, summarizeLinks, supplierDraftFromEmitter } from "./importNote";
import type { IMatchCandidate } from "./itemMatcher";

const NFE = parseNfe(
  readFileSync(join(__dirname, "__fixtures__", "nfe-dieseltec.xml"), "utf8"),
);

const CANDIDATES: IMatchCandidate[] = [
  {
    partId: "p-r60t",
    sku: "FLT-R60T",
    name: "Filtro separador Racor R60T",
    ncm: "84212300",
    ean: "7891234567895",
  },
];

describe("supplierDraftFromEmitter", () => {
  it("copia do XML o que o XML tem", () => {
    const draft = supplierDraftFromEmitter(NFE.emitter, "store-1");
    expect(draft.storeId).toBe("store-1");
    expect(draft.cnpj).toBe("04887213000190");
    expect(draft.corporateName).toBe("DIESELTEC DISTRIBUIDORA DE AUTO PECAS LTDA");
    expect(draft.tradeName).toBe("Dieseltec");
    expect(draft.stateRegistration).toBe("096233148 8");
    expect(draft.address).toContain("Passo Fundo/RS");
    expect(draft.active).toBe(true);
    expect(draft.createdFromXml).toBe(true);
  });

  it("deixa contato e categoria VAZIOS — não vêm no XML e não se inventa", () => {
    const draft = supplierDraftFromEmitter(NFE.emitter, "store-1");
    expect(draft.contactName).toBeUndefined();
    expect(draft.contactEmail).toBeUndefined();
    expect(draft.contactPhone).toBeUndefined();
    expect(draft.category).toBeUndefined();
  });
});

describe("buildNoteFromNfe", () => {
  const base = {
    nfe: NFE,
    storeId: "store-1",
    supplierId: "sup-1",
    origin: "upload" as const,
    candidates: CANDIDATES,
    mappedCodes: {} as Record<string, string>,
  };

  it("monta o cabeçalho a partir do XML e nasce em conferência", () => {
    const note = buildNoteFromNfe(base);
    expect(note.accessKey).toBe("35260804887213000190550010000301291000301298");
    expect(note.number).toBe("30129");
    expect(note.series).toBe("1");
    expect(note.supplierId).toBe("sup-1");
    expect(note.storeId).toBe("store-1");
    expect(note.status).toBe("conferencia");
    expect(note.origin).toBe("upload");
    expect(note.division).toBe("parts");
  });

  it("importar NUNCA lança: nenhum item nasce confirmado", () => {
    expect(buildNoteFromNfe(base).items.every((i) => i.confirmed === false)).toBe(true);
  });

  it("copia encargos e totais sem recalcular", () => {
    const note = buildNoteFromNfe(base);
    expect(note.freight).toBe(182.2);
    expect(note.ipi).toBe(214.9);
    expect(note.productsTotal).toBe(2952.8);
    expect(note.total).toBe(3349.9);
  });

  it("traz as duplicatas do XML", () => {
    expect(buildNoteFromNfe(base).duplicates).toHaveLength(3);
  });

  it("aplica a sugestão da IA no item que casa, com evidência", () => {
    const item = buildNoteFromNfe(base).items.find((i) => i.supplierCode === "RC-R60T");
    expect(item?.linkMode).toBe("ia");
    expect(item?.partId).toBe("p-r60t");
    expect(item?.aiConfidence).toBeGreaterThan(0);
    expect(item?.aiEvidence).toBeTruthy();
  });

  it("deixa pendente o item sem candidato", () => {
    const item = buildNoteFromNfe(base).items.find((i) => i.supplierCode === "BI-0445120212");
    expect(item?.linkMode).toBe("pend");
    expect(item?.partId).toBeUndefined();
  });

  it("vincula direto quando o cProd já foi aprendido, sem confiança", () => {
    const note = buildNoteFromNfe({ ...base, mappedCodes: { "RC-R60T": "p-r60t" } });
    const item = note.items.find((i) => i.supplierCode === "RC-R60T");
    expect(item?.linkMode).toBe("auto");
    expect(item?.partId).toBe("p-r60t");
    expect(item?.aiConfidence).toBeUndefined();
  });

  it("nasce sem fator de conversão — o fator é decisão da conferência", () => {
    for (const item of buildNoteFromNfe(base).items) {
      expect(item.conversionMode).toBe("direto");
      expect(item.conversionFactor).toBeNull();
    }
  });

  it("guarda o caminho do XML quando arquivado", () => {
    const note = buildNoteFromNfe({ ...base, xmlPath: "store-1/chave.xml" });
    expect(note.xmlPath).toBe("store-1/chave.xml");
  });
});

describe("summarizeLinks", () => {
  it("conta os itens por tipo de vínculo", () => {
    const counts = summarizeLinks(buildNoteFromNfe({
      nfe: NFE,
      storeId: "s",
      supplierId: "f",
      origin: "upload",
      candidates: CANDIDATES,
      mappedCodes: {},
    }).items);
    expect(counts.ia).toBe(1);
    expect(counts.pend).toBe(1);
    expect(counts.auto).toBe(0);
    expect(counts.novo).toBe(0);
  });
});
```

- [ ] **Step 3: Rodar e confirmar que falha**

```bash
bun run test -- src/features/fiscal-notes/engine/importNote.test.ts
```

Esperado: FAIL — `Failed to resolve import "./importNote"`.

- [ ] **Step 4: Implementar**

`src/features/fiscal-notes/engine/importNote.ts`:

```ts
import type {
  FiscalNoteOrigin,
  ID,
  IFiscalNoteItem,
  ISupplier,
  ItemLinkMode,
} from "@/shared/types";
import type { ICreateFiscalNoteInput } from "@/providers/data";
import type { IParsedNfe, IParsedNfeEmitter } from "./nfeParser";
import { matchItem, type IMatchCandidate } from "./itemMatcher";

/**
 * Orquestração pura da importação (PRD-216, Fase 2).
 *
 * Transforma um XML já parseado no input de criação da nota. Tudo aqui é
 * determinístico e sem I/O — quem fala com o provider é o hook. A regra que
 * este módulo protege é a central do PRD: **importar nunca lança**. Nenhum
 * item nasce confirmado e nenhum fator de conversão é adivinhado.
 */

/**
 * Cadastro de fornecedor a partir do bloco `<emit>`.
 *
 * Contato e categoria ficam `undefined` DE PROPÓSITO: não vêm no XML, e um
 * cadastro incompleto e honesto vale mais que um preenchido com invenção.
 */
export function supplierDraftFromEmitter(
  emitter: IParsedNfeEmitter,
  storeId: ID,
): Omit<ISupplier, "id" | "createdAt" | "updatedAt"> {
  return {
    storeId,
    cnpj: emitter.cnpj,
    corporateName: emitter.corporateName,
    tradeName: emitter.tradeName,
    stateRegistration: emitter.stateRegistration,
    address: emitter.address,
    active: true,
    createdFromXml: true,
  };
}

export interface IBuildNoteInput {
  nfe: IParsedNfe;
  storeId: ID;
  supplierId: ID;
  origin: FiscalNoteOrigin;
  /** Catálogo da loja, para a cascata de sugestão. */
  candidates: IMatchCandidate[];
  /** `cProd` → `partId` já aprendidos para ESTE fornecedor. */
  mappedCodes: Record<string, ID>;
  /** Caminho no bucket `fiscal-xml`, quando o arquivo foi arquivado. */
  xmlPath?: string;
  /** Momento da entrada. Injetado para o teste ser determinístico. */
  enteredAt?: string;
}

export function buildNoteFromNfe(input: IBuildNoteInput): ICreateFiscalNoteInput {
  const items = input.nfe.items.map((item) => {
    const match = matchItem(
      {
        supplierCode: item.supplierCode,
        description: item.description,
        ncm: item.ncm,
        ean: item.ean,
        mappedPartId: input.mappedCodes[item.supplierCode],
      },
      input.candidates,
    );

    return {
      seq: item.seq,
      supplierCode: item.supplierCode,
      description: item.description,
      ncm: item.ncm,
      cfop: item.cfop,
      ean: item.ean,
      unit: item.unit,
      quantity: item.quantity,
      unitValue: item.unitValue,
      totalValue: item.totalValue,
      linkMode: match.mode,
      partId: match.partId ?? undefined,
      // A conversão é decisão da conferência: nascer em `direto` com fator
      // nulo é o que mantém o item pendente e trava o lançamento.
      conversionMode: "direto" as const,
      conversionFactor: null,
      aiConfidence: match.confidence ?? undefined,
      aiEvidence: match.evidence ?? undefined,
      // Importar nunca lança.
      confirmed: false,
    };
  });

  return {
    storeId: input.storeId,
    accessKey: input.nfe.accessKey,
    number: input.nfe.number,
    series: input.nfe.series,
    supplierId: input.supplierId,
    issuedAt: input.nfe.issuedAt,
    enteredAt: input.enteredAt ?? new Date().toISOString(),
    status: "conferencia",
    origin: input.origin,
    freight: input.nfe.freight,
    ipi: input.nfe.ipi,
    discount: input.nfe.discount,
    productsTotal: input.nfe.productsTotal,
    total: input.nfe.total,
    xmlPath: input.xmlPath,
    division: "parts",
    items,
    duplicates: input.nfe.duplicates.map((dup) => ({
      number: dup.number,
      dueDate: dup.dueDate,
      amount: dup.amount,
    })),
  };
}

export type ILinkCounts = Record<ItemLinkMode, number>;

/** Contagem por tipo de vínculo, para os chips da fila de importação. */
export function summarizeLinks(
  items: ReadonlyArray<Pick<IFiscalNoteItem, "linkMode">>,
): ILinkCounts {
  const counts: ILinkCounts = { auto: 0, ia: 0, novo: 0, pend: 0 };
  for (const item of items) counts[item.linkMode]++;
  return counts;
}
```

- [ ] **Step 5: Exportar pelo barrel do engine**

Acrescentar a `src/features/fiscal-notes/engine/index.ts`:

```ts
export * from "./importNote";
```

- [ ] **Step 6: Rodar e confirmar que passa**

```bash
bun run test -- src/features/fiscal-notes/engine/importNote.test.ts
```

Esperado: PASS, 13 testes.

- [ ] **Step 7: Commit**

```bash
git add src/features/fiscal-notes/i18n/pt-BR.ts src/features/fiscal-notes/engine/importNote.ts src/features/fiscal-notes/engine/importNote.test.ts src/features/fiscal-notes/engine/index.ts
git commit -m "feat(fiscal-notes): build the pure import orchestration and UI strings"
```

---

### Task 4: Hooks de lista e importação

**Files:**
- Create: `src/features/fiscal-notes/hooks/useFiscalNotesList.ts`
- Create: `src/features/fiscal-notes/hooks/useImportNfe.ts`

**Interfaces:**
- Consumes: `useFiscalNotesProvider()`, `useSuppliersProvider()`, `usePartsProvider()` de `@/providers/data` · `useCurrentStore()` do MultistoreProvider · `parseNfe`, `NfeParseError`, `buildNoteFromNfe`, `supplierDraftFromEmitter` (Task 3)
- Produces: `useFiscalNotesList(params)` → `{ notes, total, isLoading, isError, refetch }` · `useImportNfe()` → `{ importFile, isImporting }`

> Os hooks são finos de propósito: toda regra vive no `engine/` (Task 3), que é testado. Aqui só há coreografia assíncrona e cache — o que testar exigiria montar contexto de provider e renderizador, com retorno baixo.

- [ ] **Step 1: Descobrir o hook de loja atual**

```bash
grep -rn "export function useCurrentStore\|export function useMultistore" src/features/multistore/ | head -5
grep -rn "storeId" src/features/catalog/hooks/useCatalogList.ts | head -5
```

Usar o hook que aparecer. Se a lista do catálogo não passa `storeId` ao provider, seguir a mesma decisão aqui — a RLS já confina por loja, e divergir criaria um filtro duplo.

- [ ] **Step 2: Escrever o hook da lista**

`src/features/fiscal-notes/hooks/useFiscalNotesList.ts`:

```ts
import { useQuery } from "@tanstack/react-query";
import { useFiscalNotesProvider } from "@/providers/data";
import type { FiscalNoteStatus } from "@/shared/types";

export interface IUseFiscalNotesListParams {
  status?: FiscalNoteStatus;
  search?: string;
  page?: number;
  pageSize?: number;
}

/**
 * Lista de notas de entrada. A chave inclui cada filtro — sem isso o cache
 * devolve a página do filtro anterior ao alternar entre "Todas" e "Lançadas".
 */
export function useFiscalNotesList(params: IUseFiscalNotesListParams = {}) {
  const provider = useFiscalNotesProvider();
  const { status, search, page = 1, pageSize = 50 } = params;

  const query = useQuery({
    queryKey: ["fiscal-notes", "list", status ?? "all", search ?? "", page, pageSize],
    queryFn: () => provider.list({ status, search, page, pageSize }),
  });

  return {
    notes: query.data?.data ?? [],
    total: query.data?.total ?? 0,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}
```

- [ ] **Step 3: Escrever o hook de importação**

`src/features/fiscal-notes/hooks/useImportNfe.ts`:

```ts
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useFiscalNotesProvider, useSuppliersProvider, usePartsProvider } from "@/providers/data";
import type { IFiscalNote, ID } from "@/shared/types";
import { NfeParseError, parseNfe } from "../engine/nfeParser";
import { buildNoteFromNfe, supplierDraftFromEmitter } from "../engine/importNote";
import type { IMatchCandidate } from "../engine/itemMatcher";
import { FISCAL_NOTES_STRINGS } from "../i18n/pt-BR";

export interface IImportOutcome {
  note: IFiscalNote;
  /** `true` quando o CNPJ não existia e o cadastro nasceu do XML. */
  supplierCreated: boolean;
  supplierName: string;
}

export class ImportRejected extends Error {}

/**
 * Coreografia da importação de um XML (PRD-216, origem 1: upload com parse no
 * cliente).
 *
 * Ordem que importa: a chave é validada e conferida contra o banco ANTES de
 * qualquer escrita. Criar o fornecedor e só então descobrir que a nota é
 * duplicada deixaria um cadastro órfão.
 */
export function useImportNfe(storeId: ID) {
  const notes = useFiscalNotesProvider();
  const suppliers = useSuppliersProvider();
  const parts = usePartsProvider();
  const queryClient = useQueryClient();
  const [isImporting, setIsImporting] = useState(false);

  async function importFile(file: File): Promise<IImportOutcome> {
    setIsImporting(true);
    try {
      const xml = await file.text();

      let parsed;
      try {
        parsed = parseNfe(xml);
      } catch (error) {
        if (error instanceof NfeParseError) {
          throw new ImportRejected(
            `${FISCAL_NOTES_STRINGS.import.parseError}: ${error.message}`,
          );
        }
        throw error;
      }

      // Antes de escrever qualquer coisa.
      if (await notes.findByAccessKey(parsed.accessKey)) {
        throw new ImportRejected(FISCAL_NOTES_STRINGS.import.duplicateError(parsed.number));
      }

      const existing = await suppliers.findByCnpj(parsed.emitter.cnpj, storeId);
      const supplier =
        existing ?? (await suppliers.create(supplierDraftFromEmitter(parsed.emitter, storeId)));

      const catalog = await parts.list({ pageSize: 1000, active: true });
      const candidates: IMatchCandidate[] = catalog.data.map((part) => ({
        partId: part.id,
        sku: part.sku,
        name: part.name,
        ncm: part.fiscal?.ncm,
        ean: part.gtin,
      }));

      const note = await notes.create(
        buildNoteFromNfe({
          nfe: parsed,
          storeId,
          supplierId: supplier.id,
          origin: "upload",
          candidates,
          // Vem vazio nesta fase: o mapa cProd → SKU só passa a ser gravado no
          // lançamento, que é da Fase 3.
          mappedCodes: {},
        }),
      );

      await queryClient.invalidateQueries({ queryKey: ["fiscal-notes"] });

      return {
        note,
        supplierCreated: existing === null,
        supplierName: supplier.tradeName ?? supplier.corporateName,
      };
    } finally {
      setIsImporting(false);
    }
  }

  return { importFile, isImporting };
}
```

- [ ] **Step 4: Conferir os nomes de campo do catálogo**

```bash
grep -nE "^\s+(sku|gtin|name)\??:" src/shared/types/catalog.ts | head -8
```

Se `gtin` ou `sku` tiverem outro nome em `IPart`, ajustar o mapeamento dos `candidates` — o teste do matcher já cobre a semântica, mas o campo errado quebraria em runtime.

- [ ] **Step 5: Verificar tipos**

```bash
bunx tsc --noEmit 2>&1 | grep -E "fiscal-notes/hooks"
```

Esperado: nenhuma linha.

- [ ] **Step 6: Commit**

```bash
git add src/features/fiscal-notes/hooks/
git commit -m "feat(fiscal-notes): add list and XML import hooks"
```

---

### Task 5: Tela "Importar XML"

**Files:**
- Create: `src/features/fiscal-notes/components/import/XmlDropzone.tsx`
- Create: `src/features/fiscal-notes/components/import/ImportQueueItem.tsx`
- Create: `src/features/fiscal-notes/pages/FiscalNotesImportPage.tsx`
- Modify: `src/routes/app.suprimentos.importar.tsx`

**Interfaces:**
- Consumes: `useImportNfe` (Task 4) · `FISCAL_NOTES_STRINGS` (Task 3) · `summarizeLinks` (Task 3)
- Produces: `FiscalNotesImportPage` — montada na rota `/app/suprimentos/importar`

- [ ] **Step 1: Escrever a zona de soltar**

`src/features/fiscal-notes/components/import/XmlDropzone.tsx`:

```tsx
import { useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { FISCAL_NOTES_STRINGS } from "../../i18n/pt-BR";

export interface IXmlDropzoneProps {
  onFiles: (files: File[]) => void;
  disabled?: boolean;
}

/** Só `.xml`: `.zip` com vários XML fica para quando houver demanda real. */
function onlyXml(list: FileList | null): File[] {
  if (!list) return [];
  return Array.from(list).filter((f) => f.name.toLowerCase().endsWith(".xml"));
}

export function XmlDropzone({ onFiles, disabled }: IXmlDropzoneProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [over, setOver] = useState(false);
  const s = FISCAL_NOTES_STRINGS.import;

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (disabled) return;
        onFiles(onlyXml(e.dataTransfer.files));
      }}
      className={cn(
        "rounded-xl border-[1.5px] border-dashed px-5 py-7 text-center transition-colors motion-reduce:transition-none",
        over ? "border-primary bg-primary/5" : "border-border bg-muted/20",
        disabled && "opacity-60",
      )}
    >
      <span className="inline-grid h-11 w-11 place-items-center rounded-lg bg-primary/10 text-primary">
        <Icon icon="mdi:file-upload-outline" size={21} aria-hidden />
      </span>
      <div className="mt-2.5 font-display text-lg font-extrabold uppercase text-foreground">
        {s.dropTitle}
      </div>
      <p className="mt-1 text-[12.5px] text-muted-foreground">
        {s.dropHint.replace(s.chooseFiles, "")}
        <button
          type="button"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
          className="text-primary underline-offset-2 hover:underline disabled:cursor-not-allowed"
        >
          {s.chooseFiles}
        </button>
        {` · ${s.dropAccept}`}
      </p>
      <input
        ref={inputRef}
        type="file"
        accept=".xml,text/xml,application/xml"
        multiple
        className="hidden"
        onChange={(e) => {
          onFiles(onlyXml(e.target.files));
          e.target.value = "";
        }}
      />
    </div>
  );
}
```

- [ ] **Step 2: Escrever a linha da fila**

`src/features/fiscal-notes/components/import/ImportQueueItem.tsx`:

```tsx
import { Icon } from "@/components/Icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ILinkCounts } from "../../engine/importNote";
import { FISCAL_NOTES_STRINGS } from "../../i18n/pt-BR";

export type ImportItemState = "queued" | "processing" | "done" | "failed";

export interface IImportQueueEntry {
  id: string;
  filename: string;
  state: ImportItemState;
  error?: string;
  noteNumber?: string;
  noteId?: string;
  supplierName?: string;
  supplierCreated?: boolean;
  counts?: ILinkCounts;
}

export interface IImportQueueItemProps {
  entry: IImportQueueEntry;
  onReview: (noteId: string) => void;
}

const ICON: Record<ImportItemState, string> = {
  queued: "mdi:file-code-outline",
  processing: "mdi:loading",
  done: "mdi:check",
  failed: "mdi:alert-circle-outline",
};

export function ImportQueueItem({ entry, onReview }: IImportQueueItemProps) {
  const s = FISCAL_NOTES_STRINGS.import;
  const counts = entry.counts;

  return (
    <div className="border-b border-border px-4 py-3 last:border-b-0">
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "grid h-8 w-8 shrink-0 place-items-center rounded-lg",
            entry.state === "done" && "bg-severity-success/15 text-severity-success",
            entry.state === "failed" && "bg-severity-critical/15 text-severity-critical",
            (entry.state === "queued" || entry.state === "processing") &&
              "bg-muted text-muted-foreground",
          )}
        >
          <Icon
            icon={ICON[entry.state]}
            size={16}
            className={entry.state === "processing" ? "motion-safe:animate-spin" : undefined}
            aria-hidden
          />
        </span>

        <div className="min-w-0 flex-1">
          <p className="truncate font-mono text-xs text-foreground">{entry.filename}</p>
          {entry.state === "failed" && entry.error && (
            <p className="mt-0.5 text-[11.5px] text-severity-critical">{entry.error}</p>
          )}
          {entry.state === "done" && entry.supplierName && (
            <p className="mt-0.5 text-[11.5px] text-muted-foreground">
              NF {entry.noteNumber} · {entry.supplierName}
            </p>
          )}
        </div>

        {entry.state === "done" && entry.noteId && (
          <Button size="sm" onClick={() => onReview(entry.noteId!)}>
            {s.reviewCta}
          </Button>
        )}
      </div>

      {entry.state === "done" && counts && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-11">
          <Badge
            variant="outline"
            className={
              entry.supplierCreated
                ? "border-primary/40 text-primary"
                : "border-severity-success/40 text-severity-success"
            }
          >
            {entry.supplierCreated ? s.supplierCreated : s.supplierLinked}
          </Badge>
          {counts.auto > 0 && (
            <Badge variant="outline" className="border-severity-success/40 text-severity-success">
              {s.linkedByCode(counts.auto)}
            </Badge>
          )}
          {counts.ia > 0 && (
            <Badge variant="outline" className="border-severity-info/40 text-severity-info">
              {s.suggestedByAi(counts.ia)}
            </Badge>
          )}
          {counts.pend > 0 && (
            <Badge variant="outline" className="border-severity-warning/40 text-severity-warning">
              {s.pending(counts.pend)}
            </Badge>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Escrever a página**

`src/features/fiscal-notes/pages/FiscalNotesImportPage.tsx`:

```tsx
import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Icon } from "@/components/Icon";
import { useMultistore } from "@/features/multistore";
import { XmlDropzone } from "../components/import/XmlDropzone";
import { ImportQueueItem, type IImportQueueEntry } from "../components/import/ImportQueueItem";
import { summarizeLinks } from "../engine/importNote";
import { ImportRejected, useImportNfe } from "../hooks/useImportNfe";
import { FISCAL_NOTES_STRINGS } from "../i18n/pt-BR";

export function FiscalNotesImportPage() {
  const { currentStoreId } = useMultistore();
  const { importFile, isImporting } = useImportNfe(currentStoreId);
  const navigate = useNavigate();
  const [queue, setQueue] = useState<IImportQueueEntry[]>([]);
  const s = FISCAL_NOTES_STRINGS;

  function patch(id: string, next: Partial<IImportQueueEntry>) {
    setQueue((q) => q.map((e) => (e.id === id ? { ...e, ...next } : e)));
  }

  async function handleFiles(files: File[]) {
    for (const file of files) {
      const id = `${file.name}-${queue.length}-${file.size}`;
      setQueue((q) => [{ id, filename: file.name, state: "processing" }, ...q]);
      try {
        const outcome = await importFile(file);
        patch(id, {
          state: "done",
          noteId: outcome.note.id,
          noteNumber: outcome.note.number,
          supplierName: outcome.supplierName,
          supplierCreated: outcome.supplierCreated,
          counts: summarizeLinks(outcome.note.items),
        });
        toast.success(s.import.successToast(outcome.note.number, outcome.supplierCreated));
      } catch (error) {
        const message =
          error instanceof ImportRejected
            ? error.message
            : s.import.notXmlError(file.name);
        patch(id, { state: "failed", error: message });
        toast.error(message);
      }
    }
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex shrink-0 flex-col gap-1 border-b border-border/40 bg-background/85 px-4 py-3 shadow-lg shadow-foreground/5 backdrop-blur-2xl backdrop-saturate-[1.8] supports-[backdrop-filter]:bg-background/50 md:px-6">
        <div className="flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-md bg-primary/10 text-primary">
            <Icon icon="mdi:file-upload-outline" size={20} aria-hidden />
          </div>
          <h1 className="font-display text-xl font-extrabold uppercase leading-none tracking-[0.01em] text-foreground">
            {s.importTitle}
          </h1>
        </div>
        <p className="max-w-3xl text-[12.5px] text-muted-foreground">{s.importSubtitle}</p>
      </header>

      <div className="min-h-0 flex-1 overflow-auto px-4 py-4 md:px-6">
        <div className="mx-auto flex max-w-4xl flex-col gap-4">
          <XmlDropzone onFiles={handleFiles} disabled={isImporting} />

          {queue.length > 0 && (
            <section className="overflow-hidden rounded-xl border border-border bg-card">
              <h2 className="border-b border-border px-4 py-3 text-sm font-bold text-foreground">
                {s.import.queueTitle}
              </h2>
              {queue.map((entry) => (
                <ImportQueueItem
                  key={entry.id}
                  entry={entry}
                  onReview={(noteId) =>
                    navigate({ to: "/app/suprimentos/notas", search: { nota: noteId } })
                  }
                />
              ))}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Montar na rota**

Em `src/routes/app.suprimentos.importar.tsx`, trocar `component: () => <div />` por:

```tsx
import { FiscalNotesImportPage } from "@/features/fiscal-notes/pages/FiscalNotesImportPage";
```

```tsx
  component: FiscalNotesImportPage,
```

- [ ] **Step 5: Conferir a API do multistore e do navigate**

```bash
grep -rn "export function useMultistore" src/features/multistore/ | head -3
grep -rn "currentStoreId\|selectedStoreId" src/features/multistore/index.ts | head -5
```

Ajustar o nome do campo se divergir. Se a rota da lista não declarar `validateSearch` com `nota`, remover o `search` do `navigate` — navegar com search não declarado quebra em runtime.

- [ ] **Step 6: Verificar tipos e build**

```bash
bunx tsc --noEmit 2>&1 | grep -E "fiscal-notes"
bun run build 2>&1 | tail -3
```

Esperado: nenhuma linha do primeiro; build verde.

- [ ] **Step 7: Commit**

```bash
git add src/features/fiscal-notes/components/import/ src/features/fiscal-notes/pages/FiscalNotesImportPage.tsx src/routes/app.suprimentos.importar.tsx
git commit -m "feat(fiscal-notes): add the XML import screen with drop zone and queue"
```

---

### Task 6: Tela "Notas de entrada"

**Files:**
- Create: `src/features/fiscal-notes/components/list/FiscalNotesHeader.tsx`
- Create: `src/features/fiscal-notes/components/list/FiscalNotesKpis.tsx`
- Create: `src/features/fiscal-notes/components/list/FiscalNotesTable.tsx`
- Create: `src/features/fiscal-notes/pages/FiscalNotesListPage.tsx`
- Modify: `src/routes/app.suprimentos.notas.tsx`
- Modify: `src/features/fiscal-notes/index.ts`

**Interfaces:**
- Consumes: `useFiscalNotesList` (Task 4) · `useResizableColumns` de `@/shared/hooks/useResizableColumns` · `ScrollProgressBar` de `@/features/shell/components/ScrollProgressBar`
- Produces: `FiscalNotesListPage` — montada em `/app/suprimentos/notas`

- [ ] **Step 1: Escrever o header (busca com `/`, `kbd`, `Escape`)**

`src/features/fiscal-notes/components/list/FiscalNotesHeader.tsx`:

```tsx
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { FISCAL_NOTES_STRINGS } from "../../i18n/pt-BR";

export interface IFiscalNotesHeaderProps {
  total: number;
  searchValue: string;
  onSearchChange: (q: string) => void;
  onImport: () => void;
}

export function FiscalNotesHeader({
  total,
  searchValue,
  onSearchChange,
  onImport,
}: IFiscalNotesHeaderProps) {
  const [local, setLocal] = useState(searchValue);
  const [focused, setFocused] = useState(false);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const timerRef = useRef<number | null>(null);
  const s = FISCAL_NOTES_STRINGS;

  useEffect(() => setLocal(searchValue), [searchValue]);

  useEffect(() => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      if (local !== searchValue) onSearchChange(local);
    }, 300);
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [local]);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key !== "/" || e.defaultPrevented) return;
      const target = e.target as HTMLElement | null;
      if (
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable === true
      ) {
        return;
      }
      e.preventDefault();
      searchRef.current?.focus();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  const countLabel = total === 1 ? s.list.countOne(total) : s.list.countMany(total);

  return (
    <header className="flex flex-col gap-3 border-b border-border/40 bg-background/85 px-4 py-3 shadow-lg shadow-foreground/5 backdrop-blur-2xl backdrop-saturate-[1.8] supports-[backdrop-filter]:bg-background/50 md:flex-row md:items-center md:px-6">
      <div className="flex shrink-0 items-center gap-2">
        <div className="grid h-9 w-9 place-items-center rounded-md bg-primary/10 text-primary">
          <Icon icon="mdi:file-document-arrow-right-outline" size={20} aria-hidden />
        </div>
        <div>
          <h1 className="font-display text-xl font-extrabold uppercase leading-none tracking-[0.01em] text-foreground">
            {s.pageTitle}
          </h1>
          <p className="mt-0.5 text-[11.5px] tabular-nums text-muted-foreground">{countLabel}</p>
        </div>
      </div>

      <div className="flex w-full min-w-0 flex-col gap-2 sm:flex-row sm:items-center md:flex-1 md:justify-end">
        <div
          className={cn(
            "relative w-full flex-1 transition-[max-width] duration-300 ease-out motion-reduce:transition-none",
            focused ? "max-w-2xl" : "sm:max-w-sm",
          )}
        >
          <Icon
            icon="mdi:magnify"
            size={16}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            ref={searchRef}
            type="search"
            value={local}
            onChange={(e) => setLocal(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onKeyDown={(e) => {
              if (e.key === "Escape") e.currentTarget.blur();
            }}
            placeholder={s.list.searchPlaceholder}
            aria-label={s.list.searchPlaceholder}
            className="pl-8 pr-9"
          />
          <kbd
            className={cn(
              "pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded border border-border px-1.5 text-[10px] text-muted-foreground sm:flex",
              focused && "opacity-0",
            )}
          >
            /
          </kbd>
        </div>

        <Button size="sm" className="shrink-0" onClick={onImport}>
          <Icon icon="mdi:file-upload-outline" size={15} aria-hidden />
          {s.list.importCta}
        </Button>
      </div>
    </header>
  );
}
```

- [ ] **Step 2: Escrever os KPIs**

`src/features/fiscal-notes/components/list/FiscalNotesKpis.tsx`:

```tsx
import type { IFiscalNote } from "@/shared/types";
import { FISCAL_NOTES_STRINGS } from "../../i18n/pt-BR";

const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export interface IFiscalNotesKpisProps {
  notes: IFiscalNote[];
}

export function FiscalNotesKpis({ notes }: IFiscalNotesKpisProps) {
  const s = FISCAL_NOTES_STRINGS.kpis;
  const inReview = notes.filter((n) => n.status === "conferencia");
  const totalValue = notes.reduce((sum, n) => sum + n.total, 0);
  const unlinked = inReview.reduce(
    (sum, n) => sum + n.items.filter((i) => !i.confirmed).length,
    0,
  );

  const cards: Array<{ label: string; value: string; hint: string; tone?: string }> = [
    { label: s.notes, value: String(notes.length), hint: "" },
    { label: s.value, value: brl(totalValue), hint: s.valueHint },
    {
      label: s.review,
      value: String(inReview.length),
      hint: inReview.length ? brl(inReview.reduce((a, n) => a + n.total, 0)) : s.reviewEmpty,
      tone: inReview.length ? "text-severity-warning" : undefined,
    },
    {
      label: s.unlinked,
      value: String(unlinked),
      hint: s.unlinkedHint,
      tone: unlinked ? "text-severity-critical" : undefined,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border lg:grid-cols-4">
      {cards.map((card) => (
        <div key={card.label} className="bg-card px-4 py-3">
          <p className="font-semicond text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
            {card.label}
          </p>
          <p
            className={`mt-1 font-display text-2xl font-extrabold leading-none tabular-nums ${card.tone ?? "text-foreground"}`}
          >
            {card.value}
          </p>
          {card.hint && <p className="mt-1.5 text-[11.5px] text-muted-foreground">{card.hint}</p>}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Escrever a tabela redimensionável**

`src/features/fiscal-notes/components/list/FiscalNotesTable.tsx`:

```tsx
import { Icon } from "@/components/Icon";
import { Badge } from "@/components/ui/badge";
import { useResizableColumns } from "@/shared/hooks/useResizableColumns";
import type { IFiscalNote } from "@/shared/types";
import { FISCAL_NOTES_STRINGS } from "../../i18n/pt-BR";

const COLUMNS = [
  { id: "note", defaultWidth: 320 },
  { id: "issued", defaultWidth: 100 },
  { id: "entered", defaultWidth: 100 },
  { id: "items", defaultWidth: 72 },
  { id: "total", defaultWidth: 130 },
  { id: "duplicates", defaultWidth: 120 },
  { id: "status", defaultWidth: 160 },
] as const;

type ColumnId = (typeof COLUMNS)[number]["id"];

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });

export interface IFiscalNotesTableProps {
  notes: IFiscalNote[];
  scrollRef?: (el: HTMLDivElement | null) => void;
  onOpen: (note: IFiscalNote) => void;
}

export function FiscalNotesTable({ notes, scrollRef, onOpen }: IFiscalNotesTableProps) {
  const { widths, totalWidth, startResize } = useResizableColumns<ColumnId>(
    COLUMNS,
    "gallo-fiscal-notes-column-widths",
  );
  const s = FISCAL_NOTES_STRINGS;

  return (
    <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto">
      <table className="w-full table-fixed border-collapse" style={{ minWidth: totalWidth }}>
        <colgroup>
          {COLUMNS.map((col) => (
            <col key={col.id} style={{ width: widths[col.id] }} />
          ))}
        </colgroup>
        <thead className="sticky top-0 z-10 bg-background">
          <tr className="border-b border-border [&>th:not(:last-child)]:border-r [&>th:not(:last-child)]:border-border/70">
            {COLUMNS.map((col) => (
              <th
                key={col.id}
                className="relative px-3 py-2 text-left font-semicond text-[10.5px] uppercase tracking-[0.1em] text-muted-foreground"
              >
                {s.columns[col.id as keyof typeof s.columns]}
                <span
                  role="separator"
                  aria-orientation="vertical"
                  onPointerDown={(e) => startResize(col.id, e)}
                  onClick={(e) => e.stopPropagation()}
                  className="absolute inset-y-0 right-0 w-1.5 cursor-col-resize touch-none hover:bg-primary/40"
                />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {notes.map((note) => {
            const pending = note.items.filter((i) => !i.confirmed).length;
            const isReview = note.status === "conferencia";
            return (
              <tr
                key={note.id}
                onClick={() => onOpen(note)}
                className="cursor-pointer border-b border-border transition-colors hover:bg-muted/40 motion-reduce:transition-none"
              >
                <td className="px-3 py-2">
                  <p className="truncate text-[13px] font-medium text-foreground">
                    NF {note.number} · série {note.series}
                  </p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {s.origin[note.origin]}
                  </p>
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  {shortDate(note.issuedAt)}
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  {shortDate(note.enteredAt)}
                </td>
                <td className="px-3 py-2 text-[13px] tabular-nums text-foreground">
                  {note.items.length}
                </td>
                <td className="px-3 py-2 text-right text-[13px] font-bold tabular-nums text-foreground">
                  {brl(note.total)}
                </td>
                <td className="px-3 py-2 text-xs tabular-nums text-muted-foreground">
                  {note.duplicates.length}×
                </td>
                <td className="px-3 py-2">
                  <Badge
                    variant="outline"
                    className={
                      isReview
                        ? "border-severity-warning/40 text-severity-warning"
                        : "border-severity-success/40 text-severity-success"
                    }
                  >
                    <Icon
                      icon={isReview ? "mdi:clipboard-check-outline" : "mdi:check-all"}
                      size={12}
                      aria-hidden
                    />
                    {s.status[note.status]}
                    {isReview && pending > 0 ? ` · ${pending}` : ""}
                  </Badge>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 4: Escrever a página**

`src/features/fiscal-notes/pages/FiscalNotesListPage.tsx`:

```tsx
import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { ScrollProgressBar } from "@/features/shell/components/ScrollProgressBar";
import type { FiscalNoteStatus } from "@/shared/types";
import { FiscalNotesHeader } from "../components/list/FiscalNotesHeader";
import { FiscalNotesKpis } from "../components/list/FiscalNotesKpis";
import { FiscalNotesTable } from "../components/list/FiscalNotesTable";
import { useFiscalNotesList } from "../hooks/useFiscalNotesList";
import { FISCAL_NOTES_STRINGS } from "../i18n/pt-BR";

type Filter = "all" | FiscalNoteStatus;

export function FiscalNotesListPage() {
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);
  const navigate = useNavigate();
  const s = FISCAL_NOTES_STRINGS;

  const { notes, total, isLoading, isError, refetch } = useFiscalNotesList({
    status: filter === "all" ? undefined : filter,
    search: search || undefined,
  });

  const filters: Array<{ key: Filter; label: string }> = [
    { key: "all", label: s.list.filterAll },
    { key: "conferencia", label: s.list.filterConferencia },
    { key: "lancada", label: s.list.filterLancada },
  ];

  return (
    <div className="flex h-full flex-col">
      <FiscalNotesHeader
        total={total}
        searchValue={search}
        onSearchChange={setSearch}
        onImport={() => navigate({ to: "/app/suprimentos/importar" })}
      />

      <div className="shrink-0 px-4 pt-4 md:px-6">
        <FiscalNotesKpis notes={notes} />
        <div className="mt-3 flex flex-wrap gap-2">
          {filters.map((f) => (
            <Button
              key={f.key}
              size="sm"
              variant={filter === f.key ? "default" : "outline"}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Seam de altura zero: a linha de progresso mora na divisa exata entre o
          bloco fixo e a área rolável (ux-guidelines §2). */}
      <div className="relative h-0">
        <ScrollProgressBar container={scrollEl} />
      </div>

      {isError ? (
        <div className="grid flex-1 place-items-center gap-3 p-8 text-center">
          <p className="text-sm text-muted-foreground">{s.list.errorTitle}</p>
          <Button size="sm" variant="outline" onClick={() => void refetch()}>
            {s.list.retry}
          </Button>
        </div>
      ) : isLoading ? (
        <div className="flex-1 space-y-2 p-4 md:p-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded-md bg-muted motion-reduce:animate-none" />
          ))}
        </div>
      ) : notes.length === 0 ? (
        <div className="grid flex-1 place-items-center gap-3 p-8 text-center">
          <p className="font-display text-lg font-extrabold uppercase text-foreground">
            {s.list.emptyTitle}
          </p>
          <p className="max-w-sm text-sm text-muted-foreground">{s.list.emptyDescription}</p>
          <Button size="sm" onClick={() => navigate({ to: "/app/suprimentos/importar" })}>
            {s.list.importCta}
          </Button>
        </div>
      ) : (
        <FiscalNotesTable
          notes={notes}
          scrollRef={setScrollEl}
          onOpen={() => {
            /* A conferência é a Fase 3; até lá a linha não navega. */
          }}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 5: Montar na rota e exportar pelo barrel**

Em `src/routes/app.suprimentos.notas.tsx`, importar e usar `FiscalNotesListPage` como `component`.

Em `src/features/fiscal-notes/index.ts`:

```ts
export * from "./engine";
export { FiscalNotesListPage } from "./pages/FiscalNotesListPage";
export { FiscalNotesImportPage } from "./pages/FiscalNotesImportPage";
```

- [ ] **Step 6: Conferir a assinatura do ScrollProgressBar**

```bash
grep -nE "export function ScrollProgressBar|container|scrollRef" src/features/shell/components/ScrollProgressBar.tsx | head -8
```

Ajustar o nome da prop se divergir de `container`.

- [ ] **Step 7: Verificar tipos e build**

```bash
bunx tsc --noEmit 2>&1 | grep -E "fiscal-notes"
bun run build 2>&1 | tail -3
```

Esperado: nenhuma linha do primeiro; build verde.

- [ ] **Step 8: Commit**

```bash
git add src/features/fiscal-notes/components/list/ src/features/fiscal-notes/pages/FiscalNotesListPage.tsx src/features/fiscal-notes/index.ts src/routes/app.suprimentos.notas.tsx
git commit -m "feat(fiscal-notes): add the inbound notes list screen"
```

---

### Task 7: Gate da fase

**Files:** nenhum novo — verificação e correção do que os gates apontarem.

- [ ] **Step 1: Delta de tipos**

```bash
bunx tsc --noEmit 2>&1 | grep -iE "fiscal|supplies|suprimentos"
```

Esperado: nenhuma linha. Se houver, corrigir estreitando explicitamente — o projeto roda com `noUncheckedIndexedAccess`, então acesso indexado é `T | undefined`. Nada de `any` nem `@ts-ignore`.

- [ ] **Step 2: Suíte completa**

```bash
bun run test
```

Esperado: verde, sem regressão na contagem anterior (3665 na Fase 1, mais os testes novos).

- [ ] **Step 3: Build**

```bash
bun run build
```

Esperado: verde.

- [ ] **Step 4: Fronteira de mocks**

```bash
bun run lint 2>&1 | grep -iE "fiscal-notes|no-restricted-imports"
```

Esperado: nenhuma linha. Se acusar, a feature está importando `@/mocks` ou `@/providers/data/impl/*` — passar tudo pelo barrel `@/providers/data`.

- [ ] **Step 5: Tema claro e escuro, sem hex**

```bash
grep -rnE "#[0-9a-fA-F]{6}|--gallo-" src/features/fiscal-notes/ ; echo "hex ou primitivo: $? (1 = limpo)"
```

Esperado: `1`.

- [ ] **Step 6: Commit final e push**

```bash
git push -u origin claude/fiscal-notes-fase2
```

Abrir PR com **base `claude/invoice-management-2270ef`**, não `main`.

---

## Self-Review

**1. Cobertura da spec (Fase 2 do PRD-216).** Grupo SUPRIMENTOS → Task 2. Seed RBAC (RF-111) → Task 1. Tela "Notas de entrada" → Task 6. Tela "Importar XML" com upload e parse no cliente (origem 1) → Tasks 4 e 5. Vínculo/criação de fornecedor pelo CNPJ → Tasks 3 e 4. Tokens semânticos (RF-112) → Task 7 Step 5. Regras de UX (RF-113) → Tasks 5 e 6, verificadas contra `ux-guidelines.md` §1–§4. Entregável declarado ("soltar um XML cria a nota em conferência com o fornecedor certo") → Task 5, provado pelos testes da Task 3.

**Deliberadamente fora desta fase:** conferência item a item, lançar/estornar e o mapa `cProd → SKU` são Fase 3 — por isso `mappedCodes` entra vazio no hook e a linha da tabela ainda não navega. Análise IA e as origens 2–4 são Fase 4. Auditoria (RF-114) entra na Fase 3, junto das mutações que valem trilha; importar já registra a nota, e a trilha completa acompanha o lançamento.

**2. Placeholders.** Nenhum "TBD" nem passo sem código. Os quatro passos de verificação de API (Task 4 Steps 1 e 4, Task 5 Step 5, Task 6 Step 6) trazem o comando exato e o critério de decisão — são conferências contra o código existente, não lacunas.

**3. Consistência de tipos.** `ILinkCounts` é `Record<ItemLinkMode, number>` na Task 3 e é o tipo de `IImportQueueEntry.counts` na Task 5. `buildNoteFromNfe` devolve `ICreateFiscalNoteInput`, exatamente o que `notes.create` recebe na Task 4. `summarizeLinks` aceita `Pick<IFiscalNoteItem,"linkMode">[]`, satisfeito tanto pelos itens do input quanto pelos da nota criada. `useResizableColumns<ColumnId>` recebe o `COLUMNS` com `as const`, e `ColumnId` sai dele — as chaves de `FISCAL_NOTES_STRINGS.columns` cobrem os sete ids.

**4. Riscos conhecidos, com o antídoto no próprio plano.** O seed RBAC ausente derruba o menu para todos (Task 1, com o precedente citado). O guard com lista de papéis anula o Editor de Papéis (Task 2, `undefined` explícito). O PR empilhado não vai sozinho para a `main` (Global Constraints).
