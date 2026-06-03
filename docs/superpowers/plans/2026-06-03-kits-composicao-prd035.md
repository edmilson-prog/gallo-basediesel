# Kits de Composição por Modelo (PRD-035) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar o **Kit de composição por modelo** (`IVehicleModelKit`) pendurado no catálogo canônico (PRD-034), gerenciado no detalhe do modelo e aplicável com um clique no orçamento — **consolidando** (recomeço limpo) a feature antiga `IServiceKit`.

**Architecture:** Feature nova `src/features/model-kits/` consome o provider `modelKits` (Provider Pattern: contract + impl mock + stub supabase + hook + factory). Mock in-memory semeado por ~10 kits `filtros` ancorados em `modelId` real. UI = cards no slot "Kits deste modelo" do detalhe do modelo + editor em **página dedicada** + modal de preview na aplicação ao orçamento. Lógica pura (matching por string até o PRD-016, drift, expansão para preview) isolada em `utils/`. A consolidação é **incremental**: tudo aditivo até a task de **cutover** (Task 19), que remove a feature antiga e liga o redirect — mantendo `tsc` verde a cada commit.

**Tech Stack:** React 19 + TS strict, Vite, TanStack Router (file-based) + TanStack Query, Tailwind v4 + shadcn/ui, Iconify (`mdi:*`), zod + react-hook-form, sonner, Bun.

**Spec:** `docs/superpowers/specs/2026-06-03-kits-composicao-prd035-design.md` (aprovado).

**Gates do repositório (LER ANTES DE COMEÇAR):**

- **`bun run build` NÃO faz type-check** (esbuild remove tipos). O gate de tipos real é `bunx tsc --noEmit 2>&1` filtrado pelos arquivos tocados — deve sair **vazio**. O repo tem ~316 erros pré-existentes de `tsc`; ignore os que não casam com os arquivos da tarefa.
- **`bun run lint` global é INUTILIZÁVEL** (milhares de falsos `prettier/prettier Delete ␍` por CRLF). Valide **por-arquivo**: `bunx prettier --check "<arquivo>"`.
- **Sem test runner.** Lógica pura é validada com script descartável `scripts/_check_*.ts` rodado com `bun`, **apagado no mesmo commit**.
- **`src/routeTree.gen.ts` é GERADO** — nunca editar à mão. Após adicionar/remover arquivos `src/routes/*`, regenerar rodando o dev server (porta 5173; já roda nesta sessão). Se aparecer como modificado só por CRLF, `git checkout -- src/routeTree.gen.ts`.
- **UI é validada manualmente pelo usuário** — NÃO abrir browser/devtools/preview.
- **IGNORAR** qualquer pasta contendo `worktrees`.
- **Subagentes NÃO trocam de branch** (sem `git checkout`/`stash` de branch).
- **Antes de deletar/sobrescrever arquivo**, confirmar que é o esperado (ler primeiro).
- Commits: Conventional Commits em inglês, terminando com `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

**Convenção de granularidade das tasks de UI:** tarefas de plumbing/lógica trazem **código integral**. Tarefas de UI (cards, editor, modal, banners) trazem **contrato (props/interface) + especificação de design verbatim do consultor (ASCII, componentes shadcn, tokens, estados, a11y) + pontos de fiação exatos** — o subagente implementador escreve o JSX seguindo os componentes vizinhos da própria feature. Mesmo padrão aceito no plano do PRD-034.

---

## File Structure

**Criar:**

- `src/shared/types/model-kits.ts` — `IVehicleModelKit`, `IKitItem`, `ModelKitCategory`, `ModelKitStatus`
- `src/providers/data/contracts/modelKits.ts` — contrato + inputs/params
- `src/providers/data/impl/mock/modelKits.ts` — delega à api
- `src/providers/data/impl/supabase/modelKits.ts` — stub `NotImplementedError`
- `src/providers/data/hooks/useModelKitsProvider.ts` — hook
- `src/mocks/api/modelKits.ts` — mock api (store in-memory, CRUD, validação)
- `src/mocks/data/seedModelKits.ts` — `SEED_MODEL_KITS` (~10 kits `filtros`)
- `src/features/model-kits/utils/modelKitMatching.ts` — `findKitsForVehicle`, normalização
- `src/features/model-kits/utils/modelKitDrift.ts` — `getCompatiblePartsNotInKit`
- `src/features/model-kits/utils/kitPreview.ts` — `buildKitPreview` (expansão p/ modal)
- `src/features/model-kits/utils/modelKitValidation.ts` — zod schema do editor
- `src/features/model-kits/hooks/useModelKits.ts` — query lista (por modelId)
- `src/features/model-kits/hooks/useModelKit.ts` — query detalhe (get)
- `src/features/model-kits/hooks/useModelKitMutations.ts` — create/update/promote/demote/remove + audit
- `src/features/model-kits/components/KitCategoryBadge.tsx`
- `src/features/model-kits/components/KitStatusBadge.tsx`
- `src/features/model-kits/components/KitItemsPreview.tsx` — bloco `●/○`
- `src/features/model-kits/components/ModelKitCard.tsx` — Superfície 1
- `src/features/model-kits/components/ModelKitsSection.tsx` — wrapper do slot no detalhe
- `src/features/model-kits/components/DeleteModelKitDialog.tsx`
- `src/features/model-kits/components/KitItemEditorRow.tsx` — linha editável (qtd/switch/nota)
- `src/features/model-kits/components/KitCatalogSearch.tsx` — busca + resultados
- `src/features/model-kits/components/KitDriftBanner.tsx` — Superfície 4a
- `src/features/model-kits/components/ApplyKitDialog.tsx` — Superfície 3
- `src/features/model-kits/components/KitSuggestionBanner.tsx` — Superfície 4b
- `src/features/model-kits/pages/ModelKitFormPage.tsx` — editor (Superfície 2)
- `src/features/model-kits/index.ts`
- `src/routes/app.kits.$modelId.kit.novo.tsx`
- `src/routes/app.kits.$modelId.kit.$kitId.editar.tsx`
- `scripts/_check_model_kits_logic.ts` (descartável, apagado no commit da Task 7)
- `scripts/_check_seed_model_kits.ts` (descartável, apagado no commit da Task 5)

**Modificar:**

- `src/shared/types/index.ts` — re-export do tipo novo
- `src/shared/types/commercial.ts` — `appliedKitIds?` em `IQuote`
- `src/providers/data/contracts/index.ts` — registrar contrato + `IDataProviders.modelKits`
- `src/providers/data/factory.ts` — registrar impls mock/supabase
- `src/providers/data/index.ts` — re-export do hook + tipos
- `src/mocks/api/index.ts` — re-export `modelKitsApi`
- `src/features/rbac/permissions/resources.ts` — `"modelKit"`
- `src/features/rbac/permissions/matrix.ts` — entradas Owner/Gestor/Vendedor
- `src/features/rbac/pages/RolesPage.tsx` — `RESOURCE_LABELS.modelKit`
- `src/features/vehicle-models/pages/VehicleModelDetailPage.tsx` — substituir o slot pelo `<ModelKitsSection>`
- `src/features/vehicle-models/components/VehicleModelRow.tsx` — pílula "Kits N · ●rascunhos"
- `src/features/vehicle-models/pages/VehicleModelsListPage.tsx` — chip "Com rascunhos pendentes"
- `src/features/quotes/components/new/QuoteEditor.tsx` — modal de preview + `appliedKitIds` + undo
- `src/features/quotes/components/new/items/KitPicker.tsx` — adaptar para abrir o modal
- `src/features/vehicles/components/detail/MaintenanceRecommendations.tsx` — card "Filtros" aplica Kit

**Remover (Task 19 — cutover):**

- `src/features/service-kits/**` (16 arquivos)
- `src/shared/types/service-kit.ts`
- `src/providers/data/contracts/serviceKits.ts`, `impl/mock/serviceKits.ts`, `impl/supabase/serviceKits.ts`, `hooks/useServiceKitsProvider.ts`
- `src/mocks/api/serviceKits.ts`, `src/mocks/data/seedServiceKits.ts`
- `src/features/quotes/utils/kitExpansion.ts` (substituído por `kitPreview.ts`)
- item de nav "Kits de revisão"; resource/label/matriz `serviceKit`
- `src/routes/app.catalogo.kits.tsx` vira **redirect** (não deletado)

---

# FASE 1 — Fundações (aditivas)

## Task 1: Tipos de domínio `IVehicleModelKit` / `IKitItem`

**Files:**

- Create: `src/shared/types/model-kits.ts`
- Modify: `src/shared/types/index.ts` (FIM do arquivo, após o export de `vehicle-models`)

- [ ] **Step 1: Criar o tipo**

```ts
// src/shared/types/model-kits.ts
import type { ID, ISO8601 } from "./common";

/** Category of a model kit. MVP delivers data for "filtros" only; the union is
 *  forward-compatible with the vehicle-detail recommendation cards (PRD-016). */
export type ModelKitCategory = "filtros" | "freios" | "correia" | "revisao" | "custom";

/** Curation lifecycle: a seller drafts ("rascunho"); a manager promotes to
 *  "oficial". Mirrors the tag-promotion pattern. */
export type ModelKitStatus = "rascunho" | "oficial";

/** One line of a kit — a LIVE reference to a catalog part (never a snapshot).
 *  The snapshot happens on the quote item, at apply time. */
export interface IKitItem {
  partId: ID;
  /** Default quantity injected into the quote (> 0; fuel filters often come in 2). */
  defaultQuantity: number;
  /** false = base part (pre-checked in the apply preview); true = suggestion. */
  isOptional: boolean;
  /** Optional curation note, e.g. "trocar a cada 30.000 km". */
  note?: string;
}

/**
 * Curated bundle of parts hung off a canonical vehicle model (PRD-034). Applied
 * with one click into a quote. The kit is a LIVE definition; quotes snapshot
 * price/OEM at apply time, so kits never need versioning.
 */
export interface IVehicleModelKit {
  id: ID;
  /** Canonical model key (PRD-034). Required — kits hang off models, not strings. */
  modelId: ID;
  storeId: ID;
  name: string;
  category: ModelKitCategory;
  status: ModelKitStatus;
  items: IKitItem[];
  createdBy: ID;
  createdAt: ISO8601;
  updatedAt: ISO8601;
  updatedBy?: ID;
}
```

- [ ] **Step 2: Re-exportar no barrel** — adicionar ao FIM de `src/shared/types/index.ts`:

```ts
// Model kits / curated part bundles per vehicle model (PRD-035)
export type { IVehicleModelKit, IKitItem, ModelKitCategory, ModelKitStatus } from "./model-kits";
```

- [ ] **Step 3: Verificar tipos**

Run: `bunx tsc --noEmit 2>&1 | grep -iE "model-kits|shared/types/index"`
Expected: vazio.

- [ ] **Step 4: Prettier**

Run: `bunx prettier --check "src/shared/types/model-kits.ts"`
Expected: "All matched files use Prettier code style!"

- [ ] **Step 5: Commit**

```bash
git add src/shared/types/model-kits.ts src/shared/types/index.ts
git commit -m "feat(types): add IVehicleModelKit/IKitItem domain types (PRD-035)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Delta `appliedKitIds` em `IQuote`

**Files:**

- Modify: `src/shared/types/commercial.ts:92` (após `notes?: string;`, antes de `createdAt`)

- [ ] **Step 1: Adicionar o campo** — inserir após a linha `notes?: string;` dentro de `interface IQuote`:

```ts
  /** Ids of kits applied to this quote — lightweight adoption metric
   *  ("% de orçamentos via Kit", Bloco 4). PRD-035 delta. */
  appliedKitIds?: ID[];
```

- [ ] **Step 2: Verificar tipos**

Run: `bunx tsc --noEmit 2>&1 | grep -iE "commercial.ts"`
Expected: vazio.

- [ ] **Step 3: Prettier**

Run: `bunx prettier --check "src/shared/types/commercial.ts"`
Expected: "All matched files use Prettier code style!"

- [ ] **Step 4: Commit**

```bash
git add src/shared/types/commercial.ts
git commit -m "feat(types): add IQuote.appliedKitIds for kit-adoption metric (PRD-035)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Provider `modelKits` (contract + impls + hook + factory + barrels)

**Files:**

- Create: `src/providers/data/contracts/modelKits.ts`
- Create: `src/providers/data/impl/mock/modelKits.ts`
- Create: `src/providers/data/impl/supabase/modelKits.ts`
- Create: `src/providers/data/hooks/useModelKitsProvider.ts`
- Modify: `src/providers/data/contracts/index.ts`
- Modify: `src/providers/data/factory.ts`
- Modify: `src/providers/data/index.ts`

> Espelha exatamente a slice `serviceKits` (já existente) com a forma nova. O método de exclusão no contrato é `delete`; a api mock expõe `remove` (a impl mock mapeia). Promoção/despromoção são `update({ status })`, não métodos próprios.

- [ ] **Step 1: Contract** — `src/providers/data/contracts/modelKits.ts`:

```ts
import type {
  ID,
  IVehicleModelKit,
  IKitItem,
  ModelKitCategory,
  ModelKitStatus,
} from "@/shared/types";

export interface IListModelKitsParams {
  modelId?: ID;
  status?: ModelKitStatus;
  category?: ModelKitCategory;
  search?: string;
}

export interface ICreateModelKitInput {
  modelId: ID;
  storeId: ID;
  name: string;
  category: ModelKitCategory;
  status?: ModelKitStatus;
  items: IKitItem[];
}

export interface IUpdateModelKitPatch {
  name?: string;
  category?: ModelKitCategory;
  status?: ModelKitStatus;
  items?: IKitItem[];
}

/**
 * Contract for model kits (PRD-035). `list` is read by the model-detail section
 * and the quote editor; writes back the editor + curation actions.
 *
 * @see ../../../mocks/api/modelKits.ts
 */
export interface IModelKitsProvider {
  list(params?: IListModelKitsParams): Promise<IVehicleModelKit[]>;
  get(id: ID): Promise<IVehicleModelKit>;
  create(input: ICreateModelKitInput): Promise<IVehicleModelKit>;
  update(id: ID, patch: IUpdateModelKitPatch): Promise<IVehicleModelKit>;
  delete(id: ID): Promise<void>;
}
```

- [ ] **Step 2: Impl mock** — `src/providers/data/impl/mock/modelKits.ts`:

```ts
import { modelKitsApi } from "@/mocks";
import type { IModelKitsProvider } from "../../contracts/modelKits";

export const mockModelKitsProvider: IModelKitsProvider = {
  list: (params) => modelKitsApi.list(params),
  get: (id) => modelKitsApi.get(id),
  create: (input) => modelKitsApi.create(input),
  update: (id, patch) => modelKitsApi.update(id, patch),
  delete: (id) => modelKitsApi.remove(id),
};
```

- [ ] **Step 3: Impl supabase (stub)** — `src/providers/data/impl/supabase/modelKits.ts`. Abra `src/providers/data/impl/supabase/serviceKits.ts`, copie o padrão exato de `NotImplementedError` e adapte os métodos para `IModelKitsProvider` (`list`/`get`/`create`/`update`/`delete`). Cada método lança `new NotImplementedError("modelKits.<m>")` (use o mesmo import/symbol que `serviceKits.ts` usa).

- [ ] **Step 4: Hook** — `src/providers/data/hooks/useModelKitsProvider.ts`:

```ts
import type { IModelKitsProvider } from "../contracts/modelKits";
import { useDataProviderSlice } from "./_useDataProviderSlice";

export function useModelKitsProvider(): IModelKitsProvider {
  return useDataProviderSlice("modelKits", "useModelKitsProvider");
}
```

- [ ] **Step 5: Registrar no contracts/index.ts** — em `src/providers/data/contracts/index.ts`: (a) adicionar `import type { IModelKitsProvider } from "./modelKits";` junto aos demais; (b) adicionar o bloco de re-export de tipos após o de `vehicleModels`:

```ts
export type {
  IModelKitsProvider,
  IListModelKitsParams,
  ICreateModelKitInput,
  IUpdateModelKitPatch,
} from "./modelKits";
```

(c) adicionar `modelKits: IModelKitsProvider;` ao final de `interface IDataProviders` (após `vehicleModels`).

- [ ] **Step 6: Registrar no factory.ts** — em `src/providers/data/factory.ts`: adicionar os imports `import { mockModelKitsProvider } from "./impl/mock/modelKits";` e `import { supabaseModelKitsProvider } from "./impl/supabase/modelKits";` (junto aos de `vehicleModels`), e adicionar `modelKits: mockModelKitsProvider,` ao `mockProviders` e `modelKits: supabaseModelKitsProvider,` ao `supabaseProviders` (após `vehicleModels`).

- [ ] **Step 7: Re-export do hook** — em `src/providers/data/index.ts`, espelhar a forma como `useVehicleModelsProvider` é re-exportado: adicionar `export { useModelKitsProvider } from "./hooks/useModelKitsProvider";` e re-exportar os tipos `IModelKitsProvider, IListModelKitsParams, ICreateModelKitInput, IUpdateModelKitPatch` (siga o padrão exato já usado para `vehicleModels` nesse arquivo — abra para confirmar a sintaxe local).

- [ ] **Step 8: Verificar tipos** (vai falhar até a api existir — esperado até a Task 4; rode mesmo assim para confirmar que só falta a api)

Run: `bunx tsc --noEmit 2>&1 | grep -iE "providers/data/(contracts/modelKits|impl/(mock|supabase)/modelKits|hooks/useModelKitsProvider|factory|contracts/index|index)"`
Expected: apenas erros referentes a `@/mocks` não exportar `modelKitsApi` (resolvido na Task 4). Nenhum outro.

- [ ] **Step 9: Prettier**

Run: `bunx prettier --check "src/providers/data/contracts/modelKits.ts" "src/providers/data/impl/mock/modelKits.ts" "src/providers/data/impl/supabase/modelKits.ts" "src/providers/data/hooks/useModelKitsProvider.ts" "src/providers/data/contracts/index.ts" "src/providers/data/factory.ts" "src/providers/data/index.ts"`
Expected: "All matched files use Prettier code style!"

- [ ] **Step 10: Commit**

```bash
git add src/providers/data/contracts/modelKits.ts src/providers/data/impl/mock/modelKits.ts src/providers/data/impl/supabase/modelKits.ts src/providers/data/hooks/useModelKitsProvider.ts src/providers/data/contracts/index.ts src/providers/data/factory.ts src/providers/data/index.ts
git commit -m "feat(providers): add modelKits provider slice (PRD-035)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Mock api `modelKits` + barrel

**Files:**

- Create: `src/mocks/api/modelKits.ts`
- Modify: `src/mocks/api/index.ts` (re-export, espelhando `serviceKitsApi`)

> Depende do seed da Task 5. Para manter `tsc` verde, esta task cria a api **importando** `SEED_MODEL_KITS` que será criado na Task 5; portanto **faça a Task 5 antes do Step 4 desta task** (a ordem de commit é Task 5 → Task 4) OU crie um seed vazio temporário. Recomendado: implementar Task 5 primeiro. Aqui o seed é referenciado como `SEED_MODEL_KITS`.

- [ ] **Step 1: Criar a api** — `src/mocks/api/modelKits.ts`:

```ts
import type {
  ID,
  IVehicleModelKit,
  IKitItem,
  ModelKitCategory,
  ModelKitStatus,
} from "@/shared/types";
import { SEED_MODEL_KITS } from "../data/seedModelKits";
import { MockNotFoundError, MockValidationError, runApi } from "./utils";

export interface IListModelKitsParams {
  modelId?: ID;
  status?: ModelKitStatus;
  category?: ModelKitCategory;
  search?: string;
}

export interface ICreateModelKitInput {
  modelId: ID;
  storeId: ID;
  name: string;
  category: ModelKitCategory;
  status?: ModelKitStatus;
  items: IKitItem[];
}

export interface IUpdateModelKitPatch {
  name?: string;
  category?: ModelKitCategory;
  status?: ModelKitStatus;
  items?: IKitItem[];
}

const MOCK_ACTOR = "mock-user";
const NOW = "2026-06-03T12:00:00.000Z";

// In-memory store seeded from SEED_MODEL_KITS. Writes persist for the session and
// reset on reload (Fase 1 mock semantics). TanStack Query invalidation drives UI.
let kits: IVehicleModelKit[] = SEED_MODEL_KITS.map((k) => ({
  ...k,
  items: k.items.map((i) => ({ ...i })),
}));

let createdSeq = 0;
function nextId(): ID {
  createdSeq += 1;
  return `mkit-${createdSeq}`;
}

function clone(k: IVehicleModelKit): IVehicleModelKit {
  return { ...k, items: k.items.map((i) => ({ ...i })) };
}

function validate(input: Pick<ICreateModelKitInput, "modelId" | "name" | "items">): void {
  if (!input.modelId) {
    throw new MockValidationError("O kit precisa estar vinculado a um modelo.", "modelId");
  }
  if (!input.name || !input.name.trim()) {
    throw new MockValidationError("O nome do kit é obrigatório.", "name");
  }
  if (!input.items || input.items.length === 0) {
    throw new MockValidationError("Adicione ao menos uma peça ao kit.", "items");
  }
  for (const it of input.items) {
    if (!it.partId) {
      throw new MockValidationError("Item do kit sem peça vinculada.", "items");
    }
    if (!Number.isInteger(it.defaultQuantity) || it.defaultQuantity < 1) {
      throw new MockValidationError("Quantidade deve ser um inteiro ≥ 1.", "items");
    }
  }
}

function matches(kit: IVehicleModelKit, params: IListModelKitsParams): boolean {
  if (params.modelId && kit.modelId !== params.modelId) return false;
  if (params.status && kit.status !== params.status) return false;
  if (params.category && kit.category !== params.category) return false;
  if (params.search) {
    const q = params.search.trim().toLowerCase();
    if (q && !kit.name.toLowerCase().includes(q)) return false;
  }
  return true;
}

export const modelKitsApi = {
  list(params: IListModelKitsParams = {}): Promise<IVehicleModelKit[]> {
    return runApi("modelKitsApi", "list", () => kits.filter((k) => matches(k, params)).map(clone), {
      payload: params,
    });
  },

  get(id: ID): Promise<IVehicleModelKit> {
    return runApi("modelKitsApi", "get", () => {
      const found = kits.find((k) => k.id === id);
      if (!found) throw new MockNotFoundError("modelKit", id);
      return clone(found);
    });
  },

  create(input: ICreateModelKitInput): Promise<IVehicleModelKit> {
    return runApi("modelKitsApi", "create", () => {
      validate(input);
      const kit: IVehicleModelKit = {
        id: nextId(),
        modelId: input.modelId,
        storeId: input.storeId,
        name: input.name.trim(),
        category: input.category,
        status: input.status ?? "rascunho",
        items: input.items.map((i) => ({ ...i })),
        createdBy: MOCK_ACTOR,
        createdAt: NOW,
        updatedAt: NOW,
      };
      kits = [...kits, kit];
      return clone(kit);
    });
  },

  update(id: ID, patch: IUpdateModelKitPatch): Promise<IVehicleModelKit> {
    return runApi("modelKitsApi", "update", () => {
      const index = kits.findIndex((k) => k.id === id);
      if (index === -1) throw new MockNotFoundError("modelKit", id);
      const current = kits[index]!;
      const merged: IVehicleModelKit = {
        ...current,
        name: "name" in patch ? (patch.name ?? "").trim() : current.name,
        category: "category" in patch ? (patch.category ?? current.category) : current.category,
        status: "status" in patch ? (patch.status ?? current.status) : current.status,
        items:
          "items" in patch
            ? (patch.items ?? []).map((i) => ({ ...i }))
            : current.items.map((i) => ({ ...i })),
        updatedAt: NOW,
        updatedBy: MOCK_ACTOR,
      };
      validate({ modelId: merged.modelId, name: merged.name, items: merged.items });
      kits = kits.map((k, i) => (i === index ? merged : k));
      return clone(merged);
    });
  },

  remove(id: ID): Promise<void> {
    return runApi("modelKitsApi", "remove", () => {
      const exists = kits.some((k) => k.id === id);
      if (!exists) throw new MockNotFoundError("modelKit", id);
      kits = kits.filter((k) => k.id !== id);
      return undefined;
    });
  },
};
```

- [ ] **Step 2: Re-export no barrel** — em `src/mocks/api/index.ts`, espelhar a linha de `serviceKitsApi` adicionando: `export { modelKitsApi } from "./modelKits";` (e os tipos, se o arquivo re-exporta tipos por api — confirmar abrindo).

- [ ] **Step 3: Verificar tipos**

Run: `bunx tsc --noEmit 2>&1 | grep -iE "mocks/api/(modelKits|index)|providers/data/.*modelKits"`
Expected: vazio (resolve também o pendente da Task 3).

- [ ] **Step 4: Prettier**

Run: `bunx prettier --check "src/mocks/api/modelKits.ts" "src/mocks/api/index.ts"`
Expected: "All matched files use Prettier code style!"

- [ ] **Step 5: Commit**

```bash
git add src/mocks/api/modelKits.ts src/mocks/api/index.ts
git commit -m "feat(mocks): add modelKits in-memory api (PRD-035)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Seed `SEED_MODEL_KITS` (~10 kits `filtros`)

**Files:**

- Create: `src/mocks/data/seedModelKits.ts`
- Create (descartável): `scripts/_check_seed_model_kits.ts`

> **Procedimento (dados reais, validados):** cada kit deve referenciar um `modelId` real de `SEED_VEHICLE_MODELS_CANONICAL` e `partId` reais do catálogo de peças. O `modelId` segue `vmodel-<slug(brand)>-<slug(model)>-<slug(engine)>`. Use as 5 marcas. Prefira peças cujas `applications` casem com o modelo (para o drift ter sinal). O script de check (Step 2) é o critério de aceite: **falha se qualquer `modelId` ou `partId` não resolver** contra os catálogos vivos.

`modelId` reais já derivados de `SEED_VEHICLE_MODELS` (use estes; cubra as 5 marcas):

| Marca         | Modelo / Motor              | `modelId`                                    |
| ------------- | --------------------------- | -------------------------------------------- |
| Scania        | R 450 / DC13                | `vmodel-scania-r-450-dc13`                   |
| Scania        | P 320 / DC09                | `vmodel-scania-p-320-dc09`                   |
| Volvo         | FH 540 / D13K540            | `vmodel-volvo-fh-540-d13k540`                |
| Volvo         | FH 460 / D13K460            | `vmodel-volvo-fh-460-d13k460`                |
| Volvo         | FM 370 / D11K370            | `vmodel-volvo-fm-370-d11k370`                |
| Mercedes-Benz | Actros 2651 / OM 473 LA     | `vmodel-mercedes-benz-actros-2651-om-473-la` |
| Mercedes-Benz | Axor 2544 / OM 457 LA       | `vmodel-mercedes-benz-axor-2544-om-457-la`   |
| Ford Cargo    | 1719 / Cummins ISBe4        | `vmodel-ford-cargo-1719-cummins-isbe4`       |
| Iveco         | Stralis 600S44T / Cursor 13 | `vmodel-iveco-stralis-600s44t-cursor-13`     |
| Iveco         | Tector 240E28 / Tector 6    | `vmodel-iveco-tector-240e28-tector-6`        |

- [ ] **Step 1: Criar o seed** — `src/mocks/data/seedModelKits.ts`. Estrutura (≥10 kits, mix `oficial`/`rascunho`, 3-5 itens cada, ≥1 item `isOptional: true` por kit; `STORE_ID = "store-matriz"` inline como em `seedServiceKits.ts`):

```ts
import type { IVehicleModelKit } from "@/shared/types";

// Mirroring SEED_STORE_ID inline to avoid the ESM circular dependency that arises
// when scripts import this module outside the Vite bundler (see seedServiceKits.ts).
const STORE_ID = "store-matriz";
const SEED_TIMESTAMP = "2026-01-01T00:00:00.000Z";
const SEED_ACTOR = "system";

/**
 * Static seed of model kits for the MVP demo (category "filtros" only). Each kit
 * hangs off a real canonical modelId (SEED_VEHICLE_MODELS_CANONICAL) and refs real
 * catalog partIds. Validated by scripts/_check_seed_model_kits.ts.
 */
export const SEED_MODEL_KITS: IVehicleModelKit[] = [
  {
    id: "mkit-seed-scania-r450-filtros",
    modelId: "vmodel-scania-r-450-dc13",
    storeId: STORE_ID,
    name: "Kit Filtros — Scania R 450 DC13",
    category: "filtros",
    status: "oficial",
    items: [
      { partId: "part-ufi-23-127-00", defaultQuantity: 1, isOptional: false },
      { partId: "part-ufi-24-159-00", defaultQuantity: 1, isOptional: false },
      {
        partId: "part-ufi-20-016-00",
        defaultQuantity: 2,
        isOptional: false,
        note: "Filtro de combustível — par.",
      },
      {
        partId: "part-ufi-23-290-00",
        defaultQuantity: 1,
        isOptional: true,
        note: "Separador de água — opcional.",
      },
    ],
    createdBy: SEED_ACTOR,
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP,
  },
  // … +9 kits cobrindo as outras marcas/modelos da tabela acima.
  // Pelo menos 1 kit em status "rascunho" (para a curadoria da Task 13).
];
```

> Os `partId` acima (`part-ufi-*`) são reais (vêm do catálogo UFI usado em `seedServiceKits.ts`). Para os demais kits, resolva `partId` de filtro reais (Step 2 valida). Se um `part-ufi-*` específico não casar com as `applications` do modelo, ainda é aceitável referenciá-lo (o catálogo é mock); o drift apenas terá menos sinal nesse kit.

- [ ] **Step 2: Script de validação** — `scripts/_check_seed_model_kits.ts`:

```ts
// Throwaway: asserts every seed kit references a real modelId and real partIds.
import { SEED_MODEL_KITS } from "../src/mocks/data/seedModelKits";
import { SEED_VEHICLE_MODELS_CANONICAL } from "../src/mocks/data/seedVehicleModelsCanonical";
import { partsApi } from "../src/mocks/api/parts";

const modelIds = new Set(SEED_VEHICLE_MODELS_CANONICAL.map((m) => m.id));
const parts = await partsApi.list({});
const partIds = new Set(parts.map((p: { id: string }) => p.id));

let failures = 0;
const seenIds = new Set<string>();
for (const kit of SEED_MODEL_KITS) {
  if (seenIds.has(kit.id)) {
    console.error(`DUP kit id: ${kit.id}`);
    failures++;
  }
  seenIds.add(kit.id);
  if (!modelIds.has(kit.modelId)) {
    console.error(`BAD modelId: ${kit.id} -> ${kit.modelId}`);
    failures++;
  }
  if (kit.items.length < 3) {
    console.error(`TOO FEW items: ${kit.id}`);
    failures++;
  }
  for (const it of kit.items) {
    if (!partIds.has(it.partId)) {
      console.error(`BAD partId: ${kit.id} -> ${it.partId}`);
      failures++;
    }
    if (!Number.isInteger(it.defaultQuantity) || it.defaultQuantity < 1) {
      console.error(`BAD qty: ${kit.id} -> ${it.partId}`);
      failures++;
    }
  }
}
const drafts = SEED_MODEL_KITS.filter((k) => k.status === "rascunho").length;
if (drafts < 1) {
  console.error("Need at least 1 rascunho kit for curation flow.");
  failures++;
}
if (SEED_MODEL_KITS.length < 10) {
  console.error(`Need >= 10 kits, got ${SEED_MODEL_KITS.length}`);
  failures++;
}

console.log(
  failures === 0
    ? `OK — ${SEED_MODEL_KITS.length} kits, all ids resolve.`
    : `FAIL — ${failures} problem(s).`,
);
process.exit(failures === 0 ? 0 : 1);
```

> Antes de rodar, confirme o caminho/assinatura reais de `partsApi.list` (abra `src/mocks/api/parts.ts`); ajuste o import/chamada se o nome diferir. O objetivo do check é único: **todo id resolve**.

- [ ] **Step 3: Rodar o check**

Run: `bun scripts/_check_seed_model_kits.ts`
Expected: `OK — N kits, all ids resolve.` (N ≥ 10). Se `FAIL`, corrija os ids no seed até passar.

- [ ] **Step 4: Verificar tipos**

Run: `bunx tsc --noEmit 2>&1 | grep -iE "seedModelKits"`
Expected: vazio.

- [ ] **Step 5: Prettier + apagar o script**

```bash
bunx prettier --check "src/mocks/data/seedModelKits.ts"
git rm -f --quiet scripts/_check_seed_model_kits.ts 2>$null; Remove-Item -Force scripts/_check_seed_model_kits.ts -ErrorAction SilentlyContinue
```

(O script descartável NÃO entra no commit.)

- [ ] **Step 6: Commit**

```bash
git add src/mocks/data/seedModelKits.ts
git commit -m "feat(mocks): seed ~10 filtros model kits anchored to real modelIds (PRD-035)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

# FASE 2 — RBAC + lógica pura

## Task 6: RBAC resource `modelKit` (aditivo)

**Files:**

- Modify: `src/features/rbac/permissions/resources.ts:20` (após `"vehicleModel"`)
- Modify: `src/features/rbac/permissions/matrix.ts` (Owner/Gestor/Vendedor)
- Modify: `src/features/rbac/pages/RolesPage.tsx:56` (após `vehicleModel`)

> Mantém `serviceKit` por enquanto (removido no cutover, Task 19). Promoção/despromoção = `edit`. Vendedor recebe `view + create` (cria só `rascunho`, regra de serviço/UI).

- [ ] **Step 1: Resource** — em `resources.ts`, adicionar `"modelKit",` logo após `"vehicleModel",`.

- [ ] **Step 2: Matriz** — em `matrix.ts`: adicionar `p("modelKit", CRUD, "all"),` após `p("vehicleModel", CRUD, "all"),` em `OWNER_ENTRIES`; `p("modelKit", CRUD, "store"),` após `p("vehicleModel", CRUD, "store"),` em `GESTOR_ENTRIES`; e `p("modelKit", ["view", "create"], "store"),` após `p("vehicleModel", ["view"], "store"),` em `VENDEDOR_ENTRIES`.

- [ ] **Step 3: Label** — em `RolesPage.tsx`, adicionar `modelKit: "Kits por modelo",` após `vehicleModel: "Modelos de veículo",` no `RESOURCE_LABELS`.

- [ ] **Step 4: Verificar tipos** (o `Record<ResourceName, string>` quebra se o label faltar)

Run: `bunx tsc --noEmit 2>&1 | grep -iE "resources.ts|matrix.ts|RolesPage"`
Expected: vazio.

- [ ] **Step 5: Prettier**

Run: `bunx prettier --check "src/features/rbac/permissions/resources.ts" "src/features/rbac/permissions/matrix.ts" "src/features/rbac/pages/RolesPage.tsx"`
Expected: "All matched files use Prettier code style!"

- [ ] **Step 6: Commit**

```bash
git add src/features/rbac/permissions/resources.ts src/features/rbac/permissions/matrix.ts src/features/rbac/pages/RolesPage.tsx
git commit -m "feat(rbac): add modelKit resource (Vendedor drafts, Gestor curates) (PRD-035)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Lógica pura — matching, drift e expansão para preview

**Files:**

- Create: `src/features/model-kits/utils/modelKitMatching.ts`
- Create: `src/features/model-kits/utils/modelKitDrift.ts`
- Create: `src/features/model-kits/utils/kitPreview.ts`
- Create (descartável): `scripts/_check_model_kits_logic.ts`

> Estas funções são puras e testáveis. `findKitsForVehicle` faz matching por **string** (limitação até o PRD-016) e é o ponto único que o PRD-016 vai reescrever para usar `vehicle.modelId`.

- [ ] **Step 1: Matching** — `src/features/model-kits/utils/modelKitMatching.ts`:

```ts
import type { ID, IVehicle, IVehicleModel, IVehicleModelKit } from "@/shared/types";

/** Normalize a brand/model token for tolerant string comparison. */
export function normalizeToken(value: string | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** True when a vehicle and a canonical model share brand + model (engine is a
 *  bonus, not required — vehicles may carry coarser engine strings). */
export function vehicleMatchesModel(vehicle: IVehicle, model: IVehicleModel): boolean {
  return (
    normalizeToken(vehicle.brand) === normalizeToken(model.brand) &&
    normalizeToken(vehicle.model) === normalizeToken(model.model)
  );
}

/**
 * Kits applicable to a vehicle, official before draft. STRING matching until
 * PRD-016 adds `IVehicle.modelId` — this is the single function PRD-016 rewrites.
 */
export function findKitsForVehicle(
  vehicle: IVehicle,
  kits: IVehicleModelKit[],
  modelsById: Map<ID, IVehicleModel>,
): IVehicleModelKit[] {
  const matched = kits.filter((kit) => {
    const model = modelsById.get(kit.modelId);
    return model ? vehicleMatchesModel(vehicle, model) : false;
  });
  return matched.sort((a, b) => {
    if (a.status !== b.status) return a.status === "oficial" ? -1 : 1;
    return a.name.localeCompare(b.name, "pt-BR");
  });
}
```

- [ ] **Step 2: Drift** — `src/features/model-kits/utils/modelKitDrift.ts`:

```ts
import type { IPart, IVehicleModel, IVehicleModelKit } from "@/shared/types";
import { normalizeToken } from "./modelKitMatching";

/** True when one of a part's applications matches the model by brand + model. */
function partAppliesToModel(part: IPart, model: IVehicleModel): boolean {
  return part.applications.some(
    (app) =>
      normalizeToken(app.vehicleBrand) === normalizeToken(model.brand) &&
      normalizeToken(app.vehicleModel) === normalizeToken(model.model),
  );
}

/**
 * Catalog drift: parts compatible with the kit's model that are NOT yet in the
 * kit. Powers the "N peças compatíveis fora do kit" banner.
 */
export function getCompatiblePartsNotInKit(
  kit: IVehicleModelKit,
  model: IVehicleModel | undefined,
  parts: IPart[],
): IPart[] {
  if (!model) return [];
  const inKit = new Set(kit.items.map((i) => i.partId));
  return parts.filter((p) => !inKit.has(p.id) && partAppliesToModel(p, model));
}
```

- [ ] **Step 3: Expansão para preview** — `src/features/model-kits/utils/kitPreview.ts`:

```ts
import type { ID, IPart, IVehicleModelKit } from "@/shared/types";

/** One resolved preview line: a catalog part + the kit metadata that drives the
 *  apply modal (default selection, quantity, note). */
export interface IKitPreviewLine {
  part: IPart;
  defaultQuantity: number;
  isOptional: boolean;
  note?: string;
}

export interface IKitPreview {
  lines: IKitPreviewLine[];
  /** Kit lines whose part is no longer in the catalog (skipped). */
  missing: number;
}

/**
 * Resolve a kit's items against the catalog index for the apply preview. Unlike
 * the old expandKitToItems, this preserves isOptional/note so the modal can
 * pre-check base items and leave optionals unchecked. Snapshot happens later, at
 * injection into the quote.
 */
export function buildKitPreview(kit: IVehicleModelKit, partsById: Map<ID, IPart>): IKitPreview {
  const lines: IKitPreviewLine[] = [];
  let missing = 0;
  for (const item of kit.items) {
    const part = partsById.get(item.partId);
    if (!part) {
      missing += 1;
      continue;
    }
    lines.push({
      part,
      defaultQuantity: Math.max(1, Math.floor(item.defaultQuantity) || 1),
      isOptional: item.isOptional,
      note: item.note,
    });
  }
  // Base parts first, optionals last (matches the modal's visual grouping).
  lines.sort((a, b) => Number(a.isOptional) - Number(b.isOptional));
  return { lines, missing };
}
```

- [ ] **Step 4: Script de check** — `scripts/_check_model_kits_logic.ts`:

```ts
import type { IPart, IVehicle, IVehicleModel, IVehicleModelKit } from "../src/shared/types";
import {
  findKitsForVehicle,
  vehicleMatchesModel,
} from "../src/features/model-kits/utils/modelKitMatching";
import { getCompatiblePartsNotInKit } from "../src/features/model-kits/utils/modelKitDrift";
import { buildKitPreview } from "../src/features/model-kits/utils/kitPreview";

let fail = 0;
const assert = (cond: boolean, msg: string) => {
  if (!cond) {
    console.error("FAIL:", msg);
    fail++;
  }
};

const model = {
  id: "vmodel-x",
  brand: "Scania",
  model: "R 450",
  engine: "DC13",
  status: "ativo",
  createdBy: "s",
  createdAt: "",
  updatedAt: "",
} as IVehicleModel;
const vehicle = { brand: "scania", model: "r 450", engine: "DC13" } as IVehicle;
assert(vehicleMatchesModel(vehicle, model), "case/diacritic-insensitive brand+model match");

const kitOficial = {
  id: "k1",
  modelId: "vmodel-x",
  storeId: "s",
  name: "B",
  category: "filtros",
  status: "oficial",
  items: [{ partId: "p1", defaultQuantity: 1, isOptional: false }],
  createdBy: "s",
  createdAt: "",
  updatedAt: "",
} as IVehicleModelKit;
const kitRascunho = { ...kitOficial, id: "k2", name: "A", status: "rascunho" } as IVehicleModelKit;
const modelsById = new Map([[model.id, model]]);
const found = findKitsForVehicle(vehicle, [kitRascunho, kitOficial], modelsById);
assert(found.length === 2 && found[0]!.status === "oficial", "official sorted before draft");

const parts: IPart[] = [
  {
    id: "p1",
    applications: [
      { id: "a", vehicleBrand: "Scania", vehicleModel: "R 450", yearStart: 2014, yearEnd: 2024 },
    ],
  } as IPart,
  {
    id: "p2",
    applications: [
      { id: "b", vehicleBrand: "Scania", vehicleModel: "R 450", yearStart: 2014, yearEnd: 2024 },
    ],
  } as IPart,
  {
    id: "p3",
    applications: [
      { id: "c", vehicleBrand: "Volvo", vehicleModel: "FH 540", yearStart: 2017, yearEnd: 2024 },
    ],
  } as IPart,
];
const drift = getCompatiblePartsNotInKit(kitOficial, model, parts);
assert(
  drift.length === 1 && drift[0]!.id === "p2",
  "drift = compatible parts not in kit (p2 only)",
);

const partsById = new Map(parts.map((p) => [p.id, p]));
const kitMix = {
  ...kitOficial,
  items: [
    { partId: "p1", defaultQuantity: 1, isOptional: true },
    { partId: "p2", defaultQuantity: 2, isOptional: false },
    { partId: "gone", defaultQuantity: 1, isOptional: false },
  ],
} as IVehicleModelKit;
const preview = buildKitPreview(kitMix, partsById);
assert(preview.missing === 1, "missing counts unresolved part");
assert(
  preview.lines.length === 2 && preview.lines[0]!.isOptional === false,
  "base before optional, missing skipped",
);

console.log(fail === 0 ? "OK — model-kits logic passes." : `FAIL — ${fail} assertion(s).`);
process.exit(fail === 0 ? 0 : 1);
```

- [ ] **Step 5: Rodar o check**

Run: `bun scripts/_check_model_kits_logic.ts`
Expected: `OK — model-kits logic passes.`

- [ ] **Step 6: Verificar tipos + prettier + apagar script**

```bash
bunx tsc --noEmit 2>&1 | grep -iE "model-kits/utils"   # esperado: vazio
bunx prettier --check "src/features/model-kits/utils/modelKitMatching.ts" "src/features/model-kits/utils/modelKitDrift.ts" "src/features/model-kits/utils/kitPreview.ts"
Remove-Item -Force scripts/_check_model_kits_logic.ts
```

- [ ] **Step 7: Commit**

```bash
git add src/features/model-kits/utils/modelKitMatching.ts src/features/model-kits/utils/modelKitDrift.ts src/features/model-kits/utils/kitPreview.ts
git commit -m "feat(model-kits): pure logic — vehicle matching, drift, apply preview (PRD-035)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

# FASE 3 — Gestão (detalhe do modelo + editor + curadoria)

## Task 8: Hooks de dados + validação do editor

**Files:**

- Create: `src/features/model-kits/hooks/useModelKits.ts`
- Create: `src/features/model-kits/hooks/useModelKit.ts`
- Create: `src/features/model-kits/hooks/useModelKitMutations.ts`
- Create: `src/features/model-kits/utils/modelKitValidation.ts`

> Espelha os hooks de `vehicle-models` (`useVehicleModels`/`useVehicleModelMutations`). Query keys: lista `["model-kits", params]`, detalhe `["model-kit", id]`. Mutations invalidam `["model-kits"]`, emitem toast (sonner) e gravam audit via `recordAuditLogSync` (de `@/providers/data`; `ICreateAuditInput`: `actorId, action, resource:"modelKit", resourceId, before?, after?`).

- [ ] **Step 1: Validação zod** — `modelKitValidation.ts`:

```ts
import { z } from "zod";

export const kitItemSchema = z.object({
  partId: z.string().min(1),
  defaultQuantity: z.number().int().min(1, "Quantidade mínima é 1."),
  isOptional: z.boolean(),
  note: z.string().trim().max(140).optional(),
});

export const modelKitFormSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome do kit."),
  category: z.enum(["filtros", "freios", "correia", "revisao", "custom"]),
  items: z.array(kitItemSchema).min(1, "Adicione ao menos uma peça ao kit."),
});

export type ModelKitFormValues = z.infer<typeof modelKitFormSchema>;
```

- [ ] **Step 2: Query da lista** — `useModelKits.ts`:

```ts
import { useQuery } from "@tanstack/react-query";
import { useModelKitsProvider, type IListModelKitsParams } from "@/providers/data";

export function useModelKits(params: IListModelKitsParams = {}) {
  const provider = useModelKitsProvider();
  return useQuery({
    queryKey: ["model-kits", params],
    queryFn: () => provider.list(params),
  });
}
```

- [ ] **Step 3: Query do detalhe** — `useModelKit.ts`:

```ts
import { useQuery } from "@tanstack/react-query";
import { useModelKitsProvider } from "@/providers/data";

export function useModelKit(id: string | undefined) {
  const provider = useModelKitsProvider();
  return useQuery({
    queryKey: ["model-kit", id],
    queryFn: () => provider.get(id as string),
    enabled: Boolean(id),
  });
}
```

- [ ] **Step 4: Mutations** — `useModelKitMutations.ts`. Espelhe `useVehicleModelMutations.ts` (abra para o padrão exato de `useQueryClient`, `useMutation`, `recordAuditLogSync`, toasts e estado `saving`). Exponha: `create(input)`, `update(id, patch)`, `promote(id)` (= `update(id, { status: "oficial" })` + audit `action: "promote"`), `demote(id)` (= `update(id, { status: "rascunho" })` + audit `action: "demote"`), `remove(id)`. Toasts: "Kit criado.", "Kit atualizado.", "Kit promovido a oficial.", "Kit voltou para rascunho.", "Kit excluído." Invalide `["model-kits"]` e `["model-kit", id]` após cada um. `storeId` para create: usar o do usuário corrente (mesmo padrão das outras mutations da app).

- [ ] **Step 5: Verificar tipos + prettier**

```bash
bunx tsc --noEmit 2>&1 | grep -iE "model-kits/hooks|modelKitValidation"   # vazio
bunx prettier --check "src/features/model-kits/hooks/useModelKits.ts" "src/features/model-kits/hooks/useModelKit.ts" "src/features/model-kits/hooks/useModelKitMutations.ts" "src/features/model-kits/utils/modelKitValidation.ts"
```

- [ ] **Step 6: Commit**

```bash
git add src/features/model-kits/hooks src/features/model-kits/utils/modelKitValidation.ts
git commit -m "feat(model-kits): data hooks + editor validation schema (PRD-035)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Componentes de apresentação do kit (badges + preview + card)

**Files:**

- Create: `KitCategoryBadge.tsx`, `KitStatusBadge.tsx`, `KitItemsPreview.tsx`, `ModelKitCard.tsx`, `DeleteModelKitDialog.tsx` (em `src/features/model-kits/components/`)

**Contrato (props):**

```ts
// KitCategoryBadge: { category: ModelKitCategory }
// KitStatusBadge: { status: ModelKitStatus }
// KitItemsPreview: { items: IKitItem[]; partsById: Map<ID, IPart> }  // resolve nomes; ● base / ○ opcional
// ModelKitCard: { kit: IVehicleModelKit; partsById: Map<ID, IPart>; canManage: boolean; onEdit(): void; onApply(): void; onPromote(): void; onDemote(): void; onDelete(): void }
// DeleteModelKitDialog: { kit: IVehicleModelKit | null; onConfirm(): void; onOpenChange(open: boolean): void }
```

**Especificação de design (consultor — Superfície 1), seguir verbatim:**

- **Card** `Card` (`bg-card border-border rounded-lg`), hover `hover:border-primary/40 transition-colors` (só borda).
- Ícone de categoria via mapa: `filtros` `mdi:air-filter` · `freios` `mdi:car-brake-alarm` · `correia` `mdi:fan` · `revisao` `mdi:wrench-clock` · `custom` `mdi:package-variant`. `text-muted-foreground size-5`.
- **KitStatusBadge:** `oficial` → `Badge` `bg-primary/15 text-primary border-primary/30` (ouro comedido) + texto "Oficial"; `rascunho` → `variant="outline" text-muted-foreground` + ícone `mdi:pencil-ruler` + "Rascunho". **Nunca só cor** (ícone/texto sempre).
- **KitCategoryBadge:** `variant="secondary"` (`bg-muted text-muted-foreground`), ícone + label minúsculo.
- **KitItemsPreview:** bloco `bg-muted/50 rounded-md p-3`. **Base = `●` (`mdi:circle`, `text-foreground`)**, \*\*Opcional = `○` (`mdi:circle-outline`, `text-muted-foreground`)`. Quantidade > 1 mostrada inline (`×2`). Legenda compacta `● N base · ○ N opcional`.
- **Ações** (alvos ≥44px): Vendedor `[Editar]` `[Aplicar]`; Gestor/Owner + `[Promover]`/`[Despromover]` e `[Excluir]` no overflow `⋯` (`DropdownMenu`). `[Aplicar]` = `variant="default"` (ouro); demais `outline`/`ghost`. `[Excluir]` abre `DeleteModelKitDialog` (`AlertDialog`, `text-destructive`).
- Linha clicável = `<a>`/área de leitura; botões como **irmãos** fora do anchor (sem nested-interactive).
- **Tokens semânticos apenas**; light+dark; `motion-reduce` respeitado.

- [ ] **Step 1:** Implementar os 5 componentes seguindo o contrato e a especificação, reusando shadcn (`Card`, `Badge`, `Button`, `DropdownMenu`, `AlertDialog`) e `@/components/Icon`. Resolver nomes de peça via `partsById` (peça ausente → mostrar o `partId` truncado com tom `text-muted-foreground`).

- [ ] **Step 2: Verificar tipos + prettier**

```bash
bunx tsc --noEmit 2>&1 | grep -iE "model-kits/components/(KitCategoryBadge|KitStatusBadge|KitItemsPreview|ModelKitCard|DeleteModelKitDialog)"   # vazio
bunx prettier --check "src/features/model-kits/components/KitCategoryBadge.tsx" "src/features/model-kits/components/KitStatusBadge.tsx" "src/features/model-kits/components/KitItemsPreview.tsx" "src/features/model-kits/components/ModelKitCard.tsx" "src/features/model-kits/components/DeleteModelKitDialog.tsx"
```

- [ ] **Step 3: Commit**

```bash
git add src/features/model-kits/components/KitCategoryBadge.tsx src/features/model-kits/components/KitStatusBadge.tsx src/features/model-kits/components/KitItemsPreview.tsx src/features/model-kits/components/ModelKitCard.tsx src/features/model-kits/components/DeleteModelKitDialog.tsx
git commit -m "feat(model-kits): kit card, status/category badges, item preview (PRD-035)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: Seção "Kits deste modelo" no detalhe do modelo

**Files:**

- Create: `src/features/model-kits/components/ModelKitsSection.tsx`
- Modify: `src/features/vehicle-models/pages/VehicleModelDetailPage.tsx:133-151` (substituir o slot vazio)

**Contrato:** `ModelKitsSection: { modelId: ID; modelLabel: string }`. Internamente: `useModelKits({ modelId })` para a lista, `usePartsProvider`/`usePartsIndex` (ou o hook de índice já usado em quotes) para `partsById`, `useModelKitMutations` para promote/demote/remove, `useAuth` + `hasPermission(currentUser, "modelKit", "create")` para `canManage` e `"modelKit","edit"` para curar. Navega para o editor via `navigate({ to: "/app/kits/$modelId/kit/novo", params })` e para aplicar via `ApplyKitDialog` (Task 14 — até lá, `onApply` pode no-op com `toast.info`; fie a fiação real na Task 15).

**Especificação de design (Superfície 1 — estados):**

- Cabeçalho da seção: `h2` "Kits deste modelo" + `[+ Criar kit]` (só `canManage`).
- Lista de `ModelKitCard` (gap confortável).
- **Vazio com permissão:** ícone `mdi:tray-plus`, "Nenhum kit para este modelo ainda", subtítulo "Crie um kit de filtros para agilizar orçamentos deste {modelLabel}." + `[+ Criar kit]`.
- **Vazio sem permissão:** mesmo ícone, "Ainda não há kits oficiais para este modelo.", **sem** botão.
- **Carregando:** 2 skeletons de card. **Erro:** `border-destructive/40` + `[Tentar novamente]`.

- [ ] **Step 1:** Implementar `ModelKitsSection.tsx` conforme contrato + estados.

- [ ] **Step 2:** Em `VehicleModelDetailPage.tsx`, substituir TODO o bloco `{/* Kits section — honest empty slot (PRD-035) */} … </div>` (linhas 133-151) por:

```tsx
{
  /* Kits section (PRD-035) */
}
<ModelKitsSection
  modelId={model.id}
  modelLabel={`${model.brand} ${model.model} (${model.engine})`}
/>;
```

e adicionar o import `import { ModelKitsSection } from "@/features/model-kits/components/ModelKitsSection";` no topo.

- [ ] **Step 3: Verificar tipos + prettier**

```bash
bunx tsc --noEmit 2>&1 | grep -iE "ModelKitsSection|VehicleModelDetailPage"   # vazio
bunx prettier --check "src/features/model-kits/components/ModelKitsSection.tsx" "src/features/vehicle-models/pages/VehicleModelDetailPage.tsx"
```

- [ ] **Step 4: Commit**

```bash
git add src/features/model-kits/components/ModelKitsSection.tsx src/features/vehicle-models/pages/VehicleModelDetailPage.tsx
git commit -m "feat(model-kits): fill 'Kits deste modelo' section in model detail (PRD-035)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 11: Editor de kit (página dedicada) + rotas

**Files:**

- Create: `src/features/model-kits/components/KitCatalogSearch.tsx`
- Create: `src/features/model-kits/components/KitItemEditorRow.tsx`
- Create: `src/features/model-kits/pages/ModelKitFormPage.tsx`
- Create: `src/routes/app.kits.$modelId.kit.novo.tsx`
- Create: `src/routes/app.kits.$modelId.kit.$kitId.editar.tsx`
- Modify: `src/features/model-kits/index.ts` (barrel — exportar a página)
- Regenerar: `src/routeTree.gen.ts` (via dev server)

**Contratos:**

```ts
// KitCatalogSearch: { onAdd(part: IPart): void; excludePartIds: Set<ID> }  // Command/combobox sobre o catálogo
// KitItemEditorRow: { item: IKitItem; part: IPart | undefined; onPatch(patch: Partial<IKitItem>): void; onRemove(): void }
// ModelKitFormPage: lê modelId (e kitId opcional) de useParams; modo create/edit
```

**Especificação de design (Superfície 2 — página dedicada, seguir verbatim):**

- Contexto do modelo fixo no topo (read-only): "Modelo: {brand} {model} {engine}".
- Campos: **nome** (`Input`); **categoria** (`Select`, itens com ícone+label, default `filtros`); **status** como `Badge` read-only (muda via promoção, não aqui).
- **KitCatalogSearch:** `Command`/combobox com `mdi:magnify`; resultado = nome + código + `[+ Adicionar]`; ao adicionar anima `animate-in fade-in slide-in-from-top-1` (sob `motion-reduce:transition-none`). `excludePartIds` esconde itens já no kit.
- **KitItemEditorRow:** marcador `●/○`; `stepper` qtd `[− N +]` (botões ≥44px, `aria-live` no valor, min 1); `Switch` **Base/Opcional** com rótulo textual visível (default OFF = base, `aria-label="Item opcional"`); **nota** colapsável (`▸ Nota` → `Input`, mostra inline se preenchida); `[🗑]` `ghost text-muted-foreground hover:text-destructive`.
- **Botão "Sugerir composição (IA)" DESABILITADO:** `variant="outline" disabled` dentro de `<span tabIndex={0}>` (para o `Tooltip` "Disponível na Fase 2" funcionar — `disabled` não dispara tooltip) + micro-selo `ⓘ Fase 2` em `text-[10px] text-muted-foreground`. Ao lado da busca, secundário. Ícone `mdi:auto-fix`.
- **Banner de drift** abaixo da busca (placeholder de slot — o componente real entra na Task 12; aqui deixe `<KitDriftBanner …/>` se já existir ou um `null` comentado para ligar na Task 12).
- **Footer:** `[Cancelar]` + `[Salvar rascunho]` (Vendedor) / `[Salvar]` (Gestor/Owner). Salvar `disabled` até ≥1 item (tooltip "Adicione ao menos uma peça"). Sair com mudanças não salvas → `AlertDialog` "Descartar alterações?".
- **Estados:** lista vazia (placeholder `border-dashed` "Nenhuma peça ainda. Busque acima para começar."); busca sem resultado (ecoa o termo); salvando (spinner, `aria-busy`); erro → `toast` destrutivo, **não** sai da página.
- Form com react-hook-form + `modelKitFormSchema` (Task 8); submit chama `mutations.create`/`mutations.update`; ao sucesso, `navigate` de volta ao detalhe do modelo.

**Rotas (file-based):**

- [ ] **Step 1:** `src/routes/app.kits.$modelId.kit.novo.tsx` — espelhar o guard/estrutura de `app.kits.novo.tsx` (do PRD-034): `beforeLoad` exige `hasPermission(readCurrentUserSync(), "modelKit", "create")` senão `redirect({ to: "/app/kits" })`; `component` renderiza `<ModelKitFormPage />`.

- [ ] **Step 2:** `src/routes/app.kits.$modelId.kit.$kitId.editar.tsx` — idem, exigindo `"modelKit","edit"` (Vendedor edita o próprio rascunho? No MVP, edição completa é Gestor/Owner; Vendedor edita via re-criação. Para simplificar e seguir a matriz: guard de `"modelKit","edit"`). `component` = `<ModelKitFormPage />`.

- [ ] **Step 3:** Implementar `KitCatalogSearch.tsx`, `KitItemEditorRow.tsx`, `ModelKitFormPage.tsx` conforme contratos + especificação. Exportar a página no `src/features/model-kits/index.ts`.

- [ ] **Step 4: Regenerar a árvore de rotas** — garantir o dev server rodando (porta 5173, já ativo nesta sessão) para o plugin regerar `src/routeTree.gen.ts`. Confirmar que as duas novas rotas aparecem. Se `routeTree.gen.ts` mostrar só ruído CRLF, `git checkout -- src/routeTree.gen.ts` e regenerar.

- [ ] **Step 5: Verificar tipos + prettier**

```bash
bunx tsc --noEmit 2>&1 | grep -iE "model-kits/(pages/ModelKitFormPage|components/(KitCatalogSearch|KitItemEditorRow))|routes/app.kits.\$modelId.kit"   # vazio
bunx prettier --check "src/features/model-kits/components/KitCatalogSearch.tsx" "src/features/model-kits/components/KitItemEditorRow.tsx" "src/features/model-kits/pages/ModelKitFormPage.tsx" "src/routes/app.kits.\$modelId.kit.novo.tsx" "src/routes/app.kits.\$modelId.kit.\$kitId.editar.tsx" "src/features/model-kits/index.ts"
```

- [ ] **Step 6: Commit**

```bash
git add src/features/model-kits/components/KitCatalogSearch.tsx src/features/model-kits/components/KitItemEditorRow.tsx src/features/model-kits/pages/ModelKitFormPage.tsx "src/routes/app.kits.\$modelId.kit.novo.tsx" "src/routes/app.kits.\$modelId.kit.\$kitId.editar.tsx" src/features/model-kits/index.ts src/routeTree.gen.ts
git commit -m "feat(model-kits): dedicated kit editor page + nested routes (PRD-035)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 12: Banner de drift no editor

**Files:**

- Create: `src/features/model-kits/components/KitDriftBanner.tsx`
- Modify: `src/features/model-kits/pages/ModelKitFormPage.tsx` (fiar o banner abaixo da busca)

**Contrato:** `KitDriftBanner: { parts: IPart[]; onAdd(part: IPart): void }` — `parts` = resultado de `getCompatiblePartsNotInKit(kit, model, allParts)` excluindo os já adicionados no form.

**Especificação de design (Superfície 4a — tom info, jamais alarme):**

- Casca `bg-muted/50 border border-border rounded-md` (NÃO `bg-card`, NÃO borda forte). Ícone `mdi:information-outline text-muted-foreground`. Texto `text-sm text-muted-foreground`: "{N} peças compatíveis com este modelo estão fora deste kit."
- Ação inline `[Ver peças ▾]` (`variant="link"`/`ghost`) que expande sub-bloco com cada peça + `[+ Adicionar]` (progressive disclosure; reusa o componente de resultado da busca).
- Se `parts.length === 0` → **não renderiza** (ausência honesta). `[✕]` opcional para ocultar na sessão.

- [ ] **Step 1:** Implementar `KitDriftBanner.tsx`. No `ModelKitFormPage`, calcular `drift = getCompatiblePartsNotInKit(kitFromForm, model, allParts)` (excluindo os `partId` já no form) e renderizar `<KitDriftBanner parts={drift} onAdd={addItemFromPart} />` abaixo da busca. `allParts` via provider de peças; `model` via `useVehicleModel(modelId)`.

- [ ] **Step 2: Verificar tipos + prettier**

```bash
bunx tsc --noEmit 2>&1 | grep -iE "KitDriftBanner|ModelKitFormPage"   # vazio
bunx prettier --check "src/features/model-kits/components/KitDriftBanner.tsx" "src/features/model-kits/pages/ModelKitFormPage.tsx"
```

- [ ] **Step 3: Commit**

```bash
git add src/features/model-kits/components/KitDriftBanner.tsx src/features/model-kits/pages/ModelKitFormPage.tsx
git commit -m "feat(model-kits): catalog drift banner in kit editor (PRD-035)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 13: Curadoria — indicador de rascunho na lista de modelos

**Files:**

- Modify: `src/features/vehicle-models/components/VehicleModelRow.tsx` (pílula "Kits N · ●rascunhos")
- Modify: `src/features/vehicle-models/pages/VehicleModelsListPage.tsx` (chip "Com rascunhos pendentes")

> A lista de modelos do PRD-034 já mostra uma pílula "Kits N". Esta task a alimenta com a contagem real de kits do modelo e dos rascunhos pendentes, e adiciona um filtro.

**Especificação:**

- Carregar a contagem por modelo: usar `useModelKits({})` uma vez no nível da lista e agrupar por `modelId` → `{ total, rascunhos }`. Passar a contagem para cada `VehicleModelRow` (prop nova `kitCounts?: { total: number; rascunhos: number }`).
- Pílula: "Kits {total}"; se `rascunhos > 0`, sufixo `· ●{rascunhos} rascunho(s)` com o `●` em `text-muted-foreground` + `aria-label` "{rascunhos} rascunhos pendentes". (Sem cor de alarme; ícone/texto carregam a semântica.)
- Chip `[☐ Com rascunhos pendentes]` no topo da lista (`aria-pressed`); quando ativo, filtra os modelos para os que têm `rascunhos > 0`. Sincronizar com a URL como os demais filtros do PRD-034.

- [ ] **Step 1:** Em `VehicleModelsListPage.tsx`, buscar `useModelKits({})`, reduzir para `Map<modelId, { total, rascunhos }>`, e passar a contagem a cada linha. Adicionar o chip e o estado de filtro (com sincronização de URL como os chips de marca existentes).

- [ ] **Step 2:** Em `VehicleModelRow.tsx`, aceitar `kitCounts` e renderizar a pílula com o sufixo de rascunho. Se `kitCounts` ausente, manter "Kits 0" (comportamento atual).

- [ ] **Step 3: Verificar tipos + prettier**

```bash
bunx tsc --noEmit 2>&1 | grep -iE "VehicleModelRow|VehicleModelsListPage"   # vazio
bunx prettier --check "src/features/vehicle-models/components/VehicleModelRow.tsx" "src/features/vehicle-models/pages/VehicleModelsListPage.tsx"
```

- [ ] **Step 4: Commit**

```bash
git add src/features/vehicle-models/components/VehicleModelRow.tsx src/features/vehicle-models/pages/VehicleModelsListPage.tsx
git commit -m "feat(model-kits): draft-pending indicator + filter on model list (PRD-035)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

# FASE 4 — Aplicação no orçamento

## Task 14: Modal "Aplicar Kit" (preview)

**Files:**

- Create: `src/features/model-kits/components/ApplyKitDialog.tsx`

**Contrato:**

```ts
export interface IApplyKitSelection {
  part: IPart;
  quantity: number;
}
export interface IApplyKitDialogProps {
  kit: IVehicleModelKit | null; // null = fechado
  partsById: Map<ID, IPart>;
  onOpenChange(open: boolean): void;
  onConfirm(selection: IApplyKitSelection[]): void; // só itens marcados
}
```

Usa `buildKitPreview(kit, partsById)` (Task 7) para as linhas.

**Especificação de design (Superfície 3 — `Dialog`, seguir verbatim):**

- `Dialog max-w-xl`, corpo `max-h-[70vh] overflow-y-auto`.
- Título "Aplicar {kit.name}". Subtítulo: **"Opcionais vêm desmarcados — são sugestões, você escolhe."**
- Cada linha: `Checkbox` + `●/○` + nome + `stepper` qtd + unit (snapshot do catálogo) + subtotal. **Base pré-marcado**; **opcional desmarcado** sob divisor "opcionais (sugestões)" (`border-t` + label `text-xs uppercase tracking-wide text-muted-foreground`).
- Item desmarcado: `opacity-60`, subtotal `R$ —`, `stepper` `disabled`.
- Selo "preços do catálogo de hoje" (`text-xs text-muted-foreground`).
- Footer: "N de M itens" + **Total estimado** (`text-lg font-semibold`, `aria-live="polite"`). CTA `[Adicionar N itens ao orçamento]` (contagem dinâmica; `disabled` se 0). Item sem preço → subtotal "—" + badge `Sem preço`, ainda selecionável.
- `<fieldset>`/`<legend>`; cada linha `Checkbox` rotulado pelo nome. Preço unitário lido de `part` (mesmo campo que o orçamento usa no snapshot — confirmar em `quoteItemOps`/`IPart`).

- [ ] **Step 1:** Implementar `ApplyKitDialog.tsx` (estado local de seleção/qtd; `onConfirm` envia só os marcados). Não injeta no orçamento — apenas devolve a seleção (a injeção é da Task 15).

- [ ] **Step 2: Verificar tipos + prettier**

```bash
bunx tsc --noEmit 2>&1 | grep -iE "ApplyKitDialog"   # vazio
bunx prettier --check "src/features/model-kits/components/ApplyKitDialog.tsx"
```

- [ ] **Step 3: Commit**

```bash
git add src/features/model-kits/components/ApplyKitDialog.tsx
git commit -m "feat(model-kits): apply-kit preview dialog (PRD-035)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 15: Fiar a aplicação no `QuoteEditor` (preview → snapshot → appliedKitIds → undo)

**Files:**

- Modify: `src/features/quotes/components/new/items/KitPicker.tsx` (tipo `IVehicleModelKit`; abre o modal em vez de injetar)
- Modify: `src/features/quotes/components/new/QuoteEditor.tsx` (estado do modal, confirmação, `appliedKitIds`, undo, audit)

> Evolui o fluxo existente. Hoje `KitPicker` recebe `IServiceKit[]` e `onAddKit` injeta direto (linhas 205-225). Agora: `KitPicker` lista `IVehicleModelKit[]` e chama `onPickKit(kit)`; o `QuoteEditor` abre `<ApplyKitDialog>`; ao `onConfirm(selection)`, injeta cada item com snapshot via `addOrIncrementItem`, registra o `kit.id` em `appliedKitIds`, emite toast com `[Desfazer]`, e grava audit (`action: "apply", resource: "modelKit", resourceId: kit.id`; incluir `quoteId` quando disponível).

- [ ] **Step 1:** Onde o `QuoteEditor` obtém os kits (hoje via `useServiceKits`/provider de serviceKits — localizar o ponto que alimenta `<KitPicker kits=…>`, ~linha 399), trocar para `useModelKits({})`. (Opcional MVP: filtrar por kits cujo modelo casa com algum veículo do cliente via `findKitsForVehicle`; senão listar todos os oficiais.)

- [ ] **Step 2:** Adaptar `KitPicker.tsx`: trocar `IServiceKit` por `IVehicleModelKit`; renomear `onAddKit` → `onPickKit`; ajustar o subtítulo para "Pré-visualizar e aplicar um kit"; manter o ícone (use `mdi:air-filter`).

- [ ] **Step 3:** No `QuoteEditor`, adicionar estado `const [kitToApply, setKitToApply] = useState<IVehicleModelKit | null>(null)`; `onPickKit={setKitToApply}`; renderizar `<ApplyKitDialog kit={kitToApply} partsById={partsById} onOpenChange={(o) => !o && setKitToApply(null)} onConfirm={handleApplyKit} />`.

- [ ] **Step 4:** Implementar `handleApplyKit(selection)`: substitui o antigo `handleAddKit`. Para cada `{ part, quantity }` da seleção, `addOrIncrementItem` (snapshot). Atualizar `items`. Registrar `kit.id` em `appliedKitIds` do orçamento (estado do editor — adicionar se ainda não houver; de-duplicar). `toast.success("{n} itens adicionados ao orçamento", { action: { label: "Desfazer", onClick: () => restaurar os items anteriores } })` — capturar `prevItems`/`prevAppliedKitIds` antes de aplicar para o undo. Gravar audit via `recordAuditLogSync`.

- [ ] **Step 5:** Remover o `import { expandKitToItems }` e o `handleAddKit` antigos do `QuoteEditor` (o `kitExpansion.ts` é removido no cutover, Task 19; até lá pode coexistir, mas pare de usá-lo aqui).

- [ ] **Step 6: Verificar tipos + prettier**

```bash
bunx tsc --noEmit 2>&1 | grep -iE "quotes/components/new/(QuoteEditor|items/KitPicker)"   # vazio
bunx prettier --check "src/features/quotes/components/new/QuoteEditor.tsx" "src/features/quotes/components/new/items/KitPicker.tsx"
```

- [ ] **Step 7: Commit**

```bash
git add src/features/quotes/components/new/QuoteEditor.tsx src/features/quotes/components/new/items/KitPicker.tsx
git commit -m "feat(quotes): apply model kit via preview modal with snapshot + undo (PRD-035)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 16: Sugestão automática no orçamento

**Files:**

- Create: `src/features/model-kits/components/KitSuggestionBanner.tsx`
- Modify: `src/features/quotes/components/new/QuoteEditor.tsx` (renderizar a sugestão)

**Contrato:** `KitSuggestionBanner: { kit: IVehicleModelKit; vehicleLabel: string; onApply(): void; onDismiss(): void }`.

**Especificação de design (Superfície 4b — faixa discreta, não modal):**

- Casca `bg-muted/50 border border-border rounded-lg`, ícone `mdi:truck-outline text-muted-foreground`. Texto: "Este cliente tem um {vehicleLabel} — aplicar Kit de filtros?" `[Aplicar]` (`variant="default"`, abre o `ApplyKitDialog`) + `[Agora não]` (`ghost`).
- No máximo **uma** sugestão por vez; **não** sugerir se já há itens de filtro no orçamento; respeitar dispensa (não repetir na mesma sessão do editor). `role="region" aria-label="Sugestão de kit"`; não rouba foco.

- [ ] **Step 1:** Implementar `KitSuggestionBanner.tsx`.

- [ ] **Step 2:** No `QuoteEditor`: quando há cliente com veículo(s), computar `suggested = findKitsForVehicle(vehicle, officialKits, modelsById)[0]` (precisa de `modelsById` via `useVehicleModels` e dos veículos do cliente). Renderizar `<KitSuggestionBanner>` acima da lista de itens quando: existe sugestão, não foi dispensada, e não há item de categoria filtro no orçamento. `onApply` → `setKitToApply(suggested)` (reusa o modal da Task 15). `onDismiss` → marca dispensado no estado local.

- [ ] **Step 3: Verificar tipos + prettier**

```bash
bunx tsc --noEmit 2>&1 | grep -iE "KitSuggestionBanner|quotes/components/new/QuoteEditor"   # vazio
bunx prettier --check "src/features/model-kits/components/KitSuggestionBanner.tsx" "src/features/quotes/components/new/QuoteEditor.tsx"
```

- [ ] **Step 4: Commit**

```bash
git add src/features/model-kits/components/KitSuggestionBanner.tsx src/features/quotes/components/new/QuoteEditor.tsx
git commit -m "feat(quotes): auto-suggest model kit by client vehicle (PRD-035)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

# FASE 5 — Veículo, SDR, cutover e versão

## Task 17: Card "Filtros" do detalhe do veículo aplica Kit

**Files:**

- Modify: `src/features/vehicles/components/detail/MaintenanceRecommendations.tsx`

> O card "Filtro" tem hoje um botão "Criar orçamento" placeholder. No MVP, ele passa a, quando há um Kit `filtros` oficial casando com o veículo (via `findKitsForVehicle`), navegar para o novo orçamento já com a intenção de aplicar o kit (ou abrir o `ApplyKitDialog` localmente e, ao confirmar, criar o orçamento com os itens). Para o MVP do mockup, o caminho mais simples e coerente: ao clicar, navegar para `/app/orcamentos/novo` passando o `kitId` sugerido (search param) que o `QuoteEditor` lê para pré-abrir o `ApplyKitDialog`.

- [ ] **Step 1:** Em `MaintenanceRecommendations.tsx`, para o card de categoria "Filtro": computar via `findKitsForVehicle(vehicle, officialFiltrosKits, modelsById)` se há kit aplicável. Se houver, o botão vira "Criar orçamento com Kit" e navega para o editor de orçamento com o `kitId` (search param). Se não houver kit, mantém o comportamento atual (orçamento vazio). Demais cards (Freios/Correia/Revisão) inalterados.

- [ ] **Step 2:** No `QuoteEditor` (já tocado na Task 15/16): ler um search param opcional `applyKitId`; se presente e o kit resolver, `setKitToApply(kit)` no mount (pré-abre o modal). (Pequeno ajuste — adicionar junto à Task 16 se preferir; aqui é o consumidor.)

- [ ] **Step 3: Verificar tipos + prettier**

```bash
bunx tsc --noEmit 2>&1 | grep -iE "MaintenanceRecommendations|QuoteEditor"   # vazio
bunx prettier --check "src/features/vehicles/components/detail/MaintenanceRecommendations.tsx" "src/features/quotes/components/new/QuoteEditor.tsx"
```

- [ ] **Step 4: Commit**

```bash
git add src/features/vehicles/components/detail/MaintenanceRecommendations.tsx src/features/quotes/components/new/QuoteEditor.tsx
git commit -m "feat(vehicles): 'Filtros' card applies matching model kit to a new quote (PRD-035)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 18: Placeholder SDR + revisão do placeholder de IA

**Files:**

- Modify: arquivo do fluxo de orçamento do SDR (localizar via grep `SDR`/`sdr-quote` que monta orçamento — provável `src/features/sdr-quote/` ou similar)

> RF-015: no SDR, ao montar orçamento, oferecer "anexar Kit" como **placeholder coerente** (sem automação de IA). RF-016 (botão IA desabilitado) já foi entregue no editor (Task 11) — apenas confirmar que existe e está com o tooltip correto.

- [ ] **Step 1:** Localizar onde o SDR monta/parametriza o orçamento. Adicionar um placeholder visual coerente: um item/seção "Anexar Kit ao orçamento" desabilitado ou com `toast.info("Disponível ao abrir o orçamento")`, sem lógica de IA. Manter discreto e honesto (sem número fake).

- [ ] **Step 2:** Confirmar o botão "Sugerir composição (IA)" no `ModelKitFormPage` (Task 11): `disabled`, `<span tabIndex={0}>` + `Tooltip` "Disponível na Fase 2" + selo `ⓘ Fase 2`. Ajustar se faltar algo.

- [ ] **Step 3: Verificar tipos + prettier** (nos arquivos tocados)

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(sdr): coherent placeholder to attach kit in SDR quote; confirm AI Fase 2 stub (PRD-035)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 19: CUTOVER — remover `service-kits` e ligar o redirect

**Files:**

- Delete: `src/features/service-kits/**` (16 arquivos), `src/shared/types/service-kit.ts`, `src/providers/data/contracts/serviceKits.ts`, `src/providers/data/impl/mock/serviceKits.ts`, `src/providers/data/impl/supabase/serviceKits.ts`, `src/providers/data/hooks/useServiceKitsProvider.ts`, `src/mocks/api/serviceKits.ts`, `src/mocks/data/seedServiceKits.ts`, `src/features/quotes/utils/kitExpansion.ts`
- Modify: `src/providers/data/contracts/index.ts`, `factory.ts`, `index.ts`, `src/mocks/api/index.ts` (remover toda referência a `serviceKits`)
- Modify: `src/shared/types/index.ts` (remover export de `service-kit`)
- Modify: `src/features/rbac/permissions/resources.ts`, `matrix.ts`, `RolesPage.tsx` (remover `serviceKit`)
- Modify: `src/features/shell/config/navigation.ts` (remover item "Kits de revisão", linhas 73-78)
- Modify: `src/routes/app.catalogo.kits.tsx` → redirect `/app/kits`

> **Ordem:** primeiro garanta que NADA ainda importa `serviceKits`/`IServiceKit`/`expandKitToItems` (grep). Só então delete. Cada remoção deve manter `tsc` verde no fim.

- [ ] **Step 1: Auditar referências remanescentes**

Run: `bunx tsc --noEmit > $null 2>&1; rg -n "serviceKit|IServiceKit|expandKitToItems|seedServiceKits|APP_CATALOGO_KITS|Kits de revisão" src`
Expected: apenas ocorrências nos arquivos que esta task vai deletar/editar. Se algum consumidor vivo aparecer (fora deles), migrá-lo para `modelKits` ANTES de deletar.

- [ ] **Step 2: Converter a rota antiga em redirect** — `src/routes/app.catalogo.kits.tsx`: substituir o componente por um `beforeLoad: () => { throw redirect({ to: "/app/kits" }); }` (mantém o arquivo e a constante `APP_CATALOGO_KITS` viva só para o redirect; remover o import do `ServiceKitsListPage`).

- [ ] **Step 3: Remover o item de nav** — em `navigation.ts`, deletar o objeto `{ label: "Kits de revisão", … }` (linhas 73-78).

- [ ] **Step 4: Remover RBAC `serviceKit`** — tirar `"serviceKit"` de `resources.ts`; as entradas `p("serviceKit", …)` de `matrix.ts` (Owner/Gestor); e `serviceKit: "Kits de revisão",` de `RESOURCE_LABELS` (`RolesPage.tsx`).

- [ ] **Step 5: Remover a slice de provider** — em `factory.ts` (imports + `serviceKits:` em ambos os bundles), `contracts/index.ts` (import de tipo + bloco de re-export + `serviceKits` em `IDataProviders`), `providers/data/index.ts` (re-export do hook/tipos), `mocks/api/index.ts` (re-export `serviceKitsApi`). Deletar os 6 arquivos de provider/mock/hook + o tipo `service-kit.ts` e o seed `seedServiceKits.ts`, e remover o export de `service-kit` do barrel `shared/types/index.ts`.

- [ ] **Step 6: Deletar a feature e o util** — `Remove-Item -Recurse -Force src/features/service-kits` e `Remove-Item -Force src/features/quotes/utils/kitExpansion.ts`. Deletar a rota antiga do `routeTree` regenerando (a rota `app.catalogo.kits` permanece, agora como redirect).

- [ ] **Step 7: Regenerar rotas + verificação total**

```bash
# dev server ativo regenera src/routeTree.gen.ts
bunx tsc --noEmit 2>&1 | rg -iE "serviceKit|IServiceKit|kitExpansion|service-kits"   # ESPERADO: vazio
```

(Confirme também que o `tsc` filtrado pelos arquivos tocados está limpo. Erros pré-existentes não relacionados são ignorados.)

- [ ] **Step 8: Prettier nos arquivos modificados + Commit**

```bash
bunx prettier --check "src/providers/data/contracts/index.ts" "src/providers/data/factory.ts" "src/providers/data/index.ts" "src/mocks/api/index.ts" "src/shared/types/index.ts" "src/features/rbac/permissions/resources.ts" "src/features/rbac/permissions/matrix.ts" "src/features/rbac/pages/RolesPage.tsx" "src/features/shell/config/navigation.ts" "src/routes/app.catalogo.kits.tsx"
git add -A
git commit -m "refactor(model-kits): cut over from service-kits — remove old feature, redirect legacy route (PRD-035)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 20: Versão v0.64.0 "Kit" + changelog + PRD DONE + tag

**Files:**

- Modify: `package.json` (version), `CHANGELOG.md`, `CLAUDE.md` (linha do codinome)
- Rename: `docs/prds/PRD-035-kits-composicao.md` → `…_DONE.md` (Status ✅)

- [ ] **Step 1:** Bump `package.json` `version` para `0.64.0`.

- [ ] **Step 2:** `CHANGELOG.md` — nova seção `## [0.64.0] - 2026-06-03 - Kit` (Keep a Changelog) com **Added** (kits por modelo: cards no detalhe do modelo, editor dedicado, modal de aplicação com preview/snapshot, sugestão automática, drift, curadoria rascunho/oficial; `appliedKitIds`), **Changed** (consolidação: "Kits de revisão" substituído por "Kits por modelo"; rota antiga redireciona), **Removed** (feature antiga `service-kits`). Linguagem acessível ao usuário final.

- [ ] **Step 3:** `CLAUDE.md` — atualizar a linha do codinome/versão para `Kit` — v0.64.0.

- [ ] **Step 4:** Renomear o PRD para `docs/prds/PRD-035-kits-composicao_DONE.md` e marcar Status ✅ IMPLEMENTADO (versão v0.64.0, data 2026-06-03).

- [ ] **Step 5: Prettier + Commit + Tag**

```bash
bunx prettier --check "package.json" "CHANGELOG.md"
git add package.json CHANGELOG.md CLAUDE.md "docs/prds/PRD-035-kits-composicao_DONE.md"
git rm --cached "docs/prds/PRD-035-kits-composicao.md" 2>$null
git commit -m "chore(release): v0.64.0 Kit — model kits epic sub-project 2 (PRD-035)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
git tag v0.64.0
```

- [ ] **Step 6:** Após todas as tasks, **dispatch do revisor final holístico** (subagent-driven-development) e então `superpowers:finishing-a-development-branch`.

---

## Self-Review (executado pelo autor do plano)

**1. Cobertura do spec (RF-001…RF-017):**

- RF-001 (tipos) → Task 1. RF-002 (`appliedKitIds`) → Task 2. RF-003 (seed ~10) → Task 5.
- RF-004 (provider) → Task 3/4. RF-005 (kits por modelo) → Task 10. RF-006 (editor) → Task 11.
- RF-007 (validações) → Task 4 (api) + Task 8 (zod). RF-008/009 (curadoria/promoção) → Task 8 (mutations) + Task 9 (ações) + Task 13 (descoberta).
- RF-010 (drift) → Task 7 (lógica) + Task 12 (banner). RF-011/012 (aplicar+preview+snapshot+appliedKitIds) → Task 14 + Task 15.
- RF-013 (sugestão automática) → Task 16. RF-014 (card do veículo) → Task 17. RF-015 (SDR) → Task 18.
- RF-016 (IA desabilitada) → Task 11 + Task 18. RF-017 (permissões + audit) → Task 6 + Task 8/15.
- Consolidação/cutover → Task 19. Versão → Task 20. **Sem lacunas.**

**2. Placeholder scan:** as tasks de UI carregam contrato + especificação de design verbatim + pontos de fiação (granularidade deliberada, igual ao plano do PRD-034); as de lógica/plumbing têm código integral. Sem "TBD"/"etc." soltos.

**3. Consistência de tipos/nomes:** `IVehicleModelKit`/`IKitItem`/`ModelKitCategory`/`ModelKitStatus`, `IModelKitsProvider`/`modelKits`/`useModelKitsProvider`/`modelKitsApi`, `findKitsForVehicle`/`getCompatiblePartsNotInKit`/`buildKitPreview`/`IKitPreviewLine`, resource `modelKit`, rotas `app.kits.$modelId.kit.novo`/`.kit.$kitId.editar` — consistentes entre as tasks. Método de exclusão: contrato `delete` → api `remove` (mapeado na impl mock, igual a serviceKits).

> **Ordenação de execução:** Task 5 (seed) deve preceder a Task 4 (api importa o seed), embora numeradas em ordem lógica. O subagente deve criar `seedModelKits.ts` antes de `modelKits.ts` compilar. Demais tasks seguem a numeração.
