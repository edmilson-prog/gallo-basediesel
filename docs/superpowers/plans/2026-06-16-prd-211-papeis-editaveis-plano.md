# PRD-211 — Papéis Editáveis + Aprofundamento de Usuário — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformar o RBAC hardcoded (PRD-006) em um sistema de papéis e permissões persistido e editável, com recursos como dado, Departamento (`ITeam`) ativado e tela completa de gestão de usuários — sem regressão de comportamento e sem brecha de enforcement.

**Architecture:** Fonte da verdade em tabelas `public.roles` / `public.role_permissions` / `public.rbac_resources` (+ `public.departments`). A UI lê a matriz via cache em memória (assinatura síncrona de `hasPermission` preservada). A RLS continua governada pelo **papel base** no JWT; papéis customizados carregam `base_role` (um dos 7 de sistema), então nenhuma policy RLS é reescrita. Mock e Supabase entregues no mesmo ciclo (drop-in via Provider Pattern). Codinome do release definido no versionamento (inédito — ver roteiro do épico).

**Tech Stack:** React 19, TanStack Router/Query, Tailwind v4 + shadcn/ui, Zustand (mock store), Vitest (TDD nos núcleos), Supabase (migrations `public` + RLS), bun.

---

## Premissas e decisões (aprovadas)

- **Schema `public`** (não `crm`).
- **`base_role`** em papéis customizados governa a RLS; matriz fina refina UI/navegação.
- **"Suspenso"** reusa `sellers.active=false` (sem nova coluna de status); soft delete continua via `deleted_at`.
- **Papéis customizados globais** (sem `store_id`) no MVP — coluna `store_id` nullable já prevista para futuro.
- Papel de **sistema**: protegido contra exclusão/renomeação; permissões editáveis com aviso + "restaurar padrão". **Owner imutável**.
- Toda mutação audita via `auditLog()` (PRD-006), com `before`/`after`.

## Reconciliação com o seed legado (descoberta na execução)

Existe uma plumbing **legada e divergente** no mock, **sem consumidor no app** (apontada no relatório de código morto): `src/mocks/data/seedRoles.ts` (`SEED_ROLES`/`SEED_ROLE_BY_NAME`), `src/mocks/api/roles.ts` (`rolesApi`), `selectAllRoles` no store, e o populate em `src/mocks/generators/bootstrap.ts`. Suas permissões **não** batem com a `PERMISSIONS_MATRIX` (tem recursos inexistentes como `report`/`catalog`). As features sempre usaram a `PERMISSIONS_MATRIX` hardcoded, nunca esse seed.

**Decisão:** **migrar** essa plumbing para o novo modelo (não criar estrutura paralela). A expansão de `IRole` (Task 1) já quebra o `tsc` em `seedRoles.ts` — a correção é **dobrada na Task 2** (rewrite de `seedRoles.ts` para consumir `buildRoleSeed()` + fix do `bootstrap.ts`), pois o builder é o consumidor natural e isso zera o delta de `tsc` cedo. A Task 5 passa a cobrir só as **novas** coleções (`rbacResources`, `departments`) e o wiring; a Task 6 expande `rolesApi` para o contrato `IRolesProvider`. ESLint permite `src/mocks/** → @/features/rbac` (mocks é `ignores` em `no-restricted-imports`).

## Convenção de validação por tarefa

- **Testes:** `bun run test <arquivo>` (Vitest). TDD nos núcleos (`seed`, `rbacConfig`, scope `team`).
- **Build/gate:** `bun run build` (Vite) + `bun run test`. `tsc --noEmit` tem baseline pré-existente — avaliar **só o delta** de código novo.
- **Migrations em produção:** aplicar via MCP `apply_migration` **somente com autorização explícita do dono**, e **espelhar o arquivo em `supabase/migrations/` no mesmo passo** (regra do projeto). Antes de cada migration que mexe em RLS: ler uma policy Owner-only existente (ex.: `stores`/`settings`) para copiar o predicado de papel staff.

---

## File Structure

**Tipos (modificar):**
- `src/shared/types/people.ts` — expandir `IRole`; novo `IRbacResource`; `ISeller` + `departmentId?` + `rotation?`.
- `src/shared/types/platform.ts` — `ITeam` documentado/aliased como Departamento (`export type IDepartment = ITeam`).

**RBAC — núcleo (criar/modificar):**
- `src/features/rbac/permissions/seed.ts` *(novo)* — converte as constantes atuais em linhas persistíveis.
- `src/features/rbac/permissions/seed.test.ts` *(novo)* — teste diff-vazio (paridade com `PERMISSIONS_MATRIX`).
- `src/features/rbac/store/rbacConfig.ts` *(novo)* — cache em memória da matriz persistida (loader + invalidação + snapshot síncrono).
- `src/features/rbac/utils/hasPermission.ts` *(modificar)* — lê do snapshot do cache, com fallback para a constante até hidratar.
- `src/features/rbac/index.ts` *(modificar)* — exportar o necessário (cache loader, tipos).

**Provider Pattern (criar/modificar):**
- `src/providers/data/contracts/roles.ts` *(novo)* — `IRolesProvider`.
- `src/providers/data/contracts/departments.ts` *(novo)* — `IDepartmentsProvider`.
- `src/providers/data/contracts/index.ts` *(modificar)* — adicionar `roles`, `departments` a `IDataProviders`.
- `src/providers/data/impl/mock/roles.ts`, `impl/mock/departments.ts` *(novos)*.
- `src/providers/data/impl/supabase/roles.ts`, `impl/supabase/departments.ts` *(novos)*.
- `src/providers/data/factory.ts` *(modificar)* — registrar nos dois bundles.
- `src/providers/data/hooks/useRolesProvider.ts`, `hooks/useDepartmentsProvider.ts` *(novos)* + barrel `src/providers/data/index.ts`.

**Mock store/data:**
- `src/mocks/data/rbac.ts` *(novo)* — seed inicial (gerado por `buildRoleSeed`/`buildResourceSeed`) + departamentos exemplo.
- `src/mocks/api/roles.ts`, `src/mocks/api/departments.ts` *(novos)* — endpoints simulados sobre o Zustand store.
- `src/mocks/store/` — registrar coleções `roles`, `rolePermissions`, `rbacResources`, `departments`.

**Migrations (novas, `supabase/migrations/`):**
- `<ts>_rbac_roles.sql` — `roles`, `role_permissions`, `rbac_resources` + RLS + seed dos 7 papéis e 34 recursos.
- `<ts>_departments.sql` — `departments` + RLS.
- `<ts>_sellers_department_rotation.sql` — `sellers` ALTER (`department_id`, `rotation`).

**Features/Rotas:**
- `src/features/rbac/pages/RolesPage.tsx` *(reescrever — editor)*.
- `src/features/rbac/components/role-editor/*` *(novos)* — `RoleRail`, `PermissionMatrix`, `ResourceAreaGroup`, `PermissionCell`, `ScopeSelect`, `RoleFormDialog`, `SystemRoleWarning`.
- `src/features/rbac/i18n/pt-BR.ts` *(novo/expandir)*.
- `src/features/people/` *(nova feature)* — `pages/UsersPage.tsx`, `components/UserSheet.tsx`, `components/UserList.tsx`, `components/DepartmentManager.tsx`, `hooks/*`, `i18n/pt-BR.ts`, `index.ts`.
- `src/routes/app.configuracoes.usuarios.tsx` *(novo)*.
- `src/routes/app.configuracoes.departamentos.tsx` *(novo)* (ou subseção de usuários — decidir na Fase 4).

---

# FASE 1 — Modelo e Seed

> Objetivo: fonte da verdade persistida, **sem mudança de comportamento**. Gate: diff vazio.

### Task 1: Tipos de domínio

**Files:**
- Modify: `src/shared/types/people.ts`
- Modify: `src/shared/types/platform.ts`

- [ ] **Step 1: Expandir `IRole` e adicionar `IRbacResource` em `people.ts`**

Substituir a interface `IRole` atual por:

```typescript
/** Persisted, editable role (PRD-211). `slug` is stable and referenced by code/RLS. */
export interface IRole {
  id: ID;
  /** Stable identifier referenced by code and RLS — immutable for system roles. */
  slug: string;
  /** Human label shown in the UI. */
  name: string;
  description?: string;
  /** System roles are protected against rename/delete; permissions still editable. */
  isSystem: boolean;
  /** Owner only: permission set is immutable (prevents self-lockout). */
  isOwnerImmutable: boolean;
  /**
   * One of the 7 system role slugs. Governs RLS enforcement for custom roles:
   * a custom role can never grant beyond its base system role. For system roles,
   * baseRole === slug.
   */
  baseRole: RoleName;
  /** null = global role (MVP default); future: per-store custom roles. */
  storeId?: ID | null;
  permissions: IPermission[];
  createdAt: ISO8601;
  updatedAt: ISO8601;
}

/** RBAC resource catalog entry — resources become data, not a code union (PRD-211). */
export interface IRbacResource {
  /** Stable key matching the ResourceName union (e.g. "customer"). */
  key: string;
  /** Friendly label (e.g. "Clientes"). */
  label: string;
  /** Area/group for collapsible UI grouping (e.g. "Comercial"). */
  group: string;
  /** Display order within the group. */
  sortOrder: number;
}
```

Confirmar que `ID` e `ISO8601` já estão importados no topo de `people.ts` (vêm de `common.ts`).

- [ ] **Step 2: Adicionar `departmentId` e `rotation` em `ISeller`**

Dentro da interface `ISeller`, após `vehicleCadastroMode?`:

```typescript
  /** Department the user belongs to (PRD-211 — at most one in MVP). */
  departmentId?: ID | null;
  /** Rotation participation toggle (PRD-213 placeholder — created here). */
  rotation?: { enabled: boolean };
```

- [ ] **Step 3: Documentar `ITeam` como Departamento em `platform.ts`**

Logo após a definição de `ITeam`, adicionar o alias e atualizar o comentário (não remover `ITeam` — é o nome usado pelo modelo):

```typescript
/**
 * Department (PRD-211). Alias of ITeam — the dormant team entity is revived and
 * repositioned as "Departamento". Use IDepartment in new code for intent.
 */
export type IDepartment = ITeam;
```

- [ ] **Step 4: Verificar barrels e build**

Run: `bun run build`
Expected: build OK. Conferir que `IDepartment`, `IRbacResource` são exportados pelo barrel `src/shared/types/index.ts` (adicionar export de `IDepartment` se o barrel reexporta por nome).

- [ ] **Step 5: Commit**

```bash
git add src/shared/types/people.ts src/shared/types/platform.ts src/shared/types/index.ts
git commit -m "feat(rbac): domain types for persisted roles, resources, departments"
```

---

### Task 2: Seed builder a partir da matriz atual (TDD — o gate de diff vazio)

**Files:**
- Create: `src/features/rbac/permissions/seed.ts`
- Test: `src/features/rbac/permissions/seed.test.ts`

- [ ] **Step 1: Escrever o teste de paridade (falha primeiro)**

```typescript
import { describe, it, expect } from "vitest";
import { PERMISSIONS_MATRIX } from "./matrix";
import { RESOURCES } from "./resources";
import { buildRoleSeed, buildResourceSeed } from "./seed";

describe("RBAC seed parity (PRD-211 RF-003)", () => {
  it("reproduces PERMISSIONS_MATRIX exactly (empty diff)", () => {
    const seed = buildRoleSeed();
    // For every system role, the seeded permission set must equal the constant.
    for (const role of Object.keys(PERMISSIONS_MATRIX) as (keyof typeof PERMISSIONS_MATRIX)[]) {
      const seeded = seed.find((r) => r.slug === role);
      expect(seeded, `role ${role} missing from seed`).toBeDefined();
      // Compare as a normalized map resource -> {actions sorted, scope}.
      const norm = (perms: typeof PERMISSIONS_MATRIX[typeof role]) =>
        Object.fromEntries(
          perms.map((p) => [p.resource, { actions: [...p.actions].sort(), scope: p.scope }]),
        );
      expect(norm(seeded!.permissions)).toEqual(norm(PERMISSIONS_MATRIX[role]));
    }
  });

  it("seeds all 34 resources with label, group and order", () => {
    const resources = buildResourceSeed();
    expect(resources.length).toBe(RESOURCES.length);
    for (const key of RESOURCES) {
      const entry = resources.find((r) => r.key === key);
      expect(entry, `resource ${key} missing`).toBeDefined();
      expect(entry!.label.length).toBeGreaterThan(0);
      expect(entry!.group.length).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: Rodar o teste (deve falhar — `seed.ts` não existe)**

Run: `bun run test src/features/rbac/permissions/seed.test.ts`
Expected: FAIL (módulo não encontrado).

- [ ] **Step 3: Implementar `seed.ts`**

```typescript
import type { IPermission, IRbacResource, IRole, RoleName } from "@/shared/types";
import { PERMISSIONS_MATRIX, ROLE_DESCRIPTIONS } from "./matrix";
import { RESOURCES, type ResourceName } from "./resources";

/** Stable label for each system role (mirrors RolesPage ROLE_LABELS). */
const ROLE_LABELS: Record<RoleName, string> = {
  Owner: "Owner",
  Gestor: "Gestor",
  Vendedor: "Vendedor",
  VendedorExterno: "Vendedor Externo",
  SDR: "SDR",
  Financeiro: "Financeiro",
  Cliente: "Cliente",
};

/** Friendly labels + area grouping for the 34 resources (PRD-211 RF-004). */
const RESOURCE_META: Record<ResourceName, { label: string; group: string }> = {
  customer: { label: "Clientes", group: "Comercial" },
  vehicle: { label: "Veículos", group: "Comercial" },
  lead: { label: "Leads", group: "Comercial" },
  conversation: { label: "Conversas", group: "Atendimento" },
  message: { label: "Mensagens", group: "Atendimento" },
  part: { label: "Peças", group: "Catálogo" },
  vehicleModel: { label: "Modelos de veículo", group: "Catálogo" },
  modelKit: { label: "Kits por modelo", group: "Catálogo" },
  quote: { label: "Orçamentos", group: "Comercial" },
  order: { label: "Pedidos", group: "Comercial" },
  commission: { label: "Comissões", group: "Financeiro" },
  goal: { label: "Metas", group: "Gestão" },
  indicator: { label: "Indicadores", group: "Gestão" },
  recommendation: { label: "Recomendações", group: "Comercial" },
  transfer: { label: "Transferências de carteira", group: "Gestão" },
  segment: { label: "Segmentos", group: "Comercial" },
  seller: { label: "Vendedores", group: "Configuração" },
  store: { label: "Lojas", group: "Configuração" },
  settings: { label: "Configurações", group: "Configuração" },
  audit_log: { label: "Auditoria", group: "Configuração" },
  media: { label: "Mídia", group: "Atendimento" },
  role: { label: "Papéis", group: "Configuração" },
  dre: { label: "DRE Gerencial", group: "Financeiro" },
  expense: { label: "Despesas", group: "Financeiro" },
  cashflow: { label: "Fluxo de Caixa", group: "Financeiro" },
  profitability: { label: "Rentabilidade", group: "Financeiro" },
  inventory: { label: "Estoque", group: "Gestão" },
  customer_service_analytics: { label: "Análise de Atendimento", group: "Atendimento" },
  insight: { label: "Insights", group: "Gestão" },
  storefront_admin: { label: "Admin E-commerce", group: "E-commerce" },
  ecommerce_integration: { label: "Integração E-commerce", group: "E-commerce" },
  asset_library: { label: "Biblioteca de Ativos", group: "Atendimento" },
  quick_reply: { label: "Respostas Rápidas", group: "Atendimento" },
  trackable_link: { label: "Links Rastreáveis", group: "Atendimento" },
  scheduled_send: { label: "Envios Agendados", group: "Atendimento" },
};

const GROUP_ORDER = [
  "Comercial",
  "Atendimento",
  "Catálogo",
  "Financeiro",
  "Gestão",
  "E-commerce",
  "Configuração",
];

/** Seed shape for a role (id/timestamps assigned at persistence time). */
export type RoleSeed = Omit<IRole, "id" | "createdAt" | "updatedAt"> & {
  permissions: IPermission[];
};

/** Builds the 7 system roles from the live PERMISSIONS_MATRIX (empty-diff guarantee). */
export function buildRoleSeed(): RoleSeed[] {
  return (Object.keys(PERMISSIONS_MATRIX) as RoleName[]).map((role) => ({
    slug: role,
    name: ROLE_LABELS[role],
    description: ROLE_DESCRIPTIONS[role],
    isSystem: true,
    isOwnerImmutable: role === "Owner",
    baseRole: role,
    storeId: null,
    permissions: PERMISSIONS_MATRIX[role].map((p) => ({
      resource: p.resource,
      actions: [...p.actions],
      scope: p.scope,
    })),
  }));
}

/** Builds the resource catalog, ordered by area then label. */
export function buildResourceSeed(): IRbacResource[] {
  const sorted = [...RESOURCES].sort((a, b) => {
    const ga = GROUP_ORDER.indexOf(RESOURCE_META[a].group);
    const gb = GROUP_ORDER.indexOf(RESOURCE_META[b].group);
    if (ga !== gb) return ga - gb;
    return RESOURCE_META[a].label.localeCompare(RESOURCE_META[b].label, "pt-BR");
  });
  return sorted.map((key, i) => ({
    key,
    label: RESOURCE_META[key].label,
    group: RESOURCE_META[key].group,
    sortOrder: i,
  }));
}
```

> ⚠️ As labels acima vêm de `RolesPage.tsx` (`RESOURCE_LABELS`). Ao implementar, copiar as labels EXATAS já existentes lá para não divergir; ajustar `group` conforme a área real. O agrupamento é editorial — refinar com o dono se necessário, mas não bloqueia o diff (o diff valida só permissões, não labels).

- [ ] **Step 4: Rodar o teste (deve passar)**

Run: `bun run test src/features/rbac/permissions/seed.test.ts`
Expected: PASS (2 testes).

- [ ] **Step 5: Commit**

```bash
git add src/features/rbac/permissions/seed.ts src/features/rbac/permissions/seed.test.ts
git commit -m "feat(rbac): seed builder from matrix with empty-diff parity test"
```

---

### Task 3: Migrations Supabase — `roles`, `role_permissions`, `rbac_resources`

**Files:**
- Create: `supabase/migrations/<ts>_rbac_roles.sql`

- [ ] **Step 1: Inspecionar o predicado de papel staff em uma policy existente**

Antes de escrever a RLS, ler uma policy Owner-only já em produção (ex.: UPDATE de `stores` ou `settings`) para copiar exatamente como o papel é lido do JWT (provável: `auth.jwt() -> 'app_metadata' ->> 'role'` ou função helper). Use `mcp__supabase__execute_sql` (read-only): `select polname, qual, with_check from pg_policies where tablename in ('stores','settings');`. Anotar o predicado canônico → referido abaixo como `IS_OWNER_PREDICATE`.

- [ ] **Step 2: Escrever a migration (DDL + RLS + seed)**

Estrutura do arquivo (preencher `IS_OWNER_PREDICATE` com o predicado real do Step 1; preencher o seed a partir de `buildRoleSeed()`/`buildResourceSeed()`):

```sql
-- PRD-211: persisted, editable RBAC roles + permissions + resource catalog.

create table if not exists public.rbac_resources (
  key text primary key,
  label text not null,
  "group" text not null,
  sort_order integer not null default 0
);

create table if not exists public.roles (
  id text primary key,
  slug text not null unique,
  name text not null,
  description text,
  is_system boolean not null default false,
  is_owner_immutable boolean not null default false,
  base_role text not null,
  store_id text references public.stores(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.role_permissions (
  role_id text not null references public.roles(id) on delete cascade,
  resource text not null,
  actions text[] not null default '{}',
  scope text not null default 'own',
  primary key (role_id, resource)
);
create index if not exists idx_role_permissions_role on public.role_permissions(role_id);

alter table public.rbac_resources enable row level security;
alter table public.roles enable row level security;
alter table public.role_permissions enable row level security;

-- Read: any authenticated user (roles/permissions are not customer-sensitive;
-- the UI needs the full matrix for the editor and per-role enforcement).
create policy rbac_resources_read on public.rbac_resources for select to authenticated using (true);
create policy roles_read on public.roles for select to authenticated using (true);
create policy role_permissions_read on public.role_permissions for select to authenticated using (true);

-- Write: Owner only (mirror IS_OWNER_PREDICATE from existing stores/settings policy).
create policy roles_write on public.roles for all to authenticated
  using (IS_OWNER_PREDICATE) with check (IS_OWNER_PREDICATE);
create policy role_permissions_write on public.role_permissions for all to authenticated
  using (IS_OWNER_PREDICATE) with check (IS_OWNER_PREDICATE);
create policy rbac_resources_write on public.rbac_resources for all to authenticated
  using (IS_OWNER_PREDICATE) with check (IS_OWNER_PREDICATE);

-- Seed: 34 resources + 7 system roles + their permissions.
-- (generate INSERTs from buildResourceSeed() / buildRoleSeed(); role id = slug for system roles)
insert into public.rbac_resources (key, label, "group", sort_order) values
  -- ... 34 rows ...
on conflict (key) do nothing;

insert into public.roles (id, slug, name, description, is_system, is_owner_immutable, base_role, store_id) values
  ('Owner','Owner','Owner','...',true,true,'Owner',null),
  -- ... 6 more system roles ...
on conflict (slug) do nothing;

insert into public.role_permissions (role_id, resource, actions, scope) values
  -- ... one row per (role, resource) from the matrix ...
on conflict (role_id, resource) do nothing;
```

> Gerar os `INSERT`s de forma fiel: rodar `buildRoleSeed()`/`buildResourceSeed()` mentalmente/por script auxiliar e materializar as linhas. O teste da Task 2 é a referência da paridade.

- [ ] **Step 3: Aplicar em produção (com autorização explícita do dono)**

Pausar e pedir autorização. Só então `mcp__supabase__apply_migration` com o conteúdo acima. Verificar com `select count(*) from public.role_permissions;` que o total bate com a soma de linhas da matriz.

- [ ] **Step 4: Espelhar no Git e commit**

```bash
git add supabase/migrations/<ts>_rbac_roles.sql
git commit -m "feat(rbac): roles/role_permissions/rbac_resources tables + RLS + seed"
```

---

### Task 4: Migrations — `departments` + ALTER `sellers`

**Files:**
- Create: `supabase/migrations/<ts>_departments.sql`
- Create: `supabase/migrations/<ts>_sellers_department_rotation.sql`

- [ ] **Step 1: `departments` (DDL + RLS)**

```sql
-- PRD-211: revive ITeam as Department.
create table if not exists public.departments (
  id text primary key,
  name text not null,
  store_id text not null references public.stores(id),
  manager_id text references public.sellers(id),
  created_at timestamptz not null default now()
);
create index if not exists idx_departments_store on public.departments(store_id);

alter table public.departments enable row level security;
-- Read: store-scoped (mirror sellers/stores read predicate). Write: Owner/Gestor.
create policy departments_read on public.departments for select to authenticated using (true);
create policy departments_write on public.departments for all to authenticated
  using (IS_STAFF_PREDICATE) with check (IS_STAFF_PREDICATE);
```

> `IS_STAFF_PREDICATE` = predicado de Owner/Gestor copiado de uma policy de escrita staff existente (ex.: a que permite Gestor editar dentro da loja). Confirmar no Step de inspeção da Task 3.

- [ ] **Step 2: ALTER `sellers`**

```sql
-- PRD-211: department link + rotation placeholder (PRD-213).
alter table public.sellers add column if not exists department_id text references public.departments(id);
alter table public.sellers add column if not exists rotation jsonb not null default '{"enabled": true}'::jsonb;
create index if not exists idx_sellers_department on public.sellers(department_id);
```

- [ ] **Step 3: Aplicar (com autorização) + espelhar + commit**

```bash
git add supabase/migrations/<ts>_departments.sql supabase/migrations/<ts>_sellers_department_rotation.sql
git commit -m "feat(rbac): departments table + sellers department_id/rotation columns"
```

---

### Task 5: Mock store + seed mock

**Files:**
- Create: `src/mocks/data/rbac.ts`
- Modify: mock store (registrar coleções `roles`, `rolePermissions`, `rbacResources`, `departments`)

- [ ] **Step 1: Seed mock a partir do builder**

```typescript
import { buildRoleSeed, buildResourceSeed } from "@/features/rbac/permissions/seed";
import type { IRole, IRbacResource, IDepartment } from "@/shared/types";

const NOW = "2026-06-16T00:00:00.000Z";

export const seedRbacResources: IRbacResource[] = buildResourceSeed();

export const seedRoles: IRole[] = buildRoleSeed().map((r) => ({
  ...r,
  id: r.slug, // system role id === slug
  createdAt: NOW,
  updatedAt: NOW,
}));

export const seedDepartments: IDepartment[] = [
  // optional example department for demo data, store-scoped to the matriz store id
];
```

> Nota: `src/mocks/**` pode importar de `@/features/rbac` (o seed builder) — confirme que isso não viola a fronteira ESLint (mocks importam de features? em geral, mocks são a camada de baixo; se houver violação, mover `buildRoleSeed` para um módulo neutro em `shared/` e reexportar). **Verificar `eslint.config.js` antes.**

- [ ] **Step 2: Registrar coleções no Zustand mock store** seguindo o padrão das coleções existentes (ex.: como `sellers` é registrado). Inicializar com os seeds.

- [ ] **Step 3: Build + commit**

```bash
git add src/mocks/data/rbac.ts src/mocks/store/<arquivos-do-store>
git commit -m "feat(rbac): mock store collections + seed for roles/resources/departments"
```

---

# FASE 2 — Drop-in no hasPermission

> Objetivo: consumir a matriz persistida preservando a API do PRD-006. Gate: testes de permissão continuam passando.

### Task 6: Contratos e providers `roles` / `departments`

**Files:**
- Create: `src/providers/data/contracts/roles.ts`, `contracts/departments.ts`
- Modify: `src/providers/data/contracts/index.ts`
- Create: `src/providers/data/impl/mock/roles.ts`, `impl/mock/departments.ts`
- Create: `src/providers/data/impl/supabase/roles.ts`, `impl/supabase/departments.ts`
- Create: `src/mocks/api/roles.ts`, `src/mocks/api/departments.ts`

- [ ] **Step 1: Contrato `IRolesProvider`**

```typescript
import type { ID, IPermission, IRbacResource, IRole } from "@/shared/types";

export interface ICreateRoleInput {
  name: string;
  description?: string;
  baseRole: IRole["baseRole"];
  /** Initial permissions — empty or duplicated from another role. */
  permissions: IPermission[];
  storeId?: ID | null;
}

export interface IRolesProvider {
  /** All roles (system + custom), with their effective permissions. */
  list(): Promise<IRole[]>;
  get(id: ID): Promise<IRole>;
  /** Resource catalog (areas/labels) for the editor. */
  listResources(): Promise<IRbacResource[]>;
  /** Create a custom role (isSystem=false). */
  create(input: ICreateRoleInput): Promise<IRole>;
  /** Rename/description — custom roles only (system rejected). */
  updateMeta(id: ID, patch: { name?: string; description?: string }): Promise<IRole>;
  /** Replace the permission set of an editable role (Owner immutable rejected). */
  setPermissions(id: ID, permissions: IPermission[]): Promise<IRole>;
  /** Restore a system role to its seeded factory defaults. */
  restoreDefaults(id: ID): Promise<IRole>;
  /** Delete a custom role — fails if any user is assigned (returns count to remap). */
  remove(id: ID): Promise<void>;
}
```

- [ ] **Step 2: Contrato `IDepartmentsProvider`**

```typescript
import type { ID, IDepartment } from "@/shared/types";

export interface ICreateDepartmentInput {
  name: string;
  storeId: ID;
  managerId?: ID;
  sellerIds?: ID[];
}

export interface IDepartmentsProvider {
  list(params?: { storeId?: ID }): Promise<IDepartment[]>;
  get(id: ID): Promise<IDepartment>;
  create(input: ICreateDepartmentInput): Promise<IDepartment>;
  update(id: ID, patch: Partial<Omit<IDepartment, "id" | "createdAt">>): Promise<IDepartment>;
  remove(id: ID): Promise<void>;
}
```

- [ ] **Step 3: Adicionar a `IDataProviders`** em `contracts/index.ts`: `roles: IRolesProvider;` e `departments: IDepartmentsProvider;`.

- [ ] **Step 4: Implementar mock** (`impl/mock/roles.ts`, `impl/mock/departments.ts`) sobre `src/mocks/api/*`, auditando cada mutação com `auditLog()` (action ex.: `role.create`, `role.permissions.update`, `role.restore_defaults`, `department.create`). `remove` de papel checa uso (conta sellers com `role`/`baseRole` atribuído) e lança erro com a contagem.

- [ ] **Step 5: Implementar supabase** (`impl/supabase/roles.ts`, `impl/supabase/departments.ts`) com mappers snake_case↔camelCase (padrão dos providers existentes). `list()` faz join `roles` + `role_permissions`. `setPermissions` faz delete+insert das linhas de `role_permissions` numa única chamada (ou upsert). `restoreDefaults` reescreve a partir do seed builder.

- [ ] **Step 6: Build + commit**

```bash
git add src/providers/data/contracts/roles.ts src/providers/data/contracts/departments.ts src/providers/data/contracts/index.ts src/providers/data/impl/mock/roles.ts src/providers/data/impl/mock/departments.ts src/providers/data/impl/supabase/roles.ts src/providers/data/impl/supabase/departments.ts src/mocks/api/roles.ts src/mocks/api/departments.ts
git commit -m "feat(rbac): roles and departments providers (mock + supabase) with contracts"
```

---

### Task 7: Registrar no factory + hooks + barrel

**Files:**
- Modify: `src/providers/data/factory.ts`
- Create: `src/providers/data/hooks/useRolesProvider.ts`, `hooks/useDepartmentsProvider.ts`
- Modify: `src/providers/data/index.ts`

- [ ] **Step 1: Importar e registrar** `roles`/`departments` nos bundles `mockProviders` e `supabaseProviders` em `factory.ts` (espelhar o padrão de `sellers`).
- [ ] **Step 2: Criar hooks** `useRolesProvider()` / `useDepartmentsProvider()` espelhando `useSellersProvider()`.
- [ ] **Step 3: Exportar** os hooks no barrel `src/providers/data/index.ts`.
- [ ] **Step 4: Build + commit**

```bash
git add src/providers/data/factory.ts src/providers/data/hooks/useRolesProvider.ts src/providers/data/hooks/useDepartmentsProvider.ts src/providers/data/index.ts
git commit -m "feat(rbac): register roles/departments providers in factory + hooks"
```

---

### Task 8: Cache em memória + `hasPermission` lê da fonte persistida

**Files:**
- Create: `src/features/rbac/store/rbacConfig.ts`
- Test: `src/features/rbac/store/rbacConfig.test.ts`
- Modify: `src/features/rbac/utils/hasPermission.ts`
- Modify: `__root.tsx` (hidratação no boot — dentro do provider tree)

- [ ] **Step 1: Teste do cache (fallback + hidratação + invalidação)**

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { getRbacSnapshot, hydrateRbac, invalidateRbac } from "./rbacConfig";
import { buildRoleSeed } from "../permissions/seed";

describe("rbacConfig cache", () => {
  beforeEach(() => invalidateRbac());

  it("falls back to the static matrix before hydration", () => {
    const snap = getRbacSnapshot();
    expect(snap.byRole.Owner).toBeDefined(); // static fallback present
  });

  it("serves hydrated roles after hydrateRbac()", () => {
    const roles = buildRoleSeed().map((r, i) => ({
      ...r, id: r.slug, createdAt: "", updatedAt: "",
    }));
    hydrateRbac(roles);
    const snap = getRbacSnapshot();
    expect(snap.byRole.Owner.customerScope).toBeDefined; // sanity
  });
});
```

> Ajustar o shape do snapshot ao que `hasPermission` precisa (índice `role → resource → {actions Set, scope}`), espelhando `EFFECTIVE_PERMISSIONS_INDEX`.

- [ ] **Step 2: Implementar `rbacConfig.ts`** — um módulo singleton (fora de React) que:
  - mantém um snapshot `{ byRole: Record<string, ResourceIndex>, hydrated: boolean }`;
  - antes de hidratar, retorna um índice construído da constante `EFFECTIVE_PERMISSIONS_INDEX` (fallback sem brecha — comportamento idêntico ao de hoje);
  - `hydrateRbac(roles: IRole[])` reconstrói o índice por `baseRole`/`slug`;
  - `invalidateRbac()` limpa para forçar nova hidratação;
  - expõe `getRbacSnapshot()` síncrono.

- [ ] **Step 3: Adaptar `hasPermission`** para consultar `getRbacSnapshot().byRole[user.role]` em vez do `EFFECTIVE_PERMISSIONS_INDEX` direto — **mantendo assinatura e sincronicidade**. (O índice de fallback garante que, antes da hidratação, o resultado é idêntico ao atual.)

- [ ] **Step 4: Hidratar no boot** — num efeito dentro do provider tree (após `DataProvidersProvider`), chamar `rolesProvider.list()` e `hydrateRbac()`. Invalidar/re-hidratar quando o editor salvar (RF-022 / RNF-002). Documentar: na Fase 2 Supabase, mudança de permissão de um papel reflete na UI após re-hidratar; o enforcement real (RLS) é governado pelo `base_role` no JWT (refresh de claims documentado).

- [ ] **Step 5: Rodar os testes do PRD-006 + o novo**

Run: `bun run test src/features/rbac`
Expected: PASS (testes de `hasPermission`/scope continuam verdes; novo teste do cache passa).

- [ ] **Step 6: Commit**

```bash
git add src/features/rbac/store/rbacConfig.ts src/features/rbac/store/rbacConfig.test.ts src/features/rbac/utils/hasPermission.ts src/routes/__root.tsx
git commit -m "feat(rbac): in-memory permission cache, hasPermission reads persisted matrix"
```

---

# FASE 3 — Editor de Papéis

> Objetivo: autonomia do Owner sobre papéis. Design: master-detail, matriz por papel, scope por linha, colapso por área (ver guia de design no roteiro). Gate: critérios de aceitação de papéis.

### Task 9: Estrutura do editor (rail + matriz por papel, read-only primeiro)

**Files:**
- Rewrite: `src/features/rbac/pages/RolesPage.tsx`
- Create: `src/features/rbac/components/role-editor/RoleRail.tsx`, `PermissionMatrix.tsx`, `ResourceAreaGroup.tsx`, `PermissionCell.tsx`, `ScopeSelect.tsx`
- Create/expand: `src/features/rbac/i18n/pt-BR.ts`

- [ ] **Step 1: `RoleRail`** — lista de papéis agrupada em "De sistema" / "Personalizados"; item selecionado com `border-l-2 border-primary` + `bg-primary/10`; badge `mdi:lock` nos de sistema; botão "+ Novo papel" (Owner-only via `usePermission("role","create")` ou gate `manage_roles`). Em <768px, vira `Select`.
- [ ] **Step 2: `PermissionMatrix`** — recebe um papel; renderiza áreas colapsáveis (`Collapsible`/`Accordion`) lidas de `listResources()` agrupadas por `group`. Cabeçalho de coluna sticky com as 5 ações; busca de recurso (`/`) filtra linhas. Renderiza `ResourceAreaGroup` por área.
- [ ] **Step 3: `ResourceAreaGroup`** — cabeçalho com resumo agregado ("3/5 com edição") + checkbox tri-state por coluna (ação em massa na área); linhas de recurso (`PermissionCell` × 5 ações + `ScopeSelect` por linha).
- [ ] **Step 4: `PermissionCell`** — `<button role="checkbox" aria-checked>` com ícone preenchido/outline (nunca só cor); `aria-label` "{recurso} – {ação} – {estado} (escopo: {scope})". Read-only primeiro (sem onChange ainda).
- [ ] **Step 5: `ScopeSelect`** — `Select` compacto por linha com 4 níveis (own/team/store/all) + ícone por nível.
- [ ] **Step 6: Montar `RolesPage`** com layout master-detail; carregar papéis via `useRolesProvider().list()` (TanStack Query). Manter read-only nesta task (sem persistir edição).
- [ ] **Step 7: Build + commit**

```bash
git add src/features/rbac/pages/RolesPage.tsx src/features/rbac/components/role-editor src/features/rbac/i18n/pt-BR.ts
git commit -m "feat(rbac): role editor scaffold (rail + permission matrix, read-only)"
```

---

### Task 10: Edição da matriz + proteções + persistência

**Files:**
- Modify: `role-editor/PermissionMatrix.tsx`, `PermissionCell.tsx`, `RolesPage.tsx`
- Create: `role-editor/SystemRoleWarning.tsx`

- [ ] **Step 1: Estado editável** — `RolesPage` mantém um draft da matriz do papel selecionado; `PermissionCell` alterna ação; `ScopeSelect` muda scope; barra de ações persistente "Salvar/Descartar" + indicador "não salvo".
- [ ] **Step 2: Owner imutável** — quando `role.isOwnerImmutable`, matriz inteira `disabled` + banner `role="status"` severity-info "O papel Owner tem acesso total e não pode ser editado." (não esconder).
- [ ] **Step 3: Aviso de papel de sistema** — `SystemRoleWarning` (`AlertDialog`) ao primeiro toque numa célula de papel `isSystem` (não-Owner), com "Não avisar novamente nesta sessão"; depois, banner `severity-warning` persistente enquanto houver edição.
- [ ] **Step 4: Salvar** — `rolesProvider.setPermissions(id, permissions)`; ao sucesso, `invalidateRbac()` + re-hidratar + `toast.success` + audit (já no provider). Bloquear navegação com confirmação se houver alterações não salvas.
- [ ] **Step 5: Restaurar padrão** — botão (papéis de sistema) → `AlertDialog` → `rolesProvider.restoreDefaults(id)`; destacar linhas alteradas (`bg-severity-info/15`, `motion-safe`).
- [ ] **Step 6: Acessibilidade** — navegação por teclado tipo grid (setas + Space alterna), roving tabindex, `aria-live` no resumo "N de M".
- [ ] **Step 7: Build + commit**

```bash
git add src/features/rbac/components/role-editor src/features/rbac/pages/RolesPage.tsx
git commit -m "feat(rbac): editable permission matrix with system-role guards and restore"
```

---

### Task 11: CRUD de papéis customizados

**Files:**
- Create: `role-editor/RoleFormDialog.tsx`
- Modify: `RolesPage.tsx`, `RoleRail.tsx`

- [ ] **Step 1: Criar papel** — `RoleFormDialog` (nome, descrição, `baseRole` via Select dos 7, "permissões iniciais: em branco ou duplicar de…"). Validar nome único (erro inline). `rolesProvider.create(...)`.
- [ ] **Step 2: Duplicar** — ação "Duplicar" (inclusive de sistema) → cria customizado com as mesmas permissões e um `baseRole` herdado.
- [ ] **Step 3: Renomear** — só customizados (`updateMeta`); sistema desabilitado.
- [ ] **Step 4: Excluir** — só customizados; `rolesProvider.remove(id)`; se em uso, mostrar mensagem "N usuários precisam ser remanejados" (o provider lança com a contagem).
- [ ] **Step 5: Build + commit**

```bash
git add src/features/rbac/components/role-editor/RoleFormDialog.tsx src/features/rbac/pages/RolesPage.tsx src/features/rbac/components/role-editor/RoleRail.tsx
git commit -m "feat(rbac): custom role CRUD (create/duplicate/rename/delete with usage guard)"
```

---

# FASE 4 — Departamento

> Objetivo: ativar `ITeam` e dar significado ao scope `team`. Gate: scope `team` filtra por membros do departamento.

### Task 12: Gestão de Departamentos (CRUD)

**Files:**
- Create: `src/features/people/components/DepartmentManager.tsx`
- Create: `src/routes/app.configuracoes.departamentos.tsx` (ou subseção da tela de usuários — decidir aqui)

- [ ] **Step 1: Tela/seção de Departamentos** — lista (nome, gestor, nº de membros) + criar/editar (nome, `managerId` via select de sellers, membros via multi-select). Owner gerencia todos; Gestor só os que é `managerId`.
- [ ] **Step 2: Wiring** — `useDepartmentsProvider()` + TanStack Query; mutações auditadas (no provider). Atribuir `departmentId` ao seller é feito aqui (via `update` do seller) e/ou na tela de usuários.
- [ ] **Step 3: Guard de rota** — `requireAuth(..., { resource: "seller", action: "edit", scope: "store" })` (ou recurso dedicado se criado).
- [ ] **Step 4: Build + commit**

```bash
git add src/features/people/components/DepartmentManager.tsx src/routes/app.configuracoes.departamentos.tsx
git commit -m "feat(people): department CRUD (ITeam revived as Departamento)"
```

---

### Task 13: Scope `team` real

**Files:**
- Modify: `src/features/rbac/utils/getCurrentUserScope.ts` (ou onde o scope é resolvido em list hooks)
- Test: `src/features/rbac/utils/teamScope.test.ts`

- [ ] **Step 1: Teste** — dado um usuário com `departmentId` e um papel com `scope: team` em `customer`, o conjunto de ids elegíveis = clientes vinculados aos membros do mesmo departamento (não só `own`).
- [ ] **Step 2: Implementar resolução do `team`** — helper puro `resolveTeamMemberIds(seller, departmentMembers): ID[]` e integração no ponto onde os list hooks decidem o filtro por scope. ⚠️ Hoje `team ≈ own` (`scopes.ts:9-10`) — atualizar esse comentário e a resolução. Não alterar a hierarquia `own<team<store<all`.
- [ ] **Step 3: Rodar testes** `bun run test src/features/rbac`
- [ ] **Step 4: Commit**

```bash
git add src/features/rbac/utils/getCurrentUserScope.ts src/features/rbac/utils/teamScope.test.ts src/features/rbac/permissions/scopes.ts
git commit -m "feat(rbac): scope 'team' resolves to department members (was ~own)"
```

---

# FASE 5 — Usuários + Propagação

> Objetivo: gestão completa de usuários e enforcement consistente. Gate: editar permissão reflete sem brecha; abas Horário/Rodízio reservadas.

### Task 14: Lista de usuários

**Files:**
- Create: `src/features/people/pages/UsersPage.tsx`, `components/UserList.tsx`, `hooks/useUsersList.ts`, `i18n/pt-BR.ts`, `index.ts`
- Create: `src/routes/app.configuracoes.usuarios.tsx`

- [ ] **Step 1: Rota + guard** — `requireAuth(..., { resource: "seller", action: "view", scope: "store" })`.
- [ ] **Step 2: Lista** seguindo `docs/dev/ux-guidelines.md` (header glass, busca `/`, `ScrollProgressBar`, `useResizableColumns`, menu de colunas no clique-direito). Colunas: Avatar+Nome (fixa), Papel (`Badge`), Departamento, Status (ativo/suspenso), Disponibilidade, ações. Filtros (papel, departamento, status) à direita da busca.
- [ ] **Step 3: Dados** — `useSellersProvider().list({ storeId })` + `useRolesProvider().list()` + `useDepartmentsProvider().list()` para resolver labels.
- [ ] **Step 4: Build + commit**

```bash
git add src/features/people src/routes/app.configuracoes.usuarios.tsx
git commit -m "feat(people): users list screen (filters, ux-guidelines compliant)"
```

---

### Task 15: Editor de usuário (Sheet + Tabs com abas progressivas)

**Files:**
- Create: `src/features/people/components/UserSheet.tsx`, `components/UserGeneralTab.tsx`

- [ ] **Step 1: `UserSheet`** — `Sheet side="right"` largo (`sm:max-w-2xl`), `Tabs` no topo (`Geral` | `Horário` | `Rodízio`), footer persistente "Salvar/Cancelar" fora das abas. Abas **Horário** e **Rodízio** `disabled` com `Tooltip` "Disponível após PRD-212/213" e, para usuário novo, "Salve o usuário primeiro" (`mdi:lock-outline`).
- [ ] **Step 2: `UserGeneralTab`** — react-hook-form + zod: identidade (avatar, nome, email, telefone), papel (`Select` de `rolesProvider.list()`), departamento (`Select`), status (Switch ativo/suspenso → `active`), especialidades (multi-select com chips), disponibilidade padrão. Suspenso = `active=false` (impede login, sai do rodízio — RF-019).
- [ ] **Step 3: Criar/editar** — `sellersProvider.create(...)` / `update(...)`; auditado. Após criar, habilitar abas (ainda placeholders).
- [ ] **Step 4: Build + commit**

```bash
git add src/features/people/components/UserSheet.tsx src/features/people/components/UserGeneralTab.tsx
git commit -m "feat(people): user editor sheet with progressive tabs (Geral + locked Horário/Rodízio)"
```

---

### Task 16: Recursos `manage_roles`/`monitor` + propagação e fechamento

**Files:**
- Modify: `src/features/rbac/permissions/resources.ts` (+ seed) — adicionar `manage_roles` e `monitor`
- Modify: migration/seed de `rbac_resources` (acrescentar as 2 chaves)
- Modify: documentação `docs/rbac.md` (gatilho de refresh de claims na Fase 2)

- [ ] **Step 1: Novos recursos** `manage_roles` (gerir papéis) e `monitor` (base do modo espião — só nasce aqui, comportamento é DELTA futuro). Atualizar `RESOURCES`, `RESOURCE_META` (seed) e o seed de `rbac_resources` (migration incremental + espelho).
- [ ] **Step 2: Gate de edição de papéis** — trocar o guard da rota `papeis` de `{role:view}` para visualização e exigir `manage_roles` para edição (Owner). Ajustar `<Can>`/`usePermission` na `RolesPage`.
- [ ] **Step 3: Documentar propagação** — em `docs/rbac.md`: fonte da verdade = tabelas; UI = cache re-hidratado ao salvar; RLS = `base_role` no JWT; gatilho de refresh de claims quando o papel base de um usuário muda (re-login/refresh token). Sem janela "UI concede o que API nega" (o `base_role` nunca excede o papel de sistema).
- [ ] **Step 4: Validação final** — rodar `bun run test` + `bun run build`; conferir critérios de aceitação do PRD (criar papel "Conferente" só com `view:store` em Estoque; editar Financeiro com aviso + restaurar; Owner read-only; excluir papel em uso bloqueado; scope team por departamento).
- [ ] **Step 5: Commit**

```bash
git add src/features/rbac/permissions/resources.ts src/features/rbac/permissions/seed.ts supabase/migrations/<ts>_rbac_resources_manage_monitor.sql docs/rbac.md
git commit -m "feat(rbac): manage_roles/monitor resources + enforcement propagation docs"
```

---

## Pós-implementação (PRD)

- [ ] Bump de versão (MINOR, codinome inédito) + `CHANGELOG.md` (Keep a Changelog) + UI changelog se aplicável.
- [ ] Renomear `docs/prds/PRD-211-papeis-editaveis-usuarios.md` → `..._DONE.md` e preencher "Status de Implementação".
- [ ] Atualizar `CLAUDE.md` (estado do projeto) e o `INDEX-PRDs` (reconciliar com PRDs 184/189 da Onda 12).
- [ ] Resumo final ao dono (entrega, desvios, validação, gate).

---

## Self-Review (cobertura × PRD-211)

- RF-001/002/004 → Tasks 1, 3 (modelo + tabelas). RF-003 → Task 2 (seed fiel + teste diff-vazio). RF-005 → inalterado (ações/scopes mantidos).
- RF-006/007/008/009/010/011/012 → Tasks 10, 11 (editor, proteções, restaurar, Owner imutável, exclusão guardada).
- RF-013/014/015/016 → Tasks 12, 13 (departamento + scope team).
- RF-017/018/019/020 → Tasks 14, 15 (usuários, status, abas placeholder).
- RF-021 → Task 8 (hasPermission lê da fonte). RF-022 → Task 16 (propagação documentada; base_role). RF-023 → auditoria em cada provider (Tasks 6, 10–15).
- RNF-001 (síncrono <1ms) → cache em memória (Task 8). RNF-004 (integridade) → proteções (Task 10/11) + `base_role`. RNF-005 (compat Fase 2) → migrations `public` + RLS (Tasks 3, 4).

**Pontos abertos a confirmar na execução:** (a) predicado exato de Owner/staff nas policies (Task 3 Step 1); (b) fronteira ESLint mocks↔features para o seed builder (Task 5 Step 1); (c) localização final da tela de departamentos (rota dedicada vs subseção de usuários — Task 12).

---

**AILA — Sistemas Inteligentes**
