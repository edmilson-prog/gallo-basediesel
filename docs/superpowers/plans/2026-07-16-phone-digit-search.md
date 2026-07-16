# Busca por dígitos (9º dígito + pontuação) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> ⚠️ **Worktree:** todo o trabalho acontece em
> `D:\claude\gallo-basediesel\.claude\worktrees\investigate-msg-553398888`
> (branch `worktree-investigate-msg-553398888`). Subagente despachado DEVE começar com
> `cd "D:\claude\gallo-basediesel\.claude\worktrees\investigate-msg-553398888"` e conferir
> `git branch --show-current` == `worktree-investigate-msg-553398888` antes de qualquer edição.

**Goal:** A busca livre (Inbox, Clientes, Leads) encontra contatos por telefone digitado com ou sem o 9º dígito e com qualquer pontuação, e por CNPJ/CPF independente de máscara.

**Architecture:** Colunas geradas `*_digits` no Postgres (PostgREST só filtra colunas reais) + engine puro TS que expande o termo em candidatos de dígitos (com/sem o 9); a RPC `search_conversations` ganha parâmetro opcional retrocompatível. Spec: `docs/superpowers/specs/2026-07-16-phone-digit-search-design.md`.

**Tech Stack:** Vite/React SPA, TypeScript strict, Vitest, Supabase (Postgres + PostgREST + pg_trgm), bun.

## Global Constraints

- Comentários de código em **inglês**; commits **Conventional Commits** em inglês, atômicos.
- Testes com Vitest co-localizados (`*.test.ts`); gate de CI = `bun run test` + `bun run build` (o build NÃO type-checka; `bunx tsc --noEmit` tem baseline de ~315 erros — avaliar só o delta dos arquivos tocados).
- Fronteiras ESLint: o engine novo vive em `src/shared/utils/` (providers e mocks podem importar de `@/shared/*`; providers NUNCA importam de `@/features/*` nem de `@/mocks`).
- Migration **espelhada em `supabase/migrations/`** no mesmo PR. **NUNCA aplicar em prod sem OK explícito do dono** (é gate de rollout, não passo do plano).
- **NUNCA mergear o PR** — apenas abrir e aguardar aprovação do dono.
- Ordem de rollout obrigatória: migration em prod ANTES do deploy do frontend (coluna/parâmetro inexistentes quebram a busca do frontend novo contra o banco velho).

---

### Task 1: Engine puro `digitSearch` (TDD)

**Files:**
- Create: `src/shared/utils/digitSearch.ts`
- Create: `src/shared/utils/digitSearch.test.ts`

**Interfaces:**
- Consumes: nada (módulo puro, sem dependências).
- Produces: `digitsOf(input: string): string` e `buildDigitSearchCandidates(term: string): string[]` — usados pelas Tasks 3, 4, 5 e 6 via import `@/shared/utils/digitSearch`. Candidatos são SEMPRE só-dígitos (garantia usada pelo SQL da Task 2, que não escapa wildcards de LIKE).

- [ ] **Step 1: Escrever os testes que falham**

Criar `src/shared/utils/digitSearch.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildDigitSearchCandidates, digitsOf } from "./digitSearch";

describe("digitsOf", () => {
  it("strips everything but digits", () => {
    expect(digitsOf("+55 (33) 9 8888-4188")).toBe("5533988884188");
  });
  it("returns empty string when there are no digits", () => {
    expect(digitsOf("Auto Peças")).toBe("");
  });
});

describe("buildDigitSearchCandidates", () => {
  it("returns [] for a term without digits", () => {
    expect(buildDigitSearchCandidates("João")).toEqual([]);
  });
  it("13 digits with DDI and 9th digit → adds the variant without the 9", () => {
    expect(buildDigitSearchCandidates("+55 33 98888-4188")).toEqual([
      "5533988884188",
      "553388884188",
    ]);
  });
  it("12 digits with DDI and no 9th → adds the variant with the 9", () => {
    expect(buildDigitSearchCandidates("553388884188")).toEqual([
      "553388884188",
      "5533988884188",
    ]);
  });
  it("11 digits DDD+9+local → adds the variant without the 9", () => {
    expect(buildDigitSearchCandidates("33 98888-4188")).toEqual([
      "33988884188",
      "3388884188",
    ]);
  });
  it("10 digits DDD+local → adds the variant with the 9", () => {
    expect(buildDigitSearchCandidates("3388884188")).toEqual([
      "3388884188",
      "33988884188",
    ]);
  });
  it("9 digits starting with 9 → adds the variant without the leading 9", () => {
    expect(buildDigitSearchCandidates("98888-4188")).toEqual(["988884188", "88884188"]);
  });
  it("8 digits → no variant (substring already covers both stored shapes)", () => {
    expect(buildDigitSearchCandidates("8888-4188")).toEqual(["88884188"]);
  });
  it("CNPJ (14 digits) → digits only, no phone variant", () => {
    expect(buildDigitSearchCandidates("12.345.678/0001-90")).toEqual(["12345678000190"]);
  });
  it("CPF whose 3rd digit is not 9 → digits only", () => {
    expect(buildDigitSearchCandidates("123.456.789-01")).toEqual(["12345678901"]);
  });
  it("13 digits with DDI but 5th digit ≠ 9 → digits only", () => {
    expect(buildDigitSearchCandidates("5533188884188")).toEqual(["5533188884188"]);
  });
  it("mixed text with digits keeps only the digits", () => {
    expect(buildDigitSearchCandidates("tel 4188")).toEqual(["4188"]);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `bun run test src/shared/utils/digitSearch.test.ts`
Expected: FAIL — `Cannot find module './digitSearch'` (ou equivalente).

- [ ] **Step 3: Implementar o engine**

Criar `src/shared/utils/digitSearch.ts`:

```ts
/**
 * Digit-normalized search candidates for phone/CNPJ/CPF matching.
 *
 * Stored Brazilian phones use the WhatsApp wire shape (digits with the 55
 * DDI, often WITHOUT the 9th mobile digit — JIDs drop it for numbers
 * registered before the 9th-digit rollout, e.g. +553388884188). A term typed
 * WITH the 9 (or with punctuation) must still match, so the search expands
 * the term into digit candidates compared as substrings of the `*_digits`
 * generated columns (migration 20260716210000). A variant only WIDENS the
 * OR — ambiguous shapes (11 digits = CPF or DDD+mobile) can add a useless
 * candidate but never remove a match. Candidates are digits-only by
 * construction; SQL consumers rely on that to skip LIKE-wildcard escaping.
 */

const NON_DIGITS = /\D/g;

export function digitsOf(input: string): string {
  return input.replace(NON_DIGITS, "");
}

/**
 * Returns the term's digits plus (at most) one 9th-digit variant, deduped.
 * Empty array when the term has no digits.
 */
export function buildDigitSearchCandidates(term: string): string[] {
  const d = digitsOf(term);
  if (!d) return [];
  const variant = ninthDigitVariant(d);
  return variant && variant !== d ? [d, variant] : [d];
}

/** 9th-digit variant by BR phone shape, or null when the shape isn't one. */
function ninthDigitVariant(d: string): string | null {
  // 55 + DDD + 9 + local8 → drop the 9
  if (d.length === 13 && d.startsWith("55") && d[4] === "9") {
    return d.slice(0, 4) + d.slice(5);
  }
  // 55 + DDD + local8 → insert the 9 after the DDD
  if (d.length === 12 && d.startsWith("55")) {
    return d.slice(0, 4) + "9" + d.slice(4);
  }
  // DDD + 9 + local8 → drop the 9
  if (d.length === 11 && d[2] === "9") {
    return d.slice(0, 2) + d.slice(3);
  }
  // DDD + local8 → insert the 9 after the DDD
  if (d.length === 10) {
    return d.slice(0, 2) + "9" + d.slice(2);
  }
  // 9 + local8, no DDD → drop the leading 9
  if (d.length === 9 && d.startsWith("9")) {
    return d.slice(1);
  }
  return null;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `bun run test src/shared/utils/digitSearch.test.ts`
Expected: PASS (13 testes).

- [ ] **Step 5: Commit**

```bash
git add src/shared/utils/digitSearch.ts src/shared/utils/digitSearch.test.ts
git commit -m "feat: add digit-normalized search candidate engine (BR 9th digit)"
```

---

### Task 2: Migration — colunas geradas + RPC `search_conversations`

**Files:**
- Create: `supabase/migrations/20260716210000_digit_search_columns_and_rpc.sql`

**Interfaces:**
- Consumes: definição vigente de `search_conversations` (migration `20260714100000_conversation_rpcs_return_ad_referral.sql`, linhas 137–258 — o corpo abaixo é aquele, com as adições marcadas).
- Produces: colunas `customers.phone_digits|cnpj_digits|cpf_digits`, `leads.phone_digits` (usadas pelas Tasks 3 e 4) e RPC com parâmetro novo `p_search_digit_variants text[] default null` (usado pela Task 5).
- ⚠️ Este task SÓ cria o arquivo no Git. **NÃO aplicar em prod** (gate do dono, ver Task 7).

- [ ] **Step 1: Criar o arquivo da migration**

Criar `supabase/migrations/20260716210000_digit_search_columns_and_rpc.sql` com o conteúdo integral:

```sql
-- Digit-normalized search (spec: docs/superpowers/specs/2026-07-16-phone-digit-search-design.md).
--
-- Free-text search matched phone/CNPJ/CPF as literal substrings of the raw
-- columns, so a term typed WITH the BR 9th mobile digit (or with punctuation)
-- never found a contact stored without it — WhatsApp JIDs drop the 9 for
-- numbers registered before the rollout (e.g. +553388884188).
--
-- 1) Generated *_digits columns (PostgREST .or() only filters real columns,
--    not expressions) + pg_trgm GIN indexes so %term% stays indexable.
-- 2) search_conversations gains p_search_digit_variants text[] default null:
--    the frontend expands the term into digit candidates (with/without the 9,
--    src/shared/utils/digitSearch.ts) and the SQL matches them against
--    phone_digits. Candidates are digits-only by construction — no LIKE
--    wildcard escaping needed. Old frontends omit the param → null → the
--    behavior is exactly the previous one.

-- 1) Generated columns + indexes --------------------------------------------

alter table public.customers
  add column phone_digits text generated always as
    (regexp_replace(coalesce(phone, ''), '\D', '', 'g')) stored,
  add column cnpj_digits text generated always as
    (regexp_replace(coalesce(cnpj, ''), '\D', '', 'g')) stored,
  add column cpf_digits text generated always as
    (regexp_replace(coalesce(cpf, ''), '\D', '', 'g')) stored;

alter table public.leads
  add column phone_digits text generated always as
    (regexp_replace(coalesce(phone, ''), '\D', '', 'g')) stored;

create index customers_phone_digits_trgm_idx
  on public.customers using gin (phone_digits extensions.gin_trgm_ops);
create index customers_cnpj_digits_trgm_idx
  on public.customers using gin (cnpj_digits extensions.gin_trgm_ops);
create index customers_cpf_digits_trgm_idx
  on public.customers using gin (cpf_digits extensions.gin_trgm_ops);
create index leads_phone_digits_trgm_idx
  on public.leads using gin (phone_digits extensions.gin_trgm_ops);

-- 2) search_conversations + p_search_digit_variants -------------------------
-- Signature change ⇒ drop by the exact prior signature first: an overload
-- would break PostgREST's function resolution whenever optional keys are
-- omitted from the JSON body (documented trap in buildSearchRpcParams).

drop function if exists public.search_conversations(
  text, uuid, text[], text, uuid, uuid, boolean, boolean, text[],
  timestamptz, timestamptz, text, integer, integer, uuid[], boolean
);

create function public.search_conversations(
  p_search text,
  p_store_id uuid default null,
  p_status text[] default null,
  p_channel text default null,
  p_whatsapp_account_id uuid default null,
  p_assigned_seller_id uuid default null,
  p_unassigned boolean default false,
  p_is_sdr_active boolean default null,
  p_tags text[] default null,
  p_from_date timestamptz default null,
  p_to_date timestamptz default null,
  p_order_dir text default 'desc',
  p_limit integer default 30,
  p_offset integer default 0,
  p_assigned_seller_ids uuid[] default null,
  p_include_queue boolean default false,
  p_search_digit_variants text[] default null
)
returns table (
  id uuid,
  store_id uuid,
  customer_id uuid,
  lead_id text,
  assigned_seller_id uuid,
  channel text,
  whatsapp_account_id uuid,
  status text,
  is_sdr_active boolean,
  tags text[],
  linked_order_id text,
  last_message_at timestamptz,
  unread_count integer,
  created_at timestamptz,
  queued_at timestamptz,
  ad_referral jsonb,
  is_collaborator boolean,
  total_count bigint
)
language sql
stable security definer
set search_path = ''
as $$
  with acc as materialized (
    select public.current_seller_accessible_account_ids() as id
  ),
  q as (select '%' || coalesce(trim(p_search), '') || '%' as term)
  select
    c.id, c.store_id, c.customer_id, c.lead_id, c.assigned_seller_id, c.channel,
    c.whatsapp_account_id, c.status, c.is_sdr_active, c.tags, c.linked_order_id,
    c.last_message_at, c.unread_count, c.created_at, c.queued_at, c.ad_referral,
    exists (
      select 1 from public.conversation_participants p
      where p.conversation_id = c.id
        and p.seller_id = public.current_seller_id()
    ) as is_collaborator,
    count(*) over () as total_count
  from public.conversations c, q
  where
    c.store_id = public.current_store_id()
    and (
      public.is_staff()
      or (
        c.assigned_seller_id = public.current_seller_id()
        and (c.whatsapp_account_id is null
             or c.whatsapp_account_id in (select id from acc))
      )
      or (
        exists (
          select 1 from public.conversation_participants p
          where p.conversation_id = c.id
            and p.seller_id = public.current_seller_id()
        )
        and (
          public.store_allows_participant_cross_instance(c.store_id)
          or c.whatsapp_account_id is null
          or c.whatsapp_account_id in (select id from acc)
        )
      )
      or (
        c.assigned_seller_id is null
        and c.whatsapp_account_id is not null
        and c.whatsapp_account_id in (select id from acc)
      )
      or (c.assigned_seller_id is null and c.whatsapp_account_id is null)
    )
    and (p_store_id is null or c.store_id = p_store_id)
    and (p_status is null or c.status = any (p_status))
    and (p_channel is null or c.channel = p_channel)
    and (p_whatsapp_account_id is null or c.whatsapp_account_id = p_whatsapp_account_id)
    and (
      ( p_assigned_seller_id is null
        and (p_assigned_seller_ids is null or cardinality(p_assigned_seller_ids) = 0)
        and not p_unassigned
        and not p_include_queue )
      or (p_assigned_seller_id is not null and c.assigned_seller_id = p_assigned_seller_id)
      or (p_assigned_seller_ids is not null and c.assigned_seller_id = any (p_assigned_seller_ids))
      or (p_assigned_seller_ids is not null
          and exists (
            select 1 from public.conversation_participants p
            where p.conversation_id = c.id
              and p.seller_id = any (p_assigned_seller_ids)
          ))
      or (p_unassigned and c.assigned_seller_id is null)
      or (p_include_queue and c.assigned_seller_id is null
            and c.is_sdr_active = false and c.status = 'aguardando')
    )
    and (p_is_sdr_active is null or c.is_sdr_active = p_is_sdr_active)
    and (p_tags is null or c.tags && p_tags)
    and (p_from_date is null or c.last_message_at >= p_from_date)
    and (p_to_date is null or c.last_message_at <= p_to_date)
    and (
      exists (select 1 from public.customers cu where cu.id = c.customer_id
        and (cu.full_name ilike q.term or cu.nome_fantasia ilike q.term or cu.phone ilike q.term
             or (p_search_digit_variants is not null and exists (
                   select 1 from unnest(p_search_digit_variants) as v(variant)
                   where cu.phone_digits like '%' || v.variant || '%'))))
      or exists (select 1 from public.leads l where l.id::text = c.lead_id
        and (l.name ilike q.term or l.phone ilike q.term
             or (p_search_digit_variants is not null and exists (
                   select 1 from unnest(p_search_digit_variants) as v(variant)
                   where l.phone_digits like '%' || v.variant || '%'))))
    )
  order by
    case when p_order_dir = 'asc' then c.last_message_at end asc,
    case when p_order_dir <> 'asc' then c.last_message_at end desc
  limit greatest(p_limit, 1)
  offset greatest(p_offset, 0);
$$;

-- DROP FUNCTION clears prior grants; PostgREST callers rely on execute
-- rights on the authenticated role (postgres/service_role kept for parity).
grant execute on function public.search_conversations(
  text, uuid, text[], text, uuid, uuid, boolean, boolean, text[],
  timestamptz, timestamptz, text, integer, integer, uuid[], boolean, text[]
) to authenticated, postgres, service_role;

notify pgrst, 'reload schema';
```

- [ ] **Step 2: Sanity check do SQL**

Conferir visualmente contra a definição vigente (`supabase/migrations/20260714100000_conversation_rpcs_return_ad_referral.sql:137-258`): o corpo é idêntico, com exatamente 3 diferenças — o parâmetro novo no fim da assinatura, os dois blocos `p_search_digit_variants` (customers e leads) e o `text[]` extra no grant.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260716210000_digit_search_columns_and_rpc.sql
git commit -m "feat: add digit-search generated columns and search_conversations variants param"
```

---

### Task 3: `buildCustomerSearchOr` com filtros de dígitos

**Files:**
- Modify: `src/providers/data/impl/supabase/customers.ts:238-260`
- Modify: `src/providers/data/impl/supabase/customers.search.test.ts`

**Interfaces:**
- Consumes: `buildDigitSearchCandidates` de `@/shared/utils/digitSearch` (Task 1); colunas `phone_digits`/`cnpj_digits`/`cpf_digits` (Task 2).
- Produces: `buildCustomerSearchOr(search: string): string | null` (assinatura inalterada — a tela de Clientes e o "Nova conversa" consomem via `customersProvider.list({ search })` sem mudança).

- [ ] **Step 1: Escrever os testes que falham**

Acrescentar ao `describe` de `customers.search.test.ts`:

```ts
  it("adds digit-normalized filters (with the 9th-digit variant) for phone-shaped terms", () => {
    const result = buildCustomerSearchOr("98888-4188");
    expect(result).toContain("phone_digits.ilike.*988884188*");
    expect(result).toContain("phone_digits.ilike.*88884188*");
    expect(result).toContain("cnpj_digits.ilike.*988884188*");
    expect(result).toContain("cpf_digits.ilike.*88884188*");
  });
  it("adds no digit filters when the term has no digits", () => {
    expect(buildCustomerSearchOr("Joao")).not.toContain("phone_digits");
  });
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `bun run test src/providers/data/impl/supabase/customers.search.test.ts`
Expected: FAIL — o primeiro teste novo não encontra `phone_digits.ilike...`.

- [ ] **Step 3: Implementar**

Em `customers.ts`, adicionar o import no topo (junto aos demais):

```ts
import { buildDigitSearchCandidates } from "@/shared/utils/digitSearch";
```

E substituir a função `buildCustomerSearchOr` (mantendo `SEARCH_COLUMNS` como está):

```ts
/** Digit-normalized columns matched when the term contains digits — finds
 *  phones typed with/without the BR 9th digit and documents typed with any
 *  mask (columns from migration 20260716210000). */
const DIGIT_SEARCH_COLUMNS = ["phone_digits", "cnpj_digits", "cpf_digits"] as const;

/**
 * Builds the PostgREST `.or()` expression for a free-text customer search, or
 * `null` when the term is blank. `,` `(` `)` are PostgREST or()-delimiters and
 * are neutralized to spaces. `*` is the ilike wildcard in the string filter form.
 */
export function buildCustomerSearchOr(search: string): string | null {
  const term = search.trim();
  if (!term) return null;
  const safe = term.replace(/[,()]/g, " ");
  const filters = SEARCH_COLUMNS.map((c) => `${c}.ilike.*${safe}*`);
  for (const candidate of buildDigitSearchCandidates(term)) {
    for (const col of DIGIT_SEARCH_COLUMNS) {
      filters.push(`${col}.ilike.*${candidate}*`);
    }
  }
  return filters.join(",");
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `bun run test src/providers/data/impl/supabase/customers.search.test.ts`
Expected: PASS (5 testes — os 3 existentes seguem verdes: termo sem dígitos não ganha filtros novos).

- [ ] **Step 5: Commit**

```bash
git add src/providers/data/impl/supabase/customers.ts src/providers/data/impl/supabase/customers.search.test.ts
git commit -m "feat: match digit-normalized phone/document columns in customer search"
```

---

### Task 4: Busca de leads com filtros de dígitos

**Files:**
- Modify: `src/providers/data/impl/supabase/leads.ts:125-128`
- Create: `src/providers/data/impl/supabase/leads.search.test.ts`

**Interfaces:**
- Consumes: `buildDigitSearchCandidates` (Task 1); coluna `leads.phone_digits` (Task 2).
- Produces: `buildLeadSearchOr(search: string): string | null` exportada de `leads.ts` (novo builder extraído, espelhando o padrão de `buildCustomerSearchOr`).

- [ ] **Step 1: Escrever os testes que falham**

Criar `src/providers/data/impl/supabase/leads.search.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildLeadSearchOr } from "./leads";

describe("buildLeadSearchOr", () => {
  it("returns null for blank input", () => {
    expect(buildLeadSearchOr("   ")).toBeNull();
  });
  it("builds an ilike OR across name, phone and email", () => {
    expect(buildLeadSearchOr("Joao")).toBe(
      "name.ilike.*Joao*,phone.ilike.*Joao*,email.ilike.*Joao*",
    );
  });
  it("adds digit-normalized phone filters for phone-shaped terms", () => {
    const result = buildLeadSearchOr("98888-4188");
    expect(result).toContain("phone_digits.ilike.*988884188*");
    expect(result).toContain("phone_digits.ilike.*88884188*");
  });
  it("neutralizes PostgREST or() delimiters in the term", () => {
    expect(buildLeadSearchOr("a,b(c)")).toContain("name.ilike.*a b c *");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `bun run test src/providers/data/impl/supabase/leads.search.test.ts`
Expected: FAIL — `buildLeadSearchOr` não existe.

- [ ] **Step 3: Implementar**

Em `leads.ts`, adicionar o import no topo:

```ts
import { buildDigitSearchCandidates } from "@/shared/utils/digitSearch";
```

Adicionar antes de `export const supabaseLeadsProvider`:

```ts
/**
 * Builds the PostgREST `.or()` expression for the free-text lead search, or
 * `null` when the term is blank — same mechanics as buildCustomerSearchOr
 * (delimiters neutralized, digit candidates tolerate the BR 9th digit).
 */
export function buildLeadSearchOr(search: string): string | null {
  const term = search.trim();
  if (!term) return null;
  const safe = term.replace(/[,()]/g, " ");
  const filters = [`name.ilike.*${safe}*`, `phone.ilike.*${safe}*`, `email.ilike.*${safe}*`];
  for (const candidate of buildDigitSearchCandidates(term)) {
    filters.push(`phone_digits.ilike.*${candidate}*`);
  }
  return filters.join(",");
}
```

E trocar o bloco de busca dentro de `list` (linhas 125–128):

```ts
    if (params.search) {
      const orExpr = buildLeadSearchOr(params.search);
      if (orExpr) query = query.or(orExpr);
    }
```

(Deltas intencionais vs. o código antigo: o termo agora é trimado, os delimitadores `,()` são neutralizados — antes quebravam o `.or()` — e o wildcard passa de `%` para `*`, o formato canônico do PostgREST já usado em customers.)

- [ ] **Step 4: Rodar e ver passar**

Run: `bun run test src/providers/data/impl/supabase/leads.search.test.ts`
Expected: PASS (4 testes).

- [ ] **Step 5: Commit**

```bash
git add src/providers/data/impl/supabase/leads.ts src/providers/data/impl/supabase/leads.search.test.ts
git commit -m "feat: match digit-normalized phone column in lead search"
```

---

### Task 5: Call site da RPC `search_conversations`

**Files:**
- Modify: `src/providers/data/impl/supabase/conversations.ts:186-205` (função `searchConversations`)

**Interfaces:**
- Consumes: `buildDigitSearchCandidates` (Task 1); parâmetro `p_search_digit_variants` da RPC (Task 2).
- Produces: nada novo para outras tasks — mesma assinatura pública do provider.

- [ ] **Step 1: Implementar**

Adicionar o import no topo de `conversations.ts`:

```ts
import { buildDigitSearchCandidates } from "@/shared/utils/digitSearch";
```

Trocar a chamada da RPC dentro de `searchConversations` (o `buildSearchRpcParams` compartilhado NÃO muda — `search_conversation_messages` não aceita o parâmetro novo e o PostgREST rejeita chaves desconhecidas):

```ts
async function searchConversations(
  params: IListConversationsParams,
): Promise<IPaginatedResult<IConversation>> {
  const { page, pageSize } = resolvePagination(params);
  const digitCandidates = buildDigitSearchCandidates(params.search ?? "");

  const { data, error } = await getSupabaseClient().rpc("search_conversations", {
    ...buildSearchRpcParams(params, page, pageSize),
    // Kept OUT of buildSearchRpcParams on purpose: search_conversation_messages
    // does not declare this param and PostgREST rejects unknown keys.
    p_search_digit_variants: digitCandidates.length > 0 ? digitCandidates : null,
  });

  if (error) throw new Error(`[supabase] conversations.search failed: ${error.message}`);

  const rows = (data ?? []) as unknown as (ConversationRow & { total_count: number })[];
  return {
    data: rows.map(rowToConversation),
    total: Number(rows[0]?.total_count ?? 0),
    page,
    pageSize,
  };
}
```

- [ ] **Step 2: Verificar tipos e suíte**

Run: `bunx tsc --noEmit 2>&1 | grep "conversations.ts"` — Expected: nenhum erro NOVO neste arquivo (baseline do projeto não conta).
Run: `bun run test` — Expected: PASS (suíte inteira).

- [ ] **Step 3: Commit**

```bash
git add src/providers/data/impl/supabase/conversations.ts
git commit -m "feat: pass digit search variants to search_conversations RPC"
```

---

### Task 6: Paridade dos mocks (customers, conversations, leads)

**Files:**
- Modify: `src/mocks/api/customers.ts:196-217` (bloco `params.search` do filtro)
- Modify: `src/mocks/api/conversations.ts:85-92` (função `matchesSearch`)
- Modify: `src/mocks/api/leads.ts:31-36` (bloco `params.search` do `list`)

**Interfaces:**
- Consumes: `digitsOf` e `buildDigitSearchCandidates` de `@/shared/utils/digitSearch` (Task 1). Mocks PODEM importar de `@/shared/*` (a restrição ESLint protege `@/mocks`, não `@/shared`).
- Produces: comportamento de busca do modo demo idêntico ao do supabase.

- [ ] **Step 1: mock de customers**

Adicionar o import no topo de `src/mocks/api/customers.ts`:

```ts
import { buildDigitSearchCandidates } from "@/shared/utils/digitSearch";
```

No bloco `if (params.search)` (linhas 196–217), trocar a linha `const digits = q.replace(/\D/g, "");` e o cálculo de `numericMatch` por:

```ts
      const candidates = buildDigitSearchCandidates(q);
      const haystack = [
        displayName(customer),
        customer.email ?? "",
        customer.phone,
        customer.type === "B2B" ? `${customer.razaoSocial} ${customer.cnpj}` : customer.cpf,
        customer.notes.map((n) => n.content).join(" "),
      ]
        .join(" ")
        .toLowerCase();
      const numericMatch =
        candidates.length > 0 &&
        candidates.some(
          (c) =>
            normalize(customer.phone).includes(c) ||
            (customer.type === "B2B"
              ? normalize(customer.cnpj).includes(c)
              : normalize(customer.cpf).includes(c)),
        );
      if (!haystack.includes(q) && !numericMatch) return false;
```

(O `haystack` é o existente, inalterado — só o `numericMatch` muda de `digits` único para `candidates.some`.)

- [ ] **Step 2: mock de conversations**

Adicionar o import no topo de `src/mocks/api/conversations.ts`:

```ts
import { buildDigitSearchCandidates, digitsOf } from "@/shared/utils/digitSearch";
```

Substituir `matchesSearch` (linhas 85–92):

```ts
/** Contact identity ONLY (name/phone) — message content has its own dedicated search, see `searchMessages`. */
function matchesSearch(conversation: IConversation, term: string): boolean {
  const needle = term.trim().toLowerCase();
  if (!needle) return true;
  const { name, phone } = getParticipantNameAndPhone(conversation);
  if (name.toLowerCase().includes(needle)) return true;
  if (phone.toLowerCase().includes(needle)) return true;
  const phoneDigits = digitsOf(phone);
  return buildDigitSearchCandidates(term).some((c) => phoneDigits.includes(c));
}
```

- [ ] **Step 3: mock de leads**

Adicionar o import no topo de `src/mocks/api/leads.ts`:

```ts
import { buildDigitSearchCandidates, digitsOf } from "@/shared/utils/digitSearch";
```

Substituir o bloco `if (params.search)` (linhas 31–36):

```ts
        if (params.search) {
          const q = params.search.toLowerCase();
          const candidates = buildDigitSearchCandidates(params.search);
          all = all.filter(
            (l) =>
              `${l.name} ${l.phone} ${l.email ?? ""}`.toLowerCase().includes(q) ||
              candidates.some((c) => digitsOf(l.phone).includes(c)),
          );
        }
```

- [ ] **Step 4: Rodar a suíte inteira**

Run: `bun run test`
Expected: PASS — nenhum teste de mock existente depende do matching literal removido (se algum falhar, ler o teste: a intenção nova é "candidatos de dígitos casam", ajustar a EXPECTATIVA apenas se o teste codificava o comportamento antigo bugado).

- [ ] **Step 5: Commit**

```bash
git add src/mocks/api/customers.ts src/mocks/api/conversations.ts src/mocks/api/leads.ts
git commit -m "feat: mirror digit-normalized search in mock providers"
```

---

### Task 7: Gate final, push e PR (SEM merge, SEM aplicar migration)

**Files:**
- Nenhum arquivo novo — verificação, push e abertura de PR.

**Interfaces:**
- Consumes: todos os commits das Tasks 1–6.
- Produces: PR aberto aguardando o dono; checklist de rollout no corpo do PR.

- [ ] **Step 1: Gate completo**

```bash
bun run test
bun run build
bun run lint
```

Expected: os três passam (lint sem erros novos nos arquivos tocados; build transpila).

- [ ] **Step 2: Type-check por delta**

Run: `bunx tsc --noEmit 2>&1 | grep -E "digitSearch|customers|leads|conversations" | grep -v test`
Expected: nenhum erro novo nos arquivos criados/tocados (baseline ~315 erros pré-existentes não conta).

- [ ] **Step 3: Push e PR**

```bash
git push -u origin worktree-investigate-msg-553398888
gh pr create --title "feat: digit-normalized search (BR 9th digit + punctuation)" --body "$(cat <<'EOF'
## Resumo
- Busca livre (Inbox, Clientes, Leads) agora encontra telefone digitado com/sem o 9º dígito e com qualquer pontuação; CNPJ/CPF idem (qualquer máscara).
- Colunas geradas `*_digits` + índices pg_trgm; RPC `search_conversations` com `p_search_digit_variants` (retrocompatível).
- Engine puro testado `src/shared/utils/digitSearch.ts`; mocks em paridade.
- Spec: `docs/superpowers/specs/2026-07-16-phone-digit-search-design.md`.

## ⚠️ Rollout (ordem obrigatória)
1. Aplicar `supabase/migrations/20260716210000_digit_search_columns_and_rpc.sql` em prod (MCP, com OK do dono).
2. Só então mergear/deployar o frontend.
3. Smoke: buscar `98888-4188` na Inbox e em Clientes → deve achar o cliente `+553388884188`.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: PR criado. **NÃO mergear. NÃO aplicar a migration** — ambos aguardam OK explícito do dono.

---

## Rollout pós-aprovação (fora do plano — executar SÓ com OK do dono)

1. Aplicar a migration em prod via MCP (`mcp__supabase__apply_migration`, version = nome do arquivo).
2. Verificar: `select phone_digits from customers where id = 'b7190a3b-49cd-4e36-a800-fc3e675d9be3'` → `553388884188`.
3. Mergear o PR (dono) e aguardar deploy Vercel.
4. Smoke do caso real: buscar `98888-4188` na Inbox e na tela de Clientes.
