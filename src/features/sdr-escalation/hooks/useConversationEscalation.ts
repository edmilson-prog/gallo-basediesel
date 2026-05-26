import { useEffect, useRef, useState } from "react";
import type { ID, ISdrEscalation } from "@/shared/types";
import { useSdrEscalationsProvider } from "@/providers/data";
import { ESCALATION_QUEUE_EVENT } from "./useUrgentBroadcastQueue";

const REFETCH_DEBOUNCE_MS = 500;

/**
 * Subscribe to the latest escalation bound to a conversation. The hook reacts
 * to the same broadcast event used by the inbox so the conversation header
 * updates in real-time when an escalation lands. Debounced.
 */
export function useConversationEscalation(conversationId: ID | null): ISdrEscalation | null {
  const provider = useSdrEscalationsProvider();
  const [escalation, setEscalation] = useState<ISdrEscalation | null>(null);
  const debounceRef = useRef<number | null>(null);

  useEffect(() => {
    if (!conversationId) {
      setEscalation(null);
      return;
    }
    let cancelled = false;
    async function fetchOne() {
      try {
        const e = await provider.getByConversation(conversationId!);
        if (!cancelled) setEscalation(e);
      } catch {
        if (!cancelled) setEscalation(null);
      }
    }
    void fetchOne();
    const handler = () => {
      if (debounceRef.current !== null) window.clearTimeout(debounceRef.current);
      debounceRef.current = window.setTimeout(() => {
        debounceRef.current = null;
        void fetchOne();
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
  }, [provider, conversationId]);

  return escalation;
}
