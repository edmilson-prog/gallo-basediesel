import { useEffect, useState } from "react";
import { AUTH_SOURCE } from "@/features/auth/authSource";
import { useAuth } from "@/features/auth/useAuth";
import { useCurrentStore } from "@/features/multistore";
import { acquirePresenceChannel, releasePresenceChannel } from "@/shared/lib/presenceChannel";

/**
 * Realtime Presence per store (users CRUD addendum): "online" means the app is
 * open in some browser. The shell tracks the signed-in seller; the users screen
 * reads the set of online seller ids. Supabase auth mode only — in mock mode
 * the reader returns null and callers derive a seeded status instead.
 *
 * Thin wrapper over the generic `src/shared/lib/presenceChannel.ts` manager
 * (extracted from this file), scoped to the `presence:store:<id>` topic — see
 * that module for the underlying realtime-js join/re-join semantics this relies on.
 */
const channelTopic = (storeId: string) => `presence:store:${storeId}`;

/** Mounted once in AppLayout — announces the signed-in seller as online. */
export function usePresenceTracker(): void {
  const { currentUser } = useAuth();
  const { currentStoreId } = useCurrentStore();
  const sellerId = currentUser?.sellerId;

  useEffect(() => {
    if (AUTH_SOURCE !== "supabase" || !sellerId || !currentStoreId) return;
    const topic = channelTopic(currentStoreId);
    const entry = acquirePresenceChannel(topic);

    const announce = () => entry.track({ sellerId });
    entry.joinListeners.add(announce);
    // Late attach: the shared channel may already be joined (e.g. a reader
    // acquired it first) — the join fanout already happened, announce now.
    if (entry.joined) announce();

    return () => {
      entry.joinListeners.delete(announce);
      // Stop broadcasting this seller even if a reader keeps the channel
      // alive — prevents a ghost "online" after logout/store switch.
      entry.untrack();
      releasePresenceChannel(topic);
    };
  }, [sellerId, currentStoreId]);
}

/** Set of seller ids currently online in the store; null in mock auth mode. */
export function useStorePresence(storeId: string): Set<string> | null {
  const [online, setOnline] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (AUTH_SOURCE !== "supabase") return;
    const topic = channelTopic(storeId);
    const entry = acquirePresenceChannel(topic);

    const sync = () => {
      // Presence keys are server-assigned UUIDs (see presenceChannel.ts header
      // note 2) — read the seller ids from the tracked payload values instead.
      const state = entry.presenceState<{ sellerId?: string }>();
      const ids = Object.values(state)
        .flat()
        .map((presence) => presence.sellerId)
        .filter((value): value is string => typeof value === "string");
      setOnline(new Set(ids));
    };
    entry.syncListeners.add(sync);
    // Initial state for late attachers — the channel may already hold a
    // synced presence map from before this reader mounted.
    sync();

    return () => {
      entry.syncListeners.delete(sync);
      releasePresenceChannel(topic);
    };
  }, [storeId]);

  return AUTH_SOURCE === "supabase" ? online : null;
}
