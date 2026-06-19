# Bloco A1 — CRUD de Lojas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que o Owner crie, edite e desative (soft) filiais e parceiras pela tela `/app/configuracoes/lojas`, com escrita cross-loja segura no banco via RPC `SECURITY DEFINER` Owner-only.

**Architecture:** Estende o Provider Pattern existente (`IStoresProvider` read-only → +create/update/setActive). A escrita supabase passa por 3 RPCs Owner-only (não por insert/update direto, porque a RLS de `stores` confina o usuário à própria loja). O frontend reaproveita o padrão de formulário `SellerFormDialog` (RHF+zod+Sheet) e o `MultistoreProvider` ganha um `refreshStores()` para refletir a loja nova sem reload.

**Tech Stack:** React 19, TanStack Router/Query, Supabase (Postgres + RLS + RPC), Zustand (mock store), react-hook-form + zod, shadcn/ui, Vitest.

## Global Constraints

- **Produção viva:** 1 loja (matriz `00000000-0000-0000-0000-000000000001`), 7 vendedores, ~807 clientes. Comportamento atual deve ficar **idêntico** após a migration (com 1 loja, os `OR` de RLS não mudam nada).
- **PR-only:** nunca merge sem autorização; toda integração via push + PR.
- **Migrations espelhadas:** todo `apply_migration` exportado em `supabase/migrations/` no mesmo PR; **não aplicar em prod sem confirmação do dono** (preferir branch Supabase antes).
- **RLS gate:** rodar `supabase/tests/rls-regression.sql` antes/depois de qualquer mudança de policy.
- **Escrita cross-loja = RPC `SECURITY DEFINER` Owner-only**, gate `current_app_role() = 'owner'` (NUNCA `is_staff()`, que inclui Gestor); `REVOKE EXECUTE ... FROM anon`.
- **Soft-delete apenas** (`is_active`), nunca `DELETE` físico (33 FKs).
- **Guardas:** proibido desativar a matriz e proibido desativar a última loja ativa.
- **Settings de filial = padrões limpos** (`buildDefaultSettings`, sem herdar da matriz).
- **Convenções:** camelCase/PascalCase no código, snake_case no DB, UI em pt-BR com acentos, Conventional Commits em inglês, `tsc` por delta (gate prático = `bun run build` + `bun run test`).

---

### Task 1: Campo `isActive` no modelo `IStore`

**Files:**
- Modify: `src/shared/types/platform.ts` (interface `IStore`, ~289-305)

**Interfaces:**
- Produces: `IStore.isActive: boolean` (novo campo, obrigatório no tipo; o mapper supabase preenche `true` como default para linhas antigas).

- [ ] **Step 1: Adicionar o campo**

Na interface `IStore`, após `activeDivisions: Division[];`:

```typescript
  /** Divisions active for this store. On the MVP always `['parts']`. */
  activeDivisions: Division[];
  /** Soft-delete flag (Fase 2 — gestão multi-loja). Inactive stores são
   *  ocultadas das listagens operacionais mas preservadas para histórico/FKs. */
  isActive: boolean;
  createdAt: ISO8601;
```

- [ ] **Step 2: Atualizar o seed da matriz**

Em `src/mocks/data/seedStore.ts`, no objeto `SEED_STORE`, adicionar `isActive: true,` junto aos demais campos de topo (ex.: após `activeDivisions: ["parts"],`).

- [ ] **Step 3: Verificar build de tipos**

Run: `bunx tsc --noEmit 2>&1 | grep -E "platform.ts|seedStore.ts"`
Expected: nenhuma linha nova de erro nesses arquivos (o `IStore` literal do seed agora satisfaz o campo).

- [ ] **Step 4: Commit**

```bash
git add src/shared/types/platform.ts src/mocks/data/seedStore.ts
git commit -m "feat(multistore): add isActive to IStore model"
```

---

### Task 2: Factory `buildDefaultSettings(storeId)` (TDD)

**Files:**
- Create: `src/providers/data/engine/buildDefaultSettings.ts` (fora de `mock/`, mesmo padrão de `aiCatalog.ts`)
- Create: `src/providers/data/engine/buildDefaultSettings.test.ts`

> **Por que `providers/data/engine/` e não `mocks/data/`:** tanto o provider mock quanto o supabase precisam da factory. `src/providers/data/**` é **isento** da regra ESLint de fronteira do mock (`eslint.config.js:43`), então este arquivo pode importar os `SEED_*` de `@/mocks/data/*` livremente, e ambos os providers o consomem por caminho relativo sem violar a fronteira. Espelha o precedente do `aiCatalog.ts`.

**Interfaces:**
- Consumes: os `DEFAULT_*` de `@/features/*` (`DEFAULT_DISTRIBUTION_SETTINGS`, `DEFAULT_MANAGER_DASHBOARD_SETTINGS`, `DEFAULT_SDR_TEMPLATES`, `DEFAULT_SDR_QUOTE_TEMPLATES`, `DEFAULT_SHIPPING_CONFIG`, `DEFAULT_BADGE_CATALOG`, `DEFAULT_ECOMMERCE_INTEGRATION_SETTINGS`) e de `@/shared/types` (`DEFAULT_INSIGHT_THRESHOLDS`, `DEFAULT_STOREFRONT_CONFIG`); os `SEED_*` de `@/mocks/data/*` (`SEED_PIPELINE_STAGES`, `SEED_LOSS_REASONS`, `SEED_TAGS`).
- Produces: `buildDefaultSettings(storeId: ID): IPlatformSettings` — settings de fábrica para uma loja nova. Valores monetários específicos de loja zerados; parâmetros de negócio nos defaults.

- [ ] **Step 1: Escrever o teste falhando**

```typescript
import { describe, it, expect } from "vitest";
import { buildDefaultSettings } from "./buildDefaultSettings";

describe("buildDefaultSettings", () => {
  it("carimba o storeId recebido", () => {
    const s = buildDefaultSettings("loja-x");
    expect(s.storeId).toBe("loja-x");
  });

  it("zera os valores monetários específicos da loja (padrões limpos)", () => {
    const s = buildDefaultSettings("loja-x");
    expect(s.financialSettings.fixedExpenses).toEqual({ payroll: 0, rentInfra: 0, other: 0 });
    expect(s.cashflowSettings.openingBalance).toBe(0);
  });

  it("mantém defaults de negócio (pipeline e divisão padrão)", () => {
    const s = buildDefaultSettings("loja-x");
    expect(s.pipelineStages.length).toBeGreaterThan(0);
    expect(s.defaultDivision).toBe("parts");
  });

  it("não compartilha referências mutáveis entre duas chamadas", () => {
    const a = buildDefaultSettings("a");
    const b = buildDefaultSettings("b");
    expect(a.pipelineStages).not.toBe(b.pipelineStages);
  });
});
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `bun run test src/providers/data/engine/buildDefaultSettings.test.ts`
Expected: FAIL ("buildDefaultSettings is not a function" / módulo não encontrado).

- [ ] **Step 3: Implementar a factory**

```typescript
import type { ID, IPlatformSettings } from "@/shared/types";
import { DEFAULT_INSIGHT_THRESHOLDS, DEFAULT_STOREFRONT_CONFIG } from "@/shared/types";
import { SEED_PIPELINE_STAGES } from "@/mocks/data/seedPipelineStages";
import { SEED_LOSS_REASONS } from "@/mocks/data/seedLossReasons";
import { SEED_TAGS } from "@/mocks/data/seedTags";
import { DEFAULT_DISTRIBUTION_SETTINGS } from "@/mocks/data/seedDistribution";
import { DEFAULT_MANAGER_DASHBOARD_SETTINGS } from "@/mocks/data/seedManagerDashboard";
import { DEFAULT_SDR_TEMPLATES } from "@/features/sdr/templates/defaults";
import { DEFAULT_SDR_QUOTE_TEMPLATES } from "@/features/sdr-quote/templates/defaults";
import { DEFAULT_SHIPPING_CONFIG } from "@/features/shipping/config/defaults";
import { DEFAULT_BADGE_CATALOG } from "@/features/gamification/catalog/badgeCatalog";
import { DEFAULT_ECOMMERCE_INTEGRATION_SETTINGS } from "@/features/ecommerce-integration/config/defaults";

/**
 * Builds a clean default {@link IPlatformSettings} for a newly created store
 * (Bloco A1). Store-specific monetary values start at zero; business defaults
 * come from the shared DEFAULT_* constants. Deep-clones array/object defaults so
 * stores never share mutable references.
 *
 * @see docs/superpowers/specs/2026-06-19-bloco-a-gestao-lojas-design.md
 */
export function buildDefaultSettings(storeId: ID): IPlatformSettings {
  const clone = <T>(v: T): T => structuredClone(v);
  return {
    storeId,
    lifecycleThresholds: { dormantDays: 60, lostDays: 180 },
    vehicleCadastroMode: "aprovacao_obrigatoria",
    tagSuggestions: clone(SEED_TAGS),
    pipelineStages: clone(SEED_PIPELINE_STAGES),
    lossReasons: clone(SEED_LOSS_REASONS),
    gamificationRules: {
      active: true,
      pointsPerOrder: 10,
      pointsPerRecovery: 25,
      pointsPerPositivation: 5,
      pointsPerGoalCompleted: 100,
      pointsPerGoalExceeded: 50,
      pointsPerNewCustomer: 10,
      pointsPerHighTicketOrder: 15,
      thresholdHighTicket: 1500,
      thresholdBigTicket: 5000,
      notifyOnBadgeEarned: false,
      badges: clone(DEFAULT_BADGE_CATALOG),
    },
    whatsappAccounts: [],
    defaultDivision: "parts",
    distribution: clone(DEFAULT_DISTRIBUTION_SETTINGS),
    managerDashboard: clone(DEFAULT_MANAGER_DASHBOARD_SETTINGS),
    sdrEnabled: false,
    sdrTemplates: clone(DEFAULT_SDR_TEMPLATES),
    sdrQuoteValidityDays: 7,
    sdrAutoDiscountPct: 0,
    sdrQuoteTemplates: clone(DEFAULT_SDR_QUOTE_TEMPLATES),
    shipping: clone(DEFAULT_SHIPPING_CONFIG),
    escalationQueueTimeoutMinutesUrgent: 5,
    escalationQueueTimeoutMinutesNormal: 30,
    escalationCustomerHandoffTemplate: "",
    escalationUrgentBroadcastDelaySeconds: 30,
    discountApprovalThresholdPct: 0.05,
    quoteDefaultValidityDays: 7,
    abcCurveSettings: { periodMonths: 12, classAThreshold: 0.8, classBThreshold: 0.95 },
    commissionSettings: {
      active: true,
      defaultRate: 0.03,
      splitPolicy: "coverage_full",
      goalBonusEnabled: true,
      rules: [],
      closedPeriods: [],
    },
    financialSettings: {
      taxOnSalesPct: 0.16,
      taxOnProfitPct: 0.2,
      fixedExpenses: { payroll: 0, rentInfra: 0, other: 0 },
    },
    cashflowSettings: { openingBalance: 0, minBalanceAlert: 0 },
    inventoryAnalysisSettings: {
      consumptionWindowDays: 90,
      targetCoverageDays: 30,
      excessCoverageDays: 180,
    },
    insightsEnabled: true,
    insightThresholds: clone(DEFAULT_INSIGHT_THRESHOLDS),
    storefront: clone(DEFAULT_STOREFRONT_CONFIG),
    ecommerceIntegration: clone(DEFAULT_ECOMMERCE_INTEGRATION_SETTINGS),
  };
}
```

> Nota: se algum `DEFAULT_*` acima divergir do tipo atual de `IPlatformSettings`, ajustar o campo conforme o tipo real (cruzar com `seedStore.ts`, que é a referência viva da forma completa). O teste de tipos (`tsc`) é o juiz.

- [ ] **Step 4: Rodar o teste e ver passar**

Run: `bun run test src/providers/data/engine/buildDefaultSettings.test.ts`
Expected: PASS (4 testes).

- [ ] **Step 5: (Opcional) refatorar `seedStore.ts` para reusar a factory** — pular se introduzir divergência de valores da matriz; a matriz mantém seus valores próprios. Não obrigatório.

- [ ] **Step 6: Commit**

```bash
git add src/providers/data/engine/buildDefaultSettings.ts src/providers/data/engine/buildDefaultSettings.test.ts
git commit -m "feat(multistore): add buildDefaultSettings factory for new stores"
```

---

### Task 3: Migration DB — `is_active`, RPCs Owner-only, `stores_select` ampliado

**Files:**
- Create: `supabase/migrations/20260619180000_store_crud_owner_rpc.sql`

**Interfaces:**
- Produces (chamáveis pelo provider supabase): RPCs `create_store`, `update_store`, `set_store_active`; coluna `stores.is_active`.

- [ ] **Step 1: Escrever a migration**

```sql
-- Bloco A1 — CRUD de lojas Owner-only + soft-delete.
-- Mantém a RLS base intacta: escrita cross-loja só via RPC SECURITY DEFINER.

-- 1. Soft-delete flag.
alter table public.stores
  add column if not exists is_active boolean not null default true;

-- 2. Owner pode LER todas as lojas (necessário para gerenciar filiais).
--    Aditivo: com 1 loja o resultado é idêntico ao atual.
drop policy if exists stores_select on public.stores;
create policy stores_select on public.stores
  for select to authenticated
  using (id = public.current_store_id() or public.current_app_role() = 'owner');

-- 3. RPC: criar loja (filial/parceira). Owner-only.
--    O id é fornecido pelo cliente (crypto.randomUUID) para que settings.storeId
--    case com o id real da loja — espelha o padrão de createInputToRow do customers.
create or replace function public.create_store(
  p_id uuid,
  p_name text,
  p_type text,
  p_cnpj text,
  p_address text,
  p_manager_id uuid,
  p_active_divisions text[],
  p_settings jsonb
) returns public.stores
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.stores;
begin
  if public.current_app_role() <> 'owner' then
    raise exception 'Apenas o proprietario pode criar lojas' using errcode = '42501';
  end if;
  if p_type not in ('filial', 'parceira') then
    raise exception 'Tipo de loja invalido para criacao: %', p_type using errcode = '22023';
  end if;
  insert into public.stores (id, name, type, cnpj, address, manager_id, active_divisions, settings, is_active)
  values (p_id, p_name, p_type, p_cnpj, p_address, p_manager_id,
          coalesce(p_active_divisions, array['parts']), p_settings, true)
  returning * into v_row;
  return v_row;
end;
$$;

-- 4. RPC: editar loja existente (qualquer loja). Owner-only. Nunca muda id/type.
create or replace function public.update_store(
  p_id uuid,
  p_name text,
  p_cnpj text,
  p_address text,
  p_manager_id uuid,
  p_active_divisions text[]
) returns public.stores
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.stores;
begin
  if public.current_app_role() <> 'owner' then
    raise exception 'Apenas o proprietario pode editar lojas' using errcode = '42501';
  end if;
  update public.stores set
    name = coalesce(p_name, name),
    cnpj = coalesce(p_cnpj, cnpj),
    address = coalesce(p_address, address),
    manager_id = p_manager_id,
    active_divisions = coalesce(p_active_divisions, active_divisions)
  where id = p_id
  returning * into v_row;
  if v_row.id is null then
    raise exception 'Loja nao encontrada: %', p_id using errcode = 'P0002';
  end if;
  return v_row;
end;
$$;

-- 5. RPC: ativar/desativar loja. Owner-only. Guarda matriz e última ativa.
create or replace function public.set_store_active(
  p_id uuid,
  p_active boolean
) returns public.stores
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.stores;
  v_active_count int;
begin
  if public.current_app_role() <> 'owner' then
    raise exception 'Apenas o proprietario pode ativar/desativar lojas' using errcode = '42501';
  end if;
  if p_active = false then
    if exists (select 1 from public.stores where id = p_id and type = 'matriz') then
      raise exception 'A matriz nao pode ser desativada' using errcode = '22023';
    end if;
    select count(*) into v_active_count from public.stores where is_active = true;
    if v_active_count <= 1 then
      raise exception 'Nao e possivel desativar a ultima loja ativa' using errcode = '22023';
    end if;
  end if;
  update public.stores set is_active = p_active where id = p_id returning * into v_row;
  if v_row.id is null then
    raise exception 'Loja nao encontrada: %', p_id using errcode = 'P0002';
  end if;
  return v_row;
end;
$$;

-- 6. Bloquear execução por anon; liberar para authenticated (o gate de owner é interno).
revoke all on function public.create_store(uuid,text,text,text,text,uuid,text[],jsonb) from anon;
revoke all on function public.update_store(uuid,text,text,text,uuid,text[]) from anon;
revoke all on function public.set_store_active(uuid,boolean) from anon;
grant execute on function public.create_store(uuid,text,text,text,text,uuid,text[],jsonb) to authenticated;
grant execute on function public.update_store(uuid,text,text,text,uuid,text[]) to authenticated;
grant execute on function public.set_store_active(uuid,boolean) to authenticated;
```

- [ ] **Step 2: Validar a sintaxe em branch Supabase (NÃO em prod)**

Aplicar via branch Supabase (`create_branch`) ou revisão do dono. **Não** aplicar em produção sem confirmação. Após aplicar na branch, conferir `get_advisors` (security) — esperar zero novos warnings críticos além dos pré-existentes.

- [ ] **Step 3: Rodar a regressão de RLS**

Run (na branch/ambiente de teste): `supabase/tests/rls-regression.sql`
Expected: verde; com 1 loja, contagens dos 807 clientes/7 vendedores idênticas ao baseline.

- [ ] **Step 4: Commit (migration versionada)**

```bash
git add supabase/migrations/20260619180000_store_crud_owner_rpc.sql
git commit -m "feat(db): store CRUD owner-only RPCs + is_active + owner cross-store select"
```

---

### Task 4: Contrato `IStoresProvider` (+ create/update/setActive)

**Files:**
- Modify: `src/providers/data/contracts/stores.ts`

**Interfaces:**
- Consumes: `IStore` (com `isActive`).
- Produces:
  - `create(input: IStoreCreateInput): Promise<IStore>`
  - `update(id: ID, patch: IStoreUpdateInput): Promise<IStore>`
  - `setActive(id: ID, active: boolean): Promise<IStore>`
  - Tipos `IStoreCreateInput` (sem `id`/`createdAt`/`isActive`/`settings` opcional) e `IStoreUpdateInput`.

- [ ] **Step 1: Estender o contrato**

```typescript
import type { Division, ID, IPlatformSettings, IStore, StoreType } from "@/shared/types";

export interface IStoreCreateInput {
  name: string;
  type: Extract<StoreType, "filial" | "parceira">;
  cnpj: string;
  address: string;
  managerId?: ID;
  activeDivisions: Division[];
  /** Quando omitido, o provider usa buildDefaultSettings(novo id). */
  settings?: IPlatformSettings;
}

export interface IStoreUpdateInput {
  name?: string;
  cnpj?: string;
  address?: string;
  managerId?: ID;
  activeDivisions?: Division[];
}

export interface IStoresProvider {
  list(): Promise<IStore[]>;
  get(id: ID): Promise<IStore>;
  create(input: IStoreCreateInput): Promise<IStore>;
  update(id: ID, patch: IStoreUpdateInput): Promise<IStore>;
  setActive(id: ID, active: boolean): Promise<IStore>;
}
```

- [ ] **Step 2: Verificar que as 2 impls agora falham o build (esperado, guiará Tasks 5-6)**

Run: `bunx tsc --noEmit 2>&1 | grep -E "impl/(mock|supabase)/stores.ts"`
Expected: erros indicando que `create`/`update`/`setActive` faltam nas duas impls.

- [ ] **Step 3: Commit**

```bash
git add src/providers/data/contracts/stores.ts
git commit -m "feat(multistore): extend IStoresProvider with create/update/setActive"
```

---

### Task 5: Supabase impl (mutações via RPC)

**Files:**
- Modify: `src/providers/data/impl/supabase/stores.ts`

**Interfaces:**
- Consumes: RPCs `create_store`/`update_store`/`set_store_active` (Task 3); `buildDefaultSettings` (Task 2); contrato (Task 4).
- Produces: `supabaseStoresProvider` completo.

- [ ] **Step 1: Adicionar `is_active` ao `StoreRow`/`rowToStore` e as mutações**

No `StoreRow`, adicionar `is_active: boolean;`. No `rowToStore`, adicionar `isActive: row.is_active`.

Adicionar ao objeto `supabaseStoresProvider`:

```typescript
  async create(input) {
    const id = crypto.randomUUID();
    const settings = input.settings ?? buildDefaultSettings(id);
    const { data, error } = await getSupabaseClient().rpc("create_store", {
      p_id: id,
      p_name: input.name,
      p_type: input.type,
      p_cnpj: input.cnpj,
      p_address: input.address,
      p_manager_id: input.managerId ?? null,
      p_active_divisions: input.activeDivisions,
      p_settings: settings,
    });
    if (error) throw new Error(`[supabase] stores.create failed: ${error.message}`);
    return rowToStore(data as StoreRow);
  },

  async update(id, patch) {
    const { data, error } = await getSupabaseClient().rpc("update_store", {
      p_id: id,
      p_name: patch.name ?? null,
      p_cnpj: patch.cnpj ?? null,
      p_address: patch.address ?? null,
      p_manager_id: patch.managerId ?? null,
      p_active_divisions: patch.activeDivisions ?? null,
    });
    if (error) throw new Error(`[supabase] stores.update(${id}) failed: ${error.message}`);
    return rowToStore(data as StoreRow);
  },

  async setActive(id, active) {
    const { data, error } = await getSupabaseClient().rpc("set_store_active", {
      p_id: id,
      p_active: active,
    });
    if (error) throw new Error(`[supabase] stores.setActive(${id}) failed: ${error.message}`);
    return rowToStore(data as StoreRow);
  },
```

> A RPC retorna `public.stores` (single row), então `data` é o row, não array.

- [ ] **Step 2: Importar `buildDefaultSettings`**

Adicionar `import { buildDefaultSettings } from "../../engine/buildDefaultSettings";` (caminho relativo dentro de `providers/data` — criado na Task 2). Sem problema de ESLint.

- [ ] **Step 3: Build de tipos**

Run: `bunx tsc --noEmit 2>&1 | grep "supabase/stores.ts"`
Expected: sem erros nesse arquivo.

- [ ] **Step 4: Commit**

```bash
git add src/providers/data/impl/supabase/stores.ts
git commit -m "feat(multistore): supabase store create/update/setActive via owner RPCs"
```

---

### Task 6: Mock impl + storesApi + mutação no mockStore (TDD)

**Files:**
- Modify: `src/providers/data/impl/mock/stores.ts`
- Modify: `src/mocks/api/stores.ts`
- Modify: `src/mocks/store/selectors.ts` (se preciso, helper de upsert)
- Create: `src/mocks/api/stores.test.ts`

**Interfaces:**
- Consumes: `useMockStore`/`getMockState().patch`, `buildDefaultSettings`, contrato (Task 4).
- Produces: `storesApi.create/update/setActive` + `mockStoresProvider` completo, com as mesmas guardas (não desativar matriz/última).

- [ ] **Step 1: Escrever o teste falhando**

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { storesApi } from "@/mocks";
import { resetMockStore } from "@/mocks/store/mockStore";
import { DEFAULT_SEED } from "@/mocks/config";

describe("storesApi mutations", () => {
  beforeEach(() => resetMockStore(DEFAULT_SEED));

  it("cria uma filial com isActive true", async () => {
    const created = await storesApi.create({
      name: "GALLO Erechim", type: "filial", cnpj: "00.000.000/0001-00",
      address: "Erechim/RS", activeDivisions: ["parts"],
    });
    expect(created.id).toBeTruthy();
    expect(created.isActive).toBe(true);
    const all = await storesApi.list();
    expect(all.some((s) => s.id === created.id)).toBe(true);
  });

  it("rejeita desativar a matriz", async () => {
    const all = await storesApi.list();
    const matriz = all.find((s) => s.type === "matriz")!;
    await expect(storesApi.setActive(matriz.id, false)).rejects.toThrow();
  });

  it("rejeita desativar a última loja ativa", async () => {
    const all = await storesApi.list();
    // só a matriz existe no seed; tentar desativar qualquer coisa que reste ativa falha
    const onlyActive = all.filter((s) => s.isActive);
    if (onlyActive.length === 1) {
      await expect(storesApi.setActive(onlyActive[0].id, false)).rejects.toThrow();
    }
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `bun run test src/mocks/api/stores.test.ts`
Expected: FAIL (`storesApi.create is not a function`).

- [ ] **Step 3: Implementar `storesApi` mutações**

Em `src/mocks/api/stores.ts`:
- Importar a factory: `import { buildDefaultSettings } from "@/providers/data/engine/buildDefaultSettings";` (permitido: `src/mocks/**` é isento da regra ESLint; sem ciclo — a factory importa `@/mocks/data/seed*`, não `@/mocks/api`).
- `create(input)`: gera `const id = crypto.randomUUID();`, `const settings = input.settings ?? buildDefaultSettings(id);`, monta o `IStore` (`isActive: true`, `createdAt` via `new Date().toISOString()`), e persiste via `getMockState().patch({ stores: [...selectAllStores(), store] })`.
- `update(id, patch)`: aplica o patch ao store existente (nunca muda `id`/`type`/`storeId`), persiste.
- `setActive(id, active)`: com as **guardas** (rejeita desativar `type === 'matriz'`; rejeita desativar se só houver 1 loja ativa) via `MockValidationError`.
- Seguir o padrão `runApi`/`MockNotFoundError`/`MockValidationError` já usado no arquivo.

- [ ] **Step 4: Ligar o `mockStoresProvider`**

```typescript
export const mockStoresProvider: IStoresProvider = {
  list: () => storesApi.list(),
  get: (id) => storesApi.get(id),
  create: (input) => storesApi.create(input),
  update: (id, patch) => storesApi.update(id, patch),
  setActive: (id, active) => storesApi.setActive(id, active),
};
```

- [ ] **Step 5: Rodar e ver passar**

Run: `bun run test src/mocks/api/stores.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/mocks/api/stores.ts src/mocks/api/stores.test.ts src/providers/data/impl/mock/stores.ts src/mocks/store/selectors.ts
git commit -m "feat(multistore): mock store create/update/setActive with guards"
```

---

### Task 7: `refreshStores()` no MultistoreProvider

**Files:**
- Modify: `src/features/multistore/MultistoreProvider.tsx`
- Modify: `src/features/multistore/MultistoreContext.ts` (adicionar `refreshStores` ao tipo)
- Modify: `src/features/multistore/hooks/useCurrentStore.ts` (expor se necessário)

**Interfaces:**
- Produces: `IMultistoreContextValue.refreshStores: () => Promise<void>` — recarrega o roster preservando a loja ativa (se ainda acessível) e rodando o fallback se a loja ativa sumiu.

- [ ] **Step 1: Extrair o carregamento do roster numa função reutilizável**

Transformar o corpo do `useEffect` de carga (linhas ~79-95) numa `loadRoster` via `useCallback`, e chamá-la no mount. Adicionar `refreshStores` que reexecuta `loadRoster`.

- [ ] **Step 2: Adicionar ao value e ao tipo do contexto**

Incluir `refreshStores` em `IMultistoreContextValue` e no `useMemo(value)`.

- [ ] **Step 3: Build de tipos**

Run: `bunx tsc --noEmit 2>&1 | grep -E "multistore/(MultistoreProvider|MultistoreContext)"`
Expected: sem erros novos.

- [ ] **Step 4: Commit**

```bash
git add src/features/multistore/MultistoreProvider.tsx src/features/multistore/MultistoreContext.ts src/features/multistore/hooks/useCurrentStore.ts
git commit -m "feat(multistore): expose refreshStores to reflect new stores without reload"
```

---

### Task 8: `StoreFormSheet` (criar/editar loja)

**Files:**
- Create: `src/features/multistore/components/StoreFormSheet.tsx`
- Create: `src/features/multistore/engine/storeForm.ts` (zod schema + tipos)
- Create: `src/features/multistore/engine/storeForm.test.ts`

**Interfaces:**
- Consumes: `useStoresProvider()`, `useSellersProvider()` (para o select de gestor), `useCurrentStore().refreshStores`.
- Produces: `<StoreFormSheet open onOpenChange store?={IStore} />` — Sheet de criação (sem `store`) ou edição (com `store`).

- [ ] **Step 1: Escrever o schema zod + teste (TDD)**

`storeForm.ts`: schema com `name` (min 2), `type` (`enum ['filial','parceira']`), `cnpj` (regex CNPJ), `address` (min 3), `managerId` (opcional), `activeDivisions` (array não vazio, default `['parts']`). Teste cobrindo aceitação e rejeição (cnpj inválido, name curto).

Run: `bun run test src/features/multistore/engine/storeForm.test.ts` → FAIL, depois PASS.

- [ ] **Step 2: Implementar o Sheet copiando `SellerFormDialog`**

Espelhar o padrão de `src/features/admin-settings/components/SellerFormDialog.tsx`: Sheet `side="right"`, `useForm({ resolver: zodResolver(storeFormSchema) })`, `useMutation` chamando `provider.create`/`provider.update`, `onSuccess`: `toast.success`, `refreshStores()`, `onOpenChange(false)`. Footer persistente com "Salvar"/"Cancelar". Campos pt-BR com acentos.

- [ ] **Step 3: Build + lint**

Run: `bun run build && bun run lint`
Expected: sucesso.

- [ ] **Step 4: Commit**

```bash
git add src/features/multistore/components/StoreFormSheet.tsx src/features/multistore/engine/storeForm.ts src/features/multistore/engine/storeForm.test.ts
git commit -m "feat(multistore): StoreFormSheet for creating/editing stores"
```

---

### Task 9: `StoresPage` gerenciável (gates + ações)

**Files:**
- Modify: `src/features/multistore/pages/StoresPage.tsx`
- Modify: `src/features/multistore/index.ts` (barrel, se preciso exportar StoreFormSheet)

**Interfaces:**
- Consumes: `<Can>` (RBAC), `StoreFormSheet`, `useStoresProvider`, `useCurrentStore`.

- [ ] **Step 1: Reescrever a página**

- Header: remover o badge "Somente leitura · gestão na Fase 2" e o hint pontilhado.
- Botão "Nova loja" dentro de `<Can resource="store" action="create">` → abre `StoreFormSheet` (sem `store`).
- Em cada `StoreCard`: ícone de editar dentro de `<Can resource="store" action="edit">` → abre `StoreFormSheet` com `store`. Toggle Ativar/Desativar dentro de `<Can resource="store" action="edit">`, **oculto para `type === 'matriz'`**, chamando `provider.setActive` + `refreshStores` + toast (erro vira toast claro vindo da guarda do servidor/mock).
- Cards de lojas inativas: aparência esmaecida + rótulo "Inativa".
- Manter o fetch existente (ou migrar para `useStoresProvider().list()` reativo); após mutação, `refreshStores()` atualiza tanto a página quanto o StoreSwitcher.

- [ ] **Step 2: Verificar gates por papel**

Run: `bun run build`
Expected: sucesso. (Validação funcional do gate por papel é manual/no smoke — Owner vê botões; Gestor não.)

- [ ] **Step 3: Commit**

```bash
git add src/features/multistore/pages/StoresPage.tsx src/features/multistore/index.ts
git commit -m "feat(multistore): manageable StoresPage with create/edit/deactivate (owner-gated)"
```

---

### Task 10: Verificação final + PR

- [ ] **Step 1: Suite completa**

Run: `bun run build && bun run test`
Expected: build verde; todos os testes passam (incluindo os novos de `buildDefaultSettings`, `storesApi`, `storeForm`).

- [ ] **Step 2: tsc por delta**

Run: `bunx tsc --noEmit` — conferir que nenhum erro **novo** foi introduzido nos arquivos criados/modificados (baseline pré-existente ignorado).

- [ ] **Step 3: Abrir PR (sem merge)**

```bash
git push -u origin feat/multistore-crud-lojas
gh pr create --base main --title "feat(multistore): Bloco A1 — CRUD de lojas (owner-only)" --body "..."
```

- [ ] **Step 4: Rollout do banco (confirmado pelo dono)**

A migration `20260619180000_store_crud_owner_rpc.sql` é aplicada em produção **somente após** confirmação do dono (preferir branch Supabase + `rls-regression` antes). O código já lida com a ausência (mutações falham com erro claro até a migration existir).

---

## Self-Review (preenchido)

- **Spec coverage:** A1.1 (DB) → Tasks 1,3; A1.2 (provider) → Tasks 2,4,5,6; A1.3 (UI) → Tasks 7,8,9; critérios de aceitação A1 → cobertos por testes (Tasks 2,6) + smoke (Task 10). A2 fica para plano próprio (fora deste plano, conforme spec).
- **Placeholder scan:** sem TODO/TBD; o único ponto "ajustar conforme tipo real" (Task 2/5) é guiado por `tsc` e pelo arquivo de referência `seedStore.ts`.
- **Type consistency:** `IStoreCreateInput`/`IStoreUpdateInput`/`setActive` usados consistentemente entre Tasks 4–9; `isActive` adicionado no tipo (Task 1) antes de ser consumido (Tasks 5,6,9). `create_store` recebe `p_id` (Task 3) e o provider gera o id (Task 5) → `settings.storeId` casa com o id real da loja.
- **Fronteira ESLint:** `buildDefaultSettings` vive em `src/providers/data/engine/` (isento da regra, `eslint.config.js:43`); supabase importa por caminho relativo, mock (`src/mocks/api`) importa via `@/providers/data/engine` (isento). Sem violação e sem ciclo.
