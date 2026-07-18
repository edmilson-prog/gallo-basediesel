# Reconciliar número BR com/sem o 9º dígito — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer o código reconhecer as duas formas válidas de um número de celular BR (com e sem o 9º dígito) na deduplicação de clientes, e tentar automaticamente a variante de 13 dígitos quando a checagem de WhatsApp falhar para um número de 12 dígitos ambíguo — sem nunca inserir o 9 às cegas (só quando o próprio WhatsApp confirma).

**Architecture:** `phoneBR.ts` (frontend) ganha `buildNineDigitCandidate` (puro) e um `samePhone` tolerante a 12x13 dígitos. O mesmo par de funções é duplicado no módulo runtime-agnostic `src/providers/whatsapp/phoneBr.ts` (mirror automático para `_shared/whatsapp/phoneBr.ts`), consumido pelos dois webhooks (`whatsapp-webhook`, `waha-webhook`) na dedução de cliente por telefone. No fluxo "Nova conversa", uma nova função `resolveNumberCheckWithNineDigitFallback` orquestra uma 2ª chamada de checagem com o candidato de 13 dígitos quando a 1ª não confirma WhatsApp.

**Tech Stack:** TypeScript, Vitest (frontend), Deno (edge functions, sem suíte de testes própria neste repo — verificação é por leitura + suíte Vitest completa + sync script).

## Global Constraints

- Direção **só 12→13** (inserir o "9"): nunca remove um dígito de um número de 13 dígitos digitado pelo usuário.
- **Nunca insere o "9" às cegas** — só usa a variante de 13 dígitos quando `checkWhatsAppNumber` confirmar `has_whatsapp` para ela (mesma régua de D7 do design de 2026-06-16: o WhatsApp é a fonte da verdade, não uma heurística).
- **Sem correção retroativa** de números já salvos incorretamente no banco.
- **Sem mudança de comportamento para contas Meta** (que não têm endpoint de checagem — seguem em `skipped`).
- `src/providers/whatsapp/**` continua runtime-agnostic: só Web APIs, só imports relativos (o novo `phoneBr.ts` NÃO importa de `src/features/**`).
- Depois de qualquer mudança em `src/providers/whatsapp/`, rodar `bun run scripts/sync-whatsapp-shared.ts` antes de considerar a tarefa concluída.
- `bun run test` (Vitest) deve continuar 100% verde a cada tarefa.

---

### Task 1: `phoneBR.ts` — candidato de 9º dígito + `samePhone` tolerante

**Files:**
- Modify: `src/features/conversations/engine/phoneBR.ts`
- Test: `src/features/conversations/engine/phoneBR.test.ts`

**Interfaces:**
- Produces: `export function buildNineDigitCandidate(digits: string): string | null` — dado um telefone já normalizado (`digitsOf`-compatible), se for `55`+DDD(2)+local(8) = 12 dígitos, retorna a variante de 13 dígitos com "9" inserido logo após o DDD; caso contrário (já 13 dígitos, ou fora do padrão), retorna `null`.
- Produces: `samePhone(a: string, b: string): boolean` (assinatura inalterada) — agora também retorna `true` quando os `localPart` de `a` e `b` diferem só pela inserção do "9" (10 dígitos `DDD+local8` vs. 11 dígitos `DDD+9+local8`).

- [ ] **Step 1: Escrever os testes que falham (Vitest)**

Adicionar ao final do arquivo `src/features/conversations/engine/phoneBR.test.ts` (depois do bloco `describe("samePhone", ...)` existente, antes de `describe("looksLikePhone", ...)`):

```ts
describe("buildNineDigitCandidate", () => {
  it("inserts the 9th digit for a 12-digit 55+DDD+local8 number", () => {
    expect(buildNineDigitCandidate("555481572275")).toBe("5554981572275");
  });
  it("returns null for a number that already has 13 digits", () => {
    expect(buildNineDigitCandidate("5554981572275")).toBeNull();
  });
  it("returns null for input shorter than 12 digits", () => {
    expect(buildNineDigitCandidate("54999988")).toBeNull();
  });
  it("returns null for input without the 55 DDI", () => {
    expect(buildNineDigitCandidate("548157227")).toBeNull();
  });
});

describe("samePhone with 9th-digit ambiguity", () => {
  it("matches a 12-digit and a 13-digit form of the same number", () => {
    expect(samePhone("555481572275", "5554981572275")).toBe(true);
  });
  it("matches regardless of argument order", () => {
    expect(samePhone("5554981572275", "555481572275")).toBe(true);
  });
  it("does not match a 12-digit number against an unrelated 13-digit number", () => {
    expect(samePhone("555481572275", "5511988887777")).toBe(false);
  });
  it("does not match when the inserted digit isn't a 9", () => {
    expect(samePhone("555481572275", "5554881572275")).toBe(false);
  });
});
```

Também adicionar `buildNineDigitCandidate` ao import no topo do arquivo:

```ts
import {
  buildNineDigitCandidate,
  digitsOf,
  formatBrPhoneDisplay,
  looksLikePhone,
  normalizeBrPhone,
  samePhone,
} from "./phoneBR";
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `bun run test src/features/conversations/engine/phoneBR.test.ts`
Expected: FAIL — `buildNineDigitCandidate is not exported` e os 4 novos casos de `samePhone` falhando (retornando `false` para os pares 12x13).

- [ ] **Step 3: Implementar `buildNineDigitCandidate` e atualizar `samePhone`**

Em `src/features/conversations/engine/phoneBR.ts`, adicionar depois de `normalizeBrPhone` (antes de `localPart`):

```ts
/**
 * Se `digits` é um BR de 12 dígitos (55+DDD+local8, sem o 9 explícito),
 * retorna a variante de 13 dígitos com "9" inserido logo após o DDD.
 * Caso contrário (já 13 dígitos, ou fora do padrão 55+12/13), retorna null.
 * Só insere — nunca remove um dígito.
 */
export function buildNineDigitCandidate(digits: string): string | null {
  const d = digitsOf(digits);
  if (!d.startsWith("55") || d.length !== 12) return null;
  const ddi = d.slice(0, 2);
  const ddd = d.slice(2, 4);
  const local8 = d.slice(4);
  return `${ddi}${ddd}9${local8}`;
}
```

Substituir a função `samePhone` existente por:

```ts
/** Two phones are the same when their DDD+number match, DDI optional — and
 *  also when they differ only by the 9th mobile digit (12 vs 13 digits). */
export function samePhone(a: string, b: string): boolean {
  const la = localPart(a);
  const lb = localPart(b);
  if (la.length === 0) return false;
  if (la === lb) return true;
  const [shortLocal, longLocal] = la.length < lb.length ? [la, lb] : [lb, la];
  if (shortLocal.length !== 10 || longLocal.length !== 11) return false;
  return longLocal[2] === "9" && shortLocal === longLocal.slice(0, 2) + longLocal.slice(3);
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `bun run test src/features/conversations/engine/phoneBR.test.ts`
Expected: PASS — todos os casos, incluindo os 4 novos de `buildNineDigitCandidate` e os 4 novos de `samePhone`.

- [ ] **Step 5: Commit**

```bash
git add src/features/conversations/engine/phoneBR.ts src/features/conversations/engine/phoneBR.test.ts
git commit -m "feat(conversations): reconcile BR phone with/without the 9th digit"
```

---

### Task 2: Módulo mirror `src/providers/whatsapp/phoneBr.ts` + sync

**Files:**
- Create: `src/providers/whatsapp/phoneBr.ts`
- Test: `src/providers/whatsapp/phoneBr.test.ts`
- Generated (via script, não editar à mão): `supabase/functions/_shared/whatsapp/phoneBr.ts`

**Interfaces:**
- Consumes: nada de tarefas anteriores (módulo standalone — não importa de `src/features/**`, que não é mirror-safe).
- Produces: `export function buildNineDigitCandidate(digits: string): string | null` (mesma lógica do Task 1, cópia intencional — ver Global Constraints).
- Produces: `export function phoneDigitsMatchBr(a: string, b: string): boolean` — versão standalone de `samePhone` mas recebendo dígitos já limpos (sem DDI opcional a stripar — os dois webhooks já chamam com `String(phone).replace(/\D/g, "")`), usada por Task 3.

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/providers/whatsapp/phoneBr.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildNineDigitCandidate, phoneDigitsMatchBr } from "./phoneBr";

describe("buildNineDigitCandidate", () => {
  it("inserts the 9th digit for a 12-digit 55+DDD+local8 number", () => {
    expect(buildNineDigitCandidate("555481572275")).toBe("5554981572275");
  });
  it("returns null for a number that already has 13 digits", () => {
    expect(buildNineDigitCandidate("5554981572275")).toBeNull();
  });
  it("returns null for input without the 55 DDI", () => {
    expect(buildNineDigitCandidate("548157227")).toBeNull();
  });
});

describe("phoneDigitsMatchBr", () => {
  it("matches identical digit strings", () => {
    expect(phoneDigitsMatchBr("5554981572275", "5554981572275")).toBe(true);
  });
  it("matches a 12-digit and a 13-digit form of the same number", () => {
    expect(phoneDigitsMatchBr("555481572275", "5554981572275")).toBe(true);
  });
  it("matches regardless of argument order", () => {
    expect(phoneDigitsMatchBr("5554981572275", "555481572275")).toBe(true);
  });
  it("does not match unrelated numbers", () => {
    expect(phoneDigitsMatchBr("555481572275", "5511988887777")).toBe(false);
  });
  it("is false for empty input", () => {
    expect(phoneDigitsMatchBr("", "5554981572275")).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `bun run test src/providers/whatsapp/phoneBr.test.ts`
Expected: FAIL — `Cannot find module './phoneBr'`.

- [ ] **Step 3: Implementar `src/providers/whatsapp/phoneBr.ts`**

```ts
/**
 * BR mobile phone helpers shared by the WhatsApp webhook engines (Meta/Evolution
 * + WAHA) for phone→customer dedup. Runtime-agnostic file: relative imports
 * only, Web APIs only — mirrored into _shared/whatsapp/phoneBr.ts.
 *
 * Deliberately duplicated (not imported) from
 * src/features/conversations/engine/phoneBR.ts, which lives outside the
 * mirror-safe tree. Only insert the 9th digit — never remove one.
 */

const NON_DIGITS = /\D/g;

function digitsOf(input: string): string {
  return input.replace(NON_DIGITS, "");
}

/**
 * If `digits` is a 12-digit BR number (55+DDD+local8, no explicit 9th
 * digit), returns the 13-digit variant with "9" inserted right after the
 * DDD. Otherwise (already 13 digits, or outside the 55+12 shape), null.
 */
export function buildNineDigitCandidate(digits: string): string | null {
  const d = digitsOf(digits);
  if (!d.startsWith("55") || d.length !== 12) return null;
  const ddi = d.slice(0, 2);
  const ddd = d.slice(2, 4);
  const local8 = d.slice(4);
  return `${ddi}${ddd}9${local8}`;
}

/** Strips the optional leading 55 DDI to compare DDD+number. */
function localPart(phone: string): string {
  const d = digitsOf(phone);
  return d.startsWith("55") && d.length >= 12 ? d.slice(2) : d;
}

/** Two phone digit strings are the same BR number when they match exactly,
 *  or differ only by the 9th mobile digit (12 vs 13 digits). */
export function phoneDigitsMatchBr(a: string, b: string): boolean {
  const la = localPart(a);
  const lb = localPart(b);
  if (la.length === 0) return false;
  if (la === lb) return true;
  const [shortLocal, longLocal] = la.length < lb.length ? [la, lb] : [lb, la];
  if (shortLocal.length !== 10 || longLocal.length !== 11) return false;
  return longLocal[2] === "9" && shortLocal === longLocal.slice(0, 2) + longLocal.slice(3);
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `bun run test src/providers/whatsapp/phoneBr.test.ts`
Expected: PASS — todos os 8 casos.

- [ ] **Step 5: Sincronizar o mirror e rodar a suíte completa**

```bash
bun run scripts/sync-whatsapp-shared.ts
```

Expected output: `synced <N> files → supabase/functions/_shared/whatsapp/` (N = contagem anterior + 1, incluindo o novo `phoneBr.ts`).

Verificar o banner do arquivo gerado:

Run: `head -3 supabase/functions/_shared/whatsapp/phoneBr.ts`
Expected:
```
// AUTO-GENERATED MIRROR — DO NOT EDIT.
// Source: src/providers/whatsapp/phoneBr.ts (sync: bun run scripts/sync-whatsapp-shared.ts)
```

Run: `bun run test`
Expected: todos os arquivos de teste passam (sem regressão).

- [ ] **Step 6: Commit**

```bash
git add src/providers/whatsapp/phoneBr.ts src/providers/whatsapp/phoneBr.test.ts supabase/functions/_shared/whatsapp/
git commit -m "feat(whatsapp): add BR 9th-digit reconciliation helper (mirrored)"
```

---

### Task 3: Dedup tolerante nos webhooks (Evolution/Meta + WAHA)

**Files:**
- Modify: `supabase/functions/whatsapp-webhook/index.ts:257-269` (import list + o `find` dentro de `findCustomerByPhone`)
- Modify: `supabase/functions/waha-webhook/index.ts:261-269` (import list + o `find` dentro do closure local `findCustomerByPhone`)

**Interfaces:**
- Consumes: `phoneDigitsMatchBr` de `../_shared/whatsapp/phoneBr.ts` (produzido pelo Task 2 — já sincronizado no repositório).

- [ ] **Step 1: `whatsapp-webhook/index.ts` — importar o helper**

No bloco de imports (perto da linha 34, junto dos outros imports de `../_shared/whatsapp/`), adicionar:

```ts
import { phoneDigitsMatchBr } from "../_shared/whatsapp/phoneBr.ts";
```

- [ ] **Step 2: `whatsapp-webhook/index.ts` — trocar o predicado exato pelo tolerante**

Em `supabase/functions/whatsapp-webhook/index.ts`, dentro de `findCustomerByPhone` (por volta da linha 257-269), trocar:

```ts
    async findCustomerByPhone(storeId, phoneDigits) {
      // Narrow by suffix in SQL, confirm exact digit match in code (phone
      // formatting in the base varies: +55..., (55) 9..., etc.).
      const { data } = await admin
        .from("customers")
        .select("id, phone")
        .eq("store_id", storeId)
        .like("phone", `%${phoneDigits.slice(-8)}`);
      const row = (data ?? []).find(
        (candidate) => String(candidate.phone).replace(/\D/g, "") === phoneDigits,
      );
      return row ? { id: row.id as string } : null;
    },
```

por:

```ts
    async findCustomerByPhone(storeId, phoneDigits) {
      // Narrow by suffix in SQL, confirm exact digit match (or the 9th-digit
      // BR variant) in code (phone formatting in the base varies: +55...,
      // (55) 9..., etc.; a stored number may also be missing the 9th digit —
      // see docs/superpowers/specs/2026-07-16-br-phone-nine-digit-reconciliation-design.md).
      const { data } = await admin
        .from("customers")
        .select("id, phone")
        .eq("store_id", storeId)
        .like("phone", `%${phoneDigits.slice(-8)}`);
      const row = (data ?? []).find((candidate) =>
        phoneDigitsMatchBr(String(candidate.phone).replace(/\D/g, ""), phoneDigits),
      );
      return row ? { id: row.id as string } : null;
    },
```

- [ ] **Step 3: `waha-webhook/index.ts` — importar o helper**

No bloco de imports (perto da linha 43-50, junto dos outros imports de `../_shared/whatsapp/`), adicionar:

```ts
import { phoneDigitsMatchBr } from "../_shared/whatsapp/phoneBr.ts";
```

- [ ] **Step 4: `waha-webhook/index.ts` — trocar o predicado exato pelo tolerante**

Em `supabase/functions/waha-webhook/index.ts`, dentro do closure local `findCustomerByPhone` (por volta da linha 261-269), trocar:

```ts
    async function findCustomerByPhone(phoneDigits: string): Promise<string | undefined> {
      const { data: candidates } = await admin
        .from("customers")
        .select("id, phone")
        .eq("store_id", accountRow.store_id as string)
        .like("phone", `%${phoneDigits.slice(-8)}`);
      return (candidates ?? []).find((c) => String(c.phone).replace(/\D/g, "") === phoneDigits)
        ?.id as string | undefined;
    }
```

por:

```ts
    async function findCustomerByPhone(phoneDigits: string): Promise<string | undefined> {
      const { data: candidates } = await admin
        .from("customers")
        .select("id, phone")
        .eq("store_id", accountRow.store_id as string)
        .like("phone", `%${phoneDigits.slice(-8)}`);
      return (candidates ?? []).find((c) =>
        phoneDigitsMatchBr(String(c.phone).replace(/\D/g, ""), phoneDigits),
      )?.id as string | undefined;
    }
```

- [ ] **Step 5: Verificar (leitura + suíte completa)**

Não há suíte Deno/Vitest cobrindo estes dois arquivos diretamente (edge functions não têm `.test.ts` neste repo — confirmado: nenhum arquivo `*.test.ts` em `supabase/functions/whatsapp-webhook/` ou `supabase/functions/waha-webhook/`). Verificação é por leitura cuidadosa do diff + suíte Vitest completa (que cobre `phoneDigitsMatchBr` via Task 2) sem regressão:

Run: `bun run test`
Expected: todos os arquivos de teste passam (sem regressão — este task não adiciona nem remove testes, só troca um predicado em 2 arquivos Deno fora do escopo do Vitest).

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/whatsapp-webhook/index.ts supabase/functions/waha-webhook/index.ts
git commit -m "fix(whatsapp): tolerate BR 9th-digit ambiguity in webhook customer dedup"
```

---

### Task 4: Reconsulta automática com o 9 no fluxo "Nova conversa"

**Files:**
- Modify: `src/features/conversations/api/checkWhatsAppNumber.ts`
- Test: `src/features/conversations/api/checkWhatsAppNumber.test.ts`
- Modify: `src/features/conversations/components/NewConversationDialog.tsx:141-167` (dentro de `startNewNumber`)

**Interfaces:**
- Consumes: `buildNineDigitCandidate` de `../engine/phoneBR` (produzido pelo Task 1).
- Produces: `export async function resolveNumberCheckWithNineDigitFallback(accountId: ID, phoneDigits: string, check?: (accountId: ID, phoneDigits: string) => Promise<INumberCheckResult>): Promise<INumberCheckResult>` — `check` é injetável (default `checkWhatsAppNumber`) só para teste; nunca lança (mesma postura fail-open de `checkWhatsAppNumber`).

- [ ] **Step 1: Escrever os testes que falham**

Adicionar ao final de `src/features/conversations/api/checkWhatsAppNumber.test.ts`:

```ts
describe("resolveNumberCheckWithNineDigitFallback", () => {
  it("returns the first result as-is when it's already has_whatsapp", async () => {
    const check = async () => ({ status: "has_whatsapp" as const, canonicalPhone: "5554981572275" });
    const result = await resolveNumberCheckWithNineDigitFallback("acc-1", "5554981572275", check);
    expect(result).toEqual({ status: "has_whatsapp", canonicalPhone: "5554981572275" });
  });

  it("retries with the 9th-digit candidate when the first check is no_whatsapp on a 12-digit number", async () => {
    const calls: string[] = [];
    const check = async (_accountId: string, phoneDigits: string) => {
      calls.push(phoneDigits);
      if (phoneDigits === "5554981572275") {
        return { status: "has_whatsapp" as const, canonicalPhone: "5554981572275" };
      }
      return { status: "no_whatsapp" as const };
    };
    const result = await resolveNumberCheckWithNineDigitFallback("acc-1", "555481572275", check);
    expect(calls).toEqual(["555481572275", "5554981572275"]);
    expect(result).toEqual({ status: "has_whatsapp", canonicalPhone: "5554981572275" });
  });

  it("retries with the 9th-digit candidate when the first check is skipped on a 12-digit number", async () => {
    const calls: string[] = [];
    const check = async (_accountId: string, phoneDigits: string) => {
      calls.push(phoneDigits);
      if (phoneDigits === "5554981572275") {
        return { status: "has_whatsapp" as const, canonicalPhone: "5554981572275" };
      }
      return { status: "skipped" as const };
    };
    const result = await resolveNumberCheckWithNineDigitFallback("acc-1", "555481572275", check);
    expect(calls).toEqual(["555481572275", "5554981572275"]);
    expect(result).toEqual({ status: "has_whatsapp", canonicalPhone: "5554981572275" });
  });

  it("falls back to the original result when the candidate also fails", async () => {
    const check = async () => ({ status: "no_whatsapp" as const });
    const result = await resolveNumberCheckWithNineDigitFallback("acc-1", "555481572275", check);
    expect(result).toEqual({ status: "no_whatsapp" });
  });

  it("does not retry a 13-digit number (no ambiguous candidate)", async () => {
    let calls = 0;
    const check = async () => {
      calls += 1;
      return { status: "no_whatsapp" as const };
    };
    await resolveNumberCheckWithNineDigitFallback("acc-1", "5554981572275", check);
    expect(calls).toBe(1);
  });
});
```

Adicionar `resolveNumberCheckWithNineDigitFallback` ao import no topo do arquivo de teste:

```ts
import { classifyNumberCheck, resolveNumberCheckWithNineDigitFallback, type IEdgeResponse } from "./checkWhatsAppNumber";
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `bun run test src/features/conversations/api/checkWhatsAppNumber.test.ts`
Expected: FAIL — `resolveNumberCheckWithNineDigitFallback is not exported`.

- [ ] **Step 3: Implementar `resolveNumberCheckWithNineDigitFallback`**

Em `src/features/conversations/api/checkWhatsAppNumber.ts`, adicionar o import de `buildNineDigitCandidate` no topo:

```ts
import { getActiveDataSource } from "@/providers/data";
import { getSupabaseClient } from "@/shared/lib/supabase";
import type { ID } from "@/shared/types";
import { buildNineDigitCandidate } from "../engine/phoneBR";
```

E, no final do arquivo (depois de `checkWhatsAppNumber`), adicionar:

```ts
/**
 * Retries with the 9th-digit variant when the first check doesn't confirm
 * WhatsApp on an ambiguous 12-digit number — never inserts the 9 blindly,
 * only adopts the candidate if the WhatsApp network itself confirms it
 * (docs/superpowers/specs/2026-07-16-br-phone-nine-digit-reconciliation-design.md).
 */
export async function resolveNumberCheckWithNineDigitFallback(
  accountId: ID,
  phoneDigits: string,
  check: (accountId: ID, phoneDigits: string) => Promise<INumberCheckResult> = checkWhatsAppNumber,
): Promise<INumberCheckResult> {
  const first = await check(accountId, phoneDigits);
  if (first.status === "has_whatsapp") return first;
  const candidate = buildNineDigitCandidate(phoneDigits);
  if (!candidate) return first;
  const retry = await check(accountId, candidate);
  return retry.status === "has_whatsapp" ? retry : first;
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `bun run test src/features/conversations/api/checkWhatsAppNumber.test.ts`
Expected: PASS — todos os casos, incluindo os 5 novos de `resolveNumberCheckWithNineDigitFallback`.

- [ ] **Step 5: Ligar a reconsulta no fluxo "Nova conversa"**

Em `src/features/conversations/components/NewConversationDialog.tsx`, trocar o import de `checkWhatsAppNumber`:

```ts
import { checkWhatsAppNumber } from "../api/checkWhatsAppNumber";
```

por:

```ts
import { resolveNumberCheckWithNineDigitFallback } from "../api/checkWhatsAppNumber";
```

E dentro de `startNewNumber` (por volta das linhas 152-167), trocar:

```ts
    // Evolution pre-validates; Meta / offline / errors resolve to `skipped`.
    if (!forced) {
      setCheckState("checking");
      const check = await checkWhatsAppNumber(origin.id, norm.digits).catch(
        () => ({ status: "skipped" as const }),
      );
      setCheckState("idle");
      if (check.status === "no_whatsapp") {
        setCheckState("no_whatsapp");
        return; // D6: block, but the UI offers "Iniciar mesmo assim".
      }
      if (check.status === "has_whatsapp") {
        phoneFinal = check.canonicalPhone ?? norm.digits; // jid is canonical (D7).
        markValid = true;
      }
    }
```

por:

```ts
    // Evolution/WAHA pre-validate (retrying the 9th-digit variant when the
    // first attempt is ambiguous); Meta / offline / errors resolve to `skipped`.
    if (!forced) {
      setCheckState("checking");
      const check = await resolveNumberCheckWithNineDigitFallback(origin.id, norm.digits).catch(
        () => ({ status: "skipped" as const }),
      );
      setCheckState("idle");
      if (check.status === "no_whatsapp") {
        setCheckState("no_whatsapp");
        return; // D6: block, but the UI offers "Iniciar mesmo assim".
      }
      if (check.status === "has_whatsapp") {
        phoneFinal = check.canonicalPhone ?? norm.digits; // jid is canonical (D7).
        markValid = true;
        if (norm.digits.length === 12 && phoneFinal.length === 13) {
          toast.info("Número ajustado — o WhatsApp confirmou o número com o 9º dígito.");
        }
      }
    }
```

- [ ] **Step 6: Rodar a suíte completa**

Run: `bun run test`
Expected: todos os arquivos de teste passam (sem regressão).

- [ ] **Step 7: Commit**

```bash
git add src/features/conversations/api/checkWhatsAppNumber.ts src/features/conversations/api/checkWhatsAppNumber.test.ts src/features/conversations/components/NewConversationDialog.tsx
git commit -m "feat(conversations): retry number check with 9th-digit variant before blocking"
```

---

### Task 5: Atualizar docs de referência

**Files:**
- Modify: `docs/superpowers/specs/2026-06-16-nova-conversa-numero-inedito-design.md:275-276`

**Interfaces:**
- Consumes: nada (só texto de documentação).

- [ ] **Step 1: Anotar que o risco de falso-positivo de 9º dígito ganhou mitigação de código**

Em `docs/superpowers/specs/2026-06-16-nova-conversa-numero-inedito-design.md`, na seção `## 10. Riscos e validações empíricas pendentes`, trocar:

```markdown
- **Falso-positivo de 9º dígito** (#2062) e **`@lid` com `exists:false`** — o botão
  "Iniciar mesmo assim" (D6) é a válvula de escape para esses casos.
```

por:

```markdown
- **Falso-positivo de 9º dígito** (#2062) e **`@lid` com `exists:false`** — o botão
  "Iniciar mesmo assim" (D6) é a válvula de escape para esses casos. Desde
  2026-07-16, um número de 12 dígitos cuja checagem falhar tenta automaticamente
  a variante de 13 dígitos antes de bloquear — ver
  `docs/superpowers/specs/2026-07-16-br-phone-nine-digit-reconciliation-design.md`.
```

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/specs/2026-06-16-nova-conversa-numero-inedito-design.md
git commit -m "docs: cross-reference the 9th-digit reconciliation fix"
```
