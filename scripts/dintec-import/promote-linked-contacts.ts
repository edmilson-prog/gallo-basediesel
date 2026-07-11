// scripts/dintec-import/promote-linked-contacts.ts
// Run: DINTEC_CONFIRM_WRITE=yes bun run scripts/dintec-import/promote-linked-contacts.ts
//
// Promotes the DINTEC-linked pending contacts of one import batch to full
// customers, mirroring the semantics of the official conversion RPC
// public.convert_pending_contact (migration 20260629120000):
//   - drops ONLY the 'pending_review' tag (any other tag is preserved);
//   - sets `type` from the document (CNPJ → B2B, else CPF → B2C, else B2C),
//     matching what a staff reviewer would pick in the conversion modal;
//   - assigns the wallet owner (seller_id) ONLY when currently null;
//   - writes one audit_logs row per customer with the RPC's action name and
//     before/after shape (plus a `source` marker identifying this assisted
//     promotion — a deliberate divergence from the RPC for forensics).
// Identity fields (names, documents, email, address) are NOT touched here —
// the import already filled them under the fill-if-empty rule.
//
// Rationale: the DINTEC phone match + CODCLI link + purchase history is a
// stronger confirmation that the contact is a real customer than the manual
// review the pending_review tag was waiting for. Owner decision 2026-07-11.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { resolveCustomerType } from "../../src/features/dintec-import/engine";

if (process.env.DINTEC_CONFIRM_WRITE !== "yes") {
  throw new Error(
    "Trava de segurança: rode com DINTEC_CONFIRM_WRITE=yes para confirmar que esta é uma escrita real em produção.",
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

const SCRATCHPAD_DIR = join(import.meta.dir, "..", "..", "scratchpad");

const BATCH_SYNCED_AT = "2026-07-11T17:07:40.676Z"; // Fase 2 pilot batch
const BATCH_CUTOFF = "2026-07-11T17:07:00Z"; // rows created before this = linked (not inserted by the batch)
const STORE_ID = "00000000-0000-0000-0000-000000000001";
const WALLET_OWNER_SELLER_ID = "57706ecc-01b5-4a96-b403-0359a4bb767f"; // Fernando (dono) — owner decision
const AUDIT_ACTOR_SELLER_ID = "622d1d2c-0223-4133-91cd-0264c1fc29aa"; // Edmilson (operador da promoção)

interface LinkedRow {
  id: string;
  dintec_codcli: string;
  type: string;
  tags: string[];
  cpf: string | null;
  cnpj: string | null;
  seller_id: string | null;
}

async function main() {
  const { data, error } = await sb
    .from("customers")
    .select("id, dintec_codcli, type, tags, cpf, cnpj, seller_id")
    .eq("store_id", STORE_ID)
    .eq("dintec_synced_at", BATCH_SYNCED_AT)
    .lt("created_at", BATCH_CUTOFF)
    .contains("tags", ["pending_review"]);
  if (error) throw error;

  const rows = (data ?? []) as LinkedRow[];
  console.log(`Contatos vinculados pendentes no lote: ${rows.length}`);
  if (rows.length === 0) {
    console.log("Nada a promover (idempotente — já rodou?).");
    return;
  }

  const reportRows: string[] = [
    ["customer_id", "dintec_codcli", "type_antes", "type_depois", "seller_antes", "seller_depois"].join(";"),
  ];
  let promoted = 0;
  let skippedByGuard = 0;

  for (const row of rows) {
    const newType = resolveCustomerType(row.cpf, row.cnpj);
    const newTags = row.tags.filter((t) => t !== "pending_review");
    const newSeller = row.seller_id ?? WALLET_OWNER_SELLER_ID;

    // Race guard mirroring the RPC's "must still be pending" check: the
    // .contains filter makes the UPDATE a no-op if the tag vanished between
    // our SELECT and now; .select("id") surfaces the affected rowcount so a
    // guarded-out row is skipped loudly instead of being audited as promoted.
    const { data: updated, error: updateError } = await sb
      .from("customers")
      .update({ type: newType, tags: newTags, seller_id: newSeller })
      .eq("id", row.id)
      .contains("tags", ["pending_review"])
      .select("id");
    if (updateError) throw updateError;
    if (!updated || updated.length !== 1) {
      skippedByGuard++;
      console.warn(
        `SKIP ${row.id} (codcli ${row.dintec_codcli}): não estava mais pending_review no momento do update — nada gravado.`,
      );
      continue;
    }
    // Log each promoted id immediately: update+audit are two requests (not one
    // transaction), so this line is the recovery record if the audit insert
    // (or the process) dies before the report file is written.
    console.log(`PROMOVIDO ${row.id} (codcli ${row.dintec_codcli}) type=${newType}`);

    const auditPayload = {
      id: crypto.randomUUID(),
      store_id: STORE_ID,
      actor_id: AUDIT_ACTOR_SELLER_ID,
      action: "convert_pending_contact",
      resource: "customer",
      resource_id: row.id,
      before: { tags: row.tags, seller_id: row.seller_id, type: row.type },
      after: {
        tags: newTags,
        seller_id: newSeller,
        type: newType,
        dintec_codcli: row.dintec_codcli,
        source: "dintec-linked-promotion",
      },
    };
    const { error: auditError } = await sb.from("audit_logs").insert(auditPayload);
    if (auditError) {
      console.error(
        "FALHA NO AUDIT — o customer JÁ FOI promovido; replay manual do insert abaixo:",
        JSON.stringify(auditPayload),
      );
      throw auditError;
    }

    reportRows.push(
      [row.id, row.dintec_codcli, row.type, newType, row.seller_id ?? "", newSeller].join(";"),
    );
    promoted++;
  }

  writeFileSync(
    join(SCRATCHPAD_DIR, "dintec-pilot-promotion-report.csv"),
    "﻿" + reportRows.join("\r\n"),
    "utf8",
  );

  const summary = [
    "# Promoção dos vinculados DINTEC — lote Fase 2",
    "",
    `- Lote: dintec_synced_at = ${BATCH_SYNCED_AT}`,
    `- Promovidos (pending_review removida): ${promoted}`,
    `- Pulados pelo race guard: ${skippedByGuard}`,
    `- Carteira atribuída a: ${WALLET_OWNER_SELLER_ID} (apenas onde seller era nulo)`,
    `- Auditoria: ${promoted} linhas em audit_logs (action=convert_pending_contact)`,
    "",
    "Rollback: para cada linha do CSV, restaurar tags += 'pending_review', type = type_antes, seller_id = seller_antes.",
  ].join("\n");
  writeFileSync(join(SCRATCHPAD_DIR, "dintec-pilot-promotion-report.md"), summary, "utf8");
  console.log(summary);
}

main().catch((e) => {
  console.error("PROMOÇÃO FALHOU:", e.message);
  process.exit(1);
});
