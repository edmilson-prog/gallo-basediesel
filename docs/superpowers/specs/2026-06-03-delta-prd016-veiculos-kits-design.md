# Delta PRD-016 — Veículos ↔ Modelo Canônico + Kits — Design

> **Épico:** Composição por Modelo (Kits) — **3ª e última** entrega (após PRD-034 catálogo de modelos e PRD-035 kits).
> **Status:** aprovado · **Data:** 2026-06-03 · **Branch:** `feat/delta-prd016-veiculos-kits`
> **Fonte:** seção 3.7 do `docs/prds/DELTAS-PRDs-Gallo-Base-Diesel (1).md` (apenas as linhas PRD-034/PRD-035 do épico de kits).

---

## 1. Objetivo

Ligar a frota do cliente (`IVehicle`) ao catálogo canônico de modelos (PRD-034) e fechar o ciclo dos kits no detalhe do veículo:

1. **`IVehicle.modelId`** — referência ao `IVehicleModel` canônico, com `brand/model/engine` mantidos como snapshot de display.
2. **Matching por `modelId`** — `findKitsForVehicle` passa de string para id exato.
3. **Seção "Peças compatíveis"** — substitui o placeholder por uma seção real com 3 modos de visualização, refletindo as `applications` do modelo canônico e a história de **drift** (peças compatíveis fora do kit).
4. **Estado "modelo não catalogado"** — veículos sem match canônico ganham indicador + ação do Gestor para **vincular** modelo existente ou **criar** um novo inline.

### Não-objetivos
- **PRD-032** (criar `IVehicleServiceEntry` automático ao marcar `appliedToVehicleId`) — fora do épico de kits.
- **PRD-071** (tabs do portal B2B, bulk ops) — fora do épico de kits.
- O card "Filtros" das Recomendações de Manutenção **já aplica o kit** (entregue no PRD-035) — nada a fazer.
- Migrar `IApplication` de string para `modelId` — fica para um delta futuro do catálogo.

---

## 2. Modelo de dados

### 2.1 `IVehicle.modelId`
`src/shared/types/customer.ts` — adicionar após `engine`:

```ts
export interface IVehicle {
  id: ID;
  customerId: ID;
  brand: string;
  model: string;
  year: number;
  engine: string;
  /** Canonical model (PRD-034). `null` = "modelo não catalogado" — brand/model/engine
   *  above remain the denormalized display snapshot. */
  modelId: ID | null;
  plate?: string;
  // …restante inalterado
}
```

### 2.2 Seed de modelos exóticos (órfãos genuínos)
**Problema:** `buildCanonicalVehicleModels()` deriva os modelos canônicos do **mesmo** `SEED_VEHICLE_MODELS`. Adicionar exóticos ali os tornaria canônicos (sem órfãos).

**Solução:** novo array **separado** em `seedVehicleModels.ts`, usado **apenas** pelo gerador de veículos (não pelo builder canônico):

```ts
/** Models present in the customer fleet but NOT in the canonical catalog (PRD-034).
 *  Used only by the vehicle generator to exercise the "modelo não catalogado" state.
 *  Brands intentionally outside GALLO's canonical coverage. */
export const SEED_EXOTIC_VEHICLE_MODELS: IVehicleModelEntry[] = [
  { brand: "Volkswagen", model: "Constellation 24.280", engines: ["MAN D08"], yearStart: 2014, yearEnd: 2023 },
  { brand: "MAN", model: "TGX 29.480", engines: ["D26"], yearStart: 2016, yearEnd: 2023 },
  { brand: "DAF", model: "XF 105", engines: ["PACCAR MX-13"], yearStart: 2013, yearEnd: 2021 },
];
```

### 2.3 Linking no gerador
`src/mocks/generators/vehicle.ts` — `generateVehicle`:
- Pool ponderado: `SEED_VEHICLE_MODELS` (peso alto) + `SEED_EXOTIC_VEHICLE_MODELS` (~12%).
- Após sortear `model` e `engine`, computar o id canônico determinístico (mesma regra de `seedVehicleModelsCanonical.slug`): `vmodel-{slug(brand)}-{slug(model)}-{slug(engine)}`.
- Setar `modelId` **só** se esse id existir em `SEED_VEHICLE_MODELS_CANONICAL`; caso contrário `null`.
- Resultado: ~5-8 dos ~60 veículos ficam órfãos (`modelId: null`).

> A função `slug` será extraída/reusada para garantir que o gerador e o builder canônico produzam ids idênticos. Não duplicar a regra de slug.

---

## 3. Lógica de matching (utils puras, testáveis)

### 3.1 `findKitsForVehicle` (swap)
`src/features/model-kits/utils/modelKitMatching.ts`:

```ts
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

- Remove o parâmetro `modelsById`.
- `vehicleMatchesModel` / `normalizeToken` são removidos **se** não houver outro consumidor (verificar via grep no cutover). Atualizar todos os call sites (`MaintenanceRecommendations.tsx` e quaisquer outros).

### 3.2 `findCompatibleParts` (nova)
`src/features/vehicles/utils/compatibleParts.ts` — envolve `searchPartsByApplication` (já existe em `catalog/api/search.ts`):

```ts
export function findCompatibleParts(
  vehicle: IVehicle,
  model: IVehicleModel | null,
  parts: IPart[],
): IPart[] {
  // Authoritative source = canonical model; fallback to the vehicle snapshot for orphans.
  const brand = model?.brand ?? vehicle.brand;
  const modelName = model?.model ?? vehicle.model;
  const engine = model?.engine ?? vehicle.engine;
  return searchPartsByApplication(parts, {
    brand,
    model: modelName,
    engine,
    year: vehicle.year,
  });
}
```

> Match por brand+model+engine+year (within range). Órfãos exóticos → vazio (applications geradas da mesma fonte canônica). Decisão: incluir `year` e `engine` na busca (precisão); afrouxa-se apenas se o resultado ficar consistentemente vazio para modelos catalogados (não esperado).

### 3.3 `splitByKitMembership` (nova)
Reusa o conceito de `modelKitDrift.getCompatiblePartsNotInKit`:

```ts
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

---

## 4. Seção "Peças compatíveis" — 3 modos

Substitui `CompatiblePartsPlaceholder.tsx` (usado em 3 layouts: Bento/Health/Rails). Novo componente `CompatibleParts` + subcomponentes em `src/features/vehicles/components/detail/CompatibleParts/`.

### 4.1 Dados
- `useCompatibleParts(vehicle)` — hook que: resolve o modelo canônico via `useVehicleModels`, busca peças via `usePartsProvider().list({ pageSize })`, aplica `findCompatibleParts`, e resolve o kit oficial `filtros` aplicável via `useModelKits` + `findKitsForVehicle`. Retorna `{ parts, inKit, drift, applicableKit, model, isLoading }`.
- `useCompatiblePartsView()` — UX-pref, persiste o modo em `localStorage` chave `gallo-compat-view` (ecoa `gallo-theme`/`gallo-mode`). Default: **Curadoria**.

### 4.2 Callout do kit (topo da seção)
Quando há kit oficial `filtros` aplicável (em todos os 3 modos):
- Container `bg-primary/10 border border-primary/20 rounded-lg p-3`.
- `mdi:check-decagram` `text-primary` + `KitStatusBadge` (oficial) + `KitCategoryBadge` (filtros) + `KitItemsPreview` (●/○).
- CTA "Ver Kit" (ghost, `mdi:arrow-right`) → navega ao editor do kit.
- Verificar contraste de `text-muted-foreground` sobre `bg-primary/10` (AA 4.5:1); subir para `text-foreground` se falhar.

### 4.3 Seletor de modos
`ToggleGroup` (shadcn, `type="single"`, semântica de radiogroup), tom `muted`, subordinado ao toggle de layout global da página. Em <640px: só ícones + `aria-label` + tooltip.
- **Curadoria** — `mdi:source-branch`
- **Catálogo** — `mdi:format-list-bulleted`
- **Só o Kit** — `mdi:package-variant-closed`

### 4.4 Modo Curadoria (default)
Duas subseções com heading real (`<h4>` `text-xs uppercase tracking-wide text-muted-foreground`):
1. **No Kit oficial** `(N)` — marcador `mdi:check-decagram` `text-primary`.
2. **Compatível, fora do Kit** `(N)` — marcador `mdi:plus-circle-outline` `text-muted-foreground`; chip "Drift" `mdi:source-branch` em `bg-primary/10 border-border` (nunca `destructive` — drift é oportunidade de curadoria, não erro).
Top-12 por subseção + "Ver todas (N)" (ghost, `mdi:chevron-down`). Sem paginação (é preview/curadoria).

### 4.5 Modo Catálogo
Lista completa das peças compatíveis com busca (`searchPartsByText` sobre o slice) + filtro de categoria (`PartCategory`), paginada 20/pág. Mesmo marcador de curadoria por linha.

### 4.6 Modo Só o Kit
Apenas as peças do kit aplicável (`inKit`); se não há kit, empty state "Nenhum kit oficial para este modelo".

### 4.7 Linha de peça (`CompatiblePartRow`)
Grid de colunas alinhadas (não cards), ~44px, `divide-y divide-border`:
```
[marcador 16px] [SKU font-mono text-xs muted] [nome text-sm + KitCategoryBadge] … [marca text-xs muted, oculta <768] [preço text-sm tabular-nums] [ação]
```
- Nome com `truncate` + `title`.
- Ação (`mdi:cart-plus` ou kebab) `opacity-0 group-hover:opacity-100 focus-visible:opacity-100` (sempre focável por teclado; visível no mobile).
- A11y: cada linha comunica no-kit/drift por ícone **e** texto/`aria-label` (WCAG 1.4.1); preço `tabular-nums`.

### 4.8 Loading & empty
- Loading: skeleton de linhas.
- Modelo catalogado sem peças: empty state "Nenhuma peça compatível cadastrada".
- Órfão (`modelId == null`): ver seção 5.

---

## 5. Estado "modelo não catalogado"

### 5.1 Badge no header
`ModelNotCataloguedBadge` — `outline + text-muted-foreground`, `mdi:link-variant-off`, "Modelo não catalogado". Mesma gramática do `KitStatusBadge` rascunho (estado incompleto, não erro; tom âmbar/`primary`, **nunca** `destructive`). Posicionado junto ao nome do modelo no detalhe do veículo.

### 5.2 `LinkModelDialog` (ação do Gestor)
Dialog (shadcn) com escolha binária:
- **Vincular a modelo existente** (`mdi:link-variant`, primário): combobox de busca sobre `useVehicleModels` (filtra por brand/model/engine). Ao confirmar → `useLinkVehicleModel` chama `vehiclesApi.update(id, { modelId })` + `recordAuditLogSync`.
- **Criar novo modelo** (`mdi:plus-box-outline`, secundário): reusa o form + mutation do PRD-034 (`vehicle-models`); ao criar, vincula automaticamente o `modelId` recém-criado ao veículo.

Guard: `hasPermission(user, 'vehicle', 'edit')` (Gestor `edit/store`, Vendedor `edit/own`). Para quem não tem permissão, o badge é informativo e a ação não aparece.

### 5.3 Cards dependentes em órfão
- **"Peças compatíveis":** empty state orientativo (`mdi:package-variant`, muted) — "Vincule ou cadastre o modelo para ver peças compatíveis" + CTA que abre o **mesmo** `LinkModelDialog`. Segmented control oculto nesse estado.
- **Bloco de Kits / callout:** empty state análogo — "Kits são vinculados por modelo. Catalogue o modelo para habilitar." + mesmo CTA.
- Princípio: **um único ponto de resolução** repetido (header, peças, kits), todos abrindo o mesmo diálogo.

---

## 6. RBAC & auditoria

- **Sem novo resource.** Reusa `vehicle` (já no matrix: Gestor `CRUD/store`, Vendedor `["view","edit"]/own`, etc.).
- Vincular/criar exige `vehicle:edit`.
- `recordAuditLogSync` em: vincular modelo ao veículo (`vehicle:edit`) e criar modelo (o fluxo PRD-034 já audita `vehicleModel:create`).

---

## 7. Estrutura de arquivos

**Modificar:**
- `src/shared/types/customer.ts` — `+ modelId: ID | null`.
- `src/mocks/data/seedVehicleModels.ts` — `+ SEED_EXOTIC_VEHICLE_MODELS`.
- `src/mocks/data/seedVehicleModelsCanonical.ts` — exportar `slug` para reuso (ou extrair para util compartilhada).
- `src/mocks/generators/vehicle.ts` — linking determinístico de `modelId`.
- `src/features/model-kits/utils/modelKitMatching.ts` — swap para `modelId`.
- `src/features/vehicles/components/detail/MaintenanceRecommendations.tsx` — remover arg `modelsById` do call site.
- `src/features/vehicles/components/detail/layouts/VehicleLayout{Bento,Health,Rails}.tsx` — placeholder → `CompatibleParts`.
- `src/features/vehicles/i18n/pt-BR.ts` — strings das novas superfícies.

**Criar:**
- `src/features/vehicles/utils/compatibleParts.ts` — `findCompatibleParts`, `splitByKitMembership`.
- `src/features/vehicles/hooks/useCompatibleParts.ts`
- `src/features/vehicles/hooks/useCompatiblePartsView.ts` — UX-pref `gallo-compat-view`.
- `src/features/vehicles/hooks/useLinkVehicleModel.ts` — mutation vincular + audit.
- `src/features/vehicles/components/detail/CompatibleParts/` — `CompatibleParts.tsx` (orquestra), `KitCallout.tsx`, `CompatiblePartsModeToggle.tsx`, `CompatiblePartRow.tsx`, `CuradoriaView.tsx`, `CatalogoView.tsx`, `KitOnlyView.tsx`, `CompatiblePartsEmpty.tsx`.
- `src/features/vehicles/components/detail/ModelNotCataloguedBadge.tsx`
- `src/features/vehicles/components/detail/LinkModelDialog.tsx`

**Remover (cutover):**
- `src/features/vehicles/components/detail/CompatiblePartsPlaceholder.tsx`

---

## 8. Limitações conhecidas (intencionais)

- `IApplication` continua string-based (PRD-030 não tem `modelId`); o match das peças usa brand+model+engine do modelo canônico. Migração `applications`→`modelId` fica fora deste delta.
- Órfãos exóticos não têm peças compatíveis (applications geradas da mesma fonte canônica) — coerente com "não catalogado".
- O combobox de "vincular existente" lista todo o catálogo canônico; sem ranking de sugestão por proximidade de string (YAGNI no MVP).

---

## 9. Verificação (gates do repo)

- **Tipos:** `bunx tsc --noEmit` filtrado pelos arquivos do delta = **vazio** (erros pré-existentes ignorados).
- **Build:** `bun run build` → exit 0.
- **Lint por arquivo:** `bunx prettier --check` (ignorar falso-positivo de CRLF em arquivos pré-existentes).
- **Lógica pura:** scripts `bun` descartáveis (`scripts/_check_*.ts`) para `findCompatibleParts`, `splitByKitMembership`, `findKitsForVehicle`, e o linking do gerador (contagem de órfãos). Removidos no mesmo commit.
- **UI:** validada manualmente pelo usuário (sem test runner no projeto).
