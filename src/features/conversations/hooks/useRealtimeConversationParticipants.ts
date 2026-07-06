import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { ID } from "@/shared/types";
import { subscribeToTable } from "@/shared/lib/realtime";
import { getActiveDataSource } from "@/providers/data";

/** Build-time data source: mock has no Supabase client to subscribe to. */
const IS_SUPABASE = getActiveDataSource() === "supabase";

/**
 * Keeps the OPEN conversation's collaborator list live for everyone viewing it.
 * When a participant is added or removed on `conversationId`, invalidate its
 * detail bundle so the ficha's "Colaboradores" section updates immediately —
 * e.g. the responsável sees a collaborator leave without a manual refresh.
 *
 * Complements `useCollaboratorAddedListener`, which only fires the app-level
 * "you were added" card for the CURRENT seller; this is the per-conversation
 * counterpart that refreshes the detail for ANY viewer. RLS scopes delivery
 * (cp_select); DELETE events rely on REPLICA IDENTITY FULL
 * (migration 20260705200000_conversation_participants_replica_full).
 */
export function useRealtimeConversationParticipants(conversationId: ID | null): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    // Same guard every subscribeToTable consumer uses: in mock mode there is no
    // client and subscribing would throw synchronously.
    if (!IS_SUPABASE || !conversationId) return;
    return subscribeToTable("conversation_participants", (payload) => {
      // DELETE carries the row in `old` (REPLICA IDENTITY FULL); INSERT in `new`.
      const rec = (payload.eventType === "DELETE" ? payload.old : payload.new) as
        | { conversation_id?: string }
        | undefined;
      if (rec?.conversation_id !== conversationId) return;
      void queryClient.invalidateQueries({
        queryKey: ["conversation-detail", conversationId],
      });
    });
  }, [conversationId, queryClient]);
}
