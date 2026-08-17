# Notas Fiscais de Entrada — Fase 1 (Fundação) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar toda a fundação do subsistema de notas fiscais de entrada — tipos de domínio, o motor de regras testado, o schema no banco e a camada de providers — sem nenhuma tela.

**Architecture:** Sete módulos puros em `src/features/fiscal-notes/engine/`, sem dependência de DOM nem de rede, cada um com teste Vitest próprio. Os quatro módulos que as Edge Functions vão reusar são espelhados para `supabase/functions/_shared/fiscal/` por um script de sync, no mesmo padrão dos quatro `sync-*-shared.ts` que já existem. Três migrations criam sete tabelas com RLS e o bucket privado de XML. Dois contracts novos ganham implementação mock e Supabase, expostos só pelo barrel `@/providers/data`.

**Tech Stack:** TypeScript strict · Vitest · Supabase (Postgres + RLS + Storage) · bun

**Spec:** `docs/prds/PRD-216-notas-fiscais-entrada.md`

## Global Constraints

- **Nada de UI nesta fase.** Nenhum arquivo em `components/`, `pages/`, `hooks/` da feature, nenhuma rota, nenhuma entrada em `navigation.ts`.
- **`parts.id` e `stores.id` são `uuid`.** A migration `20260608150303_create_parts_table_v2.sql` diz `text` — está obsoleta; `20260608182429_convert_reference_pks_to_uuid.sql` converteu. Confirmado contra o banco de produção em 17/08/2026. Todo FK novo usa `uuid`.
- **O engine não pode depender de DOM.** Nada de `DOMParser`, `document`, `window`. Deno não tem esses globais e quatro módulos rodam lá.
- **Helpers de RLS deste banco:** `public.current_store_id()` → `uuid`, `public.is_staff()` → `boolean`, `public.current_app_role()` → `text`. Sempre envolvidos em `(select public.fn())` — sem o wrapper o helper roda por linha em vez de uma vez por query, e isso já causou storm de `statement_timeout` neste projeto.
- **Migrations não são aplicadas por esta fase.** Os arquivos vão para `supabase/migrations/` e ficam aguardando aplicação manual com OK explícito do dono. `apply_migration` via MCP é proibido nesta fase.
- **Interfaces de domínio levam prefixo `I`.** Tipos em `src/shared/types/`, exportados pelo barrel `index.ts`.
- **Money é `number` decimal, datas são `ISO8601` string.** Nunca `Date` nos tipos de domínio (`src/shared/types/common.ts`).
- **Não copiar as chaves de acesso do ui_kit para os testes.** As quatro chaves em `nf-data.jsx` têm dígito verificador inválido — são ficção de design. As chaves válidas a usar estão na Task 1.
- **Fórmulas normativas:** RC-01 a RC-05 do PRD-216. Os testes travam contra elas.
- **Commits em inglês, Conventional Commits.** Rodapé `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- **Gate da fase:** `bun run test` verde e `bun run build` verde.

---

## File Structure

**Criados:**

| Arquivo | Responsabilidade |
|---|---|
| `src/shared/types/supplier.ts` | `ISupplier` |
| `src/shared/types/fiscal-note.ts` | `IFiscalNote`, `IFiscalNoteItem`, `IFiscalNoteDuplicate`, enums de status/origem/vínculo/conversão |
| `src/features/fiscal-notes/engine/nfeKey.ts` | chave de 44 dígitos: decomposição e DV módulo 11 |
| `src/features/fiscal-notes/engine/xml.ts` | leitor de XML sem DOM (scanner + acesso por caminho) |
| `src/features/fiscal-notes/engine/nfeParser.ts` | XML da NF-e 4.00 → `IParsedNfe` |
| `src/features/fiscal-notes/engine/costAllocation.ts` | RC-01 — rateio de frete/IPI/desconto por valor |
| `src/features/fiscal-notes/engine/unitConversion.ts` | RC-02/RC-03 — quantidade e custo na unidade de estoque |
| `src/features/fiscal-notes/engine/averageCost.ts` | RC-04 — custo médio ponderado |
| `src/features/fiscal-notes/engine/itemMatcher.ts` | RS-01 — cascata determinística de vínculo |
| `src/features/fiscal-notes/engine/analysis.ts` | RS-03 — os seis cards |
| `src/features/fiscal-notes/engine/index.ts` | barrel do engine |
| `src/features/fiscal-notes/index.ts` | barrel da feature |
| `scripts/sync-fiscal-shared.ts` | espelha 4 módulos para `_shared/fiscal/` |
| `supabase/migrations/20260817120000_fiscal_notes_schema.sql` | `suppliers`, `fiscal_notes`, `fiscal_note_items`, `fiscal_note_duplicates` + RLS |
| `supabase/migrations/20260817120100_fiscal_learning_tables.sql` | `supplier_part_codes`, `supplier_conversion_rules`, `fiscal_note_ingestion_queue` + RLS |
| `supabase/migrations/20260817120200_fiscal_xml_bucket.sql` | bucket privado `fiscal-xml` + policies |
| `src/providers/data/contracts/suppliers.ts` | `ISuppliersProvider` |
| `src/providers/data/contracts/fiscalNotes.ts` | `IFiscalNotesProvider` |
| `src/providers/data/impl/mock/suppliers.ts` · `fiscalNotes.ts` | implementação mock |
| `src/providers/data/impl/supabase/suppliers.ts` · `fiscalNotes.ts` | implementação Supabase |
| `src/providers/data/hooks/useSuppliersProvider.ts` · `useFiscalNotesProvider.ts` | hooks |

**Modificados:** `src/shared/types/index.ts` (barrel) · `src/providers/data/contracts/index.ts` · `src/providers/data/factory.ts` · `src/providers/data/index.ts` · `package.json` (script `sync:fiscal`)

> Sobre a contagem: o PRD-216 fala em "sete migrations". São **sete tabelas** em **três migrations** — agrupar o schema relacionado num arquivo é mais seguro que sete aplicações manuais independentes. O conteúdo é o mesmo.

---

### Task 1: Tipos de domínio e validação da chave de acesso

**Files:**
- Create: `src/shared/types/supplier.ts`
- Create: `src/shared/types/fiscal-note.ts`
- Modify: `src/shared/types/index.ts`
- Create: `src/features/fiscal-notes/engine/nfeKey.ts`
- Test: `src/features/fiscal-notes/engine/nfeKey.test.ts`

**Interfaces:**
- Consumes: `ID`, `ISO8601`, `Money`, `Division` de `@/shared/types/common`
- Produces: `ISupplier`, `IFiscalNote`, `IFiscalNoteItem`, `IFiscalNoteDuplicate`, `FiscalNoteStatus`, `FiscalNoteOrigin`, `ItemLinkMode`, `ItemConversionMode`, `IngestionSource` · `computeNfeKeyCheckDigit(first43: string): number`, `parseNfeKey(key: string): INfeKeyParts | null`, `isValidNfeKey(key: string): boolean`

- [ ] **Step 1: Escrever os tipos de fornecedor**

`src/shared/types/supplier.ts`:

```ts
import type { ID, ISO8601 } from "./common";

/**
 * Fornecedor de mercadoria (PRD-216).
 *
 * Nasce de duas formas: cadastrado à mão ou criado automaticamente do bloco
 * `<emit>` de um XML de NF-e. No segundo caso `createdFromXml` é `true` e
 * `contactName`/`contactEmail`/`category` ficam vazios de propósito — esses
 * campos não vêm no XML e inventá-los seria pior que deixá-los em branco.
 */
export interface ISupplier {
  id: ID;
  storeId: ID;
  /** Só dígitos, 14 posições. Chave de vínculo na importação. */
  cnpj: string;
  corporateName: string;
  tradeName?: string;
  /** Inscrição estadual. */
  stateRegistration?: string;
  address?: string;
  /** Condição de pagamento sugerida, lida das duplicatas (ex.: "30/60/90"). */
  paymentTerms?: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  category?: string;
  active: boolean;
  /** `true` quando o cadastro veio do bloco `<emit>` de um XML. */
  createdFromXml: boolean;
  createdAt: ISO8601;
  updatedAt: ISO8601;
}
```

- [ ] **Step 2: Escrever os tipos da nota**

`src/shared/types/fiscal-note.ts`:

```ts
import type { Division, ID, ISO8601, Money } from "./common";

/** Ciclo da nota. `lancada` é terminal — corrigir é estornar. */
export type FiscalNoteStatus = "conferencia" | "lancada" | "cancelada";

/** Por onde o XML entrou. `manual` é reservado, sem produtor na Fase 1. */
export type FiscalNoteOrigin = "upload" | "upload_edge" | "email" | "sefaz" | "manual";

/** Origem de ingestão na fila. Espelha `FiscalNoteOrigin` menos `manual`. */
export type IngestionSource = "upload" | "upload_edge" | "email" | "sefaz";

/** Estado do vínculo entre o item da nota e o catálogo. */
export type ItemLinkMode = "auto" | "ia" | "novo" | "pend";

/** Como a unidade da nota vira unidade de estoque. */
export type ItemConversionMode = "direto" | "conv" | "frac";

/** Duplicata lida do XML. Vira título no contas a pagar em PRD futuro. */
export interface IFiscalNoteDuplicate {
  id: ID;
  number: string;
  dueDate: ISO8601;
  amount: Money;
}

/** Rascunho de peça nova, preenchido na conferência e materializado no lançamento. */
export interface INewPartDraft {
  name: string;
  unitOfMeasure: string;
}

/**
 * Item da nota. Os campos até `totalValue` são o que veio no XML e nunca mudam;
 * o resto são as decisões da conferência.
 */
export interface IFiscalNoteItem {
  id: ID;
  noteId: ID;
  seq: number;
  /** `cProd` — código do produto no fornecedor. */
  supplierCode: string;
  description: string;
  ncm?: string;
  cfop?: string;
  ean?: string;
  /** `uCom` — unidade comercial da nota (CX, PCT, BD, TB, UN…). */
  unit: string;
  quantity: number;
  unitValue: Money;
  totalValue: Money;

  linkMode: ItemLinkMode;
  partId?: ID;
  newPartDraft?: INewPartDraft;

  conversionMode: ItemConversionMode;
  /** Unidades por embalagem (`conv`) ou rendimento (`frac`). `null` bloqueia o lançamento. */
  conversionFactor: number | null;
  conversionUnit?: string;
  /** SKU de destino quando `conversionMode === 'frac'`. */
  conversionTargetPartId?: ID;

  /** 0–100. Presente apenas quando `linkMode === 'ia'`. */
  aiConfidence?: number;
  /** Evidência escrita da sugestão, mostrada ao conferente. */
  aiEvidence?: string;
  /** Aviso não bloqueante (ex.: NCM divergente do cadastro). */
  alert?: string;

  confirmed: boolean;
}

/** Nota fiscal de entrada. */
export interface IFiscalNote {
  id: ID;
  storeId: ID;
  /** 44 dígitos. Unique — é o que impede o mesmo XML entrar duas vezes. */
  accessKey: string;
  number: string;
  series: string;
  supplierId: ID;
  issuedAt: ISO8601;
  enteredAt: ISO8601;
  status: FiscalNoteStatus;
  origin: FiscalNoteOrigin;

  freight: Money;
  ipi: Money;
  discount: Money;
  productsTotal: Money;
  total: Money;

  items: IFiscalNoteItem[];
  duplicates: IFiscalNoteDuplicate[];

  /** Caminho do XML original no bucket privado `fiscal-xml`. */
  xmlPath?: string;

  postedAt?: ISO8601;
  postedBy?: ID;

  division: Division;
  createdAt: ISO8601;
  updatedAt: ISO8601;
}
```

- [ ] **Step 3: Exportar pelo barrel**

Em `src/shared/types/index.ts`, acrescentar junto às outras reexportações:

```ts
export * from "./supplier";
export * from "./fiscal-note";
```

- [ ] **Step 4: Escrever o teste da chave (vai falhar)**

`src/features/fiscal-notes/engine/nfeKey.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { computeNfeKeyCheckDigit, isValidNfeKey, parseNfeKey } from "./nfeKey";

// Chaves com DV recalculado. As chaves do ui_kit (nf-data.jsx) têm dígito
// verificador INVÁLIDO — são ficção de design. Não copiar de lá.
const DIESELTEC = "35260804887213000190550010000301291000301298";
const BOSCH = "35260845990181000189550030000412551000412558";

describe("computeNfeKeyCheckDigit", () => {
  it("computes the module-11 check digit over the first 43 digits", () => {
    expect(computeNfeKeyCheckDigit(DIESELTEC.slice(0, 43))).toBe(8);
    expect(computeNfeKeyCheckDigit(BOSCH.slice(0, 43))).toBe(8);
  });

  it("returns 0 when the remainder is 0 or 1", () => {
    // 43 zeros: sum = 0, rest = 0 → DV 0
    expect(computeNfeKeyCheckDigit("0".repeat(43))).toBe(0);
  });
});

describe("isValidNfeKey", () => {
  it("accepts a well-formed key", () => {
    expect(isValidNfeKey(DIESELTEC)).toBe(true);
  });

  it("accepts a key with separators and normalizes them away", () => {
    expect(isValidNfeKey("3526 0804 8872 1300 0190 5500 1000 0301 2910 0030 1298")).toBe(true);
  });

  it("rejects a key whose check digit does not match", () => {
    const tampered = DIESELTEC.slice(0, 43) + "9";
    expect(isValidNfeKey(tampered)).toBe(false);
  });

  it("rejects a key with any mutated digit", () => {
    const mutated = "9" + DIESELTEC.slice(1);
    expect(isValidNfeKey(mutated)).toBe(false);
  });

  it("rejects wrong length and non-digits", () => {
    expect(isValidNfeKey(DIESELTEC.slice(0, 43))).toBe(false);
    expect(isValidNfeKey("x".repeat(44))).toBe(false);
    expect(isValidNfeKey("")).toBe(false);
  });
});

describe("parseNfeKey", () => {
  it("decomposes a valid key into its fields", () => {
    expect(parseNfeKey(DIESELTEC)).toEqual({
      uf: "35",
      yearMonth: "2608",
      cnpj: "04887213000190",
      model: "55",
      series: "001",
      number: "000030129",
      emissionType: "1",
      code: "00030129",
      checkDigit: "8",
    });
  });

  it("returns null for an invalid key", () => {
    expect(parseNfeKey(DIESELTEC.slice(0, 43) + "9")).toBeNull();
  });
});
```

- [ ] **Step 5: Rodar o teste e confirmar que falha**

```bash
bun run test -- src/features/fiscal-notes/engine/nfeKey.test.ts
```

Esperado: FAIL — `Failed to resolve import "./nfeKey"`.

- [ ] **Step 6: Implementar**

`src/features/fiscal-notes/engine/nfeKey.ts`:

```ts
/**
 * Chave de acesso da NF-e (PRD-216, RC-05).
 *
 * 44 dígitos: cUF(2) AAMM(4) CNPJ(14) mod(2) série(3) nNF(9) tpEmis(1)
 * cNF(8) cDV(1). O dígito verificador é módulo 11 com pesos 2..9 ciclando
 * da direita para a esquerda sobre os 43 primeiros dígitos.
 *
 * Sem dependência de DOM — este módulo é espelhado para as Edge Functions.
 */

export interface INfeKeyParts {
  uf: string;
  yearMonth: string;
  cnpj: string;
  model: string;
  series: string;
  number: string;
  emissionType: string;
  code: string;
  checkDigit: string;
}

/** Remove espaços, pontos e traços — a chave é digitada da DANFE em grupos. */
function normalize(key: string): string {
  return key.replace(/[^\d]/g, "");
}

export function computeNfeKeyCheckDigit(first43: string): number {
  let sum = 0;
  let weight = 2;
  for (let i = first43.length - 1; i >= 0; i--) {
    sum += Number(first43[i]) * weight;
    weight = weight === 9 ? 2 : weight + 1;
  }
  const rest = sum % 11;
  return rest === 0 || rest === 1 ? 0 : 11 - rest;
}

export function isValidNfeKey(key: string): boolean {
  const digits = normalize(key);
  if (digits.length !== 44) return false;
  return computeNfeKeyCheckDigit(digits.slice(0, 43)) === Number(digits[43]);
}

export function parseNfeKey(key: string): INfeKeyParts | null {
  if (!isValidNfeKey(key)) return null;
  const d = normalize(key);
  return {
    uf: d.slice(0, 2),
    yearMonth: d.slice(2, 6),
    cnpj: d.slice(6, 20),
    model: d.slice(20, 22),
    series: d.slice(22, 25),
    number: d.slice(25, 34),
    emissionType: d.slice(34, 35),
    code: d.slice(35, 43),
    checkDigit: d.slice(43, 44),
  };
}
```

- [ ] **Step 7: Rodar o teste e confirmar que passa**

```bash
bun run test -- src/features/fiscal-notes/engine/nfeKey.test.ts
```

Esperado: PASS, 9 testes.

- [ ] **Step 8: Commit**

```bash
git add src/shared/types/supplier.ts src/shared/types/fiscal-note.ts src/shared/types/index.ts src/features/fiscal-notes/engine/nfeKey.ts src/features/fiscal-notes/engine/nfeKey.test.ts
git commit -m "feat(fiscal-notes): add domain types and NF-e access key validation"
```

---

### Task 2: Leitor de XML sem DOM

**Files:**
- Create: `src/features/fiscal-notes/engine/xml.ts`
- Test: `src/features/fiscal-notes/engine/xml.test.ts`

**Interfaces:**
- Consumes: nada
- Produces: `IXmlNode`, `parseXml(source: string): IXmlNode`, `child(node: IXmlNode, ...path: string[]): IXmlNode | undefined`, `children(node: IXmlNode, tag: string): IXmlNode[]`, `text(node: IXmlNode | undefined, ...path: string[]): string`, `num(node: IXmlNode | undefined, ...path: string[]): number`

> Por que um leitor próprio: as quatro origens de ingestão compartilham um parser, e duas rodam em Deno, que não expõe `DOMParser`. Uma lib de XML traria dependência nova sujeita ao guard de 24h do `bunfig.toml`. NF-e é XML bem-comportado — sem conteúdo misto, sem DTD — então um scanner de ~70 linhas basta.

- [ ] **Step 1: Escrever o teste (vai falhar)**

`src/features/fiscal-notes/engine/xml.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { child, children, num, parseXml, text } from "./xml";

const SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
  <!-- comentário deve ser ignorado -->
  <NFe>
    <infNFe Id="NFe35260804887213000190550010000301291000301298" versao="4.00">
      <ide><nNF>30129</nNF><serie>1</serie><dhEmi>2026-08-14T09:12:00-03:00</dhEmi></ide>
      <emit>
        <CNPJ>04887213000190</CNPJ>
        <xNome><![CDATA[DIESELTEC DISTRIBUIDORA DE AUTO PECAS LTDA]]></xNome>
        <xFant>Dieseltec &amp; Cia</xFant>
        <enderEmit><xLgr>Av. Brasil Oeste</xLgr><nro>2840</nro></enderEmit>
      </emit>
      <det nItem="1"><prod><cProd>RC-R60T</cProd><qCom>2.0000</qCom></prod></det>
      <det nItem="2"><prod><cProd>BI-0445120212</cProd><qCom>4.0000</qCom></prod></det>
      <total><ICMSTot><vFrete>182.20</vFrete><vDesc>0.00</vDesc></ICMSTot></total>
      <infAdic/>
    </infNFe>
  </NFe>
</nfeProc>`;

describe("parseXml", () => {
  it("builds a tree and strips the namespace prefix from tags", () => {
    const root = parseXml(SAMPLE);
    expect(root.children[0].tag).toBe("nfeProc");
  });

  it("reads attributes", () => {
    const inf = child(parseXml(SAMPLE), "nfeProc", "NFe", "infNFe");
    expect(inf?.attrs.Id).toBe("NFe35260804887213000190550010000301291000301298");
    expect(inf?.attrs.versao).toBe("4.00");
  });

  it("ignores comments and the XML declaration", () => {
    const proc = child(parseXml(SAMPLE), "nfeProc");
    expect(proc?.children.map((c) => c.tag)).toEqual(["NFe"]);
  });

  it("reads CDATA as plain text", () => {
    const root = parseXml(SAMPLE);
    expect(text(root, "nfeProc", "NFe", "infNFe", "emit", "xNome")).toBe(
      "DIESELTEC DISTRIBUIDORA DE AUTO PECAS LTDA",
    );
  });

  it("decodes entities", () => {
    const root = parseXml(SAMPLE);
    expect(text(root, "nfeProc", "NFe", "infNFe", "emit", "xFant")).toBe("Dieseltec & Cia");
  });

  it("handles self-closing tags without corrupting the stack", () => {
    const inf = child(parseXml(SAMPLE), "nfeProc", "NFe", "infNFe");
    expect(inf?.children.map((c) => c.tag)).toEqual(["ide", "emit", "det", "det", "total", "infAdic"]);
  });

  it("returns every repeated child with children()", () => {
    const inf = child(parseXml(SAMPLE), "nfeProc", "NFe", "infNFe");
    const dets = children(inf!, "det");
    expect(dets).toHaveLength(2);
    expect(text(dets[1], "prod", "cProd")).toBe("BI-0445120212");
  });

  it("reads numbers, defaulting missing nodes to zero", () => {
    const inf = child(parseXml(SAMPLE), "nfeProc", "NFe", "infNFe");
    expect(num(inf, "total", "ICMSTot", "vFrete")).toBe(182.2);
    expect(num(inf, "total", "ICMSTot", "vST")).toBe(0);
  });

  it("returns empty string for a missing path instead of throwing", () => {
    expect(text(parseXml(SAMPLE), "nfeProc", "nope", "nada")).toBe("");
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
bun run test -- src/features/fiscal-notes/engine/xml.test.ts
```

Esperado: FAIL — `Failed to resolve import "./xml"`.

- [ ] **Step 3: Implementar**

`src/features/fiscal-notes/engine/xml.ts`:

```ts
/**
 * Leitor de XML mínimo, sem dependência de DOM (PRD-216).
 *
 * Existe porque o parser da NF-e roda em dois runtimes: o navegador e o Deno
 * das Edge Functions, que não expõe `DOMParser`. Cobre o que a NF-e usa —
 * declaração, comentários, CDATA, atributos, tags auto-fechadas e entidades
 * básicas. Não cobre DTD, namespaces resolvidos nem conteúdo misto, porque a
 * NF-e não usa nenhum dos três.
 */

export interface IXmlNode {
  tag: string;
  attrs: Record<string, string>;
  children: IXmlNode[];
  text: string;
}

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
};

function decodeEntities(value: string): string {
  return value
    .replace(/&(amp|lt|gt|quot|apos);/g, (m) => ENTITIES[m])
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)));
}

/** `nfe:infNFe` → `infNFe`. A NF-e usa namespace default, mas XMLs de alguns
 *  emissores vêm prefixados; o resto do parser não deveria se importar. */
function stripNamespace(tag: string): string {
  const colon = tag.indexOf(":");
  return colon === -1 ? tag : tag.slice(colon + 1);
}

function parseAttrs(source: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /([\w:.-]+)\s*=\s*"([^"]*)"|([\w:.-]+)\s*=\s*'([^']*)'/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(source)) !== null) {
    const name = match[1] ?? match[3];
    const value = match[2] ?? match[4];
    attrs[name] = decodeEntities(value);
  }
  return attrs;
}

export function parseXml(source: string): IXmlNode {
  const root: IXmlNode = { tag: "#root", attrs: {}, children: [], text: "" };
  const stack: IXmlNode[] = [root];
  let i = 0;

  while (i < source.length) {
    const lt = source.indexOf("<", i);
    if (lt === -1) break;

    if (lt > i) {
      const raw = source.slice(i, lt).trim();
      if (raw) stack[stack.length - 1].text += decodeEntities(raw);
    }

    if (source.startsWith("<!--", lt)) {
      const end = source.indexOf("-->", lt);
      i = end === -1 ? source.length : end + 3;
      continue;
    }
    if (source.startsWith("<![CDATA[", lt)) {
      const end = source.indexOf("]]>", lt);
      const stop = end === -1 ? source.length : end;
      stack[stack.length - 1].text += source.slice(lt + 9, stop);
      i = end === -1 ? source.length : end + 3;
      continue;
    }
    if (source.startsWith("<?", lt) || source.startsWith("<!", lt)) {
      const end = source.indexOf(">", lt);
      i = end === -1 ? source.length : end + 1;
      continue;
    }

    const gt = source.indexOf(">", lt);
    if (gt === -1) break;
    const raw = source.slice(lt + 1, gt).trim();

    if (raw.startsWith("/")) {
      if (stack.length > 1) stack.pop();
      i = gt + 1;
      continue;
    }

    const selfClosing = raw.endsWith("/");
    const body = selfClosing ? raw.slice(0, -1).trim() : raw;
    const space = body.search(/\s/);
    const tag = space === -1 ? body : body.slice(0, space);

    const node: IXmlNode = {
      tag: stripNamespace(tag),
      attrs: space === -1 ? {} : parseAttrs(body.slice(space)),
      children: [],
      text: "",
    };
    stack[stack.length - 1].children.push(node);
    if (!selfClosing) stack.push(node);
    i = gt + 1;
  }

  return root;
}

export function child(node: IXmlNode | undefined, ...path: string[]): IXmlNode | undefined {
  let current = node;
  for (const tag of path) {
    if (!current) return undefined;
    current = current.children.find((c) => c.tag === tag);
  }
  return current;
}

export function children(node: IXmlNode, tag: string): IXmlNode[] {
  return node.children.filter((c) => c.tag === tag);
}

export function text(node: IXmlNode | undefined, ...path: string[]): string {
  return child(node, ...path)?.text.trim() ?? "";
}

export function num(node: IXmlNode | undefined, ...path: string[]): number {
  const raw = text(node, ...path);
  if (!raw) return 0;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

```bash
bun run test -- src/features/fiscal-notes/engine/xml.test.ts
```

Esperado: PASS, 9 testes.

- [ ] **Step 5: Commit**

```bash
git add src/features/fiscal-notes/engine/xml.ts src/features/fiscal-notes/engine/xml.test.ts
git commit -m "feat(fiscal-notes): add DOM-free XML reader for the NF-e parser"
```

---

### Task 3: Parser da NF-e

**Files:**
- Create: `src/features/fiscal-notes/engine/nfeParser.ts`
- Test: `src/features/fiscal-notes/engine/nfeParser.test.ts`
- Create: `src/features/fiscal-notes/engine/__fixtures__/nfe-dieseltec.xml`

**Interfaces:**
- Consumes: `parseXml`, `child`, `children`, `text`, `num` (Task 2) · `isValidNfeKey` (Task 1)
- Produces: `IParsedNfe`, `IParsedNfeEmitter`, `IParsedNfeItem`, `IParsedNfeDuplicate`, `NfeParseError`, `parseNfe(xml: string): IParsedNfe`

- [ ] **Step 1: Criar o fixture de XML**

`src/features/fiscal-notes/engine/__fixtures__/nfe-dieseltec.xml` — NF-e 4.00 reduzida ao que o parser lê, com a chave de DV válido:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
  <NFe>
    <infNFe Id="NFe35260804887213000190550010000301291000301298" versao="4.00">
      <ide>
        <cUF>35</cUF><nNF>30129</nNF><serie>1</serie><mod>55</mod>
        <dhEmi>2026-08-14T09:12:00-03:00</dhEmi>
      </ide>
      <emit>
        <CNPJ>04887213000190</CNPJ>
        <xNome>DIESELTEC DISTRIBUIDORA DE AUTO PECAS LTDA</xNome>
        <xFant>Dieseltec</xFant>
        <IE>096233148 8</IE>
        <enderEmit>
          <xLgr>Av. Brasil Oeste</xLgr><nro>2840</nro>
          <xBairro>Centro</xBairro><xMun>Passo Fundo</xMun><UF>RS</UF>
        </enderEmit>
      </emit>
      <det nItem="1">
        <prod>
          <cProd>RC-R60T</cProd>
          <cEAN>7891234567895</cEAN>
          <xProd>FILTRO SEPARADOR RACOR R60T CX C/12</xProd>
          <NCM>84212300</NCM><CFOP>6102</CFOP>
          <uCom>CX</uCom><qCom>2.0000</qCom><vUnCom>698.4000000000</vUnCom><vProd>1396.80</vProd>
        </prod>
      </det>
      <det nItem="2">
        <prod>
          <cProd>BI-0445120212</cProd>
          <cEAN>SEM GTIN</cEAN>
          <xProd>BICO INJETOR CR 0445120212</xProd>
          <NCM>84099190</NCM><CFOP>6102</CFOP>
          <uCom>UN</uCom><qCom>4.0000</qCom><vUnCom>389.0000000000</vUnCom><vProd>1556.00</vProd>
        </prod>
      </det>
      <total>
        <ICMSTot>
          <vProd>2952.80</vProd><vFrete>182.20</vFrete><vIPI>214.90</vIPI>
          <vDesc>0.00</vDesc><vNF>3349.90</vNF>
        </ICMSTot>
      </total>
      <cobr>
        <dup><nDup>001</nDup><dVenc>2026-09-16</dVenc><vDup>1116.64</vDup></dup>
        <dup><nDup>002</nDup><dVenc>2026-10-16</dVenc><vDup>1116.63</vDup></dup>
        <dup><nDup>003</nDup><dVenc>2026-11-16</dVenc><vDup>1116.63</vDup></dup>
      </cobr>
    </infNFe>
  </NFe>
</nfeProc>
```

- [ ] **Step 2: Escrever o teste (vai falhar)**

`src/features/fiscal-notes/engine/nfeParser.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { NfeParseError, parseNfe } from "./nfeParser";

const XML = readFileSync(join(__dirname, "__fixtures__", "nfe-dieseltec.xml"), "utf8");

describe("parseNfe", () => {
  it("reads the note header", () => {
    const nfe = parseNfe(XML);
    expect(nfe.accessKey).toBe("35260804887213000190550010000301291000301298");
    expect(nfe.number).toBe("30129");
    expect(nfe.series).toBe("1");
    expect(nfe.issuedAt).toBe("2026-08-14T09:12:00-03:00");
  });

  it("reads the emitter block, keeping CNPJ as digits only", () => {
    expect(parseNfe(XML).emitter).toEqual({
      cnpj: "04887213000190",
      corporateName: "DIESELTEC DISTRIBUIDORA DE AUTO PECAS LTDA",
      tradeName: "Dieseltec",
      stateRegistration: "096233148 8",
      address: "Av. Brasil Oeste, 2840 — Centro — Passo Fundo/RS",
    });
  });

  it("reads every item with the values as they came in the XML", () => {
    const items = parseNfe(XML).items;
    expect(items).toHaveLength(2);
    expect(items[0]).toEqual({
      seq: 1,
      supplierCode: "RC-R60T",
      description: "FILTRO SEPARADOR RACOR R60T CX C/12",
      ncm: "84212300",
      cfop: "6102",
      ean: "7891234567895",
      unit: "CX",
      quantity: 2,
      unitValue: 698.4,
      totalValue: 1396.8,
    });
  });

  it("treats 'SEM GTIN' as no EAN at all", () => {
    expect(parseNfe(XML).items[1].ean).toBeUndefined();
  });

  it("reads charges and totals", () => {
    const nfe = parseNfe(XML);
    expect(nfe.freight).toBe(182.2);
    expect(nfe.ipi).toBe(214.9);
    expect(nfe.discount).toBe(0);
    expect(nfe.productsTotal).toBe(2952.8);
    expect(nfe.total).toBe(3349.9);
  });

  it("reads the duplicates", () => {
    expect(parseNfe(XML).duplicates).toEqual([
      { number: "001", dueDate: "2026-09-16", amount: 1116.64 },
      { number: "002", dueDate: "2026-10-16", amount: 1116.63 },
      { number: "003", dueDate: "2026-11-16", amount: 1116.63 },
    ]);
  });

  it("rejects an XML that is not an NF-e", () => {
    expect(() => parseNfe("<html><body>nope</body></html>")).toThrow(NfeParseError);
  });

  it("rejects an NF-e whose access key fails the check digit", () => {
    const tampered = XML.replace(
      "NFe35260804887213000190550010000301291000301298",
      "NFe35260804887213000190550010000301291000301299",
    );
    expect(() => parseNfe(tampered)).toThrow(/chave de acesso/i);
  });

  it("rejects an NF-e with no items", () => {
    const noItems = XML.replace(/<det nItem="\d">[\s\S]*?<\/det>/g, "");
    expect(() => parseNfe(noItems)).toThrow(/nenhum item/i);
  });
});
```

- [ ] **Step 3: Rodar e confirmar que falha**

```bash
bun run test -- src/features/fiscal-notes/engine/nfeParser.test.ts
```

Esperado: FAIL — `Failed to resolve import "./nfeParser"`.

- [ ] **Step 4: Implementar**

`src/features/fiscal-notes/engine/nfeParser.ts`:

```ts
import { isValidNfeKey } from "./nfeKey";
import { child, children, num, parseXml, text, type IXmlNode } from "./xml";

/**
 * Parser da NF-e 4.00 (PRD-216).
 *
 * Lê o que a entrada de mercadoria precisa: cabeçalho, emitente, itens como
 * vieram (cProd, NCM, CFOP, uCom × vUnCom), encargos e duplicatas. Não
 * interpreta impostos por item — ICMS/ST são leitura da contabilidade, não
 * desta feature.
 *
 * Falha alto e explícito: XML que não é NF-e, chave com DV inválido ou nota
 * sem item viram `NfeParseError` em vez de nota parcial no banco.
 *
 * Sem dependência de DOM — espelhado para as Edge Functions.
 */

export class NfeParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NfeParseError";
  }
}

export interface IParsedNfeEmitter {
  cnpj: string;
  corporateName: string;
  tradeName?: string;
  stateRegistration?: string;
  address?: string;
}

export interface IParsedNfeItem {
  seq: number;
  supplierCode: string;
  description: string;
  ncm?: string;
  cfop?: string;
  ean?: string;
  unit: string;
  quantity: number;
  unitValue: number;
  totalValue: number;
}

export interface IParsedNfeDuplicate {
  number: string;
  dueDate: string;
  amount: number;
}

export interface IParsedNfe {
  accessKey: string;
  number: string;
  series: string;
  issuedAt: string;
  emitter: IParsedNfeEmitter;
  items: IParsedNfeItem[];
  duplicates: IParsedNfeDuplicate[];
  freight: number;
  ipi: number;
  discount: number;
  productsTotal: number;
  total: number;
}

/** A SEFAZ manda literalmente "SEM GTIN" quando o produto não tem EAN. */
function readEan(raw: string): string | undefined {
  const value = raw.trim();
  if (!value || value.toUpperCase() === "SEM GTIN") return undefined;
  return value;
}

function optional(value: string): string | undefined {
  return value ? value : undefined;
}

function readAddress(emit: IXmlNode | undefined): string | undefined {
  const ender = child(emit, "enderEmit");
  if (!ender) return undefined;
  const street = text(ender, "xLgr");
  const number = text(ender, "nro");
  const district = text(ender, "xBairro");
  const city = text(ender, "xMun");
  const uf = text(ender, "UF");
  const line = [street && number ? `${street}, ${number}` : street, district].filter(Boolean).join(" — ");
  const place = city && uf ? `${city}/${uf}` : city || uf;
  const full = [line, place].filter(Boolean).join(" — ");
  return optional(full);
}

function readItem(det: IXmlNode, index: number): IParsedNfeItem {
  const prod = child(det, "prod");
  if (!prod) throw new NfeParseError(`Item ${index + 1} da nota não tem bloco <prod>.`);
  const quantity = num(prod, "qCom");
  const unitValue = num(prod, "vUnCom");
  const declaredTotal = num(prod, "vProd");
  return {
    seq: Number(det.attrs.nItem) || index + 1,
    supplierCode: text(prod, "cProd"),
    description: text(prod, "xProd"),
    ncm: optional(text(prod, "NCM")),
    cfop: optional(text(prod, "CFOP")),
    ean: readEan(text(prod, "cEAN")),
    unit: text(prod, "uCom"),
    quantity,
    unitValue,
    // vProd é a fonte; só cai no produto quando o emissor omite a tag.
    totalValue: declaredTotal || Number((quantity * unitValue).toFixed(2)),
  };
}

export function parseNfe(xml: string): IParsedNfe {
  const root = parseXml(xml);

  // Aceita tanto o XML autorizado (<nfeProc>) quanto a NF-e solta (<NFe>).
  const inf =
    child(root, "nfeProc", "NFe", "infNFe") ?? child(root, "NFe", "infNFe") ?? child(root, "infNFe");
  if (!inf) throw new NfeParseError("XML não é uma NF-e — bloco <infNFe> não encontrado.");

  const accessKey = (inf.attrs.Id ?? "").replace(/^NFe/i, "").replace(/\D/g, "");
  if (!isValidNfeKey(accessKey)) {
    throw new NfeParseError(`Chave de acesso inválida ou com dígito verificador incorreto: ${accessKey || "(ausente)"}.`);
  }

  const ide = child(inf, "ide");
  const emit = child(inf, "emit");
  if (!emit) throw new NfeParseError("NF-e sem bloco <emit> — não há fornecedor a vincular.");

  const dets = children(inf, "det");
  if (dets.length === 0) throw new NfeParseError("NF-e sem nenhum item — nada a conferir.");

  const icmsTot = child(inf, "total", "ICMSTot");
  const items = dets.map(readItem);

  return {
    accessKey,
    number: text(ide, "nNF"),
    series: text(ide, "serie"),
    issuedAt: text(ide, "dhEmi") || text(ide, "dEmi"),
    emitter: {
      cnpj: text(emit, "CNPJ").replace(/\D/g, ""),
      corporateName: text(emit, "xNome"),
      tradeName: optional(text(emit, "xFant")),
      stateRegistration: optional(text(emit, "IE")),
      address: readAddress(emit),
    },
    items,
    duplicates: children(child(inf, "cobr") ?? { tag: "", attrs: {}, children: [], text: "" }, "dup").map(
      (dup) => ({
        number: text(dup, "nDup"),
        dueDate: text(dup, "dVenc"),
        amount: num(dup, "vDup"),
      }),
    ),
    freight: num(icmsTot, "vFrete"),
    ipi: num(icmsTot, "vIPI"),
    discount: num(icmsTot, "vDesc"),
    productsTotal: num(icmsTot, "vProd") || Number(items.reduce((a, i) => a + i.totalValue, 0).toFixed(2)),
    total: num(icmsTot, "vNF"),
  };
}
```

- [ ] **Step 5: Rodar e confirmar que passa**

```bash
bun run test -- src/features/fiscal-notes/engine/nfeParser.test.ts
```

Esperado: PASS, 9 testes.

- [ ] **Step 6: Commit**

```bash
git add src/features/fiscal-notes/engine/nfeParser.ts src/features/fiscal-notes/engine/nfeParser.test.ts src/features/fiscal-notes/engine/__fixtures__/nfe-dieseltec.xml
git commit -m "feat(fiscal-notes): parse NF-e 4.00 XML into a typed structure"
```

---

### Task 4: Rateio de encargos e conversão de unidade

**Files:**
- Create: `src/features/fiscal-notes/engine/costAllocation.ts`
- Create: `src/features/fiscal-notes/engine/unitConversion.ts`
- Test: `src/features/fiscal-notes/engine/costAllocation.test.ts`
- Test: `src/features/fiscal-notes/engine/unitConversion.test.ts`

**Interfaces:**
- Consumes: `ItemConversionMode` de `@/shared/types`
- Produces: `allocateCharges(input: IAllocationInput): Map<string, number>` · `convertToStock(input: IConversionInput): IConversionResult`

> Ficam juntos numa task porque `convertToStock` consome o rateio: o custo por unidade de estoque só existe depois que frete e IPI foram distribuídos. Um revisor que aprove um e rejeite o outro está aprovando meia fórmula.

- [ ] **Step 1: Escrever o teste do rateio (vai falhar)**

`src/features/fiscal-notes/engine/costAllocation.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { allocateCharges } from "./costAllocation";

describe("allocateCharges", () => {
  it("splits charges proportionally to each item's value (RC-01)", () => {
    const result = allocateCharges({
      items: [
        { id: "a", totalValue: 1396.8 },
        { id: "b", totalValue: 1556.0 },
      ],
      freight: 182.2,
      ipi: 214.9,
      discount: 0,
    });
    // total de encargos 397.10; produtos 2952.80
    expect(result.get("a")).toBeCloseTo(397.1 * (1396.8 / 2952.8), 6);
    expect(result.get("b")).toBeCloseTo(397.1 * (1556.0 / 2952.8), 6);
  });

  it("conserves the total charge across items", () => {
    const result = allocateCharges({
      items: [
        { id: "a", totalValue: 100 },
        { id: "b", totalValue: 200 },
        { id: "c", totalValue: 700 },
      ],
      freight: 90,
      ipi: 10,
      discount: 0,
    });
    const sum = [...result.values()].reduce((a, v) => a + v, 0);
    expect(sum).toBeCloseTo(100, 6);
  });

  it("subtracts the discount, which can make the allocation negative", () => {
    const result = allocateCharges({
      items: [{ id: "a", totalValue: 100 }],
      freight: 10,
      ipi: 0,
      discount: 30,
    });
    expect(result.get("a")).toBeCloseTo(-20, 6);
  });

  it("allocates zero to every item when there is no charge", () => {
    const result = allocateCharges({
      items: [
        { id: "a", totalValue: 100 },
        { id: "b", totalValue: 300 },
      ],
      freight: 0,
      ipi: 0,
      discount: 0,
    });
    expect(result.get("a")).toBe(0);
    expect(result.get("b")).toBe(0);
  });

  it("allocates zero when the product total is zero, instead of dividing by zero", () => {
    const result = allocateCharges({
      items: [{ id: "a", totalValue: 0 }],
      freight: 50,
      ipi: 0,
      discount: 0,
    });
    expect(result.get("a")).toBe(0);
  });

  it("returns an empty map for an empty item list", () => {
    expect(allocateCharges({ items: [], freight: 10, ipi: 0, discount: 0 }).size).toBe(0);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
bun run test -- src/features/fiscal-notes/engine/costAllocation.test.ts
```

Esperado: FAIL — `Failed to resolve import "./costAllocation"`.

- [ ] **Step 3: Implementar o rateio**

`src/features/fiscal-notes/engine/costAllocation.ts`:

```ts
/**
 * Rateio de frete, IPI e desconto (PRD-216, RC-01).
 *
 * Por VALOR do item, nunca por quantidade ou peso. O resultado entra no custo
 * unitário que vai para a margem — é a diferença entre saber a margem real e
 * calcular sobre o `vUnCom` da nota, que ignora o frete.
 *
 * Sem arredondamento aqui de propósito: quem arredonda é a apresentação. Somar
 * valores já arredondados por item perde centavos contra o total da nota.
 */

export interface IAllocationItem {
  id: string;
  totalValue: number;
}

export interface IAllocationInput {
  items: IAllocationItem[];
  freight: number;
  ipi: number;
  discount: number;
}

export function allocateCharges(input: IAllocationInput): Map<string, number> {
  const allocation = new Map<string, number>();
  const charges = input.freight + input.ipi - input.discount;
  const productsTotal = input.items.reduce((sum, item) => sum + item.totalValue, 0);

  for (const item of input.items) {
    allocation.set(item.id, productsTotal === 0 ? 0 : charges * (item.totalValue / productsTotal));
  }
  return allocation;
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

```bash
bun run test -- src/features/fiscal-notes/engine/costAllocation.test.ts
```

Esperado: PASS, 6 testes.

- [ ] **Step 5: Escrever o teste da conversão (vai falhar)**

`src/features/fiscal-notes/engine/unitConversion.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { convertToStock } from "./unitConversion";

describe("convertToStock", () => {
  it("passes quantity straight through in direct mode (RC-02)", () => {
    const r = convertToStock({
      quantity: 24,
      mode: "direto",
      factor: null,
      noteUnit: "UN",
      conversionUnit: undefined,
      partUnit: "UN",
      itemTotalValue: 2157.6,
      allocatedCharges: 0,
    });
    expect(r.factor).toBe(1);
    expect(r.stockQuantity).toBe(24);
    expect(r.stockUnit).toBe("UN");
    expect(r.unitCost).toBeCloseTo(89.9, 6);
  });

  it("multiplies by the factor when converting a box into units (RC-02)", () => {
    const r = convertToStock({
      quantity: 16,
      mode: "conv",
      factor: 12,
      noteUnit: "CX",
      conversionUnit: "UN",
      partUnit: "UN",
      itemTotalValue: 9062.4,
      allocatedCharges: 0,
    });
    expect(r.stockQuantity).toBe(192);
    expect(r.stockUnit).toBe("UN");
    expect(r.unitCost).toBeCloseTo(47.2, 6);
  });

  it("folds the allocated charges into the unit cost (RC-02)", () => {
    const r = convertToStock({
      quantity: 2,
      mode: "conv",
      factor: 12,
      noteUnit: "CX",
      conversionUnit: "UN",
      partUnit: "UN",
      itemTotalValue: 1396.8,
      allocatedCharges: 187.83,
    });
    expect(r.stockQuantity).toBe(24);
    expect(r.unitCost).toBeCloseTo((1396.8 + 187.83) / 24, 6);
  });

  it("uses the yield per package when fractioning (RC-03)", () => {
    const r = convertToStock({
      quantity: 8,
      mode: "frac",
      factor: 20,
      noteUnit: "BD",
      conversionUnit: "L",
      partUnit: "UN",
      itemTotalValue: 2064.0,
      allocatedCharges: 0,
    });
    expect(r.stockQuantity).toBe(160);
    expect(r.stockUnit).toBe("L");
    expect(r.unitCost).toBeCloseTo(12.9, 6);
  });

  it("returns null quantity and cost when the factor is undefined — this blocks posting", () => {
    const r = convertToStock({
      quantity: 13,
      mode: "conv",
      factor: null,
      noteUnit: "CX",
      conversionUnit: "UN",
      partUnit: "UN",
      itemTotalValue: 2028.0,
      allocatedCharges: 0,
    });
    expect(r.factor).toBeNull();
    expect(r.stockQuantity).toBeNull();
    expect(r.unitCost).toBeNull();
  });

  it("treats a zero or negative factor as undefined", () => {
    for (const factor of [0, -3]) {
      const r = convertToStock({
        quantity: 5,
        mode: "conv",
        factor,
        noteUnit: "CX",
        conversionUnit: "UN",
        partUnit: "UN",
        itemTotalValue: 100,
        allocatedCharges: 0,
      });
      expect(r.stockQuantity).toBeNull();
    }
  });

  it("falls back to the note unit in direct mode when the item has no linked part", () => {
    const r = convertToStock({
      quantity: 3,
      mode: "direto",
      factor: null,
      noteUnit: "PCT",
      conversionUnit: undefined,
      partUnit: undefined,
      itemTotalValue: 30,
      allocatedCharges: 0,
    });
    expect(r.stockUnit).toBe("PCT");
  });

  it("rounds the converted quantity to two decimals", () => {
    const r = convertToStock({
      quantity: 1.005,
      mode: "conv",
      factor: 3,
      noteUnit: "CX",
      conversionUnit: "UN",
      partUnit: "UN",
      itemTotalValue: 90,
      allocatedCharges: 0,
    });
    expect(r.stockQuantity).toBe(3.02);
  });
});
```

- [ ] **Step 6: Rodar e confirmar que falha**

```bash
bun run test -- src/features/fiscal-notes/engine/unitConversion.test.ts
```

Esperado: FAIL — `Failed to resolve import "./unitConversion"`.

- [ ] **Step 7: Implementar a conversão**

`src/features/fiscal-notes/engine/unitConversion.ts`:

```ts
import type { ItemConversionMode } from "@/shared/types";

/**
 * Conversão da unidade da nota para a unidade de estoque (PRD-216, RC-02/RC-03).
 *
 * Três modos:
 *   direto — a unidade da nota já é a de estoque, fator 1;
 *   conv   — a nota vem em embalagem (CX c/12) e o estoque é em UN;
 *   frac   — a compra é em volume (balde 20 L) e a venda é em fração (litro),
 *            e o saldo entra no SKU de destino, não no SKU faturado.
 *
 * Fator ausente, zero ou negativo devolve `null` em quantidade e custo. Isso
 * não é um erro a tratar: é o que mantém o item pendente e trava o botão de
 * lançar até o conferente definir o fator.
 */

export interface IConversionInput {
  quantity: number;
  mode: ItemConversionMode;
  factor: number | null;
  /** `uCom` — unidade como veio na nota. */
  noteUnit: string;
  /** Unidade escolhida na conferência para `conv`/`frac`. */
  conversionUnit?: string;
  /** Unidade de estoque da peça vinculada, quando há uma. */
  partUnit?: string;
  itemTotalValue: number;
  /** Parcela de frete/IPI/desconto deste item, vinda de `allocateCharges`. */
  allocatedCharges: number;
}

export interface IConversionResult {
  factor: number | null;
  stockQuantity: number | null;
  stockUnit: string;
  unitCost: number | null;
}

export function convertToStock(input: IConversionInput): IConversionResult {
  const factor =
    input.mode === "direto" ? 1 : input.factor !== null && input.factor > 0 ? input.factor : null;

  const stockUnit =
    input.mode === "direto"
      ? (input.partUnit ?? input.noteUnit)
      : (input.conversionUnit ?? input.partUnit ?? input.noteUnit);

  if (factor === null) {
    return { factor: null, stockQuantity: null, stockUnit, unitCost: null };
  }

  const stockQuantity = Number((input.quantity * factor).toFixed(2));
  if (stockQuantity === 0) {
    return { factor, stockQuantity: 0, stockUnit, unitCost: null };
  }

  return {
    factor,
    stockQuantity,
    stockUnit,
    unitCost: (input.itemTotalValue + input.allocatedCharges) / stockQuantity,
  };
}
```

- [ ] **Step 8: Rodar e confirmar que passa**

```bash
bun run test -- src/features/fiscal-notes/engine/unitConversion.test.ts
```

Esperado: PASS, 8 testes.

- [ ] **Step 9: Commit**

```bash
git add src/features/fiscal-notes/engine/costAllocation.ts src/features/fiscal-notes/engine/costAllocation.test.ts src/features/fiscal-notes/engine/unitConversion.ts src/features/fiscal-notes/engine/unitConversion.test.ts
git commit -m "feat(fiscal-notes): allocate freight and IPI by value, convert note units to stock"
```

---

### Task 5: Custo médio ponderado

**Files:**
- Create: `src/features/fiscal-notes/engine/averageCost.ts`
- Test: `src/features/fiscal-notes/engine/averageCost.test.ts`

**Interfaces:**
- Consumes: nada
- Produces: `weightedAverageCost(input: IAverageCostInput): number`

- [ ] **Step 1: Escrever o teste (vai falhar)**

`src/features/fiscal-notes/engine/averageCost.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { weightedAverageCost } from "./averageCost";

describe("weightedAverageCost", () => {
  it("weights the incoming cost against the existing balance (RC-04)", () => {
    // 14 UN a 58.90 + 24 UN a 65.00 → (824.60 + 1560.00) / 38
    expect(
      weightedAverageCost({
        currentStock: 14,
        currentAverage: 58.9,
        incomingQuantity: 24,
        incomingUnitCost: 65,
      }),
    ).toBeCloseTo(2384.6 / 38, 6);
  });

  it("returns the incoming cost when there is no balance", () => {
    expect(
      weightedAverageCost({
        currentStock: 0,
        currentAverage: 58.9,
        incomingQuantity: 10,
        incomingUnitCost: 71.2,
      }),
    ).toBe(71.2);
  });

  it("returns the incoming cost when the balance is negative", () => {
    expect(
      weightedAverageCost({
        currentStock: -5,
        currentAverage: 40,
        incomingQuantity: 10,
        incomingUnitCost: 71.2,
      }),
    ).toBe(71.2);
  });

  it("returns the incoming cost when the current average is unknown", () => {
    expect(
      weightedAverageCost({
        currentStock: 20,
        currentAverage: 0,
        incomingQuantity: 10,
        incomingUnitCost: 71.2,
      }),
    ).toBe(71.2);
  });

  it("keeps the current average when nothing comes in", () => {
    expect(
      weightedAverageCost({
        currentStock: 20,
        currentAverage: 58.9,
        incomingQuantity: 0,
        incomingUnitCost: 71.2,
      }),
    ).toBe(58.9);
  });

  it("is stable when the incoming cost equals the current average", () => {
    expect(
      weightedAverageCost({
        currentStock: 31,
        currentAverage: 46.1,
        incomingQuantity: 60,
        incomingUnitCost: 46.1,
      }),
    ).toBeCloseTo(46.1, 6);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
bun run test -- src/features/fiscal-notes/engine/averageCost.test.ts
```

Esperado: FAIL — `Failed to resolve import "./averageCost"`.

- [ ] **Step 3: Implementar**

`src/features/fiscal-notes/engine/averageCost.ts`:

```ts
/**
 * Custo médio ponderado (PRD-216, RC-04).
 *
 * Chamado uma vez por peça no lançamento da nota. Saldo zero ou negativo e
 * média desconhecida caem no custo da entrada — não há média a preservar, e
 * misturar um saldo negativo na ponderação produziria custo sem sentido.
 */

export interface IAverageCostInput {
  currentStock: number;
  currentAverage: number;
  incomingQuantity: number;
  incomingUnitCost: number;
}

export function weightedAverageCost(input: IAverageCostInput): number {
  if (input.incomingQuantity <= 0) return input.currentAverage;
  if (input.currentStock <= 0 || input.currentAverage <= 0) return input.incomingUnitCost;

  const currentValue = input.currentStock * input.currentAverage;
  const incomingValue = input.incomingQuantity * input.incomingUnitCost;
  return (currentValue + incomingValue) / (input.currentStock + input.incomingQuantity);
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

```bash
bun run test -- src/features/fiscal-notes/engine/averageCost.test.ts
```

Esperado: PASS, 6 testes.

- [ ] **Step 5: Commit**

```bash
git add src/features/fiscal-notes/engine/averageCost.ts src/features/fiscal-notes/engine/averageCost.test.ts
git commit -m "feat(fiscal-notes): compute weighted average cost on posting"
```

---

### Task 6: Cascata de sugestão de vínculo

**Files:**
- Create: `src/features/fiscal-notes/engine/itemMatcher.ts`
- Test: `src/features/fiscal-notes/engine/itemMatcher.test.ts`

**Interfaces:**
- Consumes: `ID`, `ItemLinkMode` de `@/shared/types`
- Produces: `IMatchCandidate`, `IMatchInput`, `IMatchResult`, `matchItem(input: IMatchInput, candidates: IMatchCandidate[]): IMatchResult`, `tokenize(text: string): string[]`

- [ ] **Step 1: Escrever o teste (vai falhar)**

`src/features/fiscal-notes/engine/itemMatcher.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { matchItem, tokenize, type IMatchCandidate } from "./itemMatcher";

const CANDIDATES: IMatchCandidate[] = [
  {
    partId: "p-r60t",
    sku: "FLT-R60T",
    name: "Filtro separador Racor R60T",
    ncm: "84212300",
    ean: "7891234567895",
  },
  {
    partId: "p-bico",
    sku: "BIC-0445120212",
    name: "Bico injetor Bosch CR 0445120212",
    ncm: "84099190",
    ean: "7899999000012",
  },
  {
    partId: "p-arla",
    sku: "ARL-B20",
    name: "Arla 32 bombona 20 L",
    ncm: "31021010",
  },
];

describe("tokenize", () => {
  it("uppercases, strips accents and drops noise tokens", () => {
    expect(tokenize("Filtro separador de Água R60T CX C/12")).toEqual([
      "FILTRO",
      "SEPARADOR",
      "AGUA",
      "R60T",
    ]);
  });
});

describe("matchItem", () => {
  it("links directly when the supplier code is already mapped", () => {
    const r = matchItem(
      { supplierCode: "RC-R60T", description: "QUALQUER COISA", mappedPartId: "p-r60t" },
      CANDIDATES,
    );
    expect(r.mode).toBe("auto");
    expect(r.partId).toBe("p-r60t");
    expect(r.confidence).toBeNull();
    expect(r.evidence).toMatch(/código já mapeado/i);
  });

  it("suggests with very high confidence on an identical EAN", () => {
    const r = matchItem(
      { supplierCode: "X", description: "PECA SEM NOME PARECIDO", ean: "7899999000012" },
      CANDIDATES,
    );
    expect(r.mode).toBe("ia");
    expect(r.partId).toBe("p-bico");
    expect(r.confidence).toBeGreaterThanOrEqual(95);
    expect(r.evidence).toMatch(/EAN idêntico/i);
  });

  it("suggests on matching NCM plus strong description overlap", () => {
    const r = matchItem(
      {
        supplierCode: "RC-R60T",
        description: "FILTRO SEPARADOR RACOR R60T CX C/12",
        ncm: "84212300",
      },
      CANDIDATES,
    );
    expect(r.mode).toBe("ia");
    expect(r.partId).toBe("p-r60t");
    expect(r.confidence).toBeGreaterThanOrEqual(80);
    expect(r.confidence).toBeLessThanOrEqual(94);
    expect(r.evidence).toMatch(/NCM igual/i);
  });

  it("suggests with lower confidence when the description matches but the NCM differs", () => {
    const r = matchItem(
      {
        supplierCode: "RC-R60T",
        description: "FILTRO SEPARADOR RACOR R60T",
        ncm: "99999999",
      },
      CANDIDATES,
    );
    expect(r.mode).toBe("ia");
    expect(r.partId).toBe("p-r60t");
    expect(r.confidence).toBeGreaterThanOrEqual(60);
    expect(r.confidence).toBeLessThan(80);
    expect(r.evidence).toMatch(/NCM difere/i);
  });

  it("falls through to pending when nothing matches", () => {
    const r = matchItem(
      { supplierCode: "ZZ-999", description: "PARAFUSO SEXTAVADO M8", ncm: "73181500" },
      CANDIDATES,
    );
    expect(r.mode).toBe("pend");
    expect(r.partId).toBeNull();
    expect(r.confidence).toBeNull();
  });

  it("falls through to pending when there are no candidates at all", () => {
    expect(matchItem({ supplierCode: "A", description: "FILTRO SEPARADOR RACOR R60T" }, []).mode).toBe(
      "pend",
    );
  });

  it("prefers EAN over description when both would match different parts", () => {
    const r = matchItem(
      {
        supplierCode: "X",
        description: "FILTRO SEPARADOR RACOR R60T",
        ncm: "84212300",
        ean: "7899999000012",
      },
      CANDIDATES,
    );
    expect(r.partId).toBe("p-bico");
  });

  it("ignores an EAN that no candidate has", () => {
    const r = matchItem(
      { supplierCode: "X", description: "FILTRO SEPARADOR RACOR R60T", ncm: "84212300", ean: "0000000000000" },
      CANDIDATES,
    );
    expect(r.partId).toBe("p-r60t");
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
bun run test -- src/features/fiscal-notes/engine/itemMatcher.test.ts
```

Esperado: FAIL — `Failed to resolve import "./itemMatcher"`.

- [ ] **Step 3: Implementar**

`src/features/fiscal-notes/engine/itemMatcher.ts`:

```ts
import type { ID, ItemLinkMode } from "@/shared/types";

/**
 * Cascata determinística de sugestão de vínculo item ↔ catálogo
 * (PRD-216, RS-01).
 *
 * A ordem é a do PRD e importa: código já mapeado vence EAN, EAN vence
 * descrição. Cada degrau devolve a EVIDÊNCIA escrita que a gaveta de
 * conferência mostra — sugestão sem evidência é adivinhação, e o conferente
 * não tem como julgar.
 *
 * O que sai daqui como `pend` é o único material que vai ao LLM (RS-02).
 */

export interface IMatchCandidate {
  partId: ID;
  sku: string;
  name: string;
  ncm?: string;
  ean?: string;
}

export interface IMatchInput {
  supplierCode: string;
  description: string;
  ncm?: string;
  ean?: string;
  /** Vínculo já aprendido para este `supplierCode` neste fornecedor. */
  mappedPartId?: ID;
}

export interface IMatchResult {
  mode: ItemLinkMode;
  partId: ID | null;
  /** 0–100. `null` quando o vínculo é certo (código mapeado) ou inexistente. */
  confidence: number | null;
  evidence: string | null;
}

/** Tokens curtos e palavras de ligação não discriminam nada e inflam a interseção. */
const NOISE = new Set(["DE", "DA", "DO", "COM", "SEM", "PARA", "P", "C", "CX", "PCT", "UN", "KIT"]);

export function tokenize(value: string): string[] {
  return value
    .normalize("NFD")
    // Remove os diacríticos combinantes que o NFD separou. Property escape em
    // vez de faixa literal: os caracteres da faixa são invisíveis no diff.
    .replace(/\p{Diacritic}/gu, "")
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter((token) => token.length > 1 && !NOISE.has(token));
}

/** Jaccard sobre os tokens: interseção dividida pela união. */
function overlap(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let shared = 0;
  for (const token of setA) if (setB.has(token)) shared++;
  return shared / (setA.size + setB.size - shared);
}

const PENDING: IMatchResult = { mode: "pend", partId: null, confidence: null, evidence: null };

export function matchItem(input: IMatchInput, candidates: IMatchCandidate[]): IMatchResult {
  // 1. Código do fornecedor já mapeado — vínculo direto, sem confiança porque
  //    não é palpite: um humano já confirmou este par numa nota anterior.
  if (input.mappedPartId && candidates.some((c) => c.partId === input.mappedPartId)) {
    return {
      mode: "auto",
      partId: input.mappedPartId,
      confidence: null,
      evidence: `Código ${input.supplierCode} já mapeado para este fornecedor`,
    };
  }

  if (candidates.length === 0) return PENDING;

  // 2. EAN idêntico.
  if (input.ean) {
    const byEan = candidates.find((c) => c.ean && c.ean === input.ean);
    if (byEan) {
      return {
        mode: "ia",
        partId: byEan.partId,
        confidence: 97,
        evidence: "EAN idêntico ao do cadastro",
      };
    }
  }

  // 3/4. Descrição, com e sem NCM igual.
  const itemTokens = tokenize(input.description);
  let best: { candidate: IMatchCandidate; score: number } | null = null;
  for (const candidate of candidates) {
    const score = overlap(itemTokens, tokenize(candidate.name));
    if (!best || score > best.score) best = { candidate, score };
  }
  if (!best || best.score < 0.34) return PENDING;

  const sameNcm = Boolean(input.ncm && best.candidate.ncm && input.ncm === best.candidate.ncm);
  // Faixas do PRD: 80–94 com NCM igual, 60–79 sem.
  const floor = sameNcm ? 80 : 60;
  const confidence = Math.min(sameNcm ? 94 : 79, Math.round(floor + best.score * 14));

  return {
    mode: "ia",
    partId: best.candidate.partId,
    confidence,
    evidence: sameNcm
      ? `Descrição compatível com ${best.candidate.sku} e NCM igual ao do cadastro`
      : `Descrição compatível com ${best.candidate.sku} — NCM difere do cadastro`,
  };
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

```bash
bun run test -- src/features/fiscal-notes/engine/itemMatcher.test.ts
```

Esperado: PASS, 9 testes.

- [ ] **Step 5: Commit**

```bash
git add src/features/fiscal-notes/engine/itemMatcher.ts src/features/fiscal-notes/engine/itemMatcher.test.ts
git commit -m "feat(fiscal-notes): suggest catalog links through a deterministic cascade"
```

---

### Task 7: Motor de análise

**Files:**
- Create: `src/features/fiscal-notes/engine/analysis.ts`
- Create: `src/features/fiscal-notes/engine/index.ts`
- Create: `src/features/fiscal-notes/index.ts`
- Test: `src/features/fiscal-notes/engine/analysis.test.ts`

**Interfaces:**
- Consumes: `IFiscalNote`, `IFiscalNoteItem`, `ISupplier` de `@/shared/types`
- Produces: `IAnalysisCard`, `IAnalysisInput`, `IPurchaseHistoryEntry`, `analyzeNote(input: IAnalysisInput): IAnalysisCard[]`

- [ ] **Step 1: Escrever o teste (vai falhar)**

`src/features/fiscal-notes/engine/analysis.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { analyzeNote, type IAnalysisInput } from "./analysis";

const BASE: IAnalysisInput = {
  noteId: "n1",
  accessKey: "35260804887213000190550010000301291000301298",
  supplierName: "Dieseltec",
  supplierIsNew: false,
  knownAccessKeys: [],
  items: [
    {
      itemId: "i1",
      partId: "p-bico",
      partName: "Bico injetor Bosch CR 0445120212",
      description: "BICO INJETOR CR 0445120212",
      ncm: "84099190",
      catalogNcm: "84099190",
      unitCost: 389,
      stockUnit: "UN",
      monthlySales: 4,
      currentStock: 6,
    },
  ],
  purchaseHistory: {
    "p-bico": [
      { supplierName: "Bosch", unitCost: 332, purchasedAt: "2026-02-10", label: "fev" },
      { supplierName: "Bosch", unitCost: 346, purchasedAt: "2026-07-14", label: "jul" },
    ],
  },
};

describe("analyzeNote", () => {
  it("flags a unit cost above the last purchase", () => {
    const card = analyzeNote(BASE).find((c) => c.kind === "price");
    expect(card).toBeDefined();
    expect(card!.severity).toBe("danger");
    // 389 sobre 346 = +12,4%
    expect(card!.title).toMatch(/12,4%/);
    expect(card!.series?.map((p) => p.value)).toEqual([332, 346, 389]);
  });

  it("does not flag a price within the tolerance band", () => {
    const input: IAnalysisInput = {
      ...BASE,
      items: [{ ...BASE.items[0], unitCost: 350 }],
    };
    expect(analyzeNote(input).some((c) => c.kind === "price")).toBe(false);
  });

  it("flags an NCM that differs from the catalog", () => {
    const input: IAnalysisInput = {
      ...BASE,
      items: [{ ...BASE.items[0], ncm: "84212300", catalogNcm: "84212990" }],
    };
    const card = analyzeNote(input).find((c) => c.kind === "fiscal");
    expect(card).toBeDefined();
    expect(card!.severity).toBe("warning");
    expect(card!.description).toContain("84212300");
    expect(card!.description).toContain("84212990");
  });

  it("flags a supplier created from the XML so someone completes it", () => {
    const card = analyzeNote({ ...BASE, supplierIsNew: true }).find((c) => c.kind === "registry");
    expect(card).toBeDefined();
    expect(card!.title).toContain("Dieseltec");
  });

  it("flags a duplicated access key", () => {
    const card = analyzeNote({ ...BASE, knownAccessKeys: [BASE.accessKey] }).find(
      (c) => c.kind === "duplicate",
    );
    expect(card).toBeDefined();
    expect(card!.severity).toBe("danger");
  });

  it("reports the duplicate check as clean when the key is new", () => {
    const card = analyzeNote(BASE).find((c) => c.kind === "duplicate");
    expect(card).toBeDefined();
    expect(card!.severity).toBe("success");
  });

  it("suggests fractioning stagnant packaging that sells in fractions", () => {
    const input: IAnalysisInput = {
      ...BASE,
      items: [
        {
          ...BASE.items[0],
          partId: "p-graxa",
          partName: "Graxa EP2 balde 20 kg",
          stockUnit: "BD",
          monthlySales: 0,
          currentStock: 3,
          fractionCandidate: { partName: "Graxa EP2 pote 1 kg", monthlySales: 14 },
        },
      ],
    };
    const card = analyzeNote(input).find((c) => c.kind === "fractioning");
    expect(card).toBeDefined();
    expect(card!.description).toContain("14");
  });

  it("returns only the duplicate-check card for a clean note with no history", () => {
    const clean: IAnalysisInput = {
      ...BASE,
      items: [{ ...BASE.items[0], unitCost: 346 }],
      purchaseHistory: {},
    };
    expect(analyzeNote(clean).map((c) => c.kind)).toEqual(["duplicate"]);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
bun run test -- src/features/fiscal-notes/engine/analysis.test.ts
```

Esperado: FAIL — `Failed to resolve import "./analysis"`.

- [ ] **Step 3: Implementar**

`src/features/fiscal-notes/engine/analysis.ts`:

```ts
import type { ID } from "@/shared/types";

/**
 * Análise das notas de entrada (PRD-216, RS-03).
 *
 * Seis famílias de card, todas cálculo determinístico — nenhuma depende de
 * modelo. O LLM só entra na sugestão de vínculo (RS-02), nunca aqui: um card
 * que diz "preço 12,4% acima" precisa ser reproduzível e auditável.
 *
 * A regra da casa (RS-04) está no que este módulo NÃO faz: ele descreve, não
 * aplica. Nenhuma função daqui muta nota, custo ou catálogo.
 */

export type AnalysisKind =
  | "price"
  | "saving"
  | "fiscal"
  | "registry"
  | "fractioning"
  | "duplicate";

export type AnalysisSeverity = "danger" | "warning" | "success" | "info";

export interface ISeriesPoint {
  label: string;
  value: number;
}

export interface IAnalysisCard {
  kind: AnalysisKind;
  severity: AnalysisSeverity;
  title: string;
  description: string;
  series?: ISeriesPoint[];
}

export interface IPurchaseHistoryEntry {
  supplierName: string;
  unitCost: number;
  purchasedAt: string;
  /** Rótulo curto do ponto na série (ex.: "jul"). */
  label: string;
}

export interface IAnalysisItem {
  itemId: ID;
  partId?: ID;
  partName: string;
  description: string;
  ncm?: string;
  /** NCM que o catálogo tem para a peça vinculada. */
  catalogNcm?: string;
  /** Custo por unidade de estoque, já com rateio. */
  unitCost: number | null;
  stockUnit: string;
  monthlySales?: number;
  currentStock?: number;
  /** Fração que gira mais que a embalagem comprada. */
  fractionCandidate?: { partName: string; monthlySales: number };
  /** Mesma peça mais barata por unidade em outra embalagem/fornecedor. */
  cheaperAlternative?: { supplierName: string; packaging: string; unitCost: number };
}

export interface IAnalysisInput {
  noteId: ID;
  accessKey: string;
  supplierName: string;
  supplierIsNew: boolean;
  /** Chaves já no sistema, para a verificação de reentrada. */
  knownAccessKeys: string[];
  items: IAnalysisItem[];
  /** Histórico de compra por `partId`, do mais antigo ao mais recente. */
  purchaseHistory: Record<string, IPurchaseHistoryEntry[]>;
}

/** Abaixo disto a variação é ruído de negociação, não sinal. */
const PRICE_TOLERANCE = 0.05;

function pct(value: number): string {
  return value.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function brl(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function priceCard(item: IAnalysisItem, history: IPurchaseHistoryEntry[]): IAnalysisCard | null {
  if (item.unitCost === null || history.length === 0) return null;
  const last = history[history.length - 1];
  if (last.unitCost <= 0) return null;

  const delta = (item.unitCost - last.unitCost) / last.unitCost;
  if (Math.abs(delta) <= PRICE_TOLERANCE) return null;

  const rising = delta > 0;
  return {
    kind: "price",
    severity: rising ? "danger" : "success",
    title: `${item.partName} ${rising ? "subiu" : "caiu"} ${pct(Math.abs(delta) * 100)}%`,
    description:
      `Nesta nota o unitário veio a ${brl(item.unitCost)} por ${item.stockUnit} — ` +
      `a última compra foi a ${brl(last.unitCost)}, na ${last.supplierName}, em ${last.purchasedAt}.`,
    series: [...history.map((h) => ({ label: h.label, value: h.unitCost })), {
      label: "agora",
      value: item.unitCost,
    }],
  };
}

function savingCard(item: IAnalysisItem): IAnalysisCard | null {
  const alt = item.cheaperAlternative;
  if (!alt || item.unitCost === null || item.unitCost <= alt.unitCost) return null;
  const delta = (item.unitCost - alt.unitCost) / item.unitCost;
  return {
    kind: "saving",
    severity: "success",
    title: `${item.partName}: ${alt.packaging} sai ${pct(delta * 100)}% mais barato`,
    description:
      `A ${alt.supplierName} entrega a ${brl(alt.unitCost)} por ${item.stockUnit}; ` +
      `esta compra saiu a ${brl(item.unitCost)}.`,
  };
}

function fiscalCard(items: IAnalysisItem[]): IAnalysisCard | null {
  const diverging = items.filter(
    (item) => item.ncm && item.catalogNcm && item.ncm !== item.catalogNcm,
  );
  if (diverging.length === 0) return null;
  const first = diverging[0];
  return {
    kind: "fiscal",
    severity: "warning",
    title: `NCM da nota difere do cadastro em ${diverging.length} ${diverging.length > 1 ? "itens" : "item"}`,
    description:
      `${first.partName} veio como ${first.ncm}; o cadastro diz ${first.catalogNcm}. ` +
      `Divergência de NCM muda imposto — conferir com a contabilidade antes de lançar.`,
  };
}

function registryCard(input: IAnalysisInput): IAnalysisCard | null {
  if (!input.supplierIsNew) return null;
  return {
    kind: "registry",
    severity: "info",
    title: `${input.supplierName} — fornecedor criado na importação`,
    description:
      "Nasceu do XML com razão social, CNPJ, IE e endereço. Faltam contato e categoria, " +
      "que não vêm no arquivo.",
  };
}

function fractioningCard(item: IAnalysisItem): IAnalysisCard | null {
  const fraction = item.fractionCandidate;
  if (!fraction || (item.monthlySales ?? 0) > 0) return null;
  return {
    kind: "fractioning",
    severity: "info",
    title: `${item.partName}: fracionar em ${fraction.partName}`,
    description:
      `A embalagem comprada está parada, e ${fraction.partName} vende ${fraction.monthlySales} por mês. ` +
      "Fracionar no recebimento libera venda no balcão sem parar capital.",
  };
}

function duplicateCard(input: IAnalysisInput): IAnalysisCard {
  const duplicated = input.knownAccessKeys.includes(input.accessKey);
  return duplicated
    ? {
        kind: "duplicate",
        severity: "danger",
        title: "Chave de acesso já existe no sistema",
        description: `A chave ${input.accessKey} já pertence a outra nota — este XML entraria duas vezes.`,
      }
    : {
        kind: "duplicate",
        severity: "success",
        title: "Nenhuma chave duplicada",
        description: "A chave de acesso desta nota não colide com nenhuma já importada.",
      };
}

export function analyzeNote(input: IAnalysisInput): IAnalysisCard[] {
  const cards: IAnalysisCard[] = [];

  for (const item of input.items) {
    const history = item.partId ? (input.purchaseHistory[item.partId] ?? []) : [];
    const price = priceCard(item, history);
    if (price) cards.push(price);
    const saving = savingCard(item);
    if (saving) cards.push(saving);
    const fractioning = fractioningCard(item);
    if (fractioning) cards.push(fractioning);
  }

  const fiscal = fiscalCard(input.items);
  if (fiscal) cards.push(fiscal);
  const registry = registryCard(input);
  if (registry) cards.push(registry);

  cards.push(duplicateCard(input));
  return cards;
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

```bash
bun run test -- src/features/fiscal-notes/engine/analysis.test.ts
```

Esperado: PASS, 8 testes.

- [ ] **Step 5: Escrever os barrels**

`src/features/fiscal-notes/engine/index.ts`:

```ts
export * from "./nfeKey";
export * from "./xml";
export * from "./nfeParser";
export * from "./costAllocation";
export * from "./unitConversion";
export * from "./averageCost";
export * from "./itemMatcher";
export * from "./analysis";
```

`src/features/fiscal-notes/index.ts`:

```ts
export * from "./engine";
```

- [ ] **Step 6: Rodar a suíte inteira do engine**

```bash
bun run test -- src/features/fiscal-notes
```

Esperado: PASS — 7 arquivos de teste, 55 testes.

- [ ] **Step 7: Commit**

```bash
git add src/features/fiscal-notes/engine/analysis.ts src/features/fiscal-notes/engine/analysis.test.ts src/features/fiscal-notes/engine/index.ts src/features/fiscal-notes/index.ts
git commit -m "feat(fiscal-notes): build the deterministic analysis cards"
```

---

### Task 8: Espelhamento para as Edge Functions

**Files:**
- Create: `scripts/sync-fiscal-shared.ts`
- Modify: `package.json`
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: os módulos de Task 1–4
- Produces: `supabase/functions/_shared/fiscal/*.ts` (gerado, não editado à mão)

> Espelha só os quatro módulos que as Edge Functions das origens 2, 3 e 4 vão usar: `nfeKey`, `xml`, `nfeParser`, `costAllocation`. `unitConversion`, `averageCost`, `itemMatcher` e `analysis` rodam na conferência, que é sempre no cliente — espelhar o que ninguém importa só cria superfície para divergir.

- [ ] **Step 1: Escrever o script**

`scripts/sync-fiscal-shared.ts` — mesmo formato de `scripts/sync-sdr-shared.ts`:

```ts
/**
 * Espelha o núcleo de leitura da NF-e para a árvore das Edge Functions, para
 * que fiscal-note-import, fiscal-note-inbox e fiscal-note-sefaz (Deno) reusem
 * parseNfe/isValidNfeKey/allocateCharges sem duplicá-los à mão.
 *
 *   src/features/fiscal-notes/engine/{nfeKey,xml,nfeParser,costAllocation}.ts
 *     →  supabase/functions/_shared/fiscal/
 *
 * Só estes quatro: os demais módulos do engine rodam na conferência, que é
 * sempre no cliente. Nenhum deles importa DOM — é o que torna o espelho viável.
 *
 * A única transformação é acrescentar `.ts` aos imports relativos (mesma
 * transformação de scripts/sync-whatsapp-shared.ts). Testes são excluídos.
 *
 * Rodar após QUALQUER mudança nesses quatro arquivos:
 *   bun run sync:fiscal
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const ROOT = join(import.meta.dirname ?? ".", "..");
const SRC = join(ROOT, "src", "features", "fiscal-notes", "engine");
const DEST = join(ROOT, "supabase", "functions", "_shared", "fiscal");
const FILES = ["nfeKey.ts", "xml.ts", "nfeParser.ts", "costAllocation.ts"];

function addTsExtensions(source: string): string {
  return source.replace(
    /(from\s+")(\.{1,2}\/[^"]+)(")/g,
    (whole, prefix: string, specifier: string, suffix: string) =>
      specifier.endsWith(".ts") ? whole : `${prefix}${specifier}.ts${suffix}`,
  );
}

rmSync(DEST, { recursive: true, force: true });
for (const file of FILES) {
  const target = join(DEST, file);
  mkdirSync(dirname(target), { recursive: true });
  const banner = `// AUTO-GENERATED MIRROR — DO NOT EDIT.\n// Source: src/features/fiscal-notes/engine/${file} (sync: bun run sync:fiscal)\n\n`;
  writeFileSync(target, banner + addTsExtensions(readFileSync(join(SRC, file), "utf8")));
}
console.log(`synced ${FILES.length} files → supabase/functions/_shared/fiscal/`);
```

- [ ] **Step 2: Registrar o script no package.json**

Em `package.json`, na seção `scripts`, junto aos outros `sync:*` se existirem, senão após `test`:

```json
"sync:fiscal": "bun run scripts/sync-fiscal-shared.ts"
```

- [ ] **Step 3: Rodar e conferir a saída**

```bash
bun run sync:fiscal
```

Esperado: `synced 4 files → supabase/functions/_shared/fiscal/`

- [ ] **Step 4: Verificar que o espelho não tem import quebrado nem DOM**

```bash
grep -rn "from \"\./" supabase/functions/_shared/fiscal/
grep -rniE "DOMParser|document\.|window\." supabase/functions/_shared/fiscal/ ; echo "exit=$?"
```

Esperado: todo import relativo termina em `.ts`; o segundo grep não acha nada (`exit=1`).

- [ ] **Step 5: Registrar a regra no CLAUDE.md**

Na seção de regras de infra do `CLAUDE.md`, ao lado da regra do WhatsApp, acrescentar:

```markdown
- Mudou `src/features/fiscal-notes/engine/{nfeKey,xml,nfeParser,costAllocation}.ts`? Rode `bun run sync:fiscal` (espelha em `supabase/functions/_shared/fiscal/`) e redeploye as Edge Functions de nota fiscal.
```

- [ ] **Step 6: Commit**

```bash
git add scripts/sync-fiscal-shared.ts package.json CLAUDE.md supabase/functions/_shared/fiscal/
git commit -m "chore(fiscal-notes): mirror the NF-e parsing core into Edge Functions"
```

---

### Task 9: Schema no banco

**Files:**
- Create: `supabase/migrations/20260817120000_fiscal_notes_schema.sql`
- Create: `supabase/migrations/20260817120100_fiscal_learning_tables.sql`
- Create: `supabase/migrations/20260817120200_fiscal_xml_bucket.sql`

**Interfaces:**
- Consumes: `public.stores(id)`, `public.parts(id)`, `public.profiles(id)` — todos `uuid`
- Produces: as sete tabelas e o bucket que a Task 10 e 11 leem

> ⚠️ **Esta task NÃO aplica nada.** Os arquivos ficam no repositório aguardando aplicação manual com OK explícito do dono. Não usar `apply_migration` via MCP.

- [ ] **Step 1: Escrever a migration do schema principal**

`supabase/migrations/20260817120000_fiscal_notes_schema.sql`:

```sql
-- PRD-216 (Tally) — notas fiscais de entrada: fornecedor, nota, itens e duplicatas.
--
-- NADA acontece ao aplicar: as tabelas nascem vazias e nenhuma feature escreve
-- nelas até a Fase 2. `entrada_compra` continua derivado de notas lançadas em
-- deriveInventoryMovements — não há tabela de movimentação aqui, de propósito.
--
-- Contas a pagar está fora do escopo do PRD-216. `fiscal_note_duplicates`
-- existe e é populada, mas nenhum consumidor lê dela ainda: o módulo
-- financeiro que vira título é outro PRD.

create table public.suppliers (
  id                  uuid primary key default gen_random_uuid(),
  store_id            uuid not null references public.stores(id),
  cnpj                text not null,
  corporate_name      text not null,
  trade_name          text,
  state_registration  text,
  address             text,
  payment_terms       text,
  contact_name        text,
  contact_email       text,
  contact_phone       text,
  category            text,
  active              boolean not null default true,
  created_from_xml    boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

comment on table public.suppliers is
  'PRD-216: fornecedor de mercadoria. Vínculo da nota é pelo CNPJ.';
comment on column public.suppliers.created_from_xml is
  'true quando o cadastro nasceu do bloco <emit> de um XML. Contato e categoria ficam vazios de propósito — não vêm no arquivo e inventá-los é pior que deixar em branco.';

-- Um CNPJ por loja: é a chave de vínculo da importação.
create unique index suppliers_store_cnpj_uniq on public.suppliers (store_id, cnpj);

create table public.fiscal_notes (
  id              uuid primary key default gen_random_uuid(),
  store_id        uuid not null references public.stores(id),
  access_key      text not null,
  number          text not null,
  series          text not null,
  supplier_id     uuid not null references public.suppliers(id),
  issued_at       timestamptz not null,
  entered_at      timestamptz not null default now(),
  status          text not null default 'conferencia'
    check (status in ('conferencia','lancada','cancelada')),
  origin          text not null
    check (origin in ('upload','upload_edge','email','sefaz','manual')),
  freight         numeric not null default 0,
  ipi             numeric not null default 0,
  discount        numeric not null default 0,
  products_total  numeric not null default 0,
  total           numeric not null default 0,
  xml_path        text,
  posted_at       timestamptz,
  posted_by       uuid references public.profiles(id),
  division        text not null default 'parts',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint fiscal_notes_access_key_len check (access_key ~ '^[0-9]{44}$')
);

comment on column public.fiscal_notes.access_key is
  'Chave de 44 dígitos. O unique abaixo é a barreira estrutural contra o mesmo XML entrar duas vezes — não confiar só na checagem da aplicação.';
comment on column public.fiscal_notes.origin is
  'manual fica reservado: nota digitada está fora do escopo do PRD-216 e não tem produtor.';

create unique index fiscal_notes_access_key_uniq on public.fiscal_notes (access_key);
create index fiscal_notes_store_status_idx on public.fiscal_notes (store_id, status);
create index fiscal_notes_supplier_idx on public.fiscal_notes (supplier_id, issued_at desc);

create table public.fiscal_note_items (
  id                        uuid primary key default gen_random_uuid(),
  note_id                   uuid not null references public.fiscal_notes(id) on delete cascade,
  seq                       integer not null,
  supplier_code             text not null,
  description               text not null,
  ncm                       text,
  cfop                      text,
  ean                       text,
  unit                      text not null,
  quantity                  numeric not null,
  unit_value                numeric not null,
  total_value               numeric not null,
  link_mode                 text not null default 'pend'
    check (link_mode in ('auto','ia','novo','pend')),
  part_id                   uuid references public.parts(id),
  new_part_draft            jsonb,
  conversion_mode           text not null default 'direto'
    check (conversion_mode in ('direto','conv','frac')),
  conversion_factor         numeric,
  conversion_unit           text,
  conversion_target_part_id uuid references public.parts(id),
  ai_confidence             smallint check (ai_confidence between 0 and 100),
  ai_evidence               text,
  alert                     text,
  confirmed                 boolean not null default false
);

comment on column public.fiscal_note_items.conversion_factor is
  'null bloqueia o lançamento de propósito: item sem fator não sabe quanto entra no estoque.';

create index fiscal_note_items_note_idx on public.fiscal_note_items (note_id, seq);
create index fiscal_note_items_part_idx on public.fiscal_note_items (part_id);

create table public.fiscal_note_duplicates (
  id        uuid primary key default gen_random_uuid(),
  note_id   uuid not null references public.fiscal_notes(id) on delete cascade,
  number    text not null,
  due_date  date not null,
  amount    numeric not null
);

create index fiscal_note_duplicates_note_idx on public.fiscal_note_duplicates (note_id, due_date);

-- ---------------------------------------------------------------- RLS

alter table public.suppliers enable row level security;
alter table public.fiscal_notes enable row level security;
alter table public.fiscal_note_items enable row level security;
alter table public.fiscal_note_duplicates enable row level security;

-- O wrapper (select fn()) faz o helper rodar UMA vez por query em vez de por
-- linha. Sem ele, este projeto já teve storm de statement_timeout.

create policy suppliers_select on public.suppliers for select to authenticated
using (
  store_id = (select public.current_store_id())
  and (select public.is_staff())
);

create policy suppliers_write on public.suppliers for all to authenticated
using (
  store_id = (select public.current_store_id())
  and (select public.is_staff())
)
with check (
  store_id = (select public.current_store_id())
  and (select public.is_staff())
);

create policy fiscal_notes_select on public.fiscal_notes for select to authenticated
using (
  store_id = (select public.current_store_id())
  and (select public.is_staff())
);

create policy fiscal_notes_write on public.fiscal_notes for all to authenticated
using (
  store_id = (select public.current_store_id())
  and (select public.is_staff())
)
with check (
  store_id = (select public.current_store_id())
  and (select public.is_staff())
);

-- Filhos herdam o alcance do pai por EXISTS. `exists` sobre a PK da nota usa
-- índice e não vira scan por linha.

create policy fiscal_note_items_all on public.fiscal_note_items for all to authenticated
using (
  exists (
    select 1 from public.fiscal_notes n
    where n.id = note_id
      and n.store_id = (select public.current_store_id())
      and (select public.is_staff())
  )
)
with check (
  exists (
    select 1 from public.fiscal_notes n
    where n.id = note_id
      and n.store_id = (select public.current_store_id())
      and (select public.is_staff())
  )
);

create policy fiscal_note_duplicates_all on public.fiscal_note_duplicates for all to authenticated
using (
  exists (
    select 1 from public.fiscal_notes n
    where n.id = note_id
      and n.store_id = (select public.current_store_id())
      and (select public.is_staff())
  )
)
with check (
  exists (
    select 1 from public.fiscal_notes n
    where n.id = note_id
      and n.store_id = (select public.current_store_id())
      and (select public.is_staff())
  )
);
```

- [ ] **Step 2: Escrever a migration das tabelas de aprendizado**

`supabase/migrations/20260817120100_fiscal_learning_tables.sql`:

```sql
-- PRD-216 (Tally) — o que a conferência aprende, e a fila das quatro origens.
--
-- supplier_part_codes e supplier_conversion_rules são a razão de a segunda
-- nota do mesmo fornecedor dar trabalho perto de zero: a primeira conferência
-- grava o vínculo e o fator, e a importação seguinte aplica sozinha.

create table public.supplier_part_codes (
  id            uuid primary key default gen_random_uuid(),
  supplier_id   uuid not null references public.suppliers(id) on delete cascade,
  supplier_code text not null,
  part_id       uuid not null references public.parts(id) on delete cascade,
  created_at    timestamptz not null default now(),
  created_by    uuid references public.profiles(id)
);

comment on table public.supplier_part_codes is
  'PRD-216: mapa cProd → SKU por fornecedor, gravado no lançamento da primeira nota que confirmou o par.';

create unique index supplier_part_codes_uniq
  on public.supplier_part_codes (supplier_id, supplier_code);

create table public.supplier_conversion_rules (
  id              uuid primary key default gen_random_uuid(),
  supplier_id     uuid not null references public.suppliers(id) on delete cascade,
  part_id         uuid not null references public.parts(id) on delete cascade,
  mode            text not null check (mode in ('conv','frac')),
  from_unit       text not null,
  factor          numeric not null check (factor > 0),
  to_unit         text not null,
  target_part_id  uuid references public.parts(id),
  applied_count   integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  -- Fracionar sem SKU de destino não diz para onde vai o saldo.
  constraint supplier_conversion_rules_frac_target
    check (mode <> 'frac' or target_part_id is not null)
);

create unique index supplier_conversion_rules_uniq
  on public.supplier_conversion_rules (supplier_id, part_id, from_unit);

create table public.fiscal_note_ingestion_queue (
  id            uuid primary key default gen_random_uuid(),
  store_id      uuid not null references public.stores(id),
  source        text not null check (source in ('upload','upload_edge','email','sefaz')),
  filename      text,
  size_bytes    integer,
  raw_xml_path  text,
  access_key    text,
  status        text not null default 'pending'
    check (status in ('pending','processing','imported','failed','duplicate')),
  error         text,
  note_id       uuid references public.fiscal_notes(id) on delete set null,
  created_at    timestamptz not null default now(),
  processed_at  timestamptz
);

comment on table public.fiscal_note_ingestion_queue is
  'PRD-216: fila única das quatro origens. Na Fase 1 nenhuma escreve — email e sefaz nascem desligadas por falta de credencial e certificado A1 no Vault.';

create index fiscal_note_ingestion_queue_store_status_idx
  on public.fiscal_note_ingestion_queue (store_id, status, created_at desc);

-- ---------------------------------------------------------------- RLS

alter table public.supplier_part_codes enable row level security;
alter table public.supplier_conversion_rules enable row level security;
alter table public.fiscal_note_ingestion_queue enable row level security;

create policy supplier_part_codes_all on public.supplier_part_codes for all to authenticated
using (
  exists (
    select 1 from public.suppliers s
    where s.id = supplier_id
      and s.store_id = (select public.current_store_id())
      and (select public.is_staff())
  )
)
with check (
  exists (
    select 1 from public.suppliers s
    where s.id = supplier_id
      and s.store_id = (select public.current_store_id())
      and (select public.is_staff())
  )
);

create policy supplier_conversion_rules_all on public.supplier_conversion_rules for all to authenticated
using (
  exists (
    select 1 from public.suppliers s
    where s.id = supplier_id
      and s.store_id = (select public.current_store_id())
      and (select public.is_staff())
  )
)
with check (
  exists (
    select 1 from public.suppliers s
    where s.id = supplier_id
      and s.store_id = (select public.current_store_id())
      and (select public.is_staff())
  )
);

create policy fiscal_note_ingestion_queue_all on public.fiscal_note_ingestion_queue for all to authenticated
using (
  store_id = (select public.current_store_id())
  and (select public.is_staff())
)
with check (
  store_id = (select public.current_store_id())
  and (select public.is_staff())
);
```

- [ ] **Step 3: Escrever a migration do bucket**

`supabase/migrations/20260817120200_fiscal_xml_bucket.sql`:

```sql
-- PRD-216 (Tally) — bucket do XML original, para auditoria fiscal.
--
-- PRIVADO. O XML da NF-e carrega CNPJ, endereço e preço de custo do
-- fornecedor — este repositório é público e já teve exposição de PII.
-- Leitura só via URL assinada, nunca por bucket público.

insert into storage.buckets (id, name, public)
values ('fiscal-xml', 'fiscal-xml', false)
on conflict (id) do nothing;

-- Caminho: <store_id>/<access_key>.xml — o prefixo é o que a policy usa para
-- confinar cada loja à sua própria pasta.

create policy "fiscal_xml_read" on storage.objects for select to authenticated
using (
  bucket_id = 'fiscal-xml'
  and (select public.is_staff())
  and (storage.foldername(name))[1] = (select public.current_store_id())::text
);

create policy "fiscal_xml_write" on storage.objects for insert to authenticated
with check (
  bucket_id = 'fiscal-xml'
  and (select public.is_staff())
  and (storage.foldername(name))[1] = (select public.current_store_id())::text
);
```

- [ ] **Step 4: Verificar a sintaxe SQL sem aplicar**

Conferir manualmente contra a checklist e confirmar que nenhum `apply_migration` foi executado:

```bash
grep -c "enable row level security" supabase/migrations/20260817120000_fiscal_notes_schema.sql supabase/migrations/20260817120100_fiscal_learning_tables.sql
```

Esperado: `4` no primeiro arquivo, `3` no segundo — sete tabelas, sete `enable row level security`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260817120000_fiscal_notes_schema.sql supabase/migrations/20260817120100_fiscal_learning_tables.sql supabase/migrations/20260817120200_fiscal_xml_bucket.sql
git commit -m "feat(fiscal-notes): add schema, learning tables and private XML bucket"
```

---

### Task 10: Contracts e provider mock

**Files:**
- Create: `src/providers/data/contracts/suppliers.ts`
- Create: `src/providers/data/contracts/fiscalNotes.ts`
- Modify: `src/providers/data/contracts/index.ts`
- Create: `src/providers/data/impl/mock/suppliers.ts`
- Create: `src/providers/data/impl/mock/fiscalNotes.ts`
- Create: `src/providers/data/hooks/useSuppliersProvider.ts`
- Create: `src/providers/data/hooks/useFiscalNotesProvider.ts`
- Modify: `src/providers/data/factory.ts`
- Modify: `src/providers/data/index.ts`

**Interfaces:**
- Consumes: `ISupplier`, `IFiscalNote`, `IFiscalNoteItem` (Task 1) · `IPaginatedResult`, `IPaginationParams` de `./_shared`
- Produces: `ISuppliersProvider`, `IFiscalNotesProvider`, `IListSuppliersParams`, `IListFiscalNotesParams`, `ICreateFiscalNoteInput`, `IUpdateFiscalNoteItemPatch`, `useSuppliersProvider()`, `useFiscalNotesProvider()`

- [ ] **Step 1: Escrever os contracts**

`src/providers/data/contracts/suppliers.ts`:

```ts
import type { ID, ISupplier } from "@/shared/types";
import type { IPaginatedResult, IPaginationParams } from "./_shared";

export interface IListSuppliersParams extends IPaginationParams {
  search?: string;
  active?: boolean;
  storeId?: ID;
}

/**
 * Contract de acesso a fornecedores (PRD-216).
 *
 * `findByCnpj` é a operação central da importação: é ela que decide entre
 * vincular a nota a um cadastro existente ou criar um do bloco `<emit>`.
 */
export interface ISuppliersProvider {
  list(params?: IListSuppliersParams): Promise<IPaginatedResult<ISupplier>>;
  get(id: ID): Promise<ISupplier>;
  /** `cnpj` só dígitos. `null` quando não há cadastro — o chamador cria. */
  findByCnpj(cnpj: string, storeId: ID): Promise<ISupplier | null>;
  create(input: Omit<ISupplier, "id" | "createdAt" | "updatedAt">): Promise<ISupplier>;
  update(id: ID, patch: Partial<ISupplier>): Promise<ISupplier>;
}
```

`src/providers/data/contracts/fiscalNotes.ts`:

```ts
import type { FiscalNoteStatus, ID, IFiscalNote, IFiscalNoteItem } from "@/shared/types";
import type { IPaginatedResult, IPaginationParams } from "./_shared";

export interface IListFiscalNotesParams extends IPaginationParams {
  status?: FiscalNoteStatus;
  supplierId?: ID;
  storeId?: ID;
  search?: string;
}

export type ICreateFiscalNoteInput = Omit<
  IFiscalNote,
  "id" | "createdAt" | "updatedAt" | "postedAt" | "postedBy" | "items" | "duplicates"
> & {
  items: Array<Omit<IFiscalNoteItem, "id" | "noteId">>;
  duplicates: Array<{ number: string; dueDate: string; amount: number }>;
};

export type IUpdateFiscalNoteItemPatch = Partial<
  Pick<
    IFiscalNoteItem,
    | "linkMode"
    | "partId"
    | "newPartDraft"
    | "conversionMode"
    | "conversionFactor"
    | "conversionUnit"
    | "conversionTargetPartId"
    | "confirmed"
  >
>;

/**
 * Contract de acesso a notas fiscais de entrada (PRD-216).
 *
 * Não há `delete`: nota lançada é imutável e nota em conferência se cancela,
 * não se apaga — o XML já foi arquivado e a trilha tem de sobreviver.
 *
 * `post` e `reverse` não existem nesta fase: são a RPC transacional da Fase 3.
 */
export interface IFiscalNotesProvider {
  list(params?: IListFiscalNotesParams): Promise<IPaginatedResult<IFiscalNote>>;
  get(id: ID): Promise<IFiscalNote>;
  /** `null` quando a chave ainda não existe. Barreira anti-reentrada de XML. */
  findByAccessKey(accessKey: string): Promise<IFiscalNote | null>;
  create(input: ICreateFiscalNoteInput): Promise<IFiscalNote>;
  updateItem(itemId: ID, patch: IUpdateFiscalNoteItemPatch): Promise<IFiscalNoteItem>;
  cancel(id: ID): Promise<IFiscalNote>;
}
```

- [ ] **Step 2: Registrar no barrel de contracts**

Em `src/providers/data/contracts/index.ts`, acrescentar as reexportações no mesmo formato das vizinhas e incluir as duas fatias na interface `IDataProviders`:

```ts
export type {
  ISuppliersProvider,
  IListSuppliersParams,
} from "./suppliers";
export type {
  IFiscalNotesProvider,
  IListFiscalNotesParams,
  ICreateFiscalNoteInput,
  IUpdateFiscalNoteItemPatch,
} from "./fiscalNotes";
```

E dentro de `IDataProviders`:

```ts
  suppliers: ISuppliersProvider;
  fiscalNotes: IFiscalNotesProvider;
```

- [ ] **Step 3: Escrever o teste do provider mock (vai falhar)**

`src/providers/data/impl/mock/fiscalNotes.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { mockFiscalNotesProvider, __resetFiscalNotesMock } from "./fiscalNotes";
import { mockSuppliersProvider, __resetSuppliersMock } from "./suppliers";

const KEY = "35260804887213000190550010000301291000301298";

async function seedNote() {
  const supplier = await mockSuppliersProvider.create({
    storeId: "store-1",
    cnpj: "04887213000190",
    corporateName: "DIESELTEC DISTRIBUIDORA LTDA",
    active: true,
    createdFromXml: true,
  });
  return mockFiscalNotesProvider.create({
    storeId: "store-1",
    accessKey: KEY,
    number: "30129",
    series: "1",
    supplierId: supplier.id,
    issuedAt: "2026-08-14T09:12:00-03:00",
    enteredAt: "2026-08-17T10:00:00-03:00",
    status: "conferencia",
    origin: "upload",
    freight: 182.2,
    ipi: 214.9,
    discount: 0,
    productsTotal: 2952.8,
    total: 3349.9,
    division: "parts",
    items: [
      {
        seq: 1,
        supplierCode: "RC-R60T",
        description: "FILTRO SEPARADOR RACOR R60T CX C/12",
        unit: "CX",
        quantity: 2,
        unitValue: 698.4,
        totalValue: 1396.8,
        linkMode: "pend",
        conversionMode: "direto",
        conversionFactor: null,
        confirmed: false,
      },
    ],
    duplicates: [{ number: "001", dueDate: "2026-09-16", amount: 1116.64 }],
  });
}

describe("mockFiscalNotesProvider", () => {
  beforeEach(() => {
    __resetFiscalNotesMock();
    __resetSuppliersMock();
  });

  it("creates a note with ids assigned to items and duplicates", async () => {
    const note = await seedNote();
    expect(note.id).toBeTruthy();
    expect(note.items[0].id).toBeTruthy();
    expect(note.items[0].noteId).toBe(note.id);
    expect(note.duplicates[0].id).toBeTruthy();
  });

  it("finds a note by access key", async () => {
    const note = await seedNote();
    expect((await mockFiscalNotesProvider.findByAccessKey(KEY))?.id).toBe(note.id);
  });

  it("returns null for an unknown access key", async () => {
    await seedNote();
    expect(await mockFiscalNotesProvider.findByAccessKey("0".repeat(44))).toBeNull();
  });

  it("refuses a duplicated access key", async () => {
    await seedNote();
    await expect(seedNote()).rejects.toThrow(/chave/i);
  });

  it("patches an item and leaves the others alone", async () => {
    const note = await seedNote();
    const updated = await mockFiscalNotesProvider.updateItem(note.items[0].id, {
      linkMode: "auto",
      partId: "p-r60t",
      conversionMode: "conv",
      conversionFactor: 12,
      conversionUnit: "UN",
      confirmed: true,
    });
    expect(updated.confirmed).toBe(true);
    expect(updated.conversionFactor).toBe(12);
    // a descrição veio do XML e não pode ter sido tocada
    expect(updated.description).toBe("FILTRO SEPARADOR RACOR R60T CX C/12");
  });

  it("filters the list by status", async () => {
    await seedNote();
    expect((await mockFiscalNotesProvider.list({ status: "conferencia" })).total).toBe(1);
    expect((await mockFiscalNotesProvider.list({ status: "lancada" })).total).toBe(0);
  });

  it("cancels a note without deleting it", async () => {
    const note = await seedNote();
    expect((await mockFiscalNotesProvider.cancel(note.id)).status).toBe("cancelada");
    expect(await mockFiscalNotesProvider.get(note.id)).toBeTruthy();
  });
});

describe("mockSuppliersProvider", () => {
  beforeEach(() => __resetSuppliersMock());

  it("finds a supplier by CNPJ within the store", async () => {
    const created = await mockSuppliersProvider.create({
      storeId: "store-1",
      cnpj: "04887213000190",
      corporateName: "DIESELTEC",
      active: true,
      createdFromXml: true,
    });
    expect((await mockSuppliersProvider.findByCnpj("04887213000190", "store-1"))?.id).toBe(created.id);
  });

  it("returns null when the CNPJ belongs to another store", async () => {
    await mockSuppliersProvider.create({
      storeId: "store-1",
      cnpj: "04887213000190",
      corporateName: "DIESELTEC",
      active: true,
      createdFromXml: true,
    });
    expect(await mockSuppliersProvider.findByCnpj("04887213000190", "store-2")).toBeNull();
  });
});
```

- [ ] **Step 4: Rodar e confirmar que falha**

```bash
bun run test -- src/providers/data/impl/mock/fiscalNotes.test.ts
```

Esperado: FAIL — `Failed to resolve import "./fiscalNotes"`.

- [ ] **Step 5: Implementar o mock de fornecedores**

`src/providers/data/impl/mock/suppliers.ts`:

```ts
import type { ID, ISupplier } from "@/shared/types";
import type { IListSuppliersParams, ISuppliersProvider } from "../../contracts/suppliers";
import type { IPaginatedResult } from "../../contracts/_shared";

/**
 * Mock de fornecedores (PRD-216). Estado em memória — a Fase 1 não popula
 * nada pelo gerador de seeds, porque não há tela para exibir. Existe para
 * o parser e a importação da Fase 2 terem contra o que rodar.
 */

let store: ISupplier[] = [];

/** Uso exclusivo de teste. */
export function __resetSuppliersMock(): void {
  store = [];
}

export const mockSuppliersProvider: ISuppliersProvider = {
  async list(params: IListSuppliersParams = {}): Promise<IPaginatedResult<ISupplier>> {
    let rows = [...store];
    if (params.storeId) rows = rows.filter((s) => s.storeId === params.storeId);
    if (params.active !== undefined) rows = rows.filter((s) => s.active === params.active);
    if (params.search) {
      const needle = params.search.toLowerCase();
      rows = rows.filter(
        (s) =>
          s.corporateName.toLowerCase().includes(needle) ||
          (s.tradeName ?? "").toLowerCase().includes(needle) ||
          s.cnpj.includes(needle.replace(/\D/g, "")),
      );
    }
    const page = params.page ?? 1;
    const pageSize = params.pageSize ?? 20;
    return {
      data: rows.slice((page - 1) * pageSize, page * pageSize),
      total: rows.length,
      page,
      pageSize,
    };
  },

  async get(id: ID): Promise<ISupplier> {
    const found = store.find((s) => s.id === id);
    if (!found) throw new Error(`[mock] suppliers.get(${id}): fornecedor não encontrado`);
    return found;
  },

  async findByCnpj(cnpj: string, storeId: ID): Promise<ISupplier | null> {
    const digits = cnpj.replace(/\D/g, "");
    return store.find((s) => s.cnpj === digits && s.storeId === storeId) ?? null;
  },

  async create(input: Omit<ISupplier, "id" | "createdAt" | "updatedAt">): Promise<ISupplier> {
    const digits = input.cnpj.replace(/\D/g, "");
    if (store.some((s) => s.cnpj === digits && s.storeId === input.storeId)) {
      throw new Error(`[mock] suppliers.create: CNPJ ${digits} já cadastrado nesta loja`);
    }
    const now = new Date().toISOString();
    const supplier: ISupplier = { ...input, cnpj: digits, id: crypto.randomUUID(), createdAt: now, updatedAt: now };
    store.push(supplier);
    return supplier;
  },

  async update(id: ID, patch: Partial<ISupplier>): Promise<ISupplier> {
    const index = store.findIndex((s) => s.id === id);
    if (index === -1) throw new Error(`[mock] suppliers.update(${id}): fornecedor não encontrado`);
    const { id: _ignoredId, createdAt: _ignoredCreatedAt, ...safe } = patch;
    store[index] = { ...store[index], ...safe, updatedAt: new Date().toISOString() };
    return store[index];
  },
};
```

- [ ] **Step 6: Implementar o mock de notas**

`src/providers/data/impl/mock/fiscalNotes.ts`:

```ts
import type { ID, IFiscalNote, IFiscalNoteItem } from "@/shared/types";
import type {
  ICreateFiscalNoteInput,
  IFiscalNotesProvider,
  IListFiscalNotesParams,
  IUpdateFiscalNoteItemPatch,
} from "../../contracts/fiscalNotes";
import type { IPaginatedResult } from "../../contracts/_shared";

/**
 * Mock de notas fiscais de entrada (PRD-216).
 *
 * Reproduz a barreira que o banco impõe por unique index: chave de acesso
 * repetida é rejeitada. O mock precisa recusar tanto quanto o Supabase, senão
 * o comportamento diverge entre as duas fontes e o bug só aparece em produção.
 */

let notes: IFiscalNote[] = [];

/** Uso exclusivo de teste. */
export function __resetFiscalNotesMock(): void {
  notes = [];
}

export const mockFiscalNotesProvider: IFiscalNotesProvider = {
  async list(params: IListFiscalNotesParams = {}): Promise<IPaginatedResult<IFiscalNote>> {
    let rows = [...notes];
    if (params.storeId) rows = rows.filter((n) => n.storeId === params.storeId);
    if (params.status) rows = rows.filter((n) => n.status === params.status);
    if (params.supplierId) rows = rows.filter((n) => n.supplierId === params.supplierId);
    if (params.search) {
      const needle = params.search.toLowerCase();
      rows = rows.filter((n) => n.number.includes(needle) || n.accessKey.includes(needle));
    }
    rows.sort((a, b) => b.issuedAt.localeCompare(a.issuedAt));

    const page = params.page ?? 1;
    const pageSize = params.pageSize ?? 20;
    return {
      data: rows.slice((page - 1) * pageSize, page * pageSize),
      total: rows.length,
      page,
      pageSize,
    };
  },

  async get(id: ID): Promise<IFiscalNote> {
    const found = notes.find((n) => n.id === id);
    if (!found) throw new Error(`[mock] fiscalNotes.get(${id}): nota não encontrada`);
    return found;
  },

  async findByAccessKey(accessKey: string): Promise<IFiscalNote | null> {
    return notes.find((n) => n.accessKey === accessKey) ?? null;
  },

  async create(input: ICreateFiscalNoteInput): Promise<IFiscalNote> {
    if (notes.some((n) => n.accessKey === input.accessKey)) {
      throw new Error(`[mock] fiscalNotes.create: chave de acesso ${input.accessKey} já importada`);
    }
    const id: ID = crypto.randomUUID();
    const now = new Date().toISOString();
    const { items, duplicates, ...header } = input;

    const note: IFiscalNote = {
      ...header,
      id,
      items: items.map((item) => ({ ...item, id: crypto.randomUUID(), noteId: id })),
      duplicates: duplicates.map((dup) => ({ ...dup, id: crypto.randomUUID() })),
      createdAt: now,
      updatedAt: now,
    };
    notes.push(note);
    return note;
  },

  async updateItem(itemId: ID, patch: IUpdateFiscalNoteItemPatch): Promise<IFiscalNoteItem> {
    for (const note of notes) {
      const index = note.items.findIndex((item) => item.id === itemId);
      if (index === -1) continue;
      if (note.status !== "conferencia") {
        throw new Error(`[mock] fiscalNotes.updateItem(${itemId}): nota ${note.status} é imutável`);
      }
      note.items[index] = { ...note.items[index], ...patch };
      note.updatedAt = new Date().toISOString();
      return note.items[index];
    }
    throw new Error(`[mock] fiscalNotes.updateItem(${itemId}): item não encontrado`);
  },

  async cancel(id: ID): Promise<IFiscalNote> {
    const index = notes.findIndex((n) => n.id === id);
    if (index === -1) throw new Error(`[mock] fiscalNotes.cancel(${id}): nota não encontrada`);
    if (notes[index].status === "lancada") {
      throw new Error(`[mock] fiscalNotes.cancel(${id}): nota lançada se estorna, não se cancela`);
    }
    notes[index] = { ...notes[index], status: "cancelada", updatedAt: new Date().toISOString() };
    return notes[index];
  },
};
```

- [ ] **Step 7: Escrever os hooks**

`src/providers/data/hooks/useSuppliersProvider.ts`:

```ts
import type { ISuppliersProvider } from "../contracts/suppliers";
import { useDataProviderSlice } from "./_useDataProviderSlice";

export function useSuppliersProvider(): ISuppliersProvider {
  return useDataProviderSlice("suppliers", "useSuppliersProvider");
}
```

`src/providers/data/hooks/useFiscalNotesProvider.ts`:

```ts
import type { IFiscalNotesProvider } from "../contracts/fiscalNotes";
import { useDataProviderSlice } from "./_useDataProviderSlice";

export function useFiscalNotesProvider(): IFiscalNotesProvider {
  return useDataProviderSlice("fiscalNotes", "useFiscalNotesProvider");
}
```

- [ ] **Step 8: Ligar no factory e no barrel**

Em `src/providers/data/factory.ts`, acrescentar os imports mock junto aos outros e as duas fatias em `mockProviders`:

```ts
import { mockSuppliersProvider } from "./impl/mock/suppliers";
import { mockFiscalNotesProvider } from "./impl/mock/fiscalNotes";
```

```ts
  suppliers: mockSuppliersProvider,
  fiscalNotes: mockFiscalNotesProvider,
```

Em `src/providers/data/index.ts`, acrescentar às exportações de tipo e de hook:

```ts
export { useSuppliersProvider } from "./hooks/useSuppliersProvider";
export { useFiscalNotesProvider } from "./hooks/useFiscalNotesProvider";
```

E no bloco `export type { ... }`: `ISuppliersProvider`, `IListSuppliersParams`, `IFiscalNotesProvider`, `IListFiscalNotesParams`, `ICreateFiscalNoteInput`, `IUpdateFiscalNoteItemPatch`.

- [ ] **Step 9: Rodar e confirmar que passa**

```bash
bun run test -- src/providers/data/impl/mock/fiscalNotes.test.ts
```

Esperado: PASS, 9 testes.

- [ ] **Step 10: Commit**

```bash
git add src/providers/data/contracts/suppliers.ts src/providers/data/contracts/fiscalNotes.ts src/providers/data/contracts/index.ts src/providers/data/impl/mock/suppliers.ts src/providers/data/impl/mock/fiscalNotes.ts src/providers/data/impl/mock/fiscalNotes.test.ts src/providers/data/hooks/useSuppliersProvider.ts src/providers/data/hooks/useFiscalNotesProvider.ts src/providers/data/factory.ts src/providers/data/index.ts
git commit -m "feat(fiscal-notes): add suppliers and fiscal notes contracts with mock providers"
```

---

### Task 11: Provider Supabase

**Files:**
- Create: `src/providers/data/impl/supabase/suppliers.ts`
- Create: `src/providers/data/impl/supabase/fiscalNotes.ts`
- Modify: `src/providers/data/factory.ts`

**Interfaces:**
- Consumes: `ISuppliersProvider`, `IFiscalNotesProvider` (Task 10) · `getSupabaseClient` de `@/shared/lib/supabase`
- Produces: `supabaseSuppliersProvider`, `supabaseFiscalNotesProvider`

- [ ] **Step 1: Implementar o provider de fornecedores**

`src/providers/data/impl/supabase/suppliers.ts`:

```ts
import type { ID, ISupplier } from "@/shared/types";
import type { IListSuppliersParams, ISuppliersProvider } from "../../contracts/suppliers";
import type { IPaginatedResult } from "../../contracts/_shared";
import { getSupabaseClient } from "@/shared/lib/supabase";

/**
 * Implementação Supabase de {@link ISuppliersProvider} (PRD-216).
 *
 * `suppliers` snake_case ↔ {@link ISupplier} camelCase via `rowToSupplier`.
 * O unique index `(store_id, cnpj)` é a barreira real do vínculo por CNPJ —
 * `findByCnpj` usa `maybeSingle`, então CNPJ novo devolve `null` em vez de
 * erro, que é o caminho normal da importação, não uma exceção.
 */

interface SupplierRow {
  id: string;
  store_id: string;
  cnpj: string;
  corporate_name: string;
  trade_name: string | null;
  state_registration: string | null;
  address: string | null;
  payment_terms: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  category: string | null;
  active: boolean;
  created_from_xml: boolean;
  created_at: string;
  updated_at: string;
}

const TABLE = "suppliers";
const COLUMNS =
  "id, store_id, cnpj, corporate_name, trade_name, state_registration, address, payment_terms, contact_name, contact_email, contact_phone, category, active, created_from_xml, created_at, updated_at";

function rowToSupplier(row: SupplierRow): ISupplier {
  return {
    id: row.id,
    storeId: row.store_id,
    cnpj: row.cnpj,
    corporateName: row.corporate_name,
    tradeName: row.trade_name ?? undefined,
    stateRegistration: row.state_registration ?? undefined,
    address: row.address ?? undefined,
    paymentTerms: row.payment_terms ?? undefined,
    contactName: row.contact_name ?? undefined,
    contactEmail: row.contact_email ?? undefined,
    contactPhone: row.contact_phone ?? undefined,
    category: row.category ?? undefined,
    active: row.active,
    createdFromXml: row.created_from_xml,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function supplierToRow(patch: Partial<ISupplier>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (patch.cnpj !== undefined) row.cnpj = patch.cnpj.replace(/\D/g, "");
  if (patch.corporateName !== undefined) row.corporate_name = patch.corporateName;
  if (patch.tradeName !== undefined) row.trade_name = patch.tradeName ?? null;
  if (patch.stateRegistration !== undefined) row.state_registration = patch.stateRegistration ?? null;
  if (patch.address !== undefined) row.address = patch.address ?? null;
  if (patch.paymentTerms !== undefined) row.payment_terms = patch.paymentTerms ?? null;
  if (patch.contactName !== undefined) row.contact_name = patch.contactName ?? null;
  if (patch.contactEmail !== undefined) row.contact_email = patch.contactEmail ?? null;
  if (patch.contactPhone !== undefined) row.contact_phone = patch.contactPhone ?? null;
  if (patch.category !== undefined) row.category = patch.category ?? null;
  if (patch.active !== undefined) row.active = patch.active;
  return row;
}

export const supabaseSuppliersProvider: ISuppliersProvider = {
  async list(params: IListSuppliersParams = {}): Promise<IPaginatedResult<ISupplier>> {
    const page = params.page ?? 1;
    const pageSize = params.pageSize ?? 20;

    let query = getSupabaseClient().from(TABLE).select(COLUMNS, { count: "exact" });
    if (params.storeId) query = query.eq("store_id", params.storeId);
    if (params.active !== undefined) query = query.eq("active", params.active);
    if (params.search) {
      const digits = params.search.replace(/\D/g, "");
      query = digits
        ? query.or(`corporate_name.ilike.%${params.search}%,cnpj.ilike.%${digits}%`)
        : query.ilike("corporate_name", `%${params.search}%`);
    }

    const { data, error, count } = await query
      .order("corporate_name", { ascending: true })
      .range((page - 1) * pageSize, page * pageSize - 1);
    if (error) throw new Error(`[supabase] suppliers.list failed: ${error.message}`);

    return {
      data: (data as unknown as SupplierRow[]).map(rowToSupplier),
      total: count ?? 0,
      page,
      pageSize,
    };
  },

  async get(id: ID): Promise<ISupplier> {
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .select(COLUMNS)
      .eq("id", id)
      .single();
    if (error) throw new Error(`[supabase] suppliers.get(${id}) failed: ${error.message}`);
    return rowToSupplier(data as unknown as SupplierRow);
  },

  async findByCnpj(cnpj: string, storeId: ID): Promise<ISupplier | null> {
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .select(COLUMNS)
      .eq("cnpj", cnpj.replace(/\D/g, ""))
      .eq("store_id", storeId)
      .maybeSingle();
    if (error) throw new Error(`[supabase] suppliers.findByCnpj failed: ${error.message}`);
    return data ? rowToSupplier(data as unknown as SupplierRow) : null;
  },

  async create(input: Omit<ISupplier, "id" | "createdAt" | "updatedAt">): Promise<ISupplier> {
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .insert({
        ...supplierToRow(input),
        store_id: input.storeId,
        created_from_xml: input.createdFromXml,
      })
      .select(COLUMNS)
      .single();
    if (error) throw new Error(`[supabase] suppliers.create failed: ${error.message}`);
    return rowToSupplier(data as unknown as SupplierRow);
  },

  async update(id: ID, patch: Partial<ISupplier>): Promise<ISupplier> {
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .update({ ...supplierToRow(patch), updated_at: new Date().toISOString() })
      .eq("id", id)
      .select(COLUMNS)
      .single();
    if (error) throw new Error(`[supabase] suppliers.update(${id}) failed: ${error.message}`);
    return rowToSupplier(data as unknown as SupplierRow);
  },
};
```

- [ ] **Step 2: Implementar o provider de notas**

`src/providers/data/impl/supabase/fiscalNotes.ts`:

```ts
import type { ID, IFiscalNote, IFiscalNoteDuplicate, IFiscalNoteItem } from "@/shared/types";
import type {
  ICreateFiscalNoteInput,
  IFiscalNotesProvider,
  IListFiscalNotesParams,
  IUpdateFiscalNoteItemPatch,
} from "../../contracts/fiscalNotes";
import type { IPaginatedResult } from "../../contracts/_shared";
import { getSupabaseClient } from "@/shared/lib/supabase";

/**
 * Implementação Supabase de {@link IFiscalNotesProvider} (PRD-216).
 *
 * Itens e duplicatas vivem em tabelas próprias com FK ON DELETE CASCADE e são
 * hidratados por consultas separadas, no mesmo padrão de `modelKits.listItems`.
 *
 * `create` não é transacional: insere o cabeçalho, depois os filhos. O unique
 * index de `access_key` garante que uma reentrada do mesmo XML falha na
 * primeira instrução, antes de qualquer filho existir. O lançamento — esse sim
 * atômico — é a RPC `post_fiscal_note` da Fase 3.
 */

interface FiscalNoteRow {
  id: string;
  store_id: string;
  access_key: string;
  number: string;
  series: string;
  supplier_id: string;
  issued_at: string;
  entered_at: string;
  status: IFiscalNote["status"];
  origin: IFiscalNote["origin"];
  freight: number;
  ipi: number;
  discount: number;
  products_total: number;
  total: number;
  xml_path: string | null;
  posted_at: string | null;
  posted_by: string | null;
  division: IFiscalNote["division"];
  created_at: string;
  updated_at: string;
}

interface FiscalNoteItemRow {
  id: string;
  note_id: string;
  seq: number;
  supplier_code: string;
  description: string;
  ncm: string | null;
  cfop: string | null;
  ean: string | null;
  unit: string;
  quantity: number;
  unit_value: number;
  total_value: number;
  link_mode: IFiscalNoteItem["linkMode"];
  part_id: string | null;
  new_part_draft: IFiscalNoteItem["newPartDraft"] | null;
  conversion_mode: IFiscalNoteItem["conversionMode"];
  conversion_factor: number | null;
  conversion_unit: string | null;
  conversion_target_part_id: string | null;
  ai_confidence: number | null;
  ai_evidence: string | null;
  alert: string | null;
  confirmed: boolean;
}

interface FiscalNoteDuplicateRow {
  id: string;
  note_id: string;
  number: string;
  due_date: string;
  amount: number;
}

const TABLE = "fiscal_notes";
const ITEMS_TABLE = "fiscal_note_items";
const DUPS_TABLE = "fiscal_note_duplicates";

const COLUMNS =
  "id, store_id, access_key, number, series, supplier_id, issued_at, entered_at, status, origin, freight, ipi, discount, products_total, total, xml_path, posted_at, posted_by, division, created_at, updated_at";
const ITEM_COLUMNS =
  "id, note_id, seq, supplier_code, description, ncm, cfop, ean, unit, quantity, unit_value, total_value, link_mode, part_id, new_part_draft, conversion_mode, conversion_factor, conversion_unit, conversion_target_part_id, ai_confidence, ai_evidence, alert, confirmed";
const DUP_COLUMNS = "id, note_id, number, due_date, amount";

function rowToItem(row: FiscalNoteItemRow): IFiscalNoteItem {
  return {
    id: row.id,
    noteId: row.note_id,
    seq: row.seq,
    supplierCode: row.supplier_code,
    description: row.description,
    ncm: row.ncm ?? undefined,
    cfop: row.cfop ?? undefined,
    ean: row.ean ?? undefined,
    unit: row.unit,
    quantity: row.quantity,
    unitValue: row.unit_value,
    totalValue: row.total_value,
    linkMode: row.link_mode,
    partId: row.part_id ?? undefined,
    newPartDraft: row.new_part_draft ?? undefined,
    conversionMode: row.conversion_mode,
    conversionFactor: row.conversion_factor,
    conversionUnit: row.conversion_unit ?? undefined,
    conversionTargetPartId: row.conversion_target_part_id ?? undefined,
    aiConfidence: row.ai_confidence ?? undefined,
    aiEvidence: row.ai_evidence ?? undefined,
    alert: row.alert ?? undefined,
    confirmed: row.confirmed,
  };
}

function rowToDuplicate(row: FiscalNoteDuplicateRow): IFiscalNoteDuplicate {
  return { id: row.id, number: row.number, dueDate: row.due_date, amount: row.amount };
}

function rowToNote(
  row: FiscalNoteRow,
  items: IFiscalNoteItem[],
  duplicates: IFiscalNoteDuplicate[],
): IFiscalNote {
  return {
    id: row.id,
    storeId: row.store_id,
    accessKey: row.access_key,
    number: row.number,
    series: row.series,
    supplierId: row.supplier_id,
    issuedAt: row.issued_at,
    enteredAt: row.entered_at,
    status: row.status,
    origin: row.origin,
    freight: row.freight,
    ipi: row.ipi,
    discount: row.discount,
    productsTotal: row.products_total,
    total: row.total,
    xmlPath: row.xml_path ?? undefined,
    postedAt: row.posted_at ?? undefined,
    postedBy: row.posted_by ?? undefined,
    division: row.division,
    items,
    duplicates,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function itemPatchToRow(patch: IUpdateFiscalNoteItemPatch): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (patch.linkMode !== undefined) row.link_mode = patch.linkMode;
  if (patch.partId !== undefined) row.part_id = patch.partId ?? null;
  if (patch.newPartDraft !== undefined) row.new_part_draft = patch.newPartDraft ?? null;
  if (patch.conversionMode !== undefined) row.conversion_mode = patch.conversionMode;
  if (patch.conversionFactor !== undefined) row.conversion_factor = patch.conversionFactor;
  if (patch.conversionUnit !== undefined) row.conversion_unit = patch.conversionUnit ?? null;
  if (patch.conversionTargetPartId !== undefined)
    row.conversion_target_part_id = patch.conversionTargetPartId ?? null;
  if (patch.confirmed !== undefined) row.confirmed = patch.confirmed;
  return row;
}

/** Hidrata itens e duplicatas de uma nota (mirrors `modelKits.listItems`). */
async function hydrate(noteId: ID): Promise<[IFiscalNoteItem[], IFiscalNoteDuplicate[]]> {
  const client = getSupabaseClient();
  const [itemsResult, dupsResult] = await Promise.all([
    client.from(ITEMS_TABLE).select(ITEM_COLUMNS).eq("note_id", noteId).order("seq"),
    client.from(DUPS_TABLE).select(DUP_COLUMNS).eq("note_id", noteId).order("due_date"),
  ]);
  if (itemsResult.error)
    throw new Error(`[supabase] fiscalNotes.hydrate items(${noteId}) failed: ${itemsResult.error.message}`);
  if (dupsResult.error)
    throw new Error(`[supabase] fiscalNotes.hydrate dups(${noteId}) failed: ${dupsResult.error.message}`);
  return [
    (itemsResult.data as unknown as FiscalNoteItemRow[]).map(rowToItem),
    (dupsResult.data as unknown as FiscalNoteDuplicateRow[]).map(rowToDuplicate),
  ];
}

export const supabaseFiscalNotesProvider: IFiscalNotesProvider = {
  async list(params: IListFiscalNotesParams = {}): Promise<IPaginatedResult<IFiscalNote>> {
    const page = params.page ?? 1;
    const pageSize = params.pageSize ?? 20;

    let query = getSupabaseClient().from(TABLE).select(COLUMNS, { count: "exact" });
    if (params.storeId) query = query.eq("store_id", params.storeId);
    if (params.status) query = query.eq("status", params.status);
    if (params.supplierId) query = query.eq("supplier_id", params.supplierId);
    if (params.search) query = query.or(`number.ilike.%${params.search}%,access_key.ilike.%${params.search}%`);

    const { data, error, count } = await query
      .order("issued_at", { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1);
    if (error) throw new Error(`[supabase] fiscalNotes.list failed: ${error.message}`);

    const rows = data as unknown as FiscalNoteRow[];
    const notes = await Promise.all(
      rows.map(async (row) => {
        const [items, duplicates] = await hydrate(row.id);
        return rowToNote(row, items, duplicates);
      }),
    );
    return { data: notes, total: count ?? 0, page, pageSize };
  },

  async get(id: ID): Promise<IFiscalNote> {
    const { data, error } = await getSupabaseClient().from(TABLE).select(COLUMNS).eq("id", id).single();
    if (error) throw new Error(`[supabase] fiscalNotes.get(${id}) failed: ${error.message}`);
    const [items, duplicates] = await hydrate(id);
    return rowToNote(data as unknown as FiscalNoteRow, items, duplicates);
  },

  async findByAccessKey(accessKey: string): Promise<IFiscalNote | null> {
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .select(COLUMNS)
      .eq("access_key", accessKey)
      .maybeSingle();
    if (error) throw new Error(`[supabase] fiscalNotes.findByAccessKey failed: ${error.message}`);
    if (!data) return null;
    const row = data as unknown as FiscalNoteRow;
    const [items, duplicates] = await hydrate(row.id);
    return rowToNote(row, items, duplicates);
  },

  async create(input: ICreateFiscalNoteInput): Promise<IFiscalNote> {
    const client = getSupabaseClient();

    const { data, error } = await client
      .from(TABLE)
      .insert({
        store_id: input.storeId,
        access_key: input.accessKey,
        number: input.number,
        series: input.series,
        supplier_id: input.supplierId,
        issued_at: input.issuedAt,
        entered_at: input.enteredAt,
        status: input.status,
        origin: input.origin,
        freight: input.freight,
        ipi: input.ipi,
        discount: input.discount,
        products_total: input.productsTotal,
        total: input.total,
        xml_path: input.xmlPath ?? null,
        division: input.division,
      })
      .select(COLUMNS)
      .single();
    if (error) throw new Error(`[supabase] fiscalNotes.create failed: ${error.message}`);

    const row = data as unknown as FiscalNoteRow;

    if (input.items.length > 0) {
      const { error: itemsError } = await client.from(ITEMS_TABLE).insert(
        input.items.map((item) => ({
          note_id: row.id,
          seq: item.seq,
          supplier_code: item.supplierCode,
          description: item.description,
          ncm: item.ncm ?? null,
          cfop: item.cfop ?? null,
          ean: item.ean ?? null,
          unit: item.unit,
          quantity: item.quantity,
          unit_value: item.unitValue,
          total_value: item.totalValue,
          link_mode: item.linkMode,
          part_id: item.partId ?? null,
          new_part_draft: item.newPartDraft ?? null,
          conversion_mode: item.conversionMode,
          conversion_factor: item.conversionFactor,
          conversion_unit: item.conversionUnit ?? null,
          conversion_target_part_id: item.conversionTargetPartId ?? null,
          ai_confidence: item.aiConfidence ?? null,
          ai_evidence: item.aiEvidence ?? null,
          alert: item.alert ?? null,
          confirmed: item.confirmed,
        })),
      );
      if (itemsError)
        throw new Error(`[supabase] fiscalNotes.create (items) failed: ${itemsError.message}`);
    }

    if (input.duplicates.length > 0) {
      const { error: dupsError } = await client.from(DUPS_TABLE).insert(
        input.duplicates.map((dup) => ({
          note_id: row.id,
          number: dup.number,
          due_date: dup.dueDate,
          amount: dup.amount,
        })),
      );
      if (dupsError)
        throw new Error(`[supabase] fiscalNotes.create (duplicates) failed: ${dupsError.message}`);
    }

    const [items, duplicates] = await hydrate(row.id);
    return rowToNote(row, items, duplicates);
  },

  async updateItem(itemId: ID, patch: IUpdateFiscalNoteItemPatch): Promise<IFiscalNoteItem> {
    const { data, error } = await getSupabaseClient()
      .from(ITEMS_TABLE)
      .update(itemPatchToRow(patch))
      .eq("id", itemId)
      .select(ITEM_COLUMNS)
      .single();
    if (error) throw new Error(`[supabase] fiscalNotes.updateItem(${itemId}) failed: ${error.message}`);
    return rowToItem(data as unknown as FiscalNoteItemRow);
  },

  async cancel(id: ID): Promise<IFiscalNote> {
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .update({ status: "cancelada", updated_at: new Date().toISOString() })
      .eq("id", id)
      .neq("status", "lancada")
      .select(COLUMNS)
      .single();
    if (error) throw new Error(`[supabase] fiscalNotes.cancel(${id}) failed: ${error.message}`);
    const row = data as unknown as FiscalNoteRow;
    const [items, duplicates] = await hydrate(row.id);
    return rowToNote(row, items, duplicates);
  },
};
```

- [ ] **Step 3: Ligar no factory**

Em `src/providers/data/factory.ts`, acrescentar os imports Supabase e as duas fatias em `supabaseProviders`:

```ts
import { supabaseSuppliersProvider } from "./impl/supabase/suppliers";
import { supabaseFiscalNotesProvider } from "./impl/supabase/fiscalNotes";
```

```ts
  suppliers: supabaseSuppliersProvider,
  fiscalNotes: supabaseFiscalNotesProvider,
```

- [ ] **Step 4: Verificar que as duas fontes satisfazem o mesmo contrato**

```bash
bunx tsc --noEmit 2>&1 | grep -iE "fiscal|supplier" ; echo "exit=$?"
```

Esperado: nenhuma linha citando os arquivos novos (`exit=1`). O baseline de erros pré-existentes do projeto não conta — só interessa o delta.

- [ ] **Step 5: Gate da fase**

```bash
bun run test
```

Esperado: PASS, sem regressão na contagem anterior de testes.

```bash
bun run build
```

Esperado: build verde.

- [ ] **Step 6: Commit**

```bash
git add src/providers/data/impl/supabase/suppliers.ts src/providers/data/impl/supabase/fiscalNotes.ts src/providers/data/factory.ts
git commit -m "feat(fiscal-notes): add Supabase providers for suppliers and fiscal notes"
```

---

## Self-Review

**1. Cobertura da spec (Fase 1 do PRD-216).** Tipos → Task 1. `nfeParser` → Tasks 2 e 3. `nfeKey`/RC-05 → Task 1. `costAllocation`/RC-01 e `unitConversion`/RC-02, RC-03 → Task 4. `averageCost`/RC-04 → Task 5. `itemMatcher`/RS-01 → Task 6. `analysis`/RS-03 → Task 7. Script de sync → Task 8. Sete tabelas com RLS e bucket → Task 9. Contracts e mock → Task 10. Supabase → Task 11. Entregável declarado da fase (`bun run test` verde com o parser contra XML real) → Task 3 e Task 11 Step 5.

**Fora desta fase, de propósito:** RS-02 (fallback de LLM) é Fase 4 — a Task 6 só produz o `pend` que alimentaria o modelo. RF-100/RF-101 (RPC de lançar e estornar) e RF-102 (derivação `entrada_compra`) são Fase 3. RF-110 a RF-114 (navegação, RBAC, tokens, UX, auditoria) são Fase 2 em diante.

**2. Placeholders.** Nenhum "TBD", "similar à Task N" nem passo sem código. Cada passo de implementação traz o arquivo inteiro.

**3. Consistência de tipos.** `IConversionInput` da Task 4 recebe `partUnit` e `conversionUnit` separados, e os testes cobrem os dois caminhos de fallback. `IMatchResult.confidence` é `number | null`, e o teste de código mapeado exige `null` — coerente com a implementação, que não atribui confiança a vínculo confirmado por humano. `IAnalysisItem.unitCost` é `number | null` porque vem de `convertToStock`, que devolve `null` sem fator; `priceCard` e `savingCard` testam isso antes de usar. `ICreateFiscalNoteInput` omite `items`/`duplicates` do `IFiscalNote` e os redeclara sem `id`/`noteId`, e os dois providers atribuem os ids — mock por `crypto.randomUUID()`, Supabase por `default gen_random_uuid()`.

**4. Duas correções feitas durante a redação.** Task 9 usa `uuid` em todo FK, não o `text` que a migration de 2026-06-08 sugere — o tipo foi verificado contra o banco de produção. Task 1 usa chaves de acesso com DV recalculado, porque as quatro do `nf-data.jsx` são inválidas e teriam feito o parser nascer validando errado.
