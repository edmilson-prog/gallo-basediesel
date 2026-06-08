/* eslint-disable */
/**
 * GALLO BASE DIESEL — Mock → Supabase data seeder (Fase 2).
 *
 * Bootstraps the deterministic mock dataset and bulk-inserts it into the remote
 * Supabase `public` schema via supabase-js using the browser-safe PUBLISHABLE
 * key (already in .env.local — no service_role here). RLS write access is opened
 * by a temporary policy applied via MCP around this run, then removed.
 *
 *   bun run scripts/seed-supabase.ts
 *
 * Preconditions (done via MCP before running): temporary INSERT/ALL policies on
 * the target tables + the tables truncated (sellers DELETEd, stores kept). This
 * script only INSERTs (and upserts the single Matriz store).
 *
 * Design: every entity PK is uuid in the DB but a stable string in the mock, so
 * we build a global `mockId -> uuid` map and DEEP-REMAP exact id matches (top
 * level + nested jsonb) to keep foreign keys consistent. The Matriz store is
 * pinned to the SENTINEL uuid so the live auth profile keeps resolving. Only
 * ENTITY ids are remapped (never value-object ids), and columns are filtered to
 * the real schema (camelCase↔snake_case).
 */
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { bootstrap } from "../src/mocks/generators/bootstrap";

const SENTINEL = "00000000-0000-0000-0000-000000000001";
const URL = process.env.VITE_SUPABASE_URL;
// Prefer the service_role key (bypasses RLS — the standard way to seed). Falls
// back to the publishable key, which only works if a write policy is in place.
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!URL || !KEY) {
  throw new Error(
    "Missing VITE_SUPABASE_URL and a key. Add SUPABASE_SERVICE_ROLE_KEY to .env.local.",
  );
}
const sb = createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });

// Real column list per table (from information_schema; child/computed-only cols omitted).
const COLUMNS: Record<string, string[]> = {
  stores: ["id", "name", "type", "address", "cnpj", "settings", "active_divisions", "created_at"],
  sellers: ["id", "store_id", "auth_user_id", "full_name", "email", "phone", "type", "availability", "divisions", "theme_preference", "region", "commission_tier", "parent_seller_id", "commission_rule", "vehicle_cadastro_mode", "active", "created_at", "updated_at"],
  whatsapp_accounts: ["id", "store_id", "label", "phone_number", "provider", "credentials_ref", "status", "capabilities", "created_at"],
  parts: ["id", "sku", "name", "description", "oem_codes", "equivalent_part_ids", "cross_references", "segment", "application_notes", "applications", "brand", "supplier", "category", "subcategory", "is_original", "image_url", "unit_cost", "unit_price", "margin_percent", "gtin", "sefaz_status", "sefaz_checked_at", "supplier_code", "reference", "group_label", "part_type", "price_tables", "fiscal", "weight_kg", "storage_location", "box_quantity", "fractionable", "unit_of_measure", "suppliers", "average_cost", "stock_available", "stock_minimum", "division", "active", "store_id", "created_at", "updated_at"],
  customers: ["id", "store_id", "type", "email", "phone", "address", "seller_id", "status", "tags", "first_purchase_at", "last_purchase_at", "converted_from_lead_id", "converted_from_lead_at", "converted_by_seller_id", "purchase_stats", "abc_class", "abc_share", "overdue_titles_count", "portal", "is_guest_checkout", "has_b2b_portal", "portal_contract", "cnpj", "razao_social", "nome_fantasia", "contact_name", "cpf", "full_name", "created_at"],
  customer_notes: ["id", "customer_id", "author_id", "content", "created_at"],
  vehicles: ["id", "customer_id", "brand", "model", "year", "engine", "model_id", "plate", "vin", "current_km", "service_history", "cadastro_status", "created_at"],
  leads: ["id", "store_id", "seller_id", "name", "phone", "email", "stage", "temperature", "origin", "estimated_value", "next_action_at", "loss_reason", "loss_notes", "converted_to_customer_id", "conversations", "tags", "created_at", "updated_at"],
  customer_segments: ["id", "owner_id", "name", "description", "scope", "filters", "estimated_size", "created_at"],
  carteira_transfers: ["id", "store_id", "type", "from_seller_id", "to_seller_id", "customer_ids", "reason", "start_date", "end_date", "auto_revert_at", "status", "created_by", "created_at"],
  conversations: ["id", "store_id", "customer_id", "lead_id", "assigned_seller_id", "channel", "whatsapp_account_id", "status", "is_sdr_active", "tags", "linked_order_id", "last_message_at", "unread_count", "created_at", "updated_at"],
  messages: ["id", "conversation_id", "direction", "author_type", "author_id", "provider", "text", "media_type", "media_url", "status", "sent_at", "delivered_at", "read_at", "created_at"],
  quotes: ["id", "store_id", "number", "customer_id", "lead_id", "conversation_id", "seller_id", "subtotal", "discount", "discount_reason", "shipping", "total", "payment_condition", "payment_method", "payment_terms", "delivery_address", "valid_until", "status", "origin", "division", "requires_approval", "approved_by", "approved_at", "rejected_reason", "converted_to_order_id", "converted_at", "notes", "applied_kit_ids", "created_at", "updated_at"],
  quote_items: ["id", "quote_id", "part_id", "part_sku", "part_name", "quantity", "unit_price", "discount", "total"],
  orders: ["id", "store_id", "customer_id", "seller_id", "number", "quote_id", "conversation_id", "subtotal", "discount", "shipping", "total", "payment_condition", "payment_method", "payment_terms", "payment_status", "paid_at", "fulfillment_status", "delivery_address", "carrier", "tracking_code", "shipped_at", "delivered_at", "returned_at", "return_reason", "origin", "division", "nf_number", "nf_date", "canceled_at", "canceled_by", "cancel_reason", "internal_notes", "customer_notes", "commission_preview", "notes", "created_at", "updated_at"],
  order_items: ["id", "order_id", "part_id", "part_sku", "part_name", "quantity", "unit_price", "unit_cost", "discount", "total", "margin_value", "applied_to_vehicle_id", "part_category", "part_subcategory"],
  commissions: ["id", "store_id", "seller_id", "order_id", "base_value", "rate", "base_rate", "base_commission", "goal_bonus", "total_commission", "value", "is_split", "split_details", "rule_snapshot", "goal_snapshot", "period", "closed_in_period", "approved_at", "approved_by", "paid_at", "paid_by", "dispute_reason", "disputed_at", "dispute_resolution", "dispute_resolved_by", "dispute_resolved_at", "status", "notes", "calculated_at", "created_at", "updated_at"],
  expenses: ["id", "description", "category", "amount", "competence_date", "payment_date", "status", "due_date", "is_recurring", "recurrence_parent_id", "recurrence_config", "supplier", "payment_method", "attachment_url", "notes", "store_id", "created_by", "created_at", "updated_at"],
  cash_flow_entries: ["id", "type", "source", "source_id", "description", "amount", "date", "status", "store_id", "created_by", "created_at"],
  goals: ["id", "store_id", "level", "target_id", "seller_id", "period", "metric", "target_value", "current_value", "progress_percent", "division", "name", "status", "reward_description", "created_by", "cancel_reason", "created_at", "updated_at"],
  recommendations: ["id", "store_id", "seller_id", "subject_id", "type", "priority", "title", "description", "action_href", "resolved", "created_at", "resolved_at"],
  distribution_traces: ["id", "conversation_id", "customer_id", "lead_id", "store_id", "timestamp", "selected_seller_id", "criterion_matched", "candidates_evaluated", "mode"],
  sdr_sessions: ["id", "conversation_id", "state", "collected_data", "last_activity_at", "started_at", "finished_at", "finish_reason", "paused_from_state"],
  sdr_escalations: ["id", "session_id", "conversation_id", "customer_id", "lead_id", "store_id", "reason", "reason_details", "mode", "context_summary", "assigned_seller_id", "assigned_at", "first_human_response_at", "status", "specialty_matched", "urgent_broadcast_at", "urgent_broadcast_claimed_by_seller_id", "urgent_broadcast_claimed_at", "created_at"],
  media_assets: ["id", "store_id", "conversation_id", "customer_id", "message_id", "kind", "mime_type", "size_bytes", "file_name", "author_type", "direction", "created_at", "storage_ref", "persisted", "source_expires_at", "content_hash", "classification", "linked_vehicle_id", "linked_order_id", "linked_part_id", "ocr_text", "transcription", "sensitivity", "annotations", "version"],
  asset_library_items: ["id", "store_id", "division", "title", "category", "brand", "product_line", "kind", "storage_ref", "media_asset_id", "url", "version", "previous_version", "status", "sensitivity", "allowed_role_ids", "created_by", "created_at", "updated_at"],
  asset_combos: ["id", "store_id", "title", "asset_ids", "owner_id", "created_at", "updated_at"],
  quick_replies: ["id", "store_id", "shortcut", "title", "body", "scope", "owner_id", "allowed_role_ids", "created_at", "updated_at"],
  trackable_links: ["id", "store_id", "asset_id", "conversation_id", "lead_id", "target_url", "short_ref", "utm", "created_by", "opens", "last_opened_at", "created_at"],
  product_indicators: ["id", "store_id", "name", "selector", "metric", "scope_level", "seller_id", "period", "target_value", "status", "division", "reward_description", "created_by", "cancel_reason", "created_at", "updated_at"],
  audit_logs: ["id", "store_id", "actor_id", "action", "resource", "resource_id", "before", "after", "timestamp"],
};

const ds: any = bootstrap();

// Child rows: drop the (sometimes colliding, never-referenced) mock id so the DB
// generates a fresh uuid PK; attach the parent id for the FK.
const orderItems = ds.orders.flatMap((o: any) =>
  (o.items ?? []).map(({ id: _omit, ...it }: any) => ({ ...it, orderId: o.id })),
);
const quoteItems = ds.quotes.flatMap((q: any) =>
  (q.items ?? []).map(({ id: _omit, ...it }: any) => ({ ...it, quoteId: q.id })),
);
const customerNotes = ds.customers.flatMap((c: any) =>
  (c.notes ?? []).map(({ id: _omit, ...n }: any) => ({ ...n, customerId: c.id })),
);

// table -> rows, in FK-safe insertion order.
const TABLES: { table: string; rows: any[] }[] = [
  { table: "stores", rows: ds.stores },
  { table: "sellers", rows: ds.sellers },
  { table: "whatsapp_accounts", rows: ds.whatsappAccounts },
  { table: "parts", rows: ds.parts },
  { table: "customers", rows: ds.customers },
  { table: "customer_notes", rows: customerNotes },
  { table: "vehicles", rows: ds.vehicles },
  { table: "leads", rows: ds.leads },
  { table: "customer_segments", rows: ds.segments },
  { table: "carteira_transfers", rows: ds.transfers },
  { table: "conversations", rows: ds.conversations },
  { table: "messages", rows: ds.messages },
  { table: "quotes", rows: ds.quotes },
  { table: "quote_items", rows: quoteItems },
  { table: "orders", rows: ds.orders },
  { table: "order_items", rows: orderItems },
  { table: "commissions", rows: ds.commissions },
  { table: "expenses", rows: ds.expenses },
  { table: "cash_flow_entries", rows: ds.cashFlowEntries },
  { table: "goals", rows: ds.goals },
  { table: "recommendations", rows: ds.recommendations },
  { table: "distribution_traces", rows: ds.distributionTraces },
  { table: "sdr_sessions", rows: ds.sdrSessions },
  { table: "sdr_escalations", rows: ds.sdrEscalations },
  { table: "media_assets", rows: ds.mediaAssets },
  { table: "asset_library_items", rows: ds.assetLibraryItems },
  { table: "asset_combos", rows: ds.assetCombos },
  { table: "quick_replies", rows: ds.quickReplies },
  { table: "trackable_links", rows: ds.trackableLinks },
  { table: "product_indicators", rows: ds.indicators },
  { table: "audit_logs", rows: ds.audits },
];

// Global entity id -> uuid map (Matriz store pinned to SENTINEL).
const idMap = new Map<string, string>();
const addId = (id: unknown) => {
  if (typeof id !== "string" || idMap.has(id)) return;
  idMap.set(id, id === ds.stores[0].id ? SENTINEL : randomUUID());
};
for (const { rows } of TABLES) for (const r of rows) addId(r?.id);
// Synthetic non-entity actors used by the mock ("sdr-agent" bot, "system") land
// in uuid FK columns (quote/order seller_id, canceled_by, distribution traces).
// Point them at a real seller so the FKs resolve; provenance stays in `origin`/
// cancel metadata. (Harmless in the text author_id columns, which the UI keys
// off `authorType`, not the id.)
const fallbackSeller = idMap.get(ds.sellers[0].id)!;
for (const sentinel of ["sdr-agent", "system"]) idMap.set(sentinel, fallbackSeller);

const snakeToCamel = (s: string) => s.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
const remap = (v: any): any => {
  if (typeof v === "string") return idMap.get(v) ?? v;
  if (Array.isArray(v)) return v.map(remap);
  if (v && typeof v === "object") {
    const out: any = {};
    for (const k of Object.keys(v)) out[k] = remap(v[k]);
    return out;
  }
  return v;
};

function buildRow(table: string, raw: any): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  for (const col of COLUMNS[table]) {
    const field = col === "id" ? "id" : snakeToCamel(col);
    const v = raw[field];
    if (v === undefined) continue; // omit -> DB default / NULL
    row[col] = remap(v);
  }
  return row;
}

async function run() {
  let total = 0;
  for (const { table, rows } of TABLES) {
    const mapped = rows.map((r) => buildRow(table, r));
    if (mapped.length === 0) {
      console.log(`${table}: 0 (skip)`);
      continue;
    }
    if (table === "stores") {
      const { error } = await sb.from(table).upsert(mapped, { onConflict: "id" });
      if (error) throw new Error(`${table} upsert: ${error.message}`);
      console.log(`${table}: ${mapped.length} (upsert)`);
      total += mapped.length;
      continue;
    }
    for (let i = 0; i < mapped.length; i += 500) {
      const chunk = mapped.slice(i, i + 500);
      const { error } = await sb.from(table).insert(chunk);
      if (error) throw new Error(`${table} insert [${i}..${i + chunk.length}]: ${error.message}`);
    }
    console.log(`${table}: ${mapped.length}`);
    total += mapped.length;
  }
  console.log(`\nDONE — ${total} rows inserted across ${TABLES.length} tables. id map: ${idMap.size}`);
}

run().catch((e) => {
  console.error("SEED FAILED:", e.message);
  process.exit(1);
});
