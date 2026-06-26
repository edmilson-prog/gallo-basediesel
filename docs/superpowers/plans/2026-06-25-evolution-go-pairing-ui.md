# Evolution Go — UI de pareamento (Fase 5) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que o Owner crie e pareie números **Evolution Go** por QR pela plataforma (Go padrão + v2 legado), destravando o smoke e2e da migração.

**Architecture:** Generalizar os componentes existentes (wizard, connect dialog, página de contas) para a família Evolution. O pareamento por QR (`useEvolutionPairing`, `whatsappConnect.ts`, Edge `whatsapp-connect`) já é provider-agnóstico e foi deployado na Fase 2 — a UI só precisa criar o row `evolution-go` certo, gravar a chave global no Vault e reusar o fluxo de QR.

**Tech Stack:** React 19 + TypeScript strict, TanStack Router/Query, shadcn/ui, Vitest. Provider Pattern (`@/providers/data`). Supabase (Edge Functions + Vault). Spec: `docs/superpowers/specs/2026-06-25-evolution-go-pairing-ui-design.md`.

## Global Constraints

- **Provider Pattern:** features acessam dados só via `@/providers/data` (nunca `@/mocks` direto). Fronteiras impostas por ESLint.
- **Código em inglês; UI em pt-BR com acentos corretos** (UTF-8 — nunca `nao`/`instancia` no texto de usuário). camelCase/PascalCase/kebab-case; interfaces de domínio prefixadas `I`.
- **Segredos nunca no banco nem no código.** A chave global Go vai ao Vault via `setIntegrationSecret` (Edge `integration-secrets`, Owner-only). `setIntegrationSecret` só roda em **modo real** (`getActiveDataSource() === "supabase"`).
- **Chave global Go colada por número** (decisão aprovada do dono): cada conta Go tem `credentialsRef` único; a chave global é o mesmo valor, reinformado por número.
- **NÃO tocar no cache congelado do atendimento** (signing em lote #137, Realtime, query keys, RPC gated-once). A Task 8 (cosmética) só altera tags de exibição — nunca essa camada.
- **Sem novas dependências** (`bunfig.toml` impõe guard de 24h; esta feature não precisa de libs novas).
- **Gate por task:** `bun run test` (suíte verde) + `bun run build` (verde). `bunx tsc --noEmit` tem baseline (~315 erros pré-existentes) — avaliar **por delta** sobre os arquivos tocados. Componentes (wizard/dialog/página) são validados por build + **smoke manual do dono** (ele testa a UI à mão).
- **Commits:** Conventional Commits em inglês, atômicos; terminar a mensagem com `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

## File Structure

| Arquivo | Responsabilidade | Ação |
|---|---|---|
| `src/shared/types/conversation.ts` | Tipos de domínio WhatsApp | Modificar (alargar uniões + `instanceId?`) |
| `src/shared/utils/whatsappProvider.ts` | Predicado `isEvolutionFamily` | Criar |
| `src/shared/utils/whatsappProvider.test.ts` | Teste do predicado | Criar |
| `src/features/admin-settings/utils/goCredentials.ts` | Gerador de `credentialsRef` Go | Criar |
| `src/features/admin-settings/utils/goCredentials.test.ts` | Teste do gerador | Criar |
| `src/features/admin-settings/utils/accountDraft.ts` | `IAccountDraft`/`draftFromAccount`/`configFromDraft` (extraídos + caso Go) | Criar |
| `src/features/admin-settings/utils/accountDraft.test.ts` | Teste do `configFromDraft` | Criar |
| `src/features/admin-settings/pages/WhatsAppAccountsPage.tsx` | Tela de contas | Modificar (Go-aware + wiring) |
| `src/features/admin-settings/components/AddInstanceWizard.tsx` | Wizard "Adicionar número" | Modificar (provider-aware + ramo Go) |
| `src/features/admin-settings/components/ConnectWhatsAppDialog.tsx` | Diálogo de conexão | Modificar (Go = QR-only) |
| `src/features/admin-settings/components/DeleteInstanceDialog.tsx` | Confirmação de exclusão | Modificar (Go-aware) |
| `src/features/admin-settings/hooks/useEvolutionStatusSync.ts` | Polling de status | Modificar (filtro família) |
| `src/features/conversations/hooks/useMessageSend.ts` | Hook de envio (tag otimista) | Modificar (cosmético, Task 8) |
| `src/features/conversations/components/NewConversationDialog.tsx` | Conversa nova outbound | Modificar (cosmético, Task 8) |
| `src/features/system-health/pages/SystemHealthPage.tsx` | Saúde Owner-only | Modificar (cosmético, Task 8) |

---

## Task 1: Fundação de tipos + `isEvolutionFamily`

**Files:**
- Modify: `src/shared/types/conversation.ts:78`, `:129`, `:183-194`
- Create: `src/shared/utils/whatsappProvider.ts`
- Test: `src/shared/utils/whatsappProvider.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `WhatsAppProviderName = "meta" | "evolution" | "evolution-go"`; `MessageProvider = "meta" | "evolution" | "evolution-go" | "mock"`; `IWhatsAppProviderConfig.instanceId?: string`; `isEvolutionFamily(provider: WhatsAppProviderName): boolean`.

> Alargar a união faz o `tsc` apontar dois `Record<IWhatsAppAccount["provider"], string>` incompletos (`PROVIDER_LABEL` na página e no `DeleteInstanceDialog`) — esses são resolvidos nas Tasks 4 e 7. O `bun run build` (esbuild, sem type-check) e o `bun run test` permanecem verdes ao longo do caminho.

- [ ] **Step 1: Write the failing test** — `src/shared/utils/whatsappProvider.test.ts`

```typescript
import { describe, expect, it } from "vitest";
import { isEvolutionFamily } from "./whatsappProvider";

describe("isEvolutionFamily", () => {
  it("is true for evolution", () => {
    expect(isEvolutionFamily("evolution")).toBe(true);
  });
  it("is true for evolution-go", () => {
    expect(isEvolutionFamily("evolution-go")).toBe(true);
  });
  it("is false for meta", () => {
    expect(isEvolutionFamily("meta")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/shared/utils/whatsappProvider.test.ts`
Expected: FAIL — `Failed to resolve import "./whatsappProvider"` (módulo ainda não existe).

- [ ] **Step 3: Widen the domain unions** — `src/shared/types/conversation.ts`

Linha 78 — `MessageProvider`:
```typescript
export type MessageProvider = "meta" | "evolution" | "evolution-go" | "mock";
```
Linha 129 — `WhatsAppProviderName`:
```typescript
export type WhatsAppProviderName = "meta" | "evolution" | "evolution-go";
```
Dentro de `IWhatsAppProviderConfig` (após `instanceName?`, ~linha 191), adicionar:
```typescript
  /** Evolution Go — server-generated instance id. Empty until first pairing. */
  instanceId?: string;
```

- [ ] **Step 4: Create the helper** — `src/shared/utils/whatsappProvider.ts`

```typescript
import type { WhatsAppProviderName } from "@/shared/types";

/**
 * True for the Evolution engine family (self-hosted WhatsApp Web sessions:
 * Evolution v2/Baileys and Evolution Go/whatsmeow). Both pair by QR through
 * the same `whatsapp-connect` Edge and share UI affordances (connect, test,
 * import, sync). Meta Cloud API is NOT in this family.
 */
export function isEvolutionFamily(provider: WhatsAppProviderName): boolean {
  return provider === "evolution" || provider === "evolution-go";
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bunx vitest run src/shared/utils/whatsappProvider.test.ts`
Expected: PASS (3/3).

- [ ] **Step 6: Verify the suite + build stay green**

Run: `bun run test` then `bun run build`
Expected: ambos verdes (a incompletude de `PROVIDER_LABEL` é só `tsc`, não quebra build).

- [ ] **Step 7: Commit**

```bash
git add src/shared/types/conversation.ts src/shared/utils/whatsappProvider.ts src/shared/utils/whatsappProvider.test.ts
git commit -m "feat(whatsapp): widen domain types for evolution-go + isEvolutionFamily helper" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Gerador de `credentialsRef` Go

**Files:**
- Create: `src/features/admin-settings/utils/goCredentials.ts`
- Test: `src/features/admin-settings/utils/goCredentials.test.ts`

**Interfaces:**
- Consumes: `isValidCredentialsRef` de `../api/whatsappConnect` (padrão `^[A-Z][A-Z0-9_]{2,64}$` aplicado a `${ref}_API_KEY`).
- Produces: `generateGoCredentialsRef(label: string, existingRefs: string[], suffix: string): string`.

> O `credentialsRef` Go vira **nome de secret** (`{ref}_API_KEY`, `{ref}_INSTANCE_TOKEN`) — precisa ser `A-Z 0-9 _` em maiúsculas. O sufixo aleatório do v2 é lowercase (vai para `instanceName`, não um secret), então aqui o sufixo é **sanitizado para maiúsculas**.

- [ ] **Step 1: Write the failing test** — `src/features/admin-settings/utils/goCredentials.test.ts`

```typescript
import { describe, expect, it } from "vitest";
import { isValidCredentialsRef } from "../api/whatsappConnect";
import { generateGoCredentialsRef } from "./goCredentials";

describe("generateGoCredentialsRef", () => {
  it("builds an env-style ref from the label and suffix", () => {
    const ref = generateGoCredentialsRef("Comercial Volvo", [], "abc");
    expect(ref).toBe("WA_EVO_GO_COMERCIAL_VOLVO_ABC");
    expect(isValidCredentialsRef(ref)).toBe(true);
  });

  it("uppercases a lowercase suffix and strips diacritics/spaces from the label", () => {
    const ref = generateGoCredentialsRef("Atenção Manutenção", [], "x9z");
    expect(ref).toBe("WA_EVO_GO_ATENCAO_MANUTENCAO_X9Z");
    expect(isValidCredentialsRef(ref)).toBe(true);
  });

  it("falls back to INSTANCIA when the label has no alphanumerics", () => {
    expect(generateGoCredentialsRef("!!!", [], "q2")).toBe("WA_EVO_GO_INSTANCIA_Q2");
  });

  it("avoids collisions with existing refs by appending a counter", () => {
    const existing = ["WA_EVO_GO_LOJA_AB"];
    const ref = generateGoCredentialsRef("Loja", existing, "ab");
    expect(ref).toBe("WA_EVO_GO_LOJA_AB_1");
    expect(existing).not.toContain(ref);
    expect(isValidCredentialsRef(ref)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/features/admin-settings/utils/goCredentials.test.ts`
Expected: FAIL — `Failed to resolve import "./goCredentials"`.

- [ ] **Step 3: Implement** — `src/features/admin-settings/utils/goCredentials.ts`

```typescript
/**
 * Generates a unique, env-style `credentialsRef` for a new Evolution Go account.
 * The ref names the account's Vault secrets (`{ref}_API_KEY`,
 * `{ref}_INSTANCE_TOKEN`), so it must match `^[A-Z][A-Z0-9_]{2,64}$`. Pure: the
 * random suffix is injected by the caller so the result is testable.
 */

function slugUpper(label: string): string {
  const slug = label
    .toUpperCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 24);
  return slug || "INSTANCIA";
}

export function generateGoCredentialsRef(
  label: string,
  existingRefs: string[],
  suffix: string,
): string {
  const suf = suffix.toUpperCase().replace(/[^A-Z0-9]/g, "") || "X";
  const base = `WA_EVO_GO_${slugUpper(label)}_${suf}`;
  let candidate = base;
  let n = 1;
  while (existingRefs.includes(candidate)) {
    candidate = `${base}_${n++}`;
  }
  return candidate;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run src/features/admin-settings/utils/goCredentials.test.ts`
Expected: PASS (4/4).

- [ ] **Step 5: Commit**

```bash
git add src/features/admin-settings/utils/goCredentials.ts src/features/admin-settings/utils/goCredentials.test.ts
git commit -m "feat(whatsapp): unique env-style credentialsRef generator for evolution-go" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Extrair `accountDraft` + caso Go do `configFromDraft`

**Files:**
- Create: `src/features/admin-settings/utils/accountDraft.ts`
- Test: `src/features/admin-settings/utils/accountDraft.test.ts`
- Modify: `src/features/admin-settings/pages/WhatsAppAccountsPage.tsx` (remover as defs locais `IAccountDraft`/`draftFromAccount`/`configFromDraft` e importar do util)

**Interfaces:**
- Consumes: `IWhatsAppAccount`, `IWhatsAppProviderConfig`, `WhatsAppFailoverPolicy` de `@/shared/types`.
- Produces: `IAccountDraft` (com `instanceId: string`), `draftFromAccount(account): IAccountDraft`, `configFromDraft(provider, draft): { ok: true; config: IWhatsAppProviderConfig | null } | { ok: false }`.

> O `WhatsAppAccountsPage.tsx` tem ~1066 linhas; mover os helpers puros para um util os torna testáveis e alivia a página. A lógica meta/evolution é **idêntica** à atual (`WhatsAppAccountsPage.tsx:129-184`); só acrescenta o ramo `evolution-go`.

- [ ] **Step 1: Write the failing test** — `src/features/admin-settings/utils/accountDraft.test.ts`

```typescript
import { describe, expect, it } from "vitest";
import { configFromDraft, type IAccountDraft } from "./accountDraft";

const base: IAccountDraft = {
  label: "X",
  credentialsRef: "WA_X",
  phoneNumberId: "",
  businessAccountId: "",
  baseUrl: "",
  instanceName: "",
  instanceId: "",
  failoverPolicy: "disabled",
  failoverAccountId: "",
};

describe("configFromDraft", () => {
  it("meta: both ids present → meta config", () => {
    const r = configFromDraft("meta", { ...base, phoneNumberId: "PN", businessAccountId: "WABA" });
    expect(r).toEqual({ ok: true, config: { phoneNumberId: "PN", businessAccountId: "WABA" } });
  });

  it("evolution: both fields empty → null (clear)", () => {
    expect(configFromDraft("evolution", base)).toEqual({ ok: true, config: null });
  });

  it("evolution: partial → not ok", () => {
    expect(configFromDraft("evolution", { ...base, baseUrl: "https://x" })).toEqual({ ok: false });
  });

  it("evolution-go: baseUrl present preserves a non-empty instanceId", () => {
    const r = configFromDraft("evolution-go", {
      ...base,
      baseUrl: "https://evogo.x/",
      instanceId: "abc123",
    });
    expect(r).toEqual({ ok: true, config: { baseUrl: "https://evogo.x/", instanceId: "abc123" } });
  });

  it("evolution-go: baseUrl present + empty instanceId still ok (not yet paired)", () => {
    const r = configFromDraft("evolution-go", { ...base, baseUrl: "https://evogo.x" });
    expect(r).toEqual({ ok: true, config: { baseUrl: "https://evogo.x", instanceId: "" } });
  });

  it("evolution-go: empty baseUrl → not ok", () => {
    expect(configFromDraft("evolution-go", base)).toEqual({ ok: false });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/features/admin-settings/utils/accountDraft.test.ts`
Expected: FAIL — `Failed to resolve import "./accountDraft"`.

- [ ] **Step 3: Implement** — `src/features/admin-settings/utils/accountDraft.ts`

```typescript
import type {
  IWhatsAppAccount,
  IWhatsAppProviderConfig,
  WhatsAppFailoverPolicy,
} from "@/shared/types";

/** Editable shape backing the per-account edit form on the accounts screen. */
export interface IAccountDraft {
  label: string;
  credentialsRef: string;
  phoneNumberId: string;
  businessAccountId: string;
  baseUrl: string;
  instanceName: string;
  /** Evolution Go — server-managed; read-only in the form, preserved on save. */
  instanceId: string;
  failoverPolicy: WhatsAppFailoverPolicy;
  /** Empty string = no backup account selected. */
  failoverAccountId: string;
}

export function draftFromAccount(account: IWhatsAppAccount): IAccountDraft {
  return {
    label: account.label,
    credentialsRef: account.credentialsRef,
    phoneNumberId: account.providerConfig?.phoneNumberId ?? "",
    businessAccountId: account.providerConfig?.businessAccountId ?? "",
    baseUrl: account.providerConfig?.baseUrl ?? "",
    instanceName: account.providerConfig?.instanceName ?? "",
    instanceId: account.providerConfig?.instanceId ?? "",
    failoverPolicy: account.failoverPolicy,
    failoverAccountId: account.failoverAccountId ?? "",
  };
}

/**
 * Builds the providerConfig patch from the draft, honoring the DB shape guard
 * (PRD-111 RF-032): the engine's minimum keys must be present.
 * - meta: phoneNumberId + businessAccountId (both, or both empty = clear).
 * - evolution: baseUrl + instanceName (both, or both empty = clear).
 * - evolution-go: baseUrl required; instanceId is server-managed and preserved
 *   (may be "" before the first pairing — the CHECK only tests key presence).
 */
export function configFromDraft(
  provider: IWhatsAppAccount["provider"],
  draft: IAccountDraft,
): { ok: true; config: IWhatsAppProviderConfig | null } | { ok: false } {
  if (provider === "evolution-go") {
    const baseUrl = draft.baseUrl.trim();
    if (!baseUrl) return { ok: false };
    return { ok: true, config: { baseUrl, instanceId: draft.instanceId } };
  }
  const a = (provider === "meta" ? draft.phoneNumberId : draft.baseUrl).trim();
  const b = (provider === "meta" ? draft.businessAccountId : draft.instanceName).trim();
  if (!a && !b) return { ok: true, config: null };
  if (!a || !b) return { ok: false };
  return {
    ok: true,
    config:
      provider === "meta"
        ? { phoneNumberId: a, businessAccountId: b }
        : { baseUrl: a, instanceName: b },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run src/features/admin-settings/utils/accountDraft.test.ts`
Expected: PASS (6/6).

- [ ] **Step 5: Rewire the page to import the util** — `src/features/admin-settings/pages/WhatsAppAccountsPage.tsx`

Remover as definições locais `interface IAccountDraft { … }` (linhas ~129-139), `function draftFromAccount(…)` (~141-152) e `function configFromDraft(…)` (~169-184). Adicionar o import junto aos demais imports do topo:
```typescript
import {
  configFromDraft,
  draftFromAccount,
  type IAccountDraft,
} from "../utils/accountDraft";
```
(O uso em `startEdit`/`handleSave` permanece igual — mesmas assinaturas.)

- [ ] **Step 6: Verify suite + build**

Run: `bun run test` then `bun run build`
Expected: ambos verdes.

- [ ] **Step 7: Commit**

```bash
git add src/features/admin-settings/utils/accountDraft.ts src/features/admin-settings/utils/accountDraft.test.ts src/features/admin-settings/pages/WhatsAppAccountsPage.tsx
git commit -m "refactor(whatsapp): extract accountDraft util + evolution-go config case" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Tela de contas Go-aware

**Files:**
- Modify: `src/features/admin-settings/pages/WhatsAppAccountsPage.tsx`
- Modify: `src/features/admin-settings/hooks/useEvolutionStatusSync.ts:35-40`

**Interfaces:**
- Consumes: `isEvolutionFamily` (Task 1), `configFromDraft`/`draftFromAccount`/`IAccountDraft` (Task 3).
- Produces: tela que lista/conecta/edita contas `evolution-go` (gates da família); botão "Adicionar número" sempre habilitado; `openConnect` manda Go direto ao QR.

- [ ] **Step 1: Import the helper** (topo do arquivo, junto aos imports de `@/shared`)

```typescript
import { isEvolutionFamily } from "@/shared/utils/whatsappProvider";
```

- [ ] **Step 2: Complete `PROVIDER_LABEL`** (`WhatsAppAccountsPage.tsx:74-77`)

```typescript
const PROVIDER_LABEL: Record<IWhatsAppAccount["provider"], string> = {
  meta: "Meta Cloud API",
  evolution: "Evolution API",
  "evolution-go": "Evolution Go",
};
```

- [ ] **Step 3: Botão "Adicionar número" sempre habilitado** (~linhas 454-465)

> **Manter** o memo `templateAccount` (linhas ~300-304) intacto — o call-site do wizard ainda o usa como prop até a Task 5 (que troca para `accounts` e remove o memo). O split por provedor vive **dentro** do wizard (Task 5), não na página.

No botão "Adicionar número", remover `disabled={!templateAccount}` e o `title` condicional; deixar sempre habilitado:
```tsx
        <Button onClick={() => setWizardOpen(true)} title="Adiciona um novo número de WhatsApp">
          <Icon icon="lucide:plus" size={14} className="mr-1.5" />
          Adicionar número
        </Button>
```

- [ ] **Step 4: Widen the action gate + disconnected banner** — trocar `account.provider === "evolution"` por `isEvolutionFamily(account.provider)` em **três** sítios:
  - bloco de ações (`WhatsAppAccountsPage.tsx:701`) — `{isEvolutionFamily(account.provider) && (`
  - banner de desconexão (`:823`) — `{isEvolutionFamily(account.provider) && account.status === "disconnected" && (`
  - rodapé "Conectar conta" (`:1004`) — `const evolutionAccounts = (accounts ?? []).filter((a) => isEvolutionFamily(a.provider));`

- [ ] **Step 5: `openConnect` routes Go straight to QR** (`WhatsAppAccountsPage.tsx:330-335`)

```typescript
  /** Opens the connect dialog — straight to QR when the config is complete. */
  const openConnect = (account: IWhatsAppAccount) => {
    const configured =
      account.provider === "evolution-go"
        ? Boolean(account.providerConfig?.baseUrl)
        : Boolean(account.providerConfig?.baseUrl && account.providerConfig?.instanceName);
    setConnectTarget({ account, step: configured ? "qr" : "form" });
  };
```

- [ ] **Step 6: Edit form — Go branch** (no bloco de edição, onde hoje há `account.provider === "meta" ? (…meta…) : (…evolution baseUrl+instanceName…)`, ~linhas 867-920). Trocar o ramo `else` (evolution) por um sub-branch que distingue Go:

```tsx
                      ) : account.provider === "evolution-go" ? (
                        <>
                          <div className="space-y-1.5">
                            <Label htmlFor={`url-${account.id}`}>URL do servidor Evolution Go</Label>
                            <Input
                              id={`url-${account.id}`}
                              className="font-mono"
                              placeholder="https://evogo.ailainteligente.com.br"
                              value={draft?.baseUrl ?? ""}
                              onChange={(e) =>
                                setDraft((d) => (d ? { ...d, baseUrl: e.target.value } : d))
                              }
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor={`iid-${account.id}`}>ID da instância (servidor)</Label>
                            <Input
                              id={`iid-${account.id}`}
                              className="font-mono"
                              value={draft?.instanceId || "—"}
                              readOnly
                              disabled
                            />
                            <p className="text-[11px] text-muted-foreground">
                              Gerado pelo servidor ao parear. Não editável.
                            </p>
                          </div>
                        </>
                      ) : (
                        <>{/* ramo evolution v2 EXISTENTE (baseUrl + instanceName),
                           linhas ~894-919 do arquivo atual, mantido como o `else` final */}</>
                      )}
```

> Estrutura final: `meta ? (…) : evolution-go ? (…) : (…evolution v2 existente…)`. O implementador insere o ramo `evolution-go` entre o fechamento do ramo `meta` e o ramo `evolution` que já existe — sem reescrever o bloco v2.

E na cópia de erro do `handleSave` (~linhas 344-351), incluir o caso Go:
```typescript
    if (!config.ok) {
      toast.error(
        account.provider === "meta"
          ? "Preencha Phone Number ID e Business Account ID (ou deixe ambos vazios)."
          : account.provider === "evolution-go"
            ? "Informe a URL do servidor Evolution Go."
            : "Preencha URL base e nome da instância (ou deixe ambos vazios).",
      );
      return;
    }
```

Na linha de exibição read-only do bloco não-editando (`:658-671`), a label "Instância Evolution" e o valor usam `instanceName`. Para Go, mostrar o `instanceId`. Ajustar a `dd`:
```tsx
                          <dd className="font-mono text-foreground">
                            {account.provider === "meta"
                              ? account.providerConfig?.phoneNumberId
                                ? `${account.providerConfig.phoneNumberId} / ${account.providerConfig.businessAccountId ?? "—"}`
                                : "Não configurado"
                              : account.provider === "evolution-go"
                                ? account.providerConfig?.instanceId
                                  ? `${account.providerConfig.instanceId} @ ${account.providerConfig.baseUrl ?? "—"}`
                                  : `Não pareado @ ${account.providerConfig?.baseUrl ?? "—"}`
                                : account.providerConfig?.instanceName
                                  ? `${account.providerConfig.instanceName} @ ${account.providerConfig.baseUrl ?? "—"}`
                                  : "Não configurado"}
                          </dd>
```
E o `dt` (`:658-660`): `{account.provider === "meta" ? "Phone Number ID / WABA ID" : "Instância Evolution"}` → para Go faz sentido "Instância Evolution Go". Trocar por:
```tsx
                          <dt className="text-muted-foreground">
                            {account.provider === "meta"
                              ? "Phone Number ID / WABA ID"
                              : account.provider === "evolution-go"
                                ? "Instância Evolution Go"
                                : "Instância Evolution"}
                          </dt>
```

- [ ] **Step 7: Status-sync filter → família** — `src/features/admin-settings/hooks/useEvolutionStatusSync.ts`

Importar o helper (topo):
```typescript
import { isEvolutionFamily } from "@/shared/utils/whatsappProvider";
```
Trocar o filtro de alvos (linhas 35-40) por:
```typescript
    const targets = (accountsRef.current ?? []).filter(
      (account) => isEvolutionFamily(account.provider) && Boolean(account.providerConfig?.baseUrl),
    );
```
(Go ainda não pareado → o Edge devolve `close`; sem efeito colateral.)

- [ ] **Step 8: Verify suite + build**

Run: `bun run test` then `bun run build`
Expected: verdes. Conferir no `tsc` (delta) que o `PROVIDER_LABEL` da página deixou de acusar incompletude.

- [ ] **Step 9: Commit**

```bash
git add src/features/admin-settings/pages/WhatsAppAccountsPage.tsx src/features/admin-settings/hooks/useEvolutionStatusSync.ts
git commit -m "feat(whatsapp): make the accounts screen evolution-go aware" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Wizard "Adicionar número" provider-aware (ramo Go)

**Files:**
- Modify: `src/features/admin-settings/components/AddInstanceWizard.tsx`
- Modify: `src/features/admin-settings/pages/WhatsAppAccountsPage.tsx` (mudar as props passadas ao wizard)

**Interfaces:**
- Consumes: `generateGoCredentialsRef` (Task 2), `isValidCredentialsRef`/`setIntegrationSecret`, `isEvolutionFamily` (Task 1), `useEvolutionPairing`, `useWhatsAppAccountsProvider`, `getActiveDataSource`.
- Produces: `AddInstanceWizard` com props `{ storeId, accounts: IWhatsAppAccount[], onClose, onCreated }` e um seletor de provedor (Go padrão / v2 legado).

> O wizard já tem as fases `creating`/`qr`/`done` dirigidas pelo `useEvolutionPairing` — elas são reusadas sem mudança. O trabalho concentra-se na fase `form` (seletor + campos Go) e no `handleCreate` (ramo Go).

- [ ] **Step 1: Trocar a prop `templateAccount` por `accounts`** — assinatura do componente:

```typescript
export function AddInstanceWizard({
  storeId,
  accounts,
  onClose,
  onCreated,
}: {
  storeId: string;
  /** All accounts of the store — used to derive per-provider templates and to
   *  guarantee a unique Go credentialsRef. */
  accounts: IWhatsAppAccount[];
  onClose: () => void;
  onCreated: (accountId: string) => void;
}) {
```

Adicionar os imports no topo:
```typescript
import { getActiveDataSource } from "@/providers/data";
import { setIntegrationSecret } from "../api/integrationSecrets";
import { isValidCredentialsRef, INVALID_CREDENTIALS_REF_MESSAGE } from "../api/whatsappConnect";
import { generateGoCredentialsRef } from "../utils/goCredentials";
```

Renomear `EVOLUTION_CAPS` → `EVOLUTION_FAMILY_CAPS` (mesmo objeto; serve v2 e Go) e atualizar o uso no `handleCreate` v2.

- [ ] **Step 2: Estado novo do wizard** (após os `useState` existentes)

```typescript
  type WizardProvider = "evolution-go" | "evolution";
  const [wizardProvider, setWizardProvider] = useState<WizardProvider>("evolution-go");
  const [goBaseUrl, setGoBaseUrl] = useState("");
  const [goApiKey, setGoApiKey] = useState("");

  const isMock = useMemo(() => getActiveDataSource() === "mock", []);
  const evolutionTemplate = useMemo(
    () => accounts.find((a) => a.provider === "evolution" && a.providerConfig?.baseUrl) ?? null,
    [accounts],
  );
  const goTemplate = useMemo(
    () => accounts.find((a) => a.provider === "evolution-go" && a.providerConfig?.baseUrl) ?? null,
    [accounts],
  );
  const existingRefs = useMemo(() => accounts.map((a) => a.credentialsRef), [accounts]);
  // Stable suffix so the generated Go credentialsRef preview is steady per keystroke.
  const [goSuffix] = useState(() => Math.random().toString(36).slice(2, 5));
  const goCredentialsRef = useMemo(
    () => (label.trim() ? generateGoCredentialsRef(label, existingRefs, goSuffix) : ""),
    [label, existingRefs, goSuffix],
  );
```

Pré-preencher `goBaseUrl` a partir do template Go quando abrir:
```typescript
  useEffect(() => {
    if (goTemplate?.providerConfig?.baseUrl) setGoBaseUrl(goTemplate.providerConfig.baseUrl);
  }, [goTemplate]);
```

- [ ] **Step 3: `handleCreate` ramifica por provedor**

```typescript
  async function handleCreate() {
    setError(null);
    if (wizardProvider === "evolution-go") {
      const base = goBaseUrl.trim().replace(/\/$/, "");
      if (!base) {
        setError("Informe a URL do servidor Evolution Go.");
        return;
      }
      if (!isMock && !goApiKey.trim()) {
        setError("Cole a chave global da API do servidor Evolution Go.");
        return;
      }
      if (!isMock && !isValidCredentialsRef(goCredentialsRef)) {
        setError(INVALID_CREDENTIALS_REF_MESSAGE);
        return;
      }
      setPhase("creating");
      try {
        const created = await provider.create({
          storeId,
          label: label.trim(),
          phoneNumber: "",
          provider: "evolution-go",
          credentialsRef: goCredentialsRef,
          status: "pending",
          capabilities: EVOLUTION_FAMILY_CAPS,
          providerConfig: { baseUrl: base, instanceId: "" },
          currentState: "healthy",
          failoverPolicy: "disabled",
          isFailoverActive: false,
          purpose,
        });
        if (!isMock) {
          await setIntegrationSecret(
            `${goCredentialsRef}_API_KEY`,
            goApiKey.trim(),
            `Chave global Evolution Go — ${label.trim()}`,
          );
        }
        setAccountId(created.id);
        setPhase("qr");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Falha ao criar a instância Evolution Go.");
        setPhase("form");
      }
      return;
    }

    // ----- Evolution v2 (legado) — comportamento atual -----
    if (!evolutionTemplate) return;
    setPhase("creating");
    try {
      const created = await provider.create({
        storeId,
        label: label.trim(),
        phoneNumber: "",
        provider: "evolution",
        credentialsRef: evolutionTemplate.credentialsRef,
        status: "pending",
        capabilities: EVOLUTION_FAMILY_CAPS,
        providerConfig: {
          baseUrl: evolutionTemplate.providerConfig?.baseUrl ?? "",
          instanceName,
        },
        currentState: "healthy",
        failoverPolicy: "disabled",
        isFailoverActive: false,
        purpose,
      });
      setAccountId(created.id);
      setPhase("qr");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao criar a instância.");
      setPhase("form");
    }
  }
```

> Nota: se o `setIntegrationSecret` falhar (ex.: 403 Owner-only), o row Go já existe — o erro é mostrado e a conta fica conectável depois (a tela permite gravar a chave e gerar o QR). Não há rollback do row (o pareamento é idempotente).

- [ ] **Step 4: Fase `form` — seletor de provedor + campos Go**

No JSX da fase `form`, **antes** do campo "Apelido", inserir o seletor (segmented, padrão Go; v2 desabilitado sem template):

```tsx
            <div className="space-y-1.5">
              <Label>Provedor</Label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setWizardProvider("evolution-go")}
                  className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                    wizardProvider === "evolution-go"
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Evolution Go
                </button>
                <button
                  type="button"
                  disabled={!evolutionTemplate}
                  onClick={() => setWizardProvider("evolution")}
                  title={
                    evolutionTemplate
                      ? "Cria um número no servidor Evolution v2 existente"
                      : "Conecte uma instância Evolution v2 primeiro"
                  }
                  className={`rounded-full border px-3 py-1 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                    wizardProvider === "evolution"
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Evolution v2 (legado)
                </button>
              </div>
            </div>
```

Logo após o campo "Finalidade", inserir os campos **só-Go** (condicionais a `wizardProvider === "evolution-go"`):

```tsx
            {wizardProvider === "evolution-go" && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="add-go-url">URL do servidor Evolution Go</Label>
                  <Input
                    id="add-go-url"
                    className="font-mono"
                    inputMode="url"
                    placeholder="https://evogo.ailainteligente.com.br"
                    value={goBaseUrl}
                    onChange={(e) => setGoBaseUrl(e.target.value)}
                  />
                </div>
                {!isMock && (
                  <div className="space-y-1.5">
                    <Label htmlFor="add-go-key">Chave global da API</Label>
                    <Input
                      id="add-go-key"
                      type="password"
                      autoComplete="new-password"
                      className="font-mono"
                      placeholder="Chave global do servidor (admin)"
                      value={goApiKey}
                      onChange={(e) => setGoApiKey(e.target.value)}
                    />
                    <p className="text-[11px] text-muted-foreground">
                      A mesma chave global do servidor Go, por número. Gravada criptografada no
                      cofre — nunca exibida de volta.
                    </p>
                  </div>
                )}
              </>
            )}
```

E o preview do "ID técnico (gerado)" passa a depender do provedor — Go mostra o `credentialsRef`, v2 mostra o `instanceName`:
```tsx
            <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs">
              <span className="text-muted-foreground">
                {wizardProvider === "evolution-go" ? "Prefixo de credenciais (gerado): " : "ID técnico (gerado): "}
              </span>
              <span className="font-mono text-foreground">
                {wizardProvider === "evolution-go" ? goCredentialsRef || "—" : instanceName || "—"}
              </span>
            </div>
```

Remover o guard de topo `!templateAccount ?` (o aviso "Conecte ao menos uma instância Evolution…") — com Go o wizard funciona do zero. O botão "Criar e conectar" segue `disabled={!label.trim()}`.

- [ ] **Step 5: Atualizar o call-site na página + remover o memo órfão** — `WhatsAppAccountsPage.tsx`.

Remover o memo `templateAccount` (linhas ~300-304) — ele só alimentava a prop antiga do wizard e agora fica sem uso. No render do wizard (~linhas 1043-1063), passar `accounts` em vez de `templateAccount`:

```tsx
      {wizardOpen && (
        <AddInstanceWizard
          storeId={storeId}
          accounts={accounts ?? []}
          onClose={() => {
            setWizardOpen(false);
            void refresh();
          }}
          onCreated={(newId) => {
            setWizardOpen(false);
            void (async () => {
              await refresh();
              try {
                setAccessAccount(await provider.get(newId));
              } catch {
                /* the new card still shows "configurar acesso" */
              }
            })();
          }}
        />
      )}
```

- [ ] **Step 6: Verify suite + build**

Run: `bun run test` then `bun run build`
Expected: verdes.

- [ ] **Step 7: Commit**

```bash
git add src/features/admin-settings/components/AddInstanceWizard.tsx src/features/admin-settings/pages/WhatsAppAccountsPage.tsx
git commit -m "feat(whatsapp): provider-aware add-number wizard with evolution-go branch" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: `ConnectWhatsAppDialog` — Go = QR-only

**Files:**
- Modify: `src/features/admin-settings/components/ConnectWhatsAppDialog.tsx`

**Interfaces:**
- Consumes: `IWhatsAppAccount.provider` (Go). Reusa `useEvolutionPairing`/`QrPairingStep` e os estados "conectado" (provider-agnósticos).
- Produces: para Go, o diálogo abre direto no QR (sem o form v2 de `instanceName`/apikey).

- [ ] **Step 1: Flag `isGo`** (após o `const provider = useWhatsAppAccountsProvider();`)

```typescript
  const isGo = account?.provider === "evolution-go";
```

- [ ] **Step 2: Esconder o form para Go** — o bloco `{step === "form" && account && (…)}` (linha ~235) passa a `{step === "form" && account && !isGo && (…)}`.

- [ ] **Step 3: Esconder o back-button "Editar dados da conexão" para Go** — no bloco `step === "qr"` (linhas ~341-348), trocar a condição do botão:

```tsx
              {pairing.phase === "error" && !isGo && (
                <div className="flex justify-start">
                  <Button variant="ghost" size="sm" onClick={() => setStep("form")}>
                    <Icon icon="mdi:arrow-left" size={14} className="mr-1.5" />
                    Editar dados da conexão
                  </Button>
                </div>
              )}
```

- [ ] **Step 4: Descrição do header coerente para Go** (linhas ~228-232) — ajustar a `DialogDescription` para não citar "instância já deve existir" quando Go:

```tsx
            <DialogDescription>
              {step === "form"
                ? "Evolution API — a instância já deve existir no servidor."
                : isGo
                  ? "Escaneie o código com o WhatsApp do número (Evolution Go)."
                  : "Escaneie o código com o WhatsApp do número da loja."}
            </DialogDescription>
```

> O `re-seed` do `useEffect` (linhas 78-89) seta `baseUrl`/`instanceName` a partir do `providerConfig` — para Go ficam vazios, mas o form não é renderizado, então é inócuo. Nenhuma mudança lá.

- [ ] **Step 5: Verify suite + build**

Run: `bun run test` then `bun run build`
Expected: verdes.

- [ ] **Step 6: Commit**

```bash
git add src/features/admin-settings/components/ConnectWhatsAppDialog.tsx
git commit -m "feat(whatsapp): connect dialog goes straight to QR for evolution-go" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: `DeleteInstanceDialog` Go-aware

**Files:**
- Modify: `src/features/admin-settings/components/DeleteInstanceDialog.tsx`

**Interfaces:**
- Consumes: `isEvolutionFamily` (Task 1). O Edge já tem o ramo de delete `evolution-go` (Fase 2).
- Produces: exclusão e cópia de teardown corretas para contas Go.

- [ ] **Step 1: Import + completar `PROVIDER_LABEL`** (linhas 23-26)

```typescript
import { isEvolutionFamily } from "@/shared/utils/whatsappProvider";

const PROVIDER_LABEL: Record<IWhatsAppAccount["provider"], string> = {
  evolution: "Evolution API",
  "evolution-go": "Evolution Go",
  meta: "Meta Cloud API",
};
```

- [ ] **Step 2: Gate "Desconectar"** (linha 174) — `{account.provider === "evolution" && account.status === "connected" && (` → `{isEvolutionFamily(account.provider) && account.status === "connected" && (`

- [ ] **Step 3: Item de teardown do servidor** (linha 200) — `{account.provider === "evolution" && (` → `{isEvolutionFamily(account.provider) && (`. E ajustar a cópia para a família (linhas 203-208) usando `instanceId` quando Go:

```tsx
                    <span>
                      A instância no servidor
                      {account.provider === "evolution-go"
                        ? account.providerConfig?.instanceId
                          ? ` Go (${account.providerConfig.instanceId})`
                          : " Go"
                        : account.providerConfig?.instanceName
                          ? ` Evolution (${account.providerConfig.instanceName})`
                          : " Evolution"}{" "}
                      será desconectada e apagada.
                    </span>
```

- [ ] **Step 4: Verify suite + build**

Run: `bun run test` then `bun run build`
Expected: verdes. Conferir no `tsc` (delta) que o `PROVIDER_LABEL` do delete dialog deixou de acusar incompletude.

- [ ] **Step 5: Commit**

```bash
git add src/features/admin-settings/components/DeleteInstanceDialog.tsx
git commit -m "feat(whatsapp): evolution-go aware delete instance dialog" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: Polimento cosmético no atendimento (cache-safe, isolável)

**Files:**
- Modify: `src/features/conversations/hooks/useMessageSend.ts:140-146`
- Modify: `src/features/conversations/components/NewConversationDialog.tsx:84`
- Modify: `src/features/system-health/pages/SystemHealthPage.tsx:225`

**Interfaces:**
- Consumes: `isEvolutionFamily` (Task 1).
- Produces: tags/avisos de exibição corretos para Go. **Não** toca signing/Realtime/query keys/RPC do cache do atendimento.

> Esta task pode ser descartada inteira sem afetar o núcleo (o envio Go funciona — o Edge resolve o provider server-side). Mantida por correção cosmética.

- [ ] **Step 1: Tag do balão otimista** — `useMessageSend.ts`. Importar o helper e ajustar o ternário do `provider`:

```typescript
import { isEvolutionFamily } from "@/shared/utils/whatsappProvider";
```
```typescript
        provider: template
          ? "meta"
          : whatsappAccount && isEvolutionFamily(whatsappAccount.provider)
            ? whatsappAccount.provider
            : conversation.channel === "whatsapp"
              ? "meta"
              : "mock",
```
(Após o alargamento da Task 1, `whatsappAccount.provider` é `MessageProvider`-compatível, então `provider:` aceita `"evolution-go"`.)

- [ ] **Step 2: Aviso anti-ban da conversa nova** — `NewConversationDialog.tsx`:

```typescript
import { isEvolutionFamily } from "@/shared/utils/whatsappProvider";
```
```typescript
  const isEvolution = origin ? isEvolutionFamily(origin.provider) : false;
```

- [ ] **Step 3: Nota de saúde** — `SystemHealthPage.tsx:225` — trocar `acc.provider === "evolution"` por `isEvolutionFamily(acc.provider)` (importar o helper no topo).

- [ ] **Step 4: Verify suite + build**

Run: `bun run test` then `bun run build`
Expected: verdes.

- [ ] **Step 5: Commit**

```bash
git add src/features/conversations/hooks/useMessageSend.ts src/features/conversations/components/NewConversationDialog.tsx src/features/system-health/pages/SystemHealthPage.tsx
git commit -m "fix(whatsapp): evolution-go cosmetic parity in conversations + health (display-only)" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Encerramento

Após a Task 8 (ou Task 7, se F for descartada):

- [ ] Rodar `bun run test` (suíte completa) + `bun run build`.
- [ ] Rodar `bunx tsc --noEmit` e confirmar **zero novos erros** nos arquivos tocados (cruzar com `git diff --name-status main...HEAD --diff-filter=A`).
- [ ] Rodar `scripts/sync-whatsapp-shared.ts`? **Não** — nenhuma mudança em `src/providers/whatsapp/` nesta fase (a UI não toca a camada runtime-agnostic). Confirmar que o `git diff --stat` não inclui `src/providers/whatsapp/`.
- [ ] Review final de branch inteira (opus) via `superpowers:requesting-code-review`.
- [ ] **Smoke manual do dono** (a UI agora existe): criar uma conta Go → colar a chave global → parear por QR → verificar status "Conectada". Isso destrava o smoke e2e e os 2 contratos abertos.
