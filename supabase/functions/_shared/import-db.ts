/**
 * Shared service_role IImportDb adapter for the WhatsApp history imports
 * (Evolution REST + Evolution Go HistorySync + WAHA). Both/all edges land
 * messages through identical persistence: pool conversation (never
 * auto-assigned), advance-only activity, dedup by provider_message_id (unique
 * index + ignoreDuplicates). Anchor resolution (Funnel Frente 3, approved
 * rule b+): an existing customer wins on a tolerant phone match; otherwise an
 * existing lead is reused as-is; otherwise a brand-new owner-less lead is
 * created — imports never create customers or touch the rotation queue.
 *
 * Edge-native (uses supabase-js) — lives OUTSIDE the mirrored _shared/whatsapp
 * tree, which scripts/sync-whatsapp-shared.ts wipes and regenerates from src.
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.107.0";
import type { IImportDb } from "./whatsapp/import/core.ts";
import { phoneDigitsMatchBr } from "./whatsapp/phoneBr.ts";

/** PostgREST-safe chunk sizes (URL length for `in`, payload for bulk insert). */
const FILTER_CHUNK = 200;
const INSERT_CHUNK = 500;

// Fallback pipeline stage when a store has none configured yet — mirrors
// whatsapp-webhook's / waha-webhook's DEFAULT_FIRST_STAGE.
const DEFAULT_FIRST_STAGE = { id: "stage-novo", name: "Novo", order: 1, color: "#5b6b7a" };

async function getFirstStage(
  admin: SupabaseClient,
  storeId: string,
): Promise<Record<string, unknown>> {
  const { data } = await admin.from("stores").select("settings").eq("id", storeId).maybeSingle();
  const stages = (data?.settings as { pipelineStages?: Array<Record<string, unknown>> } | null)
    ?.pipelineStages;
  if (!stages || stages.length === 0) return DEFAULT_FIRST_STAGE;
  return [...stages].sort((a, b) => (a.order as number) - (b.order as number))[0]!;
}

/** A conversation whose last message falls within this many days of "now"
 *  counts as an active lead. Mirror of VITALITY_WINDOW_DAYS in
 *  src/features/leads/engine/orphanClassification.ts — keep in sync; Deno
 *  cannot import the src engine (this file is edge-native, not mirrored). */
const VITALITY_WINDOW_DAYS = 7;
/** Mirror of IMPORT_LOSS_REASON in orphanClassification.ts — keep in sync. */
const IMPORT_LOSS_REASON = "Importado sem interação";
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function makeImportDb(
  admin: SupabaseClient,
  provider: "evolution" | "evolution-go" | "waha",
): IImportDb {
  return {
    async findCustomerByPhone(storeId, phoneDigits) {
      // Suffix narrow in SQL, tolerant BR match in code (mirrors the webhook —
      // stored numbers vary: missing DDI 55, 9th-digit divergence).
      const { data } = await admin
        .from("customers")
        .select("id, phone")
        .eq("store_id", storeId)
        .like("phone", `%${phoneDigits.slice(-8)}`);
      const row = (data ?? []).find((candidate) =>
        phoneDigitsMatchBr(String(candidate.phone).replace(/\D/g, ""), phoneDigits),
      );
      return row ? { id: row.id as string } : null;
    },
    async findLeadByPhone(storeId, phoneDigits) {
      // Same tolerant-match shape against the generated leads.phone_digits
      // column (migration 20260716210000) — checked only when no customer
      // matched; the caller reuses the lead AS-IS (never reopens, never
      // reassigns — imports are not the live channel).
      const { data } = await admin
        .from("leads")
        .select("id, phone_digits")
        .eq("store_id", storeId)
        .like("phone_digits", `%${phoneDigits.slice(-8)}`);
      const row = (data ?? []).find((candidate) =>
        phoneDigitsMatchBr(String(candidate.phone_digits ?? "").replace(/\D/g, ""), phoneDigits),
      );
      return row ? { id: row.id as string } : null;
    },
    async createImportLead({ storeId, phone, name, lastMessageAt }) {
      const stage = await getFirstStage(admin, storeId);
      // ---- mirror of src/features/leads/engine/orphanClassification -----
      // (VITALITY_WINDOW_DAYS=7, IMPORT_LOSS_REASON) — keep in sync; Deno
      // cannot import the src engine. A lastMessageAt within 7 days of now
      // is an active lead (kanban-visible); older, or null/unparseable, is
      // dormant (loss_reason recorded — invisible in the active kanban, the
      // live webhook auto-reopens it the moment the person messages).
      const parsed = lastMessageAt ? Date.parse(lastMessageAt) : Number.NaN;
      const isActive = Number.isFinite(parsed) && Date.now() - parsed <= VITALITY_WINDOW_DAYS * MS_PER_DAY;
      const leadRow: Record<string, unknown> = {
        // leads.id has no DB default (text PK) — mint it explicitly, same
        // style as the app-level provider and the live webhook adapters.
        id: crypto.randomUUID(),
        store_id: storeId,
        // No wallet owner: imported leads carry seller_id null until a live
        // inbound (or a manual conversion) assigns a real seller via rotation
        // (leads.seller_id is nullable — migration 20260718150000).
        seller_id: null,
        name: name ?? phone,
        phone,
        stage,
        temperature: "frio",
        origin: "import",
        conversations: [],
        tags: [],
      };
      if (!isActive) leadRow.loss_reason = IMPORT_LOSS_REASON;
      const { data, error } = await admin.from("leads").insert(leadRow).select("id").single();
      if (error) throw new Error(`createImportLead: ${error.message}`);
      return { id: data.id as string };
    },
    async findConversation({ customerId, leadId }, accountId) {
      // ANY status — history import always belongs to the anchor's existing
      // thread on this account (open or closed); reusing one only appends
      // messages, it never flips status back to "aguardando".
      let query = admin.from("conversations").select("id").eq("whatsapp_account_id", accountId);
      query = customerId ? query.eq("customer_id", customerId) : query.eq("lead_id", leadId as string);
      const { data } = await query.order("created_at", { ascending: false }).limit(1).maybeSingle();
      return data ? { id: data.id as string } : null;
    },
    async createConversation(input) {
      const { data, error } = await admin
        .from("conversations")
        .insert({
          store_id: input.storeId,
          customer_id: input.customerId,
          lead_id: input.leadId,
          whatsapp_account_id: input.accountId,
          assigned_seller_id: input.assignedSellerId,
          channel: "whatsapp",
          status: input.status,
          last_message_at: input.lastMessageAt,
          unread_count: 0,
          created_at: input.createdAt,
        })
        .select("id")
        .single();
      if (error) {
        if (error.code === "23505") {
          // Lost a race against the live webhook (the mid-July WAHA migration
          // produced exactly this class of duplicate): the partial unique
          // index vetoed the INSERT — append the import into the winner's
          // open conversation instead.
          let winnerQuery = admin
            .from("conversations")
            .select("id")
            .eq("whatsapp_account_id", input.accountId)
            .not("status", "in", "(resolvida,arquivada)");
          winnerQuery = input.customerId
            ? winnerQuery.eq("customer_id", input.customerId)
            : winnerQuery.eq("lead_id", input.leadId as string);
          const { data: winner, error: winnerErr } = await winnerQuery
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (winner) return { id: winner.id as string };
          throw new Error(
            `createConversation race recovery failed: ${winnerErr?.message ?? "no open conversation found"}`,
          );
        }
        throw new Error(`createConversation: ${error.message}`);
      }
      return { id: data.id as string };
    },
    async filterKnownProviderMessageIds(ids) {
      const known = new Set<string>();
      for (let i = 0; i < ids.length; i += FILTER_CHUNK) {
        const { data } = await admin
          .from("messages")
          .select("provider_message_id")
          .in("provider_message_id", ids.slice(i, i + FILTER_CHUNK));
        for (const row of data ?? []) {
          if (row.provider_message_id) known.add(row.provider_message_id as string);
        }
      }
      return known;
    },
    async insertImportedMessages(rows) {
      for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
        const chunk = rows.slice(i, i + INSERT_CHUNK).map((row) => ({
          conversation_id: row.conversationId,
          direction: row.direction,
          author_type: row.direction === "in" ? "customer" : "seller",
          author_id: row.authorId,
          provider,
          text: row.text,
          media_type: row.mediaType,
          media_filename: row.mediaFilename ?? null,
          // Historical media is NOT downloaded — eligible for manual retry.
          media_download_status: row.mediaType ? "failed" : null,
          status: row.status,
          sent_at: row.sentAt,
          provider_message_id: row.providerMessageId,
          // webhook_event_ids omitted on purpose — DB default '{}' applies.
        }));
        // ignoreDuplicates → ON CONFLICT (provider_message_id) DO NOTHING: the
        // unique index closes the race against the live webhook.
        const { error } = await admin
          .from("messages")
          .upsert(chunk, { onConflict: "provider_message_id", ignoreDuplicates: true });
        if (error) throw new Error(`insertImportedMessages: ${error.message}`);
      }
    },
    async advanceConversationActivity(conversationId, lastMessageAt) {
      // Advance-only: imported history must never walk last_message_at backwards.
      await admin
        .from("conversations")
        .update({ last_message_at: lastMessageAt, updated_at: new Date().toISOString() })
        .eq("id", conversationId)
        .lt("last_message_at", lastMessageAt);
    },
  };
}
