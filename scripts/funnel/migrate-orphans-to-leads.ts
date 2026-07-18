// scripts/funnel/migrate-orphans-to-leads.ts
// Funnel Frente 3 (Frente B) — migração assistida do acervo de contatos órfãos.
//
// Contexto: os ~5.246 contatos de WhatsApp que viraram `customers` sem vínculo
// DINTEC (dintec_codcli null) poluem a base de Clientes. Este script os
// classifica com o engine puro da Task 1 (classifyOrphan) e, no rollout,
// converte os que têm conversa em LEADS (ativo/dormente), apaga o ruído puro de
// agenda e apenas RELATA os casos de revisão manual.
//
// Dry-run (ZERO escrita — só relatório, seguro contra prod):
//   FUNNEL_DRY_RUN=yes bun run scripts/funnel/migrate-orphans-to-leads.ts
// Escrita real (rollout, atrás dos gates do dono):
//   FUNNEL_CONFIRM_WRITE=yes bun run scripts/funnel/migrate-orphans-to-leads.ts
//
// Gate de rollout (NÃO deste task): a migration
//   supabase/migrations/20260718150000_funnel_leads_ownerless_avatar.sql
// (drop not null em leads.seller_id + leads.avatar_url) TEM de estar aplicada
// ANTES da escrita real — senão todo insert de lead ownerless viola NOT NULL.
//
// Padrão da casa (scripts/dintec-import/*): trava de segurança por env, fetch
// paginado com `.range()+.order("id")` (PostgREST teto 1000/página mesmo com
// service_role), escrita em lotes, relatórios em scratchpad/, audit_logs por fase.
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import {
  classifyOrphan,
  IMPORT_LOSS_REASON,
  type OrphanClass,
} from "../../src/features/leads/engine/orphanClassification";

// ===== Safety latch ==========================================================

const DRY_RUN = process.env.FUNNEL_DRY_RUN === "yes";
const CONFIRM_WRITE = process.env.FUNNEL_CONFIRM_WRITE === "yes";
if (!DRY_RUN && !CONFIRM_WRITE) {
  throw new Error(
    "Trava de segurança: rode com FUNNEL_DRY_RUN=yes (simulação) ou FUNNEL_CONFIRM_WRITE=yes (escrita real).",
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

const STORE_MATRIZ = "00000000-0000-0000-0000-000000000001";
const AUDIT_ACTOR = "622d1d2c-0223-4133-91cd-0264c1fc29aa"; // Edmilson (operador)
// Tags que escondem um contato da lista de Clientes (contatos ainda não promovidos).
const HIDDEN_TAGS = ["pending_review", "reviewed_not_customer"];
// Nome puramente telefônico (ex.: "+55 (54) 99999-9999") não serve como nome de lead.
const PHONE_LIKE = /^\+?[0-9()\s.-]+$/;
// Fallback de estágio quando a loja não tem pipeline configurado (espelha o
// waha-webhook — supabase/functions/whatsapp-webhook/index.ts L75).
const DEFAULT_FIRST_STAGE = { id: "stage-novo", name: "Novo", order: 1, color: "#5b6b7a" };

// ===== Row shapes ============================================================

interface OrphanRow {
  id: string;
  phone: string | null;
  phone_digits: string | null;
  full_name: string | null;
  nome_fantasia: string | null;
  whatsapp_name: string | null;
  avatar_url: string | null;
  cpf: string | null;
  cnpj: string | null;
  email: string | null;
  tags: string[] | null;
  type: string | null;
  store_id: string;
  created_at: string;
}
const CUST_COLS =
  "id, phone, phone_digits, full_name, nome_fantasia, whatsapp_name, avatar_url, " +
  "cpf, cnpj, email, tags, type, store_id, created_at";

interface ConvRow {
  id: string;
  customer_id: string | null;
  whatsapp_account_id: string | null;
  status: string | null;
  last_message_at: string | null;
  assigned_seller_id: string | null;
}
const CONV_COLS = "id, customer_id, whatsapp_account_id, status, last_message_at, assigned_seller_id";

// ===== Helpers ===============================================================

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function nonEmpty(s: string | null | undefined): boolean {
  return !!s && s.trim() !== "";
}

/** Only accept a value that parses to a real date — a malformed string must NOT
 *  silently classify as dormente (Task 1 review note). */
function safeIso(v: string | null | undefined): string | null {
  if (!v) return null;
  return Number.isNaN(Date.parse(v)) ? null : v;
}

/** CSV cell: quote, escape `"`, neutralize the `;` delimiter and newlines. */
function q(s: string | null | undefined): string {
  return `"${(s ?? "").replace(/"/g, '""').replace(/[;\r\n]/g, " ")}"`;
}

/**
 * Lead name: the first NON-phone-like full_name, else the WhatsApp profile
 * name, else the phone itself (final fallback — same contract as the v0.150
 * createLead `name ?? phone`). Never null: `leads.name` is NOT NULL, and a
 * phone-as-name renders identically to today's inbox (phone + generic icon),
 * avoiding the "Lead anônimo" fallback. Lead-class orphans with no usable phone
 * are reclassified to `review` upstream, so the phone fallback is always a
 * non-empty string here for the rows that actually become leads.
 */
function resolveLeadName(o: OrphanRow): string {
  const fn = (o.full_name ?? "").trim();
  if (fn && !PHONE_LIKE.test(fn)) return fn;
  const wn = (o.whatsapp_name ?? "").trim();
  if (wn) return wn;
  return (o.phone ?? "").trim();
}

/** Which field the lead name resolves from — informational metric only. */
function nameSource(o: OrphanRow): "full_name" | "whatsapp_name" | "phone" {
  const fn = (o.full_name ?? "").trim();
  if (fn && !PHONE_LIKE.test(fn)) return "full_name";
  if ((o.whatsapp_name ?? "").trim()) return "whatsapp_name";
  return "phone";
}

/** Best-effort human label for the report only. */
function displayName(o: OrphanRow): string {
  return (o.full_name ?? "").trim() || (o.nome_fantasia ?? "").trim() || (o.whatsapp_name ?? "").trim() || "";
}

/** Paged fetch — PostgREST caps selects at 1000 rows even for service_role. */
async function fetchAll<T>(build: () => ReturnType<ReturnType<typeof sb.from>["select"]>): Promise<T[]> {
  const PAGE = 1000;
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build()
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const rows = (data ?? []) as unknown as T[];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

/** Build a Set of the (non-null) FK column across the whole table. */
async function fetchFkSet(table: string, col: string): Promise<Set<string>> {
  const rows = await fetchAll<Record<string, string | null>>(() => sb.from(table).select(col));
  const set = new Set<string>();
  for (const r of rows) {
    const v = r[col];
    if (v) set.add(v);
  }
  return set;
}

/** Complete customer rows (select *) for the given ids — used for the backups
 *  so a rollback can restore without PITR. */
async function fetchFullRows(ids: string[]): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  for (const part of chunk(ids, 200)) {
    const { data, error } = await sb.from("customers").select("*").in("id", part);
    if (error) throw error;
    out.push(...((data ?? []) as Record<string, unknown>[]));
  }
  return out;
}

const stageCache = new Map<string, unknown>();
async function getFirstStage(storeId: string): Promise<unknown> {
  if (stageCache.has(storeId)) return stageCache.get(storeId);
  const { data } = await sb.from("stores").select("settings").eq("id", storeId).maybeSingle();
  const stages = (data?.settings as { pipelineStages?: Array<Record<string, unknown>> } | null)
    ?.pipelineStages;
  const stage =
    !stages || stages.length === 0
      ? DEFAULT_FIRST_STAGE
      : [...stages].sort((a, b) => (a.order as number) - (b.order as number))[0];
  stageCache.set(storeId, stage);
  return stage;
}

/** Head count with an arbitrary filter callback. */
async function countWhere(build: () => { count?: unknown }): Promise<number> {
  const { count, error } = (await build()) as unknown as { count: number | null; error: unknown };
  if (error) throw error;
  return count ?? 0;
}

function assertCanWrite(phase: string): void {
  if (DRY_RUN) {
    throw new Error(`SAFETY: tentativa de escrita na fase "${phase}" durante DRY-RUN — abortado.`);
  }
  if (!CONFIRM_WRITE) {
    throw new Error(`SAFETY: fase "${phase}" exige FUNNEL_CONFIRM_WRITE=yes.`);
  }
}

// ===== Classified orphan =====================================================

interface Classified {
  orphan: OrphanRow;
  klass: OrphanClass;
  convCount: number;
  lastMsg: string | null;
  refs: string[]; // which reference tables carry this orphan (report only)
  hasManualData: boolean;
  hasCommercialRelation: boolean;
  reviewReason: string; // populated only when klass === "review"
  reclassifiedNoPhone: boolean; // review override: lead-class without a usable phone
}

// ===== Main ==================================================================

async function main() {
  const nowIso = new Date().toISOString(); // captured ONCE — the classification "now"
  console.log(`Funnel Frente B — modo: ${DRY_RUN ? "DRY-RUN (zero escrita)" : "ESCRITA REAL"}`);

  // 1) Fetch orphans + conversations + reference FK sets (all paginated).
  const orphans = await fetchAll<OrphanRow>(() =>
    sb.from("customers").select(CUST_COLS).is("dintec_codcli", null),
  );
  const conversations = await fetchAll<ConvRow>(() => sb.from("conversations").select(CONV_COLS));

  const [
    ordersSet,
    quotesSet,
    notesSet,
    vehiclesSet,
    convertedSet,
    mediaSet,
    tracesSet,
    sdrSet,
    recosSet,
  ] = await Promise.all([
    fetchFkSet("orders", "customer_id"),
    fetchFkSet("quotes", "customer_id"),
    fetchFkSet("customer_notes", "customer_id"),
    fetchFkSet("vehicles", "customer_id"),
    fetchFkSet("leads", "converted_to_customer_id"),
    fetchFkSet("media_assets", "customer_id"),
    fetchFkSet("distribution_traces", "customer_id"),
    fetchFkSet("sdr_escalations", "customer_id"),
    // 11th FK onto customers: recommendations.subject_id (NO ACTION) — a delete
    // would be blocked, so it joins traces/sdr in the risk metric + B2 pre-check.
    fetchFkSet("recommendations", "subject_id"),
  ]);

  // Conversation aggregation per customer: count + max(valid last_message_at).
  const convByCustomer = new Map<string, { count: number; maxLast: string | null }>();
  for (const cv of conversations) {
    if (!cv.customer_id) continue;
    const info = convByCustomer.get(cv.customer_id) ?? { count: 0, maxLast: null };
    info.count++;
    const iso = safeIso(cv.last_message_at);
    if (iso && (info.maxLast === null || Date.parse(iso) > Date.parse(info.maxLast))) {
      info.maxLast = iso;
    }
    convByCustomer.set(cv.customer_id, info);
  }

  console.log(
    `Base: ${orphans.length} órfãos, ${conversations.length} conversas | refs → ` +
      `orders=${ordersSet.size} quotes=${quotesSet.size} notes=${notesSet.size} ` +
      `vehicles=${vehiclesSet.size} converted=${convertedSet.size} media=${mediaSet.size} ` +
      `traces=${tracesSet.size} sdr=${sdrSet.size} recos=${recosSet.size}`,
  );

  // 2) Classify.
  const classified: Classified[] = orphans.map((o) => {
    const conv = convByCustomer.get(o.id) ?? { count: 0, maxLast: null };
    const hasManualData =
      nonEmpty(o.cpf) ||
      nonEmpty(o.cnpj) ||
      nonEmpty(o.email) ||
      notesSet.has(o.id) ||
      vehiclesSet.has(o.id);
    const hasCommercialRelation = ordersSet.has(o.id) || quotesSet.has(o.id) || convertedSet.has(o.id);
    let klass = classifyOrphan(
      {
        hasConversation: conv.count > 0,
        lastMessageAt: conv.maxLast,
        hasManualData,
        hasCommercialRelation,
      },
      nowIso,
    );
    // Script-level override: a lead-class orphan with no usable phone (null/empty)
    // can never match an inbound webhook, so it cannot become a lead — route it
    // to manual review instead. Mutually exclusive with engine-review (which only
    // fires on manual-data/commercial, never reaching here).
    const reclassifiedNoPhone =
      (klass === "lead_ativo" || klass === "lead_dormente") && !nonEmpty(o.phone);
    if (reclassifiedNoPhone) klass = "review";
    let reviewReason = "";
    if (klass === "review") {
      if (reclassifiedNoPhone) {
        reviewReason = "sem telefone utilizável";
      } else {
        const parts: string[] = [];
        if (hasCommercialRelation) parts.push("relação comercial (orders/quotes/ex-lead)");
        if (hasManualData) parts.push("dado manual (cpf/cnpj/email/nota/veículo)");
        reviewReason = parts.join(" + ") || "(desconhecido)";
      }
    }
    const refs: string[] = [];
    if (ordersSet.has(o.id)) refs.push("orders");
    if (quotesSet.has(o.id)) refs.push("quotes");
    if (notesSet.has(o.id)) refs.push("notes");
    if (vehiclesSet.has(o.id)) refs.push("vehicles");
    if (convertedSet.has(o.id)) refs.push("converted");
    if (mediaSet.has(o.id)) refs.push("media");
    if (tracesSet.has(o.id)) refs.push("traces");
    if (sdrSet.has(o.id)) refs.push("sdr");
    if (recosSet.has(o.id)) refs.push("recos");
    return {
      orphan: o,
      klass,
      convCount: conv.count,
      lastMsg: conv.maxLast,
      refs,
      hasManualData,
      hasCommercialRelation,
      reviewReason,
      reclassifiedNoPhone,
    };
  });

  const byClass = (k: OrphanClass) => classified.filter((c) => c.klass === k);
  const actives = byClass("lead_ativo");
  const dormants = byClass("lead_dormente");
  const deletes = byClass("delete");
  const reviews = byClass("review");
  const leadClass = [...actives, ...dormants];

  // Informational metric (non-blocking): lead-class orphans whose name falls
  // back to the phone (no non-phone full_name, no whatsapp_name). Renders as the
  // phone number in the inbox — identical to today. leads.name stays untouched.
  const nameFromPhone = leadClass.filter((c) => nameSource(c.orphan) === "phone");
  // Lead-class orphans rerouted to review for lacking a usable phone.
  const noPhoneReviews = reviews.filter((c) => c.reclassifiedNoPhone);
  // FK-on-delete note: delete/lead-class orphans whose customer row still has a
  // NO-ACTION FK pointing at it (distribution_traces / sdr_escalations /
  // recommendations.subject_id) would block the delete. media_assets /
  // conversation_activity are ON DELETE SET NULL.
  const deletionFkRisk = [...leadClass, ...deletes].filter(
    (c) => tracesSet.has(c.orphan.id) || sdrSet.has(c.orphan.id) || recosSet.has(c.orphan.id),
  );

  const counts = {
    lead_ativo: actives.length,
    lead_dormente: dormants.length,
    delete: deletes.length,
    review: reviews.length,
    total: classified.length,
  };
  console.log(
    `CLASSES: ativo=${counts.lead_ativo} dormente=${counts.lead_dormente} ` +
      `delete=${counts.delete} review=${counts.review} (total ${counts.total})`,
  );

  // 3) Reports (dry-run truth of the day — written in BOTH modes for the record).
  mkdirSync(SCRATCHPAD, { recursive: true }); // ensure the output dir exists
  const csvRows: string[] = ["id;nome;phone;classe;last_msg;convs;refs"];
  for (const c of classified) {
    csvRows.push(
      [
        c.orphan.id,
        q(displayName(c.orphan)),
        q(c.orphan.phone),
        c.klass,
        c.lastMsg ?? "",
        String(c.convCount),
        c.refs.join("|"),
      ].join(";"),
    );
  }
  writeFileSync(join(SCRATCHPAD, "funnel-orphans-report.csv"), "﻿" + csvRows.join("\r\n"), "utf8");

  const md: string[] = [
    `# Funnel Frente B — migração de órfãos → leads (${DRY_RUN ? "DRY-RUN" : "ESCRITA REAL"})`,
    "",
    `Gerado em: ${nowIso}`,
    `Régua de vitalidade: 7 dias (engine Task 1).`,
    "",
    "## Contagem por classe",
    "",
    "| Classe | Total |",
    "|---|---|",
    `| lead_ativo | ${counts.lead_ativo} |`,
    `| lead_dormente | ${counts.lead_dormente} |`,
    `| delete | ${counts.delete} |`,
    `| review | ${counts.review} |`,
    `| **total** | **${counts.total}** |`,
    "",
    "## Métricas e alertas",
    "",
    `- (informativo) Leads (ativo+dormente) com name = telefone (fallback, mesmo ` +
      `contrato do createLead): **${nameFromPhone.length}** — não bloqueante, ` +
      `\`leads.name\` intocado; renderiza como o telefone no inbox (idêntico a hoje).`,
    `- Lead-class reclassificados para review por falta de telefone utilizável: ` +
      `**${noPhoneReviews.length}** (incluídos na contagem de review acima).`,
    `- (alerta) Órfãos lead/delete com FK NO-ACTION bloqueante (traces/sdr/recos): ` +
      `**${deletionFkRisk.length}** — se >0 no rollout, o delete do customer aborta o ` +
      `lote com erro claro (media/activity são SET NULL, seguros).`,
    "",
    "## B3 — revisão manual (VERBATIM, zero escrita)",
    "",
    reviews.length === 0 ? "_(nenhum caso de revisão)_" : "",
  ];
  for (const c of reviews) {
    const o = c.orphan;
    md.push(
      `### ${o.id}`,
      `- nome (display): ${displayName(o) || "(vazio)"}`,
      `- nome resolvido p/ lead: ${resolveLeadName(o) || "(vazio)"}`,
      `- phone: ${o.phone ?? "(null)"} | phone_digits: ${o.phone_digits ?? "(null)"}`,
      `- full_name: ${o.full_name ?? "(null)"} | nome_fantasia: ${o.nome_fantasia ?? "(null)"} | whatsapp_name: ${o.whatsapp_name ?? "(null)"}`,
      `- cpf: ${o.cpf ?? "(null)"} | cnpj: ${o.cnpj ?? "(null)"} | email: ${o.email ?? "(null)"}`,
      `- type: ${o.type ?? "(null)"} | tags: ${JSON.stringify(o.tags ?? [])}`,
      `- store_id: ${o.store_id} | created_at: ${o.created_at}`,
      `- conversas: ${c.convCount} | last_msg: ${c.lastMsg ?? "(null)"} | refs: ${c.refs.join("|") || "(nenhuma)"}`,
      `- motivo review: ${c.reviewReason}`,
      "",
    );
  }
  md.push(`CSV completo: scratchpad/funnel-orphans-report.csv`);
  const mdText = md.join("\n");
  writeFileSync(join(SCRATCHPAD, "funnel-orphans-report.md"), mdText + "\n", "utf8");
  console.log("\n" + mdText + "\n");

  if (DRY_RUN) {
    console.log("DRY-RUN concluído — nenhuma escrita realizada.");
    return;
  }

  // ===== WRITE MODE (rollout) ================================================
  assertCanWrite("bootstrap");

  // Circuit-breaker: the apply run must declare the class counts it EXPECTS
  // (FUNNEL_EXPECT="ativo,dormente,delete,review", straight from the reviewed
  // dry-run). A fresh classification that drifts >10% in any class OR the total
  // aborts — a large delta means the dataset moved and the dry-run is stale.
  const expectRaw = process.env.FUNNEL_EXPECT;
  if (!expectRaw) {
    throw new Error(
      'Modo escrita exige FUNNEL_EXPECT="ativo,dormente,delete,review" ' +
        "(contagens do dry-run revisado). Rode o dry-run e informe as contagens.",
    );
  }
  const expectParts = expectRaw.split(",").map((s) => Number(s.trim()));
  if (expectParts.length !== 4 || expectParts.some((n) => !Number.isFinite(n))) {
    throw new Error(`FUNNEL_EXPECT malformado: "${expectRaw}" — esperado 4 inteiros ativo,dormente,delete,review.`);
  }
  const [expAtivo, expDormente, expDelete, expReview] = expectParts;
  const driftGuard = (label: string, actual: number, expected: number) => {
    const diverges =
      expected === 0 ? actual !== 0 : Math.abs(actual - expected) / expected > 0.1;
    if (diverges) {
      throw new Error(
        `Circuit-breaker: classe "${label}" divergiu >10% (esperado ${expected}, agora ${actual}). ` +
          "Re-rode FUNNEL_DRY_RUN=yes, revise as contagens e atualize FUNNEL_EXPECT antes de aplicar.",
      );
    }
  };
  driftGuard("ativo", counts.lead_ativo, expAtivo);
  driftGuard("dormente", counts.lead_dormente, expDormente);
  driftGuard("delete", counts.delete, expDelete);
  driftGuard("review", counts.review, expReview);
  driftGuard("total", counts.total, expAtivo + expDormente + expDelete + expReview);
  console.log(`Circuit-breaker OK (esperado ${expectRaw}).`);

  // Pre-flight: the ownerless-leads + avatar_url migration MUST be applied first
  // (leads.seller_id NOT NULL drop + leads.avatar_url). Probing avatar_url is a
  // cheap proxy for the whole migration 20260718150000.
  {
    const { error: migErr } = await sb.from("leads").select("avatar_url").limit(1);
    if (migErr) {
      throw new Error(
        "Pré-flight falhou: leads.avatar_url ausente — aplicar a migration " +
          "20260718150000_funnel_leads_ownerless_avatar.sql antes da escrita real.",
      );
    }
  }

  // Pre-run invariant snapshot: orphan conversations (customer_id null AND
  // lead_id null) must not grow as a side effect of this run.
  const orphanConvsBefore = await countWhere(() =>
    sb
      .from("conversations")
      .select("id", { count: "exact", head: true })
      .is("customer_id", null)
      .is("lead_id", null),
  );

  // Symmetric backup: complete rows of every customer B1 is about to convert +
  // delete, so a rollback can restore them without PITR (B1 deletes by design).
  const b1BackupRows = await fetchFullRows(leadClass.map((c) => c.orphan.id));
  const b1BackupPath = join(SCRATCHPAD, "funnel-b1-backup.jsonl");
  writeFileSync(
    b1BackupPath,
    b1BackupRows.map((r) => JSON.stringify(r)).join("\n") + (b1BackupRows.length ? "\n" : ""),
    "utf8",
  );
  console.log(`B1: backup de ${b1BackupRows.length} customers em ${b1BackupPath}`);

  // ----- B1: lead_ativo + lead_dormente --------------------------------------
  let createdActive = 0;
  let createdDormant = 0;
  let reusedLeads = 0;
  let conversationsRepointed = 0;
  let processed = 0;
  for (const batch of chunk(leadClass, 100)) {
    for (const c of batch) {
      assertCanWrite("B1");
      const o = c.orphan;

      // Idempotency for the insert-OK + repoint-fail window: a prior partial run
      // may already have created this orphan's import lead but died before
      // repointing. Reuse an existing origin='import' lead with the exact same
      // phone_digits in this store instead of minting a duplicate.
      let leadId: string | null = null;
      const digits = (o.phone_digits ?? "").trim();
      if (digits) {
        const { data: existing, error: lookupErr } = await sb
          .from("leads")
          .select("id")
          .eq("store_id", o.store_id)
          .eq("origin", "import")
          .eq("phone_digits", digits)
          .limit(1);
        if (lookupErr) throw new Error(`B1 lookup lead falhou (órfão ${o.id}): ${lookupErr.message}`);
        if (existing && existing.length > 0) leadId = existing[0].id as string;
      }

      if (leadId) {
        reusedLeads++;
      } else {
        const stage = await getFirstStage(o.store_id);
        leadId = crypto.randomUUID();
        const leadRow: Record<string, unknown> = {
          id: leadId,
          store_id: o.store_id,
          seller_id: null,
          name: resolveLeadName(o),
          phone: o.phone,
          email: null,
          stage,
          temperature: "frio",
          origin: "import",
          avatar_url: o.avatar_url ?? null,
          conversations: [],
          tags: [],
        };
        if (c.klass === "lead_dormente") leadRow.loss_reason = IMPORT_LOSS_REASON;
        const { error: insErr } = await sb.from("leads").insert(leadRow);
        if (insErr) throw new Error(`B1 insert lead falhou (órfão ${o.id}): ${insErr.message}`);
        if (c.klass === "lead_ativo") createdActive++;
        else createdDormant++;
      }

      // Repoint conversations to the lead and detach the customer. The affected
      // rowcount MUST match the snapshot count, else abort.
      const { data: repointed, error: upErr } = await sb
        .from("conversations")
        .update({ lead_id: String(leadId), customer_id: null })
        .eq("customer_id", o.id)
        .select("id");
      if (upErr) throw new Error(`B1 repoint conversas falhou (órfão ${o.id}): ${upErr.message}`);
      const affected = repointed?.length ?? 0;
      if (affected !== c.convCount) {
        throw new Error(
          `B1 abortado: órfão ${o.id} esperava ${c.convCount} conversas, repontou ${affected}.`,
        );
      }
      conversationsRepointed += affected;

      const { error: delErr } = await sb.from("customers").delete().eq("id", o.id);
      if (delErr) throw new Error(`B1 delete customer falhou (órfão ${o.id}): ${delErr.message}`);

      processed++;
    }
    console.log(
      `B1: ${processed}/${leadClass.length} (ativos ${createdActive}, dormentes ${createdDormant}, reusados ${reusedLeads})`,
    );
  }

  // ----- B2: delete (pure phonebook noise) -----------------------------------
  assertCanWrite("B2-backup");
  const b2BackupRows = await fetchFullRows(deletes.map((c) => c.orphan.id));
  const backupPath = join(SCRATCHPAD, "funnel-b2-backup.jsonl");
  writeFileSync(
    backupPath,
    b2BackupRows.map((r) => JSON.stringify(r)).join("\n") + (b2BackupRows.length ? "\n" : ""),
    "utf8",
  );
  console.log(`B2: backup de ${b2BackupRows.length} customers em ${backupPath}`);

  let deleted = 0;
  for (const batch of chunk(deletes, 100)) {
    assertCanWrite("B2");
    // Cheap re-verification from the in-memory Sets (no new queries): a delete
    // candidate must carry zero blocking references — it was classified `delete`
    // precisely because it has none. Includes the NO-ACTION FKs not covered by
    // classification (distribution_traces / sdr_escalations / recommendations),
    // which would otherwise fail the DB delete.
    for (const c of batch) {
      const id = c.orphan.id;
      const blocking =
        (convByCustomer.get(id)?.count ?? 0) > 0 ||
        ordersSet.has(id) ||
        quotesSet.has(id) ||
        vehiclesSet.has(id) ||
        notesSet.has(id) ||
        tracesSet.has(id) ||
        sdrSet.has(id) ||
        recosSet.has(id);
      if (blocking) {
        throw new Error(`B2 abortado: órfão ${id} tem referência bloqueante inesperada.`);
      }
    }
    const ids = batch.map((c) => c.orphan.id);
    const { error: delErr } = await sb.from("customers").delete().in("id", ids);
    if (delErr) throw new Error(`B2 delete falhou: ${delErr.message}`);
    deleted += ids.length;
    console.log(`B2: ${deleted}/${deletes.length}`);
  }

  // ----- Audit (one row per phase) -------------------------------------------
  assertCanWrite("audit");
  const auditRows = [
    {
      id: crypto.randomUUID(),
      store_id: STORE_MATRIZ,
      actor_id: AUDIT_ACTOR,
      action: "funnel_orphans_to_leads_b1",
      resource: "funnel_orphans",
      resource_id: STORE_MATRIZ,
      timestamp: new Date().toISOString(),
      before: {
        rule: "classifyOrphan (régua 7d)",
        counts,
        window_days: 7,
      },
      after: {
        created_active: createdActive,
        created_dormant: createdDormant,
        reused_leads: reusedLeads,
        conversations_repointed: conversationsRepointed,
        customers_deleted: processed,
      },
    },
    {
      id: crypto.randomUUID(),
      store_id: STORE_MATRIZ,
      actor_id: AUDIT_ACTOR,
      action: "funnel_orphans_deleted_b2",
      resource: "funnel_orphans",
      resource_id: STORE_MATRIZ,
      timestamp: new Date().toISOString(),
      before: { count: deletes.length, backup_path: "scratchpad/funnel-b2-backup.jsonl" },
      after: { deleted },
    },
  ];
  const { error: auditErr } = await sb.from("audit_logs").insert(auditRows);
  if (auditErr) {
    console.error("FALHA NO AUDIT — replay manual:", JSON.stringify(auditRows));
    throw auditErr;
  }

  // ----- Post-verify (printed) -----------------------------------------------
  const customersTotal = await countWhere(() =>
    sb.from("customers").select("id", { count: "exact", head: true }),
  );
  const customersHidden = await countWhere(() =>
    sb
      .from("customers")
      .select("id", { count: "exact", head: true })
      .overlaps("tags", HIDDEN_TAGS),
  );
  const visibleCustomers = customersTotal - customersHidden;
  const orphanConvsAfter = await countWhere(() =>
    sb
      .from("conversations")
      .select("id", { count: "exact", head: true })
      .is("customer_id", null)
      .is("lead_id", null),
  );
  const importLeadsActive = await countWhere(() =>
    sb
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("origin", "import")
      .is("loss_reason", null),
  );
  const importLeadsDormant = await countWhere(() =>
    sb
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("origin", "import")
      .eq("loss_reason", IMPORT_LOSS_REASON),
  );

  const finalSummary = [
    "# Funnel Frente B — ESCRITA REAL concluída",
    "",
    `- Leads ativos criados: ${createdActive}`,
    `- Leads dormentes criados: ${createdDormant}`,
    `- Leads reusados (re-run idempotente): ${reusedLeads}`,
    `- Conversas repontadas (customer→lead): ${conversationsRepointed}`,
    `- Customers apagados (B1 convertidos): ${processed}`,
    `- Customers apagados (B2 ruído): ${deleted}`,
    "",
    "## Verificação pós-execução",
    `- Clientes visíveis (fora ${JSON.stringify(HIDDEN_TAGS)}): ${visibleCustomers} (total ${customersTotal}, ocultos ${customersHidden})`,
    `- Conversas órfãs (customer_id null & lead_id null): antes ${orphanConvsBefore} → depois ${orphanConvsAfter} (delta ${orphanConvsAfter - orphanConvsBefore}, esperado 0)`,
    `- Leads origin='import': ativos ${importLeadsActive}, dormentes(loss_reason) ${importLeadsDormant}`,
    "",
    "## Rollback",
    `- B1: leads criados são identificáveis por origin='import' + timestamp do audit funnel_orphans_to_leads_b1.`,
    `  As conversas repontadas voltam com lead_id→null e os customers são restauráveis`,
    `  a partir de scratchpad/funnel-b1-backup.jsonl (sem PITR).`,
    `- B2: customers apagados são restauráveis a partir de scratchpad/funnel-b2-backup.jsonl.`,
  ].join("\n");
  writeFileSync(join(SCRATCHPAD, "funnel-orphans-apply-summary.md"), finalSummary + "\n", "utf8");
  console.log("\n" + finalSummary + "\n");

  if (orphanConvsAfter !== orphanConvsBefore) {
    console.warn(
      `ATENÇÃO: conversas órfãs mudaram (${orphanConvsBefore}→${orphanConvsAfter}) — investigar.`,
    );
  }
}

main().catch((e) => {
  console.error("FUNNEL FRENTE B FALHOU:", e instanceof Error ? e.message : e);
  process.exit(1);
});
