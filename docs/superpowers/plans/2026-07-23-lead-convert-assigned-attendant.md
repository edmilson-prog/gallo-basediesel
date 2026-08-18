# Converter em cliente para o atendente atribuído — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Exibir e habilitar o botão "Converter em cliente" na ficha lateral do lead (Atendimento) para o atendente atribuído da conversa — não só para staff e o dono do lead.

**Architecture:** O cliente convertido passa a pertencer a quem converteu (`seller_id = current_seller_id()`), então o INSERT em `customers` já passa na RLS atual. O único write bloqueado — o UPDATE do lead (que pertence a outro vendedor) — é feito por uma RPC `SECURITY DEFINER` gated (`convert_lead_mark`) autorizada por staff / dono do lead / atendente atribuído (`seller_handles_lead`). O gate do frontend passa a incluir `isAssignee`.

**Tech Stack:** React 19 + TypeScript, TanStack Query, Vitest, Supabase (Postgres RLS + RPC), Provider Pattern (`@/providers/data`).

## Global Constraints

- **Provider Pattern:** features acessam dados só via `@/providers/data`; nunca importar `@/mocks` ou `impl/*` fora das fronteiras permitidas (ESLint `no-restricted-imports`).
- **Migrations:** todo SQL vive em `supabase/migrations/` (espelho do remoto). A aplicação em prod é via MCP `apply_migration` com `version` = nome do arquivo, **só com OK do dono**.
- **Comentários em inglês; UI em pt-BR com acentos corretos (UTF-8).**
- **Commits:** Conventional Commits em inglês, atômicos.
- **Gate de CI prático:** `bun run build` + `bun run test`. Type-check à parte com `bunx tsc --noEmit` (baseline pré-existente; avaliar por delta).
- **TypeScript `strict`; evitar `any`; interfaces de domínio prefixadas com `I`.**
- **`customer.seller_id` na conversão = quem converteu, uniforme** (`currentUser?.sellerId ?? lead.sellerId`).

## File Structure

- `supabase/migrations/20260723190000_convert_lead_mark.sql` — **criar** — RPC `SECURITY DEFINER`.
- `src/features/leads/utils/canConvertLead.ts` — **criar** — helper puro do gate.
- `src/features/leads/utils/canConvertLead.test.ts` — **criar** — teste Vitest do helper.
- `src/providers/data/contracts/leads.ts` — **modificar** — adicionar `markConverted` ao contrato.
- `src/providers/data/impl/mock/leads.ts` — **modificar** — impl mock.
- `src/providers/data/impl/supabase/leads.ts` — **modificar** — impl supabase (RPC).
- `src/features/leads/components/LeadProfileFiche.tsx` — **modificar** — usar o helper + `isAssignee`.
- `src/features/leads/components/ConvertLeadModal.tsx` — **modificar** — `sellerId` de quem converteu + `markConverted`.

---

### Task 1: Migration — RPC `convert_lead_mark`

**Files:**
- Create: `supabase/migrations/20260723190000_convert_lead_mark.sql`

**Interfaces:**
- Consumes: funções de RLS existentes `is_staff()`, `current_seller_id()`, `current_store_id()`, `seller_handles_lead(uuid)`.
- Produces: RPC `public.convert_lead_mark(p_lead_id uuid, p_customer_id uuid, p_stage jsonb) returns void`, `EXECUTE` para `authenticated`.

- [ ] **Step 1: Criar o arquivo de migration**

Create `supabase/migrations/20260723190000_convert_lead_mark.sql`:

```sql
-- convert_lead_mark: marks a lead as converted (stage + converted_to_customer_id)
-- on behalf of staff, the lead's owner, OR the assigned attendant of a
-- conversation anchored on this lead. The customer INSERT itself passes the
-- normal customers RLS because the converted customer belongs to whoever
-- converts (seller_id = current_seller_id()); only this lead UPDATE needs to
-- cross the per-owner leads RLS, so it lives in a SECURITY DEFINER function.
-- See docs/superpowers/specs/2026-07-23-lead-convert-assigned-attendant-design.md

create or replace function public.convert_lead_mark(
  p_lead_id     uuid,
  p_customer_id uuid,
  p_stage       jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seller uuid;
  v_store  uuid;
begin
  select seller_id, store_id into v_seller, v_store
  from leads where id = p_lead_id;
  if not found then
    raise exception 'lead % not found', p_lead_id using errcode = 'P0002';
  end if;

  -- Same-store guard (mirror of the RLS store predicate).
  if v_store is distinct from current_store_id() then
    raise exception 'cross-store conversion blocked' using errcode = '42501';
  end if;

  -- Authorization: staff, the lead owner, or the assigned attendant of a
  -- conversation anchored on this lead.
  if not (
    is_staff()
    or v_seller = current_seller_id()
    or seller_handles_lead(p_lead_id)
  ) then
    raise exception 'not authorized to convert lead %', p_lead_id using errcode = '42501';
  end if;

  -- Target customer must exist in the same store (guards "link" mode and a
  -- freshly-inserted customer alike).
  if not exists (
    select 1 from customers c where c.id = p_customer_id and c.store_id = v_store
  ) then
    raise exception 'customer % not found in store', p_customer_id using errcode = 'P0002';
  end if;

  update leads
     set stage = p_stage,
         converted_to_customer_id = p_customer_id,
         updated_at = now()
   where id = p_lead_id;
end;
$$;

revoke all on function public.convert_lead_mark(uuid, uuid, jsonb) from public, anon;
grant execute on function public.convert_lead_mark(uuid, uuid, jsonb) to authenticated;
```

- [ ] **Step 2: Verificar sintaxe SQL localmente (leitura crítica)**

Não há stack Supabase local (a aplicação em prod é via MCP). Reler o arquivo e conferir:
- Assinatura `(uuid, uuid, jsonb)` idêntica no `create`, `revoke` e `grant`.
- `seller_handles_lead(p_lead_id)` recebe `uuid` (a função é `seller_handles_lead(p_lead_id uuid)`).
- `set search_path = public` presente (a função referencia `leads`/`customers` sem schema-qualificar).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260723190000_convert_lead_mark.sql
git commit -m "feat(db): add convert_lead_mark RPC for assigned-attendant lead conversion"
```

> **Rollout (fora do código, gated no dono):** aplicar em prod com `mcp__supabase__apply_migration`, `name`/`version` = `20260723190000_convert_lead_mark`. **Só após OK do dono.**

---

### Task 2: Helper puro `canConvertLead` (TDD)

**Files:**
- Create: `src/features/leads/utils/canConvertLead.ts`
- Test: `src/features/leads/utils/canConvertLead.test.ts`

**Interfaces:**
- Produces: `canConvertLead(perms: { canEditLeadStore: boolean; canEditLeadOwn: boolean; isLeadOwner: boolean; isAssignee: boolean }): boolean`.

- [ ] **Step 1: Escrever o teste que falha**

Create `src/features/leads/utils/canConvertLead.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { canConvertLead } from "./canConvertLead";

describe("canConvertLead", () => {
  const base = {
    canEditLeadStore: false,
    canEditLeadOwn: false,
    isLeadOwner: false,
    isAssignee: false,
  };

  it("allows staff regardless of ownership or assignment", () => {
    expect(canConvertLead({ ...base, canEditLeadStore: true })).toBe(true);
  });

  it("allows the lead owner with own edit", () => {
    expect(canConvertLead({ ...base, canEditLeadOwn: true, isLeadOwner: true })).toBe(true);
  });

  it("allows the assigned attendant with own edit even when not the owner", () => {
    expect(canConvertLead({ ...base, canEditLeadOwn: true, isAssignee: true })).toBe(true);
  });

  it("denies a non-owner, non-assignee even with own edit", () => {
    expect(canConvertLead({ ...base, canEditLeadOwn: true })).toBe(false);
  });

  it("denies an assignee without lead edit permission (e.g. SDR)", () => {
    expect(canConvertLead({ ...base, isAssignee: true })).toBe(false);
  });

  it("denies when nothing applies", () => {
    expect(canConvertLead(base)).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `bun run test -- canConvertLead`
Expected: FAIL — `Failed to resolve import "./canConvertLead"` (arquivo ainda não existe).

- [ ] **Step 3: Implementar o helper**

Create `src/features/leads/utils/canConvertLead.ts`:

```ts
/**
 * Whether the current user may convert a lead into a customer from the lead
 * fiche. Mirrors the DB authorization of `convert_lead_mark`: staff, the lead's
 * owner, or the assigned attendant of the conversation — the last two gated by
 * holding `lead:edit` (own scope). SDR, which lacks `lead:edit`, never passes.
 */
export function canConvertLead(perms: {
  canEditLeadStore: boolean;
  canEditLeadOwn: boolean;
  isLeadOwner: boolean;
  isAssignee: boolean;
}): boolean {
  return (
    perms.canEditLeadStore ||
    (perms.canEditLeadOwn && (perms.isLeadOwner || perms.isAssignee))
  );
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `bun run test -- canConvertLead`
Expected: PASS (6 testes).

- [ ] **Step 5: Commit**

```bash
git add src/features/leads/utils/canConvertLead.ts src/features/leads/utils/canConvertLead.test.ts
git commit -m "feat(leads): add canConvertLead gate helper with tests"
```

---

### Task 3: Método `markConverted` no provider (contrato + mock + supabase)

**Files:**
- Modify: `src/providers/data/contracts/leads.ts`
- Modify: `src/providers/data/impl/mock/leads.ts`
- Modify: `src/providers/data/impl/supabase/leads.ts`

**Interfaces:**
- Consumes: `ILeadStage` (de `@/shared/types`), a RPC `convert_lead_mark` (Task 1).
- Produces: `ILeadsProvider.markConverted(leadId: ID, args: { stage: ILeadStage; customerId: ID }): Promise<void>`.

- [ ] **Step 1: Adicionar ao contrato**

Modify `src/providers/data/contracts/leads.ts`. Trocar o import da linha 1 e adicionar o método após `update` (linha 37):

Import (linha 1):
```ts
import type { ID, ILead, ILeadNote, ILeadStage } from "@/shared/types";
```

Adicionar após a linha `update(id: ID, patch: Partial<ILead>): Promise<ILead>;`:
```ts
  /**
   * Marks a lead as converted (closing stage + `convertedToCustomerId`) via a
   * gated `SECURITY DEFINER` RPC in supabase, so the assigned attendant — not
   * just staff / the owner — can convert without tripping the per-owner leads
   * RLS. The customer itself is created through the normal `customers` INSERT
   * (it belongs to whoever converts). Mock mirrors it as a plain lead update.
   */
  markConverted(leadId: ID, args: { stage: ILeadStage; customerId: ID }): Promise<void>;
```

- [ ] **Step 2: Implementar no mock**

Modify `src/providers/data/impl/mock/leads.ts`. Adicionar após a propriedade `update` (linha 22), antes de `delete`:

```ts
  markConverted: async (leadId, args) => {
    await leadsApi.update(leadId, {
      stage: args.stage,
      convertedToCustomerId: args.customerId,
    });
  },
```

- [ ] **Step 3: Implementar no supabase**

Modify `src/providers/data/impl/supabase/leads.ts`. Adicionar após o método `update` (que termina na linha 279), antes de `delete`:

```ts
  async markConverted(
    leadId: ID,
    args: { stage: ILeadStage; customerId: ID },
  ): Promise<void> {
    const { error } = await getSupabaseClient().rpc("convert_lead_mark", {
      p_lead_id: leadId,
      p_customer_id: args.customerId,
      p_stage: args.stage,
    });
    if (error) throw new Error(`[supabase] leads.markConverted(${leadId}) failed: ${error.message}`);
  },
```

Garantir que `ILeadStage` esteja importado no topo do arquivo. Verificar a linha de import de `@/shared/types` e adicionar `ILeadStage` se ausente.

- [ ] **Step 4: Verificar build/types e testes**

Run: `bun run build`
Expected: sucesso (sem erros de transpilação).

Run: `bun run test`
Expected: PASS (nenhuma regressão; o teste do helper segue verde).

- [ ] **Step 5: Commit**

```bash
git add src/providers/data/contracts/leads.ts src/providers/data/impl/mock/leads.ts src/providers/data/impl/supabase/leads.ts
git commit -m "feat(leads): add markConverted provider method backed by convert_lead_mark RPC"
```

---

### Task 4: Gate da ficha usa `canConvertLead` + `isAssignee`

**Files:**
- Modify: `src/features/leads/components/LeadProfileFiche.tsx`

**Interfaces:**
- Consumes: `canConvertLead` (Task 2). `isLeadOwner`/`isAssignee` já computados no componente (linhas 190-191).

- [ ] **Step 1: Importar o helper**

Modify `src/features/leads/components/LeadProfileFiche.tsx`. Após a linha de import de `resolveLeadFicheIdentity` (linha 41), adicionar:

```ts
import { canConvertLead } from "../utils/canConvertLead";
```

- [ ] **Step 2: Trocar o cálculo de `canConvert`**

Substituir o bloco de comentário + `canConvert` (linhas 193-196):

```ts
  // Conversion writes (customers INSERT + leads UPDATE) pass RLS only for
  // staff or the lead's own owner — the gated write-RPC stays a v2 item (spec
  // "Fora de escopo"), so v1 simply never offers a CTA that would 42501.
  const canConvert = canEditLeadStore || (canEditLeadOwn && isLeadOwner);
```

por:

```ts
  // Conversion is now backed by the gated `convert_lead_mark` RPC, so the
  // assigned attendant of the conversation can convert too — not just staff or
  // the lead's owner. The customer belongs to whoever converts, so its INSERT
  // already passes the customers RLS; only the lead UPDATE needs the RPC.
  const canConvert = canConvertLead({ canEditLeadStore, canEditLeadOwn, isLeadOwner, isAssignee });
```

- [ ] **Step 3: Verificar build e testes**

Run: `bun run build`
Expected: sucesso.

Run: `bun run test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/features/leads/components/LeadProfileFiche.tsx
git commit -m "feat(leads): show convert CTA to the assigned attendant in the lead fiche"
```

---

### Task 5: Modal — `sellerId` de quem converteu + `markConverted`

**Files:**
- Modify: `src/features/leads/components/ConvertLeadModal.tsx`

**Interfaces:**
- Consumes: `leadsProvider.markConverted` (Task 3). `currentUser` já disponível (linha 60).

- [ ] **Step 1: Cliente pertence a quem converteu**

Modify `src/features/leads/components/ConvertLeadModal.tsx`. No `baseCustomer` (linhas 244-254), trocar a linha:

```ts
        sellerId: lead.sellerId,
```

por:

```ts
        // Whoever converts owns the customer (uniform rule). Fallback to the
        // lead's owner if the current user has no seller id.
        sellerId: currentUser?.sellerId ?? lead.sellerId,
```

- [ ] **Step 2: Modo "vincular" usa `markConverted`**

No ramo `mode === "link"` (linhas 209-213), substituir:

```ts
        const closingStage = stages.find((s) => s.id === CLOSING_STAGE_ID) ?? lead.stage;
        await leadsProvider.update(lead.id, {
          stage: closingStage,
          convertedToCustomerId: selectedCustomer.id,
        });
```

por:

```ts
        const closingStage = stages.find((s) => s.id === CLOSING_STAGE_ID) ?? lead.stage;
        await leadsProvider.markConverted(lead.id, {
          stage: closingStage,
          customerId: selectedCustomer.id,
        });
```

- [ ] **Step 3: Modo "novo" usa `markConverted`**

No ramo de criação (linhas 279-283), substituir:

```ts
      const closingStage = stages.find((s) => s.id === CLOSING_STAGE_ID) ?? lead.stage;
      await leadsProvider.update(lead.id, {
        stage: closingStage,
        convertedToCustomerId: customer.id,
      });
```

por:

```ts
      const closingStage = stages.find((s) => s.id === CLOSING_STAGE_ID) ?? lead.stage;
      await leadsProvider.markConverted(lead.id, {
        stage: closingStage,
        customerId: customer.id,
      });
```

- [ ] **Step 4: Verificar build e testes**

Run: `bun run build`
Expected: sucesso.

Run: `bun run test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/leads/components/ConvertLeadModal.tsx
git commit -m "feat(leads): convert via markConverted RPC and assign customer to converter"
```

---

## Verificação final (após todas as tasks)

- [ ] `bun run build` — sucesso.
- [ ] `bun run test` — PASS (inclui `canConvertLead`).
- [ ] `bunx tsc --noEmit` — sem **novos** erros nos arquivos tocados (baseline pré-existente; comparar por delta com `git diff --name-status main...HEAD`).
- [ ] Revisar `git diff main...HEAD` — só os arquivos previstos.

## Smoke manual (dono, após aplicar a migration em prod)

- Logar como Vendedor **não-dono mas atribuído** à conversa do lead → o botão "Converter em cliente" aparece.
  - Modo "novo" (B2C e B2B): cria o cliente com `seller_id` do atendente; lead marcado como convertido; sem erro 42501.
  - Modo "vincular": lead vinculado ao cliente existente; sem escrita no cliente.
- Logar como Vendedor **não-dono e não-atribuído** → o botão continua ausente.
- Logar como SDR atribuído → o botão continua ausente.
- Staff (Owner/Gestor) convertendo → cliente fica com quem converteu (regra uniforme).

## Rollout

1. Abrir PR (draft) com todas as tasks.
2. Dono aprova → aplicar a migration em prod via MCP (`20260723190000_convert_lead_mark`).
3. Merge após smoke aprovado.
