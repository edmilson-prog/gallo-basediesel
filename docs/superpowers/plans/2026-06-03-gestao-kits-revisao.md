# Tela de gestão de kits de revisão — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar a Owner/Gestor uma tela para criar, editar, duplicar e excluir kits de revisão (`IServiceKit`), com 3 UX selecionáveis (página/dialog/drawer), refletindo no `KitPicker` do editor de orçamento.

**Architecture:** Nova feature `src/features/service-kits/` consumindo o provider `serviceKits` estendido com escrita (mock in-memory via array mutável de módulo + TanStack Query/invalidação). Um único `KitForm` reusado em 3 cascas. RBAC via novo resource `serviceKit`. Rotas dentro de `/app/catalogo/kits`.

**Tech Stack:** React 19 + TS strict, TanStack Router/Query, Tailwind v4 + shadcn/ui, react-hook-form + zod, sonner, Iconify (`mdi:*`), Bun.

**Spec:** `docs/superpowers/specs/2026-06-03-gestao-kits-revisao-design.md`

## Convenções de gate (NÃO há test runner)

- **Tipos (gate real):** `bunx tsc --noEmit 2>&1 | grep -iE "<arquivos da task>"` deve ser **vazio**. NUNCA confiar em `bun run build` (não type-checa).
- **Lint por-arquivo:** `bunx prettier --check <file>` + `bunx eslint <file>`. O lint global tem ~milhares de falsos-positivos CRLF (`prettier/prettier Delete ␍`) — ignorar SÓ esses; qualquer outro erro é real.
- **Lógica pura:** script descartável `scripts/_check_<x>.ts` rodado com `bun scripts/_check_<x>.ts`, depois **deletado** no mesmo commit (não fica no repo).
- **CRLF:** se `src/routeTree.gen.ts` aparecer modificado, descartar com `git checkout -- src/routeTree.gen.ts`. É gerado pelo plugin; não editar à mão (ele se regenera ao rodar o dev/build).
- **Não trocar de branch** dentro de subagentes; não rodar `git checkout`/`stash` de branch.

## File Structure

**Criar:**
- `src/features/service-kits/types.ts` — `KitUxMode`, re-export de input types.
- `src/features/service-kits/utils/kitValidation.ts` — schema zod + helper.
- `src/features/service-kits/utils/kitUsageMock.ts` — contagem determinística semeada.
- `src/features/service-kits/hooks/useServiceKits.ts` — query da lista.
- `src/features/service-kits/hooks/useServiceKitMutations.ts` — create/update/remove/duplicate + invalidate + toast.
- `src/features/service-kits/hooks/useServiceKitFormPrefs.ts` — preferência de UX (localStorage).
- `src/features/service-kits/components/KitItemBuilder.tsx` — busca de peça + itens + qtd.
- `src/features/service-kits/components/KitForm.tsx` — núcleo único do formulário.
- `src/features/service-kits/components/KitFormDialog.tsx` — casca dialog.
- `src/features/service-kits/components/KitFormDrawer.tsx` — casca drawer (Sheet).
- `src/features/service-kits/components/KitUxToggle.tsx` — toggle de 3 modos.
- `src/features/service-kits/components/KitsTable.tsx` — tabela da lista.
- `src/features/service-kits/components/DeleteKitDialog.tsx` — AlertDialog de exclusão.
- `src/features/service-kits/pages/ServiceKitsListPage.tsx` — página da lista.
- `src/features/service-kits/pages/ServiceKitFormPage.tsx` — casca página (rotas novo/editar).
- `src/features/service-kits/index.ts` — barrel da feature.
- `src/routes/app.catalogo.kits.tsx` — wrapper `<Outlet>` + guard.
- `src/routes/app.catalogo.kits.index.tsx` — lista.
- `src/routes/app.catalogo.kits.novo.tsx` — criar (modo página).
- `src/routes/app.catalogo.kits.$id.editar.tsx` — editar (modo página).

**Modificar:**
- `src/mocks/api/serviceKits.ts` — store mutável + create/update/remove/duplicate.
- `src/providers/data/contracts/serviceKits.ts` — estender interface + `ICreateServiceKitInput`.
- `src/providers/data/impl/mock/serviceKits.ts` — delegar novas ops.
- `src/providers/data/impl/supabase/serviceKits.ts` — stubs das novas ops.
- `src/providers/data/index.ts` — re-export de `ICreateServiceKitInput`.
- `src/features/rbac/permissions/resources.ts` — add `"serviceKit"`.
- `src/features/rbac/permissions/matrix.ts` — entradas Owner/Gestor.
- `src/features/shell/config/routes.ts` — constante `APP_CATALOGO_KITS`.
- `src/features/shell/config/navigation.ts` — item de menu.

---

### Task 1: Mock API de escrita (store mutável + CRUD)

**Files:**
- Modify: `src/mocks/api/serviceKits.ts`
- Test (throwaway): `scripts/_check_servicekits_api.ts`

- [ ] **Step 1: Reescrever o mock api com store mutável e operações de escrita**

Substituir TODO o conteúdo de `src/mocks/api/serviceKits.ts` por:

```ts
import type { ID, IServiceKit, IServiceKitItem, PartCategory } from "@/shared/types";
import { SEED_SERVICE_KITS } from "../data/seedServiceKits";
import { MockNotFoundError, MockValidationError, runApi } from "./utils";

export interface IListServiceKitsParams {
  storeId?: ID;
}

export interface ICreateServiceKitInput {
  storeId: ID;
  name: string;
  description?: string;
  vehicleApplication?: { brand: string; model: string };
  category?: PartCategory;
  items: IServiceKitItem[];
}

// In-memory store seeded from SEED_SERVICE_KITS. Kits are NOT part of the
// bootstrapped Zustand dataset, so a module-level mutable array is the simplest
// backing store; TanStack Query invalidation drives UI refresh. Writes persist
// for the session and reset on reload (Fase 1 mock semantics).
let kits: IServiceKit[] = SEED_SERVICE_KITS.map((k) => ({ ...k, items: [...k.items] }));

let createdSeq = 0;
function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 32);
}
function nextId(name: string): ID {
  createdSeq += 1;
  return `kit-${slugify(name) || "kit"}-${createdSeq}`;
}

function validate(input: Pick<ICreateServiceKitInput, "name" | "items">): void {
  if (!input.name || !input.name.trim()) {
    throw new MockValidationError("O nome do kit é obrigatório.", "name");
  }
  if (!input.items || input.items.length === 0) {
    throw new MockValidationError("O kit precisa de ao menos uma peça.", "items");
  }
  for (const it of input.items) {
    if (!Number.isInteger(it.quantity) || it.quantity < 1) {
      throw new MockValidationError("Quantidade deve ser um inteiro ≥ 1.", "items");
    }
  }
}

export const serviceKitsApi = {
  list(params: IListServiceKitsParams = {}): Promise<IServiceKit[]> {
    return runApi(
      "serviceKitsApi",
      "list",
      () => {
        let all = kits;
        if (params.storeId) all = all.filter((k) => k.storeId === params.storeId);
        return all.map((k) => ({ ...k, items: [...k.items] }));
      },
      { payload: params },
    );
  },

  create(input: ICreateServiceKitInput): Promise<IServiceKit> {
    return runApi("serviceKitsApi", "create", () => {
      validate(input);
      const kit: IServiceKit = {
        id: nextId(input.name),
        storeId: input.storeId,
        name: input.name.trim(),
        description: input.description?.trim() || undefined,
        vehicleApplication: input.vehicleApplication,
        category: input.category,
        items: input.items.map((i) => ({ ...i })),
      };
      kits = [...kits, kit];
      return { ...kit, items: [...kit.items] };
    });
  },

  update(id: ID, patch: Partial<ICreateServiceKitInput>): Promise<IServiceKit> {
    return runApi("serviceKitsApi", "update", () => {
      const index = kits.findIndex((k) => k.id === id);
      if (index === -1) throw new MockNotFoundError("serviceKit", id);
      const current = kits[index];
      const merged: IServiceKit = {
        ...current,
        ...("name" in patch ? { name: (patch.name ?? "").trim() } : {}),
        ...("description" in patch
          ? { description: patch.description?.trim() || undefined }
          : {}),
        ...("vehicleApplication" in patch
          ? { vehicleApplication: patch.vehicleApplication }
          : {}),
        ...("category" in patch ? { category: patch.category } : {}),
        ...("items" in patch ? { items: (patch.items ?? []).map((i) => ({ ...i })) } : {}),
      };
      validate({ name: merged.name, items: merged.items });
      kits = kits.map((k, i) => (i === index ? merged : k));
      return { ...merged, items: [...merged.items] };
    });
  },

  remove(id: ID): Promise<void> {
    return runApi("serviceKitsApi", "remove", () => {
      const exists = kits.some((k) => k.id === id);
      if (!exists) throw new MockNotFoundError("serviceKit", id);
      kits = kits.filter((k) => k.id !== id);
      return undefined;
    });
  },

  duplicate(id: ID): Promise<IServiceKit> {
    return runApi("serviceKitsApi", "duplicate", () => {
      const source = kits.find((k) => k.id === id);
      if (!source) throw new MockNotFoundError("serviceKit", id);
      const copy: IServiceKit = {
        ...source,
        id: nextId(`${source.name} copia`),
        name: `${source.name} (cópia)`,
        items: source.items.map((i) => ({ ...i })),
      };
      kits = [...kits, copy];
      return { ...copy, items: [...copy.items] };
    });
  },
};
```

> Nota: confirmar que `MockNotFoundError` e `MockValidationError` são exportados por `src/mocks/api/utils` (são usados por `expenses.ts` via `from "./utils"`). Se `MockNotFoundError` exigir um label específico, seguir a assinatura usada em `expenses.ts` (`new MockNotFoundError("expense", id)`).

- [ ] **Step 2: Escrever o script de verificação descartável**

Criar `scripts/_check_servicekits_api.ts`:

```ts
import { serviceKitsApi } from "../src/mocks/api/serviceKits";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error("FAIL: " + msg);
  console.log("ok - " + msg);
}

const base = await serviceKitsApi.list();
assert(base.length >= 3, "seed lista >= 3 kits");

const created = await serviceKitsApi.create({
  storeId: "store-matriz",
  name: "Teste Kit",
  items: [{ partId: "part-x", quantity: 2 }],
});
assert(created.id.startsWith("kit-teste-kit-"), "create gera id com slug: " + created.id);
assert((await serviceKitsApi.list()).length === base.length + 1, "create cresce a lista");

const updated = await serviceKitsApi.update(created.id, { name: "Renomeado" });
assert(updated.name === "Renomeado", "update altera nome");

const dup = await serviceKitsApi.duplicate(created.id);
assert(dup.name === "Renomeado (cópia)", "duplicate sufixa (cópia): " + dup.name);
assert(dup.id !== created.id, "duplicate gera novo id");

await serviceKitsApi.remove(created.id);
assert(!(await serviceKitsApi.list()).some((k) => k.id === created.id), "remove apaga");

let threw = false;
try {
  await serviceKitsApi.create({ storeId: "s", name: "", items: [] });
} catch {
  threw = true;
}
assert(threw, "create vazio lança erro de validação");

console.log("ALL PASS");
```

- [ ] **Step 3: Rodar o script e confirmar que passa**

Run: `bun scripts/_check_servicekits_api.ts`
Expected: termina com `ALL PASS` (e linhas `ok - …`).

- [ ] **Step 4: Type-check filtrado**

Run: `bunx tsc --noEmit 2>&1 | grep -iE "serviceKits"`
Expected: vazio (zero erros nos arquivos tocados).

- [ ] **Step 5: Lint e remover o script descartável, depois commit**

```bash
bunx prettier --check src/mocks/api/serviceKits.ts
bunx eslint src/mocks/api/serviceKits.ts
rm scripts/_check_servicekits_api.ts
git add src/mocks/api/serviceKits.ts
git commit -m "feat(service-kits): add write operations to the mock api"
```
Expected: prettier ok; eslint sem erros reais (só falsos CRLF, se houver).

---

### Task 2: Provider — contract, impls, factory, barrel

**Files:**
- Modify: `src/providers/data/contracts/serviceKits.ts`
- Modify: `src/providers/data/impl/mock/serviceKits.ts`
- Modify: `src/providers/data/impl/supabase/serviceKits.ts`
- Modify: `src/providers/data/index.ts`

- [ ] **Step 1: Estender o contract**

Substituir o conteúdo de `src/providers/data/contracts/serviceKits.ts` por:

```ts
import type { ID, IServiceKit, IServiceKitItem, PartCategory } from "@/shared/types";

export interface IListServiceKitsParams {
  storeId?: ID;
}

export interface ICreateServiceKitInput {
  storeId: ID;
  name: string;
  description?: string;
  vehicleApplication?: { brand: string; model: string };
  category?: PartCategory;
  items: IServiceKitItem[];
}

/**
 * Contract for revision kits. `list` is read-only consumed by the quote editor;
 * the write operations back the management screen (issue #24).
 *
 * @see ../../../mocks/api/serviceKits.ts
 * @see ../../../../docs/provider-pattern.md
 */
export interface IServiceKitsProvider {
  list(params?: IListServiceKitsParams): Promise<IServiceKit[]>;
  create(input: ICreateServiceKitInput): Promise<IServiceKit>;
  update(id: ID, patch: Partial<ICreateServiceKitInput>): Promise<IServiceKit>;
  remove(id: ID): Promise<void>;
  duplicate(id: ID): Promise<IServiceKit>;
}
```

- [ ] **Step 2: Atualizar a impl mock**

Substituir `src/providers/data/impl/mock/serviceKits.ts` por:

```ts
import { serviceKitsApi } from "@/mocks";
import type { IServiceKitsProvider } from "../../contracts/serviceKits";

export const mockServiceKitsProvider: IServiceKitsProvider = {
  list: (params) => serviceKitsApi.list(params),
  create: (input) => serviceKitsApi.create(input),
  update: (id, patch) => serviceKitsApi.update(id, patch),
  remove: (id) => serviceKitsApi.remove(id),
  duplicate: (id) => serviceKitsApi.duplicate(id),
};
```

> Confirmar que `serviceKitsApi.create/update/remove/duplicate` estão exportados pelo barrel `@/mocks` (o `serviceKitsApi` já é exportado por ali; os novos métodos vêm junto). Se `@/mocks` re-exporta tipos de api, garantir que `ICreateServiceKitInput` do contract é a fonte usada pelo provider (o da api tem o mesmo shape; manter os dois idênticos).

- [ ] **Step 3: Atualizar o stub Supabase**

Substituir `src/providers/data/impl/supabase/serviceKits.ts` por:

```ts
import { NotImplementedError } from "../../errors";
import type { IServiceKitsProvider } from "../../contracts/serviceKits";

const stub = (method: string) => () => {
  throw new NotImplementedError(
    `SupabaseServiceKitsProvider.${method} — implementar quando kits forem persistidos no Supabase (CRUD deferido).`,
  );
};

export const supabaseServiceKitsProvider: IServiceKitsProvider = {
  list: stub("list"),
  create: stub("create"),
  update: stub("update"),
  remove: stub("remove"),
  duplicate: stub("duplicate"),
};
```

- [ ] **Step 4: Re-exportar o input type no barrel**

Em `src/providers/data/index.ts`, localizar onde os tipos de contract são re-exportados (ex.: a linha que exporta de `./contracts/serviceKits` ou um bloco de `export type {…} from "./contracts/…"`). Adicionar/garantir:

```ts
export type {
  IServiceKitsProvider,
  IListServiceKitsParams,
  ICreateServiceKitInput,
} from "./contracts/serviceKits";
```

Se já existir uma export de `./contracts/serviceKits`, apenas acrescentar `ICreateServiceKitInput` (e `IListServiceKitsParams` se ausente) à lista, sem duplicar a linha.

- [ ] **Step 5: Type-check + lint + commit**

```bash
bunx tsc --noEmit 2>&1 | grep -iE "serviceKits|providers/data/index"
```
Expected: vazio.

```bash
bunx prettier --check src/providers/data/contracts/serviceKits.ts src/providers/data/impl/mock/serviceKits.ts src/providers/data/impl/supabase/serviceKits.ts src/providers/data/index.ts
bunx eslint src/providers/data/contracts/serviceKits.ts src/providers/data/impl/mock/serviceKits.ts src/providers/data/impl/supabase/serviceKits.ts src/providers/data/index.ts
git add src/providers/data/contracts/serviceKits.ts src/providers/data/impl/mock/serviceKits.ts src/providers/data/impl/supabase/serviceKits.ts src/providers/data/index.ts
git commit -m "feat(service-kits): extend provider contract with write operations"
```

---

### Task 3: RBAC — resource e matriz

**Files:**
- Modify: `src/features/rbac/permissions/resources.ts`
- Modify: `src/features/rbac/permissions/matrix.ts`
- Test (throwaway): `scripts/_check_servicekit_rbac.ts`

- [ ] **Step 1: Adicionar o resource**

Em `src/features/rbac/permissions/resources.ts`, dentro do array `RESOURCES`, adicionar a linha `"serviceKit",` logo após `"part",`:

```ts
  "part",
  "serviceKit",
```

- [ ] **Step 2: Adicionar entradas na matriz (Owner e Gestor)**

Em `src/features/rbac/permissions/matrix.ts`:

No array `OWNER_ENTRIES`, após `p("part", CRUD, "all"),` adicionar:
```ts
  p("serviceKit", CRUD, "all"),
```

No array `GESTOR_ENTRIES`, após `p("part", ["view", "create", "edit"], "store"),` adicionar:
```ts
  p("serviceKit", CRUD, "store"),
```

(Vendedor e demais NÃO recebem o resource — continuam apenas consumindo kits no editor.)

- [ ] **Step 3: Verificação descartável de permissões**

Criar `scripts/_check_servicekit_rbac.ts`:

```ts
import { EFFECTIVE_PERMISSIONS_INDEX } from "../src/features/rbac/permissions/matrix";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error("FAIL: " + msg);
  console.log("ok - " + msg);
}

const owner = EFFECTIVE_PERMISSIONS_INDEX.Owner.serviceKit;
const gestor = EFFECTIVE_PERMISSIONS_INDEX.Gestor.serviceKit;
const vendedor = EFFECTIVE_PERMISSIONS_INDEX.Vendedor.serviceKit;

assert(!!owner && owner.actions.has("create") && owner.actions.has("delete"), "Owner CRUD serviceKit");
assert(!!gestor && gestor.actions.has("edit") && gestor.scope === "store", "Gestor CRUD store serviceKit");
assert(vendedor === undefined, "Vendedor não tem serviceKit");

console.log("ALL PASS");
```

- [ ] **Step 4: Rodar, type-check, lint, remover script e commit**

```bash
bun scripts/_check_servicekit_rbac.ts
bunx tsc --noEmit 2>&1 | grep -iE "rbac/permissions"
bunx prettier --check src/features/rbac/permissions/resources.ts src/features/rbac/permissions/matrix.ts
bunx eslint src/features/rbac/permissions/resources.ts src/features/rbac/permissions/matrix.ts
rm scripts/_check_servicekit_rbac.ts
git add src/features/rbac/permissions/resources.ts src/features/rbac/permissions/matrix.ts
git commit -m "feat(rbac): add serviceKit resource for Owner and Gestor"
```
Expected: `ALL PASS`; tsc filtrado vazio.

---

### Task 4: Utils puras — validação e contagem de uso mock

**Files:**
- Create: `src/features/service-kits/types.ts`
- Create: `src/features/service-kits/utils/kitValidation.ts`
- Create: `src/features/service-kits/utils/kitUsageMock.ts`
- Test (throwaway): `scripts/_check_kit_utils.ts`

- [ ] **Step 1: Criar os tipos da feature**

`src/features/service-kits/types.ts`:

```ts
import type { ICreateServiceKitInput } from "@/providers/data";

/** Which UX shell hosts the create/edit form. */
export type KitUxMode = "page" | "dialog" | "drawer";

export type { ICreateServiceKitInput };
```

- [ ] **Step 2: Criar o schema de validação (zod)**

`src/features/service-kits/utils/kitValidation.ts`:

```ts
import { z } from "zod";

export const kitItemSchema = z.object({
  partId: z.string().min(1),
  quantity: z.number().int().min(1, "Quantidade mínima é 1."),
});

export const kitFormSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome do kit."),
  description: z.string().trim().optional(),
  vehicleBrand: z.string().trim().optional(),
  vehicleModel: z.string().trim().optional(),
  category: z.string().trim().optional(),
  items: z.array(kitItemSchema).min(1, "Adicione ao menos uma peça."),
});

export type KitFormValues = z.infer<typeof kitFormSchema>;
```

- [ ] **Step 3: Criar a contagem de uso determinística (mock)**

`src/features/service-kits/utils/kitUsageMock.ts`:

```ts
import type { ID } from "@/shared/types";

/**
 * Deterministic, seeded "used in N quotes" badge value for the demo. NOT real
 * tracking — quote items don't record their originating kit yet (deferred to
 * Fase 2). Same id always yields the same number, range 0..23.
 */
export function kitUsageMock(id: ID): number {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return hash % 24;
}
```

- [ ] **Step 4: Verificação descartável**

`scripts/_check_kit_utils.ts`:

```ts
import { kitFormSchema } from "../src/features/service-kits/utils/kitValidation";
import { kitUsageMock } from "../src/features/service-kits/utils/kitUsageMock";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error("FAIL: " + msg);
  console.log("ok - " + msg);
}

assert(!kitFormSchema.safeParse({ name: "", items: [] }).success, "nome vazio + sem itens falha");
assert(
  kitFormSchema.safeParse({ name: "X", items: [{ partId: "p", quantity: 1 }] }).success,
  "kit mínimo válido passa",
);
assert(
  !kitFormSchema.safeParse({ name: "X", items: [{ partId: "p", quantity: 0 }] }).success,
  "quantidade 0 falha",
);
assert(kitUsageMock("kit-a") === kitUsageMock("kit-a"), "usage é determinístico");
assert(kitUsageMock("kit-a") < 24, "usage no range 0..23");

console.log("ALL PASS");
```

- [ ] **Step 5: Rodar, type-check, lint, remover script e commit**

```bash
bun scripts/_check_kit_utils.ts
bunx tsc --noEmit 2>&1 | grep -iE "service-kits/(types|utils)"
bunx prettier --check src/features/service-kits/types.ts src/features/service-kits/utils/kitValidation.ts src/features/service-kits/utils/kitUsageMock.ts
bunx eslint src/features/service-kits/types.ts src/features/service-kits/utils/kitValidation.ts src/features/service-kits/utils/kitUsageMock.ts
rm scripts/_check_kit_utils.ts
git add src/features/service-kits/types.ts src/features/service-kits/utils/
git commit -m "feat(service-kits): add form validation schema and mock usage count"
```
Expected: `ALL PASS`; tsc filtrado vazio.

---

### Task 5: Hooks — lista, mutations, preferência de UX

**Files:**
- Create: `src/features/service-kits/hooks/useServiceKits.ts`
- Create: `src/features/service-kits/hooks/useServiceKitMutations.ts`
- Create: `src/features/service-kits/hooks/useServiceKitFormPrefs.ts`

- [ ] **Step 1: Hook da lista**

`src/features/service-kits/hooks/useServiceKits.ts`:

```ts
import { useQuery } from "@tanstack/react-query";
import type { ID } from "@/shared/types";
import { useServiceKitsProvider } from "@/providers/data/hooks/useServiceKitsProvider";

/** Reads kits for a store. Shares the ["service-kits", storeId] key with the editor. */
export function useServiceKits(storeId: ID) {
  const provider = useServiceKitsProvider();
  return useQuery({
    queryKey: ["service-kits", storeId] as const,
    queryFn: () => provider.list({ storeId }),
  });
}
```

- [ ] **Step 2: Hook de mutations (espelha useExpenseMutations)**

`src/features/service-kits/hooks/useServiceKitMutations.ts`:

```ts
import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { ID, IServiceKit } from "@/shared/types";
import { useServiceKitsProvider, type ICreateServiceKitInput } from "@/providers/data";

export interface IUseServiceKitMutations {
  saving: boolean;
  create: (input: ICreateServiceKitInput) => Promise<IServiceKit>;
  update: (id: ID, patch: Partial<ICreateServiceKitInput>) => Promise<IServiceKit>;
  remove: (id: ID) => Promise<void>;
  duplicate: (id: ID) => Promise<IServiceKit>;
}

/** Service-kit write operations with cache invalidation + toasts. */
export function useServiceKitMutations(): IUseServiceKitMutations {
  const provider = useServiceKitsProvider();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["service-kits"] });
  }, [queryClient]);

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
    create: (input) => wrap(() => provider.create(input), "Kit criado com sucesso."),
    update: (id, patch) => wrap(() => provider.update(id, patch), "Kit atualizado."),
    remove: (id) => wrap(() => provider.remove(id), "Kit excluído."),
    duplicate: (id) => wrap(() => provider.duplicate(id), "Kit duplicado."),
  };
}
```

- [ ] **Step 3: Hook de preferência de UX (espelha useQuoteEditorPrefs)**

`src/features/service-kits/hooks/useServiceKitFormPrefs.ts`:

```ts
import { useCallback, useState } from "react";
import type { KitUxMode } from "../types";

const STORAGE_KEY = "gallo-kit-ux";
const MODES: KitUxMode[] = ["page", "dialog", "drawer"];
const DEFAULT_MODE: KitUxMode = "page";

function readMode(): KitUxMode {
  if (typeof window === "undefined") return DEFAULT_MODE;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return MODES.includes(raw as KitUxMode) ? (raw as KitUxMode) : DEFAULT_MODE;
  } catch {
    return DEFAULT_MODE;
  }
}

export interface IUseServiceKitFormPrefs {
  uxMode: KitUxMode;
  setUxMode: (mode: KitUxMode) => void;
}

/** Persisted choice of which UX shell hosts the kit form (page/dialog/drawer). */
export function useServiceKitFormPrefs(): IUseServiceKitFormPrefs {
  const [uxMode, setMode] = useState<KitUxMode>(readMode);
  const setUxMode = useCallback((mode: KitUxMode) => {
    setMode(mode);
    try {
      window.localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      // localStorage indisponível — preferência só em memória nesta sessão.
    }
  }, []);
  return { uxMode, setUxMode };
}
```

- [ ] **Step 4: Type-check, lint, commit**

```bash
bunx tsc --noEmit 2>&1 | grep -iE "service-kits/hooks"
bunx prettier --check src/features/service-kits/hooks/useServiceKits.ts src/features/service-kits/hooks/useServiceKitMutations.ts src/features/service-kits/hooks/useServiceKitFormPrefs.ts
bunx eslint src/features/service-kits/hooks/useServiceKits.ts src/features/service-kits/hooks/useServiceKitMutations.ts src/features/service-kits/hooks/useServiceKitFormPrefs.ts
git add src/features/service-kits/hooks/
git commit -m "feat(service-kits): add list, mutations and UX-pref hooks"
```
Expected: tsc filtrado vazio. (Confirmar que `useServiceKitsProvider` é exportado por `@/providers/data`; se não, importar de `@/providers/data/hooks/useServiceKitsProvider` como em `useServiceKits.ts`.)

---

### Task 6: KitItemBuilder (busca de peça + itens + quantidade)

**Files:**
- Create: `src/features/service-kits/components/KitItemBuilder.tsx`

- [ ] **Step 1: Implementar o construtor de itens**

`src/features/service-kits/components/KitItemBuilder.tsx`:

```tsx
import { useMemo, useState } from "react";
import type { ID, IPart, IServiceKitItem } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Input } from "@/components/ui/input";
import { getCategoryIcon } from "@/features/catalog";
import { useItemSearch } from "@/features/quotes/hooks/useItemSearch";

export interface IKitItemBuilderProps {
  items: IServiceKitItem[];
  onChange: (items: IServiceKitItem[]) => void;
}

/** Two-pane builder: catalog search on the left, selected kit items on the right. */
export function KitItemBuilder({ items, onChange }: IKitItemBuilderProps) {
  const [query, setQuery] = useState("");
  const { results, allParts, isLoading } = useItemSearch({ enabled: true, query });

  const partsById = useMemo(() => {
    const map = new Map<ID, IPart>();
    for (const p of allParts) map.set(p.id, p);
    return map;
  }, [allParts]);

  function addPart(part: IPart) {
    const existing = items.find((it) => it.partId === part.id);
    if (existing) {
      onChange(items.map((it) => (it.partId === part.id ? { ...it, quantity: it.quantity + 1 } : it)));
    } else {
      onChange([...items, { partId: part.id, quantity: 1 }]);
    }
  }
  function setQty(partId: ID, quantity: number) {
    onChange(items.map((it) => (it.partId === partId ? { ...it, quantity: Math.max(1, Math.floor(quantity) || 1) } : it)));
  }
  function removeItem(partId: ID) {
    onChange(items.filter((it) => it.partId !== partId));
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {/* Busca de peça */}
      <div className="rounded-lg border border-border">
        <div className="relative border-b border-border p-2">
          <Icon icon="mdi:magnify" size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-8" placeholder="Buscar peça, OEM ou SKU…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <div className="max-h-72 overflow-y-auto">
          {isLoading ? (
            <p className="p-4 text-center text-xs text-muted-foreground">Carregando catálogo…</p>
          ) : results.length === 0 ? (
            <p className="p-4 text-center text-xs text-muted-foreground">{query ? "Nenhuma peça encontrada." : "Digite para buscar peças."}</p>
          ) : (
            results.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => addPart(p)}
                className="flex w-full items-center gap-2 border-b border-border px-3 py-2 text-left last:border-b-0 hover:bg-muted/50"
              >
                <Icon icon={getCategoryIcon(p.category)} size={16} className="shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate text-sm">{p.name}</span>
                <Icon icon="mdi:plus" size={16} className="shrink-0 text-primary" />
              </button>
            ))
          )}
        </div>
      </div>

      {/* Itens do kit */}
      <div className="rounded-lg border border-border">
        <p className="border-b border-border px-3 py-2 text-sm font-medium text-foreground">
          Itens do kit ({items.length})
        </p>
        <div className="max-h-72 overflow-y-auto">
          {items.length === 0 ? (
            <p className="p-4 text-center text-xs text-muted-foreground">Nenhuma peça adicionada.</p>
          ) : (
            items.map((it) => {
              const part = partsById.get(it.partId);
              return (
                <div key={it.partId} className="flex items-center gap-2 border-b border-border px-3 py-2 last:border-b-0">
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {part ? part.name : <span className="text-muted-foreground">Peça indisponível ({it.partId})</span>}
                  </span>
                  <Input
                    type="number"
                    min={1}
                    value={it.quantity}
                    onChange={(e) => setQty(it.partId, Number(e.target.value))}
                    aria-label={`Quantidade de ${part?.name ?? it.partId}`}
                    className="h-8 w-16 text-right tabular-nums"
                  />
                  <button
                    type="button"
                    onClick={() => removeItem(it.partId)}
                    aria-label="Remover peça"
                    className="grid h-7 w-7 place-items-center text-muted-foreground hover:text-destructive"
                  >
                    <Icon icon="mdi:trash-can-outline" size={16} />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check, lint, commit**

```bash
bunx tsc --noEmit 2>&1 | grep -iE "KitItemBuilder"
bunx prettier --check src/features/service-kits/components/KitItemBuilder.tsx
bunx eslint src/features/service-kits/components/KitItemBuilder.tsx
git add src/features/service-kits/components/KitItemBuilder.tsx
git commit -m "feat(service-kits): add catalog item builder for the kit form"
```
Expected: tsc filtrado vazio. (Confirmar que `getCategoryIcon` é exportado por `@/features/catalog` — é usado assim em `ItemResultRow.tsx`.)

---

### Task 7: KitForm (núcleo único do formulário)

**Files:**
- Create: `src/features/service-kits/components/KitForm.tsx`

- [ ] **Step 1: Implementar o formulário com react-hook-form + zod**

`src/features/service-kits/components/KitForm.tsx`:

```tsx
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { ID, IServiceKit, IServiceKitItem, PartCategory } from "@/shared/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ICreateServiceKitInput } from "@/providers/data";
import { kitFormSchema, type KitFormValues } from "../utils/kitValidation";
import { KitItemBuilder } from "./KitItemBuilder";

export interface IKitFormProps {
  storeId: ID;
  /** When set, the form edits this kit; otherwise it creates a new one. */
  initial?: IServiceKit;
  saving?: boolean;
  onSubmit: (input: ICreateServiceKitInput) => void;
  onCancel: () => void;
}

function toValues(kit: IServiceKit | undefined): KitFormValues {
  return {
    name: kit?.name ?? "",
    description: kit?.description ?? "",
    vehicleBrand: kit?.vehicleApplication?.brand ?? "",
    vehicleModel: kit?.vehicleApplication?.model ?? "",
    category: kit?.category ?? "",
    items: kit ? kit.items.map((i) => ({ ...i })) : [],
  };
}

export function KitForm({ storeId, initial, saving, onSubmit, onCancel }: IKitFormProps) {
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<KitFormValues>({
    resolver: zodResolver(kitFormSchema),
    defaultValues: toValues(initial),
  });

  function submit(values: KitFormValues) {
    const vehicleApplication =
      values.vehicleBrand && values.vehicleModel
        ? { brand: values.vehicleBrand, model: values.vehicleModel }
        : undefined;
    const input: ICreateServiceKitInput = {
      storeId,
      name: values.name,
      description: values.description || undefined,
      vehicleApplication,
      category: (values.category || undefined) as PartCategory | undefined,
      items: values.items as IServiceKitItem[],
    };
    onSubmit(input);
  }

  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="kit-name">Nome*</Label>
          <Input id="kit-name" {...register("name")} placeholder="Ex.: Revisão 40.000 km — Volvo FH" />
          {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
        </div>
        <div className="space-y-1">
          <Label htmlFor="kit-category">Categoria</Label>
          <Input id="kit-category" {...register("category")} placeholder="Ex.: filtro" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="kit-brand">Marca do veículo</Label>
          <Input id="kit-brand" {...register("vehicleBrand")} placeholder="Ex.: Volvo" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="kit-model">Modelo do veículo</Label>
          <Input id="kit-model" {...register("vehicleModel")} placeholder="Ex.: FH" />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor="kit-desc">Descrição</Label>
          <Textarea id="kit-desc" {...register("description")} placeholder="Observações do kit (opcional)" />
        </div>
      </div>

      <div className="space-y-1">
        <Label>Peças do kit*</Label>
        <Controller
          control={control}
          name="items"
          render={({ field }) => <KitItemBuilder items={field.value} onChange={field.onChange} />}
        />
        {errors.items && <p className="text-xs text-destructive">{errors.items.message}</p>}
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>
          Cancelar
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? "Salvando…" : initial ? "Salvar alterações" : "Criar kit"}
        </Button>
      </div>
    </form>
  );
}
```

- [ ] **Step 2: Type-check, lint, commit**

```bash
bunx tsc --noEmit 2>&1 | grep -iE "service-kits/components/KitForm"
bunx prettier --check src/features/service-kits/components/KitForm.tsx
bunx eslint src/features/service-kits/components/KitForm.tsx
git add src/features/service-kits/components/KitForm.tsx
git commit -m "feat(service-kits): add shared kit form core"
```
Expected: tsc filtrado vazio. (Confirmar que existe `@/components/ui/textarea`; se o nome do componente diferir, ajustar o import. `category` é tratada como string livre no MVP, convertida para `PartCategory` no submit.)

---

### Task 8: As 3 cascas — Dialog, Drawer, Page + KitUxToggle

**Files:**
- Create: `src/features/service-kits/components/KitFormDialog.tsx`
- Create: `src/features/service-kits/components/KitFormDrawer.tsx`
- Create: `src/features/service-kits/components/KitUxToggle.tsx`
- Create: `src/features/service-kits/pages/ServiceKitFormPage.tsx`

- [ ] **Step 1: KitFormDialog**

`src/features/service-kits/components/KitFormDialog.tsx`:

```tsx
import type { ID, IServiceKit } from "@/shared/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ICreateServiceKitInput } from "@/providers/data";
import { KitForm } from "./KitForm";

export interface IKitFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  storeId: ID;
  initial?: IServiceKit;
  saving?: boolean;
  onSubmit: (input: ICreateServiceKitInput) => void;
}

export function KitFormDialog({ open, onOpenChange, storeId, initial, saving, onSubmit }: IKitFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{initial ? "Editar kit" : "Novo kit de revisão"}</DialogTitle>
        </DialogHeader>
        <KitForm
          storeId={storeId}
          initial={initial}
          saving={saving}
          onSubmit={onSubmit}
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: KitFormDrawer (Sheet)**

`src/features/service-kits/components/KitFormDrawer.tsx`:

```tsx
import type { ID, IServiceKit } from "@/shared/types";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { ICreateServiceKitInput } from "@/providers/data";
import { KitForm } from "./KitForm";

export interface IKitFormDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  storeId: ID;
  initial?: IServiceKit;
  saving?: boolean;
  onSubmit: (input: ICreateServiceKitInput) => void;
}

export function KitFormDrawer({ open, onOpenChange, storeId, initial, saving, onSubmit }: IKitFormDrawerProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>{initial ? "Editar kit" : "Novo kit de revisão"}</SheetTitle>
        </SheetHeader>
        <div className="mt-4">
          <KitForm
            storeId={storeId}
            initial={initial}
            saving={saving}
            onSubmit={onSubmit}
            onCancel={() => onOpenChange(false)}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Step 3: KitUxToggle**

`src/features/service-kits/components/KitUxToggle.tsx`:

```tsx
import { Icon } from "@/components/Icon";
import type { KitUxMode } from "../types";

const OPTIONS: { mode: KitUxMode; icon: string; label: string }[] = [
  { mode: "page", icon: "mdi:page-layout-body", label: "Página" },
  { mode: "dialog", icon: "mdi:dock-window", label: "Dialog" },
  { mode: "drawer", icon: "mdi:dock-right", label: "Drawer" },
];

export interface IKitUxToggleProps {
  value: KitUxMode;
  onChange: (mode: KitUxMode) => void;
}

/** Segmented control selecting which UX hosts the kit form. */
export function KitUxToggle({ value, onChange }: IKitUxToggleProps) {
  return (
    <div className="inline-flex rounded-md border border-border p-0.5" role="group" aria-label="Modo do formulário">
      {OPTIONS.map((o) => (
        <button
          key={o.mode}
          type="button"
          onClick={() => onChange(o.mode)}
          aria-pressed={value === o.mode}
          title={o.label}
          className={`grid h-7 w-7 place-items-center rounded ${
            value === o.mode ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Icon icon={o.icon} size={16} />
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: ServiceKitFormPage (casca página, usada nas rotas novo/editar)**

`src/features/service-kits/pages/ServiceKitFormPage.tsx`:

```tsx
import { useNavigate, useParams } from "@tanstack/react-router";
import { Icon } from "@/components/Icon";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useCurrentStoreId } from "@/features/auth/useCurrentStoreId";
import type { ICreateServiceKitInput } from "@/providers/data";
import { useServiceKits } from "../hooks/useServiceKits";
import { useServiceKitMutations } from "../hooks/useServiceKitMutations";
import { KitForm } from "../components/KitForm";

export interface IServiceKitFormPageProps {
  mode: "create" | "edit";
}

export function ServiceKitFormPage({ mode }: IServiceKitFormPageProps) {
  const storeId = useCurrentStoreId();
  const navigate = useNavigate();
  const mutations = useServiceKitMutations();
  const params = useParams({ strict: false }) as { id?: string };
  const kitsQuery = useServiceKits(storeId);
  const initial = mode === "edit" ? kitsQuery.data?.find((k) => k.id === params.id) : undefined;

  function back() {
    void navigate({ to: "/app/catalogo/kits" });
  }

  async function handleSubmit(input: ICreateServiceKitInput) {
    if (mode === "edit" && initial) {
      await mutations.update(initial.id, input);
    } else {
      await mutations.create(input);
    }
    back();
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4">
      <Button variant="ghost" size="sm" onClick={back} className="gap-1">
        <Icon icon="mdi:chevron-left" size={18} /> Voltar
      </Button>
      <Card className="p-4">
        <h1 className="mb-4 text-lg font-semibold">{mode === "edit" ? "Editar kit" : "Novo kit de revisão"}</h1>
        {mode === "edit" && !initial && kitsQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : mode === "edit" && !initial ? (
          <p className="text-sm text-muted-foreground">Kit não encontrado.</p>
        ) : (
          <KitForm
            storeId={storeId}
            initial={initial}
            saving={mutations.saving}
            onSubmit={handleSubmit}
            onCancel={back}
          />
        )}
      </Card>
    </div>
  );
}
```

> **Resolver `useCurrentStoreId`:** o editor de orçamento usa `storeId = currentStoreId ?? "store-matriz"`. Localizar como o `QuoteEditor.tsx` obtém `storeId` (linhas ~80) e reusar o mesmo hook/fonte. Se não existir um hook `useCurrentStoreId`, replicar a expressão usada lá (provavelmente de `useAuth`/contexto de loja) com fallback `"store-matriz"`. Ajustar o import conforme a fonte real.

- [ ] **Step 5: Type-check, lint, commit**

```bash
bunx tsc --noEmit 2>&1 | grep -iE "KitFormDialog|KitFormDrawer|KitUxToggle|ServiceKitFormPage"
bunx prettier --check src/features/service-kits/components/KitFormDialog.tsx src/features/service-kits/components/KitFormDrawer.tsx src/features/service-kits/components/KitUxToggle.tsx src/features/service-kits/pages/ServiceKitFormPage.tsx
bunx eslint src/features/service-kits/components/KitFormDialog.tsx src/features/service-kits/components/KitFormDrawer.tsx src/features/service-kits/components/KitUxToggle.tsx src/features/service-kits/pages/ServiceKitFormPage.tsx
git add src/features/service-kits/components/KitFormDialog.tsx src/features/service-kits/components/KitFormDrawer.tsx src/features/service-kits/components/KitUxToggle.tsx src/features/service-kits/pages/ServiceKitFormPage.tsx
git commit -m "feat(service-kits): add dialog, drawer and page shells plus UX toggle"
```
Expected: tsc filtrado vazio. (Confirmar nomes reais dos componentes shadcn `@/components/ui/sheet`, `@/components/ui/dialog`, `@/components/ui/card`.)

---

### Task 9: Lista — KitsTable, DeleteKitDialog, ServiceKitsListPage

**Files:**
- Create: `src/features/service-kits/components/DeleteKitDialog.tsx`
- Create: `src/features/service-kits/components/KitsTable.tsx`
- Create: `src/features/service-kits/pages/ServiceKitsListPage.tsx`
- Create: `src/features/service-kits/index.ts`

- [ ] **Step 1: DeleteKitDialog**

`src/features/service-kits/components/DeleteKitDialog.tsx`:

```tsx
import type { IServiceKit } from "@/shared/types";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export interface IDeleteKitDialogProps {
  kit: IServiceKit | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

export function DeleteKitDialog({ kit, onOpenChange, onConfirm }: IDeleteKitDialogProps) {
  return (
    <AlertDialog open={kit !== null} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Excluir kit</AlertDialogTitle>
          <AlertDialogDescription>
            {kit ? `Excluir "${kit.name}"? Esta ação não pode ser desfeita.` : ""}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
            Excluir kit
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
```

- [ ] **Step 2: KitsTable**

`src/features/service-kits/components/KitsTable.tsx`:

```tsx
import type { IServiceKit } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { kitUsageMock } from "../utils/kitUsageMock";

export interface IKitsTableProps {
  kits: IServiceKit[];
  onEdit: (kit: IServiceKit) => void;
  onDuplicate: (kit: IServiceKit) => void;
  onDelete: (kit: IServiceKit) => void;
}

export function KitsTable({ kits, onEdit, onDuplicate, onDelete }: IKitsTableProps) {
  if (kits.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-8 text-center">
        <p className="text-sm text-muted-foreground">Nenhum kit cadastrado ainda.</p>
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-xs text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-left">Kit</th>
            <th className="px-3 py-2 text-left">Veículo</th>
            <th className="px-3 py-2 text-left">Categoria</th>
            <th className="w-20 px-3 py-2 text-right">Peças</th>
            <th className="w-24 px-3 py-2 text-right">Uso</th>
            <th className="w-28 px-3 py-2 text-right">Ações</th>
          </tr>
        </thead>
        <tbody>
          {kits.map((kit) => (
            <tr key={kit.id} className="border-t border-border">
              <td className="px-3 py-2">
                <p className="font-medium text-foreground">{kit.name}</p>
                {kit.description && <p className="text-xs text-muted-foreground">{kit.description}</p>}
              </td>
              <td className="px-3 py-2 text-muted-foreground">
                {kit.vehicleApplication ? `${kit.vehicleApplication.brand} ${kit.vehicleApplication.model}` : "—"}
              </td>
              <td className="px-3 py-2 text-muted-foreground">{kit.category ?? "—"}</td>
              <td className="px-3 py-2 text-right tabular-nums">{kit.items.length}</td>
              <td className="px-3 py-2 text-right text-xs text-muted-foreground tabular-nums">
                {kitUsageMock(kit.id)} orç.
              </td>
              <td className="px-3 py-2">
                <div className="flex justify-end gap-1">
                  <button type="button" onClick={() => onEdit(kit)} aria-label={`Editar ${kit.name}`} className="grid h-7 w-7 place-items-center rounded text-muted-foreground hover:text-foreground">
                    <Icon icon="mdi:pencil-outline" size={16} />
                  </button>
                  <button type="button" onClick={() => onDuplicate(kit)} aria-label={`Duplicar ${kit.name}`} className="grid h-7 w-7 place-items-center rounded text-muted-foreground hover:text-foreground">
                    <Icon icon="mdi:content-copy" size={16} />
                  </button>
                  <button type="button" onClick={() => onDelete(kit)} aria-label={`Excluir ${kit.name}`} className="grid h-7 w-7 place-items-center rounded text-muted-foreground hover:text-destructive">
                    <Icon icon="mdi:trash-can-outline" size={16} />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 3: ServiceKitsListPage (lista + filtros + toggle + roteia/abre cascas)**

`src/features/service-kits/pages/ServiceKitsListPage.tsx`:

```tsx
import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import type { IServiceKit } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useCurrentStoreId } from "@/features/auth/useCurrentStoreId";
import { useServiceKits } from "../hooks/useServiceKits";
import { useServiceKitMutations } from "../hooks/useServiceKitMutations";
import { useServiceKitFormPrefs } from "../hooks/useServiceKitFormPrefs";
import { KitsTable } from "../components/KitsTable";
import { KitUxToggle } from "../components/KitUxToggle";
import { KitFormDialog } from "../components/KitFormDialog";
import { KitFormDrawer } from "../components/KitFormDrawer";
import { DeleteKitDialog } from "../components/DeleteKitDialog";

export function ServiceKitsListPage() {
  const storeId = useCurrentStoreId();
  const navigate = useNavigate();
  const { uxMode, setUxMode } = useServiceKitFormPrefs();
  const kitsQuery = useServiceKits(storeId);
  const mutations = useServiceKitMutations();

  const [search, setSearch] = useState("");
  const [overlayInitial, setOverlayInitial] = useState<IServiceKit | undefined>(undefined);
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [toDelete, setToDelete] = useState<IServiceKit | null>(null);

  const kits = useMemo(() => {
    const all = kitsQuery.data ?? [];
    const needle = search.trim().toLowerCase();
    if (!needle) return all;
    return all.filter(
      (k) =>
        k.name.toLowerCase().includes(needle) ||
        (k.vehicleApplication &&
          `${k.vehicleApplication.brand} ${k.vehicleApplication.model}`.toLowerCase().includes(needle)) ||
        (k.category ?? "").toLowerCase().includes(needle),
    );
  }, [kitsQuery.data, search]);

  function openCreate() {
    if (uxMode === "page") {
      void navigate({ to: "/app/catalogo/kits/novo" });
      return;
    }
    setOverlayInitial(undefined);
    setOverlayOpen(true);
  }
  function openEdit(kit: IServiceKit) {
    if (uxMode === "page") {
      void navigate({ to: "/app/catalogo/kits/$id/editar", params: { id: kit.id } });
      return;
    }
    setOverlayInitial(kit);
    setOverlayOpen(true);
  }
  async function submitOverlay(input: Parameters<typeof mutations.create>[0]) {
    if (overlayInitial) await mutations.update(overlayInitial.id, input);
    else await mutations.create(input);
    setOverlayOpen(false);
  }

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-semibold">Kits de revisão</h1>
        <div className="flex items-center gap-2">
          <KitUxToggle value={uxMode} onChange={setUxMode} />
          <Button onClick={openCreate} className="gap-1">
            <Icon icon="mdi:plus" size={18} /> Novo kit
          </Button>
        </div>
      </div>

      <div className="relative max-w-sm">
        <Icon icon="mdi:magnify" size={16} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input className="pl-8" placeholder="Buscar por nome, veículo ou categoria…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {kitsQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando kits…</p>
      ) : (
        <KitsTable kits={kits} onEdit={openEdit} onDuplicate={(k) => void mutations.duplicate(k.id)} onDelete={setToDelete} />
      )}

      {uxMode === "dialog" && (
        <KitFormDialog open={overlayOpen} onOpenChange={setOverlayOpen} storeId={storeId} initial={overlayInitial} saving={mutations.saving} onSubmit={submitOverlay} />
      )}
      {uxMode === "drawer" && (
        <KitFormDrawer open={overlayOpen} onOpenChange={setOverlayOpen} storeId={storeId} initial={overlayInitial} saving={mutations.saving} onSubmit={submitOverlay} />
      )}

      <DeleteKitDialog
        kit={toDelete}
        onOpenChange={(open) => !open && setToDelete(null)}
        onConfirm={() => {
          if (toDelete) void mutations.remove(toDelete.id);
          setToDelete(null);
        }}
      />
    </div>
  );
}
```

- [ ] **Step 4: Barrel da feature**

`src/features/service-kits/index.ts`:

```ts
export { ServiceKitsListPage } from "./pages/ServiceKitsListPage";
export { ServiceKitFormPage } from "./pages/ServiceKitFormPage";
```

- [ ] **Step 5: Type-check, lint, commit**

```bash
bunx tsc --noEmit 2>&1 | grep -iE "service-kits/(components/(KitsTable|DeleteKitDialog)|pages/ServiceKitsListPage|index)"
bunx prettier --check src/features/service-kits/components/DeleteKitDialog.tsx src/features/service-kits/components/KitsTable.tsx src/features/service-kits/pages/ServiceKitsListPage.tsx src/features/service-kits/index.ts
bunx eslint src/features/service-kits/components/DeleteKitDialog.tsx src/features/service-kits/components/KitsTable.tsx src/features/service-kits/pages/ServiceKitsListPage.tsx src/features/service-kits/index.ts
git add src/features/service-kits/components/DeleteKitDialog.tsx src/features/service-kits/components/KitsTable.tsx src/features/service-kits/pages/ServiceKitsListPage.tsx src/features/service-kits/index.ts
git commit -m "feat(service-kits): add list page with table, filters and delete confirm"
```
Expected: tsc filtrado vazio.

---

### Task 10: Rotas, constante e item de menu

**Files:**
- Create: `src/routes/app.catalogo.kits.tsx`
- Create: `src/routes/app.catalogo.kits.index.tsx`
- Create: `src/routes/app.catalogo.kits.novo.tsx`
- Create: `src/routes/app.catalogo.kits.$id.editar.tsx`
- Modify: `src/features/shell/config/routes.ts`
- Modify: `src/features/shell/config/navigation.ts`

- [ ] **Step 1: Wrapper de rota com guard**

`src/routes/app.catalogo.kits.tsx`:

```tsx
import { createFileRoute, redirect, Outlet } from "@tanstack/react-router";
import { hasPermission } from "@/features/rbac/utils/hasPermission";
import { readCurrentUserSync } from "@/features/auth/guards";

export const Route = createFileRoute("/app/catalogo/kits")({
  beforeLoad: () => {
    const user = readCurrentUserSync();
    if (!hasPermission(user, "serviceKit", "view")) {
      throw redirect({ to: "/app/catalogo" });
    }
  },
  component: () => <Outlet />,
});
```

> Confirmar a assinatura de `hasPermission` e `readCurrentUserSync` em `src/routes/app.catalogo.novo.tsx` (referência idêntica). Se o roteador exigir um componente nomeado em vez de inline, extrair para `function KitsLayout() { return <Outlet />; }`.

- [ ] **Step 2: Rota index (lista)**

`src/routes/app.catalogo.kits.index.tsx`:

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { ServiceKitsListPage } from "@/features/service-kits";

export const Route = createFileRoute("/app/catalogo/kits/")({
  component: ServiceKitsListPage,
});
```

- [ ] **Step 3: Rota novo**

`src/routes/app.catalogo.kits.novo.tsx`:

```tsx
import { createFileRoute, redirect } from "@tanstack/react-router";
import { hasPermission } from "@/features/rbac/utils/hasPermission";
import { readCurrentUserSync } from "@/features/auth/guards";
import { ServiceKitFormPage } from "@/features/service-kits";

export const Route = createFileRoute("/app/catalogo/kits/novo")({
  beforeLoad: () => {
    const user = readCurrentUserSync();
    if (!hasPermission(user, "serviceKit", "create")) {
      throw redirect({ to: "/app/catalogo/kits" });
    }
  },
  component: () => <ServiceKitFormPage mode="create" />,
});
```

- [ ] **Step 4: Rota editar**

`src/routes/app.catalogo.kits.$id.editar.tsx`:

```tsx
import { createFileRoute, redirect } from "@tanstack/react-router";
import { hasPermission } from "@/features/rbac/utils/hasPermission";
import { readCurrentUserSync } from "@/features/auth/guards";
import { ServiceKitFormPage } from "@/features/service-kits";

export const Route = createFileRoute("/app/catalogo/kits/$id/editar")({
  beforeLoad: () => {
    const user = readCurrentUserSync();
    if (!hasPermission(user, "serviceKit", "edit")) {
      throw redirect({ to: "/app/catalogo/kits" });
    }
  },
  component: () => <ServiceKitFormPage mode="edit" />,
});
```

- [ ] **Step 5: Constante de rota**

Em `src/features/shell/config/routes.ts`, dentro do objeto `ROUTES`, após a linha `APP_CATALOGO: "/app/catalogo",` adicionar:

```ts
  APP_CATALOGO_KITS: "/app/catalogo/kits",
```

- [ ] **Step 6: Item de menu**

Em `src/features/shell/config/navigation.ts`, no grupo `"Comercial"` (que contém "Catálogo"), logo após o item "Catálogo", adicionar:

```ts
      {
        label: "Kits de revisão",
        icon: "mdi:toolbox-outline",
        to: ROUTES.APP_CATALOGO_KITS,
        roles: ["Owner", "Gestor"],
      },
```

- [ ] **Step 7: Regenerar routeTree, type-check, lint, commit**

Rodar o dev server uma vez (ou build) regenera `src/routeTree.gen.ts` com as novas rotas. Como o usuário mantém o dev server rodando, o plugin já regenera automaticamente; caso contrário:

Run: `bunx tsc --noEmit 2>&1 | grep -iE "app.catalogo.kits|shell/config"`
Expected: vazio. (Se `routeTree.gen.ts` acusar rota faltante, garantir que o dev server rodou para regenerá-lo; **não** editar o arquivo à mão.)

```bash
bunx prettier --check src/routes/app.catalogo.kits.tsx src/routes/app.catalogo.kits.index.tsx src/routes/app.catalogo.kits.novo.tsx "src/routes/app.catalogo.kits.\$id.editar.tsx" src/features/shell/config/routes.ts src/features/shell/config/navigation.ts
bunx eslint src/routes/app.catalogo.kits.tsx src/routes/app.catalogo.kits.index.tsx src/routes/app.catalogo.kits.novo.tsx "src/routes/app.catalogo.kits.\$id.editar.tsx" src/features/shell/config/routes.ts src/features/shell/config/navigation.ts
git add src/routes/app.catalogo.kits.tsx src/routes/app.catalogo.kits.index.tsx src/routes/app.catalogo.kits.novo.tsx src/routes/app.catalogo.kits.\$id.editar.tsx src/features/shell/config/routes.ts src/features/shell/config/navigation.ts src/routeTree.gen.ts
git commit -m "feat(service-kits): add routes and sidebar entry under Catálogo"
```

> Ao commitar `routeTree.gen.ts`, verificar que o diff é real (novas rotas), não apenas CRLF — `git diff --cached --ignore-all-space src/routeTree.gen.ts` deve mostrar as entradas novas.

---

## Validação final (após todas as tasks)

- [ ] **Type-check global filtrado pela feature:**
```bash
bunx tsc --noEmit 2>&1 | grep -iE "service-kits|serviceKits|catalogo.kits"
```
Expected: vazio.

- [ ] **Build de produção (bundling):**
```bash
bun run build
```
Expected: sucesso (só aviso de chunk-size pré-existente).

- [ ] **Smoke manual (o usuário valida a UI):** menu "Kits de revisão" visível para Owner/Gestor → lista carrega → criar/editar/duplicar/excluir funcionam nas 3 UX (toggle) → o `KitPicker` do editor de orçamento reflete um kit recém-criado.

- [ ] **Revisão holística final** (subagent-driven: dispatch final code reviewer) e então **superpowers:finishing-a-development-branch**.

---

## Self-Review (preenchido)

**1. Cobertura do spec:**
- Localização em Catálogo → Task 10 (rotas + menu). ✓
- 3 UX selecionáveis + preferência persistida → Tasks 5 (prefs), 8 (cascas), 9 (toggle/roteamento). ✓
- Provider create/update/remove/duplicate + supabase stub → Tasks 1, 2. ✓
- Operações: criar/editar (Tasks 7-9), duplicar (Tasks 1,9), excluir c/ confirmação (Task 9), filtros/busca (Task 9), contagem de uso (Tasks 4,9). ✓
- RBAC Owner/Gestor → Task 3 + guards nas rotas (Task 10). ✓
- Invalidação `["service-kits"]` reflete no editor → Task 5. ✓
- Validação (nome, ≥1 item, qty≥1), peça órfã, toasts, empty/loading → Tasks 1,4,6,7,9. ✓

**2. Placeholders:** nenhum "TBD/TODO"; pontos a confirmar (nomes de componentes shadcn, `useCurrentStoreId`, exports de barrel) estão marcados como verificações explícitas contra arquivos de referência reais, não como código faltante.

**3. Consistência de tipos:** `ICreateServiceKitInput` definido em Task 2 (contract) e na api (Task 1) com shape idêntico; `KitUxMode` em Task 4 usado em 5/8/9; `useServiceKits(storeId)` assinatura consistente entre Tasks 5/8/9; `useServiceKitMutations` retorna `{saving, create, update, remove, duplicate}` usado igual em 8/9.
