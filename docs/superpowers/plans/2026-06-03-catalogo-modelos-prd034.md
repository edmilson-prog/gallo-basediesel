# Catálogo de Modelos (PRD-034) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar o catálogo canônico de modelos de veículo (`IVehicleModel`) gerenciável em `/app/kits`, base do épico de Kits — sem tocar no `IServiceKit` atual.

**Architecture:** Feature `src/features/vehicle-models/` consome o provider `vehicleModels` (Provider Pattern: contract + impl mock + stub supabase + hook + factory). Mock in-memory semeado por consolidação do `SEED_VEHICLE_MODELS` (expansão de variantes de motor). UI = lista agrupada por marca → página de detalhe `/app/kits/$modelId` (slot de kits vazio nesta fase). RBAC via resource `vehicleModel`. TanStack Query para leitura/escrita com invalidação; audit log nas mutações.

**Tech Stack:** React 19 + TS strict, Vite, TanStack Router (file-based) + TanStack Query, Tailwind v4 + shadcn/ui, Iconify (`mdi:*`), zod + react-hook-form, sonner, Bun.

**Gates do repositório (LER ANTES DE COMEÇAR):**
- **`bun run build` NÃO faz type-check** (esbuild remove tipos). O gate de tipos real é `bunx tsc --noEmit 2>&1` filtrado pelos arquivos tocados — deve sair **vazio**. O repo tem ~316 erros pré-existentes de `tsc`; ignore os que não casam com os arquivos da tarefa.
- **`bun run lint` global é INUTILIZÁVEL** (milhares de falsos `prettier/prettier Delete ␍` por CRLF). Valide **por-arquivo**: `bunx prettier --check "<arquivo>"`.
- **Sem test runner.** Lógica pura é validada com script descartável `scripts/_check_*.ts` rodado com `bun`, **apagado no mesmo commit**.
- **`src/routeTree.gen.ts` é GERADO** — nunca editar à mão; se aparecer como modificado por CRLF, `git checkout -- src/routeTree.gen.ts`.
- **UI é validada manualmente pelo usuário** — NÃO abrir browser/devtools/preview.
- **IGNORAR** qualquer pasta contendo `worktrees`.
- Commits: Conventional Commits em inglês, terminando com `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

## File Structure

**Criar:**
- `src/shared/types/vehicle-models.ts` — `IVehicleModel`, `VehicleModelStatus`
- `src/mocks/data/seedVehicleModelsCanonical.ts` — consolidação → `SEED_VEHICLE_MODELS_CANONICAL`
- `src/mocks/api/vehicleModels.ts` — mock api (store in-memory, CRUD, validação)
- `src/providers/data/contracts/vehicleModels.ts` — contrato + input/params
- `src/providers/data/impl/mock/vehicleModels.ts` — delega à api
- `src/providers/data/impl/supabase/vehicleModels.ts` — stub `NotImplementedError`
- `src/providers/data/hooks/useVehicleModelsProvider.ts` — hook
- `src/features/vehicle-models/utils/brandIcon.ts` — `getBrandIcon`, `KNOWN_BRANDS`
- `src/features/vehicle-models/utils/modelValidation.ts` — zod schema
- `src/features/vehicle-models/hooks/useVehicleModels.ts` — query lista
- `src/features/vehicle-models/hooks/useVehicleModel.ts` — query detalhe (get)
- `src/features/vehicle-models/hooks/useVehicleModelMutations.ts` — create/update/delete + audit
- `src/features/vehicle-models/components/BrandAvatar.tsx`
- `src/features/vehicle-models/components/BrandFilterChips.tsx`
- `src/features/vehicle-models/components/VehicleModelRow.tsx`
- `src/features/vehicle-models/components/BrandGroup.tsx`
- `src/features/vehicle-models/components/VehicleModelForm.tsx`
- `src/features/vehicle-models/components/DeleteVehicleModelDialog.tsx`
- `src/features/vehicle-models/pages/VehicleModelsListPage.tsx`
- `src/features/vehicle-models/pages/VehicleModelFormPage.tsx`
- `src/features/vehicle-models/pages/VehicleModelDetailPage.tsx`
- `src/features/vehicle-models/index.ts`
- `src/routes/app.kits.tsx`, `app.kits.index.tsx`, `app.kits.novo.tsx`, `app.kits.$modelId.tsx`, `app.kits.$modelId.editar.tsx`

**Modificar:**
- `src/shared/types/index.ts` — re-export do tipo
- `src/mocks/api/index.ts` — re-export `vehicleModelsApi`
- `src/providers/data/contracts/index.ts` — registrar contrato + `IDataProviders.vehicleModels`
- `src/providers/data/factory.ts` — registrar impls mock/supabase
- `src/providers/data/index.ts` — re-export dos input/params types
- `src/features/rbac/permissions/resources.ts` — `"vehicleModel"`
- `src/features/rbac/permissions/matrix.ts` — entradas Owner/Gestor/Vendedor
- `src/features/rbac/pages/RolesPage.tsx` — `RESOURCE_LABELS.vehicleModel`
- `src/features/shell/config/routes.ts` — `APP_KITS`
- `src/features/shell/config/navigation.ts` — item "Kits por modelo"

---

## Task 1: Tipo de domínio `IVehicleModel`

**Files:**
- Create: `src/shared/types/vehicle-models.ts`
- Modify: `src/shared/types/index.ts` (após a linha de service-kit, fim do arquivo)

- [ ] **Step 1: Criar o tipo**

```ts
// src/shared/types/vehicle-models.ts
import type { ID, ISO8601 } from "./common";

/** Lifecycle status of a canonical vehicle model. */
export type VehicleModelStatus = "ativo" | "inativo";

/**
 * Canonical "market model" of a heavy vehicle (brand + model + engine + year
 * range). Reference data — the stable key (`id`) that future kits (PRD-035) and
 * the customer fleet (delta PRD-016) hang off. Distinct engines are distinct
 * canonical entries (DC13 ≠ DC13 EURO 5).
 */
export interface IVehicleModel {
  id: ID;
  brand: string;
  model: string;
  engine: string;
  yearStart?: number;
  yearEnd?: number;
  status: VehicleModelStatus;
  createdBy: ID;
  createdAt: ISO8601;
  updatedAt: ISO8601;
  updatedBy?: ID;
}
```

- [ ] **Step 2: Re-exportar no barrel** — adicionar ao FIM de `src/shared/types/index.ts` (após `export type { IServiceKit, IServiceKitItem } from "./service-kit";`):

```ts
// Vehicle models / canonical model catalog (PRD-034)
export type { IVehicleModel, VehicleModelStatus } from "./vehicle-models";
```

- [ ] **Step 3: Verificar tipos**

Run: `bunx tsc --noEmit 2>&1 | grep -iE "vehicle-models"`
Expected: vazio (nenhuma linha).

- [ ] **Step 4: Prettier**

Run: `bunx prettier --check "src/shared/types/vehicle-models.ts"`
Expected: "All matched files use Prettier code style!"

- [ ] **Step 5: Commit**

```bash
git add src/shared/types/vehicle-models.ts src/shared/types/index.ts
git commit -m "feat(types): add canonical IVehicleModel (PRD-034)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Helper `getBrandIcon`

**Files:**
- Create: `src/features/vehicle-models/utils/brandIcon.ts`

Reusa a fonte da verdade marca→ícone de `DEFAULT_STOREFRONT_BRANDS` (`src/shared/types/storefront.ts`), normalizando o nome da marca ("Mercedes-Benz" → slug "mercedes-benz").

- [ ] **Step 1: Criar o helper**

```ts
// src/features/vehicle-models/utils/brandIcon.ts
import { DEFAULT_STOREFRONT_BRANDS } from "@/shared/types";

const FALLBACK_ICON = "mdi:truck-outline";

const ICON_BY_SLUG = new Map(DEFAULT_STOREFRONT_BRANDS.map((b) => [b.slug, b.icon]));

/** Normalize a free-form brand string to a storefront slug ("Ford Cargo" → "ford-cargo"). */
function brandSlug(brand: string): string {
  return brand.trim().toLowerCase().replace(/\s+/g, "-");
}

/** Resolve the Iconify name for a brand, falling back to a generic truck icon. */
export function getBrandIcon(brand: string): string {
  return ICON_BY_SLUG.get(brandSlug(brand)) ?? FALLBACK_ICON;
}

/** The 5 known brand labels, in display order (for filter chips and the form select). */
export const KNOWN_BRANDS: readonly string[] = DEFAULT_STOREFRONT_BRANDS.map((b) => b.label);
```

- [ ] **Step 2: Check de lógica (script descartável)**

Criar `scripts/_check_brandicon.ts`:

```ts
import { getBrandIcon, KNOWN_BRANDS } from "../src/features/vehicle-models/utils/brandIcon";

const cases: Array<[string, string]> = [
  ["Volvo", "mdi:truck"],
  ["Scania", "mdi:truck-fast"],
  ["Mercedes-Benz", "mdi:car-estate"],
  ["Ford Cargo", "mdi:truck-cargo-container"],
  ["Iveco", "mdi:tow-truck"],
  ["Marca Desconhecida", "mdi:truck-outline"],
];
for (const [brand, expected] of cases) {
  const got = getBrandIcon(brand);
  if (got !== expected) throw new Error(`getBrandIcon(${brand}) = ${got}, esperado ${expected}`);
}
if (KNOWN_BRANDS.length !== 5) throw new Error(`KNOWN_BRANDS deve ter 5, tem ${KNOWN_BRANDS.length}`);
console.log("OK brandIcon");
```

Run: `bun scripts/_check_brandicon.ts`
Expected: imprime `OK brandIcon` sem lançar.

- [ ] **Step 3: Apagar o script de check**

Run: `rm scripts/_check_brandicon.ts`

- [ ] **Step 4: tsc + prettier**

Run: `bunx tsc --noEmit 2>&1 | grep -iE "brandIcon"` → vazio
Run: `bunx prettier --check "src/features/vehicle-models/utils/brandIcon.ts"` → OK

- [ ] **Step 5: Commit**

```bash
git add src/features/vehicle-models/utils/brandIcon.ts
git commit -m "feat(vehicle-models): brand icon helper reusing storefront source

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Consolidação / seed canônico

**Files:**
- Create: `src/mocks/data/seedVehicleModelsCanonical.ts`

Deriva o catálogo canônico expandindo cada variante de motor de `SEED_VEHICLE_MODELS` em uma entrada `IVehicleModel` distinta. **Vive em `src/mocks/`** (a fronteira ESLint impede features de importar `src/mocks/data/*`; o seed e a api ficam dentro de mocks). As `applications` de peças derivam da mesma fonte (`SEED_VEHICLE_MODELS`), então não introduzem combinações novas — dobrá-las é desnecessário (decisão documentada no arquivo).

- [ ] **Step 1: Criar o seed canônico**

```ts
// src/mocks/data/seedVehicleModelsCanonical.ts
import type { IVehicleModel } from "@/shared/types";
import { SEED_VEHICLE_MODELS } from "./seedVehicleModels";

/**
 * Canonical vehicle-model catalog (PRD-034), derived by expanding each engine
 * variant of SEED_VEHICLE_MODELS into a distinct IVehicleModel. Distinct engines
 * = distinct canonical entries (e.g. Scania R 450 / "DC13" and "DC13 EURO 5").
 *
 * Part applications are generated from the SAME source (SEED_VEHICLE_MODELS), so
 * folding them in would add no new brand+model+engine combos — intentionally
 * omitted to keep the catalog the single source it already is.
 */
const SEED_TIMESTAMP = "2026-01-01T00:00:00.000Z";
const SEED_ACTOR = "system";

function slug(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function buildCanonicalVehicleModels(): IVehicleModel[] {
  const out: IVehicleModel[] = [];
  const seen = new Set<string>();
  for (const entry of SEED_VEHICLE_MODELS) {
    for (const engine of entry.engines) {
      const key = `${entry.brand}|${entry.model}|${engine}`.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        id: `vmodel-${slug(entry.brand)}-${slug(entry.model)}-${slug(engine)}`,
        brand: entry.brand,
        model: entry.model,
        engine,
        yearStart: entry.yearStart,
        yearEnd: entry.yearEnd,
        status: "ativo",
        createdBy: SEED_ACTOR,
        createdAt: SEED_TIMESTAMP,
        updatedAt: SEED_TIMESTAMP,
      });
    }
  }
  return out;
}

/** Eagerly-built canonical seed (stable across the session). */
export const SEED_VEHICLE_MODELS_CANONICAL: IVehicleModel[] = buildCanonicalVehicleModels();
```

- [ ] **Step 2: Check de lógica (script descartável)**

Criar `scripts/_check_consolidate.ts`:

```ts
import { SEED_VEHICLE_MODELS_CANONICAL } from "../src/mocks/data/seedVehicleModelsCanonical";

const models = SEED_VEHICLE_MODELS_CANONICAL;

// 1. 5 marcas cobertas
const brands = new Set(models.map((m) => m.brand));
const expected = ["Volvo", "Scania", "Mercedes-Benz", "Ford Cargo", "Iveco"];
for (const b of expected) if (!brands.has(b)) throw new Error(`marca ausente: ${b}`);

// 2. sem duplicatas de brand+model+engine
const keys = models.map((m) => `${m.brand}|${m.model}|${m.engine}`.toLowerCase());
if (new Set(keys).size !== keys.length) throw new Error("há combinações duplicadas");

// 3. Scania R 450 tem 2 motores distintos (DC13 e DC13 EURO 5)
const r450 = models.filter((m) => m.brand === "Scania" && m.model === "R 450");
if (r450.length !== 2) throw new Error(`Scania R 450 deveria ter 2 entradas, tem ${r450.length}`);

// 4. ids únicos e determinísticos
const ids = models.map((m) => m.id);
if (new Set(ids).size !== ids.length) throw new Error("ids duplicados");

// 5. total esperado = soma dos motores = 21
if (models.length !== 21) throw new Error(`esperado 21 modelos, tem ${models.length}`);

console.log(`OK consolidate — ${models.length} modelos, ${brands.size} marcas`);
```

Run: `bun scripts/_check_consolidate.ts`
Expected: `OK consolidate — 21 modelos, 5 marcas`

- [ ] **Step 3: Apagar o script**

Run: `rm scripts/_check_consolidate.ts`

- [ ] **Step 4: tsc + prettier**

Run: `bunx tsc --noEmit 2>&1 | grep -iE "seedVehicleModelsCanonical"` → vazio
Run: `bunx prettier --check "src/mocks/data/seedVehicleModelsCanonical.ts"` → OK

- [ ] **Step 5: Commit**

```bash
git add src/mocks/data/seedVehicleModelsCanonical.ts
git commit -m "feat(mocks): canonical vehicle-model seed by engine expansion (PRD-034)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Mock API `vehicleModelsApi`

**Files:**
- Create: `src/mocks/api/vehicleModels.ts`
- Modify: `src/mocks/api/index.ts` (após a linha do `serviceKitsApi`)

Espelha o padrão de `src/mocks/api/serviceKits.ts` (store mutável, `runApi`, `MockValidationError`/`MockNotFoundError`). `IVehicleModel` é **global** (sem `storeId`); list filtra por `brand`/`status`/`search`. `create` define `createdBy/updatedBy = "mock-user"` e timestamps via `new Date().toISOString()` (Fase 1 mock; o ator real é registrado no audit log pelo hook).

- [ ] **Step 1: Criar o mock api**

```ts
// src/mocks/api/vehicleModels.ts
import type { ID, IVehicleModel, VehicleModelStatus } from "@/shared/types";
import { SEED_VEHICLE_MODELS_CANONICAL } from "../data/seedVehicleModelsCanonical";
import { MockNotFoundError, MockValidationError, runApi } from "./utils";

export interface IListVehicleModelsParams {
  brand?: string;
  status?: VehicleModelStatus;
  search?: string;
}

export interface ICreateVehicleModelInput {
  brand: string;
  model: string;
  engine: string;
  yearStart?: number;
  yearEnd?: number;
}

export type IUpdateVehicleModelPatch = Partial<ICreateVehicleModelInput> & {
  status?: VehicleModelStatus;
};

// In-memory store seeded from the canonical catalog. Writes persist for the
// session and reset on reload (Fase 1 mock semantics).
let models: IVehicleModel[] = SEED_VEHICLE_MODELS_CANONICAL.map((m) => ({ ...m }));

const MOCK_ACTOR: ID = "mock-user";

let createdSeq = 0;
function slug(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}
function nextId(input: ICreateVehicleModelInput): ID {
  createdSeq += 1;
  return `vmodel-${slug(input.brand)}-${slug(input.model)}-${slug(input.engine)}-${createdSeq}`;
}

function validate(input: ICreateVehicleModelInput, ignoreId?: ID): void {
  if (!input.brand?.trim()) throw new MockValidationError("A marca é obrigatória.", "brand");
  if (!input.model?.trim()) throw new MockValidationError("O modelo é obrigatório.", "model");
  if (!input.engine?.trim()) throw new MockValidationError("O motor é obrigatório.", "engine");
  if (
    input.yearStart != null &&
    input.yearEnd != null &&
    input.yearStart > input.yearEnd
  ) {
    throw new MockValidationError("Ano inicial não pode ser maior que o final.", "yearStart");
  }
  const key = `${input.brand}|${input.model}|${input.engine}`.trim().toLowerCase();
  const dup = models.some(
    (m) => m.id !== ignoreId && `${m.brand}|${m.model}|${m.engine}`.toLowerCase() === key,
  );
  if (dup) throw new MockValidationError("Modelo já existe no catálogo.", "engine");
}

function matchesSearch(m: IVehicleModel, needle: string): boolean {
  return `${m.brand} ${m.model} ${m.engine}`.toLowerCase().includes(needle);
}

export const vehicleModelsApi = {
  list(params: IListVehicleModelsParams = {}): Promise<IVehicleModel[]> {
    return runApi(
      "vehicleModelsApi",
      "list",
      () => {
        let all = models;
        if (params.brand) all = all.filter((m) => m.brand === params.brand);
        if (params.status) all = all.filter((m) => m.status === params.status);
        const needle = params.search?.trim().toLowerCase();
        if (needle) all = all.filter((m) => matchesSearch(m, needle));
        return all.map((m) => ({ ...m }));
      },
      { payload: params },
    );
  },

  get(id: ID): Promise<IVehicleModel> {
    return runApi("vehicleModelsApi", "get", () => {
      const found = models.find((m) => m.id === id);
      if (!found) throw new MockNotFoundError("vehicleModel", id);
      return { ...found };
    });
  },

  create(input: ICreateVehicleModelInput): Promise<IVehicleModel> {
    return runApi("vehicleModelsApi", "create", () => {
      validate(input);
      const now = new Date().toISOString();
      const model: IVehicleModel = {
        id: nextId(input),
        brand: input.brand.trim(),
        model: input.model.trim(),
        engine: input.engine.trim(),
        yearStart: input.yearStart,
        yearEnd: input.yearEnd,
        status: "ativo",
        createdBy: MOCK_ACTOR,
        createdAt: now,
        updatedAt: now,
      };
      models = [...models, model];
      return { ...model };
    });
  },

  update(id: ID, patch: IUpdateVehicleModelPatch): Promise<IVehicleModel> {
    return runApi("vehicleModelsApi", "update", () => {
      const index = models.findIndex((m) => m.id === id);
      if (index === -1) throw new MockNotFoundError("vehicleModel", id);
      const current = models[index]!;
      const merged: IVehicleModel = {
        ...current,
        brand: "brand" in patch ? (patch.brand ?? "").trim() : current.brand,
        model: "model" in patch ? (patch.model ?? "").trim() : current.model,
        engine: "engine" in patch ? (patch.engine ?? "").trim() : current.engine,
        yearStart: "yearStart" in patch ? patch.yearStart : current.yearStart,
        yearEnd: "yearEnd" in patch ? patch.yearEnd : current.yearEnd,
        status: "status" in patch ? (patch.status ?? current.status) : current.status,
        updatedBy: MOCK_ACTOR,
        updatedAt: new Date().toISOString(),
      };
      validate(
        {
          brand: merged.brand,
          model: merged.model,
          engine: merged.engine,
          yearStart: merged.yearStart,
          yearEnd: merged.yearEnd,
        },
        id,
      );
      models = models.map((m, i) => (i === index ? merged : m));
      return { ...merged };
    });
  },

  delete(id: ID): Promise<void> {
    return runApi("vehicleModelsApi", "delete", () => {
      const exists = models.some((m) => m.id === id);
      if (!exists) throw new MockNotFoundError("vehicleModel", id);
      models = models.filter((m) => m.id !== id);
      return undefined;
    });
  },
};
```

- [ ] **Step 2: Re-exportar no barrel do mock** — adicionar em `src/mocks/api/index.ts` logo após a linha `export { serviceKitsApi, type IListServiceKitsParams } from "./serviceKits";`:

```ts
export {
  vehicleModelsApi,
  type IListVehicleModelsParams,
  type ICreateVehicleModelInput,
  type IUpdateVehicleModelPatch,
} from "./vehicleModels";
```

- [ ] **Step 3: Check de lógica (script descartável)**

Criar `scripts/_check_vehicleModelsApi.ts`:

```ts
import { vehicleModelsApi } from "../src/mocks/api/vehicleModels";

const all = await vehicleModelsApi.list();
if (all.length !== 21) throw new Error(`list inicial = ${all.length}, esperado 21`);

const scania = await vehicleModelsApi.list({ brand: "Scania" });
if (scania.length !== 5) throw new Error(`Scania = ${scania.length}, esperado 5`);

const search = await vehicleModelsApi.list({ search: "dc13" });
if (search.length === 0) throw new Error("busca 'dc13' não retornou nada");

const created = await vehicleModelsApi.create({ brand: "Volvo", model: "FH 500", engine: "D13K500X" });
if (!created.id.startsWith("vmodel-volvo-fh-500")) throw new Error(`id inesperado: ${created.id}`);

try {
  await vehicleModelsApi.create({ brand: "Volvo", model: "FH 500", engine: "D13K500X" });
  throw new Error("duplicata deveria falhar");
} catch (e) {
  if (!(e instanceof Error) || !e.message.includes("já existe")) throw e;
}

const updated = await vehicleModelsApi.update(created.id, { status: "inativo" });
if (updated.status !== "inativo") throw new Error("update de status falhou");

await vehicleModelsApi.delete(created.id);
const afterDelete = await vehicleModelsApi.list();
if (afterDelete.length !== 21) throw new Error(`após delete = ${afterDelete.length}, esperado 21`);

console.log("OK vehicleModelsApi");
```

Run: `bun scripts/_check_vehicleModelsApi.ts`
Expected: `OK vehicleModelsApi`

- [ ] **Step 4: Apagar o script**

Run: `rm scripts/_check_vehicleModelsApi.ts`

- [ ] **Step 5: tsc + prettier**

Run: `bunx tsc --noEmit 2>&1 | grep -iE "mocks/api/vehicleModels|mocks/api/index"` → vazio
Run: `bunx prettier --check "src/mocks/api/vehicleModels.ts" "src/mocks/api/index.ts"` → OK

- [ ] **Step 6: Commit**

```bash
git add src/mocks/api/vehicleModels.ts src/mocks/api/index.ts
git commit -m "feat(mocks): vehicleModels mock API with CRUD + dedup validation (PRD-034)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Camada de provider (contract + impls + hook + factory)

**Files:**
- Create: `src/providers/data/contracts/vehicleModels.ts`
- Create: `src/providers/data/impl/mock/vehicleModels.ts`
- Create: `src/providers/data/impl/supabase/vehicleModels.ts`
- Create: `src/providers/data/hooks/useVehicleModelsProvider.ts`
- Modify: `src/providers/data/contracts/index.ts`
- Modify: `src/providers/data/factory.ts`
- Modify: `src/providers/data/index.ts`

- [ ] **Step 1: Contrato**

```ts
// src/providers/data/contracts/vehicleModels.ts
import type { ID, IVehicleModel, VehicleModelStatus } from "@/shared/types";

export interface IListVehicleModelsParams {
  brand?: string;
  status?: VehicleModelStatus;
  search?: string;
}

export interface ICreateVehicleModelInput {
  brand: string;
  model: string;
  engine: string;
  yearStart?: number;
  yearEnd?: number;
}

export type IUpdateVehicleModelPatch = Partial<ICreateVehicleModelInput> & {
  status?: VehicleModelStatus;
};

/**
 * Contract for the canonical vehicle-model catalog (PRD-034). Reference data —
 * not store-scoped. `list` is read by everyone authenticated; writes back the
 * management screen (Owner/Gestor).
 *
 * @see ../../../mocks/api/vehicleModels.ts
 */
export interface IVehicleModelsProvider {
  list(params?: IListVehicleModelsParams): Promise<IVehicleModel[]>;
  get(id: ID): Promise<IVehicleModel>;
  create(input: ICreateVehicleModelInput): Promise<IVehicleModel>;
  update(id: ID, patch: IUpdateVehicleModelPatch): Promise<IVehicleModel>;
  delete(id: ID): Promise<void>;
}
```

- [ ] **Step 2: Impl mock**

```ts
// src/providers/data/impl/mock/vehicleModels.ts
import { vehicleModelsApi } from "@/mocks";
import type { IVehicleModelsProvider } from "../../contracts/vehicleModels";

export const mockVehicleModelsProvider: IVehicleModelsProvider = {
  list: (params) => vehicleModelsApi.list(params),
  get: (id) => vehicleModelsApi.get(id),
  create: (input) => vehicleModelsApi.create(input),
  update: (id, patch) => vehicleModelsApi.update(id, patch),
  delete: (id) => vehicleModelsApi.delete(id),
};
```

- [ ] **Step 3: Stub supabase**

```ts
// src/providers/data/impl/supabase/vehicleModels.ts
import { NotImplementedError } from "../../errors";
import type { IVehicleModelsProvider } from "../../contracts/vehicleModels";

const stub = (method: string) => () => {
  throw new NotImplementedError(
    `SupabaseVehicleModelsProvider.${method} — implementar quando o catálogo de modelos for persistido no Supabase (Fase 2).`,
  );
};

export const supabaseVehicleModelsProvider: IVehicleModelsProvider = {
  list: stub("list"),
  get: stub("get"),
  create: stub("create"),
  update: stub("update"),
  delete: stub("delete"),
};
```

- [ ] **Step 4: Hook**

```ts
// src/providers/data/hooks/useVehicleModelsProvider.ts
import type { IVehicleModelsProvider } from "../contracts/vehicleModels";
import { useDataProviderSlice } from "./_useDataProviderSlice";

export function useVehicleModelsProvider(): IVehicleModelsProvider {
  return useDataProviderSlice("vehicleModels", "useVehicleModelsProvider");
}
```

- [ ] **Step 5: Registrar no contracts/index.ts**

Em `src/providers/data/contracts/index.ts`:
1. Após `import type { IServiceKitsProvider } from "./serviceKits";` adicionar:
```ts
import type { IVehicleModelsProvider } from "./vehicleModels";
```
2. Após o bloco `export type { IServiceKitsProvider, ... } from "./serviceKits";` adicionar:
```ts
export type {
  IVehicleModelsProvider,
  IListVehicleModelsParams,
  ICreateVehicleModelInput,
  IUpdateVehicleModelPatch,
} from "./vehicleModels";
```
3. Em `interface IDataProviders`, após `serviceKits: IServiceKitsProvider;` adicionar:
```ts
  vehicleModels: IVehicleModelsProvider;
```

- [ ] **Step 6: Registrar na factory.ts**

Em `src/providers/data/factory.ts`:
1. Após `import { mockServiceKitsProvider } from "./impl/mock/serviceKits";` adicionar:
```ts
import { mockVehicleModelsProvider } from "./impl/mock/vehicleModels";
```
2. Após `import { supabaseServiceKitsProvider } from "./impl/supabase/serviceKits";` adicionar:
```ts
import { supabaseVehicleModelsProvider } from "./impl/supabase/vehicleModels";
```
3. Em `mockProviders`, após `serviceKits: mockServiceKitsProvider,` adicionar:
```ts
  vehicleModels: mockVehicleModelsProvider,
```
4. Em `supabaseProviders`, após `serviceKits: supabaseServiceKitsProvider,` adicionar:
```ts
  vehicleModels: supabaseVehicleModelsProvider,
```

- [ ] **Step 7: Re-exportar input/params no barrel `index.ts`**

Em `src/providers/data/index.ts`, dentro do bloco `export type { ... } from "./contracts";`, após a linha `  ICreateServiceKitInput,` (última antes do `} from "./contracts";`) adicionar:
```ts
  IVehicleModelsProvider,
  IListVehicleModelsParams,
  ICreateVehicleModelInput,
  IUpdateVehicleModelPatch,
```
> Os nomes não colidem com nada já exportado no barrel — adicione-os diretamente, sem alias.

- [ ] **Step 8: tsc + prettier**

Run: `bunx tsc --noEmit 2>&1 | grep -iE "vehicleModels|providers/data/(contracts|factory|index)"` → vazio
Run: `bunx prettier --check "src/providers/data/contracts/vehicleModels.ts" "src/providers/data/impl/mock/vehicleModels.ts" "src/providers/data/impl/supabase/vehicleModels.ts" "src/providers/data/hooks/useVehicleModelsProvider.ts" "src/providers/data/contracts/index.ts" "src/providers/data/factory.ts" "src/providers/data/index.ts"` → OK

- [ ] **Step 9: Commit**

```bash
git add src/providers/data/contracts/vehicleModels.ts src/providers/data/impl/mock/vehicleModels.ts src/providers/data/impl/supabase/vehicleModels.ts src/providers/data/hooks/useVehicleModelsProvider.ts src/providers/data/contracts/index.ts src/providers/data/factory.ts src/providers/data/index.ts
git commit -m "feat(providers): register vehicleModels data provider (PRD-034)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: RBAC — resource `vehicleModel`

**Files:**
- Modify: `src/features/rbac/permissions/resources.ts`
- Modify: `src/features/rbac/permissions/matrix.ts`
- Modify: `src/features/rbac/pages/RolesPage.tsx`

- [ ] **Step 1: Adicionar o resource** — em `src/features/rbac/permissions/resources.ts`, adicionar `"vehicleModel",` ao array `RESOURCES` (logo após `"serviceKit",`):

```ts
  "serviceKit",
  "vehicleModel",
```

- [ ] **Step 2: Adicionar entradas na matriz** — em `src/features/rbac/permissions/matrix.ts`:
  - Em `OWNER_ENTRIES`, após `p("serviceKit", CRUD, "all"),` adicionar:
    ```ts
    p("vehicleModel", CRUD, "all"),
    ```
  - Em `GESTOR_ENTRIES`, após `p("serviceKit", CRUD, "store"),` adicionar:
    ```ts
    p("vehicleModel", CRUD, "store"),
    ```
  - Em `VENDEDOR_ENTRIES`, após `p("part", ["view"], "store"),` adicionar:
    ```ts
    p("vehicleModel", ["view"], "store"),
    ```

- [ ] **Step 3: Adicionar label** — em `src/features/rbac/pages/RolesPage.tsx`, no objeto `RESOURCE_LABELS`, adicionar a entrada (perto de `serviceKit`):

```ts
  vehicleModel: "Modelos de veículo",
```

> `RESOURCE_LABELS` é `Record<ResourceName, string>` — sem esta entrada o `tsc` quebra. Verifique que a chave existe.

- [ ] **Step 4: tsc + prettier**

Run: `bunx tsc --noEmit 2>&1 | grep -iE "rbac/permissions|rbac/pages/RolesPage|vehicleModel"` → vazio
Run: `bunx prettier --check "src/features/rbac/permissions/resources.ts" "src/features/rbac/permissions/matrix.ts" "src/features/rbac/pages/RolesPage.tsx"` → OK

- [ ] **Step 5: Commit**

```bash
git add src/features/rbac/permissions/resources.ts src/features/rbac/permissions/matrix.ts src/features/rbac/pages/RolesPage.tsx
git commit -m "feat(rbac): add vehicleModel resource (Owner/Gestor CRUD, Vendedor view) (PRD-034)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Hooks de query e mutação (com audit log)

**Files:**
- Create: `src/features/vehicle-models/hooks/useVehicleModels.ts`
- Create: `src/features/vehicle-models/hooks/useVehicleModel.ts`
- Create: `src/features/vehicle-models/hooks/useVehicleModelMutations.ts`

- [ ] **Step 1: Query de lista**

```ts
// src/features/vehicle-models/hooks/useVehicleModels.ts
import { useQuery } from "@tanstack/react-query";
import type { IListVehicleModelsParams } from "@/providers/data";
import { useVehicleModelsProvider } from "@/providers/data/hooks/useVehicleModelsProvider";

/** Reads the canonical vehicle-model catalog. Shares the ["vehicle-models"] key family. */
export function useVehicleModels(params: IListVehicleModelsParams = {}) {
  const provider = useVehicleModelsProvider();
  return useQuery({
    queryKey: ["vehicle-models", params] as const,
    queryFn: () => provider.list(params),
  });
}
```

- [ ] **Step 2: Query de detalhe**

```ts
// src/features/vehicle-models/hooks/useVehicleModel.ts
import { useQuery } from "@tanstack/react-query";
import type { ID } from "@/shared/types";
import { useVehicleModelsProvider } from "@/providers/data/hooks/useVehicleModelsProvider";

/** Reads a single vehicle model by id. */
export function useVehicleModel(id: ID | undefined) {
  const provider = useVehicleModelsProvider();
  return useQuery({
    queryKey: ["vehicle-models", "detail", id] as const,
    queryFn: () => provider.get(id as ID),
    enabled: !!id,
  });
}
```

- [ ] **Step 3: Mutações + audit**

```ts
// src/features/vehicle-models/hooks/useVehicleModelMutations.ts
import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { ID, IVehicleModel } from "@/shared/types";
import {
  recordAuditLogSync,
  type ICreateVehicleModelInput,
  type IUpdateVehicleModelPatch,
} from "@/providers/data";
import { useVehicleModelsProvider } from "@/providers/data/hooks/useVehicleModelsProvider";
import { readCurrentUserSync } from "@/features/auth/guards";

export interface IUseVehicleModelMutations {
  saving: boolean;
  create: (input: ICreateVehicleModelInput) => Promise<IVehicleModel>;
  update: (id: ID, patch: IUpdateVehicleModelPatch) => Promise<IVehicleModel>;
  remove: (id: ID) => Promise<void>;
}

/** Vehicle-model write operations with cache invalidation, toasts and audit log. */
export function useVehicleModelMutations(): IUseVehicleModelMutations {
  const provider = useVehicleModelsProvider();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["vehicle-models"] });
  }, [queryClient]);

  const audit = useCallback((action: string, resourceId: ID, after?: unknown) => {
    const user = readCurrentUserSync();
    recordAuditLogSync({
      actorId: user?.id ?? "mock-user",
      action,
      resource: "vehicleModel",
      resourceId,
      after,
    });
  }, []);

  const wrap = useCallback(
    async <T>(op: () => Promise<T>, okMsg: string): Promise<T> => {
      setSaving(true);
      try {
        const result = await op();
        invalidate();
        toast.success(okMsg);
        return result;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Operação falhou.";
        toast.error(msg);
        throw err;
      } finally {
        setSaving(false);
      }
    },
    [invalidate],
  );

  return {
    saving,
    create: (input) =>
      wrap(async () => {
        const created = await provider.create(input);
        audit("create", created.id, created);
        return created;
      }, "Modelo criado com sucesso."),
    update: (id, patch) =>
      wrap(async () => {
        const updated = await provider.update(id, patch);
        audit(patch.status ? "update_status" : "update", updated.id, updated);
        return updated;
      }, "Modelo atualizado."),
    remove: (id) =>
      wrap(async () => {
        await provider.delete(id);
        audit("delete", id);
      }, "Modelo excluído."),
  };
}
```

- [ ] **Step 4: tsc + prettier**

Run: `bunx tsc --noEmit 2>&1 | grep -iE "vehicle-models/hooks"` → vazio
Run: `bunx prettier --check "src/features/vehicle-models/hooks/useVehicleModels.ts" "src/features/vehicle-models/hooks/useVehicleModel.ts" "src/features/vehicle-models/hooks/useVehicleModelMutations.ts"` → OK

- [ ] **Step 5: Commit**

```bash
git add src/features/vehicle-models/hooks
git commit -m "feat(vehicle-models): query + mutation hooks with audit log (PRD-034)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Validação + formulário de modelo

**Files:**
- Create: `src/features/vehicle-models/utils/modelValidation.ts`
- Create: `src/features/vehicle-models/components/VehicleModelForm.tsx`

Espelhe o padrão de form de `src/features/service-kits/components/KitForm.tsx` (react-hook-form + zod via `@hookform/resolvers/zod`, inputs shadcn). Campos: marca (select com `KNOWN_BRANDS` + opção "Outro" que revela input livre), modelo (texto), motor (texto), anos (yearStart/yearEnd numéricos opcionais).

- [ ] **Step 1: Schema zod**

```ts
// src/features/vehicle-models/utils/modelValidation.ts
import { z } from "zod";

const currentYear = new Date().getFullYear();

export const modelFormSchema = z
  .object({
    brand: z.string().trim().min(1, "A marca é obrigatória."),
    model: z.string().trim().min(1, "O modelo é obrigatório."),
    engine: z.string().trim().min(1, "O motor é obrigatório."),
    yearStart: z
      .number({ invalid_type_error: "Ano inválido." })
      .int()
      .min(1980)
      .max(currentYear + 1)
      .optional(),
    yearEnd: z
      .number({ invalid_type_error: "Ano inválido." })
      .int()
      .min(1980)
      .max(currentYear + 1)
      .optional(),
  })
  .refine((v) => v.yearStart == null || v.yearEnd == null || v.yearStart <= v.yearEnd, {
    message: "Ano inicial não pode ser maior que o final.",
    path: ["yearStart"],
  });

export type ModelFormValues = z.infer<typeof modelFormSchema>;
```

- [ ] **Step 2: Componente de formulário**

Props: `{ initial?: IVehicleModel; saving: boolean; onSubmit: (input: ICreateVehicleModelInput) => void | Promise<void>; onCancel?: () => void }`.

Requisitos:
- `useForm<ModelFormValues>({ resolver: zodResolver(modelFormSchema), defaultValues: ... })`.
- Marca: shadcn `Select` com itens de `KNOWN_BRANDS` + item `"__other__"` rotulado "Outro…"; quando "Outro", mostrar `Input` livre para a marca. (Se `initial.brand` não estiver em `KNOWN_BRANDS`, iniciar em "Outro".)
- Motor: `Input` com hint "Ex.: DC13 143 Euro 5".
- Anos: dois `Input type="number"` opcionais (converter "" → undefined).
- Erros inline de `formState.errors` em `text-destructive text-sm`.
- Submit chama `onSubmit({ brand, model, engine, yearStart, yearEnd })`. Botão "Salvar" com `disabled={saving}` e label "Salvando…" enquanto `saving`.
- Tokens semânticos apenas; light+dark; labels em PT-BR.

Use o `KitForm.tsx` como referência de estrutura (imports de `@/components/ui/*`, layout de campos, tratamento de submit).

- [ ] **Step 3: tsc + prettier**

Run: `bunx tsc --noEmit 2>&1 | grep -iE "vehicle-models/(utils/modelValidation|components/VehicleModelForm)"` → vazio
Run: `bunx prettier --check "src/features/vehicle-models/utils/modelValidation.ts" "src/features/vehicle-models/components/VehicleModelForm.tsx"` → OK

- [ ] **Step 4: Commit**

```bash
git add src/features/vehicle-models/utils/modelValidation.ts src/features/vehicle-models/components/VehicleModelForm.tsx
git commit -m "feat(vehicle-models): model form + zod validation (PRD-034)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Componentes de lista (avatar, chips, linha, grupo, delete dialog)

**Files:**
- Create: `src/features/vehicle-models/components/BrandAvatar.tsx`
- Create: `src/features/vehicle-models/components/BrandFilterChips.tsx`
- Create: `src/features/vehicle-models/components/VehicleModelRow.tsx`
- Create: `src/features/vehicle-models/components/BrandGroup.tsx`
- Create: `src/features/vehicle-models/components/DeleteVehicleModelDialog.tsx`

Tokens semânticos apenas; light+dark; WCAG AA. Use `@/components/Icon` (wrapper Iconify) e `@/components/ui/*` (Button, Badge, DropdownMenu, AlertDialog).

- [ ] **Step 1: `BrandAvatar`**

Props `{ brand: string; size?: number }`. Renderiza um círculo `bg-muted` com `getBrandIcon(brand)` centralizado, `aria-hidden`. Default `size-9`.

```tsx
// src/features/vehicle-models/components/BrandAvatar.tsx
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { getBrandIcon } from "../utils/brandIcon";

export function BrandAvatar({ brand, className }: { brand: string; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-foreground",
        className,
      )}
    >
      <Icon icon={getBrandIcon(brand)} size={20} />
    </span>
  );
}
```

- [ ] **Step 2: `BrandFilterChips`**

Props `{ brands: readonly string[]; selected: string | null; onSelect: (brand: string | null) => void }`. Renderiza um chip "Todas" + um por marca (com `BrandAvatar`/ícone + label). Chip ativo via `aria-pressed` e estilo (ex.: `bg-primary text-primary-foreground` quando ativo, `bg-muted` quando não). Implementar como `<button type="button">` com `role` adequado dentro de um `<div role="group" aria-label="Filtrar por marca">`. Scroll horizontal no mobile (`overflow-x-auto`).

- [ ] **Step 3: `VehicleModelRow`**

Props `{ model: IVehicleModel; canManage: boolean; onEdit: (m) => void; onToggleStatus: (m) => void; onDelete: (m) => void }`. Layout: linha clicável (link para `/app/kits/$modelId` via `<Link>` do TanStack Router envolvendo o conteúdo principal) com `BrandAvatar` + modelo (`font-medium`) + motor (`text-sm text-muted-foreground tabular-nums`, com leve destaque) + faixa de anos (`text-muted-foreground tabular-nums`, formato `2018–2024` ou `2018–atual` quando `yearEnd` ausente) + pílula "Kits 0" (`Badge variant="secondary"`, tooltip "Kits chegam no PRD-035") + menu de ações `mdi:dots-vertical` (DropdownMenu: Editar, Inativar/Reativar, Excluir) **somente quando `canManage`**. Inativo: `opacity-60` na linha + `Badge` textual "Inativo" (`variant="outline"`/`muted`). O menu de ações é um `<button>` IRMÃO do link (não aninhado) para evitar nested-interactive. `py-3`.

- [ ] **Step 4: `BrandGroup`**

Props `{ brand: string; models: IVehicleModel[]; canManage: boolean; ...handlers }`. Cabeçalho de grupo sticky (`sticky top-0 bg-card z-10`) com `BrandAvatar` + nome da marca (`<h2>`) + contador "N modelos". `<section aria-labelledby>`. Lista as `VehicleModelRow`. Container do grupo com `border border-border rounded-lg bg-card`.

- [ ] **Step 5: `DeleteVehicleModelDialog`**

Props `{ model: IVehicleModel | null; onOpenChange: (open: boolean) => void; onConfirm: () => void }`. Usa shadcn `AlertDialog`. Tom calmo (não alarmante): título "Excluir modelo?", descrição explicando que excluir remove o modelo do catálogo (e sugerindo *inativar* como alternativa reversível). Botão de confirmação `variant="destructive"` só para exclusão física. Espelhe `DeleteKitDialog.tsx`.

- [ ] **Step 6: tsc + prettier**

Run: `bunx tsc --noEmit 2>&1 | grep -iE "vehicle-models/components"` → vazio
Run: `bunx prettier --check "src/features/vehicle-models/components/BrandAvatar.tsx" "src/features/vehicle-models/components/BrandFilterChips.tsx" "src/features/vehicle-models/components/VehicleModelRow.tsx" "src/features/vehicle-models/components/BrandGroup.tsx" "src/features/vehicle-models/components/DeleteVehicleModelDialog.tsx"` → OK

- [ ] **Step 7: Commit**

```bash
git add src/features/vehicle-models/components
git commit -m "feat(vehicle-models): brand-grouped list components (PRD-034)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: Páginas (lista, form, detalhe) + barrel da feature

**Files:**
- Create: `src/features/vehicle-models/pages/VehicleModelsListPage.tsx`
- Create: `src/features/vehicle-models/pages/VehicleModelFormPage.tsx`
- Create: `src/features/vehicle-models/pages/VehicleModelDetailPage.tsx`
- Create: `src/features/vehicle-models/index.ts`

Espelhe `ServiceKitsListPage.tsx` (estrutura de página, busca, permissão). Use `usePermission`/`<Can>` ou `useAuth` para `canManage` (Owner/Gestor). Verifique o helper real: `src/features/rbac/utils/hasPermission.ts` + `useAuth` (`src/features/auth/useAuth.ts`) — derive `canManage = hasPermission(user, "vehicleModel", "create")`.

- [ ] **Step 1: `VehicleModelsListPage`**

Comportamento:
- `useVehicleModels({ brand, status, search })` (passar `status: showInactive ? undefined : "ativo"`; `brand` do chip; `search` do input — ou filtrar client-side como no `ServiceKitsListPage`; preferir client-side para busca instantânea e server-param para brand/status).
- Estado local: `search`, `selectedBrand: string | null`, `showInactive: boolean`, `toDelete`.
- Agrupar os modelos resultantes por marca (na ordem de `KNOWN_BRANDS`, marcas desherdadas ao fim) e renderizar um `BrandGroup` por marca não-vazia.
- Cabeçalho: `<h1>Modelos</h1>` + contador "· N" com `aria-live="polite"` + botão "Novo modelo" (`mdi:plus`) **só quando `canManage`**, navegando para `/app/kits/novo`.
- Linha de busca (`Input` com `mdi:magnify`, `max-w-sm`) + `BrandFilterChips` + toggle "Mostrar inativos" (`Switch` ou `Checkbox` shadcn).
- Empty states: catálogo vazio (sem resultado e sem filtros) → mensagem + CTA "Cadastrar primeiro modelo" (só `canManage`); busca/filtro sem resultado → mensagem distinta.
- Loading: `kitsQuery.isLoading` → texto "Carregando modelos…".
- `DeleteVehicleModelDialog` ligado a `toDelete` + `mutations.remove`.
- Container `max-w-5xl` centralizado, `space-y-4 p-4`.
- Ações de linha: `onEdit` → navega `/app/kits/$modelId/editar`; `onToggleStatus` → `mutations.update(m.id, { status: m.status === "ativo" ? "inativo" : "ativo" })`; `onDelete` → `setToDelete`.

- [ ] **Step 2: `VehicleModelFormPage`**

Props `{ mode: "create" | "edit" }`. Em `edit`, lê `modelId` de `useParams` e `useVehicleModel(modelId)`; em `create`, `initial=undefined`. Renderiza breadcrumb (`Kits por modelo / Novo modelo` ou `/ <marca modelo> / Editar`), o `VehicleModelForm`, e no submit chama `mutations.create`/`mutations.update` e navega de volta para `/app/kits` (ou para o detalhe). Espelhe `ServiceKitFormPage.tsx`.

- [ ] **Step 3: `VehicleModelDetailPage`**

Lê `modelId` via `useParams`, `useVehicleModel(modelId)`. Renderiza:
- Breadcrumb `Kits por modelo / <marca> <modelo> (<motor>)` (link de volta para `/app/kits`).
- Cabeçalho: `BrandAvatar` (maior, `size-12`) + `<h1>` modelo + motor + faixa de anos + badge de status; ações Editar/Inativar **só `canManage`**.
- Seção "Kits deste modelo" — **slot vazio honesto**: card `border-dashed` com ícone + título "Nenhum kit cadastrado para este modelo" + texto "Em breve você poderá montar kits de peças aplicáveis a este modelo." **Sem** botão de criar kit (não existe ainda).
- Estados loading/erro (modelo inexistente → mensagem + link de volta).

- [ ] **Step 4: Barrel da feature**

```ts
// src/features/vehicle-models/index.ts
export { VehicleModelsListPage } from "./pages/VehicleModelsListPage";
export { VehicleModelFormPage } from "./pages/VehicleModelFormPage";
export { VehicleModelDetailPage } from "./pages/VehicleModelDetailPage";
```

- [ ] **Step 5: tsc + prettier**

Run: `bunx tsc --noEmit 2>&1 | grep -iE "vehicle-models/(pages|index)"` → vazio
Run: `bunx prettier --check "src/features/vehicle-models/pages/VehicleModelsListPage.tsx" "src/features/vehicle-models/pages/VehicleModelFormPage.tsx" "src/features/vehicle-models/pages/VehicleModelDetailPage.tsx" "src/features/vehicle-models/index.ts"` → OK

- [ ] **Step 6: Commit**

```bash
git add src/features/vehicle-models/pages src/features/vehicle-models/index.ts
git commit -m "feat(vehicle-models): list, form and detail pages (PRD-034)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 11: Rotas + constante + navegação

**Files:**
- Create: `src/routes/app.kits.tsx`, `app.kits.index.tsx`, `app.kits.novo.tsx`, `app.kits.$modelId.tsx`, `app.kits.$modelId.editar.tsx`
- Modify: `src/features/shell/config/routes.ts`, `src/features/shell/config/navigation.ts`

Espelhe os arquivos `src/routes/app.catalogo.kits*.tsx` (mesmo padrão de guard via `readCurrentUserSync` + `hasPermission`).

- [ ] **Step 1: Constante de rota** — em `src/features/shell/config/routes.ts`, após `APP_CATALOGO_KITS: "/app/catalogo/kits",` adicionar:

```ts
  APP_KITS: "/app/kits",
```

- [ ] **Step 2: Layout + guard** — `src/routes/app.kits.tsx`:

```tsx
import { createFileRoute, redirect, Outlet } from "@tanstack/react-router";
import { hasPermission } from "@/features/rbac/utils/hasPermission";
import { readCurrentUserSync } from "@/features/auth/guards";

function KitsByModelLayout() {
  return <Outlet />;
}

export const Route = createFileRoute("/app/kits")({
  beforeLoad: () => {
    const user = readCurrentUserSync();
    if (!hasPermission(user, "vehicleModel", "view")) {
      throw redirect({ to: "/app/inicio" });
    }
  },
  component: KitsByModelLayout,
});
```

- [ ] **Step 3: Index (lista)** — `src/routes/app.kits.index.tsx`:

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { VehicleModelsListPage } from "@/features/vehicle-models";

export const Route = createFileRoute("/app/kits/")({
  component: VehicleModelsListPage,
});
```

- [ ] **Step 4: Novo** — `src/routes/app.kits.novo.tsx`:

```tsx
import { createFileRoute, redirect } from "@tanstack/react-router";
import { hasPermission } from "@/features/rbac/utils/hasPermission";
import { readCurrentUserSync } from "@/features/auth/guards";
import { VehicleModelFormPage } from "@/features/vehicle-models";

function NovoModeloPage() {
  return <VehicleModelFormPage mode="create" />;
}

export const Route = createFileRoute("/app/kits/novo")({
  beforeLoad: () => {
    const user = readCurrentUserSync();
    if (!hasPermission(user, "vehicleModel", "create")) {
      throw redirect({ to: "/app/kits" });
    }
  },
  component: NovoModeloPage,
});
```

- [ ] **Step 5: Detalhe** — `src/routes/app.kits.$modelId.tsx`:

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { VehicleModelDetailPage } from "@/features/vehicle-models";

export const Route = createFileRoute("/app/kits/$modelId")({
  component: VehicleModelDetailPage,
});
```

> NOTA: a rota `/app/kits/$modelId` e `/app/kits/novo` coexistem; o TanStack Router prioriza o segmento estático `novo` sobre o param `$modelId`. Manter ambos.

- [ ] **Step 6: Editar** — `src/routes/app.kits.$modelId.editar.tsx`:

```tsx
import { createFileRoute, redirect } from "@tanstack/react-router";
import { hasPermission } from "@/features/rbac/utils/hasPermission";
import { readCurrentUserSync } from "@/features/auth/guards";
import { VehicleModelFormPage } from "@/features/vehicle-models";

function EditarModeloPage() {
  return <VehicleModelFormPage mode="edit" />;
}

export const Route = createFileRoute("/app/kits/$modelId/editar")({
  beforeLoad: () => {
    const user = readCurrentUserSync();
    if (!hasPermission(user, "vehicleModel", "edit")) {
      throw redirect({ to: "/app/kits" });
    }
  },
  component: EditarModeloPage,
});
```

- [ ] **Step 7: Item de navegação** — em `src/features/shell/config/navigation.ts`, no grupo `"Comercial"`, logo após o item `"Kits de revisão"`, adicionar:

```ts
      {
        label: "Kits por modelo",
        icon: "mdi:truck-outline",
        to: ROUTES.APP_KITS,
        roles: ["Owner", "Gestor", "Vendedor"],
      },
```

- [ ] **Step 8: Regenerar routeTree e verificar**

O `tanstackRouter` plugin regenera `src/routeTree.gen.ts` ao rodar `bun run dev`/`build`. Como o usuário mantém o dev server na porta 5173, o arquivo regenera sozinho. Confirme que as novas rotas aparecem:

Run: `bunx tsc --noEmit 2>&1 | grep -iE "routes/app.kits|shell/config/(routes|navigation)"`
Expected: vazio. (Se `routeTree.gen.ts` aparecer modificado só por CRLF, ignore ou `git checkout -- src/routeTree.gen.ts` — mas se ganhou as rotas novas de verdade, **inclua-o** no commit.)

Run: `bunx prettier --check "src/routes/app.kits.tsx" "src/routes/app.kits.index.tsx" "src/routes/app.kits.novo.tsx" "src/routes/app.kits.\$modelId.tsx" "src/routes/app.kits.\$modelId.editar.tsx" "src/features/shell/config/routes.ts" "src/features/shell/config/navigation.ts"` → OK

- [ ] **Step 9: Commit**

```bash
git add src/routes/app.kits.tsx src/routes/app.kits.index.tsx src/routes/app.kits.novo.tsx "src/routes/app.kits.\$modelId.tsx" "src/routes/app.kits.\$modelId.editar.tsx" src/features/shell/config/routes.ts src/features/shell/config/navigation.ts src/routeTree.gen.ts
git commit -m "feat(vehicle-models): routes + nav entry 'Kits por modelo' (PRD-034)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

> Se `src/routeTree.gen.ts` só mudou por CRLF (não ganhou as rotas), remova-o do `git add` e rode `git checkout -- src/routeTree.gen.ts` antes do commit.

---

## Task 12: Versionamento (MINOR "Catalog")

**Files:**
- Modify: `package.json`, `CHANGELOG.md`, `CLAUDE.md`

Executar **após** todas as tarefas anteriores aprovadas e a revisão holística final. Seguir a skill `versionamento` (descoberta de infra de versão). Hoje: `package.json` v0.62.0 "Workshop" → **v0.63.0 "Catalog"** (MINOR).

- [ ] **Step 1: Bump `package.json`** — `"version": "0.63.0"`.

- [ ] **Step 2: CHANGELOG.md** — nova seção no topo (Keep a Changelog), categoria `Added`, linguagem acessível ao usuário final:
  - "Catálogo de modelos de veículo — nova área **Kits por modelo** onde Owner e Gestor cadastram, editam, inativam e buscam os modelos canônicos (marca + modelo + motor + anos), agrupados por marca."
  - "Cada modelo tem página própria, preparada para receber os kits de peças (em breve)."
  - "Vendedor consulta o catálogo de modelos em modo leitura."

- [ ] **Step 3: CLAUDE.md** — atualizar a linha do codinome/versão (`Workshop — v0.62.0` → `Catalog — v0.63.0`).

- [ ] **Step 4: Validar build**

Run: `bun run build`
Expected: build conclui sem erro (lembre: não type-checa; o gate de tipos foi por-tarefa).

- [ ] **Step 5: Commit + tag**

```bash
git add package.json CHANGELOG.md CLAUDE.md
git commit -m "chore: bump version to v0.63.0 Catalog and update changelog

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
git tag v0.63.0
```

> O merge para `main` e a remoção da branch são feitos pela skill `finishing-a-development-branch` após a revisão final. O renomear do PRD para `PRD-034-catalogo-modelos_DONE.md` + atualização do "Status de Implementação" também entram aqui (ou como passo extra do versionamento).

---

## Notas de execução

- **Ordem:** 1→12. Tarefas 1–7 são plumbing de baixo acoplamento; 8–11 são UI; 12 é release.
- **Revisão por tarefa** (subagent-driven): spec-compliance primeiro, depois code-quality. Atenção especial: (a) `RESOURCE_LABELS` exaustivo em RolesPage (quebra `tsc` se faltar); (b) não aninhar `<button>` dentro do `<Link>` na linha; (c) tokens semânticos apenas; (d) `routeTree.gen.ts` CRLF.
- **Revisão holística final** (opus) antes do merge: verificar que os "Kits de revisão" (`/app/catalogo/kits`) seguem intactos e funcionais; que a navegação mostra os dois itens; que nenhum import de `src/mocks/data/*` foi feito de dentro de `src/features/*`.
- **Fora de escopo deste plano** (PRD-035/016): migração dos kits, redirect de `/app/catalogo/kits`, `IVehicle.modelId`, bloqueio de exclusão por vínculo, gestão de kits no detalhe.
