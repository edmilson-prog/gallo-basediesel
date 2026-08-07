# Atalho de chave PIX no Atendimento — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar ao atendente um atalho no composer da conversa que envia uma chave PIX previamente cadastrada, opcionalmente com um QR Code, sem digitar a chave à mão.

**Architecture:** Lógica pura isolada em `src/features/pix/engine/` (testada com Vitest), camada de dados via Provider Pattern (`pix_keys` no Supabase, espelho no mock), UI em `src/features/pix/components/`. O QR é gerado no client sob demanda (canvas → PNG → pipeline de anexo que já existe). Nenhum motor de envio é tocado.

**Tech Stack:** React 19, TypeScript strict, Tailwind v4 + shadcn/ui, TanStack Query/Router, Vitest, Supabase, `qrcode-generator` (dependência nova).

**Spec:** `docs/superpowers/specs/2026-08-07-pix-shortcut-design.md` — leia antes de começar.

## Global Constraints

Valem para **todas** as tarefas, sem repetição em cada uma:

- **TypeScript `strict: true`.** Evitar `any`. Interfaces de domínio prefixadas com `I`.
- **Temas: APENAS tokens semânticos** (`bg-background`, `text-foreground`, `border-border`, `text-severity-*`). Nunca hex direto, nunca primitivos `--gallo-*`. **Exceção única e documentada:** as constantes de cor dentro de `drawPixQr.ts` (Task 4) — são bytes de imagem, não superfície de UI.
- **Textos de UI em português do Brasil com acentuação correta.** Código, nomes e comentários em inglês.
- **Provider Pattern:** features acessam dados **só** via `@/providers/data`. Proibido importar `@/mocks`, `@/providers/data/impl/*`, `@/providers/data/contracts/*` ou `factory` fora das camadas permitidas — o ESLint bloqueia.
- **Feature folder:** todo código novo em `src/features/pix/`, com barrel `index.ts`. Lógica de negócio em `engine/`, testada.
- **Ícones** via `@/components/Icon` (Iconify, `mdi:*`).
- **Nunca editar `src/routeTree.gen.ts` à mão** — é gerado pelo plugin do Vite.
- **Commits** em Conventional Commits, em inglês, no imperativo.
- **Migration** aplicada via MCP **deve** ser exportada para `supabase/migrations/` no mesmo PR. **Aplicar em produção é manual e exige OK explícito do dono** — nunca aplicar por conta própria.
- **`bun run test`** e **`bun run build`** são o gate de CI. `bunx tsc --noEmit` tem baseline pré-existente (~315 erros) — avaliar **por delta**, nunca exigir zero.

## Mapa de arquivos

| Arquivo | Responsabilidade | Task |
|---|---|---|
| `src/features/pix/engine/pixKeyFormat.ts` | canônico ↔ display, validação por tipo | 1 |
| `src/features/pix/engine/pixBrCode.ts` | payload EMV BR Code + CRC16 | 2 |
| `src/features/pix/engine/pixMessage.ts` | texto das 2 mensagens, sanitização | 3 |
| `src/features/pix/engine/qrGeometry.ts` | cálculo puro de escala/origem | 4 |
| `src/features/pix/engine/drawPixQr.ts` | desenho no canvas + `toBlob` | 4 |
| `src/shared/types/pix.ts` | `IPixKey`, `PixKeyType`, `IPixKeyProvider` | 5 |
| `src/providers/data/contracts/pixKey.ts` | re-export do contrato | 5 |
| `src/providers/data/impl/mock/pixKey.ts` | provider mock | 5 |
| `src/providers/data/impl/supabase/pixKey.ts` | provider supabase | 5 |
| `src/mocks/api/pixKey.ts` | API do mock | 5 |
| `supabase/migrations/<ts>_create_pix_keys_table.sql` | tabela + RLS | 5 |
| `src/features/pix/i18n/pt-BR.ts` | `PIX_STRINGS` | 6 |
| `src/features/pix/components/CopyKeyButton.tsx` | botão de copiar, 3 lugares | 6 |
| `src/features/pix/hooks/usePixKeys.ts` | leitura + resolução de atalho | 7 |
| `src/features/pix/hooks/usePixKeyAdmin.ts` | mutações (staff) | 7 |
| `src/features/pix/components/admin/PixKeysPage.tsx` | tela de configuração | 7 |
| `src/features/pix/components/admin/PixKeyEditor.tsx` | formulário | 7 |
| `src/features/pix/components/admin/PixPreviewThread.tsx` | preview ao vivo | 7 |
| `src/routes/app.configuracoes.pix.tsx` | rota | 8 |
| `src/features/shell/layouts/SettingsLayout.tsx:196` | item de menu | 8 |
| `src/features/pix/hooks/useSendPix.ts` | orquestra o envio das 2 mensagens | 9 |
| `src/features/pix/components/ComposerStagedPix.tsx` | barra de confirmação | 9 |
| `src/features/conversations/components/MessageInput.tsx` | integração | 10 |

---

## Task 1: Engine de formatação de chave

**Files:**
- Create: `src/features/pix/engine/pixKeyFormat.ts`
- Test: `src/features/pix/engine/pixKeyFormat.test.ts`

**Interfaces:**
- Consumes: nada (primeira tarefa).
- Produces: `PixKeyType` (tipo local, movido para `shared/types` na Task 5), `toCanonicalPixKey(type, raw): string`, `toDisplayPixKey(type, canonical): string`, `isValidPixKey(type, canonical): boolean`.

- [ ] **Step 1: Write the failing test**

```ts
// src/features/pix/engine/pixKeyFormat.test.ts
import { describe, it, expect } from "vitest";
import { toCanonicalPixKey, toDisplayPixKey, isValidPixKey } from "./pixKeyFormat";

describe("toCanonicalPixKey", () => {
  it("strips punctuation from CNPJ and CPF", () => {
    expect(toCanonicalPixKey("cnpj", "12.345.678/0001-95")).toBe("12345678000195");
    expect(toCanonicalPixKey("cpf", "123.456.789-09")).toBe("12345678909");
  });

  it("keeps only digits and a leading + on phone", () => {
    expect(toCanonicalPixKey("phone", "+55 (55) 99999-9999")).toBe("+5555999999999");
  });

  it("lowercases and trims e-mail", () => {
    expect(toCanonicalPixKey("email", "  Financeiro@Gallo.COM.br ")).toBe("financeiro@gallo.com.br");
  });

  it("lowercases a random key and keeps its hyphens", () => {
    expect(toCanonicalPixKey("random", "  E7B4F2A1-3C5D-4E6F-8A9B-0C1D2E3F4A5B "))
      .toBe("e7b4f2a1-3c5d-4e6f-8a9b-0c1d2e3f4a5b");
  });
});

describe("isValidPixKey", () => {
  // 12345678000195 — base 123456780001 with its real check digits (9 then 5).
  it("accepts a CNPJ with a correct check digit", () => {
    expect(isValidPixKey("cnpj", "12345678000195")).toBe(true);
  });

  it("rejects a CNPJ with a wrong check digit", () => {
    expect(isValidPixKey("cnpj", "12345678000190")).toBe(false);
    expect(isValidPixKey("cnpj", "12345678000191")).toBe(false);
  });

  it("rejects a CNPJ made of repeated digits", () => {
    expect(isValidPixKey("cnpj", "11111111111111")).toBe(false);
  });

  it("accepts a CPF with a correct check digit and rejects a wrong one", () => {
    expect(isValidPixKey("cpf", "12345678909")).toBe(true);
    expect(isValidPixKey("cpf", "12345678900")).toBe(false);
    expect(isValidPixKey("cpf", "11111111111")).toBe(false);
  });

  it("requires the country code on a phone key", () => {
    expect(isValidPixKey("phone", "+5555999999999")).toBe(true);
    expect(isValidPixKey("phone", "5599999999")).toBe(false);
  });

  it("validates e-mail shape", () => {
    expect(isValidPixKey("email", "financeiro@gallo.com.br")).toBe(true);
    expect(isValidPixKey("email", "financeiro@")).toBe(false);
  });

  it("validates the random key as a UUID", () => {
    expect(isValidPixKey("random", "e7b4f2a1-3c5d-4e6f-8a9b-0c1d2e3f4a5b")).toBe(true);
    expect(isValidPixKey("random", "e7b4f2a1-3c5d-4e6f")).toBe(false);
  });
});

describe("toDisplayPixKey", () => {
  it("formats each type for reading", () => {
    expect(toDisplayPixKey("cnpj", "12345678000195")).toBe("12.345.678/0001-95");
    expect(toDisplayPixKey("cpf", "12345678909")).toBe("123.456.789-09");
    expect(toDisplayPixKey("phone", "+5555999999999")).toBe("+55 55 99999-9999");
    expect(toDisplayPixKey("email", "financeiro@gallo.com.br")).toBe("financeiro@gallo.com.br");
  });

  it("returns the canonical value untouched when it is incomplete", () => {
    // A half-typed key in the editor must never be mangled by the formatter.
    expect(toDisplayPixKey("cnpj", "123456")).toBe("123456");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test -- src/features/pix/engine/pixKeyFormat.test.ts`
Expected: FAIL — "Failed to resolve import ./pixKeyFormat".

- [ ] **Step 3: Write the implementation**

```ts
// src/features/pix/engine/pixKeyFormat.ts
//
// Canonical vs. display are deliberately two different values. The canonical
// form is what goes to the clipboard, to the WhatsApp message and to the BR
// Code payload; the display form exists only to be read on screen. Copying a
// display value by accident is a money bug — see the spec, §4.1.

export type PixKeyType = "cnpj" | "cpf" | "phone" | "email" | "random";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

/** Shared check-digit routine for CPF (9 base digits) and CNPJ (12 base digits). */
function hasValidCheckDigits(digits: string, weights: number[][]): boolean {
  const base = digits.slice(0, weights[0].length);
  let acc = base;
  for (const weight of weights) {
    const sum = weight.reduce((total, w, i) => total + Number(acc[i]) * w, 0);
    const rest = sum % 11;
    acc += String(rest < 2 ? 0 : 11 - rest);
  }
  return acc === digits;
}

const CPF_WEIGHTS = [
  [10, 9, 8, 7, 6, 5, 4, 3, 2],
  [11, 10, 9, 8, 7, 6, 5, 4, 3, 2],
];
const CNPJ_WEIGHTS = [
  [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2],
  [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2],
];

export function toCanonicalPixKey(type: PixKeyType, raw: string): string {
  const trimmed = raw.trim();
  switch (type) {
    case "cnpj":
    case "cpf":
      return digitsOnly(trimmed);
    case "phone": {
      const digits = digitsOnly(trimmed);
      return digits ? `+${digits}` : "";
    }
    case "email":
    case "random":
      return trimmed.toLowerCase();
  }
}

export function isValidPixKey(type: PixKeyType, canonical: string): boolean {
  switch (type) {
    case "cnpj":
      if (canonical.length !== 14 || /^(\d)\1{13}$/.test(canonical)) return false;
      return hasValidCheckDigits(canonical, CNPJ_WEIGHTS);
    case "cpf":
      if (canonical.length !== 11 || /^(\d)\1{10}$/.test(canonical)) return false;
      return hasValidCheckDigits(canonical, CPF_WEIGHTS);
    case "phone":
      // E.164: leading + and 12-14 digits (country + area + subscriber).
      return /^\+\d{12,14}$/.test(canonical);
    case "email":
      return EMAIL_RE.test(canonical) && canonical.length <= 77;
    case "random":
      return UUID_RE.test(canonical);
  }
}

export function toDisplayPixKey(type: PixKeyType, canonical: string): string {
  switch (type) {
    case "cnpj":
      if (canonical.length !== 14) return canonical;
      return canonical.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
    case "cpf":
      if (canonical.length !== 11) return canonical;
      return canonical.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
    case "phone": {
      const m = /^\+(\d{2})(\d{2})(\d{4,5})(\d{4})$/.exec(canonical);
      return m ? `+${m[1]} ${m[2]} ${m[3]}-${m[4]}` : canonical;
    }
    case "email":
    case "random":
      return canonical;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test -- src/features/pix/engine/pixKeyFormat.test.ts`
Expected: PASS — all assertions green.

- [ ] **Step 5: Commit**

```bash
git add src/features/pix/engine/pixKeyFormat.ts src/features/pix/engine/pixKeyFormat.test.ts
git commit -m "feat(pix): add PIX key canonical/display formatting engine"
```

---

## Task 2: Engine do BR Code (payload EMV + CRC16)

**Files:**
- Create: `src/features/pix/engine/pixBrCode.ts`
- Test: `src/features/pix/engine/pixBrCode.test.ts`

**Interfaces:**
- Consumes: `PixKeyType` de `./pixKeyFormat`.
- Produces: `toAscii(value, maxLen): string`, `crc16Ccitt(payload): string`, `buildPixPayload(input): { ok: true; value: string } | { ok: false; reason: string }` onde `input = { keyValue: string; receiverName: string; receiverCity: string }`.

> **A caixa do nome é preservada, não uppercase.** O padrão BR Code não exige maiúsculas, e
> o exemplo canônico do BACEN usa `Fulano de Tal`. `toAscii` remove acento e caracteres
> fora do ASCII imprimível, e só isso.

- [ ] **Step 1: Write the failing test**

O caso de referência é o exemplo canônico do Manual do BR Code do BACEN. Ele existe para pegar regressão no CRC — **não altere seus valores**.

```ts
// src/features/pix/engine/pixBrCode.test.ts
import { describe, it, expect } from "vitest";
import { buildPixPayload, crc16Ccitt, toAscii } from "./pixBrCode";

const REFERENCE =
  "00020126330014BR.GOV.BCB.PIX0111123456789015204000053039865802BR5913Fulano de Tal6008BRASILIA62070503***63041D3D";

describe("crc16Ccitt", () => {
  it("matches the BACEN reference payload checksum", () => {
    expect(crc16Ccitt(REFERENCE.slice(0, -4))).toBe("1D3D");
  });

  it("always returns four uppercase hex characters", () => {
    expect(crc16Ccitt("A")).toMatch(/^[0-9A-F]{4}$/);
  });
});

describe("buildPixPayload", () => {
  it("reproduces the BACEN reference payload byte for byte", () => {
    const result = buildPixPayload({
      keyValue: "12345678901",
      receiverName: "Fulano de Tal",
      receiverCity: "BRASILIA",
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe(REFERENCE);
  });

  it("carries no transaction amount — the key is static (D-3)", () => {
    const result = buildPixPayload({
      keyValue: "12345678000195",
      receiverName: "GALLO BASE DIESEL",
      receiverCity: "FREDERICO W",
    });
    expect(result.ok).toBe(true);
    // Tag 54 is the transaction amount; a static key must not carry it.
    if (result.ok) expect(result.value).not.toContain("54");
  });

  it("rejects an empty key instead of emitting a half-built payload", () => {
    const result = buildPixPayload({
      keyValue: "",
      receiverName: "GALLO",
      receiverCity: "FREDERICO W",
    });
    expect(result.ok).toBe(false);
  });

  it("rejects a receiver name longer than 25 characters", () => {
    const result = buildPixPayload({
      keyValue: "12345678000195",
      receiverName: "A".repeat(26),
      receiverCity: "FREDERICO W",
    });
    expect(result.ok).toBe(false);
  });

  it("rejects a city longer than 15 characters", () => {
    const result = buildPixPayload({
      keyValue: "12345678000195",
      receiverName: "GALLO",
      receiverCity: "A".repeat(16),
    });
    expect(result.ok).toBe(false);
  });
});

describe("toAscii", () => {
  it("strips accents — a non-ASCII byte decodes wrong in the Latin-1 encoder", () => {
    expect(toAscii("Frederico Westphalen", 25)).toBe("Frederico Westphalen");
    expect(toAscii("São João", 25)).toBe("Sao Joao");
    expect(toAscii("Comércio & Peças", 25)).toBe("Comercio & Pecas");
  });

  it("preserves case — the BR Code spec does not require uppercase", () => {
    expect(toAscii("Fulano de Tal", 25)).toBe("Fulano de Tal");
  });

  it("truncates to the given limit", () => {
    expect(toAscii("A".repeat(40), 15)).toHaveLength(15);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test -- src/features/pix/engine/pixBrCode.test.ts`
Expected: FAIL — "Failed to resolve import ./pixBrCode".

- [ ] **Step 3: Write the implementation**

```ts
// src/features/pix/engine/pixBrCode.ts
//
// Static BR Code (EMV®QRCPS-MPM) builder. Static means: no transaction amount
// (tag 54) — the customer types how much to pay. See the spec, D-3.
//
// Every field is TLV: two-digit id + two-digit length + value. The CRC is the
// last field and its own "6304" header IS part of what gets hashed.

export const RECEIVER_NAME_MAX = 25;
export const RECEIVER_CITY_MAX = 15;

/**
 * Normalizes to unaccented ASCII. This is not cosmetic: `qrcode-generator`
 * encodes with a Latin-1 `stringToBytes`, so a `ç` produces bytes some readers
 * decode wrong — and the BR Code spec requires ASCII anyway.
 *
 * Case is PRESERVED: the spec does not require uppercase and the canonical
 * BACEN example reads "Fulano de Tal".
 */
export function toAscii(value: string, maxLen: number): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\x20-\x7E]/g, "")
    .trim()
    .slice(0, maxLen);
}

function tlv(id: string, value: string): string {
  return `${id}${String(value.length).padStart(2, "0")}${value}`;
}

/** CRC16/CCITT-FALSE — polynomial 0x1021, initial value 0xFFFF. */
export function crc16Ccitt(payload: string): string {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i += 1) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 0x8000) !== 0 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

export interface IPixPayloadInput {
  /** Canonical key (see pixKeyFormat). */
  keyValue: string;
  receiverName: string;
  receiverCity: string;
}

export type PixPayloadResult =
  | { ok: true; value: string }
  | { ok: false; reason: "missing-key" | "name-too-long" | "city-too-long" | "missing-receiver" };

/**
 * Builds the full static payload. Returns a discriminated result instead of
 * throwing: the editor calls this on every keystroke and a half-typed key is a
 * normal state, not an exception.
 */
export function buildPixPayload(input: IPixPayloadInput): PixPayloadResult {
  const key = input.keyValue.trim();
  if (!key) return { ok: false, reason: "missing-key" };

  // Validate BEFORE truncating, so an over-long name is an error the editor can
  // report — silently cutting the receiver name is how money reaches a payload
  // that looks valid and fails only inside the bank app.
  const rawName = input.receiverName.trim();
  const rawCity = input.receiverCity.trim();
  if (!rawName || !rawCity) return { ok: false, reason: "missing-receiver" };
  if (toAscii(rawName, RECEIVER_NAME_MAX + 1).length > RECEIVER_NAME_MAX) {
    return { ok: false, reason: "name-too-long" };
  }
  if (toAscii(rawCity, RECEIVER_CITY_MAX + 1).length > RECEIVER_CITY_MAX) {
    return { ok: false, reason: "city-too-long" };
  }

  const merchantAccount = tlv("00", "BR.GOV.BCB.PIX") + tlv("01", key);

  const body =
    tlv("00", "01") +
    tlv("26", merchantAccount) +
    tlv("52", "0000") +
    tlv("53", "986") +
    tlv("58", "BR") +
    tlv("59", toAscii(rawName, RECEIVER_NAME_MAX)) +
    tlv("60", toAscii(rawCity, RECEIVER_CITY_MAX)) +
    tlv("62", tlv("05", "***"));

  const withCrcHeader = `${body}6304`;
  return { ok: true, value: `${withCrcHeader}${crc16Ccitt(withCrcHeader)}` };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test -- src/features/pix/engine/pixBrCode.test.ts`
Expected: PASS. O teste de referência é o que importa — se o CRC não bater com `1D3D`, o bug está no `crc16Ccitt` ou na ordem dos TLVs, não no teste.

- [ ] **Step 5: Commit**

```bash
git add src/features/pix/engine/pixBrCode.ts src/features/pix/engine/pixBrCode.test.ts
git commit -m "feat(pix): add static BR Code payload builder with CRC16"
```

---

## Task 3: Engine do texto das mensagens

**Files:**
- Create: `src/features/pix/engine/pixMessage.ts`
- Test: `src/features/pix/engine/pixMessage.test.ts`

**Interfaces:**
- Consumes: `PixKeyType` de `./pixKeyFormat`.
- Produces: `sanitizeWhatsAppMarkers(value): string`, `buildPixCaption(input): string` onde `input = { receiverName: string; keyType: PixKeyType; context?: string; includeKeyHint: boolean }`.

- [ ] **Step 1: Write the failing test**

```ts
// src/features/pix/engine/pixMessage.test.ts
import { describe, it, expect } from "vitest";
import { buildPixCaption, sanitizeWhatsAppMarkers } from "./pixMessage";

describe("sanitizeWhatsAppMarkers", () => {
  it("removes the characters that would corrupt WhatsApp formatting", () => {
    // A stray * or _ in the receiver name breaks the bold of the whole message.
    expect(sanitizeWhatsAppMarkers("GALLO *BASE* _DIESEL_")).toBe("GALLO BASE DIESEL");
    expect(sanitizeWhatsAppMarkers("A~B`C")).toBe("ABC");
  });

  it("leaves ordinary text untouched", () => {
    expect(sanitizeWhatsAppMarkers("GALLO BASE DIESEL")).toBe("GALLO BASE DIESEL");
  });
});

describe("buildPixCaption", () => {
  it("uses the custom context when the attendant typed one", () => {
    const caption = buildPixCaption({
      receiverName: "GALLO BASE DIESEL",
      keyType: "cnpj",
      context: "Segue a chave para o pagamento do pedido 4471.",
      includeKeyHint: true,
    });
    expect(caption).toContain("Segue a chave para o pagamento do pedido 4471.");
  });

  it("falls back to a default block naming the receiver and key type", () => {
    const caption = buildPixCaption({
      receiverName: "GALLO BASE DIESEL",
      keyType: "cnpj",
      includeKeyHint: true,
    });
    expect(caption).toContain("*Pagamento via PIX*");
    expect(caption).toContain("GALLO BASE DIESEL");
    expect(caption).toContain("CNPJ");
  });

  it("teaches the long-press gesture when the key follows in its own message", () => {
    const caption = buildPixCaption({
      receiverName: "GALLO",
      keyType: "cnpj",
      includeKeyHint: true,
    });
    expect(caption).toContain("tocar e segurar");
  });

  it("omits the long-press hint when no key message follows", () => {
    const caption = buildPixCaption({
      receiverName: "GALLO",
      keyType: "cnpj",
      includeKeyHint: false,
    });
    expect(caption).not.toContain("tocar e segurar");
  });

  it("sanitizes the receiver name so it cannot break the bold markers", () => {
    const caption = buildPixCaption({
      receiverName: "GALLO *BASE*",
      keyType: "cnpj",
      includeKeyHint: false,
    });
    expect(caption).toContain("GALLO BASE");
    // Only the intentional bold markers survive.
    expect(caption.split("*")).toHaveLength(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test -- src/features/pix/engine/pixMessage.test.ts`
Expected: FAIL — "Failed to resolve import ./pixMessage".

- [ ] **Step 3: Write the implementation**

```ts
// src/features/pix/engine/pixMessage.ts
import type { PixKeyType } from "./pixKeyFormat";

const KEY_TYPE_LABEL: Record<PixKeyType, string> = {
  cnpj: "CNPJ",
  cpf: "CPF",
  phone: "Telefone",
  email: "E-mail",
  random: "Aleatória",
};

/**
 * Strips the characters WhatsApp reads as formatting. An unbalanced `*` in the
 * receiver name turns the bold of the entire message inside out.
 */
export function sanitizeWhatsAppMarkers(value: string): string {
  return value.replace(/[*_~`]/g, "").replace(/\s{2,}/g, " ").trim();
}

export interface IPixCaptionInput {
  receiverName: string;
  keyType: PixKeyType;
  /** Attendant-authored text; falls back to the default block when empty. */
  context?: string;
  /** True when the key goes out as its own trailing message. */
  includeKeyHint: boolean;
}

/**
 * The text that precedes the key — either the message body (text-only send) or
 * the QR image caption. The key itself is NEVER part of this string: it goes in
 * its own trailing message so a long-press copies it clean (spec §3).
 */
export function buildPixCaption(input: IPixCaptionInput): string {
  const receiver = sanitizeWhatsAppMarkers(input.receiverName);
  const custom = input.context ? sanitizeWhatsAppMarkers(input.context) : "";

  const head = custom || `*Pagamento via PIX*\nFavorecido: ${receiver}`;
  const typeLine = custom ? "" : `Tipo de chave: ${KEY_TYPE_LABEL[input.keyType]}`;
  const hint = input.includeKeyHint
    ? "A chave vai na próxima mensagem — é só tocar e segurar para copiar."
    : "";

  return [head, typeLine, hint].filter(Boolean).join("\n");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test -- src/features/pix/engine/pixMessage.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/pix/engine/pixMessage.ts src/features/pix/engine/pixMessage.test.ts
git commit -m "feat(pix): add message caption builder with WhatsApp marker sanitizing"
```

---

## Task 4: Geometria e desenho do QR

**Files:**
- Create: `src/features/pix/engine/qrGeometry.ts`
- Create: `src/features/pix/engine/drawPixQr.ts`
- Test: `src/features/pix/engine/qrGeometry.test.ts`
- Modify: `package.json` (dependência `qrcode-generator`)

**Interfaces:**
- Consumes: nada dos anteriores.
- Produces: `computeQrGeometry(moduleCount, width, height, boxRatio?): { scale: number; side: number; originX: number; originY: number }`, `PIX_QR_EXPORT = { width: 800, height: 600 }`, `PIX_QR_BOX_RATIO`, `QUIET_MODULES`, `drawPixQr(canvas, payload, opts)`, `canvasToPixFile(canvas, alias): Promise<File | null>`.

> **Por que 800×600 e não quadrado:** `ImageBubble.tsx:57` renderiza miniaturas em
> `aspect-[4/3] w-[260px]` e a `<img>` da linha 67 usa `object-cover`. Um PNG quadrado
> perde 25% em cima e 25% embaixo — some a quiet zone e o corte entra nos finder
> patterns. **Não altere o `ImageBubble`**; é área sensível. O ativo se adapta.

- [ ] **Step 1: Add the dependency**

```bash
bun add qrcode-generator
```

Expected: instala sem tocar em `minimumReleaseAgeExcludes` (a versão 2.0.4 está muito acima do guard de 24 h do `bunfig.toml`) e sem dependências transitivas.

Se o TypeScript reclamar da falta de tipos, crie `src/types/qrcode-generator.d.ts`:

```ts
declare module "qrcode-generator" {
  interface QRCode {
    addData(data: string): void;
    make(): void;
    getModuleCount(): number;
    isDark(row: number, col: number): boolean;
  }
  function qrcode(typeNumber: number, errorCorrectionLevel: "L" | "M" | "Q" | "H"): QRCode;
  export default qrcode;
}
```

- [ ] **Step 2: Write the failing test**

```ts
// src/features/pix/engine/qrGeometry.test.ts
import { describe, it, expect } from "vitest";
import {
  computeQrGeometry,
  PIX_QR_BOX_RATIO,
  PIX_QR_EXPORT,
  QUIET_MODULES,
} from "./qrGeometry";

/** The export geometry, as the renderer computes it. */
const exportGeometry = (count: number) =>
  computeQrGeometry(count, PIX_QR_EXPORT.width, PIX_QR_EXPORT.height, PIX_QR_BOX_RATIO);

describe("computeQrGeometry", () => {
  it("always produces an integer module scale", () => {
    // Fractional scale anti-aliases the module edges and is the number one
    // cause of a QR that "sometimes scans".
    for (let count = 21; count <= 77; count += 4) {
      const g = exportGeometry(count);
      expect(Number.isInteger(g.scale)).toBe(true);
      expect(g.scale).toBeGreaterThanOrEqual(2);
    }
  });

  it("keeps the whole symbol plus its quiet zone inside the canvas", () => {
    const g = exportGeometry(49);
    expect(g.side).toBe((49 + QUIET_MODULES * 2) * g.scale);
    expect(g.side).toBeLessThanOrEqual(PIX_QR_EXPORT.height);
    expect(g.originX).toBeGreaterThanOrEqual(0);
    expect(g.originY).toBeGreaterThanOrEqual(0);
  });

  it("centres the symbol on integer pixel boundaries", () => {
    const g = exportGeometry(45);
    expect(Number.isInteger(g.originX)).toBe(true);
    expect(Number.isInteger(g.originY)).toBe(true);
    expect(g.originX).toBe(Math.round((PIX_QR_EXPORT.width - g.side) / 2));
  });

  it("leaves a white band above and below in the 4:3 export", () => {
    // The 512px target box inside a 600px-tall canvas is what guarantees this.
    // Without the box ratio the symbol would grow to 570px and leave 15px a side.
    const g = exportGeometry(49);
    expect((PIX_QR_EXPORT.height - g.side) / 2).toBeGreaterThanOrEqual(44);
  });

  it("fills a square preview canvas — no box ratio there", () => {
    const g = computeQrGeometry(49, 448, 448);
    expect(Number.isInteger(g.scale)).toBe(true);
    expect(g.side).toBeLessThanOrEqual(448);
    // The preview must stay sharp: at DPR 2 this is 7px per module.
    expect(g.scale).toBeGreaterThanOrEqual(7);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `bun run test -- src/features/pix/engine/qrGeometry.test.ts`
Expected: FAIL — "Failed to resolve import ./qrGeometry".

- [ ] **Step 4: Write the geometry module**

```ts
// src/features/pix/engine/qrGeometry.ts
//
// Pure geometry, kept apart from the canvas so the integer-scale rule is
// testable without a DOM.

/** Quiet zone required by the spec, in modules, on each side. */
export const QUIET_MODULES = 4;

/** 4:3 so ImageBubble's object-cover crops nothing. See the spec, §5.4. */
export const PIX_QR_EXPORT = { width: 800, height: 600 } as const;

/**
 * Target drawing box on the export: 512px inside a 600px-tall canvas, so the
 * symbol keeps a white band of ~44px top and bottom. Without it the symbol
 * would grow to fill the short edge and sit too close to the image border,
 * which some readers treat as a missing quiet zone.
 */
export const PIX_QR_BOX_RATIO = 512 / 600;

export interface IQrGeometry {
  scale: number;
  side: number;
  originX: number;
  originY: number;
}

export function computeQrGeometry(
  moduleCount: number,
  width: number,
  height: number,
  /** 1 fills the shorter edge (preview); PIX_QR_BOX_RATIO insets it (export). */
  boxRatio = 1,
): IQrGeometry {
  const total = moduleCount + QUIET_MODULES * 2;
  const box = Math.min(width, height) * boxRatio;
  // Integer scale, always — this is the rule that keeps the QR scannable.
  const scale = Math.max(2, Math.floor(box / total));
  const side = total * scale;
  return {
    scale,
    side,
    originX: Math.round((width - side) / 2),
    originY: Math.round((height - side) / 2),
  };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bun run test -- src/features/pix/engine/qrGeometry.test.ts`
Expected: PASS.

- [ ] **Step 6: Write the canvas renderer**

```ts
// src/features/pix/engine/drawPixQr.ts
import qrcode from "qrcode-generator";
import {
  computeQrGeometry,
  PIX_QR_BOX_RATIO,
  PIX_QR_EXPORT,
  QUIET_MODULES,
} from "./qrGeometry";

// ⚠️ Os valores abaixo são hex literal DE PROPÓSITO e NÃO violam a regra de
// tokens semânticos do projeto: não são superfície de UI, são os BYTES de uma
// imagem que sai do app e é lida por um scanner. Um QR precisa ser preto puro
// sobre branco puro em qualquer tema — tematizar aqui quebra a leitura. Os
// tokens governam a MOLDURA no CRM (bg-muted, border-border), nunca o conteúdo
// do PNG. Não troque por bg-foreground.
const MODULE_COLOR = "#000000";
const BG_COLOR = "#FFFFFF";

/** Error correction M (15%): L does not survive WhatsApp recompression. */
const ERROR_CORRECTION = "M" as const;

export interface IDrawPixQrOptions {
  /** Preview mode: square canvas of this CSS size, scaled by DPR. */
  cssSize?: number;
}

/** Draws the payload onto the canvas. Returns false when the 2D context is unavailable. */
export function drawPixQr(
  canvas: HTMLCanvasElement,
  payload: string,
  opts: IDrawPixQrOptions = {},
): boolean {
  const qr = qrcode(0, ERROR_CORRECTION);
  qr.addData(payload); // payload já normalizado em ASCII pelo pixBrCode
  qr.make();
  const count = qr.getModuleCount();

  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const width = opts.cssSize ? Math.round(opts.cssSize * dpr) : PIX_QR_EXPORT.width;
  const height = opts.cssSize ? Math.round(opts.cssSize * dpr) : PIX_QR_EXPORT.height;

  canvas.width = width;
  canvas.height = height;
  if (opts.cssSize) {
    canvas.style.width = `${opts.cssSize}px`;
    canvas.style.height = `${opts.cssSize}px`;
  }

  const ctx = canvas.getContext("2d");
  if (!ctx) return false;

  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(0, 0, width, height);

  // Preview fills the square canvas; the 4:3 export insets to the target box.
  const g = computeQrGeometry(count, width, height, opts.cssSize ? 1 : PIX_QR_BOX_RATIO);
  ctx.fillStyle = MODULE_COLOR;
  for (let row = 0; row < count; row += 1) {
    for (let col = 0; col < count; col += 1) {
      if (!qr.isDark(row, col)) continue;
      ctx.fillRect(
        g.originX + (QUIET_MODULES + col) * g.scale,
        g.originY + (QUIET_MODULES + row) * g.scale,
        g.scale,
        g.scale,
      );
    }
  }
  return true;
}

/** Slugifies an alias for the download filename. */
function slug(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "chave";
}

/**
 * PNG only — JPEG artefacts on 1px module edges destroy scannability.
 * The filename reaches ImageBubble's download label, so it must be descriptive.
 */
export function canvasToPixFile(canvas: HTMLCanvasElement, alias: string): Promise<File | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      resolve(blob ? new File([blob], `pix-${slug(alias)}.png`, { type: "image/png" }) : null);
    }, "image/png");
  });
}
```

- [ ] **Step 7: Verify the build compiles**

Run: `bun run build`
Expected: SUCCESS. (O `drawPixQr` não tem teste unitário — canvas não roda no ambiente de teste. A regra crítica, a escala inteira, está coberta em `qrGeometry.test.ts`.)

- [ ] **Step 8: Commit**

```bash
git add package.json bun.lock src/features/pix/engine/qrGeometry.ts \
  src/features/pix/engine/qrGeometry.test.ts src/features/pix/engine/drawPixQr.ts
git commit -m "feat(pix): add QR geometry and canvas renderer with integer module scale"
```

---

## Task 5: Camada de dados

**Files:**
- Create: `src/shared/types/pix.ts`
- Modify: `src/shared/types/index.ts` (re-export do barrel)
- Create: `src/providers/data/contracts/pixKey.ts`
- Modify: `src/providers/data/contracts/index.ts`
- Create: `src/mocks/api/pixKey.ts`
- Modify: `src/mocks/api/index.ts`, `src/mocks/config.ts:44+94`, `src/mocks/store/mutations.ts:60+90`, `src/mocks/store/selectors.ts`, `src/mocks/generators/bootstrap.ts:125+338+611`
- Create: `src/providers/data/impl/mock/pixKey.ts`, `src/providers/data/impl/supabase/pixKey.ts`
- Create: `src/providers/data/hooks/usePixKeyProvider.ts`
- Modify: `src/providers/data/factory.ts`, `src/providers/data/index.ts`
- Create: `supabase/migrations/<timestamp>_create_pix_keys_table.sql`

**Interfaces:**
- Consumes: `PixKeyType` da Task 1 (mova o tipo para `shared/types/pix.ts` e re-exporte de `pixKeyFormat.ts` para não quebrar os testes).
- Produces: `IPixKey`, `IPixKeyProvider`, `usePixKeyProvider()`.

> **Espelhe `quick_replies` em tudo.** Os vizinhos a copiar são
> `src/providers/data/impl/supabase/quickReply.ts` (mapper row↔camelCase),
> `src/providers/data/impl/mock/quickReply.ts` (`withCreateStoreId` + `logMockMutation`),
> `src/mocks/api/quickReply.ts` (`runApi`) e
> `supabase/migrations/20260609015038_rls_slice3_personal_assets.sql` (políticas).
> Não invente estrutura nova.

- [ ] **Step 1: Define the domain type**

```ts
// src/shared/types/pix.ts
import type { ID, ISO8601 } from "./common";

export type PixKeyType = "cnpj" | "cpf" | "phone" | "email" | "random";

export interface IPixKey {
  id: ID;
  storeId: ID;
  /** Operational nickname — "Matriz — CNPJ", "Filial Palmeira". */
  alias: string;
  keyType: PixKeyType;
  /** CANONICAL form — this is what goes to the clipboard, the message and the
   *  BR Code. Never the formatted display value. */
  keyValue: string;
  /** BR Code receiver — max 25 ASCII characters. */
  receiverName: string;
  /** BR Code city — max 15 ASCII characters. */
  receiverCity: string;
  /** Default text that accompanies the send; editable in the staged bar. */
  defaultContext?: string;
  /** Optional shortcut, e.g. "/pix-matriz". */
  shortcut?: string;
  defaultSendText: boolean;
  defaultSendQr: boolean;
  isDefault: boolean;
  isActive: boolean;
  createdBy: ID;
  createdAt: ISO8601;
  updatedAt: ISO8601;
}

export interface IPixKeyProvider {
  list(params: { storeId?: ID; activeOnly?: boolean }): Promise<IPixKey[]>;
  get(id: ID): Promise<IPixKey | null>;
  create(input: Omit<IPixKey, "id" | "storeId" | "createdAt" | "updatedAt">): Promise<IPixKey>;
  update(id: ID, patch: Partial<IPixKey>): Promise<IPixKey>;
  delete(id: ID): Promise<IPixKey>;
}
```

Em `src/shared/types/index.ts`, adicione `export * from "./pix";`.

Em `src/features/pix/engine/pixKeyFormat.ts`, troque a definição local por
`export type { PixKeyType } from "@/shared/types";` e importe o tipo do barrel.

- [ ] **Step 2: Write the migration**

Crie `supabase/migrations/<timestamp>_create_pix_keys_table.sql` (timestamp no formato
`YYYYMMDDHHMMSS`, à frente do último arquivo existente):

```sql
-- Store-owned PIX keys for the conversation shortcut.
-- Read: the whole store (the attendant needs the key to send it).
-- Write: staff only (Owner/Gestor) — a PIX key is the company's, not the seller's.
create table if not exists public.pix_keys (
  id text primary key,
  store_id text not null references public.stores (id),
  alias text not null,
  key_type text not null check (key_type in ('cnpj','cpf','phone','email','random')),
  key_value text not null,
  receiver_name text not null,
  receiver_city text not null,
  default_context text,
  shortcut text,
  default_send_text boolean not null default true,
  default_send_qr boolean not null default false,
  is_default boolean not null default false,
  is_active boolean not null default true,
  created_by text not null references public.sellers (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists pix_keys_store_id_idx on public.pix_keys (store_id);
create index if not exists pix_keys_shortcut_idx on public.pix_keys (shortcut);

alter table public.pix_keys enable row level security;

drop policy if exists pix_keys_select on public.pix_keys;
create policy pix_keys_select on public.pix_keys
  for select to authenticated
  using (store_id = public.current_store_id());

drop policy if exists pix_keys_insert on public.pix_keys;
create policy pix_keys_insert on public.pix_keys
  for insert to authenticated
  with check (store_id = public.current_store_id() and public.is_staff());

drop policy if exists pix_keys_update on public.pix_keys;
create policy pix_keys_update on public.pix_keys
  for update to authenticated
  using (store_id = public.current_store_id() and public.is_staff())
  with check (store_id = public.current_store_id() and public.is_staff());

drop policy if exists pix_keys_delete on public.pix_keys;
create policy pix_keys_delete on public.pix_keys
  for delete to authenticated
  using (store_id = public.current_store_id() and public.is_staff());
```

> ⚠️ **NÃO aplique em produção.** A aplicação é manual e exige OK explícito do dono.
> O arquivo entra no PR; o dono aplica quando decidir.

- [ ] **Step 3: Wire the mock layer**

1. `src/mocks/config.ts`: adicione `| "pixKeys"` à união (junto de `"quickReplies"`, linha ~44) e `pixKeys: 2,` aos volumes (~linha 94) — o mesmo número de chaves que o bootstrap gera no Step 3.6.
2. `src/mocks/store/mutations.ts`: adicione `| "pixKeys"` (~60) e `pixKeys: IPixKey;` ao mapa de tipos (~90).
3. `src/mocks/store/selectors.ts`, ao lado de `selectAllQuickReplies`:

```ts
export function selectAllPixKeys(): IPixKey[] {
  return getMockState().pixKeys;
}

export function selectPixKeyById(id: ID): IPixKey | null {
  return getMockState().pixKeys.find((k) => k.id === id) ?? null;
}
```

4. `src/mocks/api/pixKey.ts` — mesma forma de `quickReply.ts` (`runApi`, `upsert`,
   `patchById`, `removeById`, `MockNotFoundError`):

```ts
import type { ID, IPixKey } from "@/shared/types";
import { selectAllPixKeys, selectPixKeyById } from "../store/selectors";
import { patchById, removeById, upsert } from "../store/mutations";
import { MockNotFoundError, runApi } from "./utils";

export const pixKeyApi = {
  list(params: { storeId?: ID; activeOnly?: boolean } = {}): Promise<IPixKey[]> {
    return runApi(
      "pixKeyApi",
      "list",
      () =>
        selectAllPixKeys().filter((k) => {
          if (params.storeId && k.storeId !== params.storeId) return false;
          if (params.activeOnly && !k.isActive) return false;
          return true;
        }),
      { payload: params },
    );
  },

  get(id: ID): Promise<IPixKey | null> {
    return runApi("pixKeyApi", "get", () => selectPixKeyById(id), { payload: { id } });
  },

  create(input: Omit<IPixKey, "id" | "createdAt" | "updatedAt">): Promise<IPixKey> {
    return runApi(
      "pixKeyApi",
      "create",
      () => {
        const nowIso = new Date().toISOString();
        const key: IPixKey = {
          ...input,
          id: `pix-${crypto.randomUUID()}`,
          createdAt: nowIso,
          updatedAt: nowIso,
        };
        upsert("pixKeys", key);
        return key;
      },
      { payload: input },
    );
  },

  update(id: ID, patch: Partial<IPixKey>): Promise<IPixKey> {
    return runApi(
      "pixKeyApi",
      "update",
      () => {
        const updated = patchById("pixKeys", id, { ...patch, updatedAt: new Date().toISOString() });
        if (!updated) throw new MockNotFoundError("pixKey", id);
        return updated;
      },
      { payload: { id, patch } },
    );
  },

  delete(id: ID): Promise<IPixKey> {
    return runApi(
      "pixKeyApi",
      "delete",
      () => {
        const before = selectPixKeyById(id);
        if (!before) throw new MockNotFoundError("pixKey", id);
        removeById("pixKeys", id);
        return before;
      },
      { payload: { id } },
    );
  },
};
```

5. Exporte `pixKeyApi` de `src/mocks/api/index.ts` e do barrel `src/mocks/index.ts`.
6. `src/mocks/generators/bootstrap.ts`: adicione `pixKeys: IPixKey[];` à interface (~125),
   gere 2 chaves determinísticas (uma CNPJ marcada como `isDefault: true`, uma telefone
   inativa, para exercitar os dois estados na UI) e inclua `pixKeys` no retorno (~611).
   Use **CNPJ válido** — o editor valida dígito verificador.

- [ ] **Step 4: Write both providers**

`src/providers/data/impl/mock/pixKey.ts` — espelhe `mock/quickReply.ts`, com
`withCreateStoreId` no create e `logMockMutation` nas três mutações (aqui **todas** são
governadas, diferente do quick reply que só audita `shared`).

`src/providers/data/impl/supabase/pixKey.ts` — espelhe `supabase/quickReply.ts`: constantes
`TABLE`/`COLUMNS`, `rowToPixKey`, `pixKeyPatchToRow`, `createInputToRow`. Atenção:

```ts
const TABLE = "pix_keys";
const COLUMNS =
  "id, store_id, alias, key_type, key_value, receiver_name, receiver_city, " +
  "default_context, shortcut, default_send_text, default_send_qr, is_default, " +
  "is_active, created_by, created_at, updated_at";
```

> ⚠️ O `create` do supabase **não** injeta `storeId` — o chamador passa. É a armadilha já
> documentada do projeto; copie o mesmo `const withStore = input as typeof input & { storeId?: ID }`
> de `supabase/quickReply.ts:140`.

- [ ] **Step 5: Register in the factory and the barrel**

1. `src/providers/data/contracts/pixKey.ts`: `export type { IPixKeyProvider } from "@/shared/types";`
2. `src/providers/data/contracts/index.ts`: re-export.
3. `src/providers/data/hooks/usePixKeyProvider.ts`:

```ts
import type { IPixKeyProvider } from "../contracts/pixKey";
import { useDataProviderSlice } from "./_useDataProviderSlice";

export function usePixKeyProvider(): IPixKeyProvider {
  return useDataProviderSlice("pixKey", "usePixKeyProvider");
}
```

4. `src/providers/data/factory.ts`: importe os dois providers e registre `pixKey:` nos
   **dois** mapas (mock ~176 e supabase ~232).
5. `src/providers/data/index.ts`: `export { usePixKeyProvider } from "./hooks/usePixKeyProvider";`
   e adicione `IPixKeyProvider` à lista de tipos exportados (~106).

- [ ] **Step 6: Verify build and lint**

Run: `bun run build && bun run lint && bun run test`
Expected: SUCCESS nos três. O lint é o que prova que as fronteiras do Provider Pattern não
foram violadas.

- [ ] **Step 7: Commit**

```bash
git add src/shared/types/pix.ts src/shared/types/index.ts src/providers/data src/mocks \
  supabase/migrations
git commit -m "feat(pix): add pix_keys data layer with store-scoped RLS"
```

---

## Task 6: i18n e botão de copiar

**Files:**
- Create: `src/features/pix/i18n/pt-BR.ts`
- Create: `src/features/pix/components/CopyKeyButton.tsx`
- Create: `src/features/pix/index.ts` (barrel)

**Interfaces:**
- Consumes: nada.
- Produces: `PIX_STRINGS`, `PIX_TYPE_LABEL`, `PIX_TYPE_ICON`, `<CopyKeyButton value label compact />`.

- [ ] **Step 1: Write the i18n bundle**

```ts
// src/features/pix/i18n/pt-BR.ts
import type { PixKeyType } from "@/shared/types";

export const PIX_TYPE_LABEL: Record<PixKeyType, string> = {
  cnpj: "CNPJ",
  cpf: "CPF",
  phone: "Telefone",
  email: "E-mail",
  random: "Aleatória",
};

/** Discrimination by SHAPE, not colour — works in every theme and colour vision. */
export const PIX_TYPE_ICON: Record<PixKeyType, string> = {
  cnpj: "mdi:office-building-outline",
  cpf: "mdi:card-account-details-outline",
  phone: "mdi:phone-outline",
  email: "mdi:email-outline",
  random: "mdi:shuffle-variant",
};

export const PIX_STRINGS = {
  navLabel: "Chaves PIX",
  pageTitle: "Chaves PIX",
  pageDescription: "Cadastre as chaves que a equipe pode enviar no atendimento.",
  edit: "Editar",
  delete: "Excluir",
  copy: {
    action: "Copiar",
    done: "Copiado",
    announced: "Chave copiada",
    error: "Não foi possível copiar a chave.",
    unavailable: "A cópia não está disponível neste navegador.",
  },
  list: {
    empty: "Nenhuma chave PIX cadastrada.",
    emptyHint: "Cadastre a primeira chave para liberar o atalho no atendimento.",
    newKey: "Nova chave",
    defaultKey: "Chave padrão",
    inactive: "Inativa",
    readOnly: "Somente Owner e Gestor podem editar as chaves.",
    deleteTitle: "Excluir chave PIX",
    deleteDesc: (alias: string) =>
      `A chave "${alias}" deixará de aparecer no atendimento. Prefira desativá-la para manter o histórico.`,
  },
  editor: {
    alias: "Apelido",
    aliasPlaceholder: "Matriz — CNPJ",
    keyType: "Tipo de chave",
    keyValue: "Chave",
    invalidKey: "Chave inválida para o tipo selecionado.",
    receiverName: "Favorecido",
    receiverNameHint: "Máximo de 25 caracteres, sem acentos.",
    receiverCity: "Cidade",
    receiverCityHint: "Máximo de 15 caracteres, sem acentos.",
    defaultContext: "Mensagem padrão",
    defaultContextPlaceholder: "Deixe em branco para usar o texto automático.",
    shortcut: "Atalho (opcional)",
    shortcutPlaceholder: "/pix-matriz",
    shortcutInvalid: "O atalho deve começar com / e não conter espaços.",
    shortcutCollision: (shortcut: string) => `O atalho ${shortcut} já está em uso.`,
    sendDefaults: "O que enviar por padrão",
    isDefault: "Usar como chave padrão",
    isActive: "Ativa",
    previewTitle: "Como o cliente recebe",
    previewBubbleOne: "Primeira mensagem",
    previewBubbleTwo: "Segunda mensagem — a chave",
    previewNote: "Prévia ilustrativa. Confira o QR escaneando com o app do seu banco.",
    qrAlt: (alias: string) => `QR Code do PIX — ${alias}`,
    qrUnavailable: "Complete a chave e o favorecido para gerar o QR Code.",
    save: "Salvar chave",
    cancel: "Cancelar",
    missingFields: "Preencha apelido, chave, favorecido e cidade.",
  },
  composer: {
    menuSection: "Pagamento",
    menuItem: "Chave PIX",
    menuHint: "/pix",
    noKeys: "Nenhuma chave PIX cadastrada.",
    pickTitle: "Escolha a chave PIX",
    searchPlaceholder: "Buscar chave...",
    contextPlaceholder: "Mensagem antes da chave (opcional)…",
    optionsLabel: "O que enviar",
    optionText: "Chave",
    optionQr: "QR",
    swapKey: "Trocar de chave",
    send: "Enviar PIX",
    cancel: "Cancelar",
    nothingSelected: "Selecione ao menos a chave ou o QR Code.",
    receiverTooltip: (name: string) => `Favorecido: ${name}`,
    sent: "Chave PIX enviada.",
  },
  errors: {
    qrRenderFailed: "Não foi possível gerar o QR Code. A chave foi enviada como texto.",
    sendFailed: "Não foi possível enviar a chave PIX.",
    saveFailed: "Não foi possível salvar a chave.",
  },
} as const;
```

- [ ] **Step 2: Write the copy button**

```tsx
// src/features/pix/components/CopyKeyButton.tsx
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { PIX_STRINGS } from "../i18n/pt-BR";

export interface ICopyKeyButtonProps {
  /** CANONICAL key — never the formatted display value. */
  value: string;
  label?: string;
  compact?: boolean;
}

/**
 * Inline feedback, not a toast: the attendant copies dozens of times per shift
 * and a toast per copy would pile up over the conversation. The toast is
 * reserved for FAILURE, which is when they must be interrupted.
 *
 * Diverges from ContactBubble on purpose — there it is an occasional action,
 * here it is repetitive. The `?.` guard is kept (clipboard is undefined in a
 * non-secure context); the silent `.catch(() => undefined)` is NOT: on a PIX
 * key, clicking and nothing happening makes the attendant believe they copied
 * and paste the previous key.
 */
export function CopyKeyButton({ value, label, compact = false }: ICopyKeyButtonProps) {
  const s = PIX_STRINGS.copy;
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
  }, []);

  const copy = () => {
    // trim(): an invisible \n from the form breaks the bank field with no error.
    const write = navigator.clipboard?.writeText(value.trim());
    if (!write) {
      toast.error(s.unavailable);
      return;
    }
    void write
      .then(() => {
        setCopied(true);
        if (timerRef.current) window.clearTimeout(timerRef.current);
        // 1600ms: below ~1200 the eye misses it, above ~2500 the button lies.
        timerRef.current = window.setTimeout(() => setCopied(false), 1600);
      })
      .catch(() => toast.error(s.error));
  };

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={copy}
        aria-label={`${s.action} ${label ?? ""}`.trim()}
        className={cn(
          "cursor-pointer text-foreground hover:bg-primary/10 hover:text-foreground",
          compact ? "h-9 w-9 p-0" : "h-9 gap-1.5 px-2 text-[11.5px] font-medium",
        )}
      >
        {/* Fixed width: swapping the icon must not shift the label. */}
        <span className="inline-flex w-4 shrink-0 justify-center">
          <Icon
            icon={copied ? "mdi:check" : "mdi:content-copy"}
            size={14}
            className={cn(
              // transition-colors, never transition-all: `all` animates width.
              "transition-colors duration-150 motion-reduce:transition-none",
              copied ? "text-severity-success" : "text-primary",
            )}
            aria-hidden="true"
          />
        </span>
        {!compact && (copied ? s.done : s.action)}
      </Button>
      {/* Colour and icon are not feedback for someone who cannot see them. */}
      <span aria-live="polite" className="sr-only">
        {copied ? s.announced : ""}
      </span>
    </>
  );
}
```

- [ ] **Step 3: Create the barrel**

```ts
// src/features/pix/index.ts
export { CopyKeyButton } from "./components/CopyKeyButton";
export { PIX_STRINGS, PIX_TYPE_LABEL, PIX_TYPE_ICON } from "./i18n/pt-BR";
```

- [ ] **Step 4: Verify build**

Run: `bun run build && bun run lint`
Expected: SUCCESS.

- [ ] **Step 5: Commit**

```bash
git add src/features/pix/i18n src/features/pix/components/CopyKeyButton.tsx src/features/pix/index.ts
git commit -m "feat(pix): add i18n bundle and inline-feedback copy button"
```

---

## Task 7: Tela de configuração

**Files:**
- Create: `src/features/pix/hooks/usePixKeys.ts`
- Create: `src/features/pix/hooks/usePixKeyAdmin.ts`
- Create: `src/features/pix/components/admin/PixKeysPage.tsx`
- Create: `src/features/pix/components/admin/PixKeyEditor.tsx`
- Create: `src/features/pix/components/admin/PixPreviewThread.tsx`
- Modify: `src/features/pix/index.ts`

**Interfaces:**
- Consumes: `usePixKeyProvider` (Task 5), engines (Tasks 1–4), `PIX_STRINGS`/`CopyKeyButton` (Task 6).
- Produces: `usePixKeys(): { keys, activeKeys, isLoading, findByShortcut }`, `usePixKeyAdmin()`, `<PixKeysPage />`.

> Espelhe `QuickRepliesPage.tsx` (lista + editor + `Sheet` no mobile) e
> `useQuickReplyAdmin.ts`. Use `useQuery` com `queryKey: ["pix", "keys", storeId]` e
> invalide essa chave nas mutações.

- [ ] **Step 1: Write the read hook**

```ts
// src/features/pix/hooks/usePixKeys.ts
import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { IPixKey } from "@/shared/types";
import { usePixKeyProvider } from "@/providers/data";
import { useMultistore } from "@/features/multistore";

export function usePixKeys(): {
  keys: IPixKey[];
  activeKeys: IPixKey[];
  isLoading: boolean;
  findByShortcut: (shortcut: string) => IPixKey | null;
} {
  const provider = usePixKeyProvider();
  const { activeStoreId } = useMultistore();

  const query = useQuery({
    queryKey: ["pix", "keys", activeStoreId],
    queryFn: () => provider.list({}),
  });

  const keys = useMemo(() => query.data ?? [], [query.data]);

  // Sorted so the default key is always first — it is the one most sends use.
  const activeKeys = useMemo(
    () =>
      keys
        .filter((k) => k.isActive)
        .sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.alias.localeCompare(b.alias)),
    [keys],
  );

  const findByShortcut = useCallback(
    (shortcut: string) =>
      activeKeys.find((k) => k.shortcut?.toLowerCase() === shortcut.toLowerCase()) ?? null,
    [activeKeys],
  );

  return { keys, activeKeys, isLoading: query.isLoading, findByShortcut };
}
```

> ⚠️ Confirme o nome real do hook de multi-loja antes de escrever
> (`grep -rn "useMultistore\|MultistoreProvider" src/features/multistore/`). Se a API
> diferir, use a que existe — **não** crie um wrapper novo.

- [ ] **Step 2: Write the admin hook**

Espelhe `useQuickReplyAdmin.ts`: `useMutation` para create/update/remove, cada uma com
`onSuccess: () => queryClient.invalidateQueries({ queryKey: ["pix", "keys"] })` e
`toast.error(PIX_STRINGS.errors.saveFailed)` no `onError`. Exponha
`canManage = hasRole(["Owner", "Gestor"])` a partir de `useAuth()`.

- [ ] **Step 3: Write the live preview**

```tsx
// src/features/pix/components/admin/PixPreviewThread.tsx
import { useEffect, useRef } from "react";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { WhatsAppText } from "@/features/conversations/components/bubbles/WhatsAppText";
import type { PixKeyType } from "@/shared/types";
import { buildPixPayload } from "../../engine/pixBrCode";
import { buildPixCaption } from "../../engine/pixMessage";
import { drawPixQr } from "../../engine/drawPixQr";
import { PIX_STRINGS } from "../../i18n/pt-BR";

export interface IPixPreviewThreadProps {
  alias: string;
  keyType: PixKeyType;
  /** Canonical key. */
  keyValue: string;
  /** Formatted key, for reading. */
  displayKey: string;
  receiverName: string;
  receiverCity: string;
  context: string;
  sendText: boolean;
  sendQr: boolean;
}

/**
 * Shows EXACTLY the two messages, in the real order, inside the SAME
 * `aspect-[4/3] w-[260px]` box ImageBubble uses. If the QR would crop, it crops
 * here — the error shows up in the editor, not in production.
 */
export function PixPreviewThread({
  alias, keyType, keyValue, displayKey, receiverName, receiverCity,
  context, sendText, sendQr,
}: IPixPreviewThreadProps) {
  const s = PIX_STRINGS.editor;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const payload = buildPixPayload({ keyValue, receiverName, receiverCity });
  const caption = buildPixCaption({
    receiverName, keyType, context, includeKeyHint: sendText,
  });

  useEffect(() => {
    if (!sendQr || !canvasRef.current || !payload.ok) return;
    drawPixQr(canvasRef.current, payload.value, { cssSize: 224 });
  }, [sendQr, payload.ok, payload.ok ? payload.value : ""]);

  const showBubbleOne = sendQr || Boolean(caption);

  return (
    <div className="space-y-1">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {s.previewTitle}
      </p>

      <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-4">
        {showBubbleOne && (
          <div className="flex w-full justify-end">
            <div
              className={cn(
                "max-w-[78%] overflow-hidden rounded-2xl text-sm shadow-sm",
                "border border-primary/20 bg-primary/10 text-foreground",
              )}
              role="group"
              aria-label={s.previewBubbleOne}
            >
              {sendQr && (
                <div className="aspect-[4/3] w-[260px] max-w-full bg-muted">
                  {payload.ok ? (
                    <canvas
                      ref={canvasRef}
                      className="h-full w-full object-cover"
                      role="img"
                      aria-label={s.qrAlt(alias || "PIX")}
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center px-4 text-center text-[11px] text-muted-foreground">
                      {s.qrUnavailable}
                    </div>
                  )}
                </div>
              )}
              {caption && (
                <WhatsAppText
                  text={caption}
                  className="whitespace-pre-wrap break-words px-3 py-2 text-sm"
                />
              )}
              <div
                className="flex items-center justify-end gap-1 px-3 pb-2 text-[11px] text-muted-foreground"
                aria-hidden="true"
              >
                <span>12:00</span>
                <Icon icon="mdi:check-all" size={13} className="text-primary" />
              </div>
            </div>
          </div>
        )}

        {sendText && (
          <div className="flex w-full justify-end">
            <div
              className="max-w-[78%] rounded-2xl border border-primary/20 bg-primary/10 px-3 py-2 text-sm shadow-sm"
              role="group"
              aria-label={s.previewBubbleTwo}
            >
              {/* break-all: a 36-char random key overflows, and the preview must
                  show the same wrap the customer will see. Never truncate. */}
              <p className="break-all font-mono text-sm tabular-nums text-foreground">
                {displayKey || " "}
              </p>
              <div
                className="mt-1 flex items-center justify-end gap-1 text-[11px] text-muted-foreground"
                aria-hidden="true"
              >
                <span>12:00</span>
                <Icon icon="mdi:check-all" size={13} className="text-primary" />
              </div>
            </div>
          </div>
        )}
      </div>

      <p className="text-right text-[10px] text-muted-foreground">{s.previewNote}</p>
    </div>
  );
}
```

> ⚠️ Confirme que `WhatsAppText` é exportado com esse nome e aceita `className`
> (`src/features/conversations/components/bubbles/WhatsAppText.tsx`). Se a prop for outra,
> adapte — não altere o componente.

- [ ] **Step 4: Write the editor**

Espelhe `QuickReplyEditor.tsx` (duas colunas: form à esquerda, preview à direita). Campos na
ordem: apelido, tipo (`Select`), chave, favorecido (com contador `n/25`), cidade (contador
`n/15`), mensagem padrão (`Textarea`), atalho, dois `Switch` de pré-seleção, `Switch` de
padrão e de ativa. Regras:

- A chave é guardada **canônica**: `onChange` grava `toCanonicalPixKey(type, e.target.value)`
  e o input exibe `toDisplayPixKey(type, canonical)`.
- Erro de validação em `text-severity-warning` com `role="alert"`, igual a
  `QuickReplyEditor.tsx:142`.
- Contadores viram `text-severity-warning` ao estourar o limite; o Salvar desabilita.
- Colisão de atalho cruza **as chaves PIX e as respostas rápidas** — receba
  `existingShortcuts: string[]` por prop, montada pela página com os dois conjuntos.

- [ ] **Step 5: Write the page**

Espelhe `QuickRepliesPage.tsx`: header, botão "Nova chave" (só se `canManage`), lista à
esquerda com `divide-y divide-border`, editor à direita no desktop e em `Sheet` no mobile,
`AlertDialog` de exclusão, `SkeletonList` no carregamento e estado vazio com `emptyHint`.
A linha da lista segue o layout da spec §8.1 — `Badge variant="secondary"` com ícone + rótulo
do tipo, apelido, estrela `text-primary` quando padrão, badge "Inativa", chave em
`font-mono tabular-nums`, e botões `h-9 w-9`.

- [ ] **Step 6: Verify build**

Run: `bun run build && bun run lint && bun run test`
Expected: SUCCESS.

- [ ] **Step 7: Commit**

```bash
git add src/features/pix
git commit -m "feat(pix): add PIX keys settings screen with live message preview"
```

---

## Task 8: Rota e item de menu

**Files:**
- Create: `src/routes/app.configuracoes.pix.tsx`
- Modify: `src/features/shell/layouts/SettingsLayout.tsx` (após a linha 200)

**Interfaces:**
- Consumes: `PixKeysPage` (Task 7).
- Produces: rota `/app/configuracoes/pix`.

- [ ] **Step 1: Create the route**

```tsx
// src/routes/app.configuracoes.pix.tsx
import { createFileRoute } from "@tanstack/react-router";
import { SettingsLayout } from "@/features/shell/layouts";
import { requireAuth } from "@/features/auth/guards";
import { PixKeysPage } from "@/features/pix";

export const Route = createFileRoute("/app/configuracoes/pix")({
  beforeLoad: ({ location }) => requireAuth(location.pathname, ["Owner", "Gestor"]),
  component: () => (
    <SettingsLayout>
      <PixKeysPage />
    </SettingsLayout>
  ),
});
```

- [ ] **Step 2: Add the menu entry**

Em `SettingsLayout.tsx`, logo após o item "Respostas rápidas" (que termina na linha 200):

```tsx
{
  label: "Chaves PIX",
  icon: "mdi:qrcode",
  to: "/app/configuracoes/pix",
  roles: ["Owner", "Gestor"],
},
```

- [ ] **Step 3: Regenerate the route tree and verify**

Run: `bun run build`
Expected: SUCCESS. O plugin do Vite regenera `src/routeTree.gen.ts` — **não edite esse
arquivo à mão**, apenas inclua a alteração gerada no commit.

- [ ] **Step 4: Commit**

```bash
git add src/routes/app.configuracoes.pix.tsx src/routeTree.gen.ts \
  src/features/shell/layouts/SettingsLayout.tsx
git commit -m "feat(pix): add PIX keys settings route and nav entry"
```

---

## Task 9: Envio e barra de confirmação

**Files:**
- Create: `src/features/pix/hooks/useSendPix.ts`
- Create: `src/features/pix/components/ComposerStagedPix.tsx`
- Modify: `src/features/pix/index.ts`

**Interfaces:**
- Consumes: engines (Tasks 1–4), `useMessageSend` e `useAttachmentUpload` de
  `@/features/conversations/hooks/*`, `IPixKey`.
- Produces: `useSendPix(conversation, whatsappAccount): { sendPix, isSending }`,
  `<ComposerStagedPix ... />`.

> O vizinho a copiar para o envio sequencial é `useSendAsset.ts:112-121`
> (`if (text) await send({ text }); await send({ text: linkMarker });`) e
> `useComboSend.ts:52-67` (tolerância a falha parcial). O upload do QR usa
> `prepareAttachment` exatamente como `MessageInput.runAttachmentPipeline`.

- [ ] **Step 1: Write the send hook**

```ts
// src/features/pix/hooks/useSendPix.ts
import { useCallback, useState } from "react";
import { toast } from "sonner";
import type { IConversation, IPixKey, IWhatsAppAccount } from "@/shared/types";
import { useMessageSend } from "@/features/conversations/hooks/useMessageSend";
import { useAttachmentUpload } from "@/features/conversations/hooks/useAttachmentUpload";
import { buildPixPayload } from "../engine/pixBrCode";
import { buildPixCaption } from "../engine/pixMessage";
import { drawPixQr, canvasToPixFile } from "../engine/drawPixQr";
import { PIX_STRINGS } from "../i18n/pt-BR";

export interface IPixSendOptions {
  sendText: boolean;
  sendQr: boolean;
  context: string;
}

export function useSendPix(
  conversation: IConversation,
  whatsappAccount: IWhatsAppAccount | null,
): { sendPix: (key: IPixKey, opts: IPixSendOptions) => Promise<boolean>; isSending: boolean } {
  const { send } = useMessageSend(conversation, whatsappAccount);
  const { prepareAttachment } = useAttachmentUpload(conversation);
  const [isSending, setIsSending] = useState(false);

  const sendPix = useCallback(
    async (key: IPixKey, opts: IPixSendOptions): Promise<boolean> => {
      if (!opts.sendText && !opts.sendQr) return false;
      setIsSending(true);
      try {
        const caption = buildPixCaption({
          receiverName: key.receiverName,
          keyType: key.keyType,
          context: opts.context,
          includeKeyHint: opts.sendText,
        });

        // ── Message 1: QR image with the caption, or the caption alone ──
        let qrSent = false;
        if (opts.sendQr) {
          const payload = buildPixPayload({
            keyValue: key.keyValue,
            receiverName: key.receiverName,
            receiverCity: key.receiverCity,
          });
          if (payload.ok) {
            const canvas = document.createElement("canvas");
            if (drawPixQr(canvas, payload.value)) {
              const file = await canvasToPixFile(canvas, key.alias);
              if (file) {
                const media = await prepareAttachment(file, "image", caption);
                if (media) {
                  await send(media);
                  qrSent = true;
                }
              }
            }
          }
          // The complement never takes the product down: if the QR failed and
          // the key is still going out, fall through to the plain caption.
          if (!qrSent) toast.error(PIX_STRINGS.errors.qrRenderFailed);
        }
        if (!qrSent && caption) await send({ text: caption });

        // ── Message 2: the key, alone and last, so a long-press copies it clean ──
        if (opts.sendText) await send({ text: key.keyValue });

        toast.success(PIX_STRINGS.composer.sent);
        return true;
      } catch {
        toast.error(PIX_STRINGS.errors.sendFailed);
        return false;
      } finally {
        setIsSending(false);
      }
    },
    [prepareAttachment, send],
  );

  return { sendPix, isSending };
}
```

- [ ] **Step 2: Write the staged bar**

Use o JSX da spec §7.3. Restrições que **não** podem escorregar:

- Moldura idêntica à do `ComposerStagedAsset.tsx:33` —
  `flex items-center gap-2 border-b border-border bg-muted/30 px-3 py-2`, ícone `h-8 w-8`,
  botões `h-8`. Elas podem aparecer no mesmo dia; diferença de altura lê como bug.
- A **chave** em `font-mono tabular-nums` na linha 1 — é ela o discriminador de segurança
  entre matriz e filial, não o favorecido.
- Chips com `aria-pressed`, ícone outline→preenchido e check: **estado nunca só por cor**.
- Botão de trocar chave só quando `keyCount > 1`.
- Desmarcar os dois desabilita Enviar **e** Enter, com o motivo no `title`.
- Enter envia, Escape cancela — igual a `ComposerStagedAsset.tsx:43-54`.

- [ ] **Step 3: Verify build**

Run: `bun run build && bun run lint`
Expected: SUCCESS.

- [ ] **Step 4: Commit**

```bash
git add src/features/pix
git commit -m "feat(pix): add PIX send pipeline and staged confirmation bar"
```

---

## Task 10: Integração no composer

**Files:**
- Modify: `src/features/conversations/components/MessageInput.tsx`
- Modify: `src/features/quick-send/components/SlashMenu.tsx`
- Modify: `src/features/quick-send/engine/slashCommand.ts`
- Test: `src/features/quick-send/engine/slashCommand.test.ts`

**Interfaces:**
- Consumes: tudo das tarefas anteriores.
- Produces: nada — é a ponta do fluxo.

> ⚠️ **Área sensível.** O cache do Atendimento é congelado por decisão do dono: não toque em
> query keys de conversa, realtime ou assinatura de mensagens. Esta tarefa **acrescenta**
> estado local no composer e nada mais.

**Dois desvios conscientes em relação à spec — não são esquecimento:**

1. **Sem `CommandDialog` para 9+ chaves.** A spec §7.2 previa busca acima de 8 chaves. Uma
   loja não tem 9 chaves PIX; o `DropdownMenuSub` cobre a realidade e o Radix já dá scroll
   se passar disso. YAGNI — se um dia passar, a busca entra numa iteração própria.
2. **Sem `CopyKeyButton` no rodapé da bolha enviada** (o terceiro lugar da spec §9).
   Identificar que uma bolha de texto contém uma chave PIX exigiria um discriminador
   persistido na mensagem (uma coluna nova, como o `media_type: "payment"` do PR #352) —
   escopo bem maior que o benefício. Os dois lugares que importam (lista e barra de
   confirmação) estão cobertos.

**A janela de 24 h vale para PIX como para todo o resto:** o item do menu respeita
`canSendFreeText` (já calculado em `MessageInput.tsx:267`) e o motivo aparece no
`sendDisabledReason` existente. PIX **não** é template HSM — não tente contornar a janela.

- [ ] **Step 1: Write the failing test for the slash matcher**

```ts
// append em src/features/quick-send/engine/slashCommand.test.ts
import { matchPixKeysByCommand } from "./slashCommand";

describe("matchPixKeysByCommand", () => {
  const keys = [
    { id: "1", alias: "Matriz", shortcut: "/pix-matriz" },
    { id: "2", alias: "Filial", shortcut: "/pix-filial" },
    { id: "3", alias: "Sem atalho", shortcut: undefined },
  ];

  it("returns every key while browsing", () => {
    expect(matchPixKeysByCommand(keys, "")).toHaveLength(3);
  });

  it("matches the bare /pix command against all keys", () => {
    expect(matchPixKeysByCommand(keys, "pix")).toHaveLength(3);
  });

  it("narrows to a single key by its own shortcut prefix", () => {
    const found = matchPixKeysByCommand(keys, "pix-mat");
    expect(found).toHaveLength(1);
    expect(found[0].alias).toBe("Matriz");
  });

  it("is case-insensitive", () => {
    expect(matchPixKeysByCommand(keys, "PIX-FIL")).toHaveLength(1);
  });

  it("returns nothing for an unrelated command", () => {
    expect(matchPixKeysByCommand(keys, "garantia")).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun run test -- src/features/quick-send/engine/slashCommand.test.ts`
Expected: FAIL — "matchPixKeysByCommand is not a function".

- [ ] **Step 3: Implement the matcher**

```ts
// append em src/features/quick-send/engine/slashCommand.ts

/** Minimal shape the matcher needs — avoids importing the full IPixKey here. */
export interface ISlashPixKey {
  id: string;
  alias: string;
  shortcut?: string;
}

/**
 * PIX keys surfaced by the slash menu. The bare `/pix` command lists every key
 * (the attendant picks in the staged bar); a longer command narrows by the
 * key's own shortcut prefix, so "/pix-mat" already surfaces "/pix-matriz".
 */
export function matchPixKeysByCommand<T extends ISlashPixKey>(
  keys: T[],
  command: string,
): T[] {
  if (!command) return keys;
  const needle = command.toLowerCase();
  if ("pix".startsWith(needle) || needle === "pix") return keys;
  if (!needle.startsWith("pix")) return [];
  return keys.filter((k) => k.shortcut?.toLowerCase().startsWith(`/${needle}`));
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `bun run test -- src/features/quick-send/engine/slashCommand.test.ts`
Expected: PASS — os testes já existentes de `matchQuickRepliesByCommand` continuam verdes.

- [ ] **Step 5: Add the PIX section to the slash menu**

Em `SlashMenu.tsx`, acrescente a prop `pixKeys` e uma terceira lista **depois** das
respostas rápidas, mantendo a indexação contínua de `activeIndex`
(`items.length + replies.length + k`). Ícone `mdi:qrcode`, o apelido no rótulo e o
`shortcut` (ou `/pix`) no canto direito, exatamente como as respostas rápidas fazem nas
linhas 72–97.

- [ ] **Step 6: Wire the composer**

Em `MessageInput.tsx`:

1. Estado novo: `const [stagedPix, setStagedPix] = useState<IPixKey | null>(null)` mais
   `pixOptions` e `pixContext`. Ao escolher a chave, inicialize os toggles com
   `key.defaultSendText` / `key.defaultSendQr` e o contexto com `key.defaultContext ?? ""`.
2. `const { activeKeys } = usePixKeys();` e `const { sendPix } = useSendPix(conversation, whatsappAccount);`
3. No menu de anexo, **antes** do separador de arquivos (linha ~941), uma seção nova:

```tsx
<DropdownMenuSeparator />
<DropdownMenuLabel className="text-[11px] uppercase text-muted-foreground">
  {PIX_STRINGS.composer.menuSection}
</DropdownMenuLabel>
{activeKeys.length === 0 ? (
  <DropdownMenuItem disabled title={PIX_STRINGS.composer.noKeys}>
    <Icon icon="mdi:qrcode" size={14} className="mr-2" />
    {PIX_STRINGS.composer.menuItem}
  </DropdownMenuItem>
) : activeKeys.length === 1 ? (
  <DropdownMenuItem onSelect={() => stagePixKey(activeKeys[0])}>
    <Icon icon="mdi:qrcode" size={14} className="mr-2" />
    {PIX_STRINGS.composer.menuItem}
    <span className="ml-auto text-[10px] text-muted-foreground">
      {PIX_STRINGS.composer.menuHint}
    </span>
  </DropdownMenuItem>
) : (
  <DropdownMenuSub>
    <DropdownMenuSubTrigger>
      <Icon icon="mdi:qrcode" size={14} className="mr-2" />
      {PIX_STRINGS.composer.menuItem}
    </DropdownMenuSubTrigger>
    <DropdownMenuSubContent className="w-64">
      {activeKeys.map((k) => (
        <DropdownMenuItem
          key={k.id}
          onSelect={() => stagePixKey(k)}
          aria-label={`${PIX_STRINGS.composer.menuItem} ${k.alias}, ${PIX_TYPE_LABEL[k.keyType]}, ${toDisplayPixKey(k.keyType, k.keyValue)}`}
        >
          <Icon icon={PIX_TYPE_ICON[k.keyType]} size={14} className="mr-2" />
          <span className="truncate">{k.alias}</span>
          {k.isDefault && <Icon icon="mdi:star" size={11} className="ml-auto text-primary" />}
        </DropdownMenuItem>
      ))}
    </DropdownMenuSubContent>
  </DropdownMenuSub>
)}
```

4. Renderize `<ComposerStagedPix />` no mesmo ponto em que `ComposerStagedAsset` é
   renderizado hoje, com a mesma condição de exclusividade (uma barra por vez).
5. No `onPickPix` do `SlashMenu`, chame `stagePixKey` e limpe o token `/…` do textarea —
   copie o que `onPickReply` já faz.

- [ ] **Step 7: Verify the full gate**

Run: `bun run test && bun run build && bun run lint`
Expected: SUCCESS nos três.

Run: `bunx tsc --noEmit 2>&1 | grep -c "features/pix"`
Expected: `0` — nenhum erro novo nos arquivos criados. (O baseline global de ~315 erros
pré-existentes permanece; avalie **por delta**.)

- [ ] **Step 8: Commit**

```bash
git add src/features/conversations/components/MessageInput.tsx \
  src/features/quick-send/components/SlashMenu.tsx \
  src/features/quick-send/engine/slashCommand.ts \
  src/features/quick-send/engine/slashCommand.test.ts
git commit -m "feat(pix): wire the PIX shortcut into the conversation composer"
```

---

## Task 11: Auditoria e documentação

**Files:**
- Modify: `src/features/pix/hooks/useSendPix.ts`
- Create: `docs/dev/pix-shortcut.md`

- [ ] **Step 1: Record the audit trail**

Em `useSendPix`, após o envio bem-sucedido, registre via `auditLogger` (o vizinho é
`recordAuditLog` — confirme a assinatura em `src/shared/utils/auditLogger.ts` antes de
chamar): ação `send`, recurso `pix_key`, `resourceId: key.id`, e o `conversationId` no
payload. **É superfície de fraude interna real**; a trilha é o que permite investigar depois.

- [ ] **Step 2: Write the developer doc**

`docs/dev/pix-shortcut.md`, cobrindo: modelo de dados e RLS, o fluxo das duas mensagens,
a regra do 4:3 e por que ela existe, a regra da escala inteira, os limites do BR Code
(25/15/ASCII), e a lista de armadilhas da spec §13.

- [ ] **Step 3: Commit**

```bash
git add src/features/pix/hooks/useSendPix.ts docs/dev/pix-shortcut.md
git commit -m "docs(pix): document the PIX shortcut and record send audit trail"
```

---

## Gate final

Antes de abrir o PR:

- [ ] `bun run test` — verde, incluindo o CRC de referência do BACEN.
- [ ] `bun run build` — verde.
- [ ] `bun run lint` — verde (prova as fronteiras do Provider Pattern).
- [ ] `bunx tsc --noEmit` — **zero erros novos** em `src/features/pix/**`.
- [ ] Migration presente em `supabase/migrations/`, **não aplicada**.
- [ ] PR aberto como **draft**, descrevendo o rollout: aplicar migration (OK do dono) →
      merge → cadastrar a primeira chave → smoke.

**Smoke que só o dono faz, em produção:**
1. Cadastrar uma chave real em Configurações → Chaves PIX.
2. Enviar numa conversa de teste com QR ligado.
3. **Escanear o QR com o app de um banco de verdade** — é o único teste que prova a feature.
4. Conferir que a chave da 2ª mensagem cola limpa no campo do banco.
5. Testar o toque-e-segurar no celular.

> ⚠️ O modo Demonstração **não** exercita o caminho real: o mock não sobe bytes para o
> bucket e o QR não trafega. O smoke tem de ser em produção.
