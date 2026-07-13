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
    // Reflete o patch na entrada do Map para que qualquer leitura posterior
    // (inclusive o passo Turbo Filtros) veja o estado pós-enriquecimento UFI,
    // nunca a linha stale pré-update.
    Object.assign(current, patch);
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
  // SKUs dos registros genuinamente criados — a âncora exata do rollback dos
  // "Criados". NÃO usar catalog_source/dintec_synced_at/dintec_codpro-null: o
  // enriquecimento acima faz backfill do mesmo catalog_source='supplier_ufi' +
  // dintec_synced_at em ~25 linhas reais pré-existentes (UFI-track, codpro null
  // por natureza), então aquele filtro apagaria produtos reais e vivos junto.
  const createdSkus = createRows.map((r) => r.sku as string);
  let createdDone = 0;
  const chunkSize = 100;
  for (let i = 0; i < createRows.length; i += chunkSize) {
    const part = createRows.slice(i, i + chunkSize);
    const { error } = await sb.from("parts").insert(part);
    if (error) throw error;
    createdDone += part.length;
    console.log(`criados: ${createdDone}/${createRows.length}`);
  }

  const createdSkuList = createdSkus.map((s) => `'${s.replace(/'/g, "''")}'`).join(",");
  const createdRollback =
    createdSkus.length > 0
      ? `delete from parts where sku in (${createdSkuList});`
      : "(nenhum produto criado neste lote)";
  const summary = [
    "# Sync de planilhas de fornecedor — ESCRITA REAL concluída",
    "",
    `- synced_at do lote: ${syncedAt}`,
    `- Enriquecidos: ${enrichedCount}`,
    `- Criados (UFI Comprou=SIM ausentes): ${createdDone}`,
    "",
    "Rollback do lote:",
    `- Criados: ${createdRollback}`,
    "- Enriquecidos: restaurar campo a campo via scratchpad/parts-supplier-sync-backup.json.",
  ].join("\n");
  writeFileSync(join(SCRATCHPAD, "parts-supplier-sync-report.md"), summary, "utf8");
  console.log(summary);
}

main().catch((e) => {
  console.error("SYNC DE PLANILHAS FALHOU:", e.message);
  process.exit(1);
});
