import { useCallback, useEffect, useMemo, useState } from "react";
import type { ID, ISdrEscalation } from "@/shared/types";
import { recordAuditLogSync, useSdrEscalationsProvider } from "@/providers/data";

export const ESCALATION_QUEUE_EVENT = "gallo:escalation-queue";

export interface IEscalationQueueEventDetail {
  kind: "broadcast" | "claim" | "create" | "answer" | "queue-timeout" | "abandon";
  escalationId: ID;
  payload?: Record<string, unknown>;
}

export interface IUrgentBroadcastEntry {
  escalation: ISdrEscalation;
  /** Seconds since the broadcast started. */
  age: number;
}

interface IClaimContext {
  storeId: ID;
}

/**
 * In-memory broadcast queue. Lives on the window so multiple consumers (toast,
 * inbox badge, painel) see the same events without the cost of round-tripping
 * through the mock provider. The queue itself is read from the provider so the
 * source of truth stays the persisted escalation record.
 */
export function useUrgentBroadcastQueue() {
  const provider = useSdrEscalationsProvider();
  const [entries, setEntries] = useState<IUrgentBroadcastEntry[]>([]);

  const refresh = useCallback(async () => {
    try {
      const list = await provider.list({ mode: "urgent" });
      const now = Date.now();
      const broadcasting = list
        .filter(
          (e) =>
            e.status !== "answered" &&
            e.status !== "abandoned" &&
            e.urgentBroadcastAt &&
            !e.urgentBroadcastClaimedBySellerId,
        )
        .map((e) => ({
          escalation: e,
          age: Math.max(0, Math.floor((now - new Date(e.urgentBroadcastAt!).getTime()) / 1000)),
        }));
      setEntries(broadcasting);
    } catch {
      // Provider errors are non-fatal for the queue.
    }
  }, [provider]);

  useEffect(() => {
    void refresh();
    if (typeof window === "undefined") return;
    let debounceTimer: number | null = null;
    const handler = () => {
      if (debounceTimer !== null) window.clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(() => {
        debounceTimer = null;
        void refresh();
      }, 500);
    };
    window.addEventListener(ESCALATION_QUEUE_EVENT, handler);
    // Light interval so the `age` field on visible entries advances even when
    // no event fires. 15s is plenty for a counter rendered next to a button.
    const interval = window.setInterval(() => {
      void refresh();
    }, 15_000);
    return () => {
      window.removeEventListener(ESCALATION_QUEUE_EVENT, handler);
      window.clearInterval(interval);
      if (debounceTimer !== null) window.clearTimeout(debounceTimer);
    };
  }, [refresh]);

  const claim = useCallback(
    async (escalationId: ID, sellerId: ID, context: IClaimContext) => {
      const now = new Date().toISOString();
      const updated = await provider.patch(escalationId, {
        urgentBroadcastClaimedBySellerId: sellerId,
        urgentBroadcastClaimedAt: now,
        assignedSellerId: sellerId,
        assignedAt: now,
        status: "assigned",
      });
      recordAuditLogSync({
        storeId: context.storeId,
        actorId: sellerId,
        action: "sdr_escalate_broadcast_claim",
        resource: "conversation",
        resourceId: updated.conversationId,
        after: { escalationId, sellerId },
      });
      dispatchEscalationEvent({ kind: "claim", escalationId, payload: { sellerId } });
      return updated;
    },
    [provider],
  );

  return useMemo(
    () => ({
      entries,
      refresh,
      claim,
    }),
    [entries, refresh, claim],
  );
}

/** Module-level helper — dispatches the event consumed by every hook above. */
export function dispatchEscalationEvent(detail: IEscalationQueueEventDetail): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(ESCALATION_QUEUE_EVENT, { detail }));
}
