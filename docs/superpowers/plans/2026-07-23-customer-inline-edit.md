# Customer Inline Edit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** "Editar dados" na ficha do cliente vira edição inline real no card "Dados cadastrais" (aba Visão geral da página de detalhe), com engine puro testado e clears funcionando no Supabase.

**Architecture:** Espelha o padrão da ficha de lead (PRs #343/#344): engine puro `toDraft/validate/buildPatch` + card que alterna leitura ↔ inputs no lugar. O modo de edição é **self-contained no `CadastraisCard`** (prop opcional `editable`), então a ficha lateral do Atendimento — que monta o mesmo card — não muda de comportamento. O menu ⋮ "Editar dados" pula para a aba Visão geral e dispara um sinal (contador) que liga a edição.

**Tech Stack:** React 19, TanStack Query, shadcn/ui, Vitest, Provider Pattern (`@/providers/data`), Supabase (RLS `customers_update` já cobre — sem migration).

## Global Constraints

- UI pt-BR com acentos corretos; comentários/código em inglês; arquivos kebab-case não se aplica aqui (arquivos existentes mantêm padrão da feature: `customerDraft.ts` segue `leadDraft.ts`).
- Fora de `src/mocks/**`/`src/providers/data/**`, dados só via barrel `@/providers/data`.
- Gate de escrita = RBAC `usePermission("customer","edit")` **E** predicado da RLS: `hasRole(["Owner","Gestor"]) || customer.sellerId === currentUser.sellerId` (usar `currentUser.sellerId`, NUNCA `currentUser.id`).
- Telefone e tipo B2B↔B2C **fora do escopo** (read-only; ver spec).
- `bun run test` + `bun run build` verdes; `bunx tsc --noEmit` avaliado por delta vs baseline (~315 erros pré-existentes).
- Commits atômicos Conventional Commits; nunca mergear; PR draft no final.

---

### Task 1: Engine puro `customerDraft.ts` (TDD)

**Files:**
- Create: `src/features/customers/utils/customerDraft.ts`
- Test: `src/features/customers/utils/customerDraft.test.ts`
- Modify: `src/features/customers/i18n/pt-BR.ts` (strings novas em `overview.cadastrais`)

**Interfaces:**
- Consumes: `ICustomer`/`ICustomerAddress` de `@/shared/types`; `formatCnpj/formatCpf/isValidCnpj/isValidCpf/onlyDigits` de `./cnpjCpf`; `CUSTOMER_STRINGS` do i18n.
- Produces (Task 3 depende):
  - `interface ICustomerDraft { razaoSocial; nomeFantasia; cnpj; contactName; fullName; cpf; email; street; number; complement; district; city; state; zipCode }` (todas `string`)
  - `interface ICustomerDraftErrors { razaoSocial?; cnpj?; fullName?; cpf?; email?; street?; city?; state?; zipCode?: string }`
  - `toCustomerDraft(customer: ICustomer): ICustomerDraft`
  - `validateCustomerDraft(draft: ICustomerDraft, type: ICustomer["type"]): ICustomerDraftErrors`
  - `buildCustomerPatch(customer: ICustomer, draft: ICustomerDraft): Partial<ICustomer>`
  - `formatCep(value: string): string`

- [ ] **Step 1: i18n primeiro** — em `CUSTOMER_STRINGS.overview.cadastrais` (após `noAddress`):

```ts
      email: "E-mail",
      phone: "Telefone",
      noEmail: "Sem e-mail",
      edit: "Editar dados",
      save: "Salvar",
      cancel: "Cancelar",
      saving: "Salvando…",
      editSavedToast: "Dados do cliente atualizados.",
      editFailedToast: "Não foi possível salvar os dados do cliente.",
      phoneReadOnlyHint:
        "O telefone é a âncora do WhatsApp e não pode ser editado aqui.",
      addressStreet: "Rua",
      addressNumber: "Número",
      addressComplement: "Complemento",
      addressDistrict: "Bairro",
      addressCity: "Cidade",
      addressState: "UF",
      addressZip: "CEP",
      errors: {
        razaoSocialRequired: "Informe a razão social.",
        fullNameRequired: "Informe o nome completo.",
        invalidCnpj: "CNPJ inválido.",
        invalidCpf: "CPF inválido.",
        invalidEmail: "E-mail inválido.",
        streetRequired: "Informe a rua.",
        cityRequired: "Informe a cidade.",
        invalidState: "UF deve ter 2 letras.",
        invalidZip: "CEP deve ter 8 dígitos.",
      },
```

- [ ] **Step 2: Testes que falham** (`customerDraft.test.ts`) — casos mínimos:
  - round-trip B2B sem mudanças → `buildCustomerPatch` = `{}` (nem `type`);
  - mudar `razaoSocial` → patch contém `razaoSocial` **e** `type: "B2B"`;
  - mudar só `email` → patch sem `type`;
  - limpar e-mail (`""` com `customer.email` preenchido) → `"email" in patch === true` e `patch.email === undefined`;
  - limpar todos os campos de endereço com `customer.address` preenchido → `"address" in patch` e `undefined`;
  - endereço novo válido → `patch.address` com `state` uppercase e `zipCode` formatado `"98700-000"`;
  - CNPJ digitado com máscara → patch só dígitos; CNPJ inválido → erro `invalidCnpj`; CNPJ vazio → sem erro;
  - CPF idem; `fullName` vazio (B2C) → `fullNameRequired`;
  - endereço parcial (só cidade) → `streetRequired`; UF com 1 letra → `invalidState`; CEP com 5 dígitos → `invalidZip`;
  - e-mail inválido → `invalidEmail`; draft intocado de cliente B2C → `{}`.

- [ ] **Step 3: Rodar e ver falhar** — `bun run test -- customerDraft` → FAIL (módulo não existe).

- [ ] **Step 4: Implementar `customerDraft.ts`:**

```ts
import type { ICustomer, ICustomerAddress } from "@/shared/types";
import { formatCnpj, formatCpf, isValidCnpj, isValidCpf, onlyDigits } from "./cnpjCpf";
import { CUSTOMER_STRINGS } from "../i18n/pt-BR";

const ERR = CUSTOMER_STRINGS.overview.cadastrais.errors;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface ICustomerDraft { /* ver Interfaces acima */ }
export interface ICustomerDraftErrors { /* ver Interfaces acima */ }

export function formatCep(value: string): string {
  const d = onlyDigits(value).slice(0, 8);
  return d.length <= 5 ? d : `${d.slice(0, 5)}-${d.slice(5)}`;
}

export function toCustomerDraft(customer: ICustomer): ICustomerDraft {
  const address = customer.address;
  return {
    razaoSocial: customer.type === "B2B" ? customer.razaoSocial : "",
    nomeFantasia: customer.type === "B2B" ? customer.nomeFantasia : "",
    cnpj: customer.type === "B2B" ? formatCnpj(customer.cnpj) : "",
    contactName: customer.type === "B2B" ? customer.contactName : "",
    fullName: customer.type === "B2C" ? customer.fullName : "",
    cpf: customer.type === "B2C" ? formatCpf(customer.cpf) : "",
    email: customer.email ?? "",
    street: address?.street ?? "",
    number: address?.number ?? "",
    complement: address?.complement ?? "",
    district: address?.district ?? "",
    city: address?.city ?? "",
    state: address?.state ?? "",
    zipCode: address ? formatCep(address.zipCode) : "",
  };
}

const ADDRESS_KEYS = ["street", "number", "complement", "district", "city", "state", "zipCode"] as const;

function hasAddressInput(draft: ICustomerDraft): boolean {
  return ADDRESS_KEYS.some((k) => draft[k].trim() !== "");
}

export function validateCustomerDraft(draft: ICustomerDraft, type: ICustomer["type"]): ICustomerDraftErrors {
  const errors: ICustomerDraftErrors = {};
  if (type === "B2B") {
    if (!draft.razaoSocial.trim()) errors.razaoSocial = ERR.razaoSocialRequired;
    if (onlyDigits(draft.cnpj) && !isValidCnpj(draft.cnpj)) errors.cnpj = ERR.invalidCnpj;
  } else {
    if (!draft.fullName.trim()) errors.fullName = ERR.fullNameRequired;
    if (onlyDigits(draft.cpf) && !isValidCpf(draft.cpf)) errors.cpf = ERR.invalidCpf;
  }
  if (draft.email.trim() && !EMAIL_RE.test(draft.email.trim())) errors.email = ERR.invalidEmail;
  if (hasAddressInput(draft)) {
    if (!draft.street.trim()) errors.street = ERR.streetRequired;
    if (!draft.city.trim()) errors.city = ERR.cityRequired;
    if (!/^[A-Za-z]{2}$/.test(draft.state.trim())) errors.state = ERR.invalidState;
    if (draft.zipCode.trim() && onlyDigits(draft.zipCode).length !== 8) errors.zipCode = ERR.invalidZip;
  }
  return errors;
}

function buildAddress(draft: ICustomerDraft): ICustomerAddress | undefined {
  if (!hasAddressInput(draft)) return undefined;
  return {
    street: draft.street.trim(),
    number: draft.number.trim(),
    complement: draft.complement.trim() || undefined,
    district: draft.district.trim(),
    city: draft.city.trim(),
    state: draft.state.trim().toUpperCase(),
    zipCode: formatCep(draft.zipCode),
  };
}

function sameAddress(a: ICustomerAddress | undefined, b: ICustomerAddress | undefined): boolean {
  if (!a || !b) return !a && !b;
  return (
    a.street === b.street && a.number === b.number &&
    (a.complement ?? "") === (b.complement ?? "") && a.district === b.district &&
    a.city === b.city && a.state === b.state && onlyDigits(a.zipCode) === onlyDigits(b.zipCode)
  );
}

/**
 * Only fields whose value actually changed vs the customer. Variant fields
 * always ship together with `type` — `customerPatchToRow` only maps them when
 * the patch carries the discriminant. Cleared email/address are emitted with
 * the KEY PRESENT and an `undefined` value ("key in patch" contract with the
 * supabase mapper, mirroring `buildLeadPatch`).
 */
export function buildCustomerPatch(customer: ICustomer, draft: ICustomerDraft): Partial<ICustomer> {
  const patch: Record<string, unknown> = {};

  if (customer.type === "B2B") {
    const razaoSocial = draft.razaoSocial.trim();
    if (razaoSocial && razaoSocial !== customer.razaoSocial) patch.razaoSocial = razaoSocial;
    const nomeFantasia = draft.nomeFantasia.trim();
    if (nomeFantasia !== customer.nomeFantasia) patch.nomeFantasia = nomeFantasia;
    const contactName = draft.contactName.trim();
    if (contactName !== customer.contactName) patch.contactName = contactName;
    const cnpj = onlyDigits(draft.cnpj);
    if (cnpj !== onlyDigits(customer.cnpj)) patch.cnpj = cnpj;
  } else {
    const fullName = draft.fullName.trim();
    if (fullName && fullName !== customer.fullName) patch.fullName = fullName;
    const cpf = onlyDigits(draft.cpf);
    if (cpf !== onlyDigits(customer.cpf)) patch.cpf = cpf;
  }
  if (Object.keys(patch).length > 0) patch.type = customer.type;

  const email = draft.email.trim().toLowerCase() || undefined;
  if (email !== customer.email) patch.email = email;

  const address = buildAddress(draft);
  if (!sameAddress(address, customer.address)) patch.address = address;

  return patch as Partial<ICustomer>;
}
```

- [ ] **Step 5: Rodar e ver passar** — `bun run test -- customerDraft` → PASS.
- [ ] **Step 6: Commit** — `git add src/features/customers/utils/customerDraft.ts src/features/customers/utils/customerDraft.test.ts src/features/customers/i18n/pt-BR.ts && git commit -m "feat(customers): add pure draft engine for inline cadastral editing"`.

---

### Task 2: Fix de clears no `customerPatchToRow` (supabase)

**Files:**
- Modify: `src/providers/data/impl/supabase/customers.ts:174` e `:177` (guards de `email`/`address`); exportar `customerPatchToRow`.
- Test: `src/providers/data/impl/supabase/customers.patch.test.ts` (novo)

**Interfaces:**
- Produces: `export function customerPatchToRow(patch: Partial<ICustomer>): Record<string, unknown>` (export novo, só para teste — call sites internos inalterados).

- [ ] **Step 1: Teste que falha:**

```ts
import { describe, expect, it } from "vitest";
import { customerPatchToRow } from "./customers";

describe("customerPatchToRow", () => {
  it("maps a cleared email (key present, undefined) to null", () => {
    expect(customerPatchToRow({ email: undefined })).toEqual({ email: null });
  });
  it("maps a cleared address to null", () => {
    expect(customerPatchToRow({ address: undefined })).toEqual({ address: null });
  });
  it("omits email/address when the key is absent", () => {
    expect(customerPatchToRow({ status: "ativo" })).toEqual({ status: "ativo" });
  });
  it("maps variant fields only in the presence of type", () => {
    expect(customerPatchToRow({ type: "B2B", razaoSocial: "ACME" })).toEqual({
      type: "B2B",
      razao_social: "ACME",
    });
    expect(customerPatchToRow({ razaoSocial: "ACME" } as never)).toEqual({});
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `bun run test -- customers.patch` → FAIL (não exportado / email dropado).
- [ ] **Step 3: Fix** — em `customers.ts`: `function customerPatchToRow` → `export function customerPatchToRow`; trocar:

```ts
  if ("email" in patch) row.email = patch.email ?? null;
  // …
  if ("address" in patch) row.address = patch.address ?? null;
```

(demais guards `!== undefined` permanecem — nunca são limpos por este fluxo; comentário no código espelhando o do `leadPatchToRow`).

- [ ] **Step 4: Rodar e ver passar** — `bun run test -- customers.patch` → PASS.
- [ ] **Step 5: Commit** — `git commit -m "fix(customers): clearing email/address no longer silently no-ops on supabase"`.

---

### Task 3: UI — modo edição inline no `CadastraisCard` + fiação página/menu

**Files:**
- Modify: `src/features/customers/components/cards/CadastraisCard.tsx` (modo edição self-contained)
- Modify: `src/features/customers/components/tabs/OverviewTab.tsx` (props pass-through)
- Modify: `src/features/customers/components/ProfileTabs.tsx` (props pass-through)
- Modify: `src/features/customers/components/ProfileMenu.tsx` (item "Editar dados" real + gate RLS)
- Modify: `src/features/customers/components/detail/CustomerDetailHeader.tsx` (prop `onEditData`)
- Modify: `src/features/customers/pages/CustomerDetailPage.tsx` (estado do sinal + handler)

**Interfaces:**
- Consumes: Task 1 (`toCustomerDraft`, `validateCustomerDraft`, `buildCustomerPatch`, `formatCep`, tipos), `formatCnpj/formatCpf` de `../utils/cnpjCpf`, `formatPhone` de `@/shared/utils/format`, `useCustomersProvider`, `usePermission`, `useAuth` (`currentUser.sellerId`, `hasRole`), `auditLog`.
- Produces: props novas — `CadastraisCard { editable?: boolean; editSignal?: number }`; `OverviewTab`/`ProfileTabs { cadastraisEditable?: boolean; cadastraisEditSignal?: number }`; `ProfileMenu { onEditData?: () => void }`; `CustomerDetailHeader { onEditData?: () => void }`.

- [ ] **Step 1: `CadastraisCard`** — gate + estado + render:
  - Gate: `const canWrite = usePermission("customer", "edit") && (hasRole(["Owner", "Gestor"]) || (currentUser?.sellerId != null && customer.sellerId === currentUser.sellerId)); const showEdit = Boolean(editable) && canWrite;`
  - `editing/draft/errors/saving` internos; `startEdit()` congela `toCustomerDraft(customer)`; efeito no `editSignal` (contador — mount com sinal >0 também liga, pois o TabsContent remonta o card ao trocar de aba).
  - Header do card ganha botão lápis (ghost, `aria-label` = COPY.edit) quando `showEdit && !editing`.
  - Read mode: linhas atuais + novas linhas E-mail (`customer.email` ou `noEmail` em itálico) e Telefone (`formatPhone`) antes do endereço.
  - Edit mode: inputs com `Label` (variante B2B/B2C), máscaras `formatCnpj`/`formatCpf`/`formatCep` no onChange, UF `maxLength={2}` + uppercase, telefone read-only com `phoneReadOnlyHint`, erros `text-[11px] text-red-600 dark:text-red-400` sob o campo (padrão LeadDataCard).
  - Rodapé (só em edição): `Cancelar` (outline, disabled saving) + `Salvar` (default, disabled saving, label `saving` enquanto salva).
  - Save: valida → bloqueia com erros; patch vazio → sai da edição sem request; sucesso → `auditLog({ action: "customer.data_updated", resource: "customer", resourceId, before: <subset do customer p/ chaves do patch>, after: patch })`, toasts do i18n, invalida `["customer-profile", customer.id]` e `["customers-list"]`, sai da edição; erro → toast `editFailedToast`, permanece em edição.
- [ ] **Step 2: `OverviewTab` + `ProfileTabs`** — repassar `cadastraisEditable`/`cadastraisEditSignal` até o card (ambas as variantes repassam; a fiche nunca passa → read-only).
- [ ] **Step 3: `ProfileMenu`** — trocar o stub por `handleEditData` (usa `onEditData` quando presente; senão `navigate` para `/app/clientes/${customer.id}`); item gated por `canEditData` (mesmo predicado do card).
- [ ] **Step 4: `CustomerDetailHeader` + `CustomerDetailPage`** — prop `onEditData` atravessa o header; página: `goToTab("overview")` + `setCadastraisEditSignal(n => n + 1)`; `ProfileTabs` recebe `cadastraisEditable` e o sinal.
- [ ] **Step 5: Verificar** — `bun run test` (suíte inteira) PASS; `bun run build` PASS.
- [ ] **Step 6: Commit** — `git commit -m "feat(customers): inline cadastral editing on the customer detail page"`.

---

### Task 4: Verificação final e PR

- [ ] **Step 1:** `bun run test` → tudo verde. `bun run build` → sucesso.
- [ ] **Step 2:** `bunx tsc --noEmit` → comparar erros por delta (arquivos novos/alterados desta branch não podem introduzir erro novo).
- [ ] **Step 3:** Checklist de regressão: fiche do Atendimento monta `CadastraisCard` sem props novas (read-only inalterado); `TagsCard`/transferência/renomear intactos; item de menu some para vendedor não-dono (predicado RLS).
- [ ] **Step 4:** Push + `gh pr create --draft` (base `main`), corpo com resumo, spec e plano linkados. **Não mergear.**
