import { useEffect, useMemo, useRef, useState } from "react";
import type { ID, ISdrEscalation } from "@/shared/types";
import { useSdrEscalationsProvider } from "@/providers/data";
import { ESCALATION_QUEUE_EVENT } from "./useUrgentBroadcastQueue";

const REFETCH_DEBOUNCE_MS = 500;

/**
 * Reactive lookup of escalations keyed by conversationId. The hook re-fetches
 * whenever the urgent-broadcast event fires (which also covers regular
 * handoffs since the responder hook dispatches it after every escalation).
 *
 * Debounces refetches so a burst of events (typical when timers patch several
 * records in a row) collapses into a single network call.
 */
export function useEscalationsByConversation(): Map<ID, ISdrEscalation> {
  const provider = useSdrEscalationsProvider();
  const [items, setItems] = useState<ISdrEscalation[]>([]);
  const debounceRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function fetchAll() {
      try {
        const list = await provider.list();
        if (!cancelled) setItems(list);
      } catch {
        // Provider errors are surfaced elsewhere; the inbox shouldn't break.
      }
    }
    void fetchAll();
    const handler = () => {
      if (debounceRef.current !== null) window.clearTimeout(debounceRef.current);
      debounceRef.current = window.setTimeout(() => {
        debounceRef.current = null;
        void fetchAll();
      }, REFETCH_DEBOUNCE_MS);
    };
    if (typeof window !== "undefined") {
      window.addEventListener(ESCALATION_QUEUE_EVENT, handler);
      return () => {
        cancelled = true;
        if (debounceRef.current !== null) window.clearTimeout(debounceRef.current);
        window.removeEventListener(ESCALATION_QUEUE_EVENT, handler);
      };
    }
    return () => {
      cancelled = true;
    };
  }, [provider]);

  return useMemo(() => {
    // Keep the most recent escalation per conversation.
    const map = new Map<ID, ISdrEscalation>();
    const sorted = [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    for (const e of sorted) {
      if (!map.has(e.conversationId)) map.set(e.conversationId, e);
    }
    return map;
  }, [items]);
}
