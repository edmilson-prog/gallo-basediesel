import { useCallback, useEffect, useMemo, useState } from "react";
import type { ID, IConversationRescue } from "@/shared/types";
import { useConversationRescuesProvider } from "@/providers/data";

export interface IRescueBroadcastEntry {
  rescue: IConversationRescue;
  /** Seconds since the broadcast started. */
  age: number;
}

/**
 * Polling broadcast queue for the offline-rescue panel (spec 2026-07-17).
 * Mirrors `useUrgentBroadcastQueue` (SDR) but simpler — no local `window`
 * event bus, just a 15s poll plus an immediate refresh right after `claim`.
 */
export function useRescueBroadcastQueue() {
  const provider = useConversationRescuesProvider();
  const [entries, setEntries] = useState<IRescueBroadcastEntry[]>([]);

  const refresh = useCallback(async () => {
    try {
      const list = await provider.list();
      const now = Date.now();
      setEntries(
        list.map((rescue) => ({
          rescue,
          age: Math.max(0, Math.floor((now - new Date(rescue.broadcastAt).getTime()) / 1000)),
        })),
      );
    } catch {
      // Provider errors are non-fatal for the queue.
    }
  }, [provider]);

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
