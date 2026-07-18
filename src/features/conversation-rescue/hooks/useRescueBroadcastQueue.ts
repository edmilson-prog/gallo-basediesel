import { useCallback, useEffect, useMemo, useState } from "react";
import type { ID, IConversationRescue } from "@/shared/types";
import { useConversationRescuesProvider, useSellersProvider } from "@/providers/data";
import { useAuth } from "@/features/auth/useAuth";

export interface IRescueBroadcastEntry {
  rescue: IConversationRescue;
  /** Seconds since the broadcast started. */
  age: number;
}

/**
 * Polling broadcast queue for the offline-rescue panel (spec 2026-07-17).
 * Mirrors `useUrgentBroadcastQueue` (SDR) but simpler — no local `window`
 * event bus, just a 15s poll plus an immediate refresh right after `claim`.
 *
 * Audience filter (incident 2026-07-18): the offer is for ONLINE sellers
 * only, and never for the absent seller themselves — RLS alone let the
 * owner (offline, absent) see and claim his own rescues, feeding a
 * re-broadcast loop.
 */
export function useRescueBroadcastQueue() {
  const provider = useConversationRescuesProvider();
  const sellersProvider = useSellersProvider();
  const { currentUser } = useAuth();
  const sellerId = currentUser?.sellerId ?? null;
  const [entries, setEntries] = useState<IRescueBroadcastEntry[]>([]);

  const refresh = useCallback(async () => {
    try {
      if (!sellerId) {
        setEntries([]);
        return;
      }
      const [list, me] = await Promise.all([provider.list(), sellersProvider.get(sellerId)]);
      if (me.availability !== "online") {
        setEntries([]);
        return;
      }
      const now = Date.now();
      setEntries(
        list
          .filter((rescue) => rescue.absentSellerId !== sellerId)
          .map((rescue) => ({
            rescue,
            age: Math.max(0, Math.floor((now - new Date(rescue.broadcastAt).getTime()) / 1000)),
          })),
      );
    } catch {
      // Provider errors are non-fatal for the queue.
    }
  }, [provider, sellersProvider, sellerId]);

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => void refresh(), 15_000);
    return () => window.clearInterval(interval);
  }, [refresh]);

  const claim = useCallback(
    async (rescueId: ID) => {
      const updated = await provider.claim(rescueId);
      await refresh();
      return updated;
    },
    [provider, refresh],
  );

  return useMemo(() => ({ entries, refresh, claim }), [entries, refresh, claim]);
}
