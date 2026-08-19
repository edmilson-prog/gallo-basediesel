// scripts/backfill-ad-touches.ts
// PRD-217 (Provenance) Fase 2 — reconstrução do histórico de toques de anúncio.
//
// Duas passadas, nesta ordem (a segunda depende da primeira):
//   A. PRECISA      — webhook_deliveries (retenção desde 19/07/2026). Data real
//                     do clique, mensagem casada. origin='backfill_delivery'.
//   B. APROXIMADA   — conversations.ad_referral, só para conversas que ficaram
//                     SEM nenhum toque. Data da conversa, não do clique.
//                     origin='backfill_conversation' (aviso da RN-06).
//
// Idempotente: record_ad_touch grava com `on conflict do nothing` sobre os dois
// índices únicos da Fase 1 (message_id; conversation_id+ad_id+occurred_at).
// Rodar de novo não duplica — devolve null e o script conta como "já existia".
//
// Simulação (ZERO escrita):
//   AD_BACKFILL_DRY_RUN=yes bun run scripts/backfill-ad-touches.ts
// Escrita real (atrás do gate do dono):
//   AD_BACKFILL_CONFIRM_WRITE=yes bun run scripts/backfill-ad-touches.ts
//
// Flags: --from ISO  --to ISO  --window-hours N  --phase delivery|conversation|all
//
// Gate: a migration 20260819000000_ad_provenance_phase2.sql TEM de estar
// aplicada antes da escrita real — as duas RPCs de leitura nascem lá.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

import { adReferralFromStoredNode } from "../src/features/ads/engine/storedAdPayload";

// ===== Safety latch ==========================================================

const DRY_RUN = process.env.AD_BACKFILL_DRY_RUN === "yes";
const CONFIRM_WRITE = process.env.AD_BACKFILL_CONFIRM_WRITE === "yes";
if (!DRY_RUN && !CONFIRM_WRITE) {
  throw new Error(
    "Trava de segurança: rode com AD_BACKFILL_DRY_RUN=yes (simulação) ou AD_BACKFILL_CONFIRM_WRITE=yes (escrita real).",
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

const ROOT = join(import.meta.dir, "..");
const SCRATCHPAD = join(ROOT, "scratchpad");
const STORE_MATRIZ = "00000000-0000-0000-0000-000000000001";
const AUDIT_ACTOR = "622d1d2c-0223-4133-91cd-0264c1fc29aa"; // Edmilson (operador)

// ===== Args ==================================================================

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const WINDOW_HOURS = Number(flag("window-hours") ?? 24);
if (!Number.isFinite(WINDOW_HOURS) || WINDOW_HOURS <= 0) {
  throw new Error("--window-hours precisa ser um número positivo.");
}
const PHASE = flag("phase") ?? "all";
if (!["all", "delivery", "conversation"].includes(PHASE)) {
  throw new Error("--phase aceita: all | delivery | conversation");
}

// ===== Row shapes ============================================================

interface DeliveryRow {
  message_id: string;
  conversation_id: string;
  occurred_at: string;
  external_ad_reply: unknown;
}

interface OrphanRow {
  conversation_id: string;
  occurred_at: string;
  referral: unknown;
}

interface PassCounters {
  scanned: number;
  unparseable: number;
  inserted: number;
  alreadyThere: number;
  failed: number;
}

const emptyCounters = (): PassCounters => ({
  scanned: 0,
  unparseable: 0,
  inserted: 0,
  alreadyThere: 0,
  failed: 0,
});

const failures: string[] = [];

// ===== Escrita ===============================================================

/**
 * record_ad_touch devolve o uuid do toque criado, ou null quando o toque já
 * existia (redelivery ou re-execução do backfill) — null é sucesso, não erro.
 */
async function recordTouch(
  counters: PassCounters,
  args: {
    conversationId: string;
    messageId: string | null;
    occurredAt: string;
    referral: unknown;
    origin: "backfill_delivery" | "backfill_conversation";
  },
): Promise<void> {
  if (DRY_RUN) {
    counters.inserted += 1;
    return;
  }
  const { data, error } = await sb.rpc("record_ad_touch", {
    p_conversation_id: args.conversationId,
    p_message_id: args.messageId,
    p_occurred_at: args.occurredAt,
    p_referral: args.referral,
    p_origin: args.origin,
  });
  if (error) {
    counters.failed += 1;
    failures.push(`${args.origin} ${args.conversationId}: ${error.message}`);
    return;
  }
  if (data) counters.inserted += 1;
  else counters.alreadyThere += 1;
}

// ===== Passada A — fonte precisa ============================================

async function runDeliveryPass(from: Date, to: Date): Promise<PassCounters> {
  const counters = emptyCounters();
  const stepMs = WINDOW_HOURS * 3600 * 1000;

  for (let cursor = from.getTime(); cursor < to.getTime(); cursor += stepMs) {
    const windowFrom = new Date(cursor);
    const windowTo = new Date(Math.min(cursor + stepMs, to.getTime()));

    const { data, error } = await sb.rpc("ad_backfill_delivery_window", {
      p_from: windowFrom.toISOString(),
      p_to: windowTo.toISOString(),
    });
    if (error) {
      throw new Error(
        `Janela ${windowFrom.toISOString()} → ${windowTo.toISOString()} falhou: ${error.message}. ` +
          `Se for statement_timeout, reduza --window-hours e rode de novo (é idempotente).`,
      );
    }

    const rows = (data ?? []) as DeliveryRow[];
    counters.scanned += rows.length;

    for (const row of rows) {
      const referral = adReferralFromStoredNode(row.external_ad_reply);
      if (!referral) {
        counters.unparseable += 1;
        continue;
      }
      await recordTouch(counters, {
        conversationId: row.conversation_id,
        messageId: row.message_id,
        occurredAt: row.occurred_at,
        referral,
        origin: "backfill_delivery",
      });
    }

    console.log(
      `  [precisa] ${windowFrom.toISOString().slice(0, 10)} — ` +
        `${rows.length} mensagens, ${counters.inserted} toques novos até aqui`,
    );
  }

  return counters;
}

// ===== Passada B — fonte aproximada =========================================

async function runConversationPass(): Promise<PassCounters> {
  const counters = emptyCounters();

  const { data, error } = await sb.rpc("ad_backfill_orphan_conversations");
  if (error) throw new Error(`Fonte aproximada falhou: ${error.message}`);

  const rows = (data ?? []) as OrphanRow[];
  counters.scanned = rows.length;

  for (const [index, row] of rows.entries()) {
    // conversations.ad_referral JÁ é um IAdReferral (o webhook grava o objeto
    // do domínio, não o nó cru do provider): passa direto, sem parser.
    const referral = row.referral as { sourceId?: string } | null;
    if (!referral?.sourceId?.trim()) {
      counters.unparseable += 1;
      continue;
    }
    await recordTouch(counters, {
      conversationId: row.conversation_id,
      messageId: null,
      occurredAt: row.occurred_at,
      referral,
      origin: "backfill_conversation",
    });
    if ((index + 1) % 100 === 0) {
      console.log(`  [aproximada] ${index + 1}/${rows.length}…`);
    }
  }

  return counters;
}

// ===== Contagens de conferência =============================================

async function countTable(table: string): Promise<number> {
  const { count, error } = await sb.from(table).select("id", { count: "exact", head: true });
  if (error) throw error;
  return count ?? 0;
}

async function countOrphanConversations(): Promise<number> {
  const { data, error } = await sb.rpc("ad_backfill_orphan_conversations");
  if (error) throw error;
  return ((data ?? []) as OrphanRow[]).length;
}

// ===== Main ==================================================================

async function main(): Promise<void> {
  console.log(
    `\nBackfill de toques de anúncio — modo ${DRY_RUN ? "SIMULAÇÃO (nada é gravado)" : "ESCRITA REAL"}\n`,
  );

  const before = {
    touches: await countTable("ad_touches"),
    ads: await countTable("ads"),
    orphanConversations: await countOrphanConversations(),
  };
  console.log(
    `Antes: ${before.touches} toques, ${before.ads} anúncios, ` +
      `${before.orphanConversations} conversas com anúncio e sem toque.\n`,
  );

  let delivery = emptyCounters();
  if (PHASE === "all" || PHASE === "delivery") {
    // A retenção real de webhook_deliveries manda: sem --from/--to, varre da
    // entrega mais antiga até agora.
    const { data: bounds, error: boundsErr } = await sb
      .from("webhook_deliveries")
      .select("created_at")
      .order("created_at", { ascending: true })
      .limit(1);
    if (boundsErr) throw boundsErr;

    const from = new Date(flag("from") ?? bounds?.[0]?.created_at ?? new Date().toISOString());
    const to = new Date(flag("to") ?? new Date().toISOString());
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from >= to) {
      throw new Error("--from/--to inválidos: precisam ser ISO e --from anterior a --to.");
    }

    console.log(
      `Passada PRECISA: ${from.toISOString()} → ${to.toISOString()}, ` +
        `janelas de ${WINDOW_HOURS}h`,
    );
    delivery = await runDeliveryPass(from, to);
    console.log("");
  }

  let conversation = emptyCounters();
  if (PHASE === "all" || PHASE === "conversation") {
    console.log("Passada APROXIMADA (data da conversa, não do clique — RN-06)");
    conversation = await runConversationPass();
    console.log("");
  }

  const after = {
    touches: await countTable("ad_touches"),
    ads: await countTable("ads"),
    orphanConversations: await countOrphanConversations(),
  };

  // ----- Relatório -----------------------------------------------------------
  mkdirSync(SCRATCHPAD, { recursive: true });
  const md = [
    `# Backfill de toques de anúncio (PRD-217 Fase 2)`,
    ``,
    `Execução: ${new Date().toISOString()} — modo **${DRY_RUN ? "simulação" : "escrita real"}**`,
    ``,
    `| Contagem | Antes | Depois |`,
    `|---|---:|---:|`,
    `| Toques (\`ad_touches\`) | ${before.touches} | ${after.touches} |`,
    `| Anúncios (\`ads\`) | ${before.ads} | ${after.ads} |`,
    `| Conversas com anúncio **sem toque** | ${before.orphanConversations} | ${after.orphanConversations} |`,
    ``,
    `## Passada precisa (\`backfill_delivery\`)`,
    ``,
    `- mensagens varridas: ${delivery.scanned}`,
    `- toques novos: ${delivery.inserted}`,
    `- já existiam: ${delivery.alreadyThere}`,
    `- nó ilegível / sem sourceId: ${delivery.unparseable}`,
    `- falhas: ${delivery.failed}`,
    ``,
    `## Passada aproximada (\`backfill_conversation\`)`,
    ``,
    `> ⚠️ RN-06: a data destes toques é a da **conversa**, não a do clique.`,
    ``,
    `- conversas varridas: ${conversation.scanned}`,
    `- toques novos: ${conversation.inserted}`,
    `- já existiam: ${conversation.alreadyThere}`,
    `- \`ad_referral\` sem sourceId: ${conversation.unparseable}`,
    `- falhas: ${conversation.failed}`,
    ``,
    ...(failures.length ? [`## Falhas`, ``, ...failures.map((f) => `- ${f}`), ``] : []),
  ].join("\n");
  writeFileSync(join(SCRATCHPAD, "ad-touches-backfill-report.md"), md + "\n", "utf8");
  console.log(md);
  console.log(`\nRelatório: scratchpad/ad-touches-backfill-report.md`);

  if (DRY_RUN) {
    console.log("\nSimulação: nada foi gravado. Para valer, use AD_BACKFILL_CONFIRM_WRITE=yes.");
    return;
  }

  // ----- Audit ---------------------------------------------------------------
  const auditRows = [
    {
      id: crypto.randomUUID(),
      store_id: STORE_MATRIZ,
      actor_id: AUDIT_ACTOR,
      action: "ad_touches_backfill",
      resource: "ad_touches",
      resource_id: STORE_MATRIZ,
      timestamp: new Date().toISOString(),
      before,
      after: { ...after, delivery, conversation, phase: PHASE, window_hours: WINDOW_HOURS },
    },
  ];
  const { error: auditErr } = await sb.from("audit_logs").insert(auditRows);
  if (auditErr) {
    console.error("FALHA NO AUDIT — replay manual:", JSON.stringify(auditRows));
    throw auditErr;
  }

  if (after.orphanConversations > 0) {
    console.warn(
      `\n⚠️ Ainda restam ${after.orphanConversations} conversas com anúncio e sem toque — ` +
        `o gate da Fase 2 pede ZERO. Investigue antes de fechar.`,
    );
  }
  if (failures.length) {
    console.warn(`\n⚠️ ${failures.length} falhas — o script é idempotente, pode rodar de novo.`);
  }
}

await main();
