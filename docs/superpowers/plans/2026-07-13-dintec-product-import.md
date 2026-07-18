# Import de Produtos DINTEC — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** trazer produtos reais para o catálogo (`parts`) combinando três fontes (Firebird DINTEC, planilha de cotação UFI, planilha de aplicação Turbo Filtros), preservando/enriquecendo os 151 registros já reais e removendo os 200 registros mock, seguindo o design em `docs/superpowers/specs/2026-07-13-dintec-product-import-design.md`.

**Architecture:** migration primeiro (colunas de proveniência + índices) → limpeza dos 200 mock (com cascata de orçamentos órfãos) → engines puros testados (parsing de `.xlsx` sem dependência nova, resolvedor de faixa de preço DINTEC, parser de aplicação/referências cruzadas) → export SQL do Firebird → dois scripts standalone de import (planilhas de fornecedor; DINTEC), cada um com dry-run + gate de escrita, reaproveitando o padrão de `scripts/dintec-import/run-full-import.ts`.

**Tech Stack:** TypeScript + Bun (`scripts/dintec-import/`), Supabase JS client (`service_role`), Vitest para os engines, `node:zlib`/`node:fs` puro (sem dependência nova de parsing xlsx), `isql` embedded do Firebird (`docs/db/GUIA-BANCO-TURBO-DIESEL.md`).

## Global Constraints

- **Escopo DINTEC:** só os 2.514 produtos ativos identificáveis (`REFERENCIA` preenchida OU `PRODUTOECOMMERCE.DESCRICAO` preenchida).
- **Escopo UFI:** só as linhas com `Comprou?` = `SIM` (138 linhas).
- **Escopo Turbo Filtros:** só enriquece produtos já existentes por `sku`; nunca cria produto novo a partir dela.
- **`unitPrice` DINTEC:** `VALOR5` (faixa VAREJO). `priceTables[]` usa `id` ∈ `'oficina'|'atacado'|'varejo'|'ecommerce'` (não usar `'padrao'` — essa faixa não vem de nenhuma fonte deste import). `markupPercent` é fração decimal (`PERC/100`, ex.: `PERC3=100` → `markupPercent=1.00`).
- **`fillIfEmpty`:** nunca sobrescrever um valor de plataforma já presente — reaproveitar `src/features/dintec-import/engine/fillIfEmpty.ts` sem alteração.
- **`IPartFiscal`** só tem `ncm?`, `icmsPercent?`, `taxSubstitution?`, `origin?` — **não** tem PIS/COFINS/IPI. Não inventar campos.
- **`IPart.supplier`** é `string` obrigatório (não array) — resolver best-effort, nunca deixar `undefined`.
- **`IPart.suppliers[]`** (array rico) exige `cost`+`quantity` por entrada — nenhuma fonte deste import tem esse dado completo (`ENTRADANFE` está vazia; `PRODUTOFORNECEDOR` não tem custo/quantidade) — **não popular `suppliers[]`**, só o `supplier: string`.
- **`applications: []` e `equivalentPartIds: []`** sempre vazios (arrays obrigatórios, mas fora de escopo estruturar) — texto cru vai em `applicationNotes`.
- **`marginPercent`** obrigatório, calculado como `(unitPrice - unitCost) / unitCost` (0 quando `unitCost` for 0).
- **`STORE_ID`** = `"00000000-0000-0000-0000-000000000001"` (mesma loja usada no import de clientes).
- **Sem dependência nova:** parsing de `.xlsx` via `node:zlib` (zip) + regex (XML), sem adicionar pacote ao `package.json` (evita o gate de `minimumReleaseAge` do `bunfig.toml`).
- **Todo script de escrita** segue o padrão: `DINTEC_DRY_RUN=yes` roda sem gravar nada; `DINTEC_CONFIRM_WRITE=yes` grava; sem nenhuma das duas, lança erro. Backup em `scratchpad/` antes de qualquer escrita.

---

### Task 1: Migration — colunas de proveniência em `parts`

**Files:**
- Create: `supabase/migrations/20260713120000_parts_dintec_catalog_source.sql`

**Interfaces:**
- Produces: colunas `parts.dintec_codpro` (integer, nullable), `parts.dintec_synced_at` (timestamptz, nullable), `parts.catalog_source` (text, nullable), índice único parcial em `dintec_codpro`, índice único em `sku`.

- [ ] **Step 1: Escrever a migration**

```sql
-- Colunas de proveniência para o import assistido de produtos DINTEC/planilhas
-- de fornecedor (docs/superpowers/specs/2026-07-13-dintec-product-import-design.md).
-- Espelha o padrão de customers (20260625130000_customers_dintec_codcli.sql):
-- dintec_codpro é a âncora de idempotência do track Firebird; catalog_source
-- rastreia a proveniência dos 3 tracks (dintec_erp / supplier_ufi /
-- supplier_turbo_filtros) sem precisar de uma tabela separada.

alter table public.parts
  add column if not exists dintec_codpro integer,
  add column if not exists dintec_synced_at timestamptz,
  add column if not exists catalog_source text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'parts_catalog_source_check'
      and conrelid = 'public.parts'::regclass
  ) then
    alter table public.parts
      add constraint parts_catalog_source_check
      check (catalog_source is null or catalog_source = any (
        array['dintec_erp', 'supplier_ufi', 'supplier_turbo_filtros', 'manual']
      ));
  end if;
end $$;

-- Âncora de idempotência do track Firebird — no máximo um `parts` por CODPRO.
create unique index if not exists parts_dintec_codpro_key
  on public.parts (dintec_codpro)
  where dintec_codpro is not null;

-- Chave de idempotência do track de planilha (upsert por sku). Verificado
-- sem duplicatas nas 351 linhas atuais antes de aplicar esta migration.
create unique index if not exists parts_sku_key
  on public.parts (sku);

comment on column public.parts.dintec_codpro is
  'DINTEC ERP product code (PRODUTO.CODPRO). Anchor for idempotent assisted CSV imports. Null for parts sourced from supplier spreadsheets or created manually.';
comment on column public.parts.catalog_source is
  'Provenance of this catalog row: dintec_erp (Firebird PRODUTO import), supplier_ufi (UFI quote spreadsheet), supplier_turbo_filtros (Turbo Filtros application spreadsheet). Null for pre-existing/manual rows.';
comment on column public.parts.dintec_synced_at is
  'Timestamp of the last assisted import batch that touched this row (any of the 3 tracks). Used to identify/rollback a given batch.';
```

- [ ] **Step 2: Aplicar via MCP Supabase**

Usar `mcp__supabase__apply_migration` com `name="parts_dintec_catalog_source"` e o SQL acima. Confirmar com o dono antes (regra do projeto: nunca aplicar migration em prod sem OK explícito).

- [ ] **Step 3: Verificar**

```sql
select column_name, data_type from information_schema.columns
where table_schema='public' and table_name='parts'
  and column_name in ('dintec_codpro','dintec_synced_at','catalog_source');

select indexname from pg_indexes where tablename='parts' and indexname in ('parts_dintec_codpro_key','parts_sku_key');
```

Esperado: 3 colunas + 2 índices.

- [ ] **Step 4: Espelhar no git**

Confirmar que o arquivo `supabase/migrations/20260713120000_parts_dintec_catalog_source.sql` está commitado (regra do projeto: todo `apply_migration` via MCP precisa ser exportado pro Git no mesmo PR).

---

### Task 2: Limpeza dos 200 registros mock (`GAL-`)

**Files:**
- Create: `scripts/dintec-import/run-parts-mock-cleanup.ts`

**Interfaces:**
- Consumes: nenhuma (lê direto do Supabase).
- Produces: remove as 200 `parts` com `sku ~ '^GAL-'` e os 13 `quotes` órfãos (mais seus `quote_items`) que referenciam alguma delas. Backup em `scratchpad/parts-mock-cleanup-backup.json`.

- [ ] **Step 1: Escrever o script**

```typescript
// scripts/dintec-import/run-parts-mock-cleanup.ts
// Remove os ~200 registros de `parts` puramente mock (SKU `GAL-XXX-NNNN`,
// faker sem vínculo com nenhuma fonte real) e os orçamentos órfãos que os
// referenciam (customer_id IS NULL — seed sem cliente, mesma leva órfã já
// limpa no import de clientes). Não toca nos ~151 registros reais (SKU
// `NN.NNN.NN`, vindos das planilhas UFI/Turbo Filtros — ver design spec
// 2026-07-13).
//
// Dry-run (zero escrita, só relatório):
//   DINTEC_DRY_RUN=yes bun run scripts/dintec-import/run-parts-mock-cleanup.ts
// Escrita real:
//   DINTEC_CONFIRM_WRITE=yes bun run scripts/dintec-import/run-parts-mock-cleanup.ts
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const DRY_RUN = process.env.DINTEC_DRY_RUN === "yes";
if (!DRY_RUN && process.env.DINTEC_CONFIRM_WRITE !== "yes") {
  throw new Error(
    "Trava de segurança: rode com DINTEC_DRY_RUN=yes (simulação) ou DINTEC_CONFIRM_WRITE=yes (escrita real).",
  );
}

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !KEY) {
  throw new Error("Faltam VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY em .env.local");
}
const sb = createClient(SUPABASE_URL, KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const ROOT = join(import.meta.dir, "..", "..");
const SCRATCHPAD = join(ROOT, "scratchpad");

async function main() {
  console.log(`Limpeza de parts mock — modo: ${DRY_RUN ? "DRY-RUN (zero escrita)" : "ESCRITA REAL"}`);

  const { data: mockParts, error: partsError } = await sb
    .from("parts")
    .select("id, sku, name")
    .ilike("sku", "GAL-%");
  if (partsError) throw partsError;
  const mockPartIds = (mockParts ?? []).map((p) => p.id);
  console.log(`Parts mock encontrados: ${mockPartIds.length}`);

  const { data: items, error: itemsError } = await sb
    .from("quote_items")
    .select("quote_id, part_id")
    .in("part_id", mockPartIds.length > 0 ? mockPartIds : ["__none__"]);
  if (itemsError) throw itemsError;
  const orphanQuoteIds = [...new Set((items ?? []).map((i) => i.quote_id))];

  const { data: orphanQuotes, error: quotesError } = await sb
    .from("quotes")
    .select("id, customer_id, status, created_at")
    .in("id", orphanQuoteIds.length > 0 ? orphanQuoteIds : ["__none__"]);
  if (quotesError) throw quotesError;
  const nonOrphan = (orphanQuotes ?? []).filter((q) => q.customer_id !== null);
  if (nonOrphan.length > 0) {
    throw new Error(
      `SEGURANÇA: ${nonOrphan.length} dos orçamentos que referenciam parts mock TÊM customer_id real — abortando. IDs: ${nonOrphan.map((q) => q.id).join(", ")}`,
    );
  }
  console.log(`Orçamentos órfãos (customer_id null) a remover: ${orphanQuoteIds.length}`);

  const { count: allItemsCount, error: allItemsError } = await sb
    .from("quote_items")
    .select("id", { count: "exact", head: true })
    .in("quote_id", orphanQuoteIds.length > 0 ? orphanQuoteIds : ["__none__"]);
  if (allItemsError) throw allItemsError;
  console.log(`quote_items removidos junto (inclui itens não-mock desses mesmos orçamentos órfãos): ${allItemsCount}`);

  if (DRY_RUN) {
    const summary = [
      "# Limpeza de parts mock — DRY-RUN (zero escrita)",
      "",
      `- Parts mock (sku GAL-*): ${mockPartIds.length}`,
      `- Orçamentos órfãos removidos: ${orphanQuoteIds.length}`,
      `- quote_items removidos (total dos orçamentos órfãos, não só os mock): ${allItemsCount}`,
    ].join("\n");
    writeFileSync(join(SCRATCHPAD, "parts-mock-cleanup-dryrun.md"), summary, "utf8");
    console.log(summary);
    return;
  }

  // ===== WRITE MODE =====
  const { data: quoteItemsFull } = await sb
    .from("quote_items")
    .select("*")
    .in("quote_id", orphanQuoteIds.length > 0 ? orphanQuoteIds : ["__none__"]);
  const backup = {
    parts: mockParts,
    quotes: orphanQuotes,
    quoteItems: quoteItemsFull,
  };
  writeFileSync(join(SCRATCHPAD, "parts-mock-cleanup-backup.json"), JSON.stringify(backup, null, 1), "utf8");
  console.log(`Backup salvo em scratchpad/parts-mock-cleanup-backup.json`);

  if (orphanQuoteIds.length > 0) {
    const { error: deleteItemsError } = await sb.from("quote_items").delete().in("quote_id", orphanQuoteIds);
    if (deleteItemsError) throw deleteItemsError;
    const { error: deleteQuotesError } = await sb.from("quotes").delete().in("id", orphanQuoteIds);
    if (deleteQuotesError) throw deleteQuotesError;
  }
  const { error: deletePartsError } = await sb.from("parts").delete().ilike("sku", "GAL-%");
  if (deletePartsError) throw deletePartsError;

  const summary = [
    "# Limpeza de parts mock — ESCRITA REAL concluída",
    "",
    `- Parts mock removidos: ${mockPartIds.length}`,
    `- Orçamentos órfãos removidos: ${orphanQuoteIds.length}`,
    `- quote_items removidos: ${allItemsCount}`,
    "",
    "Rollback: restaurar `scratchpad/parts-mock-cleanup-backup.json` — reinserir `parts` primeiro, depois `quotes`, depois `quote_items` (ordem inversa da FK).",
  ].join("\n");
  writeFileSync(join(SCRATCHPAD, "parts-mock-cleanup-report.md"), summary, "utf8");
  console.log(summary);
}

main().catch((e) => {
  console.error("LIMPEZA FALHOU:", e.message);
  process.exit(1);
});
```

- [ ] **Step 2: Rodar dry-run e conferir**

```bash
DINTEC_DRY_RUN=yes bun run scripts/dintec-import/run-parts-mock-cleanup.ts
```

Esperado: `Parts mock encontrados: 200`, `Orçamentos órfãos: 13`, nenhum erro de segurança (customer_id real).

- [ ] **Step 3: Rodar escrita real (só após OK do dono)**

```bash
DINTEC_CONFIRM_WRITE=yes bun run scripts/dintec-import/run-parts-mock-cleanup.ts
```

- [ ] **Step 4: Verificar**

```sql
select count(*) from public.parts where sku ilike 'GAL-%'; -- esperado 0
select count(*) from public.parts; -- esperado 151
```

---

### Task 3: Parsing de `.xlsx` sem dependência nova

**Files:**
- Create: `src/features/dintec-import/engine/xlsxZip.ts`
- Create: `src/features/dintec-import/engine/xlsxZip.test.ts`
- Create: `src/features/dintec-import/engine/xlsxParser.ts`
- Create: `src/features/dintec-import/engine/xlsxParser.test.ts`
- Modify: `src/features/dintec-import/engine/index.ts`

**Interfaces:**
- Produces: `readZipEntry(buf: Buffer, entryName: string): Buffer | null`, `parseSharedStrings(xml: string): string[]`, `colLettersToIndex(cellRef: string): number`, `parseSheetRows(xml: string, sharedStrings: string[]): string[][]`, `loadXlsxSheet(buf: Buffer, sheetIndex: number): string[][]` — usados pelas Tasks 6/7.

- [ ] **Step 1: Escrever o teste de `colLettersToIndex` e `parseSharedStrings`**

```typescript
// src/features/dintec-import/engine/xlsxParser.test.ts
import { describe, expect, it } from "vitest";
import { colLettersToIndex, parseSharedStrings, parseSheetRows } from "./xlsxParser";

describe("colLettersToIndex", () => {
  it("converts single-letter columns", () => {
    expect(colLettersToIndex("A1")).toBe(0);
    expect(colLettersToIndex("Z1")).toBe(25);
  });

  it("converts double-letter columns", () => {
    expect(colLettersToIndex("AA1")).toBe(26);
    expect(colLettersToIndex("AF1")).toBe(31);
    expect(colLettersToIndex("AL1535")).toBe(37);
  });
});

describe("parseSharedStrings", () => {
  it("extracts plain text entries in order", () => {
    const xml =
      '<?xml version="1.0"?><sst count="3" uniqueCount="3">' +
      "<si><t>Código Comercial</t></si>" +
      "<si><t>Descrição</t></si>" +
      "<si><t>UFI</t></si>" +
      "</sst>";
    expect(parseSharedStrings(xml)).toEqual(["Código Comercial", "Descrição", "UFI"]);
  });

  it("decodes XML entities and joins rich-text runs", () => {
    const xml =
      "<sst>" +
      "<si><t>A &amp; B</t></si>" +
      "<si><r><t>Fiat</t></r><r><t>: Ducato</t></r></si>" +
      "</sst>";
    expect(parseSharedStrings(xml)).toEqual(["A & B", "Fiat: Ducato"]);
  });
});

describe("parseSheetRows", () => {
  const shared = ["Código Comercial", "Descrição", "UFI"];

  it("resolves shared-string cells and leaves empty self-closing cells blank", () => {
    const xml =
      '<sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" s="45"/><c r="C1" t="s"><v>1</v></c></row></sheetData>';
    expect(parseSheetRows(xml, shared)).toEqual([["Código Comercial", "", "Descrição"]]);
  });

  it("reads formula cells by their cached <v>, ignoring the <f> body", () => {
    const xml =
      '<sheetData><row r="2"><c r="A2" s="43"><f>SUBTOTAL(9,A4:A1560)</f><v>302.56</v></c></row></sheetData>';
    expect(parseSheetRows(xml, shared)).toEqual([["302.56"]]);
  });

  it("pads columns that start after A with empty strings", () => {
    const xml =
      '<sheetData><row r="1"><c r="C1" t="s"><v>2</v></c></row></sheetData>';
    expect(parseSheetRows(xml, shared)).toEqual([["", "", "UFI"]]);
  });

  it("handles multiple rows independently", () => {
    const xml =
      '<sheetData>' +
      '<row r="1"><c r="A1" t="s"><v>0</v></c></row>' +
      '<row r="2"><c r="A2" t="s"><v>1</v></c><c r="B2" t="s"><v>2</v></c></row>' +
      "</sheetData>";
    expect(parseSheetRows(xml, shared)).toEqual([
      ["Código Comercial"],
      ["Descrição", "UFI"],
    ]);
  });
});
```

- [ ] **Step 2: Rodar teste para ver falhar**

```bash
bun run test src/features/dintec-import/engine/xlsxParser.test.ts
```

Esperado: FALHA — `xlsxParser.ts` não existe ainda.

- [ ] **Step 3: Implementar `xlsxParser.ts`**

```typescript
// src/features/dintec-import/engine/xlsxParser.ts
/** Decodes the 5 XML entities Excel actually emits — no general XML unescaping needed. */
function decodeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

/** Converts a cell reference's column letters (e.g. "AF12" → "AF") to a 0-based column index. */
export function colLettersToIndex(cellRef: string): number {
  const letters = cellRef.match(/^[A-Z]+/)?.[0] ?? "";
  let idx = 0;
  for (const ch of letters) idx = idx * 26 + (ch.charCodeAt(0) - 64);
  return idx - 1;
}

/** Parses `xl/sharedStrings.xml` into the ordered string pool referenced by `t="s"` cells. */
export function parseSharedStrings(xml: string): string[] {
  const siBlocks = xml.match(/<si>[\s\S]*?<\/si>/g) ?? [];
  return siBlocks.map((block) => {
    const texts = [...block.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => decodeXmlEntities(m[1]));
    return texts.join("");
  });
}

/**
 * Parses a worksheet XML (`xl/worksheets/sheetN.xml`) into a grid of cell
 * strings. Each row is padded from column A up to its highest populated
 * column — rows that start past column A (common in these supplier sheets,
 * whose leftmost columns are hidden helper columns) still land at the right
 * index.
 */
export function parseSheetRows(xml: string, sharedStrings: string[]): string[][] {
  const rowBlocks = xml.match(/<row\b[^>]*>[\s\S]*?<\/row>/g) ?? [];
  return rowBlocks.map((rowXml) => {
    const cells = new Map<number, string>();
    let maxCol = -1;
    for (const cellMatch of rowXml.matchAll(/<c\s+([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cellMatch[1];
      const inner = cellMatch[2] ?? "";
      const ref = attrs.match(/r="([^"]+)"/)?.[1];
      if (!ref) continue;
      const col = colLettersToIndex(ref);
      maxCol = Math.max(maxCol, col);
      const type = attrs.match(/t="([^"]+)"/)?.[1];
      const inlineText = inner.match(/<is>[\s\S]*?<t[^>]*>([\s\S]*?)<\/t>[\s\S]*?<\/is>/)?.[1];
      const value = inner.match(/<v>([\s\S]*?)<\/v>/)?.[1];
      if (inlineText != null) {
        cells.set(col, decodeXmlEntities(inlineText));
      } else if (value == null) {
        cells.set(col, "");
      } else if (type === "s") {
        cells.set(col, sharedStrings[Number(value)] ?? "");
      } else {
        cells.set(col, decodeXmlEntities(value));
      }
    }
    const line: string[] = [];
    for (let i = 0; i <= maxCol; i++) line.push(cells.get(i) ?? "");
    return line;
  });
}
```

- [ ] **Step 4: Rodar teste, confirmar que passa**

```bash
bun run test src/features/dintec-import/engine/xlsxParser.test.ts
```

- [ ] **Step 5: Escrever o teste de integração do leitor ZIP contra os arquivos reais**

```typescript
// src/features/dintec-import/engine/xlsxZip.test.ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readZipEntry } from "./xlsxZip";
import { parseSharedStrings, parseSheetRows } from "./xlsxParser";

const UFI_PATH = join(
  import.meta.dir,
  "..",
  "..",
  "..",
  "..",
  "docs",
  "export",
  "2024.11.14 Cotação Turbo Diesel UFI.xlsx",
);

describe("readZipEntry (against the real UFI spreadsheet)", () => {
  it("extracts and decompresses xl/sharedStrings.xml with real column headers", () => {
    const buf = readFileSync(UFI_PATH);
    const entry = readZipEntry(buf, "xl/sharedStrings.xml");
    expect(entry).not.toBeNull();
    const shared = parseSharedStrings(entry!.toString("utf8"));
    expect(shared).toContain("Código Comercial");
    expect(shared).toContain("Descrição");
  });

  it("extracts xl/worksheets/sheet1.xml with the real header row", () => {
    const buf = readFileSync(UFI_PATH);
    const sharedXml = readZipEntry(buf, "xl/sharedStrings.xml")!.toString("utf8");
    const shared = parseSharedStrings(sharedXml);
    const sheetXml = readZipEntry(buf, "xl/worksheets/sheet1.xml")!.toString("utf8");
    const rows = parseSheetRows(sheetXml, shared);
    // Row index 2 (0-based) is the real column-name header in this file.
    expect(rows[2][0]).toBe("Código Comercial");
    expect(rows[2][1]).toBe("Descrição");
  });

  it("returns null for a nonexistent entry", () => {
    const buf = readFileSync(UFI_PATH);
    expect(readZipEntry(buf, "xl/does-not-exist.xml")).toBeNull();
  });
});
```

- [ ] **Step 6: Rodar teste para ver falhar**

```bash
bun run test src/features/dintec-import/engine/xlsxZip.test.ts
```

Esperado: FALHA — `xlsxZip.ts` não existe ainda.

- [ ] **Step 7: Implementar `xlsxZip.ts`**

```typescript
// src/features/dintec-import/engine/xlsxZip.ts
import { inflateRawSync } from "node:zlib";

const END_OF_CENTRAL_DIR_SIGNATURE = 0x06054b50;
const CENTRAL_DIR_SIGNATURE = 0x02014b50;

/**
 * Reads a single named entry from a `.xlsx` file's ZIP container as raw
 * bytes, or `null` if the entry doesn't exist. Handles both stored
 * (uncompressed) and deflated entries — the only two compression methods
 * Excel itself ever writes. No ZIP64 support (not needed — these files are
 * well under the 4GB/65535-entry limits that trigger it).
 */
export function readZipEntry(buf: Buffer, entryName: string): Buffer | null {
  let eocdOffset = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === END_OF_CENTRAL_DIR_SIGNATURE) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset === -1) throw new Error("Arquivo não é um .xlsx válido (EOCD não encontrado)");

  const entryCount = buf.readUInt16LE(eocdOffset + 10);
  let cdOffset = buf.readUInt32LE(eocdOffset + 16);

  for (let i = 0; i < entryCount; i++) {
    const sig = buf.readUInt32LE(cdOffset);
    if (sig !== CENTRAL_DIR_SIGNATURE) {
      throw new Error(`Central directory corrompido no offset ${cdOffset} (assinatura ${sig.toString(16)})`);
    }
    const compressionMethod = buf.readUInt16LE(cdOffset + 10);
    const compressedSize = buf.readUInt32LE(cdOffset + 20);
    const fileNameLength = buf.readUInt16LE(cdOffset + 28);
    const extraFieldLength = buf.readUInt16LE(cdOffset + 30);
    const commentLength = buf.readUInt16LE(cdOffset + 32);
    const localHeaderOffset = buf.readUInt32LE(cdOffset + 42);
    const fileName = buf.toString("utf8", cdOffset + 46, cdOffset + 46 + fileNameLength);

    if (fileName === entryName) {
      const localFileNameLength = buf.readUInt16LE(localHeaderOffset + 26);
      const localExtraFieldLength = buf.readUInt16LE(localHeaderOffset + 28);
      const dataOffset = localHeaderOffset + 30 + localFileNameLength + localExtraFieldLength;
      const compressed = buf.subarray(dataOffset, dataOffset + compressedSize);
      return compressionMethod === 0 ? Buffer.from(compressed) : inflateRawSync(compressed);
    }
    cdOffset += 46 + fileNameLength + extraFieldLength + commentLength;
  }
  return null;
}

/** Lists every entry filename in the ZIP container (used to discover sheetN.xml files). */
export function listZipEntries(buf: Buffer): string[] {
  let eocdOffset = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === END_OF_CENTRAL_DIR_SIGNATURE) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset === -1) throw new Error("Arquivo não é um .xlsx válido (EOCD não encontrado)");
  const entryCount = buf.readUInt16LE(eocdOffset + 10);
  let cdOffset = buf.readUInt32LE(eocdOffset + 16);
  const names: string[] = [];
  for (let i = 0; i < entryCount; i++) {
    const fileNameLength = buf.readUInt16LE(cdOffset + 28);
    const extraFieldLength = buf.readUInt16LE(cdOffset + 30);
    const commentLength = buf.readUInt16LE(cdOffset + 32);
    names.push(buf.toString("utf8", cdOffset + 46, cdOffset + 46 + fileNameLength));
    cdOffset += 46 + fileNameLength + extraFieldLength + commentLength;
  }
  return names;
}
```

- [ ] **Step 8: Rodar teste, confirmar que passa**

```bash
bun run test src/features/dintec-import/engine/xlsxZip.test.ts
```

- [ ] **Step 9: Adicionar o loader de conveniência (usa os dois módulos acima)**

Acrescentar ao final de `src/features/dintec-import/engine/xlsxParser.ts`:

```typescript
import { readZipEntry } from "./xlsxZip";

/** Loads sheet N (0-based) of a `.xlsx` buffer as a grid of cell strings. */
export function loadXlsxSheet(buf: Buffer, sheetIndex: number): string[][] {
  const sharedXml = readZipEntry(buf, "xl/sharedStrings.xml");
  const shared = sharedXml ? parseSharedStrings(sharedXml.toString("utf8")) : [];
  const sheetXml = readZipEntry(buf, `xl/worksheets/sheet${sheetIndex + 1}.xml`);
  if (!sheetXml) throw new Error(`xl/worksheets/sheet${sheetIndex + 1}.xml não encontrado no .xlsx`);
  return parseSheetRows(sheetXml.toString("utf8"), shared);
}
```

- [ ] **Step 10: Atualizar o barrel**

```typescript
// src/features/dintec-import/engine/index.ts
export { normalizePhoneKey } from "./phoneKey";
export { resolveCustomerType, type DintecCustomerType } from "./customerType";
export { fillIfEmpty } from "./fillIfEmpty";
export { normalizeVehicleBrandModel, type VehicleBrandModel } from "./vehicleNormalize";
export { pickBestCodcliByLtv, type AmbiguousCandidate } from "./ambiguousTiebreak";
export { readZipEntry, listZipEntries } from "./xlsxZip";
export { colLettersToIndex, parseSharedStrings, parseSheetRows, loadXlsxSheet } from "./xlsxParser";
```

- [ ] **Step 11: Rodar a suíte inteira e commitar**

```bash
bun run test
```

```bash
git add src/features/dintec-import/engine/xlsxZip.ts src/features/dintec-import/engine/xlsxZip.test.ts src/features/dintec-import/engine/xlsxParser.ts src/features/dintec-import/engine/xlsxParser.test.ts src/features/dintec-import/engine/index.ts
git commit -m "feat: add dependency-free .xlsx parsing engine for supplier catalog import"
```

---

### Task 4: Engines de mapeamento de produto

**Files:**
- Create: `src/features/dintec-import/engine/dintecPriceTables.ts`
- Create: `src/features/dintec-import/engine/dintecPriceTables.test.ts`
- Create: `src/features/dintec-import/engine/aplicacaoParser.ts`
- Create: `src/features/dintec-import/engine/aplicacaoParser.test.ts`
- Create: `src/features/dintec-import/engine/titleCase.ts`
- Create: `src/features/dintec-import/engine/titleCase.test.ts`
- Create: `src/features/dintec-import/engine/crossReferenceExtractor.ts`
- Create: `src/features/dintec-import/engine/crossReferenceExtractor.test.ts`
- Modify: `src/features/dintec-import/engine/index.ts`

**Interfaces:**
- Consumes: `IPriceTable`, `IPartCrossReference` de `@/shared/types`.
- Produces: `buildDintecPriceTables(input): IPriceTable[]`, `parseAplicacaoText(raw): {applicationNotes: string | undefined, crossReferences: IPartCrossReference[]}`, `titleCaseName(raw): string`, `extractCrossReferences(row, brands, start): IPartCrossReference[]` — usados pelas Tasks 6/7.

- [ ] **Step 1: Teste de `titleCaseName`**

```typescript
// src/features/dintec-import/engine/titleCase.test.ts
import { describe, expect, it } from "vitest";
import { titleCaseName } from "./titleCase";

describe("titleCaseName", () => {
  it("title-cases each word, preserving accents", () => {
    expect(titleCaseName("Chave para desmontagem de filtro")).toBe("Chave Para Desmontagem De Filtro");
    expect(titleCaseName("ELEMENTO FILTRANTE DO ÓLEO")).toBe("Elemento Filtrante Do Óleo");
  });

  it("collapses extra whitespace", () => {
    expect(titleCaseName("  Filtro   De  Ar  ")).toBe("Filtro De Ar");
  });

  it("returns an empty string unchanged", () => {
    expect(titleCaseName("")).toBe("");
  });
});
```

- [ ] **Step 2: Ver falhar, então implementar**

```typescript
// src/features/dintec-import/engine/titleCase.ts
/**
 * Title-cases a supplier-sheet description the same way the existing 151
 * real `parts` rows were seeded (e.g. "Chave para desmontagem de filtro" →
 * "Chave Para Desmontagem De Filtro") — keeps new rows visually consistent
 * with the enriched ones.
 */
export function titleCaseName(raw: string): string {
  return raw
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toLocaleUpperCase("pt-BR") + word.slice(1).toLocaleLowerCase("pt-BR"))
    .join(" ");
}
```

Rodar `bun run test src/features/dintec-import/engine/titleCase.test.ts` até passar.

- [ ] **Step 3: Teste de `parseAplicacaoText`**

```typescript
// src/features/dintec-import/engine/aplicacaoParser.test.ts
import { describe, expect, it } from "vitest";
import { parseAplicacaoText } from "./aplicacaoParser";

describe("parseAplicacaoText", () => {
  it("splits fitment text from a trailing COD. SEMELHANTES: cross-reference list", () => {
    const raw =
      "AGRALE: MA 7.5T - MICRO-BUS - MWM 4.10T; MA 8.5T - MICRO-BUS - MWM 4.10T / AGCO: MF-297 / JCB: 580/12020 = Secundário use CF500/1 (componente da carcaça 45 500 92 941)\nCOD. SEMELHANTES: ARS3003 / CA9352 / WAP606";
    const result = parseAplicacaoText(raw);
    expect(result.applicationNotes).toBe(
      "AGRALE: MA 7.5T - MICRO-BUS - MWM 4.10T; MA 8.5T - MICRO-BUS - MWM 4.10T / AGCO: MF-297 / JCB: 580/12020 = Secundário use CF500/1 (componente da carcaça 45 500 92 941)",
    );
    expect(result.crossReferences).toEqual([
      { brand: "DINTEC (equivalente)", code: "ARS3003" },
      { brand: "DINTEC (equivalente)", code: "CA9352" },
      { brand: "DINTEC (equivalente)", code: "WAP606" },
    ]);
  });

  it("returns only applicationNotes when there is no COD. SEMELHANTES section", () => {
    const raw = "CITROËN: JUMPER 2.8 HDI 17 (01/07-)";
    const result = parseAplicacaoText(raw);
    expect(result.applicationNotes).toBe("CITROËN: JUMPER 2.8 HDI 17 (01/07-)");
    expect(result.crossReferences).toEqual([]);
  });

  it("returns undefined applicationNotes for blank/dash input", () => {
    expect(parseAplicacaoText("").applicationNotes).toBeUndefined();
    expect(parseAplicacaoText("-").applicationNotes).toBeUndefined();
    expect(parseAplicacaoText("").crossReferences).toEqual([]);
  });
});
```

- [ ] **Step 4: Ver falhar, então implementar**

```typescript
// src/features/dintec-import/engine/aplicacaoParser.ts
import type { IPartCrossReference } from "@/shared/types";

/**
 * Splits a DINTEC `APLICACAO` free-text field into the vehicle-fitment
 * prose and, when present, the trailing "COD. SEMELHANTES: X / Y / Z"
 * cross-reference list — the only structured piece worth extracting (the
 * fitment prose itself stays raw; see the design spec's "fora de escopo").
 */
export function parseAplicacaoText(raw: string): {
  applicationNotes: string | undefined;
  crossReferences: IPartCrossReference[];
} {
  const trimmed = raw.trim();
  if (!trimmed || trimmed === "-") {
    return { applicationNotes: undefined, crossReferences: [] };
  }
  const marker = "COD. SEMELHANTES:";
  const markerIndex = trimmed.indexOf(marker);
  if (markerIndex === -1) {
    return { applicationNotes: trimmed, crossReferences: [] };
  }
  const notes = trimmed.slice(0, markerIndex).trim();
  const codesRaw = trimmed.slice(markerIndex + marker.length);
  const crossReferences = codesRaw
    .split("/")
    .map((c) => c.trim())
    .filter(Boolean)
    .map((code) => ({ brand: "DINTEC (equivalente)", code }));
  return { applicationNotes: notes || undefined, crossReferences };
}
```

Rodar `bun run test src/features/dintec-import/engine/aplicacaoParser.test.ts` até passar.

- [ ] **Step 5: Teste de `extractCrossReferences`**

Extrai as referências cruzadas de marca-concorrente das planilhas UFI/Turbo Filtros — uma coluna por marca, célula não-vazia vira uma entrada. Reaproveitado pela Task 7 (antes vivia inline no script; virou engine testado pra cobrir o item 3 de "Testes" da spec).

```typescript
// src/features/dintec-import/engine/crossReferenceExtractor.test.ts
import { describe, expect, it } from "vitest";
import { extractCrossReferences } from "./crossReferenceExtractor";

describe("extractCrossReferences", () => {
  const brands = ["Mann", "Hengst", "Mahle"];

  it("reads one column per brand, skipping empty/dash cells", () => {
    const row = ["19.008.00", "Chave", "HU612/1X", "-", "OX382D"];
    expect(extractCrossReferences(row, brands, 2)).toEqual([
      { brand: "Mann", code: "HU612/1X" },
      { brand: "Mahle", code: "OX382D" },
    ]);
  });

  it("returns an empty array when every cross-reference cell is empty", () => {
    const row = ["19.008.00", "Chave", "", "-", ""];
    expect(extractCrossReferences(row, brands, 2)).toEqual([]);
  });

  it("returns an empty array when the row is shorter than the brand range", () => {
    const row = ["19.008.00", "Chave"];
    expect(extractCrossReferences(row, brands, 2)).toEqual([]);
  });
});
```

- [ ] **Step 6: Ver falhar, então implementar**

```typescript
// src/features/dintec-import/engine/crossReferenceExtractor.ts
import type { IPartCrossReference } from "@/shared/types";

/**
 * Reads one competitor-brand cross-reference per column, starting at
 * `start` — the layout both supplier spreadsheets use (a fixed run of
 * brand-named columns, one code per cell, `-`/blank meaning "not offered by
 * that brand"). `brands[i]` names the column at `row[start + i]`.
 */
export function extractCrossReferences(row: string[], brands: string[], start: number): IPartCrossReference[] {
  const out: IPartCrossReference[] = [];
  for (let i = 0; i < brands.length; i++) {
    const cell = (row[start + i] ?? "").trim();
    if (cell && cell !== "-") out.push({ brand: brands[i], code: cell });
  }
  return out;
}
```

Rodar `bun run test src/features/dintec-import/engine/crossReferenceExtractor.test.ts` até passar.

- [ ] **Step 7: Teste de `buildDintecPriceTables`**

```typescript
// src/features/dintec-import/engine/dintecPriceTables.test.ts
import { describe, expect, it } from "vitest";
import { buildDintecPriceTables } from "./dintecPriceTables";

describe("buildDintecPriceTables", () => {
  it("builds the 4 named tables from real DINTEC values (CODPRO 8366)", () => {
    const tables = buildDintecPriceTables({
      custo: 92.5,
      perc3: 100,
      valor3: 185.0,
      perc4: 60,
      valor4: 148.0,
      perc5: 80,
      valor5: 166.5,
      perc2: 140,
    });
    expect(tables).toEqual([
      { id: "oficina", label: "Oficina", markupPercent: 1.0, price: 185.0 },
      { id: "atacado", label: "Atacado", markupPercent: 0.6, price: 148.0 },
      { id: "varejo", label: "Varejo", markupPercent: 0.8, price: 166.5 },
      { id: "ecommerce", label: "Ecommerce", markupPercent: 1.4, price: 222.0 },
    ]);
  });

  it("omits tables whose VALOR is null/zero", () => {
    const tables = buildDintecPriceTables({
      custo: 24.73,
      perc3: null,
      valor3: null,
      perc4: null,
      valor4: null,
      perc5: 80,
      valor5: 44.51,
      perc2: 140,
    });
    expect(tables).toEqual([
      { id: "varejo", label: "Varejo", markupPercent: 0.8, price: 44.51 },
      { id: "ecommerce", label: "Ecommerce", markupPercent: 1.4, price: Number((24.73 * 2.4).toFixed(2)) },
    ]);
  });

  it("returns an empty array when custo is null", () => {
    expect(
      buildDintecPriceTables({ custo: null, perc3: 100, valor3: 185, perc4: null, valor4: null, perc5: null, valor5: null, perc2: 140 }),
    ).toEqual([]);
  });
});
```

- [ ] **Step 8: Ver falhar, então implementar**

```typescript
// src/features/dintec-import/engine/dintecPriceTables.ts
import type { IPriceTable } from "@/shared/types";

interface DintecPriceInput {
  custo: number | null;
  perc3: number | null;
  valor3: number | null;
  perc4: number | null;
  valor4: number | null;
  perc5: number | null;
  valor5: number | null;
  /** ECOMMERCE's markup is fixed company-wide and not persisted as its own
   *  VALOR column — DINTEC computes it live from CUSTO × (1 + PERC2/100). */
  perc2: number | null;
}

/**
 * Maps DINTEC's 3 persisted price tiers (VALOR3=Oficina, VALOR4=Atacado,
 * VALOR5=Varejo — confirmed against a real "Cadastro de Valores do Produto"
 * screen) plus the computed Ecommerce tier into GALLO's `IPriceTable[]`.
 * `markupPercent` is DINTEC's PERC column divided by 100 (DINTEC stores
 * percentage points, GALLO stores a 0..1 fraction — see the ABC-share bug
 * this exact convention mismatch caused in the customer BI fallback).
 */
export function buildDintecPriceTables(input: DintecPriceInput): IPriceTable[] {
  if (input.custo == null || input.custo <= 0) return [];
  const tables: IPriceTable[] = [];
  if (input.perc3 != null && input.valor3 != null && input.valor3 > 0) {
    tables.push({ id: "oficina", label: "Oficina", markupPercent: input.perc3 / 100, price: input.valor3 });
  }
  if (input.perc4 != null && input.valor4 != null && input.valor4 > 0) {
    tables.push({ id: "atacado", label: "Atacado", markupPercent: input.perc4 / 100, price: input.valor4 });
  }
  if (input.perc5 != null && input.valor5 != null && input.valor5 > 0) {
    tables.push({ id: "varejo", label: "Varejo", markupPercent: input.perc5 / 100, price: input.valor5 });
  }
  if (input.perc2 != null) {
    const price = Number((input.custo * (1 + input.perc2 / 100)).toFixed(2));
    tables.push({ id: "ecommerce", label: "Ecommerce", markupPercent: input.perc2 / 100, price });
  }
  return tables;
}
```

Rodar `bun run test src/features/dintec-import/engine/dintecPriceTables.test.ts` até passar.

- [ ] **Step 9: Atualizar o barrel**

```typescript
// src/features/dintec-import/engine/index.ts
export { normalizePhoneKey } from "./phoneKey";
export { resolveCustomerType, type DintecCustomerType } from "./customerType";
export { fillIfEmpty } from "./fillIfEmpty";
export { normalizeVehicleBrandModel, type VehicleBrandModel } from "./vehicleNormalize";
export { pickBestCodcliByLtv, type AmbiguousCandidate } from "./ambiguousTiebreak";
export { readZipEntry, listZipEntries } from "./xlsxZip";
export { colLettersToIndex, parseSharedStrings, parseSheetRows, loadXlsxSheet } from "./xlsxParser";
export { buildDintecPriceTables } from "./dintecPriceTables";
export { parseAplicacaoText } from "./aplicacaoParser";
export { titleCaseName } from "./titleCase";
export { extractCrossReferences } from "./crossReferenceExtractor";
```

- [ ] **Step 10: Rodar a suíte inteira e commitar**

```bash
bun run test
```

```bash
git add src/features/dintec-import/engine/dintecPriceTables.ts src/features/dintec-import/engine/dintecPriceTables.test.ts src/features/dintec-import/engine/aplicacaoParser.ts src/features/dintec-import/engine/aplicacaoParser.test.ts src/features/dintec-import/engine/titleCase.ts src/features/dintec-import/engine/titleCase.test.ts src/features/dintec-import/engine/crossReferenceExtractor.ts src/features/dintec-import/engine/crossReferenceExtractor.test.ts src/features/dintec-import/engine/index.ts
git commit -m "feat: add price-table, application-text, title-case and cross-reference engines for product import"
```

---

### Task 5: Export SQL do Firebird (produtos identificáveis)

**Files:**
- Create: `scripts/dintec-import/sql/export-parts-full-fields.sql`

**Interfaces:**
- Produces: CSV bruto em `scratchpad/dintec-parts-raw.txt` (via `OUTPUT` do isql) — consumido manualmente pelo Passo B (pós-processamento) descrito no Step 3, gerando `scratchpad/dintec-parts.csv`, que a Task 6 lê.

- [ ] **Step 1: Escrever o SQL de export**

Segue a técnica de `docs/db/GUIA-BANCO-TURBO-DIESEL.md` §7 (linha bruta delimitada por `;`, aspas escapadas, sem CR/LF). Escopo: 2.514 produtos ativos identificáveis (`REFERENCIA` OU `PRODUTOECOMMERCE.DESCRICAO` preenchidos).

```sql
-- scripts/dintec-import/sql/export-parts-full-fields.sql
-- Export dos produtos DINTEC ativos e identificáveis (REFERENCIA ou
-- PRODUTOECOMMERCE.DESCRICAO preenchidos) para CSV bruto delimitado por ';'.
-- Rodar via isql embedded (ver docs/db/GUIA-BANCO-TURBO-DIESEL.md §3):
--   isql.exe -user SYSDBA -password masterkey -ch WIN1252 -i export-parts-full-fields.sql "D:\claude\dintec\TURBO_DIESEL.FDB"
SET HEADING OFF;
OUTPUT 'D:\claude\gallo-basediesel\.claude\worktrees\dintec-import-pilot\scratchpad\dintec-parts-raw.txt';
SELECT CAST(
  CAST(p.CODPRO AS VARCHAR(10)) || ';' ||
  '"' || COALESCE(REPLACE(REPLACE(REPLACE(TRIM(p.REFERENCIA),'"','""'),ASCII_CHAR(13),' '),ASCII_CHAR(10),' '),'') || '";' ||
  '"' || COALESCE(REPLACE(REPLACE(REPLACE(TRIM(p.MARCA),'"','""'),ASCII_CHAR(13),' '),ASCII_CHAR(10),' '),'') || '";' ||
  '"' || COALESCE(REPLACE(REPLACE(REPLACE(TRIM(e.DESCRICAO),'"','""'),ASCII_CHAR(13),' '),ASCII_CHAR(10),' '),'') || '";' ||
  '"' || COALESCE(REPLACE(REPLACE(REPLACE(TRIM(g.NOME),'"','""'),ASCII_CHAR(13),' '),ASCII_CHAR(10),' '),'') || '";' ||
  COALESCE(CAST(CAST(p.CUSTO AS NUMERIC(15,4)) AS VARCHAR(20)),'') || ';' ||
  COALESCE(CAST(CAST(p.VALOR3 AS NUMERIC(15,4)) AS VARCHAR(20)),'') || ';' ||
  COALESCE(CAST(CAST(p.PERC3 AS NUMERIC(15,4)) AS VARCHAR(20)),'') || ';' ||
  COALESCE(CAST(CAST(p.VALOR4 AS NUMERIC(15,4)) AS VARCHAR(20)),'') || ';' ||
  COALESCE(CAST(CAST(p.PERC4 AS NUMERIC(15,4)) AS VARCHAR(20)),'') || ';' ||
  COALESCE(CAST(CAST(p.VALOR5 AS NUMERIC(15,4)) AS VARCHAR(20)),'') || ';' ||
  COALESCE(CAST(CAST(p.PERC5 AS NUMERIC(15,4)) AS VARCHAR(20)),'') || ';' ||
  COALESCE(CAST(CAST(p.PERC2 AS NUMERIC(15,4)) AS VARCHAR(20)),'') || ';' ||
  '"' || COALESCE(REPLACE(REPLACE(REPLACE(TRIM(p.NCM),'"','""'),ASCII_CHAR(13),' '),ASCII_CHAR(10),' '),'') || '";' ||
  COALESCE(CAST(CAST(p.ICMS AS NUMERIC(7,2)) AS VARCHAR(10)),'') || ';' ||
  (CASE WHEN p.TIPOSUBST = 1 THEN '1' WHEN p.TIPOSUBST = 0 THEN '0' ELSE '' END) || ';' ||
  '"' || COALESCE(REPLACE(REPLACE(REPLACE(TRIM(CAST(p.ORIGEM_MERC AS VARCHAR(10))),'"','""'),ASCII_CHAR(13),' '),ASCII_CHAR(10),' '),'') || '";' ||
  COALESCE(CAST(CAST(p.PESO AS NUMERIC(15,4)) AS VARCHAR(20)),'') || ';' ||
  COALESCE(CAST(CAST(p.ESTMINIMO AS NUMERIC(15,4)) AS VARCHAR(20)),'') || ';' ||
  COALESCE(CAST(CAST(p.ESTMAXIMO AS NUMERIC(15,4)) AS VARCHAR(20)),'') || ';' ||
  '"' || COALESCE(REPLACE(REPLACE(REPLACE(TRIM(p.APLICACAO),'"','""'),ASCII_CHAR(13),' '),ASCII_CHAR(10),' '),'') || '";' ||
  '"' || COALESCE(REPLACE(REPLACE(REPLACE(TRIM(f.NOME),'"','""'),ASCII_CHAR(13),' '),ASCII_CHAR(10),' '),'') || '"'
AS VARCHAR(3000)) AS LINHA
FROM PRODUTO p
LEFT JOIN GRUPO g ON g.COD = p.CODGRUPO
LEFT JOIN PRODUTOECOMMERCE e ON e.CODPRO = p.CODPRO
LEFT JOIN (
  -- Um fornecedor por produto (o primeiro vínculo válido) — PRODUTOFORNECEDOR
  -- tem CODPRO sujo em parte das linhas (ex.: "537/1"); CAST falha vira NULL
  -- via WHEN/THEN em vez de derrubar a query inteira.
  SELECT pf.CODPRO, MIN(pf.CODFORNEC) AS CODFORNEC
  FROM PRODUTOFORNECEDOR pf
  WHERE pf.CODPRO IS NOT NULL
  GROUP BY pf.CODPRO
) pfmin ON pfmin.CODPRO = p.CODPRO
LEFT JOIN FORNECEDOR f ON f.COD = pfmin.CODFORNEC
WHERE p.ATIVO = 'SIM'
  AND (CHAR_LENGTH(TRIM(COALESCE(p.REFERENCIA,''))) > 0 OR CHAR_LENGTH(TRIM(COALESCE(e.DESCRICAO,''))) > 0)
ORDER BY p.CODPRO;
OUTPUT;
```

**Nota:** `PRODUTOFORNECEDOR.CODPRO` sujo (ex.: `"537/1"`) quebra um `JOIN` direto por tipo incompatível em alguns clients — o subselect `pfmin` agrupa por `CODPRO` como está (o Firebird compara texto-como-texto aqui, sem CAST explícito, então linhas com valor sujo simplesmente não têm `CODPRO` igual ao inteiro de `PRODUTO.CODPRO` e ficam de fora do `JOIN`, sem erro). Validar com uma rodada real antes do Step 3 abaixo — se `isql` reportar erro de conversão, trocar o `LEFT JOIN` do subselect por `CAST(pf.CODPRO AS INTEGER)` dentro de um `CASE WHEN pf.CODPRO SIMILAR TO '[0-9]+' THEN CAST(pf.CODPRO AS INTEGER) END`.

- [ ] **Step 2: Rodar contra a cópia local do Firebird**

```bash
FIREBIRD="/c/Program Files (x86)/Firebird/Firebird_4_0_FarolTI"
"$FIREBIRD/isql.exe" -user SYSDBA -password masterkey -ch WIN1252 \
  -i "scripts/dintec-import/sql/export-parts-full-fields.sql" "D:\\claude\\dintec\\TURBO_DIESEL.FDB"
```

Esperado: `scratchpad/dintec-parts-raw.txt` com ~2.514 linhas.

- [ ] **Step 3: Pós-processar em CSV UTF-8**

Mesmo padrão do §7 do guia — remove padding do isql, adiciona cabeçalho, converte pra UTF-8 com BOM:

```powershell
$raw = "scratchpad/dintec-parts-raw.txt"
$out = "scratchpad/dintec-parts.csv"
$header = "codpro;referencia;marca;descricaoEcommerce;grupoNome;custo;valor3;perc3;valor4;perc4;valor5;perc5;perc2;ncm;icms;tipoSubst;origemMerc;peso;estMinimo;estMaximo;aplicacao;fornecedorNome"
$enc1252 = [System.Text.Encoding]::GetEncoding(1252)
$lines = [System.IO.File]::ReadAllLines($raw, $enc1252)
$clean = $lines | ForEach-Object { $_.TrimEnd() } | Where-Object { $_ -ne '' }
$final = ,$header + $clean
$utf8Bom = New-Object System.Text.UTF8Encoding($true)
[System.IO.File]::WriteAllLines($out, $final, $utf8Bom)
```

- [ ] **Step 4: Conferir**

Abrir `scratchpad/dintec-parts.csv`, checar ~2.514 linhas + cabeçalho, sem padding sobrando, acentos corretos.

---

### Task 6: `run-parts-dintec-import.ts` (track Firebird)

**Files:**
- Create: `scripts/dintec-import/run-parts-dintec-import.ts`

**Interfaces:**
- Consumes: `scratchpad/dintec-parts.csv` (Task 5), `fillIfEmpty`/`buildDintecPriceTables`/`parseAplicacaoText` (Tasks 3/4).
- Produces: cria `parts` novos com `dintec_codpro`/`dintec_synced_at`/`catalog_source='dintec_erp'` preenchidos. Idempotente — nunca cria duas vezes o mesmo `CODPRO`.

- [ ] **Step 1: Escrever o script**

```typescript
// scripts/dintec-import/run-parts-dintec-import.ts
// Cria produtos a partir do export do Firebird DINTEC (Task 5) — só CRIA,
// nunca enriquece (nenhum produto DINTEC pré-existe na plataforma; ver
// design spec 2026-07-13, Fonte 1). Idempotente por dintec_codpro.
//
// Dry-run (zero escrita, só relatório):
//   DINTEC_DRY_RUN=yes bun run scripts/dintec-import/run-parts-dintec-import.ts
// Escrita real:
//   DINTEC_CONFIRM_WRITE=yes bun run scripts/dintec-import/run-parts-dintec-import.ts
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { buildDintecPriceTables, parseAplicacaoText } from "../../src/features/dintec-import/engine";

const DRY_RUN = process.env.DINTEC_DRY_RUN === "yes";
if (!DRY_RUN && process.env.DINTEC_CONFIRM_WRITE !== "yes") {
  throw new Error(
    "Trava de segurança: rode com DINTEC_DRY_RUN=yes (simulação) ou DINTEC_CONFIRM_WRITE=yes (escrita real).",
  );
}

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !KEY) {
  throw new Error("Faltam VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY em .env.local");
}
const sb = createClient(SUPABASE_URL, KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const ROOT = join(import.meta.dir, "..", "..");
const SCRATCHPAD = join(ROOT, "scratchpad");
const STORE_ID = "00000000-0000-0000-0000-000000000001";

interface DintecPartRow {
  codpro: string;
  referencia: string;
  marca: string;
  descricaoEcommerce: string;
  grupoNome: string;
  custo: string;
  valor3: string;
  perc3: string;
  valor4: string;
  perc4: string;
  valor5: string;
  perc5: string;
  perc2: string;
  ncm: string;
  icms: string;
  tipoSubst: string;
  origemMerc: string;
  peso: string;
  estMinimo: string;
  estMaximo: string;
  aplicacao: string;
  fornecedorNome: string;
}

function parseCsvLine(line: string): string[] {
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

function readLines(path: string): string[] {
  return readFileSync(path, "utf8")
    .replace(/^﻿/, "")
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+$/, ""))
    .filter(Boolean);
}

function loadDintecParts(path: string): DintecPartRow[] {
  const lines = readLines(path);
  lines.shift();
  return lines.map((line) => {
    const c = parseCsvLine(line);
    return {
      codpro: c[0],
      referencia: c[1] || "",
      marca: c[2] || "",
      descricaoEcommerce: c[3] || "",
      grupoNome: c[4] || "",
      custo: c[5] || "",
      valor3: c[6] || "",
      perc3: c[7] || "",
      valor4: c[8] || "",
      perc4: c[9] || "",
      valor5: c[10] || "",
      perc5: c[11] || "",
      perc2: c[12] || "",
      ncm: c[13] || "",
      icms: c[14] || "",
      tipoSubst: c[15] || "",
      origemMerc: c[16] || "",
      peso: c[17] || "",
      estMinimo: c[18] || "",
      estMaximo: c[19] || "",
      aplicacao: c[20] || "",
      fornecedorNome: c[21] || "",
    };
  });
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function numOrNull(s: string): number | null {
  if (!s.trim()) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function textOrNull(s: string): string | null {
  const t = s.trim();
  return t ? t : null;
}

/** Builds the display name — same chain used everywhere else in this import
 *  epic: prefer the richer source, fall back gracefully. Never empty because
 *  this script's Firebird scope is already filtered to rows that have one. */
function buildName(row: DintecPartRow): string {
  const ref = textOrNull(row.referencia);
  const marca = textOrNull(row.marca);
  if (ref && marca) return `${ref} — ${marca}`;
  if (ref) return ref;
  const desc = textOrNull(row.descricaoEcommerce);
  if (desc) return desc;
  throw new Error(`CODPRO ${row.codpro} sem referencia nem descricao — fora do escopo do export`);
}

async function main() {
  const syncedAt = new Date().toISOString();
  console.log(`Import DINTEC de produtos — modo: ${DRY_RUN ? "DRY-RUN (zero escrita)" : "ESCRITA REAL"}`);

  const rows = loadDintecParts(join(SCRATCHPAD, "dintec-parts.csv"));
  console.log(`CSV: ${rows.length} produtos DINTEC identificáveis`);

  // Idempotency anchor: every CODPRO already imported is skipped — paginado,
  // mesma proteção do limite de 1000 linhas do PostgREST usada no import de
  // clientes (run-full-import.ts).
  const alreadyImported = new Set<number>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb
      .from("parts")
      .select("dintec_codpro")
      .not("dintec_codpro", "is", null)
      .order("dintec_codpro")
      .range(from, from + 999);
    if (error) throw error;
    for (const r of (data ?? []) as Array<{ dintec_codpro: number }>) alreadyImported.add(r.dintec_codpro);
    if (!data || data.length < 1000) break;
  }
  const { count: anchorCount, error: anchorCountError } = await sb
    .from("parts")
    .select("dintec_codpro", { count: "exact", head: true })
    .not("dintec_codpro", "is", null);
  if (anchorCountError) throw anchorCountError;
  if ((anchorCount ?? 0) !== alreadyImported.size) {
    throw new Error(`Âncora de idempotência inconsistente: count=${anchorCount} vs paginado=${alreadyImported.size}`);
  }
  console.log(`Já importados (pulados): ${alreadyImported.size}`);

  const toCreate = rows.filter((r) => !alreadyImported.has(Number(r.codpro)));
  console.log(`A criar: ${toCreate.length}`);

  if (DRY_RUN) {
    const summary = [
      "# Import DINTEC de produtos — DRY-RUN (zero escrita)",
      "",
      `- Produtos no export: ${rows.length}`,
      `- Já importados (pulados): ${alreadyImported.size}`,
      `- A criar: ${toCreate.length}`,
    ].join("\n");
    writeFileSync(join(SCRATCHPAD, "dintec-parts-dryrun.md"), summary, "utf8");
    console.log(summary);
    return;
  }

  // ===== WRITE MODE =====
  const createRows: Array<Record<string, unknown>> = [];
  for (const row of toCreate) {
    const custo = numOrNull(row.custo);
    const priceTables = buildDintecPriceTables({
      custo,
      perc3: numOrNull(row.perc3),
      valor3: numOrNull(row.valor3),
      perc4: numOrNull(row.perc4),
      valor4: numOrNull(row.valor4),
      perc5: numOrNull(row.perc5),
      valor5: numOrNull(row.valor5),
      perc2: numOrNull(row.perc2),
    });
    const unitPrice = priceTables.find((t) => t.id === "varejo")?.price ?? custo ?? 0;
    const unitCost = custo ?? 0;
    const { applicationNotes, crossReferences } = parseAplicacaoText(row.aplicacao);
    const supplier = textOrNull(row.fornecedorNome) ?? "Não informado";
    const fiscal: Record<string, unknown> = {};
    const ncm = textOrNull(row.ncm);
    if (ncm) fiscal.ncm = ncm;
    const icms = numOrNull(row.icms);
    if (icms != null) fiscal.icmsPercent = icms;
    if (row.tipoSubst === "1") fiscal.taxSubstitution = true;
    else if (row.tipoSubst === "0") fiscal.taxSubstitution = false;
    const origem = textOrNull(row.origemMerc);
    if (origem) fiscal.origin = origem;

    createRows.push({
      // sem `id` — `parts.id` é uuid com default gen_random_uuid(), não text
      // "part-..." (isso era só a convenção do gerador mock, não da tabela real).
      sku: row.codpro,
      name: buildName(row),
      oem_codes: [],
      equivalent_part_ids: [],
      cross_references: crossReferences.length > 0 ? crossReferences : null,
      application_notes: applicationNotes ?? null,
      applications: [],
      brand: textOrNull(row.marca) ?? "Não informado",
      supplier,
      // category fica null de propósito: PartCategory é o enum fechado de 10
      // valores do extrator por palavra-chave (PRD-021), GRUPO.NOME não mapeia
      // 1:1 nele — vai só em subcategory/group_label (ver design spec, Fonte 1).
      category: null,
      subcategory: textOrNull(row.grupoNome),
      reference: textOrNull(row.referencia),
      group_label: textOrNull(row.grupoNome),
      price_tables: priceTables.length > 0 ? priceTables : null,
      fiscal: Object.keys(fiscal).length > 0 ? fiscal : null,
      weight_kg: numOrNull(row.peso),
      unit_cost: unitCost,
      unit_price: unitPrice,
      margin_percent: unitCost > 0 ? Number(((unitPrice - unitCost) / unitCost).toFixed(4)) : 0,
      stock_available: 0,
      stock_minimum: numOrNull(row.estMinimo) ?? 0,
      division: "parts",
      active: true,
      store_id: STORE_ID,
      dintec_codpro: Number(row.codpro),
      dintec_synced_at: syncedAt,
      catalog_source: "dintec_erp",
    });
  }

  let createdDone = 0;
  for (const part of chunk(createRows, 100)) {
    const { error } = await sb.from("parts").insert(part);
    if (error) throw error;
    createdDone += part.length;
    console.log(`criados: ${createdDone}/${createRows.length}`);
  }

  const summary = [
    "# Import DINTEC de produtos — ESCRITA REAL concluída",
    "",
    `- synced_at do lote: ${syncedAt}`,
    `- Criados: ${createdDone}`,
    `- Já importados (pulados): ${alreadyImported.size}`,
    "",
    "Rollback do lote:",
    `delete from parts where dintec_synced_at = '${syncedAt}';`,
  ].join("\n");
  writeFileSync(join(SCRATCHPAD, "dintec-parts-import-report.md"), summary, "utf8");
  console.log(summary);
}

main().catch((e) => {
  console.error("IMPORT DINTEC DE PRODUTOS FALHOU:", e.message);
  process.exit(1);
});
```

- [ ] **Step 2: Rodar dry-run e conferir**

```bash
DINTEC_DRY_RUN=yes bun run scripts/dintec-import/run-parts-dintec-import.ts
```

Esperado: `A criar: ~2514` (0 já importados na primeira rodada).

- [ ] **Step 3: Rodar escrita real (só após OK do dono)**

```bash
DINTEC_CONFIRM_WRITE=yes bun run scripts/dintec-import/run-parts-dintec-import.ts
```

- [ ] **Step 4: Verificar idempotência — rodar de novo**

```bash
DINTEC_CONFIRM_WRITE=yes bun run scripts/dintec-import/run-parts-dintec-import.ts
```

Esperado: `A criar: 0` (segunda rodada não duplica nada).

- [ ] **Step 5: Verificar no banco**

```sql
select count(*) from public.parts where catalog_source = 'dintec_erp'; -- esperado ~2514
select count(*) from public.parts where dintec_codpro is not null; -- mesmo número
```

---

### Task 7: `run-parts-supplier-sync.ts` (tracks UFI + Turbo Filtros)

**Files:**
- Create: `scripts/dintec-import/run-parts-supplier-sync.ts`

**Interfaces:**
- Consumes: `docs/export/2024.11.14 Cotação Turbo Diesel UFI.xlsx`, `docs/export/APLICAÇÃO JAN-2025 TURBO FILTROS.xlsx`, `loadXlsxSheet`/`fillIfEmpty`/`titleCaseName`/`parseAplicacaoText`/`extractCrossReferences` (Tasks 3/4).
- Produces: enriquece os 151 `parts` reais existentes (nunca sobrescreve campo já preenchido) + cria os produtos UFI `Comprou?=SIM` ainda ausentes + backfill de `catalog_source` nos 151.

- [ ] **Step 1: Escrever o script**

```typescript
// scripts/dintec-import/run-parts-supplier-sync.ts
// Enriquece os produtos reais existentes (SKU sem prefixo GAL-, vindos das
// planilhas UFI/Turbo Filtros) com os campos que o seed original perdeu
// (código de barras, cross-references, fiscal, aplicação) e cria os
// produtos UFI "Comprou?=SIM" que ainda não estão na base. Nunca sobrescreve
// um campo já preenchido (fillIfEmpty). Ver design spec 2026-07-13, Fontes 2/3.
//
// Dry-run (zero escrita, só relatório):
//   DINTEC_DRY_RUN=yes bun run scripts/dintec-import/run-parts-supplier-sync.ts
// Escrita real:
//   DINTEC_CONFIRM_WRITE=yes bun run scripts/dintec-import/run-parts-supplier-sync.ts
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import type { IPartCrossReference } from "../../src/shared/types";
import {
  fillIfEmpty,
  loadXlsxSheet,
  titleCaseName,
  parseAplicacaoText,
  extractCrossReferences,
} from "../../src/features/dintec-import/engine";

const DRY_RUN = process.env.DINTEC_DRY_RUN === "yes";
if (!DRY_RUN && process.env.DINTEC_CONFIRM_WRITE !== "yes") {
  throw new Error(
    "Trava de segurança: rode com DINTEC_DRY_RUN=yes (simulação) ou DINTEC_CONFIRM_WRITE=yes (escrita real).",
  );
}

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !KEY) {
  throw new Error("Faltam VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY em .env.local");
}
const sb = createClient(SUPABASE_URL, KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const ROOT = join(import.meta.dir, "..", "..");
const SCRATCHPAD = join(ROOT, "scratchpad");
const STORE_ID = "00000000-0000-0000-0000-000000000001";

const UFI_PATH = join(ROOT, "docs", "export", "2024.11.14 Cotação Turbo Diesel UFI.xlsx");
const TF_PATH = join(ROOT, "docs", "export", "APLICAÇÃO JAN-2025 TURBO FILTROS.xlsx");

// Índices de coluna confirmados contra os arquivos reais (Task 5 do design,
// header da UFI na linha 3 0-indexed / dados a partir da linha 3; TF header
// na linha 3 0-indexed / dados a partir da linha 4).
const UFI_COL = {
  sku: 0,
  descricao: 1,
  segmento: 2,
  familia: 3,
  ncm: 7,
  codigoBarras: 12,
  pesoLiq: 13,
  aplicacao: 16,
  crossRefStart: 17, // OE
  crossRefEnd: 27, // Donaldson
  comprou: 28,
  precoComIcmsPisCofins: 29,
  precoComTudo: 30,
};
const UFI_CROSS_REF_BRANDS = [
  "OE", "Mann", "Hengst", "Mahle", "Tecfil", "Vox", "Fram", "Wega", "Fleetguard", "Parker", "Donaldson",
];

const TF_COL = {
  referencia: 0,
  descricao: 1,
  ncm: 2,
  codigoOriginal: 4,
  aplicacoes: 5,
  crossRefStart: 6, // Mann
  crossRefEnd: 17, // Baldwin
};
const TF_CROSS_REF_BRANDS = [
  "Mann", "Donaldson", "Fleetguard", "Parker", "Hengst", "Mahle", "Tecfil", "Fram", "Wega", "Vox", "JapanParts", "Baldwin",
];

function numOrNull(s: string): number | null {
  const t = s.trim();
  if (!t || t === "-") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function textOrNull(s: string): string | null {
  const t = s.trim();
  return t && t !== "-" ? t : null;
}

interface ExistingPart {
  id: string;
  sku: string;
  oem_codes: string[];
  cross_references: IPartCrossReference[] | null;
  application_notes: string | null;
  description: string | null;
  fiscal: Record<string, unknown> | null;
  weight_kg: number | null;
  catalog_source: string | null;
}

async function fetchAllRealParts(): Promise<Map<string, ExistingPart>> {
  const map = new Map<string, ExistingPart>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb
      .from("parts")
      .select("id, sku, oem_codes, cross_references, application_notes, description, fiscal, weight_kg, catalog_source")
      .not("sku", "ilike", "GAL-%")
      .order("sku")
      .range(from, from + 999);
    if (error) throw error;
    for (const row of (data ?? []) as ExistingPart[]) map.set(row.sku, row);
    if (!data || data.length < 1000) break;
  }
  return map;
}

async function main() {
  const syncedAt = new Date().toISOString();
  console.log(`Sync de planilhas de fornecedor — modo: ${DRY_RUN ? "DRY-RUN (zero escrita)" : "ESCRITA REAL"}`);

  const ufiBuf = readFileSync(UFI_PATH);
  const ufiRows = loadXlsxSheet(ufiBuf, 0).slice(3); // header nas linhas 0-2
  const ufiSim = ufiRows.filter((r) => (r[UFI_COL.comprou] ?? "").trim().toUpperCase() === "SIM" && textOrNull(r[UFI_COL.sku] ?? ""));
  console.log(`UFI: ${ufiRows.length} linhas no arquivo, ${ufiSim.length} com Comprou?=SIM`);

  const tfBuf = readFileSync(TF_PATH);
  const tfRows = loadXlsxSheet(tfBuf, 0).slice(4); // header na linha 3, dados a partir da 4
  console.log(`Turbo Filtros: ${tfRows.length} linhas no arquivo`);

  const existing = await fetchAllRealParts();
  console.log(`Parts reais existentes (sku sem GAL-): ${existing.size}`);

  // ===== Classificação =====
  const ufiBySku = new Map(ufiSim.map((r) => [textOrNull(r[UFI_COL.sku])!, r]));
  const toEnrichUfi = [...ufiBySku.entries()].filter(([sku]) => existing.has(sku));
  const toCreateUfi = [...ufiBySku.entries()].filter(([sku]) => !existing.has(sku));
  const tfBySku = new Map(
    tfRows
      .map((r) => [textOrNull(r[TF_COL.referencia]), r] as const)
      .filter((pair): pair is [string, string[]] => pair[0] !== null && existing.has(pair[0])),
  );
  console.log(
    `UFI SIM: ${toEnrichUfi.length} para enriquecer, ${toCreateUfi.length} para criar. Turbo Filtros: ${tfBySku.size} matches para enriquecer.`,
  );

  if (DRY_RUN) {
    const summary = [
      "# Sync de planilhas de fornecedor — DRY-RUN (zero escrita)",
      "",
      `- UFI Comprou=SIM no arquivo: ${ufiSim.length}`,
      `- UFI já existentes (enriquecer): ${toEnrichUfi.length}`,
      `- UFI a criar: ${toCreateUfi.length}`,
      `- Turbo Filtros matches (enriquecer): ${tfBySku.size}`,
    ].join("\n");
    writeFileSync(join(SCRATCHPAD, "parts-supplier-sync-dryrun.md"), summary, "utf8");
    console.log(summary);
    return;
  }

  // ===== WRITE MODE =====
  const backup = [...existing.values()].filter(
    (p) => toEnrichUfi.some(([sku]) => sku === p.sku) || tfBySku.has(p.sku),
  );
  writeFileSync(join(SCRATCHPAD, "parts-supplier-sync-backup.json"), JSON.stringify(backup, null, 1), "utf8");
  console.log(`Backup dos ${backup.length} produtos a enriquecer salvo.`);

  // 1) Enriquecer existentes — UFI primeiro, Turbo Filtros por cima (merge
  // aditivo: fillIfEmpty só preenche o que a rodada anterior deixou vazio).
  let enrichedCount = 0;
  for (const [sku, row] of toEnrichUfi) {
    const current = existing.get(sku)!;
    const patch: Record<string, unknown> = {};
    const barcode = textOrNull(row[UFI_COL.codigoBarras]);
    if (barcode && current.oem_codes.length === 0) patch.oem_codes = [barcode];
    const crossRefs = extractCrossReferences(row, UFI_CROSS_REF_BRANDS, UFI_COL.crossRefStart);
    if (crossRefs.length > 0 && !current.cross_references) patch.cross_references = crossRefs;
    const { applicationNotes } = parseAplicacaoText(row[UFI_COL.aplicacao] ?? "");
    const filledNotes = fillIfEmpty(current.application_notes, applicationNotes ?? null);
    if (filledNotes && filledNotes !== current.application_notes) patch.application_notes = filledNotes;
    const ncm = textOrNull(row[UFI_COL.ncm]);
    const weight = numOrNull(row[UFI_COL.pesoLiq]);
    if (weight != null && current.weight_kg == null) patch.weight_kg = weight;
    if (ncm && !current.fiscal?.ncm) {
      patch.fiscal = { ...(current.fiscal ?? {}), ncm };
    }
    if (!current.catalog_source) patch.catalog_source = "supplier_ufi";
    if (Object.keys(patch).length === 0) continue;
    patch.dintec_synced_at = syncedAt;
    const { error } = await sb.from("parts").update(patch).eq("id", current.id);
    if (error) throw error;
    enrichedCount++;
  }
  for (const [sku, row] of tfBySku) {
    const current = existing.get(sku)!;
    const patch: Record<string, unknown> = {};
    const oemCode = textOrNull(row[TF_COL.codigoOriginal]);
    if (oemCode && current.oem_codes.length === 0) patch.oem_codes = [oemCode];
    const crossRefs = extractCrossReferences(row, TF_CROSS_REF_BRANDS, TF_COL.crossRefStart);
    if (crossRefs.length > 0 && !current.cross_references) patch.cross_references = crossRefs;
    const { applicationNotes } = parseAplicacaoText(row[TF_COL.aplicacoes] ?? "");
    const filledNotes = fillIfEmpty(current.application_notes, applicationNotes ?? null);
    if (filledNotes && filledNotes !== current.application_notes) patch.application_notes = filledNotes;
    const ncm = textOrNull(row[TF_COL.ncm]);
    if (ncm && !current.fiscal?.ncm) {
      patch.fiscal = { ...(current.fiscal ?? {}), ncm };
    }
    if (!current.catalog_source && !patch.catalog_source) patch.catalog_source = "supplier_turbo_filtros";
    if (Object.keys(patch).length === 0) continue;
    patch.dintec_synced_at = syncedAt;
    const { error } = await sb.from("parts").update(patch).eq("id", current.id);
    if (error) throw error;
    enrichedCount++;
  }
  console.log(`Enriquecidos: ${enrichedCount}`);

  // 2) Criar UFI ausentes.
  const createRows = toCreateUfi.map(([sku, row]) => {
    const custo = numOrNull(row[UFI_COL.precoComIcmsPisCofins]) ?? 0;
    const unitPrice = numOrNull(row[UFI_COL.precoComTudo]) ?? custo;
    const { applicationNotes } = parseAplicacaoText(row[UFI_COL.aplicacao] ?? "");
    const crossReferences = extractCrossReferences(row, UFI_CROSS_REF_BRANDS, UFI_COL.crossRefStart);
    const barcode = textOrNull(row[UFI_COL.codigoBarras]);
    const ncm = textOrNull(row[UFI_COL.ncm]);
    return {
      // sem `id` — `parts.id` é uuid com default gen_random_uuid().
      sku,
      name: titleCaseName(row[UFI_COL.descricao] ?? sku),
      oem_codes: barcode ? [barcode] : [],
      equivalent_part_ids: [],
      cross_references: crossReferences.length > 0 ? crossReferences : null,
      application_notes: applicationNotes ?? null,
      applications: [],
      brand: "UFI",
      supplier: "UFI",
      segment: textOrNull(row[UFI_COL.segmento]),
      subcategory: textOrNull(row[UFI_COL.familia]),
      fiscal: ncm ? { ncm } : null,
      weight_kg: numOrNull(row[UFI_COL.pesoLiq]),
      unit_cost: custo,
      unit_price: unitPrice,
      margin_percent: custo > 0 ? Number(((unitPrice - custo) / custo).toFixed(4)) : 0,
      stock_available: 0,
      stock_minimum: 0,
      division: "parts",
      active: true,
      store_id: STORE_ID,
      dintec_synced_at: syncedAt,
      catalog_source: "supplier_ufi",
    };
  });
  let createdDone = 0;
  const chunkSize = 100;
  for (let i = 0; i < createRows.length; i += chunkSize) {
    const part = createRows.slice(i, i + chunkSize);
    const { error } = await sb.from("parts").insert(part);
    if (error) throw error;
    createdDone += part.length;
    console.log(`criados: ${createdDone}/${createRows.length}`);
  }

  const summary = [
    "# Sync de planilhas de fornecedor — ESCRITA REAL concluída",
    "",
    `- synced_at do lote: ${syncedAt}`,
    `- Enriquecidos: ${enrichedCount}`,
    `- Criados (UFI Comprou=SIM ausentes): ${createdDone}`,
    "",
    "Rollback do lote:",
    `- Criados: delete from parts where catalog_source='supplier_ufi' and dintec_synced_at='${syncedAt}' and dintec_codpro is null;`,
    "- Enriquecidos: restaurar campo a campo via scratchpad/parts-supplier-sync-backup.json.",
  ].join("\n");
  writeFileSync(join(SCRATCHPAD, "parts-supplier-sync-report.md"), summary, "utf8");
  console.log(summary);
}

main().catch((e) => {
  console.error("SYNC DE PLANILHAS FALHOU:", e.message);
  process.exit(1);
});
```

- [ ] **Step 2: Rodar dry-run e conferir**

```bash
DINTEC_DRY_RUN=yes bun run scripts/dintec-import/run-parts-supplier-sync.ts
```

Esperado: `UFI SIM: ~25 para enriquecer, ~113 para criar`. Se os números não baterem com o que a investigação encontrou (25/113), parar e conferir os índices de coluna (`UFI_COL`/`TF_COL`) contra o arquivo real antes de prosseguir — a estrutura da planilha pode ter linhas de cabeçalho deslocadas.

- [ ] **Step 3: Rodar escrita real (só após OK do dono)**

```bash
DINTEC_CONFIRM_WRITE=yes bun run scripts/dintec-import/run-parts-supplier-sync.ts
```

- [ ] **Step 4: Verificar**

```sql
select catalog_source, count(*) from public.parts group by catalog_source;
-- esperado aproximado: dintec_erp ~2514, supplier_ufi ~151 (25 enriquecidos + 113 criados + os que só bateram por TF ficam sem override), supplier_turbo_filtros conforme overlap, null = 0 pós-backfill
select count(*) from public.parts where oem_codes = '{}' and catalog_source in ('supplier_ufi','supplier_turbo_filtros');
-- produtos reais ainda sem código de barras/oem — esperado baixo, não zero (nem toda linha da planilha tem código de barras)
```

---

## Ordem de execução

1. Task 1 (migration) — precisa de OK do dono antes de aplicar em prod.
2. Task 2 (limpeza mock) — depende da Task 1 só para `catalog_source` existir (não é bloqueante, mas roda depois por clareza); precisa de OK do dono antes da escrita real.
3. Tasks 3 e 4 (engines) — independentes entre si e das anteriores, podem rodar em paralelo.
4. Task 5 (export SQL Firebird) — precisa de acesso à cópia local do Firebird (`D:\claude\dintec\TURBO_DIESEL.FDB`).
5. Task 6 (import DINTEC) — depende das Tasks 1, 4 e 5. Precisa de OK do dono antes da escrita real.
6. Task 7 (sync planilhas) — depende das Tasks 1, 2, 3 e 4 (roda depois da limpeza pra não enriquecer um registro que ia ser apagado). Precisa de OK do dono antes da escrita real.

Tasks 6 e 7 são independentes uma da outra (fontes sem sobreposição, confirmado no design) — podem rodar em qualquer ordem entre si, mas ambas depois da limpeza (Task 2).
