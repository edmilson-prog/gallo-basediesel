# Agenda — catálogo de contatos (Fase 1) — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar a tela Agenda — catálogo de contatos da operação, onde o contato é a pessoa ou o número, vinculado a um cliente ou solto, com dono, etiquetas, opt-out e ações em massa.

**Architecture:** Tabela `contacts` nova no Supabase com RLS espelhando `customers`; `customers` e `leads` ficam intactos. Feature nova em `src/features/contacts/` consumindo dados só via Provider Pattern (`useContactsProvider()`). Lógica de filtro/escopo/iniciais isolada em `engine/` puro e testada com Vitest. UI recriando o kit `ui_kits/agenda` com tokens semânticos.

**Tech Stack:** React 18 + TypeScript strict, TanStack Router (file-based) + TanStack Query, Tailwind v4 + shadcn/ui, Iconify via `@/components/Icon`, Vitest, Supabase (Postgres + RLS), bun.

**Spec:** `docs/superpowers/specs/2026-08-06-agenda-contatos-design.md`

## Global Constraints

Estas regras valem para **todas** as tarefas. Não repetir em cada uma, mas nunca violar.

- **Idioma:** código, comentários e nomes em **inglês**; todo texto de interface em **português do Brasil com acentuação correta** (ã, ç, é, í, ó, ú, â, ê, ô). Nunca "opcao" por "opção".
- **Tokens semânticos apenas.** `bg-background`, `bg-card`, `text-foreground`, `text-muted-foreground`, `border-border`, `text-/bg-/border-severity-*`. **Proibido** hex literal, `--gallo-*` e qualquer constante da paleta `AGD` do kit.
- **Provider Pattern.** Features acessam dados **exclusivamente** por `@/providers/data`. É erro de ESLint importar `@/mocks`, `@/providers/data/impl/*`, `@/providers/data/contracts/*` individuais ou `@/providers/data/factory`.
- **`routeTree.gen.ts` é gerado.** Nunca editar à mão.
- **TypeScript `strict: true`.** Evitar `any`. Interfaces de domínio prefixadas com `I`.
- **Multi-loja:** toda entidade comercial carrega `storeId`. **Division:** default `'parts'`.
- **Migrations:** todo `apply_migration` via MCP **deve** ser exportado para `supabase/migrations/` no mesmo PR. O nome do arquivo é o `version` da migration. **Mergear o PR não aplica a migration** — a aplicação em produção é manual e exige OK explícito do dono.
- **Commits:** Conventional Commits em inglês, atômicos, imperativo presente.
- **Gate de CI:** `bun run build` + `bun run test`. `bun run build` **não** faz type-check; `bunx tsc --noEmit` roda à parte e é avaliado **por delta** (existe baseline de ~315 erros pré-existentes).
- **Nunca commitar na `main`.** Todo o trabalho ocorre na worktree `.claude/worktrees/feat-agenda-contatos`, branch `feat/agenda-contatos`.

---

## Estrutura de arquivos

**Criados:**

| Arquivo | Responsabilidade |
|---|---|
| `src/shared/types/contacts.ts` | `IContact`, `IContactScopeCounts`, `ContactSource`, `ContactScope` |
| `src/providers/data/contracts/contacts.ts` | `IContactsProvider`, `IListContactsParams` |
| `src/providers/data/impl/mock/contacts.ts` | provider mock |
| `src/providers/data/impl/supabase/contacts.ts` | provider Supabase (mapper row↔domínio) |
| `src/providers/data/hooks/useContactsProvider.ts` | hook do barrel |
| `src/mocks/api/contacts.ts` | API mock determinística por seed |
| `src/features/contacts/engine/contactInitials.ts` | iniciais do avatar |
| `src/features/contacts/engine/contactFilters.ts` | busca + filtros client-side |
| `src/features/contacts/engine/contactScopes.ts` | classificação por escopo |
| `src/features/contacts/hooks/useContacts.ts` | queries + mutations |
| `src/features/contacts/pages/ContactsPage.tsx` | orquestra estado da tela |
| `src/features/contacts/components/list/*` | header, filtros, bulk bar, card, grid, tabela, colunas, paginação, vazio |
| `src/features/contacts/components/detail/ContactDrawer.tsx` | gaveta de detalhe |
| `src/features/contacts/components/modals/*` | novo, vincular, etiquetas, transferir, opt-out, exportar |
| `src/features/contacts/index.ts` | barrel público |
| `src/routes/app.agenda.tsx` | rota file-based |
| `supabase/migrations/<ts>_create_contacts_table.sql` | tabela + índices + RLS + trigger |
| `supabase/migrations/<ts>_backfill_contacts.sql` | backfill de clientes e leads |

**Modificados:**

| Arquivo | Mudança |
|---|---|
| `src/shared/types/index.ts` | reexporta `./contacts` |
| `src/providers/data/contracts/index.ts` | reexporta contrato + adiciona `contacts` a `IDataProviders` |
| `src/providers/data/factory.ts` | registra provider mock e supabase |
| `src/providers/data/index.ts` | exporta tipos e `useContactsProvider` |
| `src/features/rbac/permissions/resources.ts` | novo literal `"contact"` |
| `src/features/rbac/permissions/matrix.ts` | entradas por papel |
| `src/features/rbac/permissions/seed.ts` | seed do recurso |
| `src/features/shell/config/routes.ts` | `APP_AGENDA: "/app/agenda"` |
| `src/features/shell/config/navigation.ts` | item Agenda no grupo Atendimento |

---

### Task 1: Tipo de domínio e contrato do provider

**Files:**
- Create: `src/shared/types/contacts.ts`
- Create: `src/providers/data/contracts/contacts.ts`
- Modify: `src/shared/types/index.ts`
- Modify: `src/providers/data/contracts/index.ts`

**Interfaces:**
- Consumes: `ID`, `Division` de `src/shared/types/common.ts`; `IPaginatedResult`, `IPaginationParams` de `../contracts/_shared`.
- Produces: `IContact`, `IContactScopeCounts`, `ContactSource`, `ContactScope`, `IContactsProvider`, `IListContactsParams` — usados por **todas** as tarefas seguintes.

- [ ] **Step 1: Criar o tipo de domínio**

`src/shared/types/contacts.ts`:

```ts
import type { Division, ID } from "./common";

/** Where the contact came from. Mirrors the `source` column. */
export type ContactSource =
  | "whatsapp"
  | "dintec"
  | "manual"
  | "csv"
  | "balcao"
  | "portal_b2b"
  | "storefront";

/** Scope chips on the filters bar. */
export type ContactScope = "todos" | "vinculados" | "soltos" | "optout";

/**
 * A person or a number in the operation's phonebook.
 *
 * `customerId === null` means a LOOSE contact: a number that talked to us and
 * does not belong to a customer yet. `leadId` keeps the origin traceable when
 * the contact was materialised from a lead — `customers` and `leads` are never
 * modified by this feature.
 */
export interface IContact {
  id: ID;
  storeId: ID;
  name: string;
  /** Job title or function ("Compras", "Gerente de frota"). */
  role: string | null;
  /** Display-formatted phone. */
  phone: string | null;
  /** Digits only — powers search and duplicate detection. */
  phoneDigits: string | null;
  email: string | null;
  city: string | null;
  uf: string | null;
  /** null = loose contact. */
  customerId: ID | null;
  /** Denormalised on read for the card/table; never written. */
  customerName: string | null;
  leadId: ID | null;
  ownerSellerId: ID | null;
  /** Denormalised on read. */
  ownerName: string | null;
  tags: string[];
  source: ContactSource;
  optOut: boolean;
  optOutAt: string | null;
  optOutBy: ID | null;
  nextContactAt: string | null;
  nextContactNote: string | null;
  lastContactAt: string | null;
  hasWhatsapp: boolean;
  division: Division;
  createdAt: string;
  updatedAt: string;
}

/** Counts behind the scope chips. A contact can fall in more than one. */
export interface IContactScopeCounts {
  todos: number;
  vinculados: number;
  soltos: number;
  optout: number;
}
```

- [ ] **Step 2: Reexportar no barrel de tipos**

Em `src/shared/types/index.ts`, acrescentar junto às demais reexportações:

```ts
export * from "./contacts";
```

- [ ] **Step 3: Criar o contrato do provider**

`src/providers/data/contracts/contacts.ts`:

```ts
import type { IContact, IContactScopeCounts, ContactScope, ContactSource, ID } from "@/shared/types";
import type { IPaginatedResult, IPaginationParams } from "./_shared";

/** Bucket for the "Último contato" filter. */
export type ContactRecencyBucket = "hoje" | "7d" | "30d" | "90d+" | "nunca";

export type ContactsOrderBy =
  | "name"
  | "phone"
  | "customer"
  | "role"
  | "email"
  | "city"
  | "owner"
  | "lastContactAt"
  | "status"
  | "source";

export interface IListContactsParams extends IPaginationParams {
  storeId?: ID;
  scope?: ContactScope;
  /** Matches name, phone (formatted AND digits-only), e-mail, company, role, city. */
  search?: string;
  ownerSellerIds?: ID[];
  /** True to restrict to contacts with no owner. Combines with ownerSellerIds. */
  unassignedOwner?: boolean;
  tags?: string[];
  city?: string;
  uf?: string;
  sources?: ContactSource[];
  lastContactBucket?: ContactRecencyBucket;
  orderBy?: ContactsOrderBy;
  orderDir?: "asc" | "desc";
}

/**
 * Contract for the Agenda (contacts catalog).
 *
 * Implementations: `mockContactsProvider`, `supabaseContactsProvider`.
 *
 * Pagination is SERVER-SIDE: the base holds ~5.363 contacts and the
 * `authenticated` role carries an 8s statement_timeout, so callers must never
 * ask for the whole table to filter it in the browser. `list()` honours
 * `pageSize` and reports the real `total`; consumers must page off `total`,
 * never off `data.length`.
 */
export interface IContactsProvider {
  list(params?: IListContactsParams): Promise<IPaginatedResult<IContact>>;
  get(id: ID): Promise<IContact>;
  create(input: Omit<IContact, "id" | "createdAt" | "updatedAt" | "customerName" | "ownerName">): Promise<IContact>;
  update(id: ID, patch: Partial<IContact>): Promise<IContact>;
  delete(id: ID): Promise<void>;

  /** Link/unlink to a customer. `customerId === null` unlinks. */
  linkToCustomer(id: ID, customerId: ID | null): Promise<IContact>;
  /** Toggle LGPD opt-out, stamping author and date. */
  setOptOut(id: ID, optOut: boolean): Promise<IContact>;
  /** Schedule a follow-up. `at` is an ISO timestamp. */
  scheduleFollowUp(id: ID, at: string, note?: string): Promise<IContact>;

  /** Bulk operations — resolve to the number of rows actually affected. */
  bulkAddTag(ids: ID[], tag: string): Promise<number>;
  bulkRemoveTag(ids: ID[], tag: string): Promise<number>;
  bulkTransferOwner(ids: ID[], ownerSellerId: ID | null): Promise<number>;
  bulkSetOptOut(ids: ID[], optOut: boolean): Promise<number>;

  /** Scope chip counts for the current filter set (server-computed). */
  counts(params?: IListContactsParams): Promise<IContactScopeCounts>;
}
```

- [ ] **Step 4: Registrar no barrel de contratos**

Em `src/providers/data/contracts/index.ts`, reexportar **apenas os tipos**:

```ts
export type {
  IContactsProvider,
  IListContactsParams,
  ContactsOrderBy,
  ContactRecencyBucket,
} from "./contacts";
```

> **Não** acrescentar `contacts` à interface `IDataProviders` nesta tarefa. Essa chave entra na **Task 8**, no mesmo commit que registra as duas implementações no factory — assim toda tarefa fecha com o build verde e o gate de build da revisão continua valendo alguma coisa.

- [ ] **Step 5: Verificar que o build continua verde**

Run: `bun run build`
Expected: PASS. Esta tarefa só acrescenta tipos e reexportações; nada deve quebrar.

- [ ] **Step 6: Commit**

```bash
git add src/shared/types/contacts.ts src/shared/types/index.ts \
        src/providers/data/contracts/contacts.ts src/providers/data/contracts/index.ts
git commit -m "feat(contacts): add IContact domain type and provider contract"
```

---

### Task 2: engine — iniciais do avatar

**Files:**
- Create: `src/features/contacts/engine/contactInitials.ts`
- Test: `src/features/contacts/engine/contactInitials.test.ts`

**Interfaces:**
- Produces: `contactInitials(name: string): string` — usado pelo `ContactCard` (Task 11), pela `ContactsTable` (Task 14) e pelo `ContactDrawer` (Task 17).

- [ ] **Step 1: Escrever o teste que falha**

`src/features/contacts/engine/contactInitials.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { contactInitials } from "./contactInitials";

describe("contactInitials", () => {
  it("takes the first letter of the first two meaningful words", () => {
    expect(contactInitials("Adair Antonello")).toBe("AA");
    expect(contactInitials("Marlene Kuhn")).toBe("MK");
  });

  it("skips short connectors when picking the second word", () => {
    expect(contactInitials("Cláudio de Périco")).toBe("CP");
  });

  it("falls back to a single letter for a one-word name", () => {
    expect(contactInitials("Jonas")).toBe("J");
  });

  it("ignores parentheses", () => {
    expect(contactInitials("(Jonas) Bomba")).toBe("JB");
  });

  it("returns # for a bare phone number", () => {
    expect(contactInitials("(55) 99401-8876")).toBe("#");
    expect(contactInitials("+55 55 99401 8876")).toBe("#");
  });

  it("returns # for an empty or blank name", () => {
    expect(contactInitials("")).toBe("#");
    expect(contactInitials("   ")).toBe("#");
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `bun run test -- src/features/contacts/engine/contactInitials.test.ts`
Expected: FAIL — `Failed to resolve import "./contactInitials"`.

- [ ] **Step 3: Implementar**

`src/features/contacts/engine/contactInitials.ts`:

```ts
/** A name made only of digits and phone punctuation is a number, not a name. */
const PHONE_LIKE = /^\+?[0-9()\s.\-+]+$/;

/**
 * Avatar initials for a contact.
 *
 * A bare phone number has no initials — the kit renders "#" for it, which is
 * how an unnamed WhatsApp profile shows up in the grid.
 */
export function contactInitials(name: string): string {
  const clean = name.replace(/[()]/g, "").trim();
  if (clean === "") return "#";
  if (PHONE_LIKE.test(clean)) return "#";

  // Drop connectors only. Filtering by word LENGTH looks equivalent but is
  // not: it also eats real two-letter names (Zé, Jô, Sá, Tó), turning
  // "Zé Antonello" into "A".
  const parts = clean.split(/\s+/).filter((part) => !CONNECTORS.has(normalize(part)));
  const initials = `${parts[0]?.[0] ?? ""}${parts[1]?.[0] ?? ""}`.toUpperCase();
  return initials !== "" ? initials : clean[0]!.toUpperCase();
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `bun run test -- src/features/contacts/engine/contactInitials.test.ts`
Expected: PASS — 6 testes.

- [ ] **Step 5: Commit**

```bash
git add src/features/contacts/engine/contactInitials.ts src/features/contacts/engine/contactInitials.test.ts
git commit -m "feat(contacts): add avatar initials engine"
```

---

### Task 3: engine — classificação por escopo

**Files:**
- Create: `src/features/contacts/engine/contactScopes.ts`
- Test: `src/features/contacts/engine/contactScopes.test.ts`

**Interfaces:**
- Consumes: `IContact`, `ContactScope`, `IContactScopeCounts` (Task 1).
- Produces: `matchesScope(contact: IContact, scope: ContactScope): boolean` e `countScopes(contacts: IContact[]): IContactScopeCounts` — usados pela `ContactsFiltersBar` (Task 13) e pelo provider mock (Task 7).

- [ ] **Step 1: Escrever o teste que falha**

`src/features/contacts/engine/contactScopes.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { IContact } from "@/shared/types";
import { countScopes, matchesScope } from "./contactScopes";

function contact(patch: Partial<IContact> = {}): IContact {
  return {
    id: "ct-1",
    storeId: "st-1",
    name: "Adair Antonello",
    role: null,
    phone: "(55) 99164-0300",
    phoneDigits: "55991640300",
    email: null,
    city: null,
    uf: null,
    customerId: null,
    customerName: null,
    leadId: null,
    ownerSellerId: null,
    ownerName: null,
    tags: [],
    source: "manual",
    optOut: false,
    optOutAt: null,
    optOutBy: null,
    nextContactAt: null,
    nextContactNote: null,
    lastContactAt: null,
    hasWhatsapp: true,
    division: "parts",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...patch,
  };
}

describe("matchesScope", () => {
  it("todos matches everything", () => {
    expect(matchesScope(contact(), "todos")).toBe(true);
    expect(matchesScope(contact({ optOut: true }), "todos")).toBe(true);
  });

  it("vinculados requires a customer", () => {
    expect(matchesScope(contact({ customerId: "cu-1" }), "vinculados")).toBe(true);
    expect(matchesScope(contact({ customerId: null }), "vinculados")).toBe(false);
  });

  it("soltos requires no customer", () => {
    expect(matchesScope(contact({ customerId: null }), "soltos")).toBe(true);
    expect(matchesScope(contact({ customerId: "cu-1" }), "soltos")).toBe(false);
  });

  it("optout keys off the flag, independent of the link", () => {
    expect(matchesScope(contact({ optOut: true, customerId: "cu-1" }), "optout")).toBe(true);
    expect(matchesScope(contact({ optOut: false }), "optout")).toBe(false);
  });
});

describe("countScopes", () => {
  it("counts each scope, and opt-out overlaps the others", () => {
    const rows = [
      contact({ id: "a", customerId: "cu-1" }),
      contact({ id: "b", customerId: "cu-2", optOut: true }),
      contact({ id: "c", customerId: null }),
      contact({ id: "d", customerId: null, optOut: true }),
    ];

    expect(countScopes(rows)).toEqual({
      todos: 4,
      vinculados: 2,
      soltos: 2,
      // opt-out is transversal: one linked + one loose
      optout: 2,
    });
  });

  it("returns zeros for an empty list", () => {
    expect(countScopes([])).toEqual({ todos: 0, vinculados: 0, soltos: 0, optout: 0 });
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `bun run test -- src/features/contacts/engine/contactScopes.test.ts`
Expected: FAIL — módulo não encontrado.

- [ ] **Step 3: Implementar**

`src/features/contacts/engine/contactScopes.ts`:

```ts
import type { ContactScope, IContact, IContactScopeCounts } from "@/shared/types";

/**
 * Whether a contact belongs to a scope chip.
 *
 * `vinculados` + `soltos` partition the base; `optout` cuts across both, so the
 * chip counts intentionally do not add up to `todos`.
 */
export function matchesScope(contact: IContact, scope: ContactScope): boolean {
  switch (scope) {
    case "vinculados":
      return contact.customerId !== null;
    case "soltos":
      return contact.customerId === null;
    case "optout":
      return contact.optOut;
    case "todos":
    default:
      return true;
  }
}

export function countScopes(contacts: IContact[]): IContactScopeCounts {
  const counts: IContactScopeCounts = { todos: 0, vinculados: 0, soltos: 0, optout: 0 };
  for (const contact of contacts) {
    counts.todos++;
    if (contact.customerId !== null) counts.vinculados++;
    else counts.soltos++;
    if (contact.optOut) counts.optout++;
  }
  return counts;
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `bun run test -- src/features/contacts/engine/contactScopes.test.ts`
Expected: PASS — 6 testes.

- [ ] **Step 5: Commit**

```bash
git add src/features/contacts/engine/contactScopes.ts src/features/contacts/engine/contactScopes.test.ts
git commit -m "feat(contacts): add scope classification engine"
```

---

### Task 4: engine — busca e filtros

**Files:**
- Create: `src/features/contacts/engine/contactFilters.ts`
- Test: `src/features/contacts/engine/contactFilters.test.ts`

**Interfaces:**
- Consumes: `IContact` (Task 1), `matchesScope` (Task 3).
- Produces: `matchesSearch(contact: IContact, term: string): boolean` e `applyContactFilters(contacts: IContact[], filters: IContactFilterState): IContact[]`, mais o tipo `IContactFilterState` — consumidos pelo provider mock (Task 7) e pela `ContactsPage` (Task 18).

- [ ] **Step 1: Escrever o teste que falha**

`src/features/contacts/engine/contactFilters.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { IContact } from "@/shared/types";
import { applyContactFilters, matchesSearch, type IContactFilterState } from "./contactFilters";

function contact(patch: Partial<IContact> = {}): IContact {
  return {
    id: "ct-1",
    storeId: "st-1",
    name: "Marlene Kuhn",
    role: "Compras",
    phone: "(55) 99712-4488",
    phoneDigits: "55997124488",
    email: "compras@fronteiraoeste.com.br",
    city: "Palmitinho",
    uf: "RS",
    customerId: "cu-1",
    customerName: "Transportes Fronteira Oeste",
    leadId: null,
    ownerSellerId: "sl-1",
    ownerName: "Thiago Oliveira",
    tags: ["Compras", "B2B"],
    source: "dintec",
    optOut: false,
    optOutAt: null,
    optOutBy: null,
    nextContactAt: null,
    nextContactNote: null,
    lastContactAt: "2026-08-05T19:40:00.000Z",
    hasWhatsapp: true,
    division: "parts",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...patch,
  };
}

const EMPTY: IContactFilterState = {
  scope: "todos",
  search: "",
  owners: [],
  tags: [],
  city: null,
  sources: [],
};

describe("matchesSearch", () => {
  it("is case and accent tolerant on the name", () => {
    expect(matchesSearch(contact(), "marlene")).toBe(true);
    expect(matchesSearch(contact({ name: "Cláudio Périco" }), "claudio")).toBe(true);
  });

  it("matches the company, role and city", () => {
    expect(matchesSearch(contact(), "fronteira")).toBe(true);
    expect(matchesSearch(contact(), "compras")).toBe(true);
    expect(matchesSearch(contact(), "palmitinho")).toBe(true);
  });

  it("matches the e-mail", () => {
    expect(matchesSearch(contact(), "fronteiraoeste.com")).toBe(true);
  });

  it("matches the formatted phone", () => {
    expect(matchesSearch(contact(), "99712-4488")).toBe(true);
  });

  it("matches digits typed without formatting", () => {
    expect(matchesSearch(contact(), "5599712")).toBe(true);
    expect(matchesSearch(contact(), "997124488")).toBe(true);
  });

  it("does not match an unrelated term", () => {
    expect(matchesSearch(contact(), "scania")).toBe(false);
  });

  it("treats an empty term as a match", () => {
    expect(matchesSearch(contact(), "   ")).toBe(true);
  });
});

describe("applyContactFilters", () => {
  const rows = [
    contact({ id: "a", ownerSellerId: "sl-1", tags: ["Compras"], source: "dintec" }),
    contact({ id: "b", ownerSellerId: "sl-2", tags: ["Frota"], source: "whatsapp", customerId: null, customerName: null }),
    contact({ id: "c", ownerSellerId: null, tags: [], source: "csv", optOut: true }),
  ];

  it("returns everything when nothing is set", () => {
    expect(applyContactFilters(rows, EMPTY).map((r) => r.id)).toEqual(["a", "b", "c"]);
  });

  it("filters by scope", () => {
    expect(applyContactFilters(rows, { ...EMPTY, scope: "soltos" }).map((r) => r.id)).toEqual(["b"]);
    expect(applyContactFilters(rows, { ...EMPTY, scope: "optout" }).map((r) => r.id)).toEqual(["c"]);
  });

  it("filters by owner, including the unassigned bucket", () => {
    expect(applyContactFilters(rows, { ...EMPTY, owners: ["sl-1"] }).map((r) => r.id)).toEqual(["a"]);
    expect(applyContactFilters(rows, { ...EMPTY, owners: ["__none__"] }).map((r) => r.id)).toEqual(["c"]);
  });

  it("filters by tag and by source", () => {
    expect(applyContactFilters(rows, { ...EMPTY, tags: ["Frota"] }).map((r) => r.id)).toEqual(["b"]);
    expect(applyContactFilters(rows, { ...EMPTY, sources: ["csv"] }).map((r) => r.id)).toEqual(["c"]);
  });

  it("combines filters with AND", () => {
    const result = applyContactFilters(rows, { ...EMPTY, scope: "vinculados", sources: ["dintec"] });
    expect(result.map((r) => r.id)).toEqual(["a"]);
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `bun run test -- src/features/contacts/engine/contactFilters.test.ts`
Expected: FAIL — módulo não encontrado.

- [ ] **Step 3: Implementar**

`src/features/contacts/engine/contactFilters.ts`:

```ts
import type { ContactScope, ContactSource, IContact, ID } from "@/shared/types";
import { matchesScope } from "./contactScopes";

/** Sentinel for the "Sem responsável" option in the owner filter. */
export const UNASSIGNED_OWNER = "__none__";

export interface IContactFilterState {
  scope: ContactScope;
  search: string;
  /** Seller ids, or UNASSIGNED_OWNER for contacts with no owner. */
  owners: (ID | typeof UNASSIGNED_OWNER)[];
  tags: string[];
  /** "Cidade / UF" as shown in the select, or null for all. */
  city: string | null;
  sources: ContactSource[];
}

/** Lowercase and strip diacritics so "claudio" finds "Cláudio". */
function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/**
 * Whether a contact matches the search box.
 *
 * Phone matching is done twice: against the formatted string (so "99712-4488"
 * works) and against digits only (so a number pasted without formatting works).
 */
export function matchesSearch(contact: IContact, term: string): boolean {
  const query = term.trim();
  if (query === "") return true;

  const normalizedQuery = normalize(query);
  const haystack = [
    contact.name,
    contact.phone,
    contact.email,
    contact.customerName,
    contact.role,
    contact.city,
  ];
  if (haystack.some((field) => field && normalize(field).includes(normalizedQuery))) return true;

  const queryDigits = query.replace(/\D/g, "");
  if (queryDigits !== "" && contact.phoneDigits) {
    return contact.phoneDigits.includes(queryDigits);
  }
  return false;
}

/**
 * Client-side filter pipeline. Used by the mock provider and to refine an
 * already-paginated page — the Supabase provider does the same work in SQL.
 */
export function applyContactFilters(
  contacts: IContact[],
  filters: IContactFilterState,
): IContact[] {
  return contacts.filter((contact) => {
    if (!matchesScope(contact, filters.scope)) return false;

    if (filters.owners.length > 0) {
      const ownerKey = contact.ownerSellerId ?? UNASSIGNED_OWNER;
      if (!filters.owners.includes(ownerKey)) return false;
    }

    if (filters.tags.length > 0 && !filters.tags.some((tag) => contact.tags.includes(tag))) {
      return false;
    }

    if (filters.city !== null) {
      const label = contact.uf ? `${contact.city} / ${contact.uf}` : (contact.city ?? "");
      if (label !== filters.city) return false;
    }

    if (filters.sources.length > 0 && !filters.sources.includes(contact.source)) return false;

    return matchesSearch(contact, filters.search);
  });
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `bun run test -- src/features/contacts/engine/contactFilters.test.ts`
Expected: PASS — 12 testes.

- [ ] **Step 5: Commit**

```bash
git add src/features/contacts/engine/contactFilters.ts src/features/contacts/engine/contactFilters.test.ts
git commit -m "feat(contacts): add search and filter engine"
```

---

### Task 5: Migration — tabela, índices, trigger e RLS

**Files:**
- Create: `supabase/migrations/<timestamp>_create_contacts_table.sql`

**Interfaces:**
- Produces: tabela `public.contacts` consumida pelo provider Supabase (Task 8) e pelo backfill (Task 6).

- [ ] **Step 1: Escrever a migration**

Nome do arquivo: `supabase/migrations/20260806120000_create_contacts_table.sql` (o nome do arquivo **é** o `version` da migration).

```sql
-- Agenda: the operation's contact catalog. A contact is a PERSON or a NUMBER,
-- linked to a customer or loose. `customers` and `leads` are untouched by this
-- feature; `lead_id` only records where a materialised contact came from.

create table if not exists public.contacts (
  id                uuid primary key default gen_random_uuid(),
  store_id          uuid not null references public.stores(id) on delete cascade,
  name              text not null,
  role              text,
  phone             text,
  -- Generated, exactly like customers.phone_digits. Verified against
  -- production: that column is GENERATED ALWAYS, not trigger-maintained.
  phone_digits      text generated always as (
                      regexp_replace(coalesce(phone, ''), '\D', '', 'g')
                    ) stored,
  email             text,
  city              text,
  uf                text,
  customer_id       uuid references public.customers(id) on delete set null,
  lead_id           uuid references public.leads(id) on delete set null,
  owner_seller_id   uuid references public.sellers(id) on delete set null,
  tags              text[] not null default '{}',
  source            text not null default 'manual',
  opt_out           boolean not null default false,
  opt_out_at        timestamptz,
  opt_out_by        uuid references public.sellers(id) on delete set null,
  next_contact_at   timestamptz,
  next_contact_note text,
  last_contact_at   timestamptz,
  has_whatsapp      boolean not null default false,
  division          text not null default 'parts',
  -- Triage outcome (phase 2). A triaged-away contact disappears from the
  -- Agenda's default listing but stays searchable, with the reason on record —
  -- so this is a nullable timestamp + reason, never a delete.
  ignored_at        timestamptz,
  ignore_reason     text,
  ignored_by        uuid references public.sellers(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint contacts_source_check check (
    source in ('whatsapp','dintec','manual','csv','balcao','portal_b2b','storefront')
  ),
  constraint contacts_division_check check (division in ('parts','service','industrial')),
  constraint contacts_ignore_reason_check check (
    ignore_reason is null
    or ignore_reason in ('fornecedor','concorrente','engano','pessoal','spam')
  ),
  -- A reason without a timestamp (or vice-versa) is a half-written triage
  -- decision; the pair is meaningless apart.
  constraint contacts_ignored_pair_check check (
    (ignored_at is null) = (ignore_reason is null)
  )
);

comment on table public.contacts is
  'Agenda: person-or-number phonebook. customer_id NULL = loose contact. lead_id traces the origin when materialised from a lead; leads/customers are never modified by this feature.';

create index if not exists contacts_store_phone_idx     on public.contacts (store_id, phone_digits);
create index if not exists contacts_customer_idx        on public.contacts (customer_id);
create index if not exists contacts_owner_idx           on public.contacts (owner_seller_id);
create index if not exists contacts_store_opt_out_idx   on public.contacts (store_id, opt_out);
create index if not exists contacts_lead_idx            on public.contacts (lead_id);
-- Partial index: the default listing filters `ignored_at is null` on every
-- query, and only a small slice of the base is ever ignored.
create index if not exists contacts_store_active_idx    on public.contacts (store_id)
  where ignored_at is null;

alter table public.contacts enable row level security;

-- The policies mirror `customers` EXACTLY, including the (SELECT ...) wrapper.
-- That wrapper is a requirement, not style: an unwrapped helper is evaluated
-- once PER ROW and already caused a statement_timeout storm here (the
-- `authenticated` role has an 8s timeout). `seller_accessible_customer_ids()`
-- is SET-RETURNING and must stay consumed via IN — do not swap it for a
-- per-row boolean helper.

drop policy if exists contacts_select on public.contacts;
create policy contacts_select on public.contacts
  for select
  to authenticated
  using (
    store_id = (select public.current_store_id())
    and (
      (select public.is_staff())
      or owner_seller_id = (select public.current_seller_id())
      or customer_id in (select public.seller_accessible_customer_ids())
    )
  );

drop policy if exists contacts_insert on public.contacts;
create policy contacts_insert on public.contacts
  for insert
  to authenticated
  with check (
    store_id = (select public.current_store_id())
    and ((select public.is_staff()) or owner_seller_id = (select public.current_seller_id()))
  );

drop policy if exists contacts_update on public.contacts;
create policy contacts_update on public.contacts
  for update
  to authenticated
  using (
    store_id = (select public.current_store_id())
    and ((select public.is_staff()) or owner_seller_id = (select public.current_seller_id()))
  )
  with check (
    store_id = (select public.current_store_id())
    and ((select public.is_staff()) or owner_seller_id = (select public.current_seller_id()))
  );

drop policy if exists contacts_delete on public.contacts;
create policy contacts_delete on public.contacts
  for delete
  to authenticated
  using (
    store_id = (select public.current_store_id())
    and ((select public.is_staff()) or owner_seller_id = (select public.current_seller_id()))
  );
```

- [ ] **Step 2: Aplicar em um branch de teste, não em produção**

Aplicar via MCP `apply_migration` **apenas** depois de confirmar com o dono. Verificar em seguida:

```sql
select policyname, cmd from pg_policies where tablename = 'contacts' order by cmd;
select indexname from pg_indexes where tablename = 'contacts';
```

Expected: 4 policies (SELECT/INSERT/UPDATE/DELETE) e 6 índices além da PK.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260806120000_create_contacts_table.sql
git commit -m "feat(db): add contacts table with RLS mirroring customers"
```

---

### Task 6: Migration — backfill de clientes e leads

**Files:**
- Create: `supabase/migrations/<timestamp>_backfill_contacts.sql`

**Interfaces:**
- Consumes: tabela `contacts` (Task 5).
- Produces: ~5.363 linhas — 1.978 vinculadas e 3.385 soltas.

- [ ] **Step 1: Escrever a migration de backfill**

`supabase/migrations/20260806120100_backfill_contacts.sql`:

```sql
-- Backfill the Agenda from the two places contacts live today.
--
-- Idempotent: guarded by NOT EXISTS on the origin key, so re-running never
-- duplicates. Nothing is merged automatically — the 4 ninth-digit collisions
-- and the 70 customers sharing a phone all land as their own row and go to the
-- duplicate queue in phase 3. Merging without human review is how history gets
-- lost.

-- Source A — customers with a NON-EMPTY phone (1.978 rows).
-- Careful: `phone is not null` alone returns 3.170, but 1.192 of those are the
-- empty string.
insert into public.contacts (
  store_id, name, role, phone, email, city, uf,
  customer_id, owner_seller_id, source, has_whatsapp, last_contact_at, division
)
select
  c.store_id,
  coalesce(
    nullif(trim(c.contact_name), ''),
    nullif(trim(c.nome_fantasia), ''),
    nullif(trim(c.razao_social), ''),
    nullif(trim(c.full_name), ''),
    c.phone
  ) as name,
  case when nullif(trim(c.contact_name), '') is not null then 'Contato' else null end as role,
  c.phone,
  nullif(trim(c.email), ''),
  nullif(trim(c.address ->> 'city'), ''),
  nullif(trim(c.address ->> 'uf'), ''),
  c.id,
  c.seller_id,
  case when c.dintec_codcli is not null then 'dintec' else 'manual' end,
  coalesce(c.whatsapp_status, '') in ('valid', 'active', 'ok'),
  c.last_purchase_at,
  'parts'
from public.customers c
where nullif(trim(coalesce(c.phone, '')), '') is not null
  and not exists (
    select 1 from public.contacts ct where ct.customer_id = c.id
  );

-- Source B — unconverted leads become LOOSE contacts (3.385 rows).
insert into public.contacts (
  store_id, name, phone, email,
  lead_id, owner_seller_id, source, has_whatsapp, last_contact_at, division
)
select
  l.store_id,
  coalesce(nullif(trim(l.name), ''), l.phone) as name,
  l.phone,
  nullif(trim(l.email), ''),
  l.id,
  l.seller_id,
  case lower(coalesce(l.origin, ''))
    when 'whatsapp'   then 'whatsapp'
    when 'storefront' then 'storefront'
    when 'portal_b2b' then 'portal_b2b'
    when 'balcao'     then 'balcao'
    when 'csv'        then 'csv'
    else 'manual'
  end,
  true,
  l.updated_at,
  'parts'
from public.leads l
where l.converted_to_customer_id is null
  and nullif(trim(coalesce(l.phone, '')), '') is not null
  and not exists (
    select 1 from public.contacts ct where ct.lead_id = l.id
  );
```

- [ ] **Step 2: Conferir os totais depois de aplicar**

```sql
select
  count(*)                                        as total,
  count(*) filter (where customer_id is not null) as vinculados,
  count(*) filter (where customer_id is null)     as soltos,
  count(*) filter (where coalesce(phone_digits, '') = '') as sem_digitos,
  count(*) filter (where ignored_at is not null)  as ja_ignorados
from public.contacts;
```

Expected: `total ≈ 5.400`, `vinculados ≈ 1.978`, `soltos ≈ 3.400+`, `sem_digitos = 0`,
`ja_ignorados = 0`.

Três armadilhas neste check:

1. **Não testar `phone_digits is null`.** A coluna é gerada sobre
   `coalesce(phone, '')`, então nunca é nula — seria string vazia. Um teste de
   nulidade passaria sempre, inclusive com o backfill inteiro quebrado. Testar
   contra `''`.
2. **Os totais são aproximados de propósito.** A base é viva: durante a
   escrita deste plano os leads subiram de 3.386 para 3.412 pelo webhook de
   produção. Confira a ordem de grandeza, não a igualdade — e rode a contagem
   de origem no mesmo instante se quiser bater exato.
3. **`ja_ignorados` deve ser 0** nesta fase: nada escreve `ignored_at` até a
   Triagem existir. Qualquer valor acima de zero significa que a coluna foi
   escrita por algum caminho inesperado.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260806120100_backfill_contacts.sql
git commit -m "feat(db): backfill contacts from customers and leads"
```

---

### Task 7: Provider mock

**Files:**
- Create: `src/mocks/api/contacts.ts`
- Create: `src/providers/data/impl/mock/contacts.ts`

**Interfaces:**
- Consumes: `IContactsProvider`, `IListContactsParams` (Task 1); `applyContactFilters`, `UNASSIGNED_OWNER` (Task 4); `countScopes` (Task 3).
- Produces: `mockContactsProvider` — registrado no factory na Task 8.

- [ ] **Step 1: Criar a API mock**

`src/mocks/api/contacts.ts` gera ~120 contatos determinísticos a partir do seed já usado pela camada de mocks (`seedrandom` + faker, ver `src/mocks/config.ts`), espelhando os campos do kit: pessoas com cargo vinculadas a clientes existentes, contatos soltos sem cliente, ~1% em opt-out, tags do conjunto `["Decisor","Compras","Frota","Oficina","Técnico","Financeiro","Agro","Industrial","B2B","Balcão","Novo"]`.

Exporta:

```ts
export function listContacts(params?: IListContactsParams): Promise<IPaginatedResult<IContact>>;
export function getContact(id: ID): Promise<IContact>;
export function createContact(input: ...): Promise<IContact>;
export function updateContact(id: ID, patch: Partial<IContact>): Promise<IContact>;
export function deleteContact(id: ID): Promise<void>;
export function countContactScopes(params?: IListContactsParams): Promise<IContactScopeCounts>;
```

A paginação usa o utilitário existente `src/mocks/api/utils/paginate.ts`.

- [ ] **Step 2: Criar o provider mock**

`src/providers/data/impl/mock/contacts.ts` delega para a API mock, exatamente como `impl/mock/customers.ts` faz. As mutações em massa iteram e resolvem com a contagem afetada:

```ts
async bulkAddTag(ids, tag) {
  let affected = 0;
  for (const id of ids) {
    const current = await getContact(id);
    if (current.tags.includes(tag)) continue;
    await updateContact(id, { tags: [...current.tags, tag] });
    affected++;
  }
  return affected;
},
```

- [ ] **Step 3: Rodar a suíte**

Run: `bun run test`
Expected: PASS — nenhum teste novo, mas nada pode regredir.

- [ ] **Step 4: Commit**

```bash
git add src/mocks/api/contacts.ts src/providers/data/impl/mock/contacts.ts
git commit -m "feat(contacts): add mock contacts provider"
```

---

### Task 8: Provider Supabase e registro no barrel

**Files:**
- Create: `src/providers/data/impl/supabase/contacts.ts`
- Create: `src/providers/data/hooks/useContactsProvider.ts`
- Modify: `src/providers/data/factory.ts`
- Modify: `src/providers/data/index.ts`

**Interfaces:**
- Consumes: `IContactsProvider` (Task 1), tabela `contacts` (Task 5).
- Produces: `useContactsProvider()` exportado por `@/providers/data` — a **única** porta de entrada das tarefas de UI.

- [ ] **Step 1: Criar o provider Supabase**

`src/providers/data/impl/supabase/contacts.ts`, seguindo o formato de `impl/supabase/conversationTags.ts` (interface `IRow`, constante `COLUMNS`, função `rowToContact`).

```ts
const COLUMNS =
  "id, store_id, name, role, phone, phone_digits, email, city, uf, customer_id, lead_id, " +
  "owner_seller_id, tags, source, opt_out, opt_out_at, opt_out_by, next_contact_at, " +
  "next_contact_note, last_contact_at, has_whatsapp, division, created_at, updated_at, " +
  "customer:customers(id, nome_fantasia, razao_social, full_name), owner:sellers(id, name)";
```

`rowToContact` resolve `customerName` por `nome_fantasia → razao_social → full_name` e `ownerName` a partir do join.

`list()` monta a query com `{ count: "exact" }`, aplica os filtros em SQL e devolve `total` do count:

```ts
async list(params: IListContactsParams = {}): Promise<IPaginatedResult<IContact>> {
  const page = params.page ?? 1;
  const pageSize = params.pageSize ?? 15;
  const from = (page - 1) * pageSize;

  let query = getSupabaseClient()
    .from("contacts")
    .select(COLUMNS, { count: "exact" });

  // Triaged-away contacts never show in the Agenda. The columns exist from the
  // first migration but phase 1 has no writer for them, so this filter is inert
  // today — it is here so the triage screen cannot later leak ignored contacts
  // through a listing path someone forgot to update.
  query = query.is("ignored_at", null);

  if (params.storeId) query = query.eq("store_id", params.storeId);
  if (params.scope === "vinculados") query = query.not("customer_id", "is", null);
  if (params.scope === "soltos") query = query.is("customer_id", null);
  if (params.scope === "optout") query = query.eq("opt_out", true);
  if (params.tags?.length) query = query.overlaps("tags", params.tags);
  if (params.sources?.length) query = query.in("source", params.sources);
  if (params.city) query = query.eq("city", params.city);
  if (params.uf) query = query.eq("uf", params.uf);

  // Owner filter: ids and/or the unassigned bucket.
  if (params.unassignedOwner && params.ownerSellerIds?.length) {
    query = query.or(
      `owner_seller_id.is.null,owner_seller_id.in.(${params.ownerSellerIds.join(",")})`,
    );
  } else if (params.unassignedOwner) {
    query = query.is("owner_seller_id", null);
  } else if (params.ownerSellerIds?.length) {
    query = query.in("owner_seller_id", params.ownerSellerIds);
  }

  const term = params.search?.trim();
  if (term) {
    const digits = term.replace(/\D/g, "");
    const escaped = term.replace(/[%,]/g, " ");
    const clauses = [
      `name.ilike.%${escaped}%`,
      `email.ilike.%${escaped}%`,
      `role.ilike.%${escaped}%`,
      `city.ilike.%${escaped}%`,
      `phone.ilike.%${escaped}%`,
    ];
    if (digits) clauses.push(`phone_digits.ilike.%${digits}%`);
    query = query.or(clauses.join(","));
  }

  query = query
    .order(ORDER_COLUMN[params.orderBy ?? "name"], { ascending: params.orderDir !== "desc" })
    .range(from, from + pageSize - 1);

  const { data, error, count } = await query;
  if (error) throw new Error(`contacts.list: ${error.message}`);
  return {
    data: ((data ?? []) as unknown as IRow[]).map(rowToContact),
    total: count ?? 0,
    page,
    pageSize,
  };
}
```

> **Nota sobre `.in()`:** a lista de ids vai na URL. Se `ownerSellerIds` puder crescer, aplicar o mesmo cuidado de overflow de URL já conhecido no projeto — para o filtro de responsável o teto é o número de vendedores, então é seguro.

`counts()` emite quatro consultas `head: true` com `count: "exact"` (uma por escopo) reaproveitando os mesmos filtros, sem trazer linha alguma.

`setOptOut` carimba autor e data:

```ts
async setOptOut(id, optOut) {
  const patch = optOut
    ? { opt_out: true, opt_out_at: new Date().toISOString() }
    : { opt_out: false, opt_out_at: null, opt_out_by: null };
  const { data, error } = await getSupabaseClient()
    .from("contacts").update(patch).eq("id", id).select(COLUMNS).single();
  if (error) throw new Error(`contacts.setOptOut: ${error.message}`);
  return rowToContact(data as unknown as IRow);
}
```

As mutações em massa usam `.in("id", ids)` com `{ count: "exact" }` e devolvem o count.

- [ ] **Step 2: Criar o hook**

`src/providers/data/hooks/useContactsProvider.ts`:

```ts
import type { IContactsProvider } from "../contracts/contacts";
import { useDataProviderSlice } from "./_useDataProviderSlice";

export function useContactsProvider(): IContactsProvider {
  return useDataProviderSlice("contacts", "useContactsProvider");
}
```

- [ ] **Step 3: Declarar a chave no contrato e registrar no factory**

Estas três edições andam juntas, no mesmo commit — é o que mantém o build verde a cada passo.

1. Em `src/providers/data/contracts/index.ts`, dentro da interface `IDataProviders`, junto de `customers` e `leads`:

```ts
  contacts: IContactsProvider;
```

2. Em `src/providers/data/factory.ts`, importar `mockContactsProvider` e `supabaseContactsProvider`.

3. Acrescentar `contacts:` aos **dois** objetos, `mockProviders` **e** `supabaseProviders`. As duas metades: esquecer uma compila, mas quebra em runtime — no modo oposto ao que você testou.

- [ ] **Step 4: Exportar no barrel público**

Em `src/providers/data/index.ts`:

```ts
export type {
  IContactsProvider,
  IListContactsParams,
  ContactsOrderBy,
  ContactRecencyBucket,
} from "./contracts";

export { useContactsProvider } from "./hooks/useContactsProvider";
```

- [ ] **Step 5: Verificar o build**

Run: `bun run build`
Expected: PASS.

Run: `bunx tsc --noEmit`
Expected: nenhum erro **novo** em arquivos criados nesta branch. Cruzar com `git diff --name-status main...HEAD --diff-filter=A`.

- [ ] **Step 6: Commit**

```bash
git add src/providers/data/impl/supabase/contacts.ts src/providers/data/hooks/useContactsProvider.ts \
        src/providers/data/factory.ts src/providers/data/index.ts
git commit -m "feat(contacts): add supabase provider and wire the data barrel"
```

---

### Task 9: RBAC — recurso `contact`

**Files:**
- Modify: `src/features/rbac/permissions/resources.ts`
- Modify: `src/features/rbac/permissions/matrix.ts`
- Modify: `src/features/rbac/permissions/seed.ts`

**Interfaces:**
- Produces: `ResourceName` passa a aceitar `"contact"` — consumido pela navegação (Task 10).

- [ ] **Step 1: Adicionar o literal**

Em `src/features/rbac/permissions/resources.ts`, logo após `"customer"`:

```ts
  "customer",
  "contact",
```

- [ ] **Step 2: Adicionar as entradas na matriz**

Em `src/features/rbac/permissions/matrix.ts`, espelhando o que cada papel já tem para `customer`:

- `OWNER_ENTRIES`: `p("contact", CRUD, "all")`
- `GESTOR_ENTRIES`: mesmo escopo que o papel usa para `customer`
- `VENDEDOR_ENTRIES`: `p("contact", ["view", "create", "edit"], "own")`
- `SDR_ENTRIES`: `p("contact", ["view"], "own")` — o SDR lê a agenda, não a governa

Regra: se um papel não enxerga `customer`, também não enxerga `contact`.

- [ ] **Step 3: Atualizar o seed**

Em `src/features/rbac/permissions/seed.ts`, acrescentar `contact` seguindo o padrão já usado pelos demais recursos, para o RBAC persistido receber a linha na próxima semeadura.

- [ ] **Step 4: Rodar os testes de RBAC**

Run: `bun run test -- src/features/rbac`
Expected: PASS. Se algum teste assertar a contagem total de recursos, atualizar o número esperado.

- [ ] **Step 5: Commit**

```bash
git add src/features/rbac/permissions/
git commit -m "feat(rbac): add contact resource to the permission matrix"
```

---

### Task 10: Rota, navegação e página esqueleto

**Files:**
- Create: `src/routes/app.agenda.tsx`
- Create: `src/features/contacts/pages/ContactsPage.tsx`
- Create: `src/features/contacts/index.ts`
- Modify: `src/features/shell/config/routes.ts`
- Modify: `src/features/shell/config/navigation.ts`

**Interfaces:**
- Consumes: `useContactsProvider` (Task 8), recurso `"contact"` (Task 9).
- Produces: `ContactsPage` — as tarefas 11–17 preenchem seus blocos; `ROUTES.APP_AGENDA`.

- [ ] **Step 1: Declarar a rota constante**

Em `src/features/shell/config/routes.ts`, logo após `APP_CLIENTES`:

```ts
  APP_AGENDA: "/app/agenda",
```

- [ ] **Step 2: Adicionar o item de navegação**

Em `src/features/shell/config/navigation.ts`, no grupo `"Atendimento"`, **entre** Clientes e Leads:

```ts
      {
        label: "Agenda",
        icon: "mdi:book-account",
        to: ROUTES.APP_AGENDA,
        permission: { resource: "contact" },
      },
```

- [ ] **Step 3: Criar a página esqueleto**

`src/features/contacts/pages/ContactsPage.tsx` — nesta tarefa entrega apenas o casco navegável: container em coluna com `min-h-0`, área de scroll própria e um estado de carregamento. As tarefas seguintes plugam header, filtros, grade, tabela, paginação e gaveta.

```tsx
export function ContactsPage() {
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      {/* Task 12: ContactsHeader  ·  Task 13: ContactsFiltersBar  ·  Task 16: ContactsBulkBar */}
      <div ref={setScrollEl} className="min-h-0 flex-1 overflow-y-auto">
        {/* Task 11: ContactsGrid  ·  Task 14: ContactsTable */}
      </div>
      {/* Task 15: ContactsPagination */}
    </div>
  );
}
```

> `min-h-0` na coluna e na área de scroll não é decorativo: sem ele o filho trava no `min-content` do bloco fixo e empurra o conteúdo para fora da tela — armadilha já encontrada neste projeto.

- [ ] **Step 4: Criar a rota e o barrel**

`src/routes/app.agenda.tsx`:

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { ContactsPage } from "@/features/contacts/pages/ContactsPage";

export const Route = createFileRoute("/app/agenda")({
  component: ContactsPage,
});
```

`src/features/contacts/index.ts`:

```ts
export { ContactsPage } from "./pages/ContactsPage";
```

- [ ] **Step 5: Verificar que a rota aparece**

Run: `bun run build`
Expected: PASS, e `routeTree.gen.ts` regenerado pelo plugin do Vite com a entrada `/app/agenda` (nunca editar à mão — conferir que a entrada apareceu).

Conferir por leitura: o item **Agenda** está no grupo `"Atendimento"` de `navigation.ts`, posicionado **entre** Clientes e Leads, com `permission: { resource: "contact" }`.

- [ ] **Step 6: Commit**

```bash
git add src/routes/app.agenda.tsx src/features/contacts/ src/features/shell/config/ src/routeTree.gen.ts
git commit -m "feat(contacts): add /app/agenda route and sidebar entry"
```

---

### Task 11: Card de contato, grade e estado vazio

**Files:**
- Create: `src/features/contacts/components/list/ContactCard.tsx`
- Create: `src/features/contacts/components/list/ContactsGrid.tsx`
- Create: `src/features/contacts/components/list/ContactsEmptyState.tsx`

**Interfaces:**
- Consumes: `IContact` (Task 1), `contactInitials` (Task 2).
- Produces:
  - `ContactCard({ contact, selected, onSelect, onOpen, onQuickAction, onLink })`
  - `ContactsGrid({ contacts, selectedIds, onSelect, onOpen, onQuickAction, onLink })`
  - `ContactsEmptyState()`

- [ ] **Step 1: Implementar o card com as medidas do kit**

Estas medidas vêm de `agd-views.jsx` e precisam sobreviver à tradução para tokens:

- container: `rounded-xl border border-border bg-card p-[14px_15px]`, coluna com `gap-[11px]`
- hover: `-translate-y-0.5` + sombra; selecionado: borda em accent e fundo levemente tingido
- **opt-out:** barra vertical de **3px** colada à esquerda, `bg-severity-danger`
- topo: avatar **40px** com `contactInitials`, nome em fonte display **uppercase** truncado, abaixo `cargo · origem`
- checkbox no canto superior direito em `opacity-30`, subindo para `opacity-100` no hover ou quando selecionado
- **bloco de vínculo:**
  - com cliente → caixa sólida, ícone `mdi:office-building`, nome do cliente em accent, clique abre a ficha do cliente (`stopPropagation`)
  - sem cliente → caixa **tracejada** em `severity-info`, ícone `mdi:link-off`, texto "Sem cliente" e botão **Vincular** à direita
- três linhas ícone+texto: telefone (com ícone verde quando `hasWhatsapp`), e-mail (ou "sem e-mail" apagado), `cidade / uf`
- chips: **Opt-out** (danger), **Duplicado?** (warning) e as etiquetas — no máximo **3**, ou **1** quando `optOut`; se não houver nenhuma, o texto apagado "sem etiquetas"
- rodapé separado por borda superior: avatar 22px do responsável (ou quadrado tracejado quando não atribuído) + `lastContactAt` à esquerda; à direita quatro ações de 28px — conversa, ligar, agendar retorno, mais
- **a ação de conversa fica desabilitada quando `optOut`**

Todo o texto visível em português. Ícones via `@/components/Icon`.

- [ ] **Step 2: Implementar a grade e o vazio**

`ContactsGrid` usa exatamente a grade do kit:

```tsx
<div className="grid grid-cols-[repeat(auto-fill,minmax(330px,1fr))] gap-[14px] p-4">
```

`ContactsEmptyState` centraliza ícone em caixa arredondada, título display uppercase "Nenhum contato neste filtro" e o texto de apoio "Ajuste os filtros ou traga contatos de fora: importe um CSV ou sincronize a agenda do WhatsApp."

- [ ] **Step 3: Conferir visualmente**

Run: `bun run build` e `bun run lint`
Expected: PASS.

Conferir por leitura do componente (não renderizar — o smoke visual é do dono):
- a grade usa `grid-cols-[repeat(auto-fill,minmax(330px,1fr))]` com `gap-[14px]`
- `contact.customerId === null` renderiza a caixa **tracejada** com o botão Vincular
- `contact.optOut` renderiza a barra de 3px em `severity-danger` **e** desabilita a ação de conversa
- as etiquetas cortam em 3, ou em 1 quando `optOut`
- nenhum hex literal e nenhuma constante `AGD`

- [ ] **Step 4: Commit**

```bash
git add src/features/contacts/components/list/
git commit -m "feat(contacts): add contact card, grid and empty state"
```

---

### Task 12: Header em vidro com busca dinâmica

**Files:**
- Create: `src/features/contacts/components/list/ContactsHeader.tsx`
- Modify: `src/features/contacts/pages/ContactsPage.tsx`

**Interfaces:**
- Consumes: `ScrollProgressBar` de `@/features/shell/components/ScrollProgressBar` (prop `container?: HTMLElement | null`).
- Produces: `ContactsHeader({ total, search, onSearchChange, view, onViewChange, onNew, onExport })`.

- [ ] **Step 1: Implementar o header**

Conforme §1 das ux-guidelines e `agd-shell.jsx`:

- barra em vidro: fundo translúcido do `background`, `backdrop-blur-xl`, borda inferior sutil e sombra descendente
- à esquerda: `<h1>` "Agenda" em display uppercase + pílula com `{total} contatos` formatado em pt-BR (`toLocaleString("pt-BR")`)
- busca com **largura dinâmica**: `max-w-[280px]` que vai a `max-w-[520px]` no foco, com transição
- atalho **`/`** foca o campo — o listener ignora o evento quando o alvo já é `input`, `textarea` ou `contentEditable`, e chama `preventDefault()`
- `<kbd>` com "/" que some (`opacity-0`) quando o campo está focado
- **`Escape`** desfoca o campo
- placeholder: `Buscar nome, telefone, e-mail, empresa…`
- alternância cards/tabela com dois botões de ícone, o ativo destacado em accent
- menu **Manutenção** contendo apenas **Exportar** (ver §7.1 do spec: Importar CSV e Sincronizar WhatsApp são de fases posteriores e ficam fora)
- botão primário **Novo contato** em accent

- [ ] **Step 2: Montar no page e adicionar a linha de progresso**

Na `ContactsPage`, envolver o bloco fixo em um container `relative` e colocar `<ScrollProgressBar container={scrollEl} />` na divisa inferior — §2 das ux-guidelines.

- [ ] **Step 3: Verificar o comportamento do teclado**

Run: `bun run build` e `bun run lint`
Expected: PASS.

Conferir por leitura do componente:
- o listener de `keydown` retorna cedo quando `target` é `INPUT`, `TEXTAREA` ou `isContentEditable` — sem isso, digitar `/` na própria busca re-foca em vez de inserir o caractere
- o listener chama `preventDefault()` e é removido no cleanup do `useEffect`
- `Escape` chama `blur()` no campo
- `<ScrollProgressBar container={scrollEl} />` recebe o elemento de scroll, não `undefined`

- [ ] **Step 4: Commit**

```bash
git add src/features/contacts/components/list/ContactsHeader.tsx src/features/contacts/pages/ContactsPage.tsx
git commit -m "feat(contacts): add glass page header with dynamic search"
```

---

### Task 13: Barra de filtros

**Files:**
- Create: `src/features/contacts/components/list/ContactsFiltersBar.tsx`
- Modify: `src/features/contacts/pages/ContactsPage.tsx`

**Interfaces:**
- Consumes: `IContactScopeCounts` (Task 1), `IContactFilterState` e `UNASSIGNED_OWNER` (Task 4).
- Produces: `ContactsFiltersBar({ scope, onScopeChange, counts, filters, onFilterChange, onClear })`.

- [ ] **Step 1: Implementar**

- **escopos** em grupo segmentado: Todos · Vinculados · Sem cliente · Opt-out, cada um com a contagem ao lado em fonte condensada, formatada em pt-BR. O ativo ganha fundo e peso maior; a contagem do ativo fica em accent.
- separador vertical
- cinco selects compactos (altura 32px): **Responsável** (com a opção "Sem responsável" mapeada para `UNASSIGNED_OWNER`), **Etiqueta**, **Cidade/UF**, **Origem**, **Último contato**
- um select com valor diferente do padrão fica **destacado em accent** (fundo tingido + borda), sinalizando filtro ativo
- **Limpar filtros** aparece apenas quando há filtro ativo ou o escopo não é "Todos"
- os botões *Triar N sem cliente* e *N duplicados prováveis* do kit **não** entram nesta fase (§7.1 do spec)

As opções de Responsável, Etiqueta e Cidade/UF vêm dos dados; não hardcodar as listas do mockup.

- [ ] **Step 2: Ligar ao estado da página**

Mudar qualquer filtro **reseta a página para 1** — caso contrário o usuário fica numa página que deixou de existir e vê uma lista vazia.

- [ ] **Step 3: Verificar**

Run: `bun run build` e `bun run lint`
Expected: PASS.

Conferir por leitura:
- as contagens dos chips vêm de `counts()` do provider, nunca de `contacts.length`
- todo handler de filtro reseta `page` para 1
- as opções de Responsável, Etiqueta e Cidade/UF são derivadas dos dados, não listas fixas copiadas do mockup
- "Limpar filtros" só renderiza quando há filtro ativo ou escopo diferente de `todos`

- [ ] **Step 4: Commit**

```bash
git add src/features/contacts/components/list/ContactsFiltersBar.tsx src/features/contacts/pages/ContactsPage.tsx
git commit -m "feat(contacts): add scope chips and filters bar"
```

---

### Task 14: Tabela densa e menu de colunas

**Files:**
- Create: `src/features/contacts/components/list/ContactsTable.tsx`
- Create: `src/features/contacts/components/list/ContactsColumnsMenu.tsx`

**Interfaces:**
- Consumes: `useResizableColumns` de `@/shared/hooks/useResizableColumns` — assinatura `useResizableColumns<TId extends string>(columns: readonly { id: TId; defaultWidth: number }[], storageKey: string, minWidth?: number): { widths, totalWidth, startResize }`.
- Produces: `ContactsTable({ contacts, visibleColumns, selectedIds, onSelect, onSelectPage, onOpen, sort, onSortChange, onHeaderContextMenu })` e `ContactsColumnsMenu`.

- [ ] **Step 1: Declarar as colunas**

As 11 colunas do kit, com `nome` obrigatória (não pode ser ocultada):

```ts
export const CONTACT_COLUMNS = [
  { id: "nome",     label: "Nome",              defaultWidth: 210, required: true },
  { id: "phone",    label: "WhatsApp/telefone", defaultWidth: 150 },
  { id: "customer", label: "Cliente/empresa",   defaultWidth: 210 },
  { id: "role",     label: "Cargo ou função",   defaultWidth: 150 },
  { id: "email",    label: "E-mail",            defaultWidth: 220 },
  { id: "city",     label: "Cidade/UF",         defaultWidth: 150 },
  { id: "owner",    label: "Responsável",       defaultWidth: 130 },
  { id: "tags",     label: "Etiquetas",         defaultWidth: 150 },
  { id: "last",     label: "Último contato",    defaultWidth: 120 },
  { id: "status",   label: "Status",            defaultWidth: 100 },
  { id: "source",   label: "Origem",            defaultWidth: 110 },
] as const;
```

Larguras persistidas com `useResizableColumns(CONTACT_COLUMNS, "gallo-contacts-column-widths")`.

- [ ] **Step 2: Implementar a tabela**

- `table-fixed` com `<colgroup>`: coluna de checkbox (36px), as visíveis, e a coluna de ações (40px)
- cabeçalho **sticky**
- **delimitadores verticais somente no header** (§4 das ux-guidelines) — as células do corpo não levam borda vertical
- clique no cabeçalho ordena; a coluna ativa fica em accent com seta de direção
- células conforme o kit: nome com avatar 24px; telefone tabular com ícone verde de WhatsApp; cliente em accent **ou** "Sem cliente" em `severity-info` com ícone de link partido; responsável com avatar 20px e primeiro nome, ou "não atribuído" apagado; etiquetas limitadas a 2 chips; status como chip Ativo/Opt-out; origem em fonte condensada
- checkbox no cabeçalho seleciona/desseleciona a página inteira

- [ ] **Step 3: Implementar o menu de colunas**

`ContactsColumnsMenu` abre em duas entradas: pelo botão do header **e** pelo **clique-direito no cabeçalho** (`onContextMenu` com `preventDefault()`), conforme §4 das ux-guidelines. Conteúdo: título "Colunas visíveis", uma linha por coluna opcional com marcador de seleção, separador e a ação **Exibir todas** (desabilitada quando já estão todas visíveis).

- [ ] **Step 4: Verificar**

Run: `bun run build` e `bun run lint`
Expected: PASS.

Conferir por leitura:
- `onContextMenu` no `<tr>` do cabeçalho chama `preventDefault()` antes de abrir o menu
- `useResizableColumns` recebe a chave `"gallo-contacts-column-widths"`
- a borda vertical aparece **apenas** nas células `<th>`; nenhuma `<td>` do corpo tem borda lateral
- a coluna `nome` é `required` e não pode ser desmarcada no menu

- [ ] **Step 5: Commit**

```bash
git add src/features/contacts/components/list/ContactsTable.tsx src/features/contacts/components/list/ContactsColumnsMenu.tsx
git commit -m "feat(contacts): add dense table with resizable and toggleable columns"
```

---

### Task 15: Paginação

**Files:**
- Create: `src/features/contacts/components/list/ContactsPagination.tsx`
- Modify: `src/features/contacts/pages/ContactsPage.tsx`

**Interfaces:**
- Produces: `ContactsPagination({ page, pageSize, total, onPageChange, onPageSizeChange })`.

- [ ] **Step 1: Implementar**

- texto "Mostrando **x–y** de **N**", com números em `tabular-nums` e `N` formatado em pt-BR
- seletor "Por página": 15, 30, 60, 120 — trocar o tamanho volta para a página 1
- navegação com anterior/próxima e a janela de páginas do kit: primeira, `…`, vizinhas da atual, `…`, última; até 7 páginas, todas listadas
- a página atual fica em accent

**`total` vem do servidor**, nunca de `contacts.length` — usar o comprimento do array é exatamente como o truncamento silencioso se instala.

- [ ] **Step 2: Verificar os limites**

Expected: com `total = 0`, mostra "Mostrando 0–0 de 0" e os controles ficam desabilitados; na última página, `y` é igual a `total`.

- [ ] **Step 3: Commit**

```bash
git add src/features/contacts/components/list/ContactsPagination.tsx src/features/contacts/pages/ContactsPage.tsx
git commit -m "feat(contacts): add server-side pagination controls"
```

---

### Task 16: Ações em massa

**Files:**
- Create: `src/features/contacts/components/list/ContactsBulkBar.tsx`
- Create: `src/features/contacts/components/modals/AddTagModal.tsx`
- Create: `src/features/contacts/components/modals/RemoveTagModal.tsx`
- Create: `src/features/contacts/components/modals/TransferOwnerModal.tsx`
- Create: `src/features/contacts/components/modals/OptOutModal.tsx`
- Create: `src/features/contacts/components/modals/ExportContactsModal.tsx`

**Interfaces:**
- Consumes: `bulkAddTag`, `bulkRemoveTag`, `bulkTransferOwner`, `bulkSetOptOut` (Task 1/8); `recordAuditLog` de `@/providers/data`.
- Produces: `ContactsBulkBar({ selectedCount, totalFiltered, onClearSelection, onSelectAllFiltered, onAddTag, onRemoveTag, onTransferOwner, onExport, onOptOut })`.

- [ ] **Step 1: Implementar a barra**

- só renderiza quando há seleção
- fundo levemente tingido em accent
- "N selecionado(s)" em accent, com singular e plural corretos
- **"Selecionar todos os N filtrados"** aparece quando a seleção é menor que o total filtrado — o `N` vem de `total` do servidor
- "Limpar" zera a seleção
- cinco ações: Adicionar etiqueta · Remover etiqueta · Transferir responsável · Exportar · **Bloquear / opt-out** (em `severity-danger`)
- **Envio em massa fica fora desta fase** (§7.1 do spec)

- [ ] **Step 2: Implementar os modais**

Todos com título, subtítulo indicando o escopo ("N contatos selecionados"), corpo e rodapé com confirmar/cancelar.

- **Adicionar/Remover etiqueta:** select de etiqueta + nota explicando que é aplicada a todos os selecionados / removida só de quem a tiver
- **Transferir responsável:** select de vendedor, mais o aviso do kit: *"A transferência move o contato, não a carteira do cliente. Fica registrada na auditoria."*
- **Opt-out:** caixa em `severity-danger` com o texto do kit: *"Os contatos deixam de receber envio em massa e disparos automáticos. Conversas iniciadas por eles continuam funcionando. A ação fica registrada na auditoria com autor e data."* Botão de confirmação em variante destrutiva.
- **Exportar:** select de escopo (Contatos selecionados · Todos os filtrados · Toda a agenda) e o aviso de LGPD: *"O CSV sai com as colunas visíveis. Exportação de dados pessoais é registrada na auditoria (LGPD)."*

- [ ] **Step 3: Gravar a trilha de auditoria**

Transferência de responsável, opt-out (individual e em massa) e exportação chamam `recordAuditLog`. A interface promete o registro ao usuário — a promessa precisa ser verdadeira.

- [ ] **Step 4: Verificar**

Expected: selecionar dois cards abre a barra; aplicar etiqueta atualiza os dois cards e mostra toast com a contagem; opt-out em massa aplica a barra vermelha nos selecionados; a auditoria recebe uma entrada por ação.

- [ ] **Step 5: Commit**

```bash
git add src/features/contacts/components/list/ContactsBulkBar.tsx src/features/contacts/components/modals/
git commit -m "feat(contacts): add bulk actions bar with audited mutations"
```

---

### Task 17: Gaveta de detalhe e modais individuais

**Files:**
- Create: `src/features/contacts/components/detail/ContactDrawer.tsx`
- Create: `src/features/contacts/components/modals/NewContactModal.tsx`
- Create: `src/features/contacts/components/modals/LinkCustomerModal.tsx`

**Interfaces:**
- Consumes: `IContact` (Task 1), `contactInitials` (Task 2), `linkToCustomer`/`setOptOut`/`scheduleFollowUp` (Task 1/8).
- Produces: `ContactDrawer({ contact, focus, onClose, onLink, onAddTag, onRemoveTag, onTransferOwner, onToggleOptOut, onScheduleFollowUp })`, onde `focus` aceita `"retorno"` para destacar a seção de agendamento.

- [ ] **Step 1: Implementar a gaveta**

Painel lateral de **440px** à direita, com sobreposição escura, borda esquerda e animação de entrada.

Cabeçalho: avatar 46px, nome em display uppercase, cargo, e chips de status (Ativo/Opt-out), Duplicado? e origem.

Barra de ações: **Abrir conversa** (primário, **desabilitado quando `optOut`**), **Ligar**, e um botão de mais ações.

Seções, em ordem:

1. **Contato** — WhatsApp (com chip "ativo"), e-mail, cidade/UF
2. **Vínculo** —
   - com cliente: caixa com nome em accent, linha de apoio, e dois botões: abrir ficha e **desvincular**
   - sem cliente: caixa tracejada em `severity-info` com o texto do kit — *"Sem cliente vinculado. Enquanto estiver solto, o histórico não entra na carteira nem na positivação."* — e o botão **Vincular a cliente**
3. **Etiquetas** — chips removíveis com `×`, e ação "Etiqueta" para adicionar; "Nenhuma etiqueta" quando vazio
4. **Responsável** — avatar + nome + "último contato …", ou *"Não atribuído — entra na fila de rodízio"*; ação **Transferir**
5. **Agendar retorno** — quando não há agendamento: campo de data + campo de motivo + botão **Agendar retorno**; quando há: ícone de confirmação, `data · motivo` e a linha de apoio "Cai na sua fila e na timeline do cliente". Quando `focus === "retorno"`, a caixa entra com a borda destacada em accent.
6. **Últimas interações** — lista com ícone colorido, título e subtítulo
7. **LGPD** — caixa com ícone, título "Aceita contato comercial" / "Contato em opt-out", o texto *"Bloqueia envio em massa e disparos automáticos. A mudança fica registrada na auditoria."* e uma chave que alterna o estado. Em opt-out a caixa inteira vai para `severity-danger`.

- [ ] **Step 2: Implementar os modais individuais**

- **Novo contato:** grade de dois campos por linha — Nome (linha inteira), WhatsApp, E-mail, Cargo ou função, Cidade/UF, e Cliente (opcional, linha inteira). Placeholders em português conforme o kit.
- **Vincular a cliente:** campo de busca "Buscar cliente por nome ou CNPJ" alimentando uma lista de resultados reais via `useCustomersProvider().list({ search })`; cada linha mostra nome e `CNPJ · cidade/UF`; a selecionada fica em accent com marca de seleção.

- [ ] **Step 3: Gravar a trilha de auditoria do vínculo**

Exigência da §6.3 do spec: **vincular e desvincular** um contato gravam auditoria via `recordAuditLog`, assim como a transferência e o opt-out da Task 16. Registrar o contato, o cliente de origem e o de destino, para que um desvínculo acidental seja rastreável.

O opt-out alternado pela chave de LGPD desta gaveta usa o mesmo caminho auditado de `setOptOut` — não duplicar a lógica aqui.

- [ ] **Step 4: Verificar**

Expected: clicar num card abre a gaveta; a ação de agendar no card abre a gaveta com a seção de retorno destacada; alternar a chave de LGPD muda o card por baixo imediatamente; vincular um contato solto troca a caixa tracejada pela caixa de cliente e move o contato entre os escopos, gravando auditoria.

- [ ] **Step 5: Commit**

```bash
git add src/features/contacts/components/detail/ src/features/contacts/components/modals/NewContactModal.tsx \
        src/features/contacts/components/modals/LinkCustomerModal.tsx
git commit -m "feat(contacts): add contact drawer, new contact and link customer modals"
```

---

### Task 18: Integração, hook de dados e fechamento

**Files:**
- Create: `src/features/contacts/hooks/useContacts.ts`
- Modify: `src/features/contacts/pages/ContactsPage.tsx`
- Modify: `src/features/contacts/index.ts`

**Interfaces:**
- Consumes: tudo das tarefas anteriores.
- Produces: a tela completa.

- [ ] **Step 1: Criar o hook de dados**

`useContacts` encapsula TanStack Query:

- `useQuery` de `list` com chave `["contacts", "list", storeId, filters, page, pageSize, orderBy, orderDir]`
- `useQuery` de `counts` com chave `["contacts", "counts", storeId, filters]`
- mutations para link, opt-out, agendamento, etiquetas, transferência e ações em massa, cada uma invalidando `["contacts"]` no sucesso

**A chave inclui os filtros e a página** — sem isso a tela mostra o resultado da consulta anterior ao paginar.

- [ ] **Step 2: Integrar tudo na página**

Estado da `ContactsPage`: `view` (`grid` | `table`), `search`, `scope`, `filters`, `selectedIds`, `page`, `pageSize`, `visibleColumns`, `columnsMenu`, `drawer`, `modal`, `sort`.

Regras que precisam valer:

- trocar busca, escopo ou qualquer filtro **reseta `page` para 1**
- `onSelectAllFiltered` seleciona o conjunto filtrado inteiro e avisa por toast com a contagem
- toasts via `sonner` para toda mutação, em português
- a grade e a tabela recebem exatamente os mesmos dados; alternar a visão não refaz a consulta

- [ ] **Step 3: Exportar no barrel**

```ts
export { ContactsPage } from "./pages/ContactsPage";
export { useContacts } from "./hooks/useContacts";
```

- [ ] **Step 4: Varredura final de tokens**

Run:

```bash
grep -rnE "#[0-9a-fA-F]{3,8}\b|--gallo-|\bAGD\b" src/features/contacts/ || echo "OK: nenhum hex ou paleta do kit"
```

Expected: `OK: nenhum hex ou paleta do kit`. Qualquer ocorrência precisa virar token semântico antes de seguir.

- [ ] **Step 5: Rodar o gate completo**

```bash
bun run test
bun run build
bunx tsc --noEmit
bun run lint
```

Expected: testes e build passam; `tsc` não acrescenta erro **novo** nos arquivos criados nesta branch (cruzar com `git diff --name-status main...HEAD --diff-filter=A`); o lint não acusa violação das fronteiras de import.

- [ ] **Step 6: Conferir os critérios de aceite e escrever o roteiro de smoke**

Percorrer os 10 itens da §12 do spec, marcando cada um como **verificável por código** (feito aqui) ou **exige execução** (vai para o dono).

Escrever `docs/superpowers/plans/2026-08-06-agenda-contatos-smoke.md` com o roteiro que o dono vai rodar, cobrindo pelo menos:

1. `/app/agenda` abre e pagina; trocar de página troca as linhas
2. `/` foca a busca; buscar por telefone com e sem formatação encontra o mesmo contato
3. os quatro chips de escopo mostram contagens coerentes
4. um cliente com duas pessoas aparece como duas entradas
5. vincular um contato solto move-o de "Sem cliente" para "Vinculados"
6. opt-out aplica a barra vermelha e desabilita "Abrir conversa"
7. ações em massa sobre seleção e sobre "todos os N filtrados"
8. clique-direito no cabeçalho abre "Colunas visíveis"; larguras sobrevivem ao reload
9. **como vendedor não-staff:** só aparecem contatos próprios ou de clientes da carteira
10. as duas migrations **ainda não foram aplicadas** — a Agenda só mostra dados depois que o dono autorizar a aplicação

- [ ] **Step 7: Commit e PR**

```bash
git add src/features/contacts/
git commit -m "feat(contacts): wire the Agenda screen end to end"
git push
```

Abrir o PR em draft descrevendo: o que entrou, os desvios da §7.1, e o lembrete de que **as duas migrations não foram aplicadas em produção** — a aplicação é manual e exige OK explícito do dono.

---

## Notas de execução

**Ordem de dependências.** As tarefas 1→8 são sequenciais (tipo → contrato → engines → banco → providers). As tarefas 11 a 17 dependem só da 10 e podem ser feitas em qualquer ordem entre si. A 18 fecha.

**Toda tarefa fecha com o build verde.** A chave `contacts` em `IDataProviders` entra na Task 8, no mesmo commit das duas implementações — nenhuma tarefa deixa o repositório quebrado para a seguinte consertar.

**Validação é por código, não por navegador.** Nenhuma tarefa sobe o dev server nem abre preview: o dono faz o smoke visual. Os portões de cada tarefa são `bun run test`, `bun run build`, `bun run lint`, `bunx tsc --noEmit` (por delta) e a varredura de tokens. Onde este plano descreve resultado visual, ele é **critério de revisão de código** — confira lendo o componente, não renderizando. A Task 18 fecha entregando o roteiro de smoke visual para o dono.

**Ambiente de desenvolvimento.** A worktree pode não ter `.env.local`; sem ele o Vite sobe em modo **mock**, não Supabase.

**Não aplicar migration em produção sem OK explícito do dono.** Vale para as tarefas 5 e 6.
