# Delta PRD-016 — Veículos ↔ Modelo Canônico + Kits — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ligar `IVehicle` ao catálogo canônico de modelos (PRD-034) via `modelId`, trocar o matching de kits para `modelId`, e substituir o placeholder de "Peças compatíveis" por uma seção real de 3 modos com história de drift + estado/ação "modelo não catalogado".

**Architecture:** Tudo **aditivo** até o cutover final (Task 16), mantendo `tsc` verde por commit. Lógica pura isolada e testável (`compatibleParts.ts`, swap de `modelKitMatching.ts`); UI feature-local em `vehicles` reusando componentes de `model-kits` e o `usePartsProvider`; ação vincular/criar reusa o `VehicleModelForm` do PRD-034.

**Tech Stack:** React 19 + TS strict, TanStack Query, Tailwind v4 + shadcn/ui (new-york), Iconify `mdi:*` via `@/components/Icon`, zod + react-hook-form, sonner.

**Spec:** `docs/superpowers/specs/2026-06-03-delta-prd016-veiculos-kits-design.md`

---

## ⚠️ Gates do repositório (LER ANTES DE COMEÇAR)

Estas são as regras de validação deste repo. **Não existe** test runner configurado.

1. **`bun run build` NÃO faz type-check** (usa esbuild). O **gate de tipos real** é:
   ```powershell
   bunx tsc --noEmit 2>&1 | Select-String "src/features/vehicles|src/features/model-kits|src/mocks|src/shared/types/customer"
   ```
   A saída filtrada pelos **arquivos do delta** deve ficar **VAZIA**. Há ~315 erros pré-existentes não relacionados — ignore-os; só importam erros nos arquivos que você tocou.
2. **`bun run lint` global é INUTILIZÁVEL** (falsos-positivos de CRLF). Valide formatação **por arquivo**:
   ```powershell
   bunx prettier --check "src/features/vehicles/utils/compatibleParts.ts"
   ```
   Se `prettier --check` reclamar de um arquivo **pré-existente** mas `prettier --write` não gerar diff no `git`, é CRLF — **ignore**.
3. **Sem test runner.** Para validar lógica pura, crie um script descartável `scripts/_check_<algo>.ts`, rode com `bun scripts/_check_<algo>.ts`, confirme a saída, e **delete no mesmo commit** (`git add` não deve incluí-lo).
4. **`src/routeTree.gen.ts`** é regenerado pelo dev server (porta 5173). Este delta **não cria rotas novas** — não deve tocar nesse arquivo. Se aparecer modificado, é CRLF/dev-server; não commitar.
5. **Tokens semânticos APENAS** (`bg-card`, `bg-muted`, `border-border`, `text-foreground`, `text-muted-foreground`, `text-primary`, `bg-primary/10`, `text-destructive`). **Nunca** hex ou cores raw do Tailwind. Light + dark, WCAG AA.
6. **Branch:** `feat/delta-prd016-veiculos-kits` (já criada a partir de `main` com PRD-034/035 mergeados). **Não trocar de branch.**
7. **Commits:** Conventional Commits em inglês, terminando com:
   ```
   Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
   ```
   Em PowerShell, use dois `-m` (NÃO here-string `@'...'@`, que quebra o parsing).
8. **Não commitar** docs de input (PDFs em `docs/reports/`, `docs/export/`, DELTAS, PRD-056, `delta-escopo-erp-gallo.md`).

---

## Mapa de arquivos

**Modificar:**
- `src/shared/types/customer.ts` — `+ modelId: ID | null` em `IVehicle`.
- `src/mocks/data/seedVehicleModelsCanonical.ts` — exportar `slug` (extrair p/ reuso).
- `src/mocks/data/seedVehicleModels.ts` — `+ SEED_EXOTIC_VEHICLE_MODELS`.
- `src/mocks/generators/vehicle.ts` — linking determinístico de `modelId`.
- `src/features/vehicles/components/NewVehicleModal.tsx` — set `modelId: null` no create manual.
- `src/features/model-kits/utils/modelKitMatching.ts` — swap p/ `modelId` (remove `modelsById`).
- `src/features/vehicles/components/detail/MaintenanceRecommendations.tsx` — ajustar call site.
- `src/features/vehicles/components/detail/VehicleDetailHeader.tsx` — badge + ação "não catalogado".
- `src/features/vehicles/components/detail/layouts/types.ts` — `+ onRequestLinkModel`.
- `src/features/vehicles/components/detail/layouts/VehicleLayout{Bento,Health,Rails}.tsx` — placeholder → `CompatibleParts`.
- `src/features/vehicles/pages/VehicleDetailPage.tsx` — lift do `LinkModelDialog` + wiring.
- `src/features/vehicles/i18n/pt-BR.ts` — strings novas; remover placeholder antigo no cutover.

**Criar:**
- `src/features/vehicles/utils/compatibleParts.ts`
- `src/features/vehicles/config/compatibleParts.ts` — modos + storage key.
- `src/features/vehicles/hooks/useCompatiblePartsView.ts`
- `src/features/vehicles/hooks/useCompatibleParts.ts`
- `src/features/vehicles/hooks/useLinkVehicleModel.ts`
- `src/features/vehicles/components/detail/compatible-parts/CompatibleParts.tsx`
- `src/features/vehicles/components/detail/compatible-parts/KitCallout.tsx`
- `src/features/vehicles/components/detail/compatible-parts/CompatiblePartsModeToggle.tsx`
- `src/features/vehicles/components/detail/compatible-parts/CompatiblePartRow.tsx`
- `src/features/vehicles/components/detail/compatible-parts/CuradoriaView.tsx`
- `src/features/vehicles/components/detail/compatible-parts/CatalogoView.tsx`
- `src/features/vehicles/components/detail/compatible-parts/KitOnlyView.tsx`
- `src/features/vehicles/components/detail/compatible-parts/CompatiblePartsEmpty.tsx`
- `src/features/vehicles/components/detail/ModelNotCataloguedBadge.tsx`
- `src/features/vehicles/components/detail/LinkModelDialog.tsx`

**Remover (cutover):**
- `src/features/vehicles/components/detail/CompatiblePartsPlaceholder.tsx`

---

## Task 1: Extrair `slug` reutilizável

**Files:**
- Modify: `src/mocks/data/seedVehicleModelsCanonical.ts`

O gerador (Task 3) precisa computar o mesmo `vmodel-<id>` que o builder canônico. Extrair a função `slug` para ser importável, sem mudar comportamento.

- [ ] **Step 1: Exportar `slug`**

Em `seedVehicleModelsCanonical.ts`, troque `function slug(` por `export function slug(`:

```ts
/** Slugify a brand/model/engine token for the canonical model id. Shared with
 *  the vehicle generator so both produce identical ids. */
export function slug(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}
```

> Nota: substitua a classe de caracteres literal de combinação pelo escape `̀-ͯ` (mesma faixa, sem caracteres invisíveis no fonte).

- [ ] **Step 2: Gate de tipos**

Run: `bunx tsc --noEmit 2>&1 | Select-String "seedVehicleModelsCanonical"`
Expected: vazio.

- [ ] **Step 3: Commit**

```powershell
git add src/mocks/data/seedVehicleModelsCanonical.ts
git commit -m "refactor(mocks): export slug from canonical model seed for reuse" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Seed de modelos exóticos (órfãos)

**Files:**
- Modify: `src/mocks/data/seedVehicleModels.ts`

- [ ] **Step 1: Adicionar `SEED_EXOTIC_VEHICLE_MODELS`**

Ao final de `seedVehicleModels.ts`, após o fechamento de `SEED_VEHICLE_MODELS`:

```ts
/**
 * Models present in the customer fleet but intentionally absent from the
 * canonical catalog (PRD-034). Used ONLY by the vehicle generator to exercise
 * the "modelo não catalogado" state — these brands are outside GALLO's canonical
 * coverage, so the generated vehicles get `modelId: null`. NOT fed into
 * buildCanonicalVehicleModels().
 */
export const SEED_EXOTIC_VEHICLE_MODELS: IVehicleModelEntry[] = [
  {
    brand: "Volkswagen",
    model: "Constellation 24.280",
    engines: ["MAN D08"],
    yearStart: 2014,
    yearEnd: 2023,
  },
  { brand: "MAN", model: "TGX 29.480", engines: ["D26"], yearStart: 2016, yearEnd: 2023 },
  { brand: "DAF", model: "XF 105", engines: ["PACCAR MX-13"], yearStart: 2013, yearEnd: 2021 },
];
```

- [ ] **Step 2: Gate de tipos**

Run: `bunx tsc --noEmit 2>&1 | Select-String "seedVehicleModels.ts"`
Expected: vazio (array adicional, sem consumidores ainda).

- [ ] **Step 3: Commit**

```powershell
git add src/mocks/data/seedVehicleModels.ts
git commit -m "feat(mocks): add exotic (non-canonical) vehicle models for orphan state" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: `IVehicle.modelId` + linking determinístico no gerador

**Files:**
- Modify: `src/shared/types/customer.ts:138-151`
- Modify: `src/mocks/generators/vehicle.ts`
- Modify: `src/features/vehicles/components/NewVehicleModal.tsx`
- Temp: `scripts/_check_orphans.ts`

> Esta task flipa o tipo (campo obrigatório `modelId`). TODOS os sites que constroem `IVehicle` ou seu input de create precisam ser atualizados no MESMO commit para `tsc` ficar verde.

- [ ] **Step 1: Adicionar `modelId` ao tipo**

Em `customer.ts`, dentro de `interface IVehicle`, após `engine: string;`:

```ts
  engine: string;
  /** Canonical model (PRD-034). `null` = "modelo não catalogado". The
   *  brand/model/engine above remain the denormalized display snapshot. */
  modelId: ID | null;
  plate?: string;
```

- [ ] **Step 2: Linking no gerador**

Em `src/mocks/generators/vehicle.ts`, ajuste os imports e a função `generateVehicle`:

```ts
import type { ICustomer, ID, IVehicle, IVehicleServiceEntry } from "@/shared/types";
import { SEED_VEHICLE_MODELS, SEED_EXOTIC_VEHICLE_MODELS } from "../data";
import { SEED_VEHICLE_MODELS_CANONICAL, slug } from "../data/seedVehicleModelsCanonical";
import { daysAgo, randomISO, type ISeededContext } from "./utils";

const CANONICAL_MODEL_IDS = new Set(SEED_VEHICLE_MODELS_CANONICAL.map((m) => m.id));

/** Generate a vehicle owned by a customer (preferentially B2B fleets). */
export function generateVehicle(
  ctx: ISeededContext,
  options: { sequence: number; owner: ICustomer; now?: Date },
): IVehicle {
  // ~12% of vehicles draw from the exotic (non-canonical) pool → orphans.
  const useExotic = ctx.bool(0.12);
  const model = useExotic ? ctx.pick(SEED_EXOTIC_VEHICLE_MODELS) : ctx.pick(SEED_VEHICLE_MODELS);
  const engine = ctx.pick(model.engines);
  const year = ctx.int(model.yearStart, model.yearEnd);
  const id: ID = `vehicle-${String(options.sequence + 1).padStart(4, "0")}`;
  const now = options.now ?? new Date();

  const candidateModelId = `vmodel-${slug(model.brand)}-${slug(model.model)}-${slug(engine)}`;
  const modelId: ID | null = CANONICAL_MODEL_IDS.has(candidateModelId) ? candidateModelId : null;

  return {
    id,
    customerId: options.owner.id,
    brand: model.brand,
    model: model.model,
    year,
    engine,
    modelId,
    plate: ctx.bool(0.9) ? generatePlate(ctx) : undefined,
    vin: ctx.bool(0.6) ? generateVin(ctx) : undefined,
    currentKm: ctx.int(35_000, 850_000),
    serviceHistory: [],
    cadastroStatus: ctx.bool(0.85) ? "aprovado" : ctx.bool(0.5) ? "pendente" : "rejeitado",
    createdAt: randomISO(ctx, new Date(now.getFullYear() - 2, 0, 1), now),
  };
}
```

> Verifique que `SEED_EXOTIC_VEHICLE_MODELS` é reexportado pelo barrel `src/mocks/data/index.ts`. Se não for, adicione `export * from "./seedVehicleModels";` já cobre (mesmo arquivo). Confirme com grep; se o barrel reexporta itens nomeados, adicione `SEED_EXOTIC_VEHICLE_MODELS` à lista.

- [ ] **Step 3: Create manual seta `modelId: null`**

Em `NewVehicleModal.tsx`, encontre onde o input de `vehiclesApi.create`/provider create é montado (objeto com `brand/model/engine/year/customerId/...`) e adicione `modelId: null,`. Veículos criados manualmente entram como "não catalogado" (podem ser vinculados depois). Procure o literal de submit e inclua o campo. Se o create usa `Omit<IVehicle, "id" | "createdAt" | "serviceHistory">`, o campo `modelId` passa a ser exigido — adicione-o.

- [ ] **Step 4: Script de verificação de órfãos**

Crie `scripts/_check_orphans.ts`:

```ts
import { createSeededContext } from "@/mocks/generators/utils";
import { generateVehicle } from "@/mocks/generators/vehicle";
import type { ICustomer } from "@/shared/types";

const ctx = createSeededContext("orphan-check");
const owner = { id: "cust-x" } as ICustomer;
let orphans = 0;
const N = 60;
for (let i = 0; i < N; i++) {
  const v = generateVehicle(ctx, { sequence: i, owner });
  if (v.modelId === null) orphans++;
}
console.log(`orphans=${orphans}/${N}`);
if (orphans < 3 || orphans > 18) throw new Error(`unexpected orphan count: ${orphans}`);
console.log("OK");
```

> Ajuste o import de `createSeededContext`/factory de `ICustomer` ao que o `ISeededContext` realmente exige (leia `src/mocks/generators/utils.ts` para o nome correto do construtor de contexto). O objetivo: provar que o gerador produz uma fração de órfãos (não 0, não a maioria).

- [ ] **Step 5: Rodar o script**

Run: `bun scripts/_check_orphans.ts`
Expected: `orphans=<n>/60` com `3 ≤ n ≤ 18`, depois `OK`.

- [ ] **Step 6: Deletar o script + gate de tipos**

```powershell
Remove-Item scripts/_check_orphans.ts
bunx tsc --noEmit 2>&1 | Select-String "customer.ts|generators/vehicle|NewVehicleModal"
```
Expected: vazio.

- [ ] **Step 7: Commit** (sem o script)

```powershell
git add src/shared/types/customer.ts src/mocks/generators/vehicle.ts src/features/vehicles/components/NewVehicleModal.tsx
git commit -m "feat(vehicles): add IVehicle.modelId with deterministic mock linking (PRD-016)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Swap de `findKitsForVehicle` para `modelId`

**Files:**
- Modify: `src/features/model-kits/utils/modelKitMatching.ts`
- Modify: `src/features/vehicles/components/detail/MaintenanceRecommendations.tsx`
- Temp: `scripts/_check_matching.ts`

- [ ] **Step 1: Reescrever o matching**

Substitua o conteúdo de `modelKitMatching.ts`. Remova `vehicleMatchesModel` e `normalizeToken` **se** o grep do Step 3 confirmar que não há outro consumidor; caso contrário, mantenha-os:

```ts
import type { IVehicle, IVehicleModelKit } from "@/shared/types";

/**
 * Kits applicable to a vehicle, official before draft. Matches by the canonical
 * `modelId` (PRD-016). A vehicle without a catalogued model has no kits.
 */
export function findKitsForVehicle(
  vehicle: IVehicle,
  kits: IVehicleModelKit[],
): IVehicleModelKit[] {
  if (vehicle.modelId == null) return [];
  return kits
    .filter((kit) => kit.modelId === vehicle.modelId)
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === "oficial" ? -1 : 1;
      return a.name.localeCompare(b.name, "pt-BR");
    });
}
```

- [ ] **Step 2: Conferir outros consumidores de `findKitsForVehicle` / helpers removidos**

Run: `bunx --bun grep` — na prática use a ferramenta Grep do agente:
- Procure `findKitsForVehicle(` em `src/` → atualizar TODOS para a nova assinatura de 2 args (sem `modelsById`).
- Procure `vehicleMatchesModel` e `normalizeToken` em `src/` → se houver outro uso, **não** remova; se só `modelKitMatching` se referenciava, a remoção acima está correta.

Call sites conhecidos a corrigir: `MaintenanceRecommendations.tsx` (Step 3), `QuoteEditor.tsx` e `MaintenanceRecommendations` usam via hook `useModelKits`. Verifique também `useCompatibleParts` (ainda não existe). Atualize qualquer chamada com 3 args.

- [ ] **Step 3: Ajustar `MaintenanceRecommendations.tsx`**

Remova o uso de `vehicleModels`/`modelsById` que existia só para o matching. Novo trecho (linhas ~24-36):

```tsx
  // Resolve applicable filter kit for this vehicle (RF-014).
  const modelKitsQuery = useModelKits({});
  const kits = modelKitsQuery.data ?? [];
  const applicableFilterKit = useMemo(
    () =>
      findKitsForVehicle(vehicle, kits).find(
        (k) => k.status === "oficial" && k.category === "filtros",
      ) ?? null,
    [vehicle, kits],
  );
```

Remova os imports agora não usados: `useVehicleModels` e a linha `const vehicleModels = ...` / `const modelsById = ...`. **Confirme** que `useVehicleModels` não é usado em outro ponto do arquivo antes de remover o import.

- [ ] **Step 4: Script de verificação do matching**

Crie `scripts/_check_matching.ts`:

```ts
import { findKitsForVehicle } from "@/features/model-kits/utils/modelKitMatching";
import type { IVehicle, IVehicleModelKit } from "@/shared/types";

const base = { id: "k", storeId: "s", name: "K", category: "filtros", items: [], createdBy: "u", createdAt: "", updatedAt: "" } as const;
const kits: IVehicleModelKit[] = [
  { ...base, id: "k1", name: "B Rascunho", status: "rascunho", modelId: "m1" } as IVehicleModelKit,
  { ...base, id: "k2", name: "A Oficial", status: "oficial", modelId: "m1" } as IVehicleModelKit,
  { ...base, id: "k3", name: "Outro", status: "oficial", modelId: "m2" } as IVehicleModelKit,
];
const linked = { modelId: "m1" } as IVehicle;
const orphan = { modelId: null } as IVehicle;

const r1 = findKitsForVehicle(linked, kits);
if (r1.map((k) => k.id).join(",") !== "k2,k1") throw new Error(`order wrong: ${r1.map((k) => k.id)}`);
if (findKitsForVehicle(orphan, kits).length !== 0) throw new Error("orphan should match no kits");
console.log("OK");
```

- [ ] **Step 5: Rodar + deletar**

Run: `bun scripts/_check_matching.ts` → Expected: `OK`.
Then: `Remove-Item scripts/_check_matching.ts`

- [ ] **Step 6: Gate de tipos**

Run: `bunx tsc --noEmit 2>&1 | Select-String "modelKitMatching|MaintenanceRecommendations"`
Expected: vazio.

- [ ] **Step 7: Commit**

```powershell
git add src/features/model-kits/utils/modelKitMatching.ts src/features/vehicles/components/detail/MaintenanceRecommendations.tsx
git commit -m "refactor(model-kits): match kits by canonical modelId, drop string matching (PRD-016)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Lógica pura `compatibleParts.ts`

**Files:**
- Create: `src/features/vehicles/utils/compatibleParts.ts`
- Temp: `scripts/_check_compatible.ts`

- [ ] **Step 1: Implementar as utils puras**

```ts
import type { IPart, IVehicle, IVehicleModel, IVehicleModelKit } from "@/shared/types";
import { searchPartsByApplication } from "@/features/catalog/api/search";

/**
 * Parts compatible with a vehicle, sourced from the catalog `applications[]`.
 * The canonical model (PRD-034) is authoritative; falls back to the vehicle's
 * denormalized snapshot for orphans (which match nothing — exotic models have
 * no catalog applications).
 */
export function findCompatibleParts(
  vehicle: IVehicle,
  model: IVehicleModel | null,
  parts: IPart[],
): IPart[] {
  const brand = model?.brand ?? vehicle.brand;
  const modelName = model?.model ?? vehicle.model;
  const engine = model?.engine ?? vehicle.engine;
  return searchPartsByApplication(parts, {
    brand,
    model: modelName,
    engine: engine || undefined,
    year: vehicle.year,
  });
}

/**
 * Split compatible parts into those already in the kit ("curated") and those
 * compatible but outside it ("drift" — curation opportunities). With no kit,
 * every compatible part is drift.
 */
export function splitByKitMembership(
  parts: IPart[],
  kit: IVehicleModelKit | null,
): { inKit: IPart[]; drift: IPart[] } {
  if (!kit) return { inKit: [], drift: parts };
  const kitPartIds = new Set(kit.items.map((i) => i.partId));
  return {
    inKit: parts.filter((p) => kitPartIds.has(p.id)),
    drift: parts.filter((p) => !kitPartIds.has(p.id)),
  };
}
```

- [ ] **Step 2: Script de verificação**

Crie `scripts/_check_compatible.ts`:

```ts
import { splitByKitMembership } from "@/features/vehicles/utils/compatibleParts";
import type { IPart, IVehicleModelKit } from "@/shared/types";

const parts = [{ id: "p1" }, { id: "p2" }, { id: "p3" }] as IPart[];
const kit = { items: [{ partId: "p1" }, { partId: "p2" }] } as IVehicleModelKit;

const { inKit, drift } = splitByKitMembership(parts, kit);
if (inKit.map((p) => p.id).join(",") !== "p1,p2") throw new Error("inKit wrong");
if (drift.map((p) => p.id).join(",") !== "p3") throw new Error("drift wrong");

const none = splitByKitMembership(parts, null);
if (none.drift.length !== 3 || none.inKit.length !== 0) throw new Error("null kit wrong");
console.log("OK");
```

- [ ] **Step 3: Rodar + deletar**

Run: `bun scripts/_check_compatible.ts` → Expected: `OK`.
Then: `Remove-Item scripts/_check_compatible.ts`

- [ ] **Step 4: Gate de tipos + format**

```powershell
bunx tsc --noEmit 2>&1 | Select-String "compatibleParts.ts"
bunx prettier --check "src/features/vehicles/utils/compatibleParts.ts"
```
Expected: tsc vazio; prettier OK (ou só CRLF).

- [ ] **Step 5: Commit**

```powershell
git add src/features/vehicles/utils/compatibleParts.ts
git commit -m "feat(vehicles): pure logic for compatible parts + kit drift split (PRD-016)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Config + hook UX-pref `useCompatiblePartsView`

**Files:**
- Create: `src/features/vehicles/config/compatibleParts.ts`
- Create: `src/features/vehicles/hooks/useCompatiblePartsView.ts`

Espelha o padrão de `config/layout.ts` + `useVehicleDetailLayout.ts`.

- [ ] **Step 1: Config**

`src/features/vehicles/config/compatibleParts.ts`:

```ts
/** Visualization modes for the vehicle "Peças compatíveis" section (PRD-016). */
export const COMPATIBLE_PARTS_VIEWS = ["curadoria", "catalogo", "kit"] as const;
export type CompatiblePartsView = (typeof COMPATIBLE_PARTS_VIEWS)[number];

export const DEFAULT_COMPATIBLE_PARTS_VIEW: CompatiblePartsView = "curadoria";
export const COMPATIBLE_PARTS_VIEW_STORAGE_KEY = "gallo-compat-view";

/** Top-N shown per subsection in the "curadoria" mode before "ver todas". */
export const CURADORIA_TOP_N = 12;
/** Page size for the full "catalogo" mode. */
export const CATALOGO_PAGE_SIZE = 20;
```

- [ ] **Step 2: Hook**

`src/features/vehicles/hooks/useCompatiblePartsView.ts`:

```ts
import { useCallback, useState } from "react";
import {
  COMPATIBLE_PARTS_VIEWS,
  COMPATIBLE_PARTS_VIEW_STORAGE_KEY,
  DEFAULT_COMPATIBLE_PARTS_VIEW,
  type CompatiblePartsView,
} from "../config/compatibleParts";

function readStoredView(): CompatiblePartsView {
  if (typeof window === "undefined") return DEFAULT_COMPATIBLE_PARTS_VIEW;
  const raw = window.localStorage.getItem(COMPATIBLE_PARTS_VIEW_STORAGE_KEY);
  return COMPATIBLE_PARTS_VIEWS.includes(raw as CompatiblePartsView)
    ? (raw as CompatiblePartsView)
    : DEFAULT_COMPATIBLE_PARTS_VIEW;
}

/** Persisted preference for the compatible-parts visualization mode. */
export function useCompatiblePartsView(): [CompatiblePartsView, (v: CompatiblePartsView) => void] {
  const [view, setViewState] = useState<CompatiblePartsView>(readStoredView);
  const setView = useCallback((next: CompatiblePartsView) => {
    setViewState(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(COMPATIBLE_PARTS_VIEW_STORAGE_KEY, next);
    }
  }, []);
  return [view, setView];
}
```

- [ ] **Step 3: Gate + commit**

```powershell
bunx tsc --noEmit 2>&1 | Select-String "config/compatibleParts|useCompatiblePartsView"
git add src/features/vehicles/config/compatibleParts.ts src/features/vehicles/hooks/useCompatiblePartsView.ts
git commit -m "feat(vehicles): compatible-parts view config + persisted preference hook (PRD-016)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Hook de dados `useCompatibleParts`

**Files:**
- Create: `src/features/vehicles/hooks/useCompatibleParts.ts`

> Confirme a assinatura de `usePartsProvider().list` lendo `src/providers/data/hooks/usePartsProvider.ts` / `src/features/quotes/hooks/usePartsIndex.ts` (retorna `Promise<IPaginatedResult<IPart>>`, `.data` é o array). Use `pageSize` grande o suficiente (ex.: 500) para trazer o slice de catálogo, como faz `usePartsIndex`.

- [ ] **Step 1: Implementar**

```ts
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { IPart, IVehicle, IVehicleModel, IVehicleModelKit } from "@/shared/types";
import { usePartsProvider } from "@/providers/data/hooks/usePartsProvider";
import { useVehicleModels } from "@/features/vehicle-models/hooks/useVehicleModels";
import { useModelKits } from "@/features/model-kits/hooks/useModelKits";
import { findKitsForVehicle } from "@/features/model-kits/utils/modelKitMatching";
import { findCompatibleParts, splitByKitMembership } from "../utils/compatibleParts";

export interface IUseCompatibleParts {
  isLoading: boolean;
  model: IVehicleModel | null;
  parts: IPart[];
  inKit: IPart[];
  drift: IPart[];
  applicableKit: IVehicleModelKit | null;
}

/** Resolves compatible parts + applicable filter kit + drift split for a vehicle. */
export function useCompatibleParts(vehicle: IVehicle): IUseCompatibleParts {
  const partsProvider = usePartsProvider();
  const partsQuery = useQuery({
    queryKey: ["parts", "compatible-slice"],
    queryFn: () => partsProvider.list({ pageSize: 500 }),
  });
  const vehicleModelsQuery = useVehicleModels({});
  const modelKitsQuery = useModelKits({});

  const allParts = partsQuery.data?.data ?? [];
  const models = vehicleModelsQuery.data ?? [];
  const kits = modelKitsQuery.data ?? [];

  const model = useMemo(
    () => (vehicle.modelId ? (models.find((m) => m.id === vehicle.modelId) ?? null) : null),
    [vehicle.modelId, models],
  );

  const applicableKit = useMemo(
    () =>
      findKitsForVehicle(vehicle, kits).find(
        (k) => k.status === "oficial" && k.category === "filtros",
      ) ?? null,
    [vehicle, kits],
  );

  const parts = useMemo(
    () => findCompatibleParts(vehicle, model, allParts),
    [vehicle, model, allParts],
  );

  const { inKit, drift } = useMemo(
    () => splitByKitMembership(parts, applicableKit),
    [parts, applicableKit],
  );

  return {
    isLoading: partsQuery.isLoading || vehicleModelsQuery.isLoading || modelKitsQuery.isLoading,
    model,
    parts,
    inKit,
    drift,
    applicableKit,
  };
}
```

- [ ] **Step 2: Gate + commit**

```powershell
bunx tsc --noEmit 2>&1 | Select-String "useCompatibleParts.ts"
git add src/features/vehicles/hooks/useCompatibleParts.ts
git commit -m "feat(vehicles): useCompatibleParts data hook (parts + kit + drift) (PRD-016)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Strings i18n

**Files:**
- Modify: `src/features/vehicles/i18n/pt-BR.ts`

- [ ] **Step 1: Adicionar bloco de strings**

Dentro de `VEHICLE_STRINGS.detail`, adicione uma chave `compatibleV2` (mantenha `compatible` antigo até o cutover da Task 16) e `notCatalogued`/`linkModel`. Use **acentuação correta**. Exemplo de forma (ajuste ao formato real do objeto):

```ts
    compatibleV2: {
      modes: {
        curadoria: "Curadoria",
        catalogo: "Catálogo",
        kit: "Só o Kit",
      },
      inKit: "No Kit oficial",
      drift: "Compatível, fora do Kit",
      driftChip: "Drift",
      seeAll: (n: number) => `Ver todas (${n})`,
      searchPlaceholder: "Buscar peça, SKU ou código…",
      categoryAll: "Todas as categorias",
      emptyCatalogued: "Nenhuma peça compatível cadastrada para este modelo.",
      emptyKitOnly: "Nenhum Kit oficial de filtros para este modelo.",
      kitCallout: "Kit oficial de filtros disponível para este modelo",
      seeKit: "Ver Kit",
      noKitHint: (n: number) =>
        `Nenhum Kit oficial — ${n} peças compatíveis poderiam virar um Kit.`,
    },
    notCatalogued: {
      badge: "Modelo não catalogado",
      orphanPartsTitle: "Sem catálogo de peças",
      orphanPartsDescription: "Vincule ou cadastre o modelo para ver peças compatíveis.",
      orphanKitsTitle: "Nenhum Kit aplicável",
      orphanKitsDescription: "Kits são vinculados por modelo. Catalogue o modelo para habilitar.",
    },
    linkModel: {
      trigger: "Vincular modelo",
      title: "Vincular modelo ao veículo",
      description: "Associe este veículo a um modelo do catálogo ou cadastre um novo.",
      tabExisting: "Vincular existente",
      tabCreate: "Criar novo",
      existingPlaceholder: "Buscar modelo por marca, modelo ou motor…",
      existingEmpty: "Nenhum modelo encontrado.",
      confirm: "Vincular",
      cancel: "Cancelar",
      linkedToast: "Modelo vinculado ao veículo.",
    },
```

- [ ] **Step 2: Gate + commit**

```powershell
bunx tsc --noEmit 2>&1 | Select-String "vehicles/i18n"
git add src/features/vehicles/i18n/pt-BR.ts
git commit -m "feat(vehicles): i18n strings for compatible parts v2 + link model (PRD-016)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Subcomponentes apresentacionais (linha, callout, toggle)

**Files:**
- Create: `src/features/vehicles/components/detail/compatible-parts/CompatiblePartRow.tsx`
- Create: `src/features/vehicles/components/detail/compatible-parts/KitCallout.tsx`
- Create: `src/features/vehicles/components/detail/compatible-parts/CompatiblePartsModeToggle.tsx`

**Design-contract (sem hex; só tokens):**

- [ ] **Step 1: `CompatiblePartRow`**

Props: `{ part: IPart; inKit: boolean; onAddToQuote?: (part: IPart) => void }`.
- Container: `group flex items-center gap-2 px-2 py-2` (~44px), parte de uma lista com `divide-y divide-border`.
- **Marcador** (16px, shrink-0): `inKit` → `Icon mdi:check-decagram size={16} className="text-primary"` com `aria-label="No Kit oficial"`; senão → `Icon mdi:plus-circle-outline size={16} className="text-muted-foreground"` com `aria-label="Compatível, fora do Kit"`.
- **SKU:** `font-mono text-xs text-muted-foreground shrink-0` (oculto `<sm` se necessário).
- **Nome + categoria:** wrapper `min-w-0 flex-1` → `span text-sm font-medium text-foreground truncate` (com `title={part.name}`) e, se `part.category`, `<KitCategoryBadge category={mapToKitCategory(part.category)} />` inline **somente quando** o mapeamento existir; caso contrário omita (não invente categoria). Para evitar dependência ambígua, **não** mapear: mostre a `part.category` como `Badge variant="outline"` simples com o rótulo da categoria. (Decisão: usar `Badge` neutro, não `KitCategoryBadge`, pois as taxonomias diferem.)
- **Marca:** `text-xs text-muted-foreground shrink-0 hidden md:inline`.
- **Preço:** `text-sm font-medium tabular-nums text-right shrink-0` via `formatBRL(part.unitPrice)` (import de `@/shared/utils/format`).
- **Ação:** `Button variant="ghost" size="icon"` com `Icon mdi:cart-plus`, classes `opacity-0 group-hover:opacity-100 focus-visible:opacity-100`, `aria-label="Adicionar ao orçamento"`, `onClick={() => onAddToQuote?.(part)}`. Renderizar só se `onAddToQuote` for fornecido.

- [ ] **Step 2: `KitCallout`**

Props: `{ kit: IVehicleModelKit; partsById: Map<ID, IPart>; onSeeKit: () => void }`.
- Container: `rounded-lg border border-primary/20 bg-primary/10 p-3 space-y-2`.
- Linha 1: `Icon mdi:check-decagram text-primary` + texto `text-sm font-medium text-foreground` (`VEHICLE_STRINGS.detail.compatibleV2.kitCallout`) + `<KitStatusBadge status="oficial" />` + `<KitCategoryBadge category={kit.category} />`.
- Linha 2: `<KitItemsPreview items={kit.items} partsById={partsById} />` à esquerda; à direita `Button variant="ghost" size="sm"` com `Icon mdi:arrow-right` + `seeKit`, `onClick={onSeeKit}`.
- **A11y:** se `text-muted-foreground` sobre `bg-primary/10` não passar AA, use `text-foreground` no texto principal.

- [ ] **Step 3: `CompatiblePartsModeToggle`**

Props: `{ value: CompatiblePartsView; onChange: (v: CompatiblePartsView) => void }`.
- Usar `ToggleGroup`/`ToggleGroupItem` de `@/components/ui/toggle-group` (`type="single"`, `value`, `onValueChange` com guard para não desmarcar). Modele pelo `VehicleLayoutSwitcher.tsx` existente.
- 3 itens: curadoria (`mdi:source-branch`), catalogo (`mdi:format-list-bulleted`), kit (`mdi:package-variant-closed`). Cada item: ícone + label (`VEHICLE_STRINGS.detail.compatibleV2.modes.*`); em `<640px` ocultar label (`hidden sm:inline`) e manter `aria-label`.
- Tom subordinado: `bg-muted` no grupo, item ativo `data-[state=on]:bg-background`.

- [ ] **Step 4: Gate + commit**

```powershell
bunx tsc --noEmit 2>&1 | Select-String "compatible-parts/CompatiblePartRow|compatible-parts/KitCallout|compatible-parts/CompatiblePartsModeToggle"
git add src/features/vehicles/components/detail/compatible-parts/CompatiblePartRow.tsx src/features/vehicles/components/detail/compatible-parts/KitCallout.tsx src/features/vehicles/components/detail/compatible-parts/CompatiblePartsModeToggle.tsx
git commit -m "feat(vehicles): compatible-parts row, kit callout and mode toggle (PRD-016)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: As 3 views + empty

**Files:**
- Create: `src/features/vehicles/components/detail/compatible-parts/CuradoriaView.tsx`
- Create: `src/features/vehicles/components/detail/compatible-parts/CatalogoView.tsx`
- Create: `src/features/vehicles/components/detail/compatible-parts/KitOnlyView.tsx`
- Create: `src/features/vehicles/components/detail/compatible-parts/CompatiblePartsEmpty.tsx`

**Design-contract:**

- [ ] **Step 1: `CompatiblePartsEmpty`**

Props: `{ icon?: string; title: string; description: string; action?: { label: string; onClick: () => void } }`.
- `div` `rounded-md border border-dashed border-border bg-muted/20 px-4 py-6 text-center space-y-2`.
- `Icon` (default `mdi:package-variant`) `size={22} className="text-muted-foreground mx-auto"`.
- `<h4 className="text-sm font-semibold text-foreground">{title}</h4>` (heading real para a11y) + `<p className="text-xs text-muted-foreground">{description}</p>`.
- Se `action`: `Button variant="outline" size="sm"` com o label.

- [ ] **Step 2: `CuradoriaView`**

Props: `{ inKit: IPart[]; drift: IPart[]; topN: number; onAddToQuote?: (p: IPart) => void; onSeeAll: () => void; showingAll: boolean }`.
- Duas subseções, cada uma com `<h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">`:
  1. `{inKit} ({inKit.length})` — heading `inKit` label + contador.
  2. `drift` — heading + chip `Badge variant="outline"` com `Icon mdi:source-branch` + `driftChip`, `className="bg-primary/10 text-foreground"` (nunca destructive).
- Cada subseção: `ul` com `divide-y divide-border`, renderiza `CompatiblePartRow` para cada item; `inKit` rows com `inKit={true}`, drift rows com `inKit={false}`.
- Limite por subseção: `showingAll ? lista : lista.slice(0, topN)`. Se `!showingAll && lista.length > topN`, mostrar botão ghost `seeAll(lista.length)` com `Icon mdi:chevron-down` chamando `onSeeAll`.
- Se ambas vazias: nada aqui (o orquestrador trata empty catalogado).

- [ ] **Step 3: `CatalogoView`**

Props: `{ parts: IPart[]; kitPartIds: Set<ID>; pageSize: number; onAddToQuote?: (p: IPart) => void }`.
- Estado local: `query` (string) e `category` (PartCategory | "all") e `page` (number).
- Barra: `Input` de busca (`searchPlaceholder`) + `Select` de categoria (opção "all" = `categoryAll`; demais categorias derivadas de `Array.from(new Set(parts.map(p => p.category).filter(Boolean)))`).
- Filtragem: por `searchPartsByText` (import de `@/features/catalog/api/search`) quando `query` não vazio, depois filtra por categoria; reseta `page` para 0 ao mudar filtro.
- Paginação: `parts.slice(page*pageSize, (page+1)*pageSize)`; controles `Anterior`/`Próxima` (Buttons ghost, desabilitados nos limites) + indicador `página X de Y`.
- Linhas: `CompatiblePartRow` com `inKit={kitPartIds.has(part.id)}`.

- [ ] **Step 4: `KitOnlyView`**

Props: `{ inKit: IPart[]; onAddToQuote?: (p: IPart) => void }`.
- Se `inKit.length === 0`: `CompatiblePartsEmpty` com `emptyKitOnly` (sem action).
- Senão: `ul` `divide-y divide-border` de `CompatiblePartRow` com `inKit={true}`.

- [ ] **Step 5: Gate + commit**

```powershell
bunx tsc --noEmit 2>&1 | Select-String "compatible-parts/CuradoriaView|compatible-parts/CatalogoView|compatible-parts/KitOnlyView|compatible-parts/CompatiblePartsEmpty"
git add src/features/vehicles/components/detail/compatible-parts/CuradoriaView.tsx src/features/vehicles/components/detail/compatible-parts/CatalogoView.tsx src/features/vehicles/components/detail/compatible-parts/KitOnlyView.tsx src/features/vehicles/components/detail/compatible-parts/CompatiblePartsEmpty.tsx
git commit -m "feat(vehicles): curadoria/catalogo/kit views + empty state (PRD-016)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 11: Orquestrador `CompatibleParts`

**Files:**
- Create: `src/features/vehicles/components/detail/compatible-parts/CompatibleParts.tsx`

**Design-contract:**

Props: `{ vehicle: IVehicle; canEdit: boolean; onRequestLinkModel: () => void; className?: string }`.

- [ ] **Step 1: Implementar a orquestração**

Comportamento:
- Header da seção: `<h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">` (`SECTION_COPY.compatible`) à esquerda; à direita o `CompatiblePartsModeToggle` — **oculto** quando `vehicle.modelId == null`.
- `const data = useCompatibleParts(vehicle)`. `const [view, setView] = useCompatiblePartsView()`. `const [showingAll, setShowingAll] = useState(false)`. `const navigate = useNavigate()`.
- `partsById`: `useMemo(() => new Map(data.parts.map(p => [p.id, p])), [data.parts])` — para o `KitItemsPreview` do callout (precisa cobrir os partIds do kit; se algum item do kit não estiver em `data.parts`, o `KitItemsPreview` já degrada para o id truncado — aceitável).
- **Estado órfão (`modelId == null`):** renderizar só `CompatiblePartsEmpty` com `notCatalogued.orphanPartsTitle/Description` e, se `canEdit`, `action = { label: linkModel.trigger, onClick: onRequestLinkModel }`. Sem toggle, sem callout. **Return cedo.**
- **Loading:** `data.isLoading` → skeleton simples (3-4 linhas `h-10 bg-muted/40 rounded animate-pulse`).
- **Callout:** se `data.applicableKit`, renderizar `KitCallout` no topo (em todos os modos), `onSeeKit={() => navigate({ to: "/app/kits/$modelId/kit/$kitId/editar", params: { modelId: data.applicableKit!.modelId, kitId: data.applicableKit!.id } })}`. **Confirme** o path real da rota do editor de kit lendo `src/routes/app.kits.$modelId.kit.$kitId.editar.tsx` (use exatamente o `to`/params que o router gerou).
- **Catalogado sem peças:** se `data.parts.length === 0` (e não órfão), `CompatiblePartsEmpty` com `compatibleV2.emptyCatalogued`.
- **Switch de view:**
  - `curadoria` → `CuradoriaView` com `inKit/drift/topN=CURADORIA_TOP_N/showingAll/onSeeAll={() => setShowingAll(true)}/onAddToQuote`.
  - `catalogo` → `CatalogoView` com `parts=data.parts/kitPartIds/pageSize=CATALOGO_PAGE_SIZE/onAddToQuote`.
  - `kit` → `KitOnlyView` com `inKit=data.inKit/onAddToQuote`.
- `onAddToQuote`: `(part) => navigate({ to: "/app/orcamentos/novo" })` (MVP: abre o editor; sem pré-injeção de peça avulsa — YAGNI). `kitPartIds = new Set(data.applicableKit?.items.map(i => i.partId) ?? [])`.
- Wrapper externo: `<section className={cn("space-y-3", className)}>`.

- [ ] **Step 2: Gate + commit**

```powershell
bunx tsc --noEmit 2>&1 | Select-String "compatible-parts/CompatibleParts.tsx"
git add src/features/vehicles/components/detail/compatible-parts/CompatibleParts.tsx
git commit -m "feat(vehicles): CompatibleParts orchestrator with 3 modes + orphan state (PRD-016)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 12: Badge "não catalogado" + hook `useLinkVehicleModel`

**Files:**
- Create: `src/features/vehicles/components/detail/ModelNotCataloguedBadge.tsx`
- Create: `src/features/vehicles/hooks/useLinkVehicleModel.ts`

- [ ] **Step 1: `ModelNotCataloguedBadge`**

Sem props (ou `{ className?: string }`). Mesma gramática do `KitStatusBadge` rascunho:

```tsx
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/Icon";
import { VEHICLE_STRINGS } from "../../i18n/pt-BR";

export function ModelNotCataloguedBadge({ className }: { className?: string }) {
  return (
    <Badge variant="outline" className={`gap-1 text-muted-foreground ${className ?? ""}`}>
      <Icon icon="mdi:link-variant-off" size={14} />
      {VEHICLE_STRINGS.detail.notCatalogued.badge}
    </Badge>
  );
}
```

- [ ] **Step 2: `useLinkVehicleModel`** (mirror de `useModelKitMutations`)

```ts
import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { ID, IVehicle } from "@/shared/types";
import { recordAuditLogSync } from "@/providers/data";
import { useVehiclesProvider } from "@/providers/data/hooks/useVehiclesProvider";
import { readCurrentUserSync } from "@/features/auth/guards";
import { VEHICLE_STRINGS } from "../i18n/pt-BR";

export interface IUseLinkVehicleModel {
  linking: boolean;
  link: (vehicleId: ID, modelId: ID) => Promise<IVehicle>;
}

/** Link a vehicle to a canonical model (PRD-016) with audit + cache invalidation. */
export function useLinkVehicleModel(): IUseLinkVehicleModel {
  const provider = useVehiclesProvider();
  const queryClient = useQueryClient();
  const [linking, setLinking] = useState(false);

  const link = useCallback(
    async (vehicleId: ID, modelId: ID) => {
      setLinking(true);
      try {
        const before = await provider.get(vehicleId);
        const updated = await provider.update(vehicleId, { modelId });
        void queryClient.invalidateQueries({ queryKey: ["vehicles"] });
        void queryClient.invalidateQueries({ queryKey: ["vehicle", vehicleId] });
        const user = readCurrentUserSync();
        recordAuditLogSync({
          actorId: user?.id ?? "mock-user",
          action: "link_model",
          resource: "vehicle",
          resourceId: vehicleId,
          before,
          after: updated,
        });
        toast.success(VEHICLE_STRINGS.detail.linkModel.linkedToast);
        return updated;
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Falha ao vincular modelo.");
        throw err;
      } finally {
        setLinking(false);
      }
    },
    [provider, queryClient],
  );

  return { linking, link };
}
```

> Confirme o nome/caminho do provider hook (`useVehiclesProvider`) e dos query keys (`["vehicles"]`, `["vehicle", id]`) lendo `src/providers/data/hooks/` e `src/features/vehicles/hooks/useVehicleDetail*`/`useVehiclesList.ts`. Ajuste as keys aos valores reais usados nas queries de veículo.

- [ ] **Step 3: Gate + commit**

```powershell
bunx tsc --noEmit 2>&1 | Select-String "ModelNotCataloguedBadge|useLinkVehicleModel"
git add src/features/vehicles/components/detail/ModelNotCataloguedBadge.tsx src/features/vehicles/hooks/useLinkVehicleModel.ts
git commit -m "feat(vehicles): not-catalogued badge + link-model mutation hook (PRD-016)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 13: `LinkModelDialog` (vincular existente ou criar novo)

**Files:**
- Create: `src/features/vehicles/components/detail/LinkModelDialog.tsx`

**Design-contract:**

Props: `{ vehicle: IVehicle; open: boolean; onOpenChange: (open: boolean) => void; onLinked: () => void }`.

- [ ] **Step 1: Implementar**

Estrutura:
- `Dialog` (shadcn) com `DialogContent` → `DialogHeader` (`linkModel.title` + `linkModel.description`).
- `Tabs` (shadcn) com dois `TabsTrigger`: `tabExisting` (`mdi:link-variant`) e `tabCreate` (`mdi:plus-box-outline`).
- **Tab "Vincular existente":**
  - `useVehicleModels({})` → lista. `Command`/`Combobox` (use `cmdk` via `@/components/ui/command` se existir; senão um `Input` de busca + lista filtrável) filtrando por `brand/model/engine` (string includes, normalizado).
  - Pré-filtrar sugestões pela `vehicle.brand` no topo (apenas ordenação; ainda lista todos). Item selecionável mostra `brand model · engine · anos`.
  - Botão `confirm` (`linkModel.confirm`), desabilitado sem seleção e enquanto `linking`. Ao confirmar: `await link(vehicle.id, selectedModelId)` (de `useLinkVehicleModel`), depois `onLinked()` + `onOpenChange(false)`.
  - Empty: `existingEmpty`.
- **Tab "Criar novo":**
  - `const { create, saving } = useVehicleModelMutations()`.
  - Renderizar `<VehicleModelForm saving={saving} onSubmit={handleCreate} onCancel={() => onOpenChange(false)} />` (import de `@/features/vehicle-models/components/VehicleModelForm`). Pré-preencher não é suportado pelo form via prop direta de input parcial — passe `initial` apenas se aceitar `IVehicleModel`; como não temos um, deixe sem `initial` (o usuário digita; pode usar `vehicle.brand/model/engine` como dica no `description`).
  - `handleCreate = async (input) => { const createdModel = await create(input); await link(vehicle.id, createdModel.id); onLinked(); onOpenChange(false); }`.
- Reusa `useLinkVehicleModel` para o `link` em ambas as abas.

> **Confirme** se existe `@/components/ui/command` e `@/components/ui/dialog` e `@/components/ui/tabs` (todos shadcn já presentes no projeto — `cmdk` está nas deps). Se `command` não existir, faça a busca com `Input` + lista `max-h-64 overflow-auto` de botões.

- [ ] **Step 2: Gate + commit**

```powershell
bunx tsc --noEmit 2>&1 | Select-String "LinkModelDialog"
git add src/features/vehicles/components/detail/LinkModelDialog.tsx
git commit -m "feat(vehicles): LinkModelDialog — link existing or create canonical model (PRD-016)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 14: Wiring em `VehicleDetailPage` + header

**Files:**
- Modify: `src/features/vehicles/components/detail/layouts/types.ts`
- Modify: `src/features/vehicles/components/detail/VehicleDetailHeader.tsx`
- Modify: `src/features/vehicles/pages/VehicleDetailPage.tsx`

- [ ] **Step 1: Estender o contrato de layout**

Em `layouts/types.ts`, adicione ao `IVehicleLayoutProps`:

```ts
  /** Opens the link-model dialog (used by header badge + orphan empty states). */
  onRequestLinkModel: () => void;
```

- [ ] **Step 2: Badge + ação no header**

Em `VehicleDetailHeader.tsx`:
- Estenda as props: `+ onRequestLinkModel: () => void;`.
- No `<h1>`, após o `Badge` de `cadastroStatus`, quando `vehicle.modelId == null`, renderize `<ModelNotCataloguedBadge />` (import).
- Na área de ações (junto ao `VehicleLayoutSwitcher`), quando `canEdit && vehicle.modelId == null`, adicione `Button variant="outline" size="sm"` com `Icon mdi:link-variant` + `VEHICLE_STRINGS.detail.linkModel.trigger`, `onClick={onRequestLinkModel}`.

- [ ] **Step 3: Lift do dialog em `VehicleDetailPage`**

Em `VehicleDetailPage.tsx`:
- `const [linkOpen, setLinkOpen] = useState(false)`.
- Passe `onRequestLinkModel={() => setLinkOpen(true)}` para `<VehicleDetailHeader ... />` e para o componente de layout (que repassa via `IVehicleLayoutProps`).
- Renderize, ao final, `<LinkModelDialog vehicle={vehicle} open={linkOpen} onOpenChange={setLinkOpen} onLinked={refetch} />`, onde `refetch` é a função de recarregar o veículo já existente na página (confirme o nome — provavelmente `vehicleQuery.refetch` ou um `onUpdated`). Use o mesmo mecanismo que `onUpdated` já usa.

- [ ] **Step 4: Gate de tipos**

Run: `bunx tsc --noEmit 2>&1 | Select-String "layouts/types|VehicleDetailHeader|VehicleDetailPage"`
Expected: vazio. (Os 3 layouts ainda não usam `onRequestLinkModel` — Task 15; props extra em `IVehicleLayoutProps` exige que `VehicleDetailPage` passe o valor, o que o Step 3 faz.)

- [ ] **Step 5: Commit**

```powershell
git add src/features/vehicles/components/detail/layouts/types.ts src/features/vehicles/components/detail/VehicleDetailHeader.tsx src/features/vehicles/pages/VehicleDetailPage.tsx
git commit -m "feat(vehicles): wire not-catalogued badge + LinkModelDialog into detail page (PRD-016)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 15: Trocar placeholder → `CompatibleParts` nos 3 layouts

**Files:**
- Modify: `src/features/vehicles/components/detail/layouts/VehicleLayoutBento.tsx`
- Modify: `src/features/vehicles/components/detail/layouts/VehicleLayoutHealth.tsx`
- Modify: `src/features/vehicles/components/detail/layouts/VehicleLayoutRails.tsx`

- [ ] **Step 1: Substituir em cada layout**

Em cada um dos 3 arquivos:
- Trocar o import `CompatiblePartsPlaceholder` por `import { CompatibleParts } from "../compatible-parts/CompatibleParts";`.
- Trocar `<CompatiblePartsPlaceholder vehicle={vehicle} className={...} />` por `<CompatibleParts vehicle={vehicle} canEdit={canEdit} onRequestLinkModel={onRequestLinkModel} className={...} />` (preservar o `className`/`col-span` existente de cada layout).
- Garantir que `canEdit` e `onRequestLinkModel` sejam desestruturados de `IVehicleLayoutProps` no topo de cada componente (Bento e Rails podem ainda não desestruturar `canEdit`/`onRequestLinkModel` — adicionar).

- [ ] **Step 2: Gate de tipos + build**

```powershell
bunx tsc --noEmit 2>&1 | Select-String "VehicleLayout"
bun run build
```
Expected: tsc vazio; build exit 0.

- [ ] **Step 3: Commit**

```powershell
git add src/features/vehicles/components/detail/layouts/VehicleLayoutBento.tsx src/features/vehicles/components/detail/layouts/VehicleLayoutHealth.tsx src/features/vehicles/components/detail/layouts/VehicleLayoutRails.tsx
git commit -m "feat(vehicles): render CompatibleParts in all three detail layouts (PRD-016)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 16: Cutover — remover placeholder + limpeza

**Files:**
- Delete: `src/features/vehicles/components/detail/CompatiblePartsPlaceholder.tsx`
- Modify: `src/features/vehicles/i18n/pt-BR.ts` (remover strings do placeholder antigo se não usadas)
- Modify (se aplicável): `src/features/model-kits/utils/modelKitMatching.ts` (helpers removidos na Task 4)

- [ ] **Step 1: Confirmar que o placeholder não tem mais consumidores**

Procure `CompatiblePartsPlaceholder` em `src/` → deve aparecer só na própria definição. Se algum layout ainda referencia, é erro da Task 15 — corrija antes.

- [ ] **Step 2: Remover o arquivo**

```powershell
Remove-Item src/features/vehicles/components/detail/CompatiblePartsPlaceholder.tsx
```

- [ ] **Step 3: Limpar strings órfãs**

Em `pt-BR.ts`, remova `detail.compatible.placeholderTitle`/`placeholderDescription` **somente se** o grep confirmar que nada mais as referencia. Mantenha `detail.sections.compatible` (usado pelo header da seção) e `detail.compatible.seeAll` se ainda usado. **Não** quebrar chaves usadas.

- [ ] **Step 4: Gate final completo**

```powershell
bunx tsc --noEmit 2>&1 | Select-String "src/features/vehicles|src/features/model-kits|src/mocks|src/shared/types/customer"
bun run build
```
Expected: tsc filtrado vazio; build exit 0.

- [ ] **Step 5: Verificação de formatação dos arquivos criados**

```powershell
bunx prettier --check "src/features/vehicles/**/*.{ts,tsx}" "src/mocks/**/*.ts"
```
Ignore falsos-positivos de CRLF em arquivos pré-existentes (se `prettier --write` não gerar git diff).

- [ ] **Step 6: Commit**

```powershell
git add -A
git commit -m "refactor(vehicles): remove compatible-parts placeholder, finish PRD-016 cutover" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review (preenchido)

**Spec coverage:**
- §2.1 `IVehicle.modelId` → Task 3. ✅
- §2.2 seed exótico → Task 2. ✅
- §2.3 linking determinístico → Task 3. ✅
- §3.1 swap `findKitsForVehicle` → Task 4. ✅
- §3.2 `findCompatibleParts` → Task 5. ✅
- §3.3 `splitByKitMembership` → Task 5. ✅
- §4.1 hooks dados/UX-pref → Tasks 6, 7. ✅
- §4.2 callout do kit → Task 9. ✅
- §4.3 toggle 3 modos → Task 9. ✅
- §4.4-4.6 views → Task 10. ✅
- §4.7 linha de peça → Task 9. ✅
- §4.8 loading/empty → Tasks 10, 11. ✅
- §5.1 badge → Task 12. ✅
- §5.2 LinkModelDialog → Task 13. ✅
- §5.3 empty orientativo nos cards → Task 11 (peças) + estado órfão; bloco de kits órfão fica coberto pelo callout/empty da seção de peças e pelo `MaintenanceRecommendations` (kits já vazios quando órfão). ✅
- §6 RBAC/auditoria → Task 12 (audit `link_model`), gate `canEdit` em Tasks 13/14. ✅
- §7 estrutura → coberta. ✅

**Placeholder scan:** nenhum "TBD"/"implement later". Os pontos com "Confirme o nome/caminho..." são instruções de verificação contra o código real (não placeholders de conteúdo) — necessárias porque alguns nomes de provider hook/query key precisam ser lidos no repo; cada um tem fallback explícito.

**Type consistency:** `findKitsForVehicle(vehicle, kits)` (2 args) usado consistentemente em Tasks 4, 7. `CompatiblePartsView` e a storage key `gallo-compat-view` consistentes (Tasks 6, 11). `findCompatibleParts(vehicle, model, parts)` e `splitByKitMembership(parts, kit)` consistentes (Tasks 5, 7). `useLinkVehicleModel().link(vehicleId, modelId)` consistente (Tasks 12, 13). Props `onRequestLinkModel` consistentes (Tasks 11, 14, 15).
