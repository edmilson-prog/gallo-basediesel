# Vehicle Detail Layout Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redistribuir os elementos do detalhamento do veículo (`/app/veiculos/$id`) para usar bem a largura em telas largas, eliminando o espaço lateral morto.

**Architecture:** Container unificado `max-w-7xl` (header + corpo no mesmo trilho); Dados Técnicos vira uma faixa de stats full-width; corpo em bento de 12 colunas (8 trabalho / 4 contexto sticky); empty-state do histórico enriquecido; header com hierarquia.

**Tech Stack:** React + TanStack Router + Tailwind v4 + shadcn/ui (new-york). Iconify via `@/components/Icon`. Sem suíte de testes — gate de verificação é `bun run build` + `bunx eslint`. Validação visual é manual (usuário).

**Spec:** `docs/superpowers/specs/2026-05-29-vehicle-detail-layout-design.md`

**Convenção de verificação (todas as tasks):**
- Lint do(s) arquivo(s) tocado(s): `bunx eslint <arquivo>` → esperado: sem erros.
- Build completo só na Task 7 (gate real): `bun run build` → esperado: "built in …", exit 0.
- NÃO commitar até a Task 7 e somente com confirmação do usuário (regra do CLAUDE.md global).

---

## File Structure

| Arquivo | Responsabilidade após a mudança |
|---|---|
| `src/features/vehicles/i18n/pt-BR.ts` | +2 strings no bloco `detail.history` (CTA e dica do empty-state). |
| `src/features/vehicles/components/detail/VehicleTechSpecs.tsx` | `dl` de cards → **faixa de stats** com hairlines; `SpecRow` → `StatCell`. |
| `src/features/vehicles/components/detail/ServiceHistoryTimeline.tsx` | Empty-state com nós fantasma + CTA; novas props `canEdit`/`onAddService`. |
| `src/features/vehicles/components/detail/VehicleDetailHeader.tsx` | Trilho interno `max-w-7xl` + hierarquia (placa-chip, badge ao lado do título, ícone tintado). |
| `src/features/vehicles/pages/VehicleDetailPage.tsx` | Container `max-w-7xl`, ordem (banner → faixa → bento), bento 12-col, fiação das props do histórico. |
| `src/features/vehicles/components/detail/MaintenanceRecommendations.tsx` | Ritmo de padding `px-4 py-3` (polimento). |
| `src/features/vehicles/components/detail/VehicleOwnerCard.tsx` | Ritmo de padding `px-4 py-3` (polimento). |
| `src/features/vehicles/components/detail/CompatiblePartsPlaceholder.tsx` | Ritmo de padding `px-4 py-3` (polimento). |

---

### Task 1: Strings i18n do empty-state

**Files:**
- Modify: `src/features/vehicles/i18n/pt-BR.ts:116-120` (bloco `detail.history`)

- [ ] **Step 1: Adicionar as 2 strings**

Substituir o bloco `history` atual:

```ts
    history: {
      empty: "Sem manutenções registradas para este veículo.",
      derivedFromOrder: "Derivado do pedido",
      view: "Ver pedido",
    },
```

por:

```ts
    history: {
      empty: "Sem manutenções registradas para este veículo.",
      emptyCta: "Registrar manutenção",
      emptyAutoHint: "O histórico também é preenchido automaticamente a partir de pedidos.",
      derivedFromOrder: "Derivado do pedido",
      view: "Ver pedido",
    },
```

- [ ] **Step 2: Lint**

Run: `bunx eslint src/features/vehicles/i18n/pt-BR.ts`
Expected: sem erros.

---

### Task 2: Dados Técnicos → faixa de stats

**Files:**
- Modify: `src/features/vehicles/components/detail/VehicleTechSpecs.tsx`

- [ ] **Step 1: Remover o import não usado de `SECTION_COPY`**

Remover esta linha (a faixa não tem mais título de seção):

```ts
const SECTION_COPY = VEHICLE_STRINGS.detail.sections;
```

- [ ] **Step 2: Trocar o `return` (linhas 84-182) para a faixa**

Substituir todo o JSX retornado pelo componente (do `return (` até o fechamento `);` antes da função `SpecRow`) por:

```tsx
  return (
    <>
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-3 lg:grid-cols-5">
        <StatCell label={COPY.engine} value={vehicle.engine || "—"} />
        <StatCell
          label={COPY.vin}
          value={
            vehicle.vin ? (
              <span className="inline-flex items-center gap-2 font-mono">
                <span>{revealVin ? vehicle.vin : maskVin(vehicle.vin)}</span>
                <button
                  type="button"
                  onClick={() => setRevealVin((v) => !v)}
                  className="text-xs text-primary hover:underline"
                >
                  {revealVin ? COPY.vinHide : COPY.vinReveal}
                </button>
              </span>
            ) : (
              "—"
            )
          }
        />
        <StatCell label={COPY.plate} value={formatPlate(vehicle.plate)} mono />
        <StatCell
          label={COPY.currentKm}
          value={
            editingKm ? (
              <div className="flex items-center gap-1.5">
                <Input
                  type="number"
                  value={kmDraft}
                  onChange={(e) => setKmDraft(e.target.value)}
                  className="h-7 w-28 text-xs"
                  autoFocus
                />
                <Button size="sm" variant="ghost" disabled={busy} onClick={handleSave}>
                  {COPY.save}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => setEditingKm(false)}
                >
                  {COPY.cancel}
                </Button>
              </div>
            ) : (
              <div className="inline-flex items-center gap-2">
                <span className="tabular-nums">{formatKm(vehicle.currentKm)}</span>
                {canEdit && (
                  <button
                    type="button"
                    onClick={startEdit}
                    className="text-xs text-primary hover:underline"
                  >
                    <Icon icon="mdi:pencil" size={12} className="-mt-0.5 inline" /> {COPY.updateKm}
                  </button>
                )}
              </div>
            )
          }
        />
        <StatCell label={COPY.createdAt} value={formatDateBR(vehicle.createdAt)} />
      </dl>

      <AlertDialog open={confirmLarge} onOpenChange={setConfirmLarge}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar mudança grande?</AlertDialogTitle>
            <AlertDialogDescription>{COPY.largeKmChange}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setConfirmLarge(false);
                setPendingKm(null);
              }}
            >
              {COPY.cancel}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmLarge(false);
                if (pendingKm !== null) void saveKm(pendingKm);
                setPendingKm(null);
              }}
            >
              {COPY.confirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
```

- [ ] **Step 3: Substituir `SpecRow` por `StatCell`**

Substituir a função `SpecRow` (linhas 185-204) por:

```tsx
function StatCell({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="bg-card px-4 py-3">
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className={`mt-1 text-sm text-foreground ${mono ? "font-mono uppercase" : ""}`}>
        {value}
      </dd>
    </div>
  );
}
```

- [ ] **Step 4: Lint**

Run: `bunx eslint src/features/vehicles/components/detail/VehicleTechSpecs.tsx`
Expected: sem erros (sem variáveis/imports não usados).

---

### Task 3: Empty-state do histórico com nós fantasma + CTA

**Files:**
- Modify: `src/features/vehicles/components/detail/ServiceHistoryTimeline.tsx`

- [ ] **Step 1: Importar `Button`**

Após a linha `import { Badge } from "@/components/ui/badge";` adicionar:

```ts
import { Button } from "@/components/ui/button";
```

- [ ] **Step 2: Estender as props com `canEdit`/`onAddService`**

Substituir a interface:

```ts
export interface IServiceHistoryTimelineProps {
  vehicle: IVehicle;
}
```

por:

```ts
export interface IServiceHistoryTimelineProps {
  vehicle: IVehicle;
  canEdit?: boolean;
  onAddService?: () => void;
}
```

E a assinatura do componente:

```ts
export function ServiceHistoryTimeline({ vehicle }: IServiceHistoryTimelineProps) {
```

por:

```ts
export function ServiceHistoryTimeline({
  vehicle,
  canEdit,
  onAddService,
}: IServiceHistoryTimelineProps) {
```

- [ ] **Step 3: Trocar o bloco do empty-state**

Substituir o bloco do empty-state (o ramo `sorted.length === 0 ? (...)`):

```tsx
        <div className="flex flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border bg-muted/20 px-4 py-6 text-center">
          <Icon icon="mdi:wrench-clock" size={20} className="text-muted-foreground" />
          <p className="text-xs text-muted-foreground">{COPY.empty}</p>
        </div>
```

por:

```tsx
        <div className="rounded-md border border-dashed border-border bg-muted/20 px-5 py-5">
          <ol className="mb-4 space-y-3 border-l border-border pl-4">
            {[0, 1, 2].map((i) => (
              <li key={i} className="relative">
                <span className="absolute -left-[21px] top-0.5 h-3 w-3 rounded-full border border-border bg-muted/50" />
                <div className="space-y-1.5">
                  <div className="h-2.5 w-2/5 rounded bg-foreground/[0.06]" />
                  <div className="h-2.5 w-3/5 rounded bg-foreground/[0.03]" />
                </div>
              </li>
            ))}
          </ol>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="max-w-sm text-xs text-muted-foreground">{COPY.emptyAutoHint}</p>
            {canEdit && onAddService && (
              <Button size="sm" onClick={onAddService}>
                <Icon icon="mdi:wrench" size={14} />
                {COPY.emptyCta}
              </Button>
            )}
          </div>
        </div>
```

- [ ] **Step 4: Lint**

Run: `bunx eslint src/features/vehicles/components/detail/ServiceHistoryTimeline.tsx`
Expected: sem erros.

---

### Task 4: Header com trilho e hierarquia

**Files:**
- Modify: `src/features/vehicles/components/detail/VehicleDetailHeader.tsx`

- [ ] **Step 1: Substituir o JSX retornado (linhas 23-68)**

Substituir o `return (...)` inteiro por:

```tsx
  return (
    <div className="border-b border-border bg-card">
      <div className="mx-auto w-full max-w-7xl px-4 py-4 sm:px-6">
        <Link
          to="/app/veiculos"
          className="mb-3 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <Icon icon="mdi:arrow-left" size={14} />
          {VEHICLE_STRINGS.detail.backToList}
        </Link>
        <div className="flex flex-wrap items-start gap-4">
          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
            <Icon icon={iconForBrand(vehicle.brand)} size={28} />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="flex flex-wrap items-center gap-2 text-lg font-semibold text-foreground sm:text-xl">
              <span>
                {vehicle.brand} {vehicle.model}{" "}
                <span className="text-base font-normal text-muted-foreground">
                  · {vehicle.year}
                </span>
              </span>
              <Badge
                variant="outline"
                className={cn("text-xs", STATUS_BADGE_CLASSES[vehicle.cadastroStatus])}
              >
                {STATUS_LABEL[vehicle.cadastroStatus]}
              </Badge>
            </h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span className="rounded border border-border bg-muted px-1.5 font-mono uppercase text-foreground">
                {vehicle.plate ?? "—"}
              </span>
              <span aria-hidden>·</span>
              <span>{vehicle.engine || "—"}</span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {canEdit && (
              <>
                <Button variant="outline" size="sm" onClick={onEdit}>
                  <Icon icon="mdi:pencil" size={14} />
                  {VEHICLE_STRINGS.detail.edit}
                </Button>
                <Button size="sm" onClick={onAddService}>
                  <Icon icon="mdi:wrench" size={14} />
                  {VEHICLE_STRINGS.detail.addService}
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
```

- [ ] **Step 2: Lint**

Run: `bunx eslint src/features/vehicles/components/detail/VehicleDetailHeader.tsx`
Expected: sem erros.

---

### Task 5: Página — container 7xl, ordem e bento 12-col

**Files:**
- Modify: `src/features/vehicles/pages/VehicleDetailPage.tsx:111-134`

- [ ] **Step 1: Substituir o bloco do corpo**

Substituir o bloco (do `<div className="mx-auto w-full max-w-5xl ...">` até o `</div>` que fecha esse container — linhas 111-134):

```tsx
      <div className="mx-auto w-full max-w-5xl space-y-6 px-4 py-6">
        <VehicleStatusBanner
          vehicle={vehicle}
          canApprove={canApprove}
          onApprove={() => void handleApprove()}
          onReject={() => setRejectOpen(true)}
        />

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <VehicleTechSpecs
              vehicle={vehicle}
              canEdit={canEdit}
              onUpdated={() => void detail.invalidate()}
            />
            <ServiceHistoryTimeline vehicle={vehicle} />
            <MaintenanceRecommendations vehicle={vehicle} />
          </div>
          <div className="space-y-6">
            <VehicleOwnerCard customerId={vehicle.customerId} />
            <CompatiblePartsPlaceholder vehicle={vehicle} />
          </div>
        </div>
      </div>
```

por:

```tsx
      <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-6 sm:px-6">
        <VehicleStatusBanner
          vehicle={vehicle}
          canApprove={canApprove}
          onApprove={() => void handleApprove()}
          onReject={() => setRejectOpen(true)}
        />

        <VehicleTechSpecs
          vehicle={vehicle}
          canEdit={canEdit}
          onUpdated={() => void detail.invalidate()}
        />

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="space-y-6 lg:col-span-8">
            <ServiceHistoryTimeline
              vehicle={vehicle}
              canEdit={canEdit}
              onAddService={() => setServiceOpen(true)}
            />
            <MaintenanceRecommendations vehicle={vehicle} />
          </div>
          <aside className="space-y-6 lg:sticky lg:top-6 lg:col-span-4 lg:self-start">
            <VehicleOwnerCard customerId={vehicle.customerId} />
            <CompatiblePartsPlaceholder vehicle={vehicle} />
          </aside>
        </div>
      </div>
```

- [ ] **Step 2: Lint**

Run: `bunx eslint src/features/vehicles/pages/VehicleDetailPage.tsx`
Expected: sem erros.

---

### Task 6: Ritmo de padding (polimento)

**Files:**
- Modify: `src/features/vehicles/components/detail/VehicleOwnerCard.tsx:48`
- Modify: `src/features/vehicles/components/detail/CompatiblePartsPlaceholder.tsx:34`
- Modify: `src/features/vehicles/components/detail/MaintenanceRecommendations.tsx:42`

- [ ] **Step 1: Owner card padding**

Em `VehicleOwnerCard.tsx`, no `<Link>` do card, trocar `px-3 py-3` por `px-4 py-3`:

```tsx
        className="flex items-center gap-3 rounded-md border border-border bg-card px-4 py-3 hover:border-primary/30"
```

- [ ] **Step 2: Compatible parts container padding**

Em `CompatiblePartsPlaceholder.tsx`, no container tracejado, trocar `px-4 py-3` por `px-4 py-4` (respiro vertical):

```tsx
      <div className="rounded-md border border-dashed border-border bg-muted/20 px-4 py-4">
```

- [ ] **Step 3: Recommendations card padding**

Em `MaintenanceRecommendations.tsx`, no `<li>` de cada recomendação, garantir `px-4 py-3` (hoje `px-3 py-3`):

```tsx
                className={cn(
                  "rounded-md border bg-card px-4 py-3",
                  isOverdue
                    ? "border-destructive/30 bg-destructive/5"
                    : "border-amber-500/30 bg-amber-500/5",
                )}
```

- [ ] **Step 4: Lint dos 3 arquivos**

Run: `bunx eslint src/features/vehicles/components/detail/VehicleOwnerCard.tsx src/features/vehicles/components/detail/CompatiblePartsPlaceholder.tsx src/features/vehicles/components/detail/MaintenanceRecommendations.tsx`
Expected: sem erros.

---

### Task 7: Verificação final + commit

**Files:** nenhum (gate + commit).

- [ ] **Step 1: Build completo (gate real)**

Run: `bun run build`
Expected: termina com "built in …" e exit code 0 (vite + tsc noEmit sem novos erros nos arquivos tocados).

- [ ] **Step 2: Lint de todos os arquivos tocados**

Run:
```bash
bunx eslint src/features/vehicles/i18n/pt-BR.ts src/features/vehicles/components/detail/VehicleTechSpecs.tsx src/features/vehicles/components/detail/ServiceHistoryTimeline.tsx src/features/vehicles/components/detail/VehicleDetailHeader.tsx src/features/vehicles/pages/VehicleDetailPage.tsx src/features/vehicles/components/detail/VehicleOwnerCard.tsx src/features/vehicles/components/detail/CompatiblePartsPlaceholder.tsx src/features/vehicles/components/detail/MaintenanceRecommendations.tsx
```
Expected: sem erros.

- [ ] **Step 3: Validação visual manual (usuário)**

Pedir ao usuário para abrir `/app/veiculos/<id>` e confirmar: sem espaço lateral morto, header alinhado ao corpo, faixa de stats com divisórias, bento 8/4 com rail sticky, empty-state do histórico com nós fantasma + botão, edição inline de Km e revelar VIN funcionando. NÃO abrir browser/preview automaticamente.

- [ ] **Step 4: Commit (somente após OK do usuário)**

```bash
git add src/features/vehicles/i18n/pt-BR.ts src/features/vehicles/components/detail/VehicleTechSpecs.tsx src/features/vehicles/components/detail/ServiceHistoryTimeline.tsx src/features/vehicles/components/detail/VehicleDetailHeader.tsx src/features/vehicles/pages/VehicleDetailPage.tsx src/features/vehicles/components/detail/VehicleOwnerCard.tsx src/features/vehicles/components/detail/CompatiblePartsPlaceholder.tsx src/features/vehicles/components/detail/MaintenanceRecommendations.tsx
git commit -m "feat(vehicles): redistribute detail page layout into 12-col bento with stat strip"
```

---

## Self-Review

**1. Spec coverage:**
- max-w-7xl unificado → Task 4 (header) + Task 5 (corpo). ✓
- Header hierarquia (placa-chip, badge, ícone tintado) → Task 4. ✓
- Faixa de stats → Task 2. ✓
- Bento 12-col + ordem (banner → faixa → bento) → Task 5. ✓
- Empty-state histórico (nós fantasma + CTA + dica) → Task 1 (strings) + Task 3. ✓
- Ritmo de padding → Task 6. ✓
- Strings i18n → Task 1. ✓

**2. Placeholder scan:** Nenhum "TBD/TODO"; todo passo de código mostra o código completo. ✓

**3. Type/nome consistency:**
- `StatCell` definido na Task 2 e usado só na Task 2. ✓
- `COPY.emptyCta` / `COPY.emptyAutoHint` criados na Task 1, usados na Task 3. ✓
- Props `canEdit`/`onAddService` definidas na Task 3 e passadas na Task 5 com os mesmos nomes. ✓
- `onAddService={() => setServiceOpen(true)}` — `serviceOpen`/`setServiceOpen` já existem na página (linha 44). ✓
