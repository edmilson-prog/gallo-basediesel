# DINTEC Customer Import — Fase 1 (Piloto Simulado) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce a zero-write simulation report for a stratified 100-client pilot of the DINTEC → platform customer import, so the owner can validate field mapping and phone-to-customer linking correctness before any real database write.

**Architecture:** Pure, unit-tested normalization functions live in `src/features/dintec-import/engine/` (phone key matching, type resolution, field-merge-if-empty, vehicle brand/model normalization, ambiguous-match tiebreak — mirrors the project's existing `engine/` convention). A one-off orchestration script (`scripts/dintec-import/run-pilot-simulation.ts`, same pattern as `scripts/seed-supabase.ts`) reads two Firebird CSV exports (pilot client data + pilot vehicle data, produced manually via `isql`) and the existing Supabase customers for the 40 pre-matched pilot IDs (read-only, via `@supabase/supabase-js` + service role), applies the engine functions, and writes a Markdown + CSV report. No table/column is created or written to in this phase.

**Tech Stack:** TypeScript, Vitest (co-located `*.test.ts`), `@supabase/supabase-js` (read-only in this phase), Firebird `isql` (external, invoked manually per `docs/db/GUIA-BANCO-TURBO-DIESEL.md`), `bun run <script>`.

## Global Constraints

- TypeScript `strict: true`, no `any`.
- Engine functions are pure and deterministic — no `Math.random()`, no `Date.now()`/`new Date()` inside engine code (pass timestamps in as arguments where needed).
- User-facing/report strings in the fallback paths (`"Outra"`, `"Não informado"`) are Portuguese, per project convention.
- This phase performs **zero INSERT/UPDATE/DELETE** against Supabase — orchestration script only issues `select`.
- Design reference: `docs/superpowers/specs/2026-07-10-dintec-customer-import-design.md` (approved, PR #263).
- Source-of-truth for the 563 phone matches already computed: `docs/db/dintec-phone-match-dryrun.csv` (columns: `customer_id;type;nome_plataforma;phone_plataforma;dintec_codcli;nome_dintec;dintec_celular;dintec_telefone;match_status`).

---

### Task 1: Phone key normalization

**Files:**
- Create: `src/features/dintec-import/engine/phoneKey.ts`
- Test: `src/features/dintec-import/engine/phoneKey.test.ts`

**Interfaces:**
- Produces: `normalizePhoneKey(raw: string | null | undefined): string | null` — used by Task 8 to re-verify the 40 pre-matched pairs and to key the vehicle/customer join.

- [ ] **Step 1: Write the failing tests**

```typescript
import { describe, it, expect } from "vitest";
import { normalizePhoneKey } from "./phoneKey";

describe("normalizePhoneKey", () => {
  it("strips +55 country code and returns ddd+8-digit key", () => {
    expect(normalizePhoneKey("+5517982016888")).toBe("1782016888");
  });

  it("normalizes a bare 11-digit mobile without country code", () => {
    expect(normalizePhoneKey("47992379318")).toBe("4792379318");
  });

  it("normalizes a 10-digit landline without country code", () => {
    expect(normalizePhoneKey("5130373000")).toBe("5130373000");
  });

  it("normalizes formatted input with parentheses and dash", () => {
    expect(normalizePhoneKey("(51) 99680-5724")).toBe("5199680572");
  });

  it("returns null for all-zero placeholder phones", () => {
    expect(normalizePhoneKey("0000000000")).toBe(null);
  });

  it("returns null for empty, null or undefined input", () => {
    expect(normalizePhoneKey("")).toBe(null);
    expect(normalizePhoneKey(null)).toBe(null);
    expect(normalizePhoneKey(undefined)).toBe(null);
  });

  it("returns null for a string with too few digits to contain a DDD+number", () => {
    expect(normalizePhoneKey("123")).toBe(null);
  });
});
```

> Note: `"0000000000"` is 10 digits of the same repeated digit, not `null`/empty, so it survives digit-stripping — the DINTEC CSV export already blanks these upstream (per `docs/db/GUIA-BANCO-TURBO-DIESEL.md` §4 rule 4), but the engine function itself has no opinion on "all same digit" being invalid telephony — only on digit-count validity. Fix the test to match actual behavior in Step 2 if it turns out `"0000000000"` normalizes to `"0000000000"` (10 digits, valid shape) rather than `null`. Write the implementation first, then correct this test to the real, deliberate behavior.

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run test src/features/dintec-import/engine/phoneKey.test.ts`
Expected: FAIL — `phoneKey.ts` does not exist yet.

- [ ] **Step 3: Implement**

```typescript
/**
 * Normalizes a Brazilian phone number (from either the DINTEC export or
 * customers.phone) into a DDD + last-8-digits comparison key, so that
 * "+5517982016888" (13 digits, country code + 9-digit mobile) and
 * "17982016888" (11 digits, no country code) collapse to the same key —
 * DDD "17" + last 8 digits, dropping the mobile-only leading "9".
 */
export function normalizePhoneKey(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith("55")) {
    digits = digits.slice(2);
  }
  if (digits.length === 10 || digits.length === 11) {
    const ddd = digits.slice(0, 2);
    const core = digits.slice(-8);
    return ddd + core;
  }
  return null;
}
```

- [ ] **Step 4: Run tests, fix the `"0000000000"` case per actual behavior**

Run: `bun run test src/features/dintec-import/engine/phoneKey.test.ts`

`"0000000000"` is 10 digits → the function returns `"0000000000"` (ddd `"00"` + core `"00000000"`), not `null`. Update that test case to assert the real, correct behavior:

```typescript
  it("does not special-case all-zero digits — DINTEC blanks those upstream, not this function", () => {
    expect(normalizePhoneKey("0000000000")).toBe("0000000000");
  });
```

Run again. Expected: PASS (all 7 cases).

- [ ] **Step 5: Commit**

```bash
git add src/features/dintec-import/engine/phoneKey.ts src/features/dintec-import/engine/phoneKey.test.ts
git commit -m "feat: add DINTEC phone key normalization engine"
```

---

### Task 2: Customer type resolution (B2B/B2C)

**Files:**
- Create: `src/features/dintec-import/engine/customerType.ts`
- Test: `src/features/dintec-import/engine/customerType.test.ts`

**Interfaces:**
- Produces: `resolveCustomerType(cpf: string | null, cnpj: string | null): "B2B" | "B2C"` — consumed by Task 8.

- [ ] **Step 1: Write the failing tests**

```typescript
import { describe, it, expect } from "vitest";
import { resolveCustomerType } from "./customerType";

describe("resolveCustomerType", () => {
  it("returns B2B when only CNPJ is present", () => {
    expect(resolveCustomerType(null, "89626386000155")).toBe("B2B");
  });

  it("returns B2C when only CPF is present", () => {
    expect(resolveCustomerType("19110790004", null)).toBe("B2C");
  });

  it("prioritizes CNPJ when both are present (rare conflict case)", () => {
    expect(resolveCustomerType("19110790004", "89626386000155")).toBe("B2B");
  });

  it("defaults to B2C when neither document is present", () => {
    expect(resolveCustomerType(null, null)).toBe("B2C");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run test src/features/dintec-import/engine/customerType.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```typescript
export type DintecCustomerType = "B2B" | "B2C";

/**
 * DINTEC has 1 client (of 3,167) with both CPF and CNPJ filled and 7 with
 * neither. CNPJ wins the conflict case (business relationship is the
 * primary one in that record); the no-document case defaults to B2C so the
 * customer is still importable without a document.
 */
export function resolveCustomerType(
  cpf: string | null,
  cnpj: string | null,
): DintecCustomerType {
  if (cnpj) return "B2B";
  if (cpf) return "B2C";
  return "B2C";
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run test src/features/dintec-import/engine/customerType.test.ts`
Expected: PASS (4/4).

- [ ] **Step 5: Commit**

```bash
git add src/features/dintec-import/engine/customerType.ts src/features/dintec-import/engine/customerType.test.ts
git commit -m "feat: add DINTEC customer type resolution engine"
```

---

### Task 3: Fill-if-empty field merge

**Files:**
- Create: `src/features/dintec-import/engine/fillIfEmpty.ts`
- Test: `src/features/dintec-import/engine/fillIfEmpty.test.ts`

**Interfaces:**
- Produces: `fillIfEmpty<T>(existing: T | null | undefined, incoming: T | null | undefined): T | null` — consumed by Task 8 for every already-existing-column field (`nome_fantasia`, `cpf`, `cnpj`, `contact_name`, `email`, `address` fields).

- [ ] **Step 1: Write the failing tests**

```typescript
import { describe, it, expect } from "vitest";
import { fillIfEmpty } from "./fillIfEmpty";

describe("fillIfEmpty", () => {
  it("keeps the existing value when it is non-empty", () => {
    expect(fillIfEmpty("Nome Já Cadastrado", "Nome DINTEC")).toBe("Nome Já Cadastrado");
  });

  it("takes the incoming value when existing is null", () => {
    expect(fillIfEmpty(null, "Nome DINTEC")).toBe("Nome DINTEC");
  });

  it("takes the incoming value when existing is undefined", () => {
    expect(fillIfEmpty(undefined, "Nome DINTEC")).toBe("Nome DINTEC");
  });

  it("takes the incoming value when existing is an empty string", () => {
    expect(fillIfEmpty("", "Nome DINTEC")).toBe("Nome DINTEC");
  });

  it("returns null when both existing and incoming are empty", () => {
    expect(fillIfEmpty(null, null)).toBe(null);
    expect(fillIfEmpty("", undefined)).toBe(null);
  });

  it("never overwrites existing with an incoming empty value", () => {
    expect(fillIfEmpty("Telefone Verificado", "")).toBe("Telefone Verificado");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run test src/features/dintec-import/engine/fillIfEmpty.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```typescript
/**
 * Enforces the import's core safety rule: DINTEC data only fills columns
 * the platform has NOTHING in — it never overwrites an existing value,
 * including values the platform itself wrote (e.g. WhatsApp-verified phone,
 * a manually edited name).
 */
export function fillIfEmpty<T>(
  existing: T | null | undefined,
  incoming: T | null | undefined,
): T | null {
  if (existing !== null && existing !== undefined && existing !== ("" as unknown as T)) {
    return existing;
  }
  return incoming ?? null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run test src/features/dintec-import/engine/fillIfEmpty.test.ts`
Expected: PASS (6/6).

- [ ] **Step 5: Commit**

```bash
git add src/features/dintec-import/engine/fillIfEmpty.ts src/features/dintec-import/engine/fillIfEmpty.test.ts
git commit -m "feat: add fill-if-empty field merge engine"
```

---

### Task 4: Vehicle brand/model normalization

**Files:**
- Create: `src/features/dintec-import/engine/vehicleNormalize.ts`
- Test: `src/features/dintec-import/engine/vehicleNormalize.test.ts`

**Interfaces:**
- Produces: `normalizeVehicleBrandModel(rawVeiculo: string | null | undefined): { brand: string; model: string }` — consumed by Task 8 for every `VEICULOPROPRIETARIO` row in the pilot.

- [ ] **Step 1: Write the failing tests**

```typescript
import { describe, it, expect } from "vitest";
import { normalizeVehicleBrandModel } from "./vehicleNormalize";

describe("normalizeVehicleBrandModel", () => {
  it("recognizes Volvo FH/FM/VM models", () => {
    expect(normalizeVehicleBrandModel("FH 540 6X4T")).toEqual({
      brand: "Volvo",
      model: "FH 540 6X4T",
    });
  });

  it("recognizes Scania R/P/G/S numbered models", () => {
    expect(normalizeVehicleBrandModel("R 440 A6X4")).toEqual({
      brand: "Scania",
      model: "R 440 A6X4",
    });
  });

  it("recognizes Mercedes-Benz Actros/Atego/Axor/Accelo", () => {
    expect(normalizeVehicleBrandModel("ACTROS 2651LS6X4")).toEqual({
      brand: "Mercedes-Benz",
      model: "ACTROS 2651LS6X4",
    });
  });

  it("recognizes Toyota Hilux (light vehicle)", () => {
    expect(normalizeVehicleBrandModel("HILUX CD4X4 SRV")).toEqual({
      brand: "Toyota",
      model: "HILUX CD4X4 SRV",
    });
  });

  it("defaults NN.NNN numeric-prefix models to Ford Cargo", () => {
    expect(normalizeVehicleBrandModel("24.280 CRM 6X2")).toEqual({
      brand: "Ford Cargo",
      model: "24.280 CRM 6X2",
    });
  });

  it("prefers Volkswagen over Ford Cargo when the text names a VW line explicitly", () => {
    expect(normalizeVehicleBrandModel("24.280 CONSTELLATION 6X2")).toEqual({
      brand: "Volkswagen",
      model: "24.280 CONSTELLATION 6X2",
    });
  });

  it("falls back to Outra for an unrecognized model, preserving the original text", () => {
    expect(normalizeVehicleBrandModel("ZX90 EXPERIMENTAL")).toEqual({
      brand: "Outra",
      model: "ZX90 EXPERIMENTAL",
    });
  });

  it("falls back to Outra / Não informado for empty or null input", () => {
    expect(normalizeVehicleBrandModel("")).toEqual({ brand: "Outra", model: "Não informado" });
    expect(normalizeVehicleBrandModel(null)).toEqual({ brand: "Outra", model: "Não informado" });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run test src/features/dintec-import/engine/vehicleNormalize.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```typescript
export interface VehicleBrandModel {
  brand: string;
  model: string;
}

const PREFIX_RULES: Array<{ test: RegExp; brand: string }> = [
  { test: /^(FH|FM|VM)\b/, brand: "Volvo" },
  { test: /^[RPGS]\s?\d/, brand: "Scania" },
  { test: /^(ACTROS|ATEGO|AXOR|ACCELO|ATRON)\b/, brand: "Mercedes-Benz" },
  { test: /^(DAILY|STRALIS|TECTOR|HD)\b/, brand: "Iveco" },
  { test: /^CARGO\b/, brand: "Ford Cargo" },
  { test: /^(XF|CF|LF)\b/, brand: "DAF" },
  { test: /^(HILUX|COROLLA|SW4|ETIOS)\b/, brand: "Toyota" },
  { test: /^(AMAROK|GOL|SAVEIRO)\b/, brand: "Volkswagen" },
  { test: /^(DUCATO|STRADA|FIORINO|TORO|UNO)\b/, brand: "Fiat" },
  { test: /^(MASTER|KANGOO|DUSTER|OROCH)\b/, brand: "Renault" },
];

const VW_NUMERIC_KEYWORDS = /(CONSTELLATION|DELIVERY|WORKER)/;
const NUMERIC_PREFIX = /^\d{2}\.\d{3}\b/;

/**
 * VEICULOPROPRIETARIO.VEICULO is free text with no separate brand column
 * (e.g. "FH 540 6X4T", "R 440 A6X4", "24.280 CRM 6X2"). This infers a
 * brand by prefix against the platform's core heavy-truck line names plus
 * common light-vehicle lines seen in the DINTEC sample. Anything
 * unrecognized becomes brand "Outra" with the original text preserved as
 * the model — never dropped, always flagged for manual review.
 */
export function normalizeVehicleBrandModel(
  rawVeiculo: string | null | undefined,
): VehicleBrandModel {
  const text = (rawVeiculo ?? "").trim();
  if (!text) return { brand: "Outra", model: "Não informado" };
  const upper = text.toUpperCase();

  if (NUMERIC_PREFIX.test(upper)) {
    const brand = VW_NUMERIC_KEYWORDS.test(upper) ? "Volkswagen" : "Ford Cargo";
    return { brand, model: text };
  }

  for (const rule of PREFIX_RULES) {
    if (rule.test.test(upper)) return { brand: rule.brand, model: text };
  }
  return { brand: "Outra", model: text };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run test src/features/dintec-import/engine/vehicleNormalize.test.ts`
Expected: PASS (8/8).

- [ ] **Step 5: Commit**

```bash
git add src/features/dintec-import/engine/vehicleNormalize.ts src/features/dintec-import/engine/vehicleNormalize.test.ts
git commit -m "feat: add DINTEC vehicle brand/model normalization engine"
```

---

### Task 5: Ambiguous-match tiebreak

**Files:**
- Create: `src/features/dintec-import/engine/ambiguousTiebreak.ts`
- Test: `src/features/dintec-import/engine/ambiguousTiebreak.test.ts`

**Interfaces:**
- Produces: `pickBestCodcliByLtv(candidates: AmbiguousCandidate[]): string` — consumed by Task 8 for the 30 phone-ambiguous matches.

- [ ] **Step 1: Write the failing tests**

```typescript
import { describe, it, expect } from "vitest";
import { pickBestCodcliByLtv, type AmbiguousCandidate } from "./ambiguousTiebreak";

describe("pickBestCodcliByLtv", () => {
  it("picks the candidate with the highest LTV", () => {
    const candidates: AmbiguousCandidate[] = [
      { codcli: "957", ltv: 12000 },
      { codcli: "3150", ltv: 45000 },
    ];
    expect(pickBestCodcliByLtv(candidates)).toBe("3150");
  });

  it("returns the sole candidate when there is only one", () => {
    expect(pickBestCodcliByLtv([{ codcli: "265", ltv: 0 }])).toBe("265");
  });

  it("is deterministic on ties — first candidate in the array wins", () => {
    const candidates: AmbiguousCandidate[] = [
      { codcli: "2344", ltv: 5000 },
      { codcli: "2435", ltv: 5000 },
    ];
    expect(pickBestCodcliByLtv(candidates)).toBe("2344");
  });

  it("throws on an empty candidate list", () => {
    expect(() => pickBestCodcliByLtv([])).toThrow();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run test src/features/dintec-import/engine/ambiguousTiebreak.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```typescript
export interface AmbiguousCandidate {
  codcli: string;
  ltv: number;
}

/**
 * When one platform phone number matches more than one DINTEC CODCLI
 * (person + their own company sharing a cell phone is the common case),
 * the existing platform customer links to whichever CODCLI has the
 * largest purchase history — the more likely primary commercial
 * relationship. Losing candidates are NOT discarded by this function;
 * the caller (Task 8) imports them as separate, unlinked new customers.
 */
export function pickBestCodcliByLtv(candidates: AmbiguousCandidate[]): string {
  if (candidates.length === 0) {
    throw new Error("pickBestCodcliByLtv: candidates vazio");
  }
  return candidates.reduce((best, current) => (current.ltv > best.ltv ? current : best)).codcli;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run test src/features/dintec-import/engine/ambiguousTiebreak.test.ts`
Expected: PASS (4/4).

- [ ] **Step 5: Commit**

```bash
git add src/features/dintec-import/engine/ambiguousTiebreak.ts src/features/dintec-import/engine/ambiguousTiebreak.test.ts
git commit -m "feat: add DINTEC ambiguous-match LTV tiebreak engine"
```

---

### Task 6: Engine barrel export

**Files:**
- Create: `src/features/dintec-import/engine/index.ts`

**Interfaces:**
- Consumes: all exports from Tasks 1–5.
- Produces: single import surface for Task 8 (`import { normalizePhoneKey, resolveCustomerType, fillIfEmpty, normalizeVehicleBrandModel, pickBestCodcliByLtv } from "@/features/dintec-import/engine"`).

- [ ] **Step 1: Write the barrel**

```typescript
export { normalizePhoneKey } from "./phoneKey";
export { resolveCustomerType, type DintecCustomerType } from "./customerType";
export { fillIfEmpty } from "./fillIfEmpty";
export { normalizeVehicleBrandModel, type VehicleBrandModel } from "./vehicleNormalize";
export { pickBestCodcliByLtv, type AmbiguousCandidate } from "./ambiguousTiebreak";
```

- [ ] **Step 2: Typecheck the barrel resolves**

Run: `bunx tsc --noEmit -p . 2>&1 | grep "features/dintec-import"`
Expected: no output (no errors referencing this new folder). Pre-existing baseline errors elsewhere are expected and out of scope (see `CLAUDE.md` tsc baseline note).

- [ ] **Step 3: Commit**

```bash
git add src/features/dintec-import/engine/index.ts
git commit -m "feat: add DINTEC import engine barrel"
```

---

### Task 7: Firebird extraction — pilot sample selection + field export

This task is manual/procedural (external Firebird database, not part of the repo's build/test loop) — its "test" is the row-count verification at the end, not Vitest.

**Files:**
- Create: `scripts/dintec-import/sql/select-pilot-codclis.sql`
- Create: `scripts/dintec-import/sql/export-pilot-fields.sql`
- Create: `scripts/dintec-import/select-pilot-codclis.ts` (small Node helper — reads existing CSVs, no DB access, deterministic)
- Test: none (procedural extraction step; the helper is a thin CSV-filter, exercised directly in Step 3 below rather than under Vitest, matching `scripts/seed-supabase.ts`'s precedent of being un-unit-tested glue)

**Interfaces:**
- Produces: `scratchpad/dintec-pilot-clientes.csv` (100 rows, columns: `codcli;stratum;nome;fantasia;cpf;cnpj;contato;endereco;bairro;cidade;estado;cep;telefone;celular;email;ativo;datacadastro;credito;codfun_nome;frequencia;ltv;ticket_medio;primeira_compra;ultima_compra;abc_class;pct_receita`) and `scratchpad/dintec-pilot-veiculos.csv` (columns: `codcli;placa;ano;modelo_raw;cor;motor`) — both consumed by Task 8. **Neither file is committed to git** (raw PII), matching the existing precedent for `docs/db/clientes_enriquecidos.csv`-style exports staying out of git — these pilot files stay in `scratchpad/`.

- [ ] **Step 1: Select the 100 pilot CODCLIs (Node helper, deterministic slicing)**

```typescript
// scripts/dintec-import/select-pilot-codclis.ts
// Run: bun run scripts/dintec-import/select-pilot-codclis.ts
// Reads the already-committed phone-match dry-run report and writes
// scratchpad/dintec-pilot-codclis.csv (codcli;stratum) for the next SQL
// extraction step. No network/DB access — pure CSV filtering.
import { readFileSync, writeFileSync } from "node:fs";

const DRYRUN_CSV = "docs/db/dintec-phone-match-dryrun.csv";
const OUT_CSV = "scratchpad/dintec-pilot-codclis.csv";

interface MatchRow {
  codcli: string;
  status: string;
}

function parseDryRun(path: string): MatchRow[] {
  const lines = readFileSync(path, "utf8").replace(/^﻿/, "").split(/\r?\n/).filter(Boolean);
  lines.shift(); // header
  return lines
    .map((line) => line.split(";"))
    .filter((cols) => cols[4]) // has a dintec_codcli
    .map((cols) => ({ codcli: cols[4], status: cols[8] }));
}

const matches = parseDryRun(DRYRUN_CSV);
const seen = new Set<string>();
const picked: Array<{ codcli: string; stratum: string }> = [];

function take(pred: (m: MatchRow) => boolean, stratum: string, count: number) {
  let taken = 0;
  for (const m of matches) {
    if (taken >= count) break;
    if (seen.has(m.codcli)) continue;
    if (!pred(m)) continue;
    seen.add(m.codcli);
    picked.push({ codcli: m.codcli, stratum });
    taken++;
  }
  console.log(`${stratum}: ${taken}/${count}`);
}

take((m) => m.status === "celular_alta", "matched_alta", 40);
take((m) => m.status.includes("ambiguo"), "ambiguo", 10);

writeFileSync(
  OUT_CSV,
  ["codcli;stratum", ...picked.map((p) => `${p.codcli};${p.stratum}`)].join("\n"),
  "utf8",
);
console.log(`Escrito ${picked.length} CODCLIs (matched_alta + ambiguo) em ${OUT_CSV}.`);
console.log(
  "Os 60 restantes (vehicle=10, no_phone=10, new=30) são selecionados na etapa SQL " +
    "seguinte, direto contra o Firebird — passe este arquivo como exclusão.",
);
```

- [ ] **Step 2: Run it**

Run: `bun run scripts/dintec-import/select-pilot-codclis.ts`
Expected output: `matched_alta: 40/40` and `ambiguo: 10/10`, and `scratchpad/dintec-pilot-codclis.csv` with 51 lines (header + 50 rows).

- [ ] **Step 3: SQL to pick the remaining 60 CODCLIs directly against Firebird**

```sql
-- scripts/dintec-import/sql/select-pilot-codclis.sql
-- Run via isql (see docs/db/GUIA-BANCO-TURBO-DIESEL.md §3). Paste the 50
-- CODCLIs from scratchpad/dintec-pilot-codclis.csv into the EXCLUDE list
-- below before running (isql has no bind-param support for IN-lists here).
SET LIST ON;

SELECT 'com veiculo (10)' AS secao FROM RDB$DATABASE;
SELECT FIRST 10 DISTINCT vp.CODCLI
FROM VEICULOPROPRIETARIO vp
WHERE vp.CODCLI NOT IN (/* cole os 50 CODCLIs de matched_alta+ambiguo aqui */)
ORDER BY vp.CODCLI;

SELECT 'sem telefone em nenhuma fonte (10)' AS secao FROM RDB$DATABASE;
SELECT FIRST 10 c.CODCLI
FROM CLIENTE c
WHERE CHAR_LENGTH(REPLACE(TRIM(COALESCE(c.TELEFONE,'')),'0','')) = 0
  AND CHAR_LENGTH(REPLACE(TRIM(COALESCE(c.CELULAR,'')),'0','')) = 0
  AND NOT EXISTS (SELECT 1 FROM NOTAFISCAL n WHERE n.CODCLI = c.CODCLI
                    AND CHAR_LENGTH(REPLACE(TRIM(COALESCE(n.TELEFONE,'')),'0','')) > 0)
  AND NOT EXISTS (SELECT 1 FROM ORCAMENTO o WHERE o.CODCLI = c.CODCLI
                    AND (CHAR_LENGTH(REPLACE(TRIM(COALESCE(o.TELEFONE,'')),'0','')) > 0
                         OR CHAR_LENGTH(REPLACE(TRIM(COALESCE(o.CELULAR,'')),'0','')) > 0))
  AND c.CODCLI NOT IN (/* cole os mesmos 50 + os 10 com veiculo aqui */)
ORDER BY c.CODCLI;

SELECT 'totalmente novos, com telefone, sem match no dry-run (30)' AS secao FROM RDB$DATABASE;
SELECT FIRST 30 c.CODCLI
FROM CLIENTE c
WHERE (CHAR_LENGTH(REPLACE(TRIM(COALESCE(c.TELEFONE,'')),'0','')) > 0
       OR CHAR_LENGTH(REPLACE(TRIM(COALESCE(c.CELULAR,'')),'0','')) > 0)
  AND c.CODCLI NOT IN (/* cole os 70 CODCLIs ja selecionados acima aqui */)
ORDER BY c.CODCLI;
```

Run via the standard embedded isql invocation (per the guide):

```bash
FIREBIRD="/c/Program Files (x86)/Firebird/Firebird_4_0_FarolTI"
"$FIREBIRD/isql.exe" -user SYSDBA -password masterkey -ch WIN1252 \
  -i "scripts/dintec-import/sql/select-pilot-codclis.sql" "D:\\claude\\dintec\\TURBO_DIESEL.FDB"
```

Append the 3 result sets (10 + 10 + 30 = 50 more CODCLIs, tagged `com_veiculo`, `sem_telefone`, `novo`) to `scratchpad/dintec-pilot-codclis.csv`, for **100 total rows**.

- [ ] **Step 4: Full field export for the 100 selected CODCLIs**

```sql
-- scripts/dintec-import/sql/export-pilot-fields.sql
-- Paste the final 100 CODCLIs (comma-separated) into the IN-list below.
SET HEADING OFF;
OUTPUT 'scratchpad/dintec_pilot_clientes_raw.txt';
WITH v AS (
  SELECT CODCLI, COUNT(*) AS NOTAS, SUM(TOTALNOTA) AS LTV, AVG(TOTALNOTA) AS TICKET,
         MIN(DATA) AS PRIMEIRA, MAX(DATA) AS ULTIMA, MIN(NOME) AS NOMENF
  FROM NOTAFISCAL WHERE ENTSAIDA='SAIDA' AND CODCLI>0 GROUP BY CODCLI
),
abc AS (
  SELECT CODCLI, LTV, SUM(LTV) OVER (ORDER BY LTV DESC) AS ACUM, SUM(LTV) OVER () AS TOT FROM v
),
nm AS (
  SELECT CODCLI, MIN(NOMECLI) AS NOMECLI FROM NFISCAL WHERE CHAR_LENGTH(TRIM(NOMECLI))>0 GROUP BY CODCLI
)
SELECT CAST(
  CAST(c.CODCLI AS VARCHAR(10)) || ';' ||
  '"' || COALESCE(REPLACE(TRIM(COALESCE(v.NOMENF, nm.NOMECLI, c.FANTASIA)),';',','),'') || '";' ||
  '"' || COALESCE(REPLACE(TRIM(c.FANTASIA),';',','),'') || '";' ||
  (CASE WHEN CHAR_LENGTH(REPLACE(TRIM(COALESCE(c.CPF,'')),'0','')) > 0 THEN TRIM(c.CPF) ELSE '' END) || ';' ||
  (CASE WHEN CHAR_LENGTH(REPLACE(TRIM(COALESCE(c.CNPJ,'')),'0','')) > 0 THEN TRIM(c.CNPJ) ELSE '' END) || ';' ||
  '"' || COALESCE(REPLACE(TRIM(c.CONTATO),';',','),'') || '";' ||
  '"' || COALESCE(REPLACE(TRIM(c.ENDERECO),';',','),'') || '";' ||
  '"' || COALESCE(REPLACE(TRIM(c.BAIRRO),';',','),'') || '";' ||
  '"' || COALESCE(REPLACE(TRIM(c.CIDADE),';',','),'') || '";' ||
  COALESCE(TRIM(c.ESTADO),'') || ';' ||
  COALESCE(TRIM(c.CEP),'') || ';' ||
  (CASE WHEN CHAR_LENGTH(REPLACE(TRIM(COALESCE(c.TELEFONE,'')),'0','')) > 0 THEN TRIM(c.TELEFONE) ELSE '' END) || ';' ||
  (CASE WHEN CHAR_LENGTH(REPLACE(TRIM(COALESCE(c.CELULAR,'')),'0','')) > 0 THEN TRIM(c.CELULAR) ELSE '' END) || ';' ||
  '"' || COALESCE(REPLACE(TRIM(c.EMAIL),';',','),'') || '";' ||
  COALESCE(TRIM(c.ATIVO),'') || ';' ||
  COALESCE(CAST(EXTRACT(YEAR FROM c.DATACADASTRO) AS VARCHAR(4))||'-'||RIGHT('0'||CAST(EXTRACT(MONTH FROM c.DATACADASTRO) AS VARCHAR(2)),2)||'-'||RIGHT('0'||CAST(EXTRACT(DAY FROM c.DATACADASTRO) AS VARCHAR(2)),2),'') || ';' ||
  COALESCE(CAST(c.CREDITO AS VARCHAR(15)),'') || ';' ||
  '"' || COALESCE((SELECT TRIM(f.NOME) FROM FUNCIONARIO f WHERE f.CODFUN = c.CODFUN),'') || '";' ||
  COALESCE(CAST(v.NOTAS AS VARCHAR(10)),'0') || ';' ||
  COALESCE(CAST(CAST(v.LTV AS NUMERIC(15,2)) AS VARCHAR(20)),'0') || ';' ||
  COALESCE(CAST(CAST(v.TICKET AS NUMERIC(15,2)) AS VARCHAR(20)),'0') || ';' ||
  COALESCE(CAST(v.PRIMEIRA AS VARCHAR(10)),'') || ';' ||
  COALESCE(CAST(v.ULTIMA AS VARCHAR(10)),'') || ';' ||
  (CASE WHEN a.LTV IS NULL THEN '' WHEN 100.0*a.ACUM/a.TOT<=80 THEN 'A' WHEN 100.0*a.ACUM/a.TOT<=95 THEN 'B' ELSE 'C' END) || ';' ||
  COALESCE(CAST(CAST(100.0*a.LTV/NULLIF(a.TOT,0) AS NUMERIC(7,4)) AS VARCHAR(10)),'')
AS VARCHAR(2000)) AS LINHA
FROM CLIENTE c
LEFT JOIN v   ON v.CODCLI=c.CODCLI
LEFT JOIN abc a ON a.CODCLI=c.CODCLI
LEFT JOIN nm  ON nm.CODCLI=c.CODCLI
WHERE c.CODCLI IN (/* os 100 CODCLIs finais aqui */)
ORDER BY c.CODCLI;
OUTPUT;

SET HEADING OFF;
OUTPUT 'scratchpad/dintec_pilot_veiculos_raw.txt';
SELECT CAST(
  CAST(vp.CODCLI AS VARCHAR(10)) || ';' ||
  COALESCE(TRIM(vp.PLACA),'') || ';' ||
  COALESCE(CAST(vp.ANO AS VARCHAR(4)),'') || ';' ||
  '"' || COALESCE(REPLACE(TRIM(vp.VEICULO),';',','),'') || '";' ||
  '"' || COALESCE(REPLACE(TRIM(vp.COR),';',','),'') || '";' ||
  COALESCE(TRIM(vp.MOTOR),'')
AS VARCHAR(500)) AS LINHA
FROM VEICULOPROPRIETARIO vp
WHERE vp.CODCLI IN (/* os mesmos 100 CODCLIs aqui */)
ORDER BY vp.CODCLI;
OUTPUT;
```

Run the same isql invocation pattern as Step 3. Post-process both raw outputs with the standard PowerShell cleanup (trim padding, WIN1252→UTF-8 BOM, add header) into `scratchpad/dintec-pilot-clientes.csv` and `scratchpad/dintec-pilot-veiculos.csv` — same technique documented in `docs/db/GUIA-BANCO-TURBO-DIESEL.md` §7 Passo B.

- [ ] **Step 5: Verify composition**

```bash
awk -F';' 'NR>1' scratchpad/dintec-pilot-clientes.csv | wc -l    # expect 100
awk -F';' 'NR>1' scratchpad/dintec-pilot-veiculos.csv | cut -d';' -f1 | sort -u | wc -l   # expect ≥10 distinct CODCLI
```

No commit for this task — both CSVs are raw PII and stay in `scratchpad/` only (the same rule already applied to `docs/db/clientes_dintec_todos_telefones.csv` earlier in this project, which was rejected from the repo). The `select-pilot-codclis.ts` helper and the two `.sql` files ARE committed (no PII, reusable for Fase 3's full rollout).

```bash
git add scripts/dintec-import/select-pilot-codclis.ts scripts/dintec-import/sql/select-pilot-codclis.sql scripts/dintec-import/sql/export-pilot-fields.sql
git commit -m "feat: add DINTEC pilot sample selection and field export scripts"
```

---

### Task 8: Orchestration — simulate the 100-pilot, write the report

**Files:**
- Create: `scripts/dintec-import/run-pilot-simulation.ts`

**Interfaces:**
- Consumes: `normalizePhoneKey`, `resolveCustomerType`, `fillIfEmpty`, `normalizeVehicleBrandModel`, `pickBestCodcliByLtv` from `src/features/dintec-import/engine` (Tasks 1–6); `scratchpad/dintec-pilot-clientes.csv` and `scratchpad/dintec-pilot-veiculos.csv` (Task 7).
- Produces: `scratchpad/dintec-pilot-report.csv` and `scratchpad/dintec-pilot-report.md` — reviewed by the owner, not committed (contains real customer PII).

- [ ] **Step 1: Implement the orchestration script**

```typescript
// scripts/dintec-import/run-pilot-simulation.ts
// Run: bun run scripts/dintec-import/run-pilot-simulation.ts
//
// FASE 1 do plano de import DINTEC — SIMULAÇÃO. Este script NUNCA chama
// .insert()/.update()/.delete() no Supabase. Só lê (para os 40 já
// vinculados por telefone) e escreve um relatório local.
import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import {
  normalizePhoneKey,
  resolveCustomerType,
  fillIfEmpty,
  normalizeVehicleBrandModel,
  pickBestCodcliByLtv,
} from "../../src/features/dintec-import/engine";

const URL = process.env.VITE_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) {
  throw new Error("Faltam VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY em .env.local");
}
const sb = createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });

interface DintecClienteRow {
  codcli: string;
  nome: string;
  fantasia: string;
  cpf: string;
  cnpj: string;
  contato: string;
  endereco: string;
  bairro: string;
  cidade: string;
  estado: string;
  cep: string;
  telefone: string;
  celular: string;
  email: string;
  ativo: string;
  clienteDesde: string;
  credito: string;
  vendedorNome: string;
  frequencia: string;
  ltv: string;
  ticketMedio: string;
  primeiraCompra: string;
  ultimaCompra: string;
  abcClass: string;
  pctReceita: string;
}

function parseCsvLine(line: string): string[] {
  // Handles our own export format: ';'-delimited, '"'-quoted text fields
  // with '""' escaping, no embedded ';' inside quotes (already stripped
  // at export time — see export-pilot-fields.sql).
  const cells: string[] = [];
  let i = 0;
  while (i <= line.length) {
    const semi = line.indexOf(";", i);
    const raw = semi === -1 ? line.slice(i) : line.slice(i, semi);
    if (raw.startsWith('"') && raw.endsWith('"')) {
      cells.push(raw.slice(1, -1).replace(/""/g, '"'));
    } else {
      cells.push(raw);
    }
    if (semi === -1) break;
    i = semi + 1;
  }
  return cells;
}

function loadClientes(path: string): DintecClienteRow[] {
  const lines = readFileSync(path, "utf8").replace(/^﻿/, "").split(/\r?\n/).filter(Boolean);
  lines.shift();
  return lines.map((line) => {
    const c = parseCsvLine(line);
    return {
      codcli: c[0],
      nome: c[1],
      fantasia: c[2],
      cpf: c[3] || "",
      cnpj: c[4] || "",
      contato: c[5],
      endereco: c[6],
      bairro: c[7],
      cidade: c[8],
      estado: c[9],
      cep: c[10],
      telefone: c[11] || "",
      celular: c[12] || "",
      email: c[13],
      ativo: c[14],
      clienteDesde: c[15],
      credito: c[16],
      vendedorNome: c[17],
      frequencia: c[18],
      ltv: c[19],
      ticketMedio: c[20],
      primeiraCompra: c[21],
      ultimaCompra: c[22],
      abcClass: c[23],
      pctReceita: c[24],
    };
  });
}

interface VeiculoRow {
  codcli: string;
  placa: string;
  ano: string;
  veiculoRaw: string;
  cor: string;
  motor: string;
}

function loadVeiculos(path: string): VeiculoRow[] {
  const lines = readFileSync(path, "utf8").replace(/^﻿/, "").split(/\r?\n/).filter(Boolean);
  lines.shift();
  return lines.map((line) => {
    const c = parseCsvLine(line);
    return { codcli: c[0], placa: c[1], ano: c[2], veiculoRaw: c[3], cor: c[4], motor: c[5] };
  });
}

interface DryRunMatch {
  customerId: string;
  codcli: string;
  status: string;
}

function loadDryRunMatches(path: string): DryRunMatch[] {
  const lines = readFileSync(path, "utf8").replace(/^﻿/, "").split(/\r?\n/).filter(Boolean);
  lines.shift();
  return lines
    .map((line) => line.split(";"))
    .filter((c) => c[4])
    .map((c) => ({ customerId: c[0], codcli: c[4], status: c[8] }));
}

async function main() {
  const clientes = loadClientes("scratchpad/dintec-pilot-clientes.csv");
  const veiculos = loadVeiculos("scratchpad/dintec-pilot-veiculos.csv");
  const matches = loadDryRunMatches("docs/db/dintec-phone-match-dryrun.csv");

  const pilotCodclis = new Set(clientes.map((c) => c.codcli));
  const relevantMatches = matches.filter((m) => pilotCodclis.has(m.codcli));
  const matchedCustomerIds = [...new Set(relevantMatches.map((m) => m.customerId))];

  const { data: existingCustomers, error } = await sb
    .from("customers")
    .select(
      "id, phone, nome_fantasia, full_name, cpf, cnpj, contact_name, email, address, whatsapp_name",
    )
    .in("id", matchedCustomerIds);
  if (error) throw error;
  const existingById = new Map((existingCustomers ?? []).map((c) => [c.id, c]));

  // Resolve ambiguous groups (same customer_id, >1 codcli) via LTV tiebreak.
  const byCustomer = new Map<string, DryRunMatch[]>();
  for (const m of relevantMatches) {
    if (!byCustomer.has(m.customerId)) byCustomer.set(m.customerId, []);
    byCustomer.get(m.customerId)!.push(m);
  }
  const winningCodcliByCustomer = new Map<string, string>();
  for (const [customerId, group] of byCustomer) {
    if (group.length === 1) {
      winningCodcliByCustomer.set(customerId, group[0].codcli);
      continue;
    }
    const candidates = group.map((g) => {
      const cliente = clientes.find((c) => c.codcli === g.codcli);
      return { codcli: g.codcli, ltv: Number(cliente?.ltv ?? 0) };
    });
    winningCodcliByCustomer.set(customerId, pickBestCodcliByLtv(candidates));
  }
  const codcliToCustomerId = new Map(
    [...winningCodcliByCustomer.entries()].map(([customerId, codcli]) => [codcli, customerId]),
  );

  const rows: string[] = [];
  const header = [
    "codcli",
    "acao",
    "customer_id_linkado",
    "type",
    "nome_final",
    "phone_final",
    "dintec_ativo",
    "dintec_ltv",
    "dintec_abc_class",
    "veiculos_normalizados",
  ].join(";");
  rows.push(header);

  for (const cliente of clientes) {
    const linkedCustomerId = codcliToCustomerId.get(cliente.codcli) ?? null;
    const existing = linkedCustomerId ? existingById.get(linkedCustomerId) : undefined;

    const type = resolveCustomerType(cliente.cpf || null, cliente.cnpj || null);
    const nomeFinal = fillIfEmpty(
      existing?.nome_fantasia || existing?.full_name || null,
      cliente.nome || cliente.fantasia || null,
    );
    const phoneFinal = existing
      ? existing.phone // 563 já vinculados: telefone da plataforma nunca muda
      : normalizePhoneKey(cliente.celular) || normalizePhoneKey(cliente.telefone)
        ? cliente.celular || cliente.telefone
        : ""; // pilot "sem telefone" stratum

    const clienteVeiculos = veiculos
      .filter((v) => v.codcli === cliente.codcli)
      .map((v) => normalizeVehicleBrandModel(v.veiculoRaw));

    rows.push(
      [
        cliente.codcli,
        existing ? "VINCULAR" : "CRIAR",
        linkedCustomerId ?? "",
        type,
        `"${(nomeFinal ?? "").replace(/"/g, '""')}"`,
        phoneFinal,
        cliente.ativo === "SIM" ? "true" : "false",
        cliente.ltv || "0",
        cliente.abcClass || "",
        clienteVeiculos.map((v) => `${v.brand}:${v.model}`).join(" | "),
      ].join(";"),
    );
  }

  writeFileSync("scratchpad/dintec-pilot-report.csv", "﻿" + rows.join("\r\n"), "utf8");

  const vincular = clientes.filter((c) => codcliToCustomerId.has(c.codcli)).length;
  const criar = clientes.length - vincular;
  const summary = [
    "# Piloto DINTEC — Fase 1 (simulação, zero escrita)",
    "",
    `- Clientes DINTEC no piloto: ${clientes.length}`,
    `- Vão VINCULAR a customer existente: ${vincular}`,
    `- Vão CRIAR customer novo: ${criar}`,
    `- Veículos normalizados: ${veiculos.length}`,
    "",
    "Ver `dintec-pilot-report.csv` linha a linha. Nenhuma escrita foi feita no banco.",
  ].join("\n");
  writeFileSync("scratchpad/dintec-pilot-report.md", summary, "utf8");
  console.log(summary);
}

main();
```

- [ ] **Step 2: Run it**

Run: `bun run scripts/dintec-import/run-pilot-simulation.ts`
Expected: prints the summary block; `scratchpad/dintec-pilot-report.csv` has 101 lines (header + 100); no error, no Supabase write call anywhere in the script (verify by reading the file — only one `.select(` call, zero `.insert(`/`.update(`/`.delete(`).

- [ ] **Step 3: Verify zero writes by grep**

Run: `grep -nE "\.(insert|update|delete|upsert)\(" scripts/dintec-import/run-pilot-simulation.ts`
Expected: no output (empty match) — confirms the safety constraint from Global Constraints holds.

- [ ] **Step 4: Commit**

```bash
git add scripts/dintec-import/run-pilot-simulation.ts
git commit -m "feat: add DINTEC Fase 1 pilot simulation script (zero-write report)"
```

---

### Task 9: Present the pilot report for owner review

Not a code task — the deliverable of Fase 1. After Task 8 runs successfully:

- [ ] Open `scratchpad/dintec-pilot-report.md` and `scratchpad/dintec-pilot-report.csv`, summarize the composition (VINCULAR vs CRIAR counts, sample of vehicle normalization results, any `brand="Outra"` fallbacks) back to the owner in the conversation.
- [ ] Flag any `brand="Outra"` rows explicitly — these are the ones the normalization heuristic didn't recognize.
- [ ] Wait for explicit owner approval before starting Fase 2 (real write of the same 100) — per the design doc, no schema migration or write happens without that approval.

---

## Self-Review Notes

- **Spec coverage:** every section of `docs/superpowers/specs/2026-07-10-dintec-customer-import-design.md`'s "Fase 1" is covered by a task: stratified sample (Task 7), phone/type/merge/vehicle/tiebreak rules (Tasks 1–5), zero-write report (Task 8), owner review gate (Task 9). Fase 2/3 (real writes, full rollout) are explicitly out of scope for this plan — they get their own plan after Fase 1 is approved, since the design doc's own phase gate requires that.
- **No placeholders:** every step has complete, runnable code; the two `.sql` files have an explicit manual paste-in step (Firebird `isql` has no parameterized IN-list support) called out as such rather than hidden.
- **Type consistency:** `AmbiguousCandidate`, `VehicleBrandModel`, `DintecCustomerType` are defined once (Tasks 4/5/2) and only referenced, not redefined, in Task 8.
