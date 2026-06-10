import { useEffect } from "react";
import type { ID, IMessage } from "@/shared/types";
import { getActiveDataSource } from "@/providers/data";
import { subscribeToTable } from "@/shared/lib/realtime";

/** Build-time data source — the hook is a no-op on the mock simulator. */
const IS_SUPABASE = getActiveDataSource() === "supabase";

/** Raw `public.messages` row as delivered by Realtime postgres_changes. */
interface IMessageRealtimeRow {
  id: string;
  conversation_id: string;
  direction: IMessage["direction"];
  author_type: IMessage["authorType"];
  author_id: string | null;
  provider: IMessage["provider"];
  text: string;
  media_type: IMessage["mediaType"] | null;
  media_url: string | null;
  status: IMessage["status"];
  sent_at: string;
  delivered_at: string | null;
  read_at: string | null;
  failure_reason: string | null;
  failure_code: string | null;
}

/**
 * Local snake_case mapper. The supabase provider has an equivalent private
 * one, but provider impls are not importable outside `providers/data`
 * (ESLint boundary) — and this hook receives raw Realtime payloads, which
 * never pass through the provider.
 */
function rowToMessage(row: IMessageRealtimeRow): IMessage {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    direction: row.direction,
    authorType: row.author_type,
    authorId: row.author_id ?? undefined,
    provider: row.provider,
    text: row.text,
    mediaType: row.media_type ?? undefined,
    mediaUrl: row.media_url ?? undefined,
    status: row.status,
    sentAt: row.sent_at,
    deliveredAt: row.delivered_at ?? undefined,
    readAt: row.read_at ?? undefined,
    failureReason: row.failure_reason ?? undefined,
    failureCode: row.failure_code ?? undefined,
  };
}

/**
 * Live message stream of the OPEN conversation (PRD-118 RF-021, RNF-001).
 *
 * Subscribes to `public.messages` postgres_changes (shared ref-counted
 * channel, PRD-105 — RLS scopes events server-side) and upserts rows of this
 * conversation into the local cache:
 *   - INSERT: inbound from the webhook (PRD-114) appends in place; the 24h
 *     window recomputes via `useMetaWindow` (PRD-117).
 *   - UPDATE: delivery transitions (sent → delivered → read | failed) patch
 *     the bubble badge live, including failure_reason/failure_code.
 *
 * Mock source: no-op — the Fase-1 simulator drives the demo.
 *
 * Takes `apply` directly (instead of the ConversationContext) so the page can
 * wire it before the provider mounts.
 */
export function useRealtimeMessages(conversationId: ID, apply: (row: IMessage) => void): void {
  useEffect(() => {
    if (!IS_SUPABASE) return;
    const off = subscribeToTable("messages", (payload) => {
      const row = payload.new as Partial<IMessageRealtimeRow> | null;
      if (!row?.id || row.conversation_id !== conversationId) return;
      apply(rowToMessage(row as IMessageRealtimeRow));
    });
    return off;
  }, [apply, conversationId]);
}
