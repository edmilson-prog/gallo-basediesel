# WhatsApp Multi-Instância — Plano 2: Contrato & Providers (TypeScript)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expor na camada de dados o que o Plano 1 criou no banco: o campo `purpose`, as regras de acesso (`whatsapp_account_access_rules`) e o método `create` de instância — em ambas as implementações (mock + supabase) atrás do `IWhatsAppAccountsProvider`.

**Architecture:** Provider Pattern (`@/providers/data`). Tipos em `src/shared/types`, contrato em `contracts/`, impls em `impl/mock` e `impl/supabase`, camada mock em `src/mocks`. TDD com Vitest (`*.test.ts` co-localizado).

**Tech Stack:** TypeScript strict, Vitest, supabase-js.

**Depende do Plano 1** (tabelas `whatsapp_account_access_rules` e colunas `purpose` já no banco). **Escopo:** sem UI (Plano 4), sem roteamento server-side (Plano 3). Participantes (`conversation_participants`) ganham só o **tipo** aqui; sua API de leitura/escrita entra no Plano 4 junto da UI que a consome.

---

## File Structure

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `src/shared/types/conversation.ts` | Modify | `purpose` em `IWhatsAppAccount`; tipos `WhatsAppAccountPurpose`, `IWhatsAppAccountAccessRule`, `IConversationParticipant` |
| `src/shared/types/index.ts` | Modify | Reexportar os tipos novos |
| `src/shared/utils/format.ts` | Modify | `formatPhone` aditivo p/ 12–13 dígitos com prefixo `55` |
| `src/shared/utils/format.test.ts` | Create | Testes do `formatPhone` |
| `src/providers/data/contracts/whatsappAccounts.ts` | Modify | `create`, `getAccessRules`, `replaceAccessRules` |
| `src/mocks/generators/whatsappAccount.ts` | Modify | `purpose` nos 2 seeds |
| `src/mocks/api/whatsappAccounts.ts` | Modify | `create` + store em memória de access rules |
| `src/providers/data/impl/mock/whatsappAccounts.ts` | Modify | Encaminhar `create`/access rules |
| `src/providers/data/impl/mock/whatsappAccounts.test.ts` | Create | Teste do `create` mock |
| `src/providers/data/impl/supabase/whatsappAccounts.ts` | Modify | `create` (insert), mapper `purpose`, access rules |

---

## Task 1: Tipos novos

**Files:**
- Modify: `src/shared/types/conversation.ts:106-179`
- Modify: `src/shared/types/index.ts:113-130`

- [ ] **Step 1: Adicionar os tipos**

Em `src/shared/types/conversation.ts`, logo após `export type WhatsAppFailoverPolicy = …;` (linha 116):

```typescript
/** Finalidade de uma instância: caixa de atendimento, disparo de campanha, ou ambos. */
export type WhatsAppAccountPurpose = "atendimento" | "campanha" | "ambos";

/** Regra OU de acesso a uma instância (Camada 1, multi-instância). */
export interface IWhatsAppAccountAccessRule {
  id: ID;
  whatsappAccountId: ID;
  kind: "seller" | "role" | "store";
  /** seller uuid | role claim cru (ex. 'seller_internal') | store uuid */
  targetValue: string;
  createdAt: ISO8601;
}

/** Co-responsável de uma conversa (Camada 2, multi-instância). */
export interface IConversationParticipant {
  conversationId: ID;
  sellerId: ID;
  addedBy?: ID;
  addedAt: ISO8601;
}
```

- [ ] **Step 2: Adicionar `purpose` em `IWhatsAppAccount`**

Em `src/shared/types/conversation.ts`, dentro de `IWhatsAppAccount` (após `createdAt: ISO8601;` na linha 178, antes do `}`):

```typescript
  /** Finalidade da instância (multi-instância). Default 'atendimento'. */
  purpose: WhatsAppAccountPurpose;
```

- [ ] **Step 3: Reexportar no barrel**

Em `src/shared/types/index.ts`, no bloco `export type { … } from "./conversation";` (linhas 113-130), adicionar dentro das chaves:

```typescript
  WhatsAppAccountPurpose,
  IWhatsAppAccountAccessRule,
  IConversationParticipant,
```

- [ ] **Step 4: Type-check**

Run: `bunx tsc --noEmit 2>&1 | grep -E "conversation.ts|whatsappAccounts" || echo "sem erros novos nesses arquivos"`
Expected: os erros de `IWhatsAppAccount` ausência de `purpose` aparecerão nos providers (esperado — resolvidos nas Tasks 4/5). Confirmar que `conversation.ts` em si compila.

- [ ] **Step 5: Commit**

```bash
git add src/shared/types/conversation.ts src/shared/types/index.ts
git commit -m "feat: add multi-instance types (purpose, access rule, participant)"
```

---

## Task 2: `formatPhone` aditivo (prefixo 55)

**Files:**
- Modify: `src/shared/utils/format.ts:54-63`
- Test: `src/shared/utils/format.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/shared/utils/format.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { formatPhone } from "./format";

describe("formatPhone", () => {
  it("formats 11-digit mobile", () => {
    expect(formatPhone("55998001000".slice(2))).toBe("(99) 80010-00"); // guard: not this
  });
  it("formats 11 digits", () => {
    expect(formatPhone("11987654321")).toBe("(11) 98765-4321");
  });
  it("formats 10-digit landline", () => {
    expect(formatPhone("1133334444")).toBe("(11) 3333-4444");
  });
  it("formats 13-digit E.164 with 55 prefix (mobile)", () => {
    expect(formatPhone("5511987654321")).toBe("+55 (11) 98765-4321");
  });
  it("formats 12-digit E.164 with 55 prefix (landline)", () => {
    expect(formatPhone("551133334444")).toBe("+55 (11) 3333-4444");
  });
  it("leaves unknown lengths unchanged", () => {
    expect(formatPhone("123")).toBe("123");
  });
});
```

> Remover a primeira asserção-guarda (linha com `.slice(2)`) antes de rodar — ela é só um lembrete de que 11 dígitos não levam prefixo. Manter os 5 casos reais.

- [ ] **Step 2: Rodar e ver falhar**

Run: `bun run test src/shared/utils/format.test.ts`
Expected: FAIL nos casos de 12/13 dígitos (hoje caem no fallback cru).

- [ ] **Step 3: Estender `formatPhone` (aditivo)**

Substituir o corpo em `src/shared/utils/format.ts:54-63`:

```typescript
/**
 * Format a Brazilian phone number with DDD.
 * 13 digits w/ 55 prefix → `+55 (XX) XXXXX-XXXX` (E.164 mobile)
 * 12 digits w/ 55 prefix → `+55 (XX) XXXX-XXXX` (E.164 landline)
 * 11 digits → `(XX) XXXXX-XXXX` (mobile)
 * 10 digits → `(XX) XXXX-XXXX` (landline)
 * Anything else → input unchanged.
 */
export function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 13 && digits.startsWith("55")) {
    const d = digits.slice(2);
    return `+55 (${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  }
  if (digits.length === 12 && digits.startsWith("55")) {
    const d = digits.slice(2);
    return `+55 (${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  }
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return phone;
}
```

- [ ] **Step 4: Rodar e passar**

Run: `bun run test src/shared/utils/format.test.ts`
Expected: PASS (6/6, após remover a linha-guarda).

- [ ] **Step 5: Commit**

```bash
git add src/shared/utils/format.ts src/shared/utils/format.test.ts
git commit -m "feat: formatPhone supports 12-13 digit E.164 with 55 prefix"
```

---

## Task 3: Contrato — `create` e access rules

**Files:**
- Modify: `src/providers/data/contracts/whatsappAccounts.ts:1-64`

- [ ] **Step 1: Importar os tipos novos e estender a interface**

No topo do arquivo, adicionar `IWhatsAppAccountAccessRule` ao import de `@/shared/types`. Depois, dentro de `IWhatsAppAccountsProvider` (após `get(id)`, linha 60):

```typescript
  /** Cria uma nova instância (multi-instância). storeId vem no input (RLS). */
  create(input: Omit<IWhatsAppAccount, "id" | "createdAt">): Promise<IWhatsAppAccount>;
  /** Regras de acesso (Camada 1) da instância. Staff-only no RLS. */
  getAccessRules(accountId: ID): Promise<IWhatsAppAccountAccessRule[]>;
  /** Substitui o conjunto de regras de acesso da instância (replace-all). */
  replaceAccessRules(
    accountId: ID,
    rules: Array<Pick<IWhatsAppAccountAccessRule, "kind" | "targetValue">>,
  ): Promise<IWhatsAppAccountAccessRule[]>;
```

- [ ] **Step 2: Type-check (as impls vão acusar falta dos métodos)**

Run: `bunx tsc --noEmit 2>&1 | grep "whatsappAccounts"`
Expected: erros em `impl/mock/whatsappAccounts.ts` e `impl/supabase/whatsappAccounts.ts` ("missing create/getAccessRules/replaceAccessRules") — resolvidos nas Tasks 4/5.

- [ ] **Step 3: Commit**

```bash
git add src/providers/data/contracts/whatsappAccounts.ts
git commit -m "feat: add create and access-rules methods to IWhatsAppAccountsProvider"
```

---

## Task 4: Implementação Mock

**Files:**
- Modify: `src/mocks/generators/whatsappAccount.ts`
- Modify: `src/mocks/api/whatsappAccounts.ts`
- Modify: `src/providers/data/impl/mock/whatsappAccounts.ts`
- Test: `src/providers/data/impl/mock/whatsappAccounts.test.ts`

- [ ] **Step 1: `purpose` nos seeds**

Em `src/mocks/generators/whatsappAccount.ts`, adicionar `purpose` a cada conta. Na `wa-meta-matriz` (após `createdAt`): `purpose: "ambos",`. Na `wa-evo-campanhas`: `purpose: "campanha",`. (Mantém o demo coerente: a Meta atende+campanha; a Evolution é de campanha.)

- [ ] **Step 2: `create` + access rules na mock API**

Em `src/mocks/api/whatsappAccounts.ts`, adicionar um store em memória de regras e os métodos (dentro do objeto `whatsappAccountsApi`, após `update`):

```typescript
  async create(
    input: Omit<IWhatsAppAccount, "id" | "createdAt">,
  ): Promise<IWhatsAppAccount> {
    return runApi("whatsappAccountsApi", "create", () => {
      const account: IWhatsAppAccount = {
        ...input,
        id: `wa-${crypto.randomUUID()}`,
        createdAt: new Date().toISOString(),
      };
      upsert("whatsappAccounts", account);
      return account;
    });
  },
```

E no topo do módulo (fora do objeto), um store simples de regras + os dois métodos:

```typescript
// In-memory access rules (mock-only; supabase usa a tabela real).
const mockAccessRules = new Map<string, IWhatsAppAccountAccessRule[]>();
```

```typescript
  async getAccessRules(accountId: ID): Promise<IWhatsAppAccountAccessRule[]> {
    return runApi("whatsappAccountsApi", "getAccessRules", () => [
      ...(mockAccessRules.get(String(accountId)) ?? []),
    ]);
  },

  async replaceAccessRules(
    accountId: ID,
    rules: Array<Pick<IWhatsAppAccountAccessRule, "kind" | "targetValue">>,
  ): Promise<IWhatsAppAccountAccessRule[]> {
    return runApi("whatsappAccountsApi", "replaceAccessRules", () => {
      const now = new Date().toISOString();
      const built: IWhatsAppAccountAccessRule[] = rules.map((r) => ({
        id: `waar-${crypto.randomUUID()}`,
        whatsappAccountId: String(accountId),
        kind: r.kind,
        targetValue: r.targetValue,
        createdAt: now,
      }));
      mockAccessRules.set(String(accountId), built);
      return [...built];
    });
  },
```

Adicionar os imports de tipo (`IWhatsAppAccountAccessRule`) e confirmar que `upsert` está importado de `../store/mutations` (mesmo usado por `leads.create`).

- [ ] **Step 3: Encaminhar no provider mock**

Em `src/providers/data/impl/mock/whatsappAccounts.ts`, adicionar ao objeto `mockWhatsAppAccountsProvider`:

```typescript
  create: (input) => whatsappAccountsApi.create(input),
  getAccessRules: (id) => whatsappAccountsApi.getAccessRules(id),
  replaceAccessRules: (id, rules) => whatsappAccountsApi.replaceAccessRules(id, rules),
```

- [ ] **Step 4: Teste do `create` mock**

Criar `src/providers/data/impl/mock/whatsappAccounts.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { mockWhatsAppAccountsProvider } from "./whatsappAccounts";

describe("mockWhatsAppAccountsProvider.create", () => {
  it("persists a new instance and returns it with id/createdAt", async () => {
    const created = await mockWhatsAppAccountsProvider.create({
      storeId: "00000000-0000-0000-0000-000000000001",
      label: "Comercial Volvo",
      phoneNumber: "",
      provider: "evolution",
      credentialsRef: "evo-comercial-volvo",
      status: "pending",
      capabilities: {
        supportsTemplatesHsm: false,
        supportsInteractiveButtons: false,
        supportsLists: false,
        supportsReactions: true,
        supportsProactiveMessaging: true,
        supportsReadStatusInGroups: true,
      },
      providerConfig: { baseUrl: "https://evo.example", instanceName: "comercial-volvo-a3f" },
      currentState: "healthy",
      failoverPolicy: "disabled",
      isFailoverActive: false,
      purpose: "atendimento",
    });
    expect(created.id).toMatch(/^wa-/);
    expect(created.createdAt).toBeTruthy();
    const list = await mockWhatsAppAccountsProvider.list();
    expect(list.some((a) => a.id === created.id)).toBe(true);
  });

  it("replaceAccessRules round-trips", async () => {
    const rules = await mockWhatsAppAccountsProvider.replaceAccessRules("wa-evo-campanhas", [
      { kind: "role", targetValue: "seller_internal" },
    ]);
    expect(rules).toHaveLength(1);
    const read = await mockWhatsAppAccountsProvider.getAccessRules("wa-evo-campanhas");
    expect(read[0].targetValue).toBe("seller_internal");
  });
});
```

- [ ] **Step 5: Rodar**

Run: `bun run test src/providers/data/impl/mock/whatsappAccounts.test.ts`
Expected: PASS (2/2).

- [ ] **Step 6: Commit**

```bash
git add src/mocks/generators/whatsappAccount.ts src/mocks/api/whatsappAccounts.ts src/providers/data/impl/mock/whatsappAccounts.ts src/providers/data/impl/mock/whatsappAccounts.test.ts
git commit -m "feat: mock provider create + access rules + purpose seeds"
```

---

## Task 5: Implementação Supabase

**Files:**
- Modify: `src/providers/data/impl/supabase/whatsappAccounts.ts:21-103`

- [ ] **Step 1: Row + mapper + COLUMNS com `purpose`**

Em `WhatsAppAccountRow` (interface, ~linha 21-37) adicionar: `purpose: IWhatsAppAccount["purpose"];`. No `rowToWhatsAppAccount` (linhas 45-63), adicionar dentro do objeto retornado: `purpose: row.purpose ?? "atendimento",`. Em `COLUMNS` (linhas 39-43), acrescentar `purpose` à string (ex.: após `created_at`): `", created_at, purpose"`.

- [ ] **Step 2: `create` (insert)**

Adicionar ao provider, espelhando o padrão de `leads.create`. Antes do `update`:

```typescript
async create(input: Omit<IWhatsAppAccount, "id" | "createdAt">): Promise<IWhatsAppAccount> {
  const id: ID = crypto.randomUUID();
  const row = {
    id,
    store_id: input.storeId,
    label: input.label,
    phone_number: input.phoneNumber,
    provider: input.provider,
    credentials_ref: input.credentialsRef,
    status: input.status,
    capabilities: input.capabilities,
    provider_config: input.providerConfig ?? null,
    current_state: input.currentState,
    state_changed_at: input.stateChangedAt ?? null,
    failover_policy: input.failoverPolicy,
    failover_account_id: input.failoverAccountId ?? null,
    is_failover_active: input.isFailoverActive,
    purpose: input.purpose,
  };
  const { data, error } = await getSupabaseClient()
    .from(TABLE)
    .insert(row)
    .select(COLUMNS)
    .single();
  if (error) throw new Error(`[supabase] whatsappAccounts.create failed: ${error.message}`);
  return rowToWhatsAppAccount(data as unknown as WhatsAppAccountRow);
},
```

- [ ] **Step 3: access rules (tabela `whatsapp_account_access_rules`)**

```typescript
async getAccessRules(accountId: ID): Promise<IWhatsAppAccountAccessRule[]> {
  const { data, error } = await getSupabaseClient()
    .from("whatsapp_account_access_rules")
    .select("id, whatsapp_account_id, kind, target_value, created_at")
    .eq("whatsapp_account_id", accountId);
  if (error) throw new Error(`[supabase] getAccessRules(${accountId}) failed: ${error.message}`);
  return (data ?? []).map((r) => ({
    id: r.id as string,
    whatsappAccountId: r.whatsapp_account_id as string,
    kind: r.kind as IWhatsAppAccountAccessRule["kind"],
    targetValue: r.target_value as string,
    createdAt: r.created_at as string,
  }));
},

async replaceAccessRules(
  accountId: ID,
  rules: Array<Pick<IWhatsAppAccountAccessRule, "kind" | "targetValue">>,
): Promise<IWhatsAppAccountAccessRule[]> {
  const client = getSupabaseClient();
  const del = await client
    .from("whatsapp_account_access_rules")
    .delete()
    .eq("whatsapp_account_id", accountId);
  if (del.error)
    throw new Error(`[supabase] replaceAccessRules delete failed: ${del.error.message}`);
  if (rules.length === 0) return [];
  const { data, error } = await client
    .from("whatsapp_account_access_rules")
    .insert(rules.map((r) => ({
      whatsapp_account_id: accountId,
      kind: r.kind,
      target_value: r.targetValue,
    })))
    .select("id, whatsapp_account_id, kind, target_value, created_at");
  if (error) throw new Error(`[supabase] replaceAccessRules insert failed: ${error.message}`);
  return (data ?? []).map((r) => ({
    id: r.id as string,
    whatsappAccountId: r.whatsapp_account_id as string,
    kind: r.kind as IWhatsAppAccountAccessRule["kind"],
    targetValue: r.target_value as string,
    createdAt: r.created_at as string,
  }));
},
```

> `replaceAccessRules` não é transacional (delete+insert em 2 chamadas). Aceitável para staff-only e baixa frequência; se virar problema, mover para uma RPC SECURITY DEFINER. Importar `IWhatsAppAccountAccessRule` no topo.

- [ ] **Step 4: Type-check do conjunto**

Run: `bunx tsc --noEmit 2>&1 | grep "whatsappAccounts" || echo "providers OK"`
Expected: `providers OK` (todas as impls satisfazem o contrato; `purpose` resolvido).

- [ ] **Step 5: Build + suíte**

Run: `bun run build && bun run test`
Expected: build sem erros; testes verdes.

- [ ] **Step 6: Commit**

```bash
git add src/providers/data/impl/supabase/whatsappAccounts.ts
git commit -m "feat: supabase provider create + access rules + purpose mapping"
```

---

## Self-Review

**1. Spec coverage:** §5.1 `purpose` (Tasks 1,4,5) ✅; §5.2 access rules CRUD (Tasks 3,4,5) ✅; §5.5 `create` + tipos + `formatPhone` aditivo (Tasks 1,2,3,4,5) ✅; `IConversationParticipant` tipo (Task 1) ✅ — sua API entra no Plano 4. Participantes write/read não-tipo: adiado ✅.
**2. Placeholder scan:** sem TODO/“validação genérica”; todo código presente. A única instrução textual (remover a linha-guarda do teste) é explícita. ✅
**3. Type consistency:** `create(input: Omit<IWhatsAppAccount,"id"|"createdAt">)` idêntico em contrato/mock/supabase; `purpose` presente em Row, mapper, COLUMNS, insert e seeds; `IWhatsAppAccountAccessRule` com os mesmos campos em tipo/mock/supabase. ✅
**Risco:** o mock store de access rules é module-level (não persiste em reload, não vai pro mockStore). Aceito para demo; documentado.

---

## ✅ Resultado da execução (2026-06-15)

**Plano 2 executado integralmente** na branch `feat/whatsapp-multi-instancia`. TypeScript/Vitest puro — **não tocou produção**.

Commits (6):
- `b0b2ea8` — tipos multi-instância (`WhatsAppAccountPurpose`, `IWhatsAppAccountAccessRule`, `IConversationParticipant`) + `purpose` em `IWhatsAppAccount` + barrel
- `02e5fc7` — `formatPhone` 12–13 dígitos E.164 com prefixo 55 (TDD)
- `68e0656` — contrato `create`/`getAccessRules`/`replaceAccessRules` no `IWhatsAppAccountsProvider`
- `cdec5fc` — provider mock (create + access rules in-memory + seeds `purpose` ambos/campanha) + teste
- `f1fba9f` — provider supabase (insert, mapper `purpose`, tabela `whatsapp_account_access_rules`, COLUMNS)
- `99eadf0` — fix type-safety no teste (`read[0]?.targetValue` p/ `noUncheckedIndexedAccess`)

Validação: `tsc --noEmit` delta **limpo** nos arquivos tocados; `bun run build` **OK**; `bun run test` **683/683 verde (84 arquivos)**.

Desvios do plano: (1) Task 2 Step 4 dizia "6/6" — eram 5 casos reais após remover a linha-guarda; rodou **5/5**. (2) Commit extra `99eadf0` para satisfazer `noUncheckedIndexedAccess` numa asserção que o plano trazia sem optional chaining.

**Próximo:** Plano 3 (roteamento server-side — índices únicos parciais + webhook exatamente-1-match + arm de participante no `send/core.ts`) **toca produção** (migrations + edge deploys); Plano 4 (UI).
