import { useEffect, useState } from "react";
import type { ID } from "@/shared/types";
import { AUTH_SOURCE } from "@/features/auth/authSource";
import { useAuth } from "@/features/auth/useAuth";
import { acquirePresenceChannel, releasePresenceChannel } from "@/shared/lib/presenceChannel";

const channelTopic = (conversationId: ID) => `presence:conversation:${conversationId}`;

/**
 * Announces the signed-in seller as "currently viewing this conversation".
 * Mount only while the conversation's panel/thread is actually open — unlike
 * `usePresenceTracker` (mounted once, store-wide, in AppLayout), this is
 * created/destroyed per conversation view. Purely a UI signal (who's looking
 * now); it never affects `conversation_participants`/RLS (who CAN respond).
 */
export function useConversationPresenceTracker(conversationId: ID | null): void {
  const { currentUser } = useAuth();
  const sellerId = currentUser?.sellerId;

  useEffect(() => {
    if (AUTH_SOURCE !== "supabase" || !sellerId || !conversationId) return;
    const topic = channelTopic(conversationId);
    const entry = acquirePresenceChannel(topic);

    const announce = () => entry.track({ sellerId });
    entry.joinListeners.add(announce);
    // Late attach: the shared channel may already be joined (e.g. a reader
    // acquired it first) — the join fanout already happened, announce now.
    if (entry.joined) announce();

    return () => {
      entry.joinListeners.delete(announce);
      // Stop broadcasting even if a reader keeps the channel alive —
      // prevents a ghost "viewing" after closing the conversation panel.
      entry.untrack();
      releasePresenceChannel(topic);
    };
  }, [sellerId, conversationId]);
}

/** Set of seller ids currently viewing `conversationId`; null in mock auth mode
 *  or while `conversationId` is null. */
export function useConversationPresence(conversationId: ID | null): Set<ID> | null {
  const [viewing, setViewing] = useState<Set<ID>>(new Set());

  useEffect(() => {
    if (AUTH_SOURCE !== "supabase" || !conversationId) return;
    const topic = channelTopic(conversationId);
    const entry = acquirePresenceChannel(topic);

    const sync = () => {
      // Presence keys are server-assigned UUIDs (see presenceChannel.ts header
      // note 2) — read the seller ids from the tracked payload values instead.
      const state = entry.presenceState<{ sellerId?: string }>();
      const ids = Object.values(state)
        .flat()
        .map((presence) => presence.sellerId)
        .filter((value): value is string => typeof value === "string");
      setViewing(new Set(ids));
    };
    entry.syncListeners.add(sync);
    // Initial state for late attachers — the channel may already hold a
    // synced presence map from before this reader mounted.
    sync();

    return () => {
      entry.syncListeners.delete(sync);
      releasePresenceChannel(topic);
    };
  }, [conversationId]);

  return AUTH_SOURCE === "supabase" && conversationId ? viewing : null;
}
