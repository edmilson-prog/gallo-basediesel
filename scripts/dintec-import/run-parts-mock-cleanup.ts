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

  // select("*") de propósito: o backup precisa das colunas NOT NULL
  // (brand/supplier/unit_cost/…) para o rollback "reinserir parts primeiro" ser
  // de fato executável a partir do JSON.
  const { data: mockParts, error: partsError } = await sb
    .from("parts")
    .select("*")
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
    .select("*")
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

  // Pre-flight das FKs RESTRICT que o script não deletava: order_items.part_id
  // e model_kit_items.part_id referenciam parts com ON DELETE (NO ACTION /
  // RESTRICT). Se qualquer part mock estiver referenciado, o `delete from parts`
  // final falharia DEPOIS de quotes/quote_items já removidos — estado parcial
  // não-transacional. Checamos em ambos os modos, antes de qualquer delete.
  const inMockIds = mockPartIds.length > 0 ? mockPartIds : ["__none__"];
  const { data: orderItemRefs, error: orderItemsError } = await sb
    .from("order_items")
    .select("id, part_id")
    .in("part_id", inMockIds);
  if (orderItemsError) throw orderItemsError;
  const { data: kitItemRefs, error: kitItemsError } = await sb
    .from("model_kit_items")
    .select("id, part_id")
    .in("part_id", inMockIds);
  if (kitItemsError) throw kitItemsError;
  const orderItemRefCount = (orderItemRefs ?? []).length;
  const kitItemRefCount = (kitItemRefs ?? []).length;
  if (orderItemRefCount > 0 || kitItemRefCount > 0) {
    throw new Error(
      `SEGURANÇA: parts mock são referenciados por FK RESTRICT — abortando antes de qualquer delete. ` +
        `order_items: ${orderItemRefCount}, model_kit_items: ${kitItemRefCount}.`,
    );
  }
  console.log(`order_items/model_kit_items referenciando parts mock: ${orderItemRefCount + kitItemRefCount} (esperado 0)`);

  if (DRY_RUN) {
    const summary = [
      "# Limpeza de parts mock — DRY-RUN (zero escrita)",
      "",
      `- Parts mock (sku GAL-*): ${mockPartIds.length}`,
      `- Orçamentos órfãos removidos: ${orphanQuoteIds.length}`,
      `- quote_items removidos (total dos orçamentos órfãos, não só os mock): ${allItemsCount}`,
      `- order_items/model_kit_items referenciando parts mock: ${orderItemRefCount + kitItemRefCount}`,
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
    `- order_items/model_kit_items referenciando parts mock (pré-checado): ${orderItemRefCount + kitItemRefCount}`,
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
