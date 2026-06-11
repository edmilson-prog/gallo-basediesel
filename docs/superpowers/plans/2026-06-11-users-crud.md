# Users CRUD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Completar o CRUD de usuários em Configurações → Usuários: cadastrar vendedor novo, editar dados e excluir (soft delete) — spec aprovada em `docs/superpowers/specs/2026-06-11-users-crud-design.md`.

**Architecture:** Dados via Provider Pattern (`ISellersProvider.create/remove` em mock e supabase; RLS de staff já cobre insert/update). Soft delete via coluna nova `sellers.deleted_at` + Edge Function `delete-seller` (service_role revoga o auth user). UI reformada na página existente com `SellerFormDialog` (react-hook-form + zod) e `DeleteSellerDialog`.

**Tech Stack:** React 19 + TanStack Query, react-hook-form + zod + shadcn/ui, Supabase (Postgres/RLS/Edge Functions Deno), Vitest, bun.

**Branch:** `feat/users-crud` (já criada, a partir da `main`). ⚠️ Subagentes NÃO trocam de branch. ⚠️ Produção está NO AR — a migration é aditiva (segura) e a edge function é nova (não afeta fluxos existentes). ⚠️ Nunca commitar `vite.config.ts` (mudança local do dono) nem `src/routeTree.gen.ts` (gerado — descartar com `git checkout -- src/routeTree.gen.ts` antes de commitar). Avisos de CRLF do git são falsos positivos — ignorar.

---

## Estrutura de arquivos

| Arquivo | Papel |
| --- | --- |
| `supabase/migrations/20260611210000_sellers_soft_delete.sql` (novo) | coluna `deleted_at` (espelho da migration aplicada via MCP) |
| `src/shared/types/people.ts` (modif.) | `ISeller.deletedAt?` |
| `src/providers/data/contracts/sellers.ts` (modif.) | `ICreateSellerInput`, `create`, `remove` |
| `src/mocks/api/sellers.ts` (modif.) | create/remove/filtro no mockStore |
| `src/mocks/api/__tests__/sellers.test.ts` (novo) | testes TDD do mock |
| `src/providers/data/impl/mock/sellers.ts` (modif.) | delegação |
| `src/providers/data/impl/supabase/sellers.ts` (modif.) | mapping `deleted_at`, insert, invoke `delete-seller` |
| `supabase/functions/delete-seller/index.ts` (novo) | Edge Function owner-only (a 11ª) |
| `src/features/admin-settings/engine/sellerForm.ts` (novo) | schema zod + helpers (testável) |
| `src/features/admin-settings/engine/sellerForm.test.ts` (novo) | testes TDD do schema |
| `src/features/admin-settings/components/SellerFormDialog.tsx` (novo) | dialog criar/editar |
| `src/features/admin-settings/components/DeleteSellerDialog.tsx` (novo) | confirmação de exclusão |
| `src/features/admin-settings/pages/UsersPage.tsx` (rename de `UsersPlaceholderPage.tsx`) | página reformada |
| `src/features/admin-settings/index.ts` + `src/routes/app.configuracoes.usuarios.tsx` (modif.) | barrel e rota |

---

### Task 1: Migration `deleted_at` + tipo `ISeller.deletedAt`

**Files:**
- Create: `supabase/migrations/20260611210000_sellers_soft_delete.sql`
- Modify: `src/shared/types/people.ts` (interface `ISeller`, linhas ~32-65)

- [ ] **Step 1: Aplicar a migration no projeto Supabase via MCP**

Usar a tool MCP `mcp__supabase__apply_migration` com `name: "sellers_soft_delete"` e a query:

```sql
-- Soft delete for sellers (users CRUD). NULL = alive. Rows with deleted_at set
-- are hidden from every provider list() but stay referencable by historical FKs.
alter table public.sellers add column if not exists deleted_at timestamptz;
```

Expected: sucesso (coluna criada). Migration é aditiva — não afeta produção.

- [ ] **Step 2: Espelhar a migration no Git (regra do projeto)**

Criar `supabase/migrations/20260611210000_sellers_soft_delete.sql` com exatamente o mesmo SQL do Step 1.

- [ ] **Step 3: Adicionar `deletedAt` ao tipo de domínio**

Em `src/shared/types/people.ts`, dentro de `export interface ISeller`, logo após `active: boolean;`:

```typescript
  active: boolean;
  /** Soft delete (users CRUD) — set means hidden from lists; login revoked. */
  deletedAt?: ISO8601;
  createdAt: ISO8601;
```

- [ ] **Step 4: Build para garantir que nada quebrou**

Run: `bun run build`
Expected: build verde (campo opcional não quebra consumidores).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260611210000_sellers_soft_delete.sql src/shared/types/people.ts
git commit -m "feat(sellers): add deleted_at soft-delete column and ISeller.deletedAt"
```

---

### Task 2: Contrato + mock api (`create`/`remove`/filtro) — TDD

**Files:**
- Test: `src/mocks/api/__tests__/sellers.test.ts` (novo)
- Modify: `src/providers/data/contracts/sellers.ts`
- Modify: `src/mocks/api/sellers.ts`
- Modify: `src/providers/data/impl/mock/sellers.ts`

- [ ] **Step 1: Escrever os testes que falham**

Criar `src/mocks/api/__tests__/sellers.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { sellersApi } from "../sellers";

const STORE = "00000000-0000-0000-0000-000000000001";

describe("sellersApi.create", () => {
  it("creates a seller with defaults (offline, parts, active, no deletedAt)", async () => {
    const created = await sellersApi.create({
      storeId: STORE,
      fullName: "Teste da Silva",
      email: "Teste.Silva@Example.com",
      type: "internal",
    });
    expect(created.id).toBeTruthy();
    expect(created.email).toBe("teste.silva@example.com"); // normalized
    expect(created.availability).toBe("offline");
    expect(created.divisions).toEqual(["parts"]);
    expect(created.active).toBe(true);
    expect(created.deletedAt).toBeUndefined();
    // shows up in the store list
    const listed = await sellersApi.list({ storeId: STORE });
    expect(listed.some((s) => s.id === created.id)).toBe(true);
  });

  it("rejects empty fullName", async () => {
    await expect(
      sellersApi.create({ storeId: STORE, fullName: "  ", email: "a@b.com", type: "internal" }),
    ).rejects.toThrow();
  });
});

describe("sellersApi.remove (soft delete)", () => {
  it("hides the seller from list() but get() still resolves", async () => {
    const created = await sellersApi.create({
      storeId: STORE,
      fullName: "Para Excluir",
      email: "excluir@example.com",
      type: "external",
      region: "Norte RS",
    });
    await sellersApi.remove(created.id);

    const listed = await sellersApi.list({ storeId: STORE });
    expect(listed.some((s) => s.id === created.id)).toBe(false);

    const fetched = await sellersApi.get(created.id);
    expect(fetched.deletedAt).toBeTruthy();
    expect(fetched.active).toBe(false);
  });

  it("throws for unknown id", async () => {
    await expect(sellersApi.remove("seller-nao-existe")).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `bun run test -- src/mocks/api/__tests__/sellers.test.ts`
Expected: FAIL — `sellersApi.create is not a function`.

- [ ] **Step 3: Estender o contrato**

Em `src/providers/data/contracts/sellers.ts`, substituir o conteúdo por:

```typescript
import type { ID, ISeller } from "@/shared/types";

export interface IListSellersParams {
  storeId?: ID;
  active?: boolean;
}

/** Input to register a brand-new seller (no platform access yet — PRD-107
 *  two-step flow: access is granted later via the invite Edge Functions). */
export interface ICreateSellerInput {
  storeId: ID;
  fullName: string;
  email: string;
  phone?: string;
  type: ISeller["type"];
  region?: string;
}

/**
 * Contract for seller (vendedor) access.
 *
 * @see ../../../mocks/api/sellers.ts
 * @see ../../../../docs/provider-pattern.md
 */
export interface ISellersProvider {
  /** Lists live sellers only — soft-deleted rows (deletedAt set) are hidden. */
  list(params?: IListSellersParams): Promise<ISeller[]>;
  /** Resolves any seller, including soft-deleted ones (historical references). */
  get(id: ID): Promise<ISeller>;
  setAvailability(id: ID, availability: ISeller["availability"]): Promise<ISeller>;
  /**
   * Patch arbitrary seller fields (PRD-019 — user editing their own profile;
   * users CRUD — Owner editing team members).
   */
  update(id: ID, patch: Partial<ISeller>): Promise<ISeller>;
  /** Creates a new seller with defaults (offline, parts, active). */
  create(input: ICreateSellerInput): Promise<ISeller>;
  /** Soft delete — sets deletedAt, deactivates and revokes login (if any). */
  remove(id: ID): Promise<void>;
}
```

- [ ] **Step 4: Implementar no mock api**

Em `src/mocks/api/sellers.ts`:

1. Trocar os imports do topo por:

```typescript
import type { ID, ISeller } from "@/shared/types";
import { selectAllSellers, selectSellerById } from "../store/selectors";
import { useMockStore } from "../store/mockStore";
import { patchById, upsert } from "../store/mutations";
import { MockNotFoundError, MockValidationError, runApi } from "./utils";
```

2. Adicionar a interface de input logo após `IListSellersParams` (o mock duplica os tipos do contrato por design — a camada mock não importa de providers):

```typescript
export interface ICreateSellerInput {
  storeId: ID;
  fullName: string;
  email: string;
  phone?: string;
  type: ISeller["type"];
  region?: string;
}
```

3. No método `list`, esconder excluídos — logo após `let all = selectAllSellers();`:

```typescript
        all = all.filter((s) => !s.deletedAt);
```

4. Adicionar ao objeto `sellersApi` (depois de `update`):

```typescript
  async create(input: ICreateSellerInput): Promise<ISeller> {
    return runApi(
      "sellersApi",
      "create",
      () => {
        if (!input.fullName.trim())
          throw new MockValidationError("fullName is required", "fullName");
        if (!input.email.trim()) throw new MockValidationError("email is required", "email");
        const created: ISeller = {
          id: `seller-${crypto.randomUUID()}`,
          storeId: input.storeId,
          fullName: input.fullName.trim(),
          email: input.email.trim().toLowerCase(),
          phone: input.phone?.trim() || undefined,
          type: input.type,
          region: input.region?.trim() || undefined,
          availability: "offline",
          divisions: ["parts"],
          active: true,
          createdAt: new Date().toISOString(),
        };
        upsert("sellers", created);
        return created;
      },
      { payload: input },
    );
  },

  async remove(id: ID): Promise<void> {
    return runApi(
      "sellersApi",
      "remove",
      () => {
        const patched = patchById("sellers", id, {
          deletedAt: new Date().toISOString(),
          active: false,
        } as Partial<ISeller>);
        if (!patched) throw new MockNotFoundError("seller", id);
      },
      { payload: { id } },
    );
  },
```

5. Delegar no impl mock — `src/providers/data/impl/mock/sellers.ts`:

```typescript
import { sellersApi } from "@/mocks";
import type { ISellersProvider } from "../../contracts/sellers";
import { scopedListParams } from "./_storeScope";

export const mockSellersProvider: ISellersProvider = {
  list: (params) => sellersApi.list(scopedListParams(params, "seller")),
  get: (id) => sellersApi.get(id),
  setAvailability: (id, availability) => sellersApi.setAvailability(id, availability),
  update: (id, patch) => sellersApi.update(id, patch),
  create: (input) => sellersApi.create(input),
  remove: (id) => sellersApi.remove(id),
};
```

- [ ] **Step 5: Rodar os testes e ver passar**

Run: `bun run test -- src/mocks/api/__tests__/sellers.test.ts`
Expected: PASS (4 testes). Atenção: se `media.test.ts` falhar no full run, é flaky conhecido (MockNetworkError simulado) — não relacionado.

- [ ] **Step 6: Commit**

```bash
git checkout -- src/routeTree.gen.ts
git add src/providers/data/contracts/sellers.ts src/mocks/api/sellers.ts src/mocks/api/__tests__/sellers.test.ts src/providers/data/impl/mock/sellers.ts
git commit -m "feat(sellers): create/remove (soft delete) in contract and mock provider"
```

---

### Task 3: Impl Supabase — mapping `deleted_at`, `create` e `remove`

**Files:**
- Modify: `src/providers/data/impl/supabase/sellers.ts`

- [ ] **Step 1: Mapear a coluna nova**

Em `src/providers/data/impl/supabase/sellers.ts`:

1. Em `SellerRow`, após `active: boolean;`:

```typescript
  deleted_at: string | null;
```

2. Na constante `COLUMNS`, acrescentar `deleted_at` ao final:

```typescript
const COLUMNS =
  "id, store_id, full_name, email, phone, type, availability, divisions, theme_preference, region, commission_tier, parent_seller_id, commission_rule, vehicle_cadastro_mode, active, created_at, deleted_at";
```

3. Em `rowToSeller`, após `active: row.active,`:

```typescript
    deletedAt: row.deleted_at ?? undefined,
```

- [ ] **Step 2: Esconder excluídos no `list`**

No método `list`, logo após `let query = getSupabaseClient().from(TABLE).select(COLUMNS);`:

```typescript
    query = query.is("deleted_at", null);
```

(`get` fica como está — excluídos continuam resolvíveis para histórico.)

- [ ] **Step 3: Implementar `create` e `remove`**

1. Ajustar o import do contrato no topo:

```typescript
import type { ICreateSellerInput, IListSellersParams, ISellersProvider } from "../../contracts/sellers";
```

2. Adicionar ao final do objeto `supabaseSellersProvider` (após `update`):

```typescript
  async create(input: ICreateSellerInput): Promise<ISeller> {
    // RLS sellers_insert (staff of the store) protects this direct insert; the
    // DB fills id/availability/divisions/active/created_at defaults.
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .insert({
        store_id: input.storeId,
        full_name: input.fullName.trim(),
        email: input.email.trim().toLowerCase(),
        phone: input.phone?.trim() || null,
        type: input.type,
        region: input.region?.trim() || null,
      })
      .select(COLUMNS)
      .single();
    if (error) throw new Error(`[supabase] sellers.create failed: ${error.message}`);
    return rowToSeller(data as SellerRow);
  },

  async remove(id: ID): Promise<void> {
    // Soft delete runs server-side (delete-seller Edge Function) because
    // revoking the login needs the service_role key.
    const { error } = await getSupabaseClient().functions.invoke("delete-seller", {
      body: { sellerId: id },
    });
    if (error) throw new Error(await extractFunctionError(error));
  },
```

3. Adicionar o helper no fim do arquivo (mesma técnica de `sellerAccess.ts` — o provider não importa de `features/`):

```typescript
/** Pulls the JSON `error` field out of a non-2xx Edge Function response. */
async function extractFunctionError(error: unknown): Promise<string> {
  const ctx = (error as { context?: Response }).context;
  if (ctx && typeof ctx.json === "function") {
    try {
      const body = (await ctx.json()) as { error?: string };
      if (body?.error) return body.error;
    } catch {
      /* fall through to the generic message */
    }
  }
  return error instanceof Error ? error.message : "Falha ao excluir o usuário.";
}
```

- [ ] **Step 4: Build**

Run: `bun run build`
Expected: verde. (O `bunx tsc --noEmit` tem baseline de erros pré-existentes — avaliar só por delta se for rodar.)

- [ ] **Step 5: Commit**

```bash
git add src/providers/data/impl/supabase/sellers.ts
git commit -m "feat(sellers): supabase create + soft-delete via delete-seller edge function"
```

---

### Task 4: Edge Function `delete-seller` (a 11ª) + deploy

**Files:**
- Create: `supabase/functions/delete-seller/index.ts`

- [ ] **Step 1: Escrever a função**

Criar `supabase/functions/delete-seller/index.ts`:

```typescript
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

/**
 * delete-seller (users CRUD) — soft-deletes a seller, server-side, with the
 * service_role key.
 *
 * Soft delete: removes the auth user + profile (frees the e-mail for future
 * reuse), then marks `sellers.deleted_at` and flips `active` off. The sellers
 * row stays — 31 tables reference it (orders, customers, audit...), so history
 * keeps resolving. Provider list() hides rows with deleted_at set.
 *
 * Guards: caller must be an Owner; the target must belong to the caller's
 * store; nobody may delete themselves or an Owner.
 *
 * Shared lifecycle/auth/error patterns: supabase/functions/_shared (PRD-102).
 */

import { bestEffortAudit } from "../_shared/audit.ts";
import { requireCaller } from "../_shared/auth.ts";
import { HttpError, json, parseJsonBody } from "../_shared/http.ts";
import { servePost } from "../_shared/serve.ts";

servePost(async (req, { log }) => {
  // 1) Identify the caller and require Owner (stricter than set-seller-access —
  //    deleting is effectively irreversible for the login).
  const { callerId, admin, profile } = await requireCaller(req, ["owner"]);

  // 2) Parse + validate the input.
  const body = await parseJsonBody(req);
  const sellerId = String(body.sellerId ?? "");
  if (!sellerId) throw new HttpError(400, "missing sellerId");

  // 3) Resolve the target seller (may have no access profile at all).
  const { data: seller } = await admin
    .from("sellers")
    .select("id, store_id, deleted_at")
    .eq("id", sellerId)
    .maybeSingle();
  if (!seller || seller.store_id !== profile.store_id) {
    throw new HttpError(404, "seller not found in your store");
  }
  if (seller.deleted_at) throw new HttpError(409, "seller is already deleted");

  // 4) Guards on the access profile (when one exists).
  const { data: access } = await admin
    .from("profiles")
    .select("auth_user_id, role")
    .eq("seller_id", sellerId)
    .maybeSingle();
  if (access?.auth_user_id === callerId) {
    throw new HttpError(403, "you cannot delete yourself");
  }
  if (access?.role === "owner") {
    throw new HttpError(403, "owners cannot be deleted");
  }

  // 5) Revoke the login: delete auth user + profile (frees the e-mail).
  if (access) {
    const { error: authErr } = await admin.auth.admin.deleteUser(access.auth_user_id);
    if (authErr) throw new HttpError(400, `could not delete auth user: ${authErr.message}`);
    // Idempotent — a FK cascade may have removed the row already.
    const { error: profErr } = await admin.from("profiles").delete().eq("seller_id", sellerId);
    if (profErr) throw new HttpError(400, `could not delete profile: ${profErr.message}`);
  }

  // 6) Soft-delete the business row.
  const now = new Date().toISOString();
  const { error: sellerErr } = await admin
    .from("sellers")
    .update({ deleted_at: now, active: false, updated_at: now })
    .eq("id", sellerId);
  if (sellerErr) throw new HttpError(400, `could not soft-delete seller: ${sellerErr.message}`);

  // 7) Audit — best-effort.
  await bestEffortAudit(admin, {
    store_id: profile.store_id,
    actor_id: callerId,
    action: "seller.deleted",
    resource: "seller",
    resource_id: sellerId,
    after: { deleted: true, hadAccess: Boolean(access) },
  });

  log.info("seller soft-deleted", { sellerId, hadAccess: Boolean(access) });
  return json({ sellerId, deleted: true }, 200);
});
```

- [ ] **Step 2: Deploy via MCP**

Usar a tool MCP `mcp__supabase__deploy_edge_function` com `name: "delete-seller"` e o conteúdo do arquivo (entrypoint `index.ts`). Manter `verify_jwt` default (true), como as demais funções de gestão.

Expected: deploy ok; `mcp__supabase__list_edge_functions` passa a listar `delete-seller`.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/delete-seller/index.ts
git commit -m "feat(edge): delete-seller function — owner-only soft delete with auth revocation"
```

---

### Task 5: Schema zod do formulário — TDD

**Files:**
- Test: `src/features/admin-settings/engine/sellerForm.test.ts` (novo)
- Create: `src/features/admin-settings/engine/sellerForm.ts`

- [ ] **Step 1: Escrever os testes que falham**

Criar `src/features/admin-settings/engine/sellerForm.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { sellerFormSchema, showRegionField } from "./sellerForm";

describe("sellerFormSchema", () => {
  const valid = {
    fullName: "Maria Souza",
    email: "MARIA@Example.com",
    phone: "",
    type: "internal" as const,
    region: "",
  };

  it("accepts a valid payload and normalizes the email", () => {
    const parsed = sellerFormSchema.parse(valid);
    expect(parsed.email).toBe("maria@example.com");
  });

  it("rejects fullName shorter than 3 chars", () => {
    expect(sellerFormSchema.safeParse({ ...valid, fullName: "Jo" }).success).toBe(false);
  });

  it("rejects an invalid email", () => {
    expect(sellerFormSchema.safeParse({ ...valid, email: "nao-eh-email" }).success).toBe(false);
  });

  it("rejects an unknown type", () => {
    expect(sellerFormSchema.safeParse({ ...valid, type: "gerente" }).success).toBe(false);
  });
});

describe("showRegionField", () => {
  it("hides region for internal sellers", () => {
    expect(showRegionField("internal")).toBe(false);
  });
  it("shows region for external and representative", () => {
    expect(showRegionField("external")).toBe(true);
    expect(showRegionField("representative")).toBe(true);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `bun run test -- src/features/admin-settings/engine/sellerForm.test.ts`
Expected: FAIL — módulo `./sellerForm` não existe.

- [ ] **Step 3: Implementar o schema**

Criar `src/features/admin-settings/engine/sellerForm.ts`:

```typescript
import { z } from "zod";
import type { ISeller } from "@/shared/types";

/** Form schema shared by the create and edit flows of SellerFormDialog. */
export const sellerFormSchema = z.object({
  fullName: z.string().trim().min(3, "Informe o nome completo (mínimo 3 letras)."),
  email: z.string().trim().toLowerCase().email("Informe um e-mail válido."),
  phone: z.string().trim().optional().or(z.literal("")),
  type: z.enum(["internal", "external", "representative"], {
    message: "Selecione o tipo do usuário.",
  }),
  region: z.string().trim().optional().or(z.literal("")),
});

export type SellerFormValues = z.infer<typeof sellerFormSchema>;

/** Region only applies to field roles (PRD model: reserved for external). */
export function showRegionField(type: ISeller["type"]): boolean {
  return type !== "internal";
}

export const SELLER_TYPE_OPTIONS: { value: ISeller["type"]; label: string }[] = [
  { value: "internal", label: "Vendedor interno" },
  { value: "external", label: "Vendedor externo" },
  { value: "representative", label: "Representante" },
];
```

Nota: se o `z.enum` da versão instalada do zod não aceitar `{ message }`, usar `{ errorMap: () => ({ message: "Selecione o tipo do usuário." }) }` ou omitir o segundo argumento — o teste só exige a rejeição.

- [ ] **Step 4: Rodar e ver passar**

Run: `bun run test -- src/features/admin-settings/engine/sellerForm.test.ts`
Expected: PASS (6 testes).

- [ ] **Step 5: Commit**

```bash
git add src/features/admin-settings/engine/sellerForm.ts src/features/admin-settings/engine/sellerForm.test.ts
git commit -m "feat(admin-settings): seller form zod schema with region visibility helper"
```

---

### Task 6: `SellerFormDialog` (criar + editar)

**Files:**
- Create: `src/features/admin-settings/components/SellerFormDialog.tsx`

- [ ] **Step 1: Criar o componente**

```tsx
import { useEffect } from "react";
import { toast } from "sonner";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Icon } from "@/components/Icon";
import type { ISeller } from "@/shared/types";
import { useSellersProvider } from "@/providers/data";
import {
  SELLER_TYPE_OPTIONS,
  sellerFormSchema,
  showRegionField,
  type SellerFormValues,
} from "../engine/sellerForm";

interface ISellerFormDialogProps {
  storeId: string;
  /** Present = edit mode; absent = create mode. */
  seller?: ISeller | null;
  /** Whether the seller already has a platform login (edit mode e-mail notice). */
  hasAccess?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Create/edit dialog for team members (users CRUD). Creating registers the
 * seller WITHOUT platform access — the existing "Criar acesso" flow grants the
 * login afterwards (two-step decision in the design spec).
 */
export function SellerFormDialog({
  storeId,
  seller,
  hasAccess = false,
  open,
  onOpenChange,
}: ISellerFormDialogProps) {
  const isEdit = Boolean(seller);
  const provider = useSellersProvider();
  const queryClient = useQueryClient();

  const form = useForm<SellerFormValues>({
    resolver: zodResolver(sellerFormSchema),
    defaultValues: {
      fullName: seller?.fullName ?? "",
      email: seller?.email ?? "",
      phone: seller?.phone ?? "",
      type: seller?.type ?? "internal",
      region: seller?.region ?? "",
    },
  });

  // Re-sync when the dialog opens for a different seller.
  useEffect(() => {
    if (!open) return;
    form.reset({
      fullName: seller?.fullName ?? "",
      email: seller?.email ?? "",
      phone: seller?.phone ?? "",
      type: seller?.type ?? "internal",
      region: seller?.region ?? "",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, seller?.id]);

  const watchedType = form.watch("type");
  const watchedEmail = form.watch("email");
  const emailChanged = isEdit && hasAccess && watchedEmail.trim().toLowerCase() !== seller?.email;

  const mutation = useMutation({
    mutationFn: async (values: SellerFormValues) => {
      const region = showRegionField(values.type) ? values.region?.trim() || undefined : undefined;
      if (isEdit && seller) {
        return provider.update(seller.id, {
          fullName: values.fullName,
          email: values.email,
          phone: values.phone?.trim() || undefined,
          type: values.type,
          region,
        });
      }
      return provider.create({
        storeId,
        fullName: values.fullName,
        email: values.email,
        phone: values.phone?.trim() || undefined,
        type: values.type,
        region,
      });
    },
    onSuccess: (saved) => {
      toast.success(
        isEdit ? `Dados de ${saved.fullName} atualizados.` : `${saved.fullName} cadastrado(a).`,
        {
          description: isEdit
            ? undefined
            : "Use “Criar acesso” quando quiser liberar o login na plataforma.",
        },
      );
      void queryClient.invalidateQueries({ queryKey: ["sellers", storeId] });
      onOpenChange(false);
    },
    onError: (err: Error) =>
      toast.error(isEdit ? "Não foi possível salvar" : "Não foi possível cadastrar", {
        description: err.message,
      }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEdit ? `Editar usuário — ${seller?.fullName}` : "Novo usuário"}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Atualiza os dados cadastrais do membro da equipe."
              : "Cadastra um membro da equipe. O acesso à plataforma é liberado depois, pelo botão “Criar acesso”."}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
            className="space-y-4 py-2"
          >
            <FormField
              control={form.control}
              name="fullName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome completo</FormLabel>
                  <FormControl>
                    <Input autoComplete="off" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>E-mail</FormLabel>
                  <FormControl>
                    <Input type="email" autoComplete="off" {...field} />
                  </FormControl>
                  {emailChanged && (
                    <p className="flex items-start gap-1.5 rounded-md border border-severity-warning/30 bg-severity-warning/10 px-2.5 py-1.5 text-xs text-severity-warning">
                      <Icon icon="mdi:alert-outline" size={14} className="mt-0.5 shrink-0" />
                      O acesso continua pelo e-mail antigo. O e-mail de login não é alterado.
                    </p>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Telefone (opcional)</FormLabel>
                  <FormControl>
                    <Input type="tel" autoComplete="off" placeholder="(55) 99999-9999" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tipo</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione o tipo" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {SELLER_TYPE_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {showRegionField(watchedType) && (
              <FormField
                control={form.control}
                name="region"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Região de atuação (opcional)</FormLabel>
                    <FormControl>
                      <Input autoComplete="off" placeholder="Ex.: Norte do RS" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
                disabled={mutation.isPending}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? "Salvando…" : isEdit ? "Salvar alterações" : "Cadastrar"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Build**

Run: `bun run build`
Expected: verde (componente ainda não referenciado — entra na Task 8).

- [ ] **Step 3: Commit**

```bash
git add src/features/admin-settings/components/SellerFormDialog.tsx
git commit -m "feat(admin-settings): SellerFormDialog for create/edit team members"
```

---

### Task 7: `DeleteSellerDialog` (confirmação destrutiva)

**Files:**
- Create: `src/features/admin-settings/components/DeleteSellerDialog.tsx`

- [ ] **Step 1: Criar o componente**

```tsx
import { toast } from "sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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
import type { ISeller } from "@/shared/types";
import { useSellersProvider } from "@/providers/data";

interface IDeleteSellerDialogProps {
  seller: ISeller;
  storeId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Destructive confirmation for the soft delete (users CRUD): the seller loses
 * the login and disappears from every list, but the record stays in the
 * database so orders/conversations history keeps resolving.
 */
export function DeleteSellerDialog({
  seller,
  storeId,
  open,
  onOpenChange,
}: IDeleteSellerDialogProps) {
  const provider = useSellersProvider();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => provider.remove(seller.id),
    onSuccess: () => {
      toast.success(`${seller.fullName} foi excluído(a).`, {
        description: "O histórico de vendas e conversas permanece preservado.",
      });
      void queryClient.invalidateQueries({ queryKey: ["sellers", storeId] });
      void queryClient.invalidateQueries({ queryKey: ["seller-access", storeId] });
      onOpenChange(false);
    },
    onError: (err: Error) =>
      toast.error("Não foi possível excluir o usuário", { description: err.message }),
  });

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Excluir {seller.fullName}?</AlertDialogTitle>
          <AlertDialogDescription>
            O usuário perde o acesso à plataforma e deixa de aparecer nas listas (equipe,
            distribuição, rankings). O histórico de vendas, clientes e conversas permanece
            preservado. Esta ação não pode ser desfeita pela tela.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={mutation.isPending}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={(e) => {
              e.preventDefault();
              mutation.mutate();
            }}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? "Excluindo…" : "Excluir usuário"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
```

- [ ] **Step 2: Build + commit**

Run: `bun run build` → verde.

```bash
git add src/features/admin-settings/components/DeleteSellerDialog.tsx
git commit -m "feat(admin-settings): DeleteSellerDialog destructive confirmation"
```

---

### Task 8: Reforma da página — `UsersPage` (rename + Novo/Editar/Excluir)

**Files:**
- Rename: `src/features/admin-settings/pages/UsersPlaceholderPage.tsx` → `src/features/admin-settings/pages/UsersPage.tsx` (via `git mv`)
- Modify: `src/features/admin-settings/index.ts`
- Modify: `src/routes/app.configuracoes.usuarios.tsx`

- [ ] **Step 1: Renomear preservando histórico**

```bash
git mv src/features/admin-settings/pages/UsersPlaceholderPage.tsx src/features/admin-settings/pages/UsersPage.tsx
```

- [ ] **Step 2: Reescrever a página**

Substituir o conteúdo de `src/features/admin-settings/pages/UsersPage.tsx` por:

```tsx
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Icon } from "@/components/Icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { ISeller } from "@/shared/types";
import { useCurrentStore } from "@/features/multistore";
import { useSellersProvider } from "@/providers/data";
import { AUTH_SOURCE } from "@/features/auth/authSource";
import { useAuth } from "@/features/auth/useAuth";
import { SectionHeader } from "../components/SectionHeader";
import { listSellerAccessRoles, type InviteSellerRole } from "../api/sellerAccess";
import { CreateAccessDialog } from "../components/CreateAccessDialog";
import { ChangeRoleDialog } from "../components/ChangeRoleDialog";
import { ResetPasswordDialog } from "../components/ResetPasswordDialog";
import { ToggleSellerAccessButton } from "../components/ToggleSellerAccessButton";
import { SellerFormDialog } from "../components/SellerFormDialog";
import { DeleteSellerDialog } from "../components/DeleteSellerDialog";

const ROLE_LABEL: Record<ISeller["type"], string> = {
  internal: "Vendedor interno",
  external: "Vendedor externo",
  representative: "Representante",
};

const SUPABASE_AUTH = AUTH_SOURCE === "supabase";

/**
 * Usuários — CRUD completo da equipe (users CRUD + PRD-107 Fase 3).
 *
 * Cadastro/edição/exclusão (soft delete) funcionam em ambas as fontes de dados
 * via ISellersProvider. As operações de ACESSO (criar login, redefinir senha,
 * papéis, desligar/reativar) exigem o backend Supabase (Edge Functions).
 */
export function UsersPage() {
  const { currentStoreId } = useCurrentStore();
  const storeId = currentStoreId ?? "00000000-0000-0000-0000-000000000001";
  const provider = useSellersProvider();
  const [inviteFor, setInviteFor] = useState<ISeller | null>(null);
  const [resetFor, setResetFor] = useState<ISeller | null>(null);
  const [roleFor, setRoleFor] = useState<ISeller | null>(null);
  const [editFor, setEditFor] = useState<ISeller | null>(null);
  const [deleteFor, setDeleteFor] = useState<ISeller | null>(null);
  const [creating, setCreating] = useState(false);
  const { userRole, currentUser } = useAuth();
  const isOwner = userRole === "Owner";

  const sellersQuery = useQuery({
    queryKey: ["sellers", storeId],
    queryFn: () => provider.list({ storeId }),
  });

  const accessQuery = useQuery({
    queryKey: ["seller-access", storeId],
    queryFn: () => listSellerAccessRoles(storeId),
    enabled: SUPABASE_AUTH,
  });

  const sellers = sellersQuery.data;
  const accessRoles = accessQuery.data ?? new Map<string, string>();

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Usuários"
        description="Gerencie quem tem acesso à plataforma — vendedores internos, externos, representantes e usuários administrativos."
      />

      {!SUPABASE_AUTH && (
        <div className="rounded-md border border-dashed border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
          As operações de acesso (criar login, redefinir senha, papéis, desligar) exigem o backend
          Supabase ativo (<code className="font-mono text-xs">VITE_AUTH_SOURCE=supabase</code>).
          Cadastro, edição e exclusão funcionam também em modo demonstração.
        </div>
      )}

      <div className="rounded-md border border-border bg-card p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Equipe atual da loja
          </p>
          <Button size="sm" className="gap-1.5" onClick={() => setCreating(true)}>
            <Icon icon="mdi:account-plus" size={16} />
            Novo usuário
          </Button>
        </div>
        {!sellers ? (
          <Skeleton className="h-32 w-full" />
        ) : (
          <ul className="space-y-2">
            {sellers.map((s) => {
              const accessRole = accessRoles.get(s.id);
              const hasAccess = accessRole !== undefined;
              const isOwnerAccess = accessRole === "owner";
              const isSelf = currentUser?.sellerId === s.id;
              return (
                <li
                  key={s.id}
                  className="flex items-center justify-between gap-3 rounded-md border border-border bg-background px-3 py-2"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                      {s.fullName.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-medium">{s.fullName}</p>
                      <p className="text-xs text-muted-foreground">{s.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{ROLE_LABEL[s.type]}</Badge>
                    {SUPABASE_AUTH && accessRole === "manager" && (
                      <Badge variant="outline" className="border-primary/40 text-primary">
                        Gestor
                      </Badge>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="gap-1.5"
                      onClick={() => setEditFor(s)}
                    >
                      <Icon icon="mdi:pencil-outline" size={14} />
                      Editar
                    </Button>
                    {SUPABASE_AUTH &&
                      (accessQuery.isLoading ? (
                        <Skeleton className="h-6 w-28" />
                      ) : !hasAccess ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5"
                          onClick={() => setInviteFor(s)}
                        >
                          <Icon icon="mdi:account-plus-outline" size={14} />
                          Criar acesso
                        </Button>
                      ) : (
                        <>
                          {s.active ? (
                            <Badge
                              variant="outline"
                              className="gap-1 border-severity-success/40 text-severity-success"
                            >
                              <Icon icon="mdi:check-circle" size={12} />
                              Acesso ativo
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="gap-1 text-muted-foreground">
                              <Icon icon="mdi:cancel" size={12} />
                              Desligado
                            </Badge>
                          )}
                          {!isOwnerAccess && (
                            <>
                              {isOwner && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="gap-1.5"
                                  onClick={() => setRoleFor(s)}
                                >
                                  <Icon icon="mdi:account-switch-outline" size={14} />
                                  Alterar papel
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="ghost"
                                className="gap-1.5"
                                onClick={() => setResetFor(s)}
                              >
                                <Icon icon="mdi:key-variant" size={14} />
                                Redefinir senha
                              </Button>
                              <ToggleSellerAccessButton seller={s} storeId={storeId} />
                            </>
                          )}
                        </>
                      ))}
                    {!isOwnerAccess && !isSelf && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="gap-1.5 text-destructive hover:text-destructive"
                        onClick={() => setDeleteFor(s)}
                      >
                        <Icon icon="mdi:trash-can-outline" size={14} />
                        Excluir
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {SUPABASE_AUTH && accessQuery.isError && (
          <p className="mt-3 text-xs text-severity-critical">
            Não foi possível carregar o status de acesso. Verifique se você está logado como gestor.
          </p>
        )}
      </div>

      {SUPABASE_AUTH && (
        <p className="text-xs italic text-muted-foreground">
          O cadastro cria o usuário sem login — use “Criar acesso” para liberar a plataforma (senha
          temporária ou convite por e-mail). A exclusão preserva o histórico de vendas e conversas.
        </p>
      )}

      {(creating || editFor) && (
        <SellerFormDialog
          storeId={storeId}
          seller={editFor}
          hasAccess={editFor ? accessRoles.has(editFor.id) : false}
          open={creating || editFor !== null}
          onOpenChange={(open) => {
            if (!open) {
              setCreating(false);
              setEditFor(null);
            }
          }}
        />
      )}

      {deleteFor && (
        <DeleteSellerDialog
          seller={deleteFor}
          storeId={storeId}
          open={deleteFor !== null}
          onOpenChange={(open) => {
            if (!open) setDeleteFor(null);
          }}
        />
      )}

      {inviteFor && (
        <CreateAccessDialog
          seller={inviteFor}
          storeId={storeId}
          open={inviteFor !== null}
          onOpenChange={(open) => {
            if (!open) setInviteFor(null);
          }}
        />
      )}

      {resetFor && (
        <ResetPasswordDialog
          seller={resetFor}
          open={resetFor !== null}
          onOpenChange={(open) => {
            if (!open) setResetFor(null);
          }}
        />
      )}

      {roleFor && (
        <ChangeRoleDialog
          seller={roleFor}
          storeId={storeId}
          currentRole={(accessRoles.get(roleFor.id) ?? "seller_internal") as InviteSellerRole}
          open={roleFor !== null}
          onOpenChange={(open) => {
            if (!open) setRoleFor(null);
          }}
        />
      )}
    </div>
  );
}
```

Observações de wiring que o código acima já cumpre:
- "Excluir" oculto para linhas de Owner (`isOwnerAccess`) e para o próprio usuário (`isSelf` via `currentUser?.sellerId`).
- "Editar" disponível em qualquer fonte de dados (mock e supabase).
- `hasAccess` alimenta o aviso de e-mail do `SellerFormDialog`.

- [ ] **Step 3: Atualizar barrel e rota**

Em `src/features/admin-settings/index.ts`, trocar:

```typescript
export { UsersPlaceholderPage } from "./pages/UsersPlaceholderPage";
```

por:

```typescript
export { UsersPage } from "./pages/UsersPage";
```

Em `src/routes/app.configuracoes.usuarios.tsx`, trocar o import e o uso:

```tsx
import { UsersPage } from "@/features/admin-settings";
```

e no `component`: `<UsersPage />` no lugar de `<UsersPlaceholderPage />`.

Verificar consumidores restantes: `grep -r "UsersPlaceholderPage" src/` deve retornar vazio.

- [ ] **Step 4: Build + testes completos**

Run: `bun run build` → verde.
Run: `bun run test` → verde (flaky conhecido: `media.test.ts` com MockNetworkError simulado — re-rodar isolado se falhar).

- [ ] **Step 5: Commit**

```bash
git checkout -- src/routeTree.gen.ts
git add src/features/admin-settings/pages/UsersPage.tsx src/features/admin-settings/index.ts src/routes/app.configuracoes.usuarios.tsx
git rm --cached src/features/admin-settings/pages/UsersPlaceholderPage.tsx 2>$null; exit 0
git commit -m "feat(admin-settings): UsersPage with full CRUD - new user, edit, soft delete"
```

(O `git mv` do Step 1 já encena o rename; o `git rm --cached` é apenas defensivo caso o estágio se perca — se der erro "not staged", ignorar.)

---

### Task 9: Gate final, push e PR

- [ ] **Step 1: Suíte completa + build**

Run: `bun run test` e `bun run build`
Expected: ambos verdes.

- [ ] **Step 2: Conferir que nada indevido vai no PR**

```bash
git status --porcelain
```

Expected: `vite.config.ts` modificado (NÃO commitar — é do dono), `src/routeTree.gen.ts` possivelmente modificado (descartar: `git checkout -- src/routeTree.gen.ts`), untracked de PRDs/sigpro/knip (NÃO adicionar). Modificações em massa de outros arquivos são CRLF falso-positivo (`git diff --ignore-cr-at-eol --stat` para confirmar).

- [ ] **Step 3: Push e PR**

```bash
git push -u origin feat/users-crud
gh pr create --title "feat: full users CRUD - create, edit and soft-delete team members" --body "## Resumo
- Cadastro de usuário novo (sem acesso — fluxo de 2 passos com o \"Criar acesso\" existente)
- Edição de dados (nome, e-mail c/ aviso de login, telefone, tipo, região)
- Exclusão soft delete: Edge Function delete-seller (owner-only) revoga o login, marca sellers.deleted_at e preserva todo o histórico
- Migration sellers_soft_delete aplicada e espelhada; list() esconde excluídos em mock e supabase
- Spec: docs/superpowers/specs/2026-06-11-users-crud-design.md

## Testes
- bun run test (mock provider create/remove/filtro + schema zod do form)
- bun run build verde

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

Expected: PR criada. **NÃO mergear** — o merge e o bump de versão dependem de aprovação explícita do dono.

---

## Self-review (feito na escrita)

- **Cobertura da spec:** §1 migration+tipo → Task 1; §2 contrato/mock/supabase+filtros → Tasks 2-3; §3 edge function → Task 4; §4 UI (form dialog, delete dialog, página, avisos, mock mode, invalidations) → Tasks 5-8; §5 testes/gate/PR → Tasks 2, 5, 9. Fora de escopo respeitado (sem sync de e-mail de login, sem reatribuição).
- **Desvio consciente da spec:** o invoke da `delete-seller` vive no próprio impl supabase (helper local `extractFunctionError`) em vez de `sellerAccess.ts` — provider não deve importar de `features/` (direção de dependência); comportamento idêntico.
- **Consistência de tipos:** `ICreateSellerInput` igual no contrato e no mock api (duplicação intencional da camada); `SellerFormValues` casa com os campos usados no dialog; `remove(id): Promise<void>` nas três camadas.
