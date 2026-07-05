import { useEffect, useState } from "react";
import type { ID } from "@/shared/types";
import { subscribeToTable } from "@/shared/lib/realtime";
import { useAuth } from "@/features/auth/useAuth";
import { getActiveDataSource, useConversationsProvider, useSellersProvider } from "@/providers/data";

const IS_SUPABASE = getActiveDataSource() === "supabase";

export interface ICollaboratorAddedEvent {
  conversationId: ID;
  customerName: string;
  addedByName: string;
}

/**
 * Live "you were just added as a collaborator" signal — separate from the
 * bell (`notifications`, polling-based, see `useUnreadCount`). Subscribes to
 * `conversation_participants` postgres_changes (RLS already scopes delivery
 * to rows visible under `cp_select` — non-staff only ever receive INSERTs
 * where they're the added seller or the conversation's assignee); reacts to
 * ANY insert where the new row's seller is the current user, regardless of
 * `source` (manual invite and @mention auto-add both deserve the visual
 * "you now have access" card — only the BELL notification is source-gated,
 * see `notify_conversation_participant_added`).
 */
export function useCollaboratorAddedListener(): {
  events: ICollaboratorAddedEvent[];
  dismiss: (index: number) => void;
} {
  const { currentUser } = useAuth();
  const sellerId = currentUser?.sellerId;
  const conversationsProvider = useConversationsProvider();
  const sellersProvider = useSellersProvider();
  const [events, setEvents] = useState<ICollaboratorAddedEvent[]>([]);

  useEffect(() => {
    // Mock mode has no Supabase client — subscribeToTable would throw
    // synchronously and white-screen the app (this hook is mounted in
    // AppLayout). Same guard every other subscribeToTable consumer uses.
    if (!IS_SUPABASE || !sellerId) return;
    // The effect re-subscribes whenever `sellerId` changes (it's a dependency
    // below), so the closure's `sellerId` is always current for this
    // subscription's lifetime — no ref needed to avoid staleness.
    return subscribeToTable("conversation_participants", (payload) => {
      if (payload.eventType !== "INSERT") return;
      const row = payload.new as { conversation_id?: string; seller_id?: string; added_by?: string };
      if (!row.conversation_id || row.seller_id !== sellerId) return;

      void (async () => {
        const conversation = await conversationsProvider.get(row.conversation_id!).catch(() => null);
        if (!conversation) return;
        const [customer, addedBySeller] = await Promise.all([
          // `listContacts` resolves a display name for BOTH customer and lead
          // conversations (including pool/unassigned ones with no
          // `customerId`) — gate on either id, not just `customerId`.
          conversation.customerId || conversation.leadId
            ? conversationsProvider
                .listContacts([conversation.id])
                .then((rows) => rows.find((r) => r.conversationId === conversation.id) ?? null)
                .catch(() => null)
            : null,
          row.added_by ? sellersProvider.get(row.added_by).catch(() => null) : null,
        ]);
        // The realtime layer's delivery contract is at-least-once (see
        // `subscribeToTable`'s docstring) — an auth-token re-join can dispatch
        // the same INSERT twice. Dedupe on `conversationId` (this listener
        // only ever fires for the current seller, so it's an effective
        // per-seller-per-conversation key) before appending.
        setEvents((prev) =>
          prev.some((e) => e.conversationId === conversation.id)
            ? prev
            : [
                ...prev,
                {
                  conversationId: conversation.id,
                  customerName: customer?.name ?? "um cliente",
                  addedByName: addedBySeller?.fullName ?? "Um atendente",
                },
              ],
        );
      })();
    });
  }, [sellerId, conversationsProvider, sellersProvider]);

  const dismiss = (index: number) => setEvents((prev) => prev.filter((_, i) => i !== index));

  return { events, dismiss };
}
