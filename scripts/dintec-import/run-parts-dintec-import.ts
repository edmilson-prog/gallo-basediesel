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
