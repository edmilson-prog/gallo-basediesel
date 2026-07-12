/**
 * Shared service_role IImportDb adapter for the WhatsApp history imports
 * (Evolution REST + Evolution Go HistorySync). Both edges land messages through
 * identical persistence: pool conversation (never auto-assigned), advance-only
 * activity, dedup by provider_message_id (unique index + ignoreDuplicates).
 *
 * Edge-native (uses supabase-js) — lives OUTSIDE the mirrored _shared/whatsapp
 * tree, which scripts/sync-whatsapp-shared.ts wipes and regenerates from src.
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.107.0";
import type { IImportDb } from "./whatsapp/import/core.ts";

/** PostgREST-safe chunk sizes (URL length for `in`, payload for bulk insert). */
const FILTER_CHUNK = 200;
const INSERT_CHUNK = 500;

/** Closed conversations are never reused — keep in sync with whatsapp-webhook. */
const CLOSED_CONVERSATION_STATUSES = ["resolvida", "arquivada"];

export function makeImportDb(
  admin: SupabaseClient,
  provider: "evolution" | "evolution-go" | "waha",
): IImportDb {
  return {
    async findCustomerByPhone(storeId, phoneDigits) {
      // Suffix narrow in SQL, exact digit match in code (mirrors the webhook).
      const { data } = await admin
        .from("customers")
        .select("id, phone")
        .eq("store_id", storeId)
        .like("phone", `%${phoneDigits.slice(-8)}`);
      const row = (data ?? []).find(
        (candidate) => String(candidate.phone).replace(/\D/g, "") === phoneDigits,
      );
      return row ? { id: row.id as string } : null;
    },
    async createPendingCustomer({ storeId, phone }) {
      const { data, error } = await admin
        .from("customers")
        .insert({
          store_id: storeId,
          // customers_type_check requires uppercase 'B2C' (matches the app/seed).
          type: "B2C",
          phone,
          full_name: phone,
          // No wallet owner: imported anchors carry seller_id null until a manual
          // conversion assigns a real seller (customers.seller_id is nullable).
          status: "ativo",
          tags: ["pending_review"],
        })
        .select("id")
        .single();
      if (error) throw new Error(`createPendingCustomer: ${error.message}`);
      return { id: data.id as string };
    },
    async findOpenConversation(customerId, accountId) {
      const { data } = await admin
        .from("conversations")
        .select("id")
        .eq("customer_id", customerId)
        .eq("whatsapp_account_id", accountId)
        .not("status", "in", `(${CLOSED_CONVERSATION_STATUSES.join(",")})`)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data ? { id: data.id as string } : null;
    },
    async createConversation(input) {
      const { data, error } = await admin
        .from("conversations")
        .insert({
          store_id: input.storeId,
          customer_id: input.customerId,
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
      if (error) throw new Error(`createConversation: ${error.message}`);
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
