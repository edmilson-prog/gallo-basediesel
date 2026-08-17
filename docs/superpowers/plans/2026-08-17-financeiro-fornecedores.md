# Grupo FINANCEIRO + tela de Fornecedores — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar o grupo FINANCEIRO na sidebar e entregar a tela de Fornecedores completa — cadastro CNPJ-primeiro, lista com fila de enriquecimento, ficha lateral e gaveta de ficha completa — com fornecedor como entidade real no banco.

**Architecture:** Entidade nova `ISupplier` seguindo o Provider Pattern (contrato + impl mock + impl Supabase + factory). Vínculo peça↔fornecedor por **nome normalizado** contra `parts.supplier`, porque a FK é fatia posterior. Métricas derivadas (`ISupplierStats`) vêm de `parts.suppliers` (jsonb de entradas) e não moram na entidade, para que a chegada do `payable` só acrescente campos. A lista é uma fila de enriquecimento: os ~126 fornecedores semeados do catálogo entram só com nome.

**Tech Stack:** React 19 + TypeScript strict, TanStack Router (file-based) + TanStack Query, Tailwind v4 + shadcn/ui, Vitest, Supabase (Postgres + RLS), bun.

**Spec:** `docs/superpowers/specs/2026-08-17-financeiro-fornecedores-design.md`

## Global Constraints

- **Idioma:** código, comentários e nomes em inglês; **todo texto de UI em português do Brasil com acentuação correta**.
- **Tokens semânticos apenas** — `bg-background`, `text-foreground`, `border-border`, `text-/bg-/border-severity-*`. **Nunca** hex, nunca `--gallo-*`. O kit é dark puro (`#141011`, dourado `#E0BB4E`); a tradução tem que funcionar em claro e escuro.
- **TypeScript `strict: true`**, sem `any`. Interfaces de domínio prefixadas com `I`.
- **Fronteira de dados:** a feature **nunca** importa `@/mocks`, `@/providers/data/impl/*`, `@/providers/data/contracts/*` individuais nem `@/providers/data/factory`. Tudo pelo barrel `@/providers/data`.
- **UX obrigatória em tela de lista** (`docs/dev/ux-guidelines.md`): header glassmorphism, `ScrollProgressBar` na divisa do bloco fixo, busca com largura dinâmica + atalho `/` + badge `kbd` + `Escape`, colunas redimensionáveis via `useResizableColumns`, delimitadores verticais **só no header**, menu de colunas no **clique-direito do cabeçalho**.
- **Migration NÃO é aplicada** por nenhuma task. Escrever o arquivo em `supabase/migrations/`; a aplicação em produção é manual e exige OK explícito do dono.
- **Gate de CI:** `bun run build` + `bun run test`. `bunx tsc --noEmit` tem baseline de ~315 erros pré-existentes — avaliar só o delta dos arquivos criados nesta branch.
- **Nomes de coluna no banco:** `snake_case`. Campos de domínio em TS: `camelCase`.
- **Commits:** Conventional Commits em inglês, um por task.

---

### Task 1: Tipo `ISupplier` e os dois engines puros

**Files:**
- Create: `src/shared/types/suppliers.ts`
- Modify: `src/shared/types/index.ts` (adicionar bloco de export após o bloco de Expenses, ~linha 394)
- Create: `src/features/suppliers/engine/supplierName.ts`
- Create: `src/features/suppliers/engine/supplierName.test.ts`
- Create: `src/features/suppliers/engine/completeness.ts`
- Create: `src/features/suppliers/engine/completeness.test.ts`

**Interfaces:**
- Consumes: `ID`, `ISO8601`, `Money` de `@/shared/types`.
- Produces:
  - `ISupplier`, `ISupplierStats`, `ISupplierEntry`, `SupplierCategory`, `SupplierStatus`, `SupplierPaymentMethod`
  - `normalizeSupplierName(raw: string): string`
  - `canonicalSupplierName(raw: string): string | null` — `null` quando o nome é lixo (`"Não informado"`, vazio)
  - `supplierNameMatches(a: string, b: string): boolean`
  - `SUPPLIER_NAME_ALIASES: Record<string, string>`
  - `supplierCompleteness(s: ISupplier): ISupplierCompleteness`
  - `ISupplierCompleteness { filled: number; total: number; percent: number; missing: SupplierMissingField[] }`
  - `SUPPLIER_MISSING_LABELS: Record<SupplierMissingField, string>`

- [ ] **Step 1: Escrever o tipo de domínio**

Criar `src/shared/types/suppliers.ts`:

```ts
import type { ID, ISO8601, Money } from "./common";

/**
 * Supplier — the counterpart of the customer on the money-out side (PRD do kit
 * `ui_kits/financeiro`). Purchase metrics do NOT live here: they are derived and
 * served by `ISupplierStats`, so the arrival of `payable` only adds fields.
 */

export type SupplierCategory = "parts" | "services" | "freight" | "financial";
export type SupplierStatus = "active" | "inactive";
export type SupplierPaymentMethod = "boleto" | "pix" | "transferencia" | "debito_automatico";

/** Where the record came from — a backfilled name has no CNPJ yet. */
export type SupplierSource = "manual" | "catalog_backfill";

export interface ISupplier {
  id: ID;
  storeId: ID;
  /** Razão social — what the Receita lookup returns. */
  name: string;
  /** Nome fantasia, when it differs from the razão social. */
  tradeName?: string;
  /** CNPJ, digits only. Absent on records backfilled from the catalog. */
  document?: string;
  category: SupplierCategory;
  /** Free text with a suggested vocabulary: "à vista", "28 dias", "30/60/90". */
  paymentTerms?: string;
  leadTimeDays?: number;
  contactName?: string;
  contactPhone?: string;
  preferredPaymentMethod?: SupplierPaymentMethod;
  /** What we buy from them — free text, filled in the form. */
  suppliedItems: string[];
  status: SupplierStatus;
  /** Snapshot of the Receita lookup, so the drawer doesn't re-query. */
  registryStatus?: string;
  registryActivity?: string;
  city?: string;
  state?: string;
  source: SupplierSource;
  notes?: string;
  createdAt: ISO8601;
  updatedAt: ISO8601;
}

/** One stock-entry line, read from `parts.suppliers` (jsonb). */
export interface ISupplierEntry {
  invoiceNumber?: string;
  invoiceDate?: ISO8601;
  cost: Money;
  quantity: number;
  /** The part the entry belongs to — lets the drawer link back to the catalog. */
  partId: ID;
  partName: string;
}

/**
 * Derived metrics. Everything here is computed on read, never stored.
 * `openAmount` / `nextDueDate` / `onTimeDeliveryRate` are deliberately ABSENT:
 * they need the `payable` entity, which does not exist yet.
 */
export interface ISupplierStats {
  supplierId: ID;
  /** Parts whose `supplier` text matches this record's normalized name. */
  linkedParts: number;
  purchasesLast12Months: Money;
  /** Most recent entries first, capped by the caller. */
  lastEntries: ISupplierEntry[];
  /** 12 positions, oldest → newest, for the drawer chart. */
  monthlyPurchases: Money[];
}
```

- [ ] **Step 2: Exportar pelo barrel**

Em `src/shared/types/index.ts`, logo após a linha `export { EXPENSE_CATEGORY_TO_DRE_LINE } from "./expenses";`:

```ts
// Suppliers (ui_kit financeiro — fatia 1)
export type {
  ISupplier,
  ISupplierEntry,
  ISupplierStats,
  SupplierCategory,
  SupplierPaymentMethod,
  SupplierSource,
  SupplierStatus,
} from "./suppliers";
```

- [ ] **Step 3: Escrever o teste de normalização (falha)**

Criar `src/features/suppliers/engine/supplierName.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { canonicalSupplierName, normalizeSupplierName, supplierNameMatches } from "./supplierName";

describe("normalizeSupplierName", () => {
  it("lowercases, strips accents and collapses whitespace", () => {
    expect(normalizeSupplierName("  POTTER  &amp;  HOPPE  INJECAO  ")).toBe("potter & hoppe injecao");
  });

  it("decodes the &amp; entity left by the DINTEC import", () => {
    expect(normalizeSupplierName("POTTER &amp; HOPPE")).toBe("potter & hoppe");
  });

  it("treats accented and unaccented spellings as the same name", () => {
    expect(normalizeSupplierName("Sabó Vedações")).toBe(normalizeSupplierName("SABO VEDACOES"));
  });

  it("drops the trailing company suffix so LTDA does not split a supplier", () => {
    expect(normalizeSupplierName("RETIFICA LC LTDA")).toBe("retifica lc");
    expect(normalizeSupplierName("Vale S.A.")).toBe("vale");
  });
});

describe("canonicalSupplierName", () => {
  it("rejects the DINTEC placeholder", () => {
    expect(canonicalSupplierName("Não informado")).toBeNull();
    expect(canonicalSupplierName("NAO INFORMADO")).toBeNull();
  });

  it("rejects empty and whitespace-only names", () => {
    expect(canonicalSupplierName("   ")).toBeNull();
    expect(canonicalSupplierName("")).toBeNull();
  });

  it("collapses the known alias to a single supplier", () => {
    expect(canonicalSupplierName("UFI")).toBe("UFI Filters");
    expect(canonicalSupplierName("UFI Filters")).toBe("UFI Filters");
  });

  it("title-cases an all-caps name and keeps the ampersand", () => {
    expect(canonicalSupplierName("POTTER &amp; HOPPE INJECAO ELETRONICA LTDA")).toBe(
      "Potter & Hoppe Injecao Eletronica Ltda",
    );
  });

  it("leaves an already well-formed name alone", () => {
    expect(canonicalSupplierName("Pako Distribuidora de Auto Pecas Ltda")).toBe(
      "Pako Distribuidora de Auto Pecas Ltda",
    );
  });
});

describe("supplierNameMatches", () => {
  it("matches across case, accent and suffix differences", () => {
    expect(supplierNameMatches("RETIFICA LC LTDA", "Retífica LC")).toBe(true);
  });

  it("does not match two genuinely different suppliers", () => {
    expect(supplierNameMatches("Tecfil", "Fleetguard")).toBe(false);
  });
});
```

- [ ] **Step 4: Rodar o teste e confirmar que falha**

```bash
bun run test -- src/features/suppliers/engine/supplierName.test.ts
```

Esperado: FAIL — `Failed to resolve import "./supplierName"`.

- [ ] **Step 5: Implementar a normalização**

Criar `src/features/suppliers/engine/supplierName.ts`:

```ts
/**
 * Supplier names arrived as free text: `parts.supplier` carries 127 distinct
 * strings for 4.005 parts, 3.311 of which are the placeholder "Não informado".
 * Until `parts.supplier_id` exists, this module IS the join key — the same
 * normalization runs in the backfill migration, so the two must agree.
 */

/** Legal-form suffixes that split one supplier into two records. */
const COMPANY_SUFFIXES = ["ltda", "me", "epp", "eireli", "s a", "sa", "s\\/a"];

/**
 * Names the catalog spells two ways. Deliberately tiny: only pairs the data
 * itself evidences. Key is the normalized form, value is the display name.
 */
export const SUPPLIER_NAME_ALIASES: Record<string, string> = {
  ufi: "UFI Filters",
  "ufi filters": "UFI Filters",
};

/** Placeholders the DINTEC import writes when the field was blank. */
const PLACEHOLDERS = new Set(["nao informado", "sem fornecedor", "n a", "-"]);

/** Lowercased, unaccented, entity-decoded, suffix-free join key. */
export function normalizeSupplierName(raw: string): string {
  const decoded = (raw ?? "").replace(/&amp;/gi, "&").replace(/&nbsp;/gi, " ");
  const unaccented = decoded.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const cleaned = unaccented
    .toLowerCase()
    .replace(/[.,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const suffix = new RegExp(`\\s+(${COMPANY_SUFFIXES.join("|")})$`);
  let out = cleaned;
  // A name can end in more than one suffix ("… Ltda ME").
  while (suffix.test(out)) out = out.replace(suffix, "");
  return out.trim();
}

/** Title-cases a word, leaving short connectors ("de", "e", "da") lowercase. */
const CONNECTORS = new Set(["de", "da", "do", "das", "dos", "e", "em", "para"]);

function titleCaseWord(word: string, index: number): string {
  if (word === "&") return word;
  if (index > 0 && CONNECTORS.has(word.toLowerCase())) return word.toLowerCase();
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

/**
 * Display name for a raw catalog string, or `null` when the string carries no
 * supplier at all. All-caps input is title-cased; input that already has mixed
 * case is left alone (someone typed it on purpose).
 */
export function canonicalSupplierName(raw: string): string | null {
  const key = normalizeSupplierName(raw);
  if (!key || PLACEHOLDERS.has(key)) return null;

  const alias = SUPPLIER_NAME_ALIASES[key];
  if (alias) return alias;

  const decoded = (raw ?? "").replace(/&amp;/gi, "&").replace(/\s+/g, " ").trim();
  const isAllCaps = decoded === decoded.toUpperCase();
  if (!isAllCaps) return decoded;

  return decoded.split(" ").map(titleCaseWord).join(" ");
}

/** True when two raw names denote the same supplier. */
export function supplierNameMatches(a: string, b: string): boolean {
  const na = normalizeSupplierName(a);
  const nb = normalizeSupplierName(b);
  if (!na || !nb) return false;
  return (SUPPLIER_NAME_ALIASES[na] ?? na) === (SUPPLIER_NAME_ALIASES[nb] ?? nb);
}
```

- [ ] **Step 6: Rodar o teste e confirmar que passa**

```bash
bun run test -- src/features/suppliers/engine/supplierName.test.ts
```

Esperado: PASS, 11 testes.

- [ ] **Step 7: Escrever o teste de completude (falha)**

Criar `src/features/suppliers/engine/completeness.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { ISupplier } from "@/shared/types";
import { supplierCompleteness } from "./completeness";

function make(patch: Partial<ISupplier> = {}): ISupplier {
  return {
    id: "s1",
    storeId: "store-1",
    name: "Tecfil",
    category: "parts",
    suppliedItems: [],
    status: "active",
    source: "catalog_backfill",
    createdAt: "2026-08-17T12:00:00.000Z",
    updatedAt: "2026-08-17T12:00:00.000Z",
    ...patch,
  };
}

describe("supplierCompleteness", () => {
  it("counts a bare backfilled record as nothing filled", () => {
    const result = supplierCompleteness(make());
    expect(result.filled).toBe(0);
    expect(result.total).toBe(5);
    expect(result.percent).toBe(0);
  });

  it("lists what is missing in the order the form asks for it", () => {
    const result = supplierCompleteness(make());
    expect(result.missing).toEqual([
      "document",
      "paymentTerms",
      "leadTimeDays",
      "contact",
      "suppliedItems",
    ]);
  });

  it("counts a fully filled record as complete", () => {
    const result = supplierCompleteness(
      make({
        document: "33000167000101",
        paymentTerms: "28 dias",
        leadTimeDays: 5,
        contactPhone: "5433218800",
        suppliedItems: ["Filtros"],
      }),
    );
    expect(result.filled).toBe(5);
    expect(result.percent).toBe(100);
    expect(result.missing).toEqual([]);
  });

  it("accepts either contact name or phone as the contact", () => {
    const result = supplierCompleteness(make({ contactName: "Ana Petry" }));
    expect(result.missing).not.toContain("contact");
  });

  it("does not count an empty suppliedItems array as filled", () => {
    const result = supplierCompleteness(make({ suppliedItems: [] }));
    expect(result.missing).toContain("suppliedItems");
  });

  it("rounds the percent to an integer", () => {
    const result = supplierCompleteness(make({ document: "33000167000101" }));
    expect(result.percent).toBe(20);
  });
});
```

- [ ] **Step 8: Rodar o teste e confirmar que falha**

```bash
bun run test -- src/features/suppliers/engine/completeness.test.ts
```

Esperado: FAIL — `Failed to resolve import "./completeness"`.

- [ ] **Step 9: Implementar a completude**

Criar `src/features/suppliers/engine/completeness.ts`:

```ts
import type { ISupplier } from "@/shared/types";

/**
 * The list is an enrichment queue: the ~126 suppliers backfilled from the
 * catalog arrive with a name and nothing else. The `Cadastro` column shows what
 * is MISSING rather than an empty cell, and clicking it opens the form on that
 * field — same move the catalog list made for parts.
 */

export type SupplierMissingField =
  | "document"
  | "paymentTerms"
  | "leadTimeDays"
  | "contact"
  | "suppliedItems";

/** Order matters: this is the order the form asks for them. */
const FIELDS: SupplierMissingField[] = [
  "document",
  "paymentTerms",
  "leadTimeDays",
  "contact",
  "suppliedItems",
];

export const SUPPLIER_MISSING_LABELS: Record<SupplierMissingField, string> = {
  document: "sem CNPJ",
  paymentTerms: "sem condição",
  leadTimeDays: "sem prazo",
  contact: "sem contato",
  suppliedItems: "sem itens",
};

export interface ISupplierCompleteness {
  filled: number;
  total: number;
  /** 0–100, rounded. */
  percent: number;
  missing: SupplierMissingField[];
}

function isFilled(supplier: ISupplier, field: SupplierMissingField): boolean {
  switch (field) {
    case "document":
      return Boolean(supplier.document?.trim());
    case "paymentTerms":
      return Boolean(supplier.paymentTerms?.trim());
    case "leadTimeDays":
      return typeof supplier.leadTimeDays === "number" && supplier.leadTimeDays > 0;
    case "contact":
      return Boolean(supplier.contactName?.trim() ?? supplier.contactPhone?.trim());
    case "suppliedItems":
      return supplier.suppliedItems.length > 0;
  }
}

export function supplierCompleteness(supplier: ISupplier): ISupplierCompleteness {
  const missing = FIELDS.filter((field) => !isFilled(supplier, field));
  const filled = FIELDS.length - missing.length;
  return {
    filled,
    total: FIELDS.length,
    percent: Math.round((filled / FIELDS.length) * 100),
    missing,
  };
}
```

- [ ] **Step 10: Rodar os dois testes e confirmar que passam**

```bash
bun run test -- src/features/suppliers/engine
```

Esperado: PASS, 17 testes em 2 arquivos.

- [ ] **Step 11: Commit**

```bash
git add src/shared/types/suppliers.ts src/shared/types/index.ts src/features/suppliers/engine
git commit -m "feat(suppliers): add ISupplier domain type and name/completeness engines"
```

---

### Task 2: Migration — tabela, RLS, seed do recurso RBAC e backfill

**Files:**
- Create: `supabase/migrations/20260817120000_create_suppliers_table.sql`

**Interfaces:**
- Consumes: `ISupplier` da Task 1 (as colunas espelham os campos), `normalizeSupplierName` (a lógica SQL tem que produzir o mesmo resultado).
- Produces: tabela `public.suppliers`, recurso RBAC `supplier` em `rbac_resources`/`role_permissions`.

> ⚠️ **Esta task NÃO aplica a migration.** Escreve o arquivo e valida a parte `select` do backfill em modo leitura. A aplicação em produção é manual e depende de OK do dono.

- [ ] **Step 1: Escrever a migration**

Criar `supabase/migrations/20260817120000_create_suppliers_table.sql`:

```sql
-- Supplier as a first-class entity (ui_kit `financeiro`, fatia 1).
--
-- Four parts, deliberately in one file because they are one change:
--   1. the table
--   2. RLS mirroring `expenses` (financial data is staff-only)
--   3. the `supplier` RBAC resource — WITHOUT this the sidebar entry is hidden
--      from every role, Owner included (the app hydrates from these tables,
--      not from the TypeScript matrix)
--   4. backfill from `parts.supplier`, which is where supplier names live today

------------------------------------------------------------------ 1. table
create table if not exists public.suppliers (
  id                       text primary key,
  store_id                 text not null references public.stores (id),
  name                     text not null,
  trade_name               text,
  document                 text,
  category                 text not null default 'parts' check (category = any (array[
                             'parts','services','freight','financial'
                           ]::text[])),
  payment_terms            text,
  lead_time_days           integer check (lead_time_days is null or lead_time_days >= 0),
  contact_name             text,
  contact_phone            text,
  preferred_payment_method text check (preferred_payment_method is null or preferred_payment_method = any (array[
                             'boleto','pix','transferencia','debito_automatico'
                           ]::text[])),
  supplied_items           text[] not null default '{}'::text[],
  status                   text not null default 'active' check (status = any (array[
                             'active','inactive'
                           ]::text[])),
  registry_status          text,
  registry_activity        text,
  city                     text,
  state                    text,
  source                   text not null default 'manual' check (source = any (array[
                             'manual','catalog_backfill'
                           ]::text[])),
  notes                    text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index if not exists suppliers_store_id_idx on public.suppliers (store_id);
create index if not exists suppliers_status_idx on public.suppliers (store_id, status);
create index if not exists suppliers_category_idx on public.suppliers (store_id, category);

-- One CNPJ per store, but many records may legitimately have none yet.
create unique index if not exists suppliers_store_document_key
  on public.suppliers (store_id, document)
  where document is not null;

------------------------------------------------------------------ 2. RLS
-- Mirrors expenses (20260609003351_rls_slice2_financial_staff_only.sql): a
-- non-staff seller reads nothing. Supplier carries payment terms and, once
-- `payable` lands, purchase amounts — that is cost data.
alter table public.suppliers enable row level security;

drop policy if exists suppliers_select on public.suppliers;
create policy suppliers_select on public.suppliers for select to authenticated
  using (store_id = public.current_store_id() and public.is_staff());

drop policy if exists suppliers_insert on public.suppliers;
create policy suppliers_insert on public.suppliers for insert to authenticated
  with check (store_id = public.current_store_id() and public.is_staff());

drop policy if exists suppliers_update on public.suppliers;
create policy suppliers_update on public.suppliers for update to authenticated
  using (store_id = public.current_store_id() and public.is_staff())
  with check (store_id = public.current_store_id() and public.is_staff());

drop policy if exists suppliers_delete on public.suppliers;
create policy suppliers_delete on public.suppliers for delete to authenticated
  using (store_id = public.current_store_id() and public.is_staff());

------------------------------------------------------------------ 3. RBAC seed
-- Grants agreed with the owner: Owner, Gestor and Financeiro. Vendedor stays
-- out — same cost/margin boundary already applied in the catalog.
insert into public.rbac_resources (key, label, "group", sort_order)
values ('supplier', 'Fornecedores', 'Financeiro', 1)
on conflict (key) do nothing;

insert into public.role_permissions (role_id, resource, actions, scope)
values
  ('Owner',      'supplier', array['view','create','edit','delete'], 'all'),
  ('Gestor',     'supplier', array['view','create','edit'],          'store'),
  ('Financeiro', 'supplier', array['view','create','edit'],          'store')
on conflict (role_id, resource) do nothing;

------------------------------------------------------------------ 4. backfill
-- `parts.supplier` holds 127 distinct strings over 4.005 parts; 3.311 of those
-- parts say "Não informado". The normalization below MUST agree with
-- src/features/suppliers/engine/supplierName.ts — same placeholder rejection,
-- same &amp; decoding, same UFI alias, same title-casing of all-caps names.
with cleaned as (
  select
    replace(btrim(p.supplier), '&amp;', '&') as raw,
    lower(
      regexp_replace(
        unaccent(replace(btrim(p.supplier), '&amp;', '&')),
        '\s+', ' ', 'g'
      )
    ) as key,
    p.store_id
  from public.parts p
  where btrim(coalesce(p.supplier, '')) <> ''
),
filtered as (
  select * from cleaned
  where key not in ('nao informado', 'sem fornecedor', 'n a', '-')
),
canonical as (
  select
    store_id,
    case
      when key in ('ufi', 'ufi filters') then 'UFI Filters'
      when raw = upper(raw) then initcap(raw)
      else raw
    end as name,
    case
      when key in ('ufi', 'ufi filters') then 'ufi filters'
      else key
    end as dedupe_key
  from filtered
)
insert into public.suppliers (id, store_id, name, category, source, supplied_items)
select
  'sup-' || substr(md5(dedupe_key || store_id), 1, 16),
  store_id,
  min(name),
  'parts',
  'catalog_backfill',
  '{}'::text[]
from canonical
group by dedupe_key, store_id
on conflict (id) do nothing;
```

- [ ] **Step 2: Validar o `select` do backfill contra o dado real, em modo leitura**

Rodar via MCP Supabase (`execute_sql`) **apenas a parte de leitura** — nada é escrito:

```sql
with cleaned as (
  select
    replace(btrim(p.supplier), '&amp;', '&') as raw,
    lower(regexp_replace(unaccent(replace(btrim(p.supplier), '&amp;', '&')), '\s+', ' ', 'g')) as key
  from public.parts p
  where btrim(coalesce(p.supplier, '')) <> ''
),
filtered as (select * from cleaned where key not in ('nao informado','sem fornecedor','n a','-')),
canonical as (
  select
    case when key in ('ufi','ufi filters') then 'UFI Filters'
         when raw = upper(raw) then initcap(raw) else raw end as name,
    case when key in ('ufi','ufi filters') then 'ufi filters' else key end as dedupe_key
  from filtered
)
select count(distinct dedupe_key) as fornecedores, count(*) as linhas from canonical;
```

Esperado: `fornecedores` entre 120 e 126 (127 distintos menos o placeholder, menos o colapso UFI). Se a extensão `unaccent` não existir, o erro aparece aqui — nesse caso adicionar `create extension if not exists unaccent;` no topo da migration e repetir.

- [ ] **Step 3: Conferir que os nomes canônicos batem com o engine**

Rodar a mesma consulta trocando o `select` final por:

```sql
select distinct name from canonical order by name limit 20;
```

Esperado: nomes em Title Case (`Ciocari Distribuidora Ltda`, `Potter & Hoppe Injecao Eletronica Ltda`), `UFI Filters` aparecendo uma única vez, nenhum `Não informado`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260817120000_create_suppliers_table.sql
git commit -m "feat(suppliers): add suppliers table, RLS, RBAC seed and catalog backfill

Migration is written, NOT applied — production apply is manual and needs the
owner's explicit go-ahead."
```

---

### Task 3: Recurso RBAC `supplier` no código

**Files:**
- Modify: `src/features/rbac/permissions/resources.ts` (adicionar o literal)
- Modify: `src/features/rbac/permissions/matrix.ts` (entradas de Owner, Gestor e Financeiro)
- Create: `src/features/rbac/permissions/matrix.supplier.test.ts`

**Interfaces:**
- Consumes: `ResourceName` de `./resources`.
- Produces: `"supplier"` como `ResourceName` válido; grants na `PERMISSIONS_MATRIX`.

- [ ] **Step 1: Escrever o teste (falha)**

Criar `src/features/rbac/permissions/matrix.supplier.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { PERMISSIONS_MATRIX } from "./matrix";
import { RESOURCES } from "./resources";

/**
 * The `supplier` resource has two halves: this matrix (UX discipline and the
 * seed's source) and the database rows the running app actually reads. This
 * test guards the code half; the DB half lives in
 * supabase/migrations/20260817120000_create_suppliers_table.sql.
 */
describe("supplier RBAC resource", () => {
  it("is declared in the canonical resource list", () => {
    expect(RESOURCES).toContain("supplier");
  });

  it.each(["Owner", "Gestor", "Financeiro"] as const)("grants view to %s", (role) => {
    const entry = PERMISSIONS_MATRIX[role].find((p) => p.resource === "supplier");
    expect(entry).toBeDefined();
    expect(entry?.actions).toContain("view");
  });

  it.each(["Vendedor", "VendedorExterno", "SDR"] as const)("does not grant %s", (role) => {
    expect(PERMISSIONS_MATRIX[role].find((p) => p.resource === "supplier")).toBeUndefined();
  });

  it("keeps delete with the Owner only", () => {
    expect(PERMISSIONS_MATRIX.Owner.find((p) => p.resource === "supplier")?.actions).toContain(
      "delete",
    );
    expect(PERMISSIONS_MATRIX.Gestor.find((p) => p.resource === "supplier")?.actions).not.toContain(
      "delete",
    );
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

```bash
bun run test -- src/features/rbac/permissions/matrix.supplier.test.ts
```

Esperado: FAIL — `expected [ … ] to contain 'supplier'`.

- [ ] **Step 3: Declarar o recurso**

Em `src/features/rbac/permissions/resources.ts`, logo após a linha `"cashflow",`:

```ts
  // Supplier — the money-out counterpart of `customer` (ui_kit financeiro).
  // Carries payment terms and, once `payable` lands, purchase amounts: cost
  // data, so it sits in the same band as `expense` and `cashflow`.
  "supplier",
```

- [ ] **Step 4: Conceder na matriz**

Em `src/features/rbac/permissions/matrix.ts`, adicionar em `OWNER_ENTRIES` logo após `p("cashflow", ["view", "create"], "all"),`:

```ts
  p("supplier", CRUD, "all"),
```

Adicionar a mesma linha em `GESTOR_ENTRIES` (declarado na linha ~93) e em `FINANCEIRO_ENTRIES` (linha ~235), em ambos os casos logo depois da entrada de `p("cashflow", ["view", "create"], "store"),`:

```ts
  p("supplier", ["view", "create", "edit"], "store"),
```

Não tocar em `VENDEDOR_ENTRIES` (161), `SDR_ENTRIES` (188), `CLIENTE_ENTRIES` (207) nem `VENDEDOR_EXTERNO_ENTRIES` (216) — o teste da Task 3 falha se algum deles ganhar o recurso.

- [ ] **Step 5: Rodar o teste e confirmar que passa**

```bash
bun run test -- src/features/rbac/permissions/matrix.supplier.test.ts
```

Esperado: PASS, 8 testes.

- [ ] **Step 6: Rodar a suíte de RBAC inteira, para pegar teste de exaustividade**

```bash
bun run test -- src/features/rbac
```

Esperado: PASS. Se houver um teste que exige que **toda** entrada de `RESOURCES` apareça na matriz de **todo** papel, ele falha aqui — nesse caso, ler o teste e seguir a convenção que ele impõe (recursos restritos costumam ter uma lista de exceção).

- [ ] **Step 7: Commit**

```bash
git add src/features/rbac/permissions
git commit -m "feat(rbac): add supplier resource with Owner/Gestor/Financeiro grants"
```

---

### Task 4: Camada de dados — mock, contrato, Supabase, factory

**Files:**
- Create: `src/mocks/data/seedSuppliers.ts`
- Create: `src/mocks/api/suppliers.ts`
- Modify: `src/mocks/api/index.ts`
- Create: `src/providers/data/contracts/suppliers.ts`
- Modify: `src/providers/data/contracts/index.ts`
- Create: `src/providers/data/impl/mock/suppliers.ts`
- Create: `src/providers/data/impl/supabase/suppliers.ts`
- Create: `src/providers/data/hooks/useSuppliersProvider.ts`
- Modify: `src/providers/data/factory.ts`
- Modify: `src/providers/data/index.ts`
- Create: `src/mocks/api/suppliers.test.ts`

**Interfaces:**
- Consumes: `ISupplier`, `ISupplierStats`, `ISupplierEntry` (Task 1); `supplierNameMatches` (Task 1); `IPaginatedResult`, `IPaginationParams` de `../contracts/_shared`.
- Produces:
  - `ISuppliersProvider` com `list / get / create / update / archive / stats`
  - `IListSuppliersParams { search?: string; category?: SupplierCategory; status?: SupplierStatus; page?: number; pageSize?: number }`
  - `ICreateSupplierInput` / `IUpdateSupplierPatch`
  - `useSuppliersProvider(): ISuppliersProvider`
  - `suppliersApi` no barrel `@/mocks`

- [ ] **Step 1: Escrever o contrato**

Criar `src/providers/data/contracts/suppliers.ts`:

```ts
import type {
  ID,
  ISupplier,
  ISupplierStats,
  SupplierCategory,
  SupplierPaymentMethod,
  SupplierStatus,
} from "@/shared/types";
import type { IPaginatedResult, IPaginationParams } from "./_shared";

export interface IListSuppliersParams extends IPaginationParams {
  /** Matches name, trade name and document. */
  search?: string;
  category?: SupplierCategory;
  status?: SupplierStatus;
}

export interface ICreateSupplierInput {
  storeId: ID;
  name: string;
  tradeName?: string;
  document?: string;
  category: SupplierCategory;
  paymentTerms?: string;
  leadTimeDays?: number;
  contactName?: string;
  contactPhone?: string;
  preferredPaymentMethod?: SupplierPaymentMethod;
  suppliedItems?: string[];
  registryStatus?: string;
  registryActivity?: string;
  city?: string;
  state?: string;
  notes?: string;
}

export type IUpdateSupplierPatch = Partial<Omit<ICreateSupplierInput, "storeId">> & {
  status?: SupplierStatus;
};

/**
 * Contract for suppliers (ui_kit `financeiro`, fatia 1).
 *
 * `stats` is separate from `get` on purpose: the metrics are DERIVED (today
 * from `parts.suppliers`, tomorrow also from `payable`), cost a full catalog
 * scan, and only the rail and the drawer need them.
 *
 * @see ../../../mocks/api/suppliers.ts
 */
export interface ISuppliersProvider {
  list(params?: IListSuppliersParams): Promise<IPaginatedResult<ISupplier>>;
  get(id: ID): Promise<ISupplier>;
  create(input: ICreateSupplierInput): Promise<ISupplier>;
  update(id: ID, patch: IUpdateSupplierPatch): Promise<ISupplier>;
  /** Soft removal — flips `status` to `inactive`; history is never deleted. */
  archive(id: ID): Promise<ISupplier>;
  stats(id: ID): Promise<ISupplierStats>;
}
```

- [ ] **Step 2: Fiar o contrato no barrel de contratos**

Em `src/providers/data/contracts/index.ts`:
1. após `import type { IModelKitsProvider } from "./modelKits";` (linha ~38) adicionar
   `import type { ISuppliersProvider } from "./suppliers";`
2. no bloco de re-export de tipos, adicionar
   ```ts
   export type {
     ISuppliersProvider,
     IListSuppliersParams,
     ICreateSupplierInput,
     IUpdateSupplierPatch,
   } from "./suppliers";
   ```
3. na interface `IDataProviders`, junto de `modelKits`, adicionar
   `suppliers: ISuppliersProvider;`

- [ ] **Step 3: Escrever o teste do mock (falha)**

Criar `src/mocks/api/suppliers.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { suppliersApi } from "./suppliers";

const STORE = "store-1";

describe("suppliersApi", () => {
  beforeEach(() => {
    suppliersApi.__resetForTests();
  });

  it("lists the seeded suppliers paginated", async () => {
    const result = await suppliersApi.list({ page: 1, pageSize: 5 });
    expect(result.data).toHaveLength(5);
    expect(result.total).toBeGreaterThan(5);
    expect(result.page).toBe(1);
  });

  it("filters by category", async () => {
    const result = await suppliersApi.list({ category: "freight", pageSize: 100 });
    expect(result.data.length).toBeGreaterThan(0);
    expect(result.data.every((s) => s.category === "freight")).toBe(true);
  });

  it("searches by name, ignoring case and accent", async () => {
    const result = await suppliersApi.list({ search: "retifica", pageSize: 100 });
    expect(result.data.some((s) => s.name.toLowerCase().includes("retífica"))).toBe(true);
  });

  it("creates a supplier that starts active with no history", async () => {
    const created = await suppliersApi.create({
      storeId: STORE,
      name: "Fornecedor Novo",
      category: "parts",
    });
    expect(created.status).toBe("active");
    expect(created.source).toBe("manual");
    expect(created.suppliedItems).toEqual([]);

    const stats = await suppliersApi.stats(created.id);
    expect(stats.linkedParts).toBe(0);
    expect(stats.purchasesLast12Months).toBe(0);
    expect(stats.lastEntries).toEqual([]);
  });

  it("rejects a duplicate document within the same store", async () => {
    await suppliersApi.create({
      storeId: STORE,
      name: "Primeiro",
      document: "33000167000101",
      category: "parts",
    });
    await expect(
      suppliersApi.create({
        storeId: STORE,
        name: "Segundo",
        document: "33000167000101",
        category: "parts",
      }),
    ).rejects.toThrow(/já cadastrado/i);
  });

  it("patches only the given fields", async () => {
    const created = await suppliersApi.create({
      storeId: STORE,
      name: "Editável",
      category: "parts",
    });
    const updated = await suppliersApi.update(created.id, { paymentTerms: "28 dias" });
    expect(updated.paymentTerms).toBe("28 dias");
    expect(updated.name).toBe("Editável");
  });

  it("archives instead of deleting", async () => {
    const created = await suppliersApi.create({
      storeId: STORE,
      name: "Arquivável",
      category: "parts",
    });
    const archived = await suppliersApi.archive(created.id);
    expect(archived.status).toBe("inactive");
    await expect(suppliersApi.get(created.id)).resolves.toBeDefined();
  });
});
```

- [ ] **Step 4: Rodar o teste e confirmar que falha**

```bash
bun run test -- src/mocks/api/suppliers.test.ts
```

Esperado: FAIL — `Failed to resolve import "./suppliers"`.

- [ ] **Step 5: Escrever a semente do mock**

Criar `src/mocks/data/seedSuppliers.ts`. Os doze fornecedores são os do kit (`FIN_FORN` em `ui_kits/financeiro/fin-fornecedores.jsx`), com as categorias traduzidas para o enum:

```ts
import type { ISupplier } from "@/shared/types";

const NOW = "2026-08-17T12:00:00.000Z";
const STORE = "store-1";

function seed(
  id: string,
  name: string,
  category: ISupplier["category"],
  patch: Partial<ISupplier> = {},
): ISupplier {
  return {
    id,
    storeId: STORE,
    name,
    category,
    suppliedItems: [],
    status: "active",
    source: "catalog_backfill",
    createdAt: NOW,
    updatedAt: NOW,
    ...patch,
  };
}

/** Mirrors FIN_FORN from the ui_kit, so the mock screen reads like the design. */
export const SEED_SUPPLIERS: ISupplier[] = [
  seed("sup-dintec", "DINTEC Distribuidora", "parts", {
    paymentTerms: "28 dias",
    leadTimeDays: 3,
    contactName: "Camila Reis",
    contactPhone: "5433218800",
    suppliedItems: ["Bicos injetores Bosch", "Bombas rotativas", "Kits de reparo"],
    document: "11222333000181",
    source: "manual",
  }),
  seed("sup-bosch", "Robert Bosch", "parts", {
    paymentTerms: "30/60/90",
    leadTimeDays: 7,
    contactName: "Canal distribuidor",
    suppliedItems: ["Sistema common rail", "Velas aquecedoras", "Sensores"],
  }),
  seed("sup-mahle", "MAHLE Metal Leve", "parts", {
    paymentTerms: "30/60",
    leadTimeDays: 9,
    contactName: "Rogério Alves",
    contactPhone: "1140093300",
    suppliedItems: ["Pistões e camisas", "Filtros de óleo", "Bronzinas"],
  }),
  seed("sup-fleetguard", "Fleetguard", "parts", { paymentTerms: "28 dias", leadTimeDays: 11 }),
  seed("sup-tecfil", "Tecfil", "parts", {
    paymentTerms: "28 dias",
    leadTimeDays: 5,
    contactName: "Ana Petry",
    contactPhone: "1121184400",
    suppliedItems: ["Linha de filtros", "Cabine e ar"],
  }),
  seed("sup-delphi", "Delphi Technologies", "parts", { paymentTerms: "45 dias", leadTimeDays: 14 }),
  seed("sup-retifica", "Retífica Alto Uruguai", "services", {
    paymentTerms: "à vista",
    leadTimeDays: 4,
    contactName: "Ivo Casaril",
    contactPhone: "5537442200",
    suppliedItems: ["Retífica de cabeçote", "Usinagem de bloco"],
  }),
  seed("sup-cresol", "Banco Cresol — antecipação", "financial", {
    paymentTerms: "1,89% a.m.",
    leadTimeDays: 0,
    contactName: "Agência 0812 · gerente Rafael",
    suppliedItems: ["Desconto de duplicata", "Cobrança bancária"],
  }),
  seed("sup-jamef", "Jamef Transportes", "freight", {
    paymentTerms: "14 dias",
    leadTimeDays: 2,
    suppliedItems: ["Frete rodoviário", "Coleta programada"],
  }),
  seed("sup-sabo", "Sabó Vedações", "parts", { paymentTerms: "30 dias", leadTimeDays: 8 }),
  seed("sup-zen", "ZEN S/A", "parts", { paymentTerms: "30/60", leadTimeDays: 10 }),
  seed("sup-ferramentaria", "Ferramentaria Seberi", "services", {
    paymentTerms: "à vista",
    leadTimeDays: 2,
  }),
];
```

- [ ] **Step 6: Escrever a API mock**

Criar `src/mocks/api/suppliers.ts`:

```ts
import type { ID, ISupplier, ISupplierStats } from "@/shared/types";
import type {
  ICreateSupplierInput,
  IListSuppliersParams,
  IUpdateSupplierPatch,
} from "@/providers/data/contracts/suppliers";
import { SEED_SUPPLIERS } from "../data/seedSuppliers";
import { paginate } from "./utils/paginate";

/**
 * In-memory supplier store (Fase 1 mock semantics): writes persist for the
 * session and reset on reload. `stats` returns zeros — the mock has no part
 * entry history, and inventing purchases would make the screen lie.
 */

let suppliers: ISupplier[] = SEED_SUPPLIERS.map((s) => ({ ...s, suppliedItems: [...s.suppliedItems] }));
let createdSeq = 0;

const NOW = () => new Date().toISOString();

function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export const suppliersApi = {
  async list(params: IListSuppliersParams = {}) {
    let rows = suppliers;
    if (params.category) rows = rows.filter((s) => s.category === params.category);
    if (params.status) rows = rows.filter((s) => s.status === params.status);
    if (params.search) {
      const needle = fold(params.search);
      rows = rows.filter(
        (s) =>
          fold(s.name).includes(needle) ||
          fold(s.tradeName ?? "").includes(needle) ||
          (s.document ?? "").includes(needle.replace(/\D/g, "")),
      );
    }
    const sorted = [...rows].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    // paginate(items, params) — the second argument is an object, not positional.
    return paginate(sorted, { page: params.page, pageSize: params.pageSize });
  },

  async get(id: ID): Promise<ISupplier> {
    const found = suppliers.find((s) => s.id === id);
    if (!found) throw new Error(`Fornecedor ${id} não encontrado.`);
    return { ...found };
  },

  async create(input: ICreateSupplierInput): Promise<ISupplier> {
    if (input.document) {
      const clash = suppliers.find(
        (s) => s.storeId === input.storeId && s.document === input.document,
      );
      if (clash) throw new Error(`CNPJ já cadastrado para ${clash.name}.`);
    }
    createdSeq += 1;
    const now = NOW();
    const created: ISupplier = {
      id: `sup-new-${createdSeq}`,
      storeId: input.storeId,
      name: input.name,
      tradeName: input.tradeName,
      document: input.document,
      category: input.category,
      paymentTerms: input.paymentTerms,
      leadTimeDays: input.leadTimeDays,
      contactName: input.contactName,
      contactPhone: input.contactPhone,
      preferredPaymentMethod: input.preferredPaymentMethod,
      suppliedItems: input.suppliedItems ?? [],
      status: "active",
      registryStatus: input.registryStatus,
      registryActivity: input.registryActivity,
      city: input.city,
      state: input.state,
      source: "manual",
      notes: input.notes,
      createdAt: now,
      updatedAt: now,
    };
    suppliers = [...suppliers, created];
    return { ...created };
  },

  async update(id: ID, patch: IUpdateSupplierPatch): Promise<ISupplier> {
    const index = suppliers.findIndex((s) => s.id === id);
    if (index < 0) throw new Error(`Fornecedor ${id} não encontrado.`);
    const updated: ISupplier = { ...suppliers[index], ...patch, updatedAt: NOW() };
    suppliers = suppliers.map((s, i) => (i === index ? updated : s));
    return { ...updated };
  },

  async archive(id: ID): Promise<ISupplier> {
    return suppliersApi.update(id, { status: "inactive" });
  },

  async stats(id: ID): Promise<ISupplierStats> {
    // The mock catalog carries no entry history; zeros are the honest answer.
    return {
      supplierId: id,
      linkedParts: 0,
      purchasesLast12Months: 0,
      lastEntries: [],
      monthlyPurchases: Array.from({ length: 12 }, () => 0),
    };
  },

  /** Test-only: restores the seeded set. */
  __resetForTests() {
    suppliers = SEED_SUPPLIERS.map((s) => ({ ...s, suppliedItems: [...s.suppliedItems] }));
    createdSeq = 0;
  },
};
```

`paginate` vem de `src/mocks/api/utils/paginate.ts` com a assinatura `paginate<T>(items: T[], params?: IPaginationParams)` — o default de `pageSize` é 20 e o teto é 10.000, o mesmo `FETCH_ALL_PAGE_SIZE` dos contratos.

- [ ] **Step 7: Exportar no barrel de mocks**

Em `src/mocks/api/index.ts`, seguindo o padrão do bloco de `modelKits` (linha ~51):

```ts
export { suppliersApi } from "./suppliers";
```

- [ ] **Step 8: Rodar o teste e confirmar que passa**

```bash
bun run test -- src/mocks/api/suppliers.test.ts
```

Esperado: PASS, 7 testes.

- [ ] **Step 9: Escrever a impl mock do provider**

Criar `src/providers/data/impl/mock/suppliers.ts`:

```ts
import { suppliersApi } from "@/mocks";
import type { ISuppliersProvider } from "../../contracts/suppliers";

export const mockSuppliersProvider: ISuppliersProvider = {
  list: (params) => suppliersApi.list(params),
  get: (id) => suppliersApi.get(id),
  create: (input) => suppliersApi.create(input),
  update: (id, patch) => suppliersApi.update(id, patch),
  archive: (id) => suppliersApi.archive(id),
  stats: (id) => suppliersApi.stats(id),
};
```

- [ ] **Step 10: Escrever a impl Supabase**

Criar `src/providers/data/impl/supabase/suppliers.ts`:

```ts
import type { ID, ISupplier, ISupplierEntry, ISupplierStats } from "@/shared/types";
import type {
  ICreateSupplierInput,
  IListSuppliersParams,
  ISuppliersProvider,
  IUpdateSupplierPatch,
} from "../../contracts/suppliers";
import type { IPaginatedResult } from "../../contracts/_shared";
import { getSupabaseClient } from "@/shared/lib/supabase";
import {
  normalizeSupplierName,
  SUPPLIER_NAME_ALIASES,
} from "@/features/suppliers/engine/supplierName";

/**
 * Supabase implementation of {@link ISuppliersProvider}.
 *
 * `stats` is the interesting half. There is no `supplier_id` on `parts` yet, so
 * the join key is the NORMALIZED NAME: we read the catalog's `supplier` and
 * `suppliers` (jsonb entry history) columns and match in memory. That is why
 * `stats` is a separate call and not folded into `get` — it costs a catalog
 * scan and only the rail and the drawer want it.
 */

interface SupplierRow {
  id: string;
  store_id: string;
  name: string;
  trade_name: string | null;
  document: string | null;
  category: ISupplier["category"];
  payment_terms: string | null;
  lead_time_days: number | null;
  contact_name: string | null;
  contact_phone: string | null;
  preferred_payment_method: ISupplier["preferredPaymentMethod"] | null;
  supplied_items: string[] | null;
  status: ISupplier["status"];
  registry_status: string | null;
  registry_activity: string | null;
  city: string | null;
  state: string | null;
  source: ISupplier["source"];
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/** Shape of one element of `parts.suppliers` (jsonb), written by the DINTEC import. */
interface PartEntryJson {
  name?: string;
  invoiceNumber?: string;
  invoiceDate?: string;
  cost?: number;
  quantity?: number;
}

interface PartRow {
  id: string;
  name: string;
  supplier: string | null;
  suppliers: PartEntryJson[] | null;
}

const TABLE = "suppliers";
const PARTS_TABLE = "parts";
const COLUMNS =
  "id, store_id, name, trade_name, document, category, payment_terms, lead_time_days, " +
  "contact_name, contact_phone, preferred_payment_method, supplied_items, status, " +
  "registry_status, registry_activity, city, state, source, notes, created_at, updated_at";

function rowToSupplier(row: SupplierRow): ISupplier {
  return {
    id: row.id,
    storeId: row.store_id,
    name: row.name,
    tradeName: row.trade_name ?? undefined,
    document: row.document ?? undefined,
    category: row.category,
    paymentTerms: row.payment_terms ?? undefined,
    leadTimeDays: row.lead_time_days ?? undefined,
    contactName: row.contact_name ?? undefined,
    contactPhone: row.contact_phone ?? undefined,
    preferredPaymentMethod: row.preferred_payment_method ?? undefined,
    suppliedItems: row.supplied_items ?? [],
    status: row.status,
    registryStatus: row.registry_status ?? undefined,
    registryActivity: row.registry_activity ?? undefined,
    city: row.city ?? undefined,
    state: row.state ?? undefined,
    source: row.source,
    notes: row.notes ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function patchToRow(patch: IUpdateSupplierPatch): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.tradeName !== undefined) row.trade_name = patch.tradeName;
  if (patch.document !== undefined) row.document = patch.document || null;
  if (patch.category !== undefined) row.category = patch.category;
  if (patch.paymentTerms !== undefined) row.payment_terms = patch.paymentTerms;
  if (patch.leadTimeDays !== undefined) row.lead_time_days = patch.leadTimeDays;
  if (patch.contactName !== undefined) row.contact_name = patch.contactName;
  if (patch.contactPhone !== undefined) row.contact_phone = patch.contactPhone;
  if (patch.preferredPaymentMethod !== undefined)
    row.preferred_payment_method = patch.preferredPaymentMethod;
  if (patch.suppliedItems !== undefined) row.supplied_items = patch.suppliedItems;
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.registryStatus !== undefined) row.registry_status = patch.registryStatus;
  if (patch.registryActivity !== undefined) row.registry_activity = patch.registryActivity;
  if (patch.city !== undefined) row.city = patch.city;
  if (patch.state !== undefined) row.state = patch.state;
  if (patch.notes !== undefined) row.notes = patch.notes;
  return row;
}

/** Collapses a raw catalog name to the same key the engine uses. */
function joinKey(raw: string): string {
  const key = normalizeSupplierName(raw);
  return SUPPLIER_NAME_ALIASES[key] ? normalizeSupplierName(SUPPLIER_NAME_ALIASES[key]) : key;
}

export const supabaseSuppliersProvider: ISuppliersProvider = {
  async list(params: IListSuppliersParams = {}): Promise<IPaginatedResult<ISupplier>> {
    const page = params.page ?? 1;
    const pageSize = params.pageSize ?? 50;
    const from = (page - 1) * pageSize;

    let query = getSupabaseClient()
      .from(TABLE)
      .select(COLUMNS, { count: "exact" })
      .order("name", { ascending: true })
      .range(from, from + pageSize - 1);

    if (params.category) query = query.eq("category", params.category);
    if (params.status) query = query.eq("status", params.status);
    if (params.search) {
      const digits = params.search.replace(/\D/g, "");
      const clauses = [`name.ilike.%${params.search}%`, `trade_name.ilike.%${params.search}%`];
      if (digits.length >= 3) clauses.push(`document.ilike.%${digits}%`);
      query = query.or(clauses.join(","));
    }

    const { data, error, count } = await query;
    if (error) throw new Error(`[supabase] suppliers.list failed: ${error.message}`);

    return {
      data: (data as unknown as SupplierRow[]).map(rowToSupplier),
      total: count ?? 0,
      page,
      pageSize,
    };
  },

  async get(id: ID): Promise<ISupplier> {
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .select(COLUMNS)
      .eq("id", id)
      .single();
    if (error) throw new Error(`[supabase] suppliers.get(${id}) failed: ${error.message}`);
    return rowToSupplier(data as unknown as SupplierRow);
  },

  async create(input: ICreateSupplierInput): Promise<ISupplier> {
    const id: ID = crypto.randomUUID();
    const now = new Date().toISOString();
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .insert({
        id,
        store_id: input.storeId,
        name: input.name,
        trade_name: input.tradeName ?? null,
        document: input.document || null,
        category: input.category,
        payment_terms: input.paymentTerms ?? null,
        lead_time_days: input.leadTimeDays ?? null,
        contact_name: input.contactName ?? null,
        contact_phone: input.contactPhone ?? null,
        preferred_payment_method: input.preferredPaymentMethod ?? null,
        supplied_items: input.suppliedItems ?? [],
        status: "active",
        registry_status: input.registryStatus ?? null,
        registry_activity: input.registryActivity ?? null,
        city: input.city ?? null,
        state: input.state ?? null,
        source: "manual",
        notes: input.notes ?? null,
        created_at: now,
        updated_at: now,
      })
      .select(COLUMNS)
      .single();
    if (error) {
      // 23505 = unique violation on (store_id, document).
      if (error.code === "23505") throw new Error("CNPJ já cadastrado nesta loja.");
      throw new Error(`[supabase] suppliers.create failed: ${error.message}`);
    }
    return rowToSupplier(data as unknown as SupplierRow);
  },

  async update(id: ID, patch: IUpdateSupplierPatch): Promise<ISupplier> {
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .update({ ...patchToRow(patch), updated_at: new Date().toISOString() })
      .eq("id", id)
      .select(COLUMNS)
      .single();
    if (error) {
      if (error.code === "23505") throw new Error("CNPJ já cadastrado nesta loja.");
      throw new Error(`[supabase] suppliers.update(${id}) failed: ${error.message}`);
    }
    return rowToSupplier(data as unknown as SupplierRow);
  },

  async archive(id: ID): Promise<ISupplier> {
    return supabaseSuppliersProvider.update(id, { status: "inactive" });
  },

  async stats(id: ID): Promise<ISupplierStats> {
    const supplier = await supabaseSuppliersProvider.get(id);
    const key = joinKey(supplier.name);

    const { data, error } = await getSupabaseClient()
      .from(PARTS_TABLE)
      .select("id, name, supplier, suppliers")
      .eq("store_id", supplier.storeId);
    if (error) throw new Error(`[supabase] suppliers.stats(${id}) failed: ${error.message}`);

    const parts = (data ?? []) as unknown as PartRow[];
    const mine = parts.filter((p) => p.supplier && joinKey(p.supplier) === key);

    const entries: ISupplierEntry[] = [];
    for (const part of mine) {
      for (const raw of part.suppliers ?? []) {
        // A part's entry list can name a different supplier than the part's
        // own `supplier` column — trust the entry's own name when present.
        if (raw.name && joinKey(raw.name) !== key) continue;
        entries.push({
          invoiceNumber: raw.invoiceNumber,
          invoiceDate: raw.invoiceDate,
          cost: raw.cost ?? 0,
          quantity: raw.quantity ?? 0,
          partId: part.id,
          partName: part.name,
        });
      }
    }

    entries.sort((a, b) => (b.invoiceDate ?? "").localeCompare(a.invoiceDate ?? ""));

    const now = new Date();
    const monthly = Array.from({ length: 12 }, () => 0);
    let total = 0;
    for (const entry of entries) {
      if (!entry.invoiceDate) continue;
      const when = new Date(entry.invoiceDate);
      const monthsAgo =
        (now.getFullYear() - when.getFullYear()) * 12 + (now.getMonth() - when.getMonth());
      if (monthsAgo < 0 || monthsAgo > 11) continue;
      const amount = entry.cost * (entry.quantity || 1);
      monthly[11 - monthsAgo] += amount;
      total += amount;
    }

    return {
      supplierId: id,
      linkedParts: mine.length,
      purchasesLast12Months: total,
      lastEntries: entries.slice(0, 8),
      monthlyPurchases: monthly,
    };
  },
};
```

- [ ] **Step 11: Escrever o hook e fiar a factory**

Criar `src/providers/data/hooks/useSuppliersProvider.ts`:

```ts
import type { ISuppliersProvider } from "../contracts/suppliers";
import { useDataProviderSlice } from "./_useDataProviderSlice";

export function useSuppliersProvider(): ISuppliersProvider {
  return useDataProviderSlice("suppliers", "useSuppliersProvider");
}
```

Em `src/providers/data/factory.ts`, quatro edições espelhando `modelKits`:
```ts
import { mockSuppliersProvider } from "./impl/mock/suppliers";        // junto dos outros mock imports
import { supabaseSuppliersProvider } from "./impl/supabase/suppliers"; // junto dos supabase imports
// no objeto mockProviders:
  suppliers: mockSuppliersProvider,
// no objeto supabaseProviders:
  suppliers: supabaseSuppliersProvider,
```

Em `src/providers/data/index.ts`, adicionar ao bloco de re-export de tipos:
```ts
  ISuppliersProvider,
  IListSuppliersParams,
  ICreateSupplierInput,
  IUpdateSupplierPatch,
```
e junto dos hooks exportados (linha ~180):
```ts
export { useSuppliersProvider } from "./hooks/useSuppliersProvider";
```

- [ ] **Step 12: Rodar a suíte e o build**

```bash
bun run test
```
Esperado: PASS — nenhuma regressão.

```bash
bun run build
```
Esperado: build limpo.

- [ ] **Step 13: Commit**

```bash
git add src/mocks src/providers/data
git commit -m "feat(suppliers): wire suppliers provider (contract, mock, supabase, factory)"
```

---

### Task 5: Rota, grupo FINANCEIRO na sidebar e a página mínima

**Files:**
- Modify: `src/features/shell/config/routes.ts`
- Modify: `src/features/shell/config/navigation.ts:154-299`
- Create: `src/routes/app.financeiro.fornecedores.tsx`
- Create: `src/features/suppliers/i18n/pt-BR.ts`
- Create: `src/features/suppliers/hooks/useSuppliersList.ts`
- Create: `src/features/suppliers/pages/SuppliersListPage.tsx`
- Create: `src/features/suppliers/index.ts`
- Create: `src/features/shell/config/navigation.financeiro.test.ts`

**Interfaces:**
- Consumes: `useSuppliersProvider` (Task 4), `ISupplier` (Task 1).
- Produces:
  - `ROUTES.FINANCEIRO_FORNECEDORES = "/app/financeiro/fornecedores"`
  - `SUPPLIERS_STRINGS` (todo texto de UI da feature)
  - `useSuppliersList(filters): { data, isLoading, error }`
  - `SuppliersListPage`
  - Grupo `"Financeiro"` em `APP_NAV_GROUPS`

- [ ] **Step 1: Escrever o teste de navegação (falha)**

Criar `src/features/shell/config/navigation.financeiro.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { APP_NAV_GROUPS, isNavItemVisible } from "./navigation";
import { ROUTES } from "./routes";

const groups = () => APP_NAV_GROUPS.map((g) => g.label);
const financeiro = () => APP_NAV_GROUPS.find((g) => g.label === "Financeiro");
const gestao = () => APP_NAV_GROUPS.find((g) => g.label === "Gestão");

describe("FINANCEIRO nav group", () => {
  it("sits between Comercial and SDR, as the kit lays it out", () => {
    const labels = groups();
    expect(labels.indexOf("Financeiro")).toBe(labels.indexOf("Comercial") + 1);
    expect(labels.indexOf("Financeiro")).toBeLessThan(labels.indexOf("SDR"));
  });

  it("opens with Fornecedores plus the four items moved out of Gestão", () => {
    expect(financeiro()?.items.map((i) => i.label)).toEqual([
      "Fornecedores",
      "Fluxo de Caixa",
      "Despesas",
      "Comissões",
      "DRE Gerencial",
    ]);
  });

  it("leaves no financial item behind in Gestão", () => {
    const left = gestao()?.items.map((i) => i.label) ?? [];
    expect(left).not.toContain("Despesas");
    expect(left).not.toContain("Fluxo de Caixa");
    expect(left).not.toContain("Comissões");
    expect(left).not.toContain("DRE Gerencial");
  });

  it("keeps the moved items on their original URLs", () => {
    const byLabel = (label: string) => financeiro()?.items.find((i) => i.label === label);
    expect(byLabel("Despesas")?.to).toBe(ROUTES.GESTAO_DESPESAS);
    expect(byLabel("Fluxo de Caixa")?.to).toBe(ROUTES.GESTAO_CAIXA);
    expect(byLabel("Comissões")?.to).toBe(ROUTES.GESTAO_COMISSOES);
    expect(byLabel("DRE Gerencial")?.to).toBe(ROUTES.GESTAO_DRE);
  });

  it("gates Fornecedores on the supplier resource, not on a role allowlist", () => {
    const item = financeiro()?.items.find((i) => i.label === "Fornecedores");
    expect(item?.permission).toEqual({ resource: "supplier" });
    expect(item?.roles).toBeUndefined();
    expect(item?.to).toBe(ROUTES.FINANCEIRO_FORNECEDORES);
  });

  it("hides Fornecedores from a user without the permission", () => {
    const item = financeiro()!.items.find((i) => i.label === "Fornecedores")!;
    expect(isNavItemVisible(item, null)).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

```bash
bun run test -- src/features/shell/config/navigation.financeiro.test.ts
```

Esperado: FAIL — `expected -1 to be 2` (o grupo não existe).

- [ ] **Step 3: Declarar a rota**

Em `src/features/shell/config/routes.ts`, após a linha `APP_STOREFRONT_ADMIN: "/app/storefront-admin",`:

```ts
  // Financeiro (ui_kit `financeiro`). The four items moved out of Gestão keep
  // their GESTAO_* URLs — renaming a route breaks saved links.
  FINANCEIRO_FORNECEDORES: "/app/financeiro/fornecedores",
```

- [ ] **Step 4: Criar o grupo e mover os quatro itens**

Em `src/features/shell/config/navigation.ts`, inserir o grupo **entre** o grupo `Comercial` (que termina na linha 153) e o grupo `SDR` (que começa na 154):

```ts
  {
    // The kit (`ui_kits/financeiro/fin-shell.jsx`) puts FINANCEIRO right after
    // COMERCIAL. It opens with what exists: Fornecedores plus the four items
    // that used to sit inside Gestão. The other six screens of the kit (Contas
    // a receber, Contas a pagar, Previsibilidade, KPIs and the two chart
    // pages) join as they are implemented — a menu entry that leads nowhere is
    // worse than an absent one.
    label: "Financeiro",
    items: [
      {
        label: "Fornecedores",
        icon: "mdi:domain",
        to: ROUTES.FINANCEIRO_FORNECEDORES,
        permission: { resource: "supplier" },
      },
      {
        label: "Fluxo de Caixa",
        icon: "mdi:cash-flow",
        to: ROUTES.GESTAO_CAIXA,
        permission: { resource: "cashflow" },
      },
      {
        label: "Despesas",
        icon: "mdi:cash-remove",
        to: ROUTES.GESTAO_DESPESAS,
        permission: { resource: "expense" },
      },
      {
        label: "Comissões",
        icon: "mdi:cash-multiple",
        to: ROUTES.GESTAO_COMISSOES,
        // Kept on roles: Gestor holds `approve` but not `view` on commission.
        roles: ["Owner", "Gestor", "Vendedor", "Financeiro"],
      },
      {
        label: "DRE Gerencial",
        icon: "mdi:file-chart",
        to: ROUTES.GESTAO_DRE,
        // Owner-only by product decision (matrix grants Gestor/Financeiro view).
        roles: ["Owner"],
      },
    ],
  },
```

Depois **remover** do grupo `Gestão` os quatro itens agora duplicados: `Comissões` (linhas 241-247), `DRE Gerencial` (248-254), `Despesas` (261-266) e `Fluxo de Caixa` (267-272). **Não** remover `Rentabilidade`, `Estoque`, `Movimentação` nem `Insights` — esses continuam em Gestão.

- [ ] **Step 5: Rodar o teste e confirmar que passa**

```bash
bun run test -- src/features/shell/config/navigation.financeiro.test.ts
```

Esperado: PASS, 6 testes.

- [ ] **Step 6: Escrever os textos da feature**

Criar `src/features/suppliers/i18n/pt-BR.ts`:

```ts
/** Every user-facing string of the suppliers feature. */
export const SUPPLIERS_STRINGS = {
  page: {
    title: "Fornecedores",
    description:
      "Quem fornece, em que condição e o que se compra de cada um. O prazo médio de pagamento aqui é a contraparte do prazo médio de recebimento.",
  },
  kpis: {
    active: "Fornecedores ativos",
    withDocument: "Com CNPJ",
    linkedParts: "Peças vinculadas",
    purchases: "Compras 12 meses",
    leadTime: "Prazo médio de entrega",
    leadTimeUnit: "dias",
    withDocumentHint: "clique para ver quem falta",
  },
  categories: {
    all: "Todos",
    parts: "Peças",
    services: "Serviços",
    freight: "Frete",
    financial: "Financeiro",
  },
  sort: {
    name: "Nome",
    parts: "Peças",
    purchases: "Compras",
    completeness: "Cadastro",
  },
  columns: {
    supplier: "Fornecedor",
    terms: "Condição",
    parts: "Peças",
    purchases: "Compras 12m",
    completeness: "Cadastro",
    contact: "Contato",
  },
  search: {
    placeholder: "Buscar por nome ou CNPJ…",
    label: "Buscar fornecedor",
  },
  actions: {
    create: "Novo fornecedor",
    edit: "Editar cadastro",
    fullSheet: "Ficha completa",
    archive: "Desativar fornecedor",
  },
  empty: {
    list: "Nenhum fornecedor encontrado.",
    listHint: "Ajuste os filtros ou cadastre o primeiro fornecedor.",
    entries: "Sem notas de entrada registradas.",
    items: "Ainda sem itens vinculados.",
    purchases: "Sem compras registradas — o histórico começa na primeira nota de entrada.",
    payables:
      "O contas a pagar ainda não existe no sistema. Quando existir, os títulos deste fornecedor aparecem aqui.",
  },
  complete: "Cadastro completo",
  newBadge: "novo",
} as const;
```

- [ ] **Step 7: Escrever o hook de lista**

Criar `src/features/suppliers/hooks/useSuppliersList.ts`:

```ts
import { useQuery } from "@tanstack/react-query";
import type { ISupplier, SupplierCategory } from "@/shared/types";
import { FETCH_ALL_PAGE_SIZE, useSuppliersProvider } from "@/providers/data";
import { useCurrentStore } from "@/features/multistore/hooks/useCurrentStore";

export interface ISuppliersListFilters {
  search: string;
  category: SupplierCategory | "all";
}

/**
 * The whole active set in one fetch: ~126 rows, and every KPI plus the category
 * chips describe the BASE, not the visible page. Filtering happens client-side.
 */
export function useSuppliersList(filters: ISuppliersListFilters) {
  const provider = useSuppliersProvider();
  const { currentStoreId } = useCurrentStore();

  const query = useQuery({
    // The store id, never the store object — an object key re-fetches forever.
    queryKey: ["suppliers", "list", currentStoreId] as const,
    queryFn: () => provider.list({ pageSize: FETCH_ALL_PAGE_SIZE, status: "active" }),
    staleTime: 60_000,
  });

  const all: ISupplier[] = query.data?.data ?? [];
  const visible = all.filter((s) => {
    if (filters.category !== "all" && s.category !== filters.category) return false;
    if (!filters.search.trim()) return true;
    const needle = filters.search
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
    const haystack = `${s.name} ${s.tradeName ?? ""} ${s.document ?? ""}`
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
    return haystack.includes(needle);
  });

  return { all, visible, isLoading: query.isLoading, error: query.error };
}
```

- [ ] **Step 8: Escrever a página mínima**

Criar `src/features/suppliers/pages/SuppliersListPage.tsx`. Nesta task ela só lista — filtros, KPIs, rail e modais chegam nas tasks seguintes:

```tsx
import { useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { useSuppliersList, type ISuppliersListFilters } from "../hooks/useSuppliersList";
import { SUPPLIERS_STRINGS } from "../i18n/pt-BR";

const COPY = SUPPLIERS_STRINGS;

export function SuppliersListPage() {
  const [filters] = useState<ISuppliersListFilters>({ search: "", category: "all" });
  const { visible, isLoading } = useSuppliersList(filters);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="sticky top-0 z-20 border-b border-border/40 bg-background/85 shadow-lg shadow-foreground/5 backdrop-blur-2xl backdrop-saturate-[1.8] supports-[backdrop-filter]:bg-background/50">
        <div className="mx-auto w-full max-w-[1360px] px-6 py-5">
          <h1 className="text-2xl font-bold uppercase tracking-tight text-foreground">
            {COPY.page.title}
          </h1>
          <p className="mt-2 max-w-[760px] text-sm text-muted-foreground">
            {COPY.page.description}
          </p>
        </div>
      </header>

      <div className="mx-auto w-full max-w-[1360px] flex-1 overflow-y-auto px-6 py-4">
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted-foreground">{COPY.empty.list}</p>
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border bg-card">
            {visible.map((supplier) => (
              <li key={supplier.id} className="px-4 py-3 text-sm text-foreground">
                {supplier.name}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 9: Criar o barrel da feature**

Criar `src/features/suppliers/index.ts`:

```ts
export { SuppliersListPage } from "./pages/SuppliersListPage";
export { SUPPLIERS_STRINGS } from "./i18n/pt-BR";
```

- [ ] **Step 10: Criar a rota**

Criar `src/routes/app.financeiro.fornecedores.tsx`:

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { DashboardLayout } from "@/features/shell/layouts";
import { requireAuth } from "@/features/auth/guards";
import { SuppliersListPage } from "@/features/suppliers";

export const Route = createFileRoute("/app/financeiro/fornecedores")({
  // Permission only, no `roles` ceiling: the two combine with AND, and a
  // ceiling here would make granting `supplier` in the Role Editor inert.
  beforeLoad: ({ location }) =>
    requireAuth(location.pathname, undefined, { resource: "supplier", action: "view" }),
  component: () => (
    <DashboardLayout>
      <SuppliersListPage />
    </DashboardLayout>
  ),
});
```

- [ ] **Step 11: Rodar build e testes**

```bash
bun run build
```
Esperado: build limpo, com `src/routeTree.gen.ts` regenerado incluindo a rota nova.

```bash
bun run test
```
Esperado: PASS.

- [ ] **Step 12: Commit**

```bash
git add src/features/shell/config src/features/suppliers src/routes/app.financeiro.fornecedores.tsx src/routeTree.gen.ts
git commit -m "feat(suppliers): add FINANCEIRO nav group and the suppliers route"
```

---

### Task 6: Faixa de KPIs, filtros e a tabela completa

**Files:**
- Create: `src/features/suppliers/utils/columns.ts`
- Create: `src/features/suppliers/components/list/SuppliersKpiStrip.tsx`
- Create: `src/features/suppliers/components/list/SuppliersFiltersBar.tsx`
- Create: `src/features/suppliers/components/list/SuppliersSearch.tsx`
- Create: `src/features/suppliers/components/list/SuppliersColumnsMenu.tsx`
- Create: `src/features/suppliers/components/list/SuppliersTable.tsx`
- Create: `src/features/suppliers/hooks/useSuppliersStatsIndex.ts`
- Modify: `src/features/suppliers/pages/SuppliersListPage.tsx`
- Create: `src/features/suppliers/utils/columns.test.ts`

**Interfaces:**
- Consumes: `useSuppliersList` (Task 5), `supplierCompleteness` + `SUPPLIER_MISSING_LABELS` (Task 1), `useSuppliersProvider` (Task 4), `SUPPLIERS_STRINGS` (Task 5).
- Produces:
  - `SupplierColumnId`, `OPTIONAL_COLUMNS`, `COLUMN_LABELS`, `readVisibleOptional()`, `writeVisibleOptional()`
  - `SuppliersKpiStrip`, `SuppliersFiltersBar`, `SuppliersSearch`, `SuppliersTable`, `SuppliersColumnsDropdown`, `SuppliersColumnsContextContent`
  - `useSuppliersStatsIndex(ids): Map<ID, ISupplierStats>`
  - `ISuppliersSort { by: "name" | "parts" | "purchases" | "completeness"; dir: "asc" | "desc" }`

- [ ] **Step 1: Escrever o teste de colunas (falha)**

Criar `src/features/suppliers/utils/columns.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import {
  COLUMN_LABELS,
  OPTIONAL_COLUMNS,
  readVisibleOptional,
  writeVisibleOptional,
} from "./columns";

describe("supplier column visibility", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("shows every optional column by default", () => {
    expect(readVisibleOptional()).toEqual([...OPTIONAL_COLUMNS]);
  });

  it("round-trips a saved selection", () => {
    writeVisibleOptional(["terms", "contact"]);
    expect(readVisibleOptional()).toEqual(["terms", "contact"]);
  });

  it("ignores unknown ids left by an older build", () => {
    window.localStorage.setItem("gallo-suppliers-visible-columns", JSON.stringify(["terms", "otif"]));
    expect(readVisibleOptional()).toEqual(["terms"]);
  });

  it("labels every optional column in Portuguese", () => {
    for (const id of OPTIONAL_COLUMNS) {
      expect(COLUMN_LABELS[id]).toBeTruthy();
    }
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

```bash
bun run test -- src/features/suppliers/utils/columns.test.ts
```

Esperado: FAIL — `Failed to resolve import "./columns"`.

- [ ] **Step 3: Implementar as colunas**

Criar `src/features/suppliers/utils/columns.ts`:

```ts
import { SUPPLIERS_STRINGS } from "../i18n/pt-BR";

/**
 * `supplier` is always visible — it is the row's identity. The rest can be
 * hidden from the header's right-click menu.
 *
 * The kit's `Em aberto`, `Vence` and `No prazo` columns are deliberately absent:
 * they need the `payable` entity. When it lands, add the ids here and the menu
 * picks them up with no other change.
 */
export type SupplierColumnId =
  | "supplier"
  | "terms"
  | "parts"
  | "purchases"
  | "completeness"
  | "contact";

export const OPTIONAL_COLUMNS = ["terms", "parts", "purchases", "completeness", "contact"] as const;

export type OptionalColumn = (typeof OPTIONAL_COLUMNS)[number];

export const COLUMN_LABELS: Record<SupplierColumnId, string> = {
  supplier: SUPPLIERS_STRINGS.columns.supplier,
  terms: SUPPLIERS_STRINGS.columns.terms,
  parts: SUPPLIERS_STRINGS.columns.parts,
  purchases: SUPPLIERS_STRINGS.columns.purchases,
  completeness: SUPPLIERS_STRINGS.columns.completeness,
  contact: SUPPLIERS_STRINGS.columns.contact,
};

export const DEFAULT_COLUMN_WIDTHS: Record<SupplierColumnId, number> = {
  supplier: 300,
  terms: 110,
  parts: 90,
  purchases: 130,
  completeness: 170,
  contact: 180,
};

const STORAGE_KEY = "gallo-suppliers-visible-columns";
/** Column widths use their own key, read by `useResizableColumns`. */
export const WIDTHS_STORAGE_KEY = "gallo-suppliers-column-widths";

export function readVisibleOptional(): OptionalColumn[] {
  if (typeof window === "undefined") return [...OPTIONAL_COLUMNS];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [...OPTIONAL_COLUMNS];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [...OPTIONAL_COLUMNS];
    return OPTIONAL_COLUMNS.filter((id) => parsed.includes(id));
  } catch {
    return [...OPTIONAL_COLUMNS];
  }
}

export function writeVisibleOptional(ids: readonly OptionalColumn[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // Private mode / quota — visibility is a preference, never a blocker.
  }
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

```bash
bun run test -- src/features/suppliers/utils/columns.test.ts
```

Esperado: PASS, 4 testes.

- [ ] **Step 5: Escrever o hook de stats em lote**

Criar `src/features/suppliers/hooks/useSuppliersStatsIndex.ts`:

```ts
import { useQuery } from "@tanstack/react-query";
import type { ID, ISupplierStats } from "@/shared/types";
import { useSuppliersProvider } from "@/providers/data";

/**
 * Stats for the whole visible list, as one query keyed by the id set.
 *
 * `stats` costs a catalog scan per supplier on the Supabase impl, so this is
 * only enabled while a column that needs it is visible — the same discipline
 * the catalog list applies to its turnover column.
 */
export function useSuppliersStatsIndex(ids: ID[], enabled: boolean) {
  const provider = useSuppliersProvider();
  const key = ids.join(",");

  const query = useQuery({
    queryKey: ["suppliers", "stats", key] as const,
    queryFn: async () => {
      const entries = await Promise.all(
        ids.map(async (id) => [id, await provider.stats(id)] as const),
      );
      return new Map<ID, ISupplierStats>(entries);
    },
    enabled: enabled && ids.length > 0,
    staleTime: 5 * 60_000,
  });

  return { index: query.data ?? null, isLoading: query.isLoading };
}
```

- [ ] **Step 6: Escrever a faixa de KPIs**

Criar `src/features/suppliers/components/list/SuppliersKpiStrip.tsx`:

```tsx
import type { ID, ISupplier, ISupplierStats } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { SUPPLIERS_STRINGS } from "../../i18n/pt-BR";

const COPY = SUPPLIERS_STRINGS.kpis;

interface ISuppliersKpiStripProps {
  suppliers: ISupplier[];
  statsIndex: Map<ID, ISupplierStats> | null;
  /** Clicking "Com CNPJ" filters the list down to the ones still missing it. */
  onFilterMissingDocument: () => void;
}

function brl(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function SuppliersKpiStrip({
  suppliers,
  statsIndex,
  onFilterMissingDocument,
}: ISuppliersKpiStripProps) {
  const active = suppliers.length;
  const withDocument = suppliers.filter((s) => Boolean(s.document)).length;
  const linkedParts = statsIndex
    ? Array.from(statsIndex.values()).reduce((sum, s) => sum + s.linkedParts, 0)
    : null;
  const purchases = statsIndex
    ? Array.from(statsIndex.values()).reduce((sum, s) => sum + s.purchasesLast12Months, 0)
    : null;
  const leadTimes = suppliers
    .map((s) => s.leadTimeDays)
    .filter((d): d is number => typeof d === "number");
  const avgLead = leadTimes.length
    ? Math.round(leadTimes.reduce((a, b) => a + b, 0) / leadTimes.length)
    : null;

  const cells: Array<{
    label: string;
    value: string;
    sub?: string;
    icon: string;
    accent?: boolean;
    onClick?: () => void;
  }> = [
    { label: COPY.active, value: String(active), icon: "mdi:domain" },
    {
      label: COPY.withDocument,
      value: `${withDocument}/${active}`,
      sub: withDocument < active ? COPY.withDocumentHint : undefined,
      icon: "mdi:card-account-details-outline",
      accent: withDocument < active,
      onClick: withDocument < active ? onFilterMissingDocument : undefined,
    },
    { label: COPY.linkedParts, value: linkedParts === null ? "—" : String(linkedParts), icon: "mdi:cog" },
    { label: COPY.purchases, value: purchases === null ? "—" : brl(purchases), icon: "mdi:package-variant" },
    {
      label: COPY.leadTime,
      value: avgLead === null ? "—" : `${avgLead} ${COPY.leadTimeUnit}`,
      icon: "mdi:timer-sand",
    },
  ];

  return (
    <div className="mb-4 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border md:grid-cols-5">
      {cells.map((cell) => {
        const Tag = cell.onClick ? "button" : "div";
        return (
          <Tag
            key={cell.label}
            {...(cell.onClick ? { type: "button" as const, onClick: cell.onClick } : {})}
            className={cn(
              "bg-card px-4 py-3 text-left",
              cell.onClick && "transition-colors hover:bg-accent",
            )}
          >
            <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              <Icon icon={cell.icon} size={13} />
              {cell.label}
            </span>
            <span
              className={cn(
                "mt-1 block text-2xl font-bold leading-none",
                cell.accent ? "text-severity-warning" : "text-foreground",
              )}
            >
              {cell.value}
            </span>
            {cell.sub && <span className="mt-1.5 block text-[11px] text-muted-foreground">{cell.sub}</span>}
          </Tag>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 7: Escrever a busca**

Criar `src/features/suppliers/components/list/SuppliersSearch.tsx`:

```tsx
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { SUPPLIERS_STRINGS } from "../../i18n/pt-BR";

const COPY = SUPPLIERS_STRINGS.search;

interface ISuppliersSearchProps {
  value: string;
  onChange: (value: string) => void;
}

/** The app-wide list search: dynamic width, `/` focus, `kbd` badge, `Escape` blurs. */
export function SuppliersSearch({ value, onChange }: ISuppliersSearchProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "/" || event.defaultPrevented) return;
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) return;
      event.preventDefault();
      inputRef.current?.focus();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div
      className={cn(
        "relative w-full flex-1 transition-[max-width] duration-300 ease-out motion-reduce:transition-none",
        focused ? "max-w-2xl" : "max-w-sm",
      )}
    >
      <Icon
        icon="mdi:magnify"
        size={16}
        className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        ref={inputRef}
        type="search"
        aria-label={COPY.label}
        placeholder={COPY.placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={(e) => {
          if (e.key === "Escape") e.currentTarget.blur();
        }}
        className="pl-8 pr-9"
      />
      <kbd
        className={cn(
          "pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground transition-opacity sm:flex",
          focused && "opacity-0",
        )}
      >
        /
      </kbd>
    </div>
  );
}
```

- [ ] **Step 8: Escrever a barra de filtros**

Criar `src/features/suppliers/components/list/SuppliersFiltersBar.tsx`:

```tsx
import type { ISupplier, SupplierCategory } from "@/shared/types";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { SUPPLIERS_STRINGS } from "../../i18n/pt-BR";
import { SuppliersSearch } from "./SuppliersSearch";

const COPY = SUPPLIERS_STRINGS;

export type SupplierSortBy = "name" | "parts" | "purchases" | "completeness";

export interface ISuppliersSort {
  by: SupplierSortBy;
  dir: "asc" | "desc";
}

const CATEGORIES: Array<SupplierCategory | "all"> = [
  "all",
  "parts",
  "services",
  "freight",
  "financial",
];

const SORTS: SupplierSortBy[] = ["name", "parts", "purchases", "completeness"];

interface ISuppliersFiltersBarProps {
  suppliers: ISupplier[];
  category: SupplierCategory | "all";
  onCategoryChange: (category: SupplierCategory | "all") => void;
  search: string;
  onSearchChange: (value: string) => void;
  sort: ISuppliersSort;
  onSortChange: (sort: ISuppliersSort) => void;
  canCreate: boolean;
  onCreate: () => void;
}

export function SuppliersFiltersBar({
  suppliers,
  category,
  onCategoryChange,
  search,
  onSearchChange,
  sort,
  onSortChange,
  canCreate,
  onCreate,
}: ISuppliersFiltersBarProps) {
  const countFor = (key: SupplierCategory | "all") =>
    key === "all" ? suppliers.length : suppliers.filter((s) => s.category === key).length;

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      {CATEGORIES.map((key) => {
        const on = category === key;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onCategoryChange(key)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
              on
                ? "border-primary/50 bg-primary/15 text-foreground"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {COPY.categories[key === "all" ? "all" : key]}
            <span className="ml-1.5 text-muted-foreground">{countFor(key)}</span>
          </button>
        );
      })}

      <div className="ml-auto flex shrink-0 items-center gap-2">
        <SuppliersSearch value={search} onChange={onSearchChange} />
        <div className="flex shrink-0 items-center gap-0.5 rounded-lg border border-border p-0.5">
          {SORTS.map((by) => (
            <button
              key={by}
              type="button"
              onClick={() =>
                onSortChange({
                  by,
                  dir: sort.by === by && sort.dir === "desc" ? "asc" : "desc",
                })
              }
              className={cn(
                "rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors",
                sort.by === by
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {COPY.sort[by]}
            </button>
          ))}
        </div>
        {canCreate && (
          <Button size="sm" className="shrink-0" onClick={onCreate}>
            <Icon icon="mdi:plus" size={16} />
            {COPY.actions.create}
          </Button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 9: Escrever o menu de colunas**

Criar `src/features/suppliers/components/list/SuppliersColumnsMenu.tsx`, seguindo `src/features/catalog/components/list/CatalogColumnsMenu.tsx` como referência literal — mesmos componentes shadcn, trocando `OPTIONAL_COLUMNS`/`COLUMN_LABELS` pelos de `../../utils/columns` e o texto para:

```tsx
import {
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
} from "@/components/ui/context-menu";
import { COLUMN_LABELS, OPTIONAL_COLUMNS, type OptionalColumn } from "../../utils/columns";

interface IColumnsMenuProps {
  visible: Set<OptionalColumn>;
  onToggle: (id: OptionalColumn) => void;
  onShowAll: () => void;
}

/** Right-click on the table header — the app's standard place for this menu. */
export function SuppliersColumnsContextContent({
  visible,
  onToggle,
  onShowAll,
}: IColumnsMenuProps) {
  return (
    <ContextMenuContent className="w-52">
      <ContextMenuLabel>Colunas visíveis</ContextMenuLabel>
      <ContextMenuSeparator />
      {OPTIONAL_COLUMNS.map((id) => (
        <ContextMenuCheckboxItem
          key={id}
          checked={visible.has(id)}
          onCheckedChange={() => onToggle(id)}
          onSelect={(e) => e.preventDefault()}
        >
          {COLUMN_LABELS[id]}
        </ContextMenuCheckboxItem>
      ))}
      <ContextMenuSeparator />
      <ContextMenuItem onSelect={onShowAll}>Exibir todas</ContextMenuItem>
    </ContextMenuContent>
  );
}
```

- [ ] **Step 10: Escrever a tabela**

Criar `src/features/suppliers/components/list/SuppliersTable.tsx`:

```tsx
import type { ID, ISupplier, ISupplierStats } from "@/shared/types";
import { ContextMenu, ContextMenuTrigger } from "@/components/ui/context-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { useResizableColumns } from "@/shared/hooks/useResizableColumns";
import { cn } from "@/lib/utils";
import { supplierCompleteness } from "../../engine/completeness";
import { SUPPLIER_MISSING_LABELS } from "../../engine/completeness";
import {
  COLUMN_LABELS,
  DEFAULT_COLUMN_WIDTHS,
  OPTIONAL_COLUMNS,
  WIDTHS_STORAGE_KEY,
  type OptionalColumn,
  type SupplierColumnId,
} from "../../utils/columns";
import { SUPPLIERS_STRINGS } from "../../i18n/pt-BR";
import { SuppliersColumnsContextContent } from "./SuppliersColumnsMenu";

const COPY = SUPPLIERS_STRINGS;

const CATEGORY_LABEL: Record<ISupplier["category"], string> = {
  parts: COPY.categories.parts,
  services: COPY.categories.services,
  freight: COPY.categories.freight,
  financial: COPY.categories.financial,
};

function initials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((word) => word.charAt(0))
    .join("")
    .toUpperCase();
}

function brl(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

interface ISuppliersTableProps {
  suppliers: ISupplier[];
  statsIndex: Map<ID, ISupplierStats> | null;
  isLoading: boolean;
  selectedId: ID | null;
  onSelect: (id: ID) => void;
  visibleColumns: Set<OptionalColumn>;
  onToggleColumn: (id: OptionalColumn) => void;
  onShowAllColumns: () => void;
  /** Exposes the inner scroll container to the header progress line. */
  scrollRef?: (el: HTMLDivElement | null) => void;
}

export function SuppliersTable({
  suppliers,
  statsIndex,
  isLoading,
  selectedId,
  onSelect,
  visibleColumns,
  onToggleColumn,
  onShowAllColumns,
  scrollRef,
}: ISuppliersTableProps) {
  const columns: SupplierColumnId[] = [
    "supplier",
    ...OPTIONAL_COLUMNS.filter((id) => visibleColumns.has(id)),
  ];
  const { widths, startResize } = useResizableColumns(
    columns.map((id) => ({ id, defaultWidth: DEFAULT_COLUMN_WIDTHS[id] })),
    WIDTHS_STORAGE_KEY,
  );

  const gridTemplate = columns.map((id) => `${widths[id]}px`).join(" ");

  return (
    <div ref={scrollRef} className="overflow-auto rounded-xl border border-border bg-card">
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            className="sticky top-0 z-10 grid border-b border-border bg-muted/40"
            style={{ gridTemplateColumns: gridTemplate }}
          >
            {columns.map((id, index) => (
              <span
                key={id}
                className={cn(
                  "relative px-4 py-2.5 text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground",
                  // Vertical delimiters live in the header only.
                  index > 0 && "border-l border-border",
                  (id === "parts" || id === "purchases") && "text-right",
                )}
              >
                {COLUMN_LABELS[id]}
                <span
                  role="separator"
                  aria-orientation="vertical"
                  onPointerDown={(e) => startResize(id, e)}
                  className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-primary/40"
                />
              </span>
            ))}
          </div>
        </ContextMenuTrigger>
        <SuppliersColumnsContextContent
          visible={visibleColumns}
          onToggle={onToggleColumn}
          onShowAll={onShowAllColumns}
        />
      </ContextMenu>

      {isLoading
        ? Array.from({ length: 10 }, (_, i) => (
            <div key={i} className="border-b border-border px-4 py-3">
              <Skeleton className="h-6 w-full" />
            </div>
          ))
        : suppliers.map((supplier) => {
            const stats = statsIndex?.get(supplier.id) ?? null;
            const completeness = supplierCompleteness(supplier);
            const selected = supplier.id === selectedId;
            return (
              <div
                key={supplier.id}
                role="button"
                tabIndex={0}
                onClick={() => onSelect(supplier.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") onSelect(supplier.id);
                }}
                className={cn(
                  "grid cursor-pointer items-center border-b border-border transition-colors",
                  selected ? "bg-primary/10" : "hover:bg-accent/50",
                )}
                style={{ gridTemplateColumns: gridTemplate }}
              >
                {columns.map((id) => {
                  switch (id) {
                    case "supplier":
                      return (
                        <span key={id} className="flex min-w-0 items-center gap-2.5 px-4 py-2.5">
                          <span className="grid size-7 shrink-0 place-items-center rounded-md bg-primary/15 text-[11px] font-bold text-primary">
                            {initials(supplier.name)}
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate text-[13px] font-semibold text-foreground">
                              {supplier.name}
                            </span>
                            <span className="block truncate text-[11px] text-muted-foreground">
                              {CATEGORY_LABEL[supplier.category]}
                              {supplier.leadTimeDays !== undefined &&
                                ` · entrega em ${supplier.leadTimeDays} d`}
                            </span>
                          </span>
                        </span>
                      );
                    case "terms":
                      return (
                        <span key={id} className="truncate px-4 py-2.5 text-xs text-muted-foreground">
                          {supplier.paymentTerms ?? "—"}
                        </span>
                      );
                    case "parts":
                      return (
                        <span key={id} className="px-4 py-2.5 text-right text-xs text-muted-foreground">
                          {stats ? stats.linkedParts : "—"}
                        </span>
                      );
                    case "purchases":
                      return (
                        <span
                          key={id}
                          className="px-4 py-2.5 text-right text-[13px] font-bold text-foreground"
                        >
                          {stats ? brl(stats.purchasesLast12Months) : "—"}
                        </span>
                      );
                    case "completeness":
                      return (
                        <span key={id} className="flex items-center gap-2 px-4 py-2.5">
                          <span className="h-1.5 w-9 shrink-0 overflow-hidden rounded-full bg-muted">
                            <span
                              className={cn(
                                "block h-full",
                                completeness.percent >= 80
                                  ? "bg-severity-success"
                                  : completeness.percent >= 40
                                    ? "bg-severity-warning"
                                    : "bg-severity-critical",
                              )}
                              style={{ width: `${completeness.percent}%` }}
                            />
                          </span>
                          <span className="truncate text-[11px] text-muted-foreground">
                            {completeness.missing.length === 0
                              ? COPY.complete
                              : SUPPLIER_MISSING_LABELS[completeness.missing[0]]}
                          </span>
                        </span>
                      );
                    case "contact":
                      return (
                        <span key={id} className="truncate px-4 py-2.5 text-xs text-muted-foreground">
                          {supplier.contactName ?? supplier.contactPhone ?? "—"}
                        </span>
                      );
                  }
                })}
              </div>
            );
          })}

      {!isLoading && suppliers.length === 0 && (
        <div className="px-4 py-16 text-center">
          <p className="text-sm text-foreground">{COPY.empty.list}</p>
          <p className="mt-1 text-xs text-muted-foreground">{COPY.empty.listHint}</p>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 11: Montar tudo na página**

Reescrever `src/features/suppliers/pages/SuppliersListPage.tsx` para: estado de `search`/`category`/`sort`/`selectedId`/`visibleColumns`; `useSuppliersList`; `useSuppliersStatsIndex(ids, visibleColumns.has("parts") || visibleColumns.has("purchases"))`; ordenação aplicada sobre `visible`; `ScrollProgressBar` com `container={scrollEl}` alimentado pelo `scrollRef` da tabela; header glassmorphism com `SuppliersKpiStrip` e `SuppliersFiltersBar`; grid `minmax(0,1fr) 366px` reservando a coluna do rail (preenchida na Task 7); `usePermission("supplier", "create")` alimentando `canCreate`.

Regras que a montagem tem que respeitar:
- a coluna da tabela precisa de `min-w-0`, senão a ficha é empurrada para fora da tela;
- `ScrollProgressBar` vai num "seam" `relative` de altura zero imediatamente antes do container rolável;
- nunca adicionar `relative` a um elemento que já é `sticky`.

- [ ] **Step 12: Rodar testes e build**

```bash
bun run test && bun run build
```
Esperado: PASS + build limpo.

- [ ] **Step 13: Commit**

```bash
git add src/features/suppliers
git commit -m "feat(suppliers): add KPI strip, filters, standard search and resizable table"
```

---

### Task 7: Ficha lateral (rail)

**Files:**
- Create: `src/features/suppliers/components/list/SupplierRail.tsx`
- Modify: `src/features/suppliers/pages/SuppliersListPage.tsx`

**Interfaces:**
- Consumes: `ISupplier`, `ISupplierStats`, `supplierCompleteness`, `SUPPLIERS_STRINGS`.
- Produces: `SupplierRail` — props `{ supplier: ISupplier | null; stats: ISupplierStats | null; onOpenSheet: () => void; onEdit: () => void; canEdit: boolean }`.

- [ ] **Step 1: Escrever o rail**

Criar `src/features/suppliers/components/list/SupplierRail.tsx`. Estrutura fiel ao kit (`fin-fornecedores.jsx`, bloco "ficha do fornecedor"): card de identidade com iniciais, nome, chips de categoria e condição; quatro métricas em grade 2×2 (Em aberto **não** entra — vira Peças vinculadas); card "O que compramos" com chips; card "Últimas entradas" com as notas reais. Dois botões no rodapé do primeiro card: `Ficha completa` (primário, largura total) e um ícone de editar.

```tsx
import type { ISupplier, ISupplierStats } from "@/shared/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { supplierCompleteness } from "../../engine/completeness";
import { SUPPLIERS_STRINGS } from "../../i18n/pt-BR";

const COPY = SUPPLIERS_STRINGS;

const CATEGORY_LABEL: Record<ISupplier["category"], string> = {
  parts: COPY.categories.parts,
  services: COPY.categories.services,
  freight: COPY.categories.freight,
  financial: COPY.categories.financial,
};

function initials(name: string): string {
  return name.split(" ").slice(0, 2).map((w) => w.charAt(0)).join("").toUpperCase();
}

function brl(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function Metric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="min-w-0">
      <span className="block text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span className="mt-1 block truncate text-lg font-bold leading-none text-foreground">
        {value}
      </span>
      {sub && <span className="mt-1.5 block truncate text-[11px] text-muted-foreground">{sub}</span>}
    </div>
  );
}

interface ISupplierRailProps {
  supplier: ISupplier | null;
  stats: ISupplierStats | null;
  canEdit: boolean;
  onOpenSheet: () => void;
  onEdit: () => void;
}

export function SupplierRail({ supplier, stats, canEdit, onOpenSheet, onEdit }: ISupplierRailProps) {
  if (!supplier) {
    return (
      <aside className="sticky top-20 rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
        Selecione um fornecedor para ver a ficha.
      </aside>
    );
  }

  const completeness = supplierCompleteness(supplier);

  return (
    <aside className="sticky top-20 grid gap-3">
      <section className="rounded-xl border border-border bg-card p-4">
        <div className="mb-3.5 flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/15 text-sm font-bold text-primary">
            {initials(supplier.name)}
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-base font-bold leading-tight text-foreground">
              {supplier.name}
            </h2>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <Badge variant="secondary">{CATEGORY_LABEL[supplier.category]}</Badge>
              {supplier.paymentTerms && <Badge variant="outline">{supplier.paymentTerms}</Badge>}
              {supplier.source === "manual" && completeness.percent === 0 && (
                <Badge>{COPY.newBadge}</Badge>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3.5 border-t border-border pt-3.5">
          <Metric label={COPY.kpis.linkedParts} value={stats ? String(stats.linkedParts) : "—"} />
          <Metric
            label={COPY.kpis.purchases}
            value={stats ? brl(stats.purchasesLast12Months) : "—"}
          />
          <Metric
            label={COPY.kpis.leadTime}
            value={
              supplier.leadTimeDays === undefined
                ? "—"
                : `${supplier.leadTimeDays} ${COPY.kpis.leadTimeUnit}`
            }
          />
          <Metric
            label={COPY.columns.contact}
            value={supplier.contactName ?? "—"}
            sub={supplier.contactPhone}
          />
        </div>

        <div className="mt-4 flex gap-2">
          <Button size="sm" className="flex-1" onClick={onOpenSheet}>
            <Icon icon="mdi:arrow-expand" size={15} />
            {COPY.actions.fullSheet}
          </Button>
          {canEdit && (
            <Button size="sm" variant="outline" onClick={onEdit} aria-label={COPY.actions.edit}>
              <Icon icon="mdi:pencil" size={15} />
            </Button>
          )}
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card">
        <h3 className="flex items-center gap-2 border-b border-border px-4 py-3 text-[13px] font-bold text-foreground">
          <Icon icon="mdi:package-variant" size={15} className="text-muted-foreground" />
          O que compramos
        </h3>
        <div className="flex flex-wrap gap-1.5 p-4">
          {supplier.suppliedItems.length ? (
            supplier.suppliedItems.map((item) => (
              <Badge key={item} variant="outline">
                {item}
              </Badge>
            ))
          ) : (
            <p className="text-xs text-muted-foreground">{COPY.empty.items}</p>
          )}
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card">
        <h3 className="flex items-center gap-2 border-b border-border px-4 py-3 text-[13px] font-bold text-foreground">
          <Icon icon="mdi:file-document-outline" size={15} className="text-muted-foreground" />
          Últimas entradas
        </h3>
        <div className="p-4">
          {stats?.lastEntries.length ? (
            <ul className="grid">
              {stats.lastEntries.slice(0, 4).map((entry, index) => (
                <li
                  key={`${entry.partId}-${entry.invoiceNumber ?? index}`}
                  className="flex items-center gap-2.5 border-b border-border py-2 last:border-b-0"
                >
                  <span className="w-16 shrink-0 text-[11px] text-muted-foreground">
                    {entry.invoiceDate
                      ? new Date(entry.invoiceDate).toLocaleDateString("pt-BR", {
                          day: "2-digit",
                          month: "2-digit",
                        })
                      : "—"}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                    {entry.invoiceNumber ?? entry.partName}
                  </span>
                  <span className="shrink-0 text-xs font-bold text-foreground">
                    {brl(entry.cost * (entry.quantity || 1))}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">{COPY.empty.entries}</p>
          )}
        </div>
      </section>
    </aside>
  );
}
```

- [ ] **Step 2: Ligar o rail na página**

Em `SuppliersListPage.tsx`: preencher a segunda coluna do grid com `<SupplierRail>`, alimentado por `visible.find((s) => s.id === selectedId) ?? visible[0] ?? null` e por `statsIndex?.get(selected.id) ?? null`. Selecionar a primeira linha automaticamente quando a lista carrega e nada está selecionado.

- [ ] **Step 3: Rodar testes e build**

```bash
bun run test && bun run build
```
Esperado: PASS + build limpo.

- [ ] **Step 4: Commit**

```bash
git add src/features/suppliers
git commit -m "feat(suppliers): add the supplier rail with real entries and supplied items"
```

---

### Task 8: Modal Novo fornecedor (CNPJ-primeiro) e edição

**Files:**
- Create: `src/features/suppliers/engine/supplierForm.ts`
- Create: `src/features/suppliers/engine/supplierForm.test.ts`
- Create: `src/features/suppliers/hooks/useSupplierMutations.ts`
- Create: `src/features/suppliers/components/detail/SupplierFormDialog.tsx`
- Modify: `src/features/suppliers/pages/SuppliersListPage.tsx`

**Interfaces:**
- Consumes: `useMinhaReceita` e `ICnpjCompany` de `@/features/customers/hooks/useMinhaReceita`; `isValidCnpj`, `formatCnpj`, `onlyDigits`, `formatPhone` de `@/features/customers/utils/cnpjCpf`; `ICreateSupplierInput`/`IUpdateSupplierPatch` (Task 4).
- Produces:
  - `SupplierDocState` = `"idle" | "typing" | "invalid" | "loading" | "duplicate" | "notfound" | "error" | "done"`
  - `resolveSupplierDocState(input): SupplierDocState`
  - `canSaveSupplier(input): boolean`
  - `useSupplierMutations(): { create, update, archive }`
  - `SupplierFormDialog` — props `{ open: boolean; supplier: ISupplier | null; onClose: () => void; onSaved: (s: ISupplier) => void }`

- [ ] **Step 1: Escrever o teste do estado do documento (falha)**

Criar `src/features/suppliers/engine/supplierForm.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { canSaveSupplier, resolveSupplierDocState } from "./supplierForm";

const base = {
  digits: "",
  pending: false,
  cnpjStatus: "idle" as const,
  duplicateFound: false,
};

describe("resolveSupplierDocState", () => {
  it("is idle with nothing typed", () => {
    expect(resolveSupplierDocState(base)).toBe("idle");
  });

  it("is typing while the document is incomplete", () => {
    expect(resolveSupplierDocState({ ...base, digits: "330001" })).toBe("typing");
  });

  it("is invalid when the check digits do not add up", () => {
    expect(resolveSupplierDocState({ ...base, digits: "33000167000100" })).toBe("invalid");
  });

  it("is loading while a lookup is in flight", () => {
    expect(
      resolveSupplierDocState({ ...base, digits: "33000167000101", cnpjStatus: "loading" }),
    ).toBe("loading");
  });

  it("is loading while the debounce has not caught up", () => {
    expect(
      resolveSupplierDocState({
        ...base,
        digits: "33000167000101",
        pending: true,
        cnpjStatus: "success",
      }),
    ).toBe("loading");
  });

  it("lets a duplicate outrank a successful lookup", () => {
    expect(
      resolveSupplierDocState({
        ...base,
        digits: "33000167000101",
        cnpjStatus: "success",
        duplicateFound: true,
      }),
    ).toBe("duplicate");
  });

  it("is error when the Receita mirror is unreachable", () => {
    expect(
      resolveSupplierDocState({ ...base, digits: "33000167000101", cnpjStatus: "error" }),
    ).toBe("error");
  });
});

describe("canSaveSupplier", () => {
  it("allows saving with a name and no document at all", () => {
    expect(canSaveSupplier({ name: "Retífica Alto Uruguai", docState: "idle" })).toBe(true);
  });

  it("blocks a name shorter than three characters", () => {
    expect(canSaveSupplier({ name: "AB", docState: "idle" })).toBe(false);
  });

  it("blocks while a lookup is in flight", () => {
    expect(canSaveSupplier({ name: "Fornecedor", docState: "loading" })).toBe(false);
  });

  it("blocks a duplicate CNPJ", () => {
    expect(canSaveSupplier({ name: "Fornecedor", docState: "duplicate" })).toBe(false);
  });

  it("blocks an invalid CNPJ", () => {
    expect(canSaveSupplier({ name: "Fornecedor", docState: "invalid" })).toBe(false);
  });

  it("allows saving when the Receita is unreachable", () => {
    expect(canSaveSupplier({ name: "Fornecedor", docState: "error" })).toBe(true);
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

```bash
bun run test -- src/features/suppliers/engine/supplierForm.test.ts
```

Esperado: FAIL — `Failed to resolve import "./supplierForm"`.

- [ ] **Step 3: Implementar o estado do formulário**

Criar `src/features/suppliers/engine/supplierForm.ts`:

```ts
import type { CnpjLookupStatus } from "@/features/customers/hooks/useMinhaReceita";
import { isValidCnpj } from "@/features/customers/utils/cnpjCpf";

/**
 * State of the CNPJ field on the supplier form. Mirrors the customer form's
 * `newCustomerLookup` — same precedence, minus the CPF branch (a supplier is
 * always a company) and minus the manual-fill escape (the Receita being down
 * never blocks a supplier, so there is nothing to escape from).
 */
export type SupplierDocState =
  | "idle"
  | "typing"
  | "invalid"
  | "loading"
  | "duplicate"
  | "notfound"
  | "error"
  | "done";

export interface ISupplierDocInput {
  /** Document digits, unmasked. */
  digits: string;
  /**
   * The debounced lookups haven't caught up with what's typed. While true,
   * `cnpjStatus` and `duplicateFound` still describe the PREVIOUS document.
   */
  pending: boolean;
  cnpjStatus: CnpjLookupStatus;
  duplicateFound: boolean;
}

export function resolveSupplierDocState(input: ISupplierDocInput): SupplierDocState {
  if (!input.digits) return "idle";
  if (input.digits.length < 14) return "typing";
  if (!isValidCnpj(input.digits)) return "invalid";
  if (input.pending || input.cnpjStatus === "loading") return "loading";
  if (input.duplicateFound) return "duplicate";
  if (input.cnpjStatus === "invalid") return "notfound";
  if (input.cnpjStatus === "error") return "error";
  if (input.cnpjStatus === "success") return "done";
  return "loading";
}

export const SUPPLIER_DOC_MESSAGES: Record<SupplierDocState, string> = {
  idle: "Digite o CNPJ — razão social e endereço vêm da Receita Federal.",
  typing: "A consulta dispara ao completar os 14 dígitos.",
  invalid: "CNPJ inválido — confira os dígitos.",
  loading: "Consultando a Receita Federal…",
  duplicate: "Este CNPJ já está cadastrado como fornecedor.",
  notfound: "CNPJ não encontrado na Receita — preencha manualmente.",
  error: "Consulta indisponível agora — preencha manualmente, sem bloqueio.",
  done: "Dados públicos da Receita Federal aplicados ao cadastro.",
};

export function canSaveSupplier(input: { name: string; docState: SupplierDocState }): boolean {
  if (input.name.trim().length < 3) return false;
  return !["loading", "duplicate", "invalid"].includes(input.docState);
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

```bash
bun run test -- src/features/suppliers/engine/supplierForm.test.ts
```

Esperado: PASS, 13 testes.

- [ ] **Step 5: Escrever as mutações**

Criar `src/features/suppliers/hooks/useSupplierMutations.ts`:

```ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { ID, ISupplier } from "@/shared/types";
import type { ICreateSupplierInput, IUpdateSupplierPatch } from "@/providers/data";
import { useSuppliersProvider } from "@/providers/data";

export function useSupplierMutations() {
  const provider = useSuppliersProvider();
  const queryClient = useQueryClient();

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["suppliers"] });

  const create = useMutation<ISupplier, Error, ICreateSupplierInput>({
    mutationFn: (input) => provider.create(input),
    onSuccess: (supplier) => {
      void invalidate();
      toast.success(`Fornecedor ${supplier.name} cadastrado.`);
    },
    onError: (error) => toast.error(error.message),
  });

  const update = useMutation<ISupplier, Error, { id: ID; patch: IUpdateSupplierPatch }>({
    mutationFn: ({ id, patch }) => provider.update(id, patch),
    onSuccess: () => {
      void invalidate();
      toast.success("Cadastro atualizado.");
    },
    onError: (error) => toast.error(error.message),
  });

  const archive = useMutation<ISupplier, Error, ID>({
    mutationFn: (id) => provider.archive(id),
    onSuccess: (supplier) => {
      void invalidate();
      toast.success(`${supplier.name} desativado.`);
    },
    onError: (error) => toast.error(error.message),
  });

  return { create, update, archive };
}
```

- [ ] **Step 6: Escrever o diálogo**

Criar `src/features/suppliers/components/detail/SupplierFormDialog.tsx`. Um só componente serve cadastro e edição (`supplier === null` ⇒ cadastro). Requisitos:

- Campo CNPJ em primeiro lugar, `autoFocus`, com máscara `formatCnpj`, adorno à direita que troca por estado (`spinner` / `mdi:check-decagram` / `mdi:alert-circle`) e a linha de status vinda de `SUPPLIER_DOC_MESSAGES[docState]`.
- Debounce de 380 ms antes de chamar `lookup(digits)` do `useMinhaReceita`; guarda de duplicado consultando `provider.list({ search: digits, pageSize: 1 })`.
- No `success`, preencher **apenas campos vazios**: razão social ← `data.razaoSocial`, nome fantasia ← `data.nomeFantasia`, telefone ← `data.telefone`, cidade/UF ← `data.endereco`, e gravar `registryStatus` / `registryActivity`.
- Demais campos: Razão social (2 col), Categoria (select com as quatro), Condição de pagamento (select: `à vista`, `14 dias`, `28 dias`, `30 dias`, `45 dias`, `30/60`, `30/60/90`), Prazo de entrega em dias (numérico), Forma preferida (select), Contato (2 col), Telefone, O que fornece (3 col, separado por vírgula).
- Rodapé: à esquerda a frase de estado (`Entra na lista como fornecedor novo, sem histórico` quando `canSave`, senão `Informe o CNPJ ou a razão social`); à direita `Cancelar` e `Salvar fornecedor`, este último desabilitado por `!canSaveSupplier(...)`.
- Usar `Dialog` de `@/components/ui/dialog`, `Input`, `Select`, `Button` e `Label` do shadcn — nada de `<div>` com `position: fixed` à mão.

- [ ] **Step 7: Ligar na página**

Em `SuppliersListPage.tsx`: estado `formOpen: boolean` e `editing: ISupplier | null`; o botão `Novo fornecedor` abre com `editing = null`; o botão de editar do rail abre com o fornecedor selecionado; `onSaved` fecha o diálogo e seleciona o registro salvo.

- [ ] **Step 8: Rodar testes e build**

```bash
bun run test && bun run build
```
Esperado: PASS + build limpo.

- [ ] **Step 9: Commit**

```bash
git add src/features/suppliers
git commit -m "feat(suppliers): add CNPJ-first supplier form with Receita lookup and duplicate guard"
```

---

### Task 9: Gaveta "Ficha completa"

**Files:**
- Create: `src/features/suppliers/components/detail/SupplierSheet.tsx`
- Create: `src/features/suppliers/components/detail/SupplierPurchasesChart.tsx`
- Modify: `src/features/suppliers/pages/SuppliersListPage.tsx`

**Interfaces:**
- Consumes: `ISupplier`, `ISupplierStats`, `SUPPLIERS_STRINGS`, `useSupplierMutations` (Task 8).
- Produces:
  - `SupplierSheet` — props `{ supplier: ISupplier | null; stats: ISupplierStats | null; open: boolean; onClose: () => void; onEdit: () => void; canEdit: boolean }`
  - `SupplierPurchasesChart` — props `{ monthly: number[] }`

- [ ] **Step 1: Escrever o gráfico de compras**

Criar `src/features/suppliers/components/detail/SupplierPurchasesChart.tsx`. SVG puro, doze barras, a última destacada com `fill-primary` e as demais `fill-primary/35`; eixo com as iniciais dos meses; `role="img"` e `aria-label` descrevendo o total. Quando todos os valores forem zero, o componente **não** é renderizado — quem decide é a gaveta.

```tsx
const MONTH_INITIALS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];

interface ISupplierPurchasesChartProps {
  /** 12 positions, oldest → newest. */
  monthly: number[];
}

export function SupplierPurchasesChart({ monthly }: ISupplierPurchasesChartProps) {
  const max = Math.max(...monthly, 1);
  const total = monthly.reduce((a, b) => a + b, 0);
  const now = new Date();
  const labels = monthly.map((_, index) => {
    const month = new Date(now.getFullYear(), now.getMonth() - (11 - index), 1);
    return MONTH_INITIALS[month.getMonth()];
  });

  return (
    <svg
      viewBox="0 0 360 120"
      className="h-[170px] w-full"
      role="img"
      aria-label={`Compras dos últimos 12 meses, total de ${total.toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
      })}`}
    >
      {monthly.map((value, index) => {
        const height = (value / max) * 90;
        return (
          <rect
            key={index}
            x={index * 30 + 6}
            y={100 - height}
            width={18}
            height={height}
            rx={2}
            className={index === monthly.length - 1 ? "fill-primary" : "fill-primary/35"}
          />
        );
      })}
      {labels.map((label, index) => (
        <text
          key={index}
          x={index * 30 + 15}
          y={114}
          textAnchor="middle"
          className="fill-muted-foreground text-[9px]"
        >
          {label}
        </text>
      ))}
    </svg>
  );
}
```

- [ ] **Step 2: Escrever a gaveta**

Criar `src/features/suppliers/components/detail/SupplierSheet.tsx` com `Sheet`/`SheetContent side="right"` de `@/components/ui/sheet`, largura `sm:max-w-[600px]`. Ordem das seções, fiel ao kit:

1. **Cabeçalho** — iniciais, nome, chips de categoria/condição e, quando `source === "manual"` sem histórico, o chip `Novo · sem histórico`.
2. **Grade 3×2 de fatos** — Peças vinculadas · Compras 12 meses · Prazo de entrega · Cadastro (percentual) · CNPJ (formatado, ou `—`) · Situação na Receita.
3. **Compras mês a mês** — `SupplierPurchasesChart` quando `stats.purchasesLast12Months > 0`; caso contrário `COPY.empty.purchases`.
4. **Títulos em aberto** — sempre o estado explícito `COPY.empty.payables`, com ícone `mdi:information-outline`. Este bloco não tem dado por ora e diz isso com todas as letras.
5. **Últimas entradas** (coluna esquerda) e **O que compramos** (coluna direita), em grid 2×1.
6. **Rodapé** — `Novo pedido de compra` e `Agendar pagamentos` **desabilitados**, cada um com `title` explicando a razão ("Depende do contas a pagar, que ainda não existe"), e `Editar cadastro` habilitado conforme `canEdit`.

- [ ] **Step 3: Ligar na página**

Em `SuppliersListPage.tsx`: estado `sheetOpen`; o botão `Ficha completa` do rail abre; `onEdit` da gaveta fecha a gaveta e abre `SupplierFormDialog` com o fornecedor.

- [ ] **Step 4: Rodar testes e build**

```bash
bun run test && bun run build
```
Esperado: PASS + build limpo.

- [ ] **Step 5: Verificar o delta de tipos**

```bash
bunx tsc --noEmit 2>&1 | grep "src/features/suppliers"
```
Esperado: nenhuma linha. O baseline pré-existente do projeto continua lá; o que importa é o delta.

- [ ] **Step 6: Commit**

```bash
git add src/features/suppliers
git commit -m "feat(suppliers): add the full supplier sheet with purchases chart"
```

---

### Task 10: CHANGELOG e fechamento

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `package.json` (bump de versão)

- [ ] **Step 1: Checar corrida de versão**

```bash
gh pr list --state open --json number,title --jq '.[] | "\(.number) \(.title)"'
```

Ler os PRs abertos e verificar se algum já reserva o próximo número de versão. Se sim, pegar o seguinte. Confirmar a versão atual:

```bash
node -p "require('./package.json').version"
```

- [ ] **Step 2: Escrever a entrada do CHANGELOG**

Adicionar no topo de `CHANGELOG.md`, com a versão MINOR seguinte e a data de hoje (o codinome atual permanece em PATCH; sendo MINOR, escolher um codinome novo em inglês que ainda não esteja em `git tag -l`):

```markdown
## [X.Y.0] - 2026-08-17 - <Codename>

### Added
- Grupo **FINANCEIRO** na barra lateral, entre Comercial e SDR: nasce com Fornecedores e recebe Fluxo de Caixa, Despesas, Comissões e DRE Gerencial, que saíram de Gestão. As URLs dos quatro itens movidos não mudaram.
- Tela de **Fornecedores** (`/app/financeiro/fornecedores`): lista com faixa de indicadores, filtro por categoria, ordenação, busca padrão e colunas redimensionáveis; ficha lateral com o que se compra e as últimas notas de entrada; ficha completa em gaveta com o histórico de compras mês a mês.
- Cadastro de fornecedor **CNPJ-primeiro** — a consulta à Receita Federal preenche razão social, telefone e cidade sozinha, com guarda de CNPJ duplicado.
- Fornecedor como entidade real: tabela `suppliers` com RLS, recurso RBAC `supplier` (Owner, Gestor e Financeiro) e carga inicial a partir dos nomes que já estavam soltos no catálogo.

### Changed
- Gestão passa a concentrar só o analítico comercial; o financeiro tem grupo próprio.
```

- [ ] **Step 3: Bump da versão**

Editar `package.json` alterando só o campo `version` para `X.Y.0`.

- [ ] **Step 4: Rodar o gate completo**

```bash
bun run test && bun run build
```
Esperado: PASS + build limpo.

- [ ] **Step 5: Commit e push**

```bash
git add CHANGELOG.md package.json
git commit -m "chore(release): vX.Y.0 <Codename>"
git push
```

- [ ] **Step 6: Abrir o PR**

```bash
gh pr create --title "feat(financeiro): grupo FINANCEIRO na sidebar e tela de Fornecedores" --body "$(cat <<'EOF'
Fatia 1 do ui_kit `financeiro`: o grupo novo na barra lateral e a tela de Fornecedores completa.

Spec: `docs/superpowers/specs/2026-08-17-financeiro-fornecedores-design.md`
Plano: `docs/superpowers/plans/2026-08-17-financeiro-fornecedores.md`

## Pendências que este PR NÃO resolve

- **A migration `20260817120000_create_suppliers_table.sql` não foi aplicada.** Sem ela a tela abre vazia e o item some do menu — o app hidrata o RBAC do banco, não da matriz TypeScript. A aplicação em produção é manual e depende do seu OK.
- As outras nove telas do kit financeiro (Contas a receber, Contas a pagar, Previsibilidade, KPIs, Gráficos) continuam fora.
- `parts.supplier_id` continua não existindo: o vínculo peça↔fornecedor é por nome normalizado.
- Falta smoke humano.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-Review

**Cobertura do spec:**

| Requisito do spec | Task |
|---|---|
| `ISupplier` + `ISupplierStats` | 1 |
| Engines de normalização e completude, testados | 1 |
| Migration: tabela, RLS, seed RBAC, backfill com faxina | 2 |
| Recurso RBAC no código (Owner/Gestor/Financeiro) | 3 |
| Contrato + mock + Supabase + factory + barrel | 4 |
| `stats` derivado de `parts.suppliers` | 4 |
| Grupo FINANCEIRO entre Comercial e SDR, 4 itens movidos, URLs preservadas | 5 |
| Rota `/app/financeiro/fornecedores` com gate só por `permission` | 5 |
| Faixa de 5 KPIs remontada | 6 |
| Chips de categoria, ordenação, busca padrão | 6 |
| Colunas redimensionáveis + menu no clique-direito | 6 |
| Barra de OTIF reaproveitada para completude | 6 |
| Lista como fila de enriquecimento | 6 |
| Rail 366px com "O que compramos" e "Últimas entradas" | 7 |
| Modal CNPJ-primeiro com `useMinhaReceita` + guarda de duplicado | 8 |
| Gaveta com as seções reais + estado explícito de títulos em aberto | 9 |
| Três estados vazios honestos | 7 (entradas, itens) e 9 (compras, payables) |
| CHANGELOG e bump | 10 |

**Consistência de tipos:** `ISupplier`/`ISupplierStats` (Task 1) são consumidos com os mesmos nomes de campo nas Tasks 4, 6, 7 e 9. `supplierCompleteness` devolve `{ filled, total, percent, missing }` e é lido assim na tabela (6), no rail (7) e na gaveta (9). `SUPPLIER_MISSING_LABELS` é indexado por `SupplierMissingField`, o mesmo tipo que `missing` carrega. `useSuppliersStatsIndex` devolve `{ index, isLoading }` e a página passa `index` como `statsIndex` para tabela, rail, KPIs e gaveta.
