import { useCallback, useEffect, useMemo, useState } from "react";
import type { ID, ISdrEscalation } from "@/shared/types";
import {
  getActiveDataSource,
  recordAuditLogSync,
  useSdrEscalationsProvider,
} from "@/providers/data";
import { subscribeToTable } from "@/shared/lib/realtime";

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

const IS_SUPABASE = getActiveDataSource() === "supabase";

/**
 * Broadcast queue for escalations awaiting a human. Reads from the escalation
 * store itself (the entity of record — `urgentBroadcastAt` set +
 * `urgentBroadcastClaimedBySellerId` unset), not from `mode` — the real tick
 * (Parte D, `sdr-escalation-timeout-tick`) broadcasts 'pending'-nobody-assigned
 * escalations regardless of mode, and 'assigned'-unanswered escalations using
 * a per-mode threshold — mode only ever picked WHICH threshold applied, never
 * whether broadcasting happens. Filtering this queue to `mode==='urgent'`
 * would silently hide every normal/standard broadcast.
 *
 * In supabase mode, a Realtime subscription on `notifications` triggers an
 * immediate `refresh()` on any INSERT — RLS already scopes delivery to rows
 * the current seller (or an Owner/Gestor) can see, so no extra filtering is
 * needed here; it's a purely a "wake up and re-fetch" signal, not itself the
 * data source (the escalation list stays the source of truth).
 */
export function useUrgentBroadcastQueue() {
  const provider = useSdrEscalationsProvider();
  const [entries, setEntries] = useState<IUrgentBroadcastEntry[]>([]);

  const refresh = useCallback(async () => {
    try {
      const list = await provider.list();
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

  // Realtime nudge (supabase mode only — mock has no Supabase client and
  // subscribeToTable would throw synchronously, same guard every other
  // subscribeToTable consumer in this codebase uses).
  useEffect(() => {
    if (!IS_SUPABASE) return;
    return subscribeToTable("notifications", (payload) => {
      if (payload.eventType !== "INSERT") return;
      const row = payload.new as { type?: string };
      if (row.type !== "sdr.escalonouSemResposta") return;
      void refresh();
    });
  }, [refresh]);

  const claim = useCallback(
    async (escalationId: ID, sellerId: ID, context: IClaimContext) => {
      const updated = await provider.claim(escalationId, sellerId);
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
