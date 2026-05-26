import { useEffect, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import type { ID, ISdrEscalation } from "@/shared/types";
import { useAuth } from "@/features/auth/useAuth";
import { useSdrEscalationsProvider } from "@/providers/data";
import { ESCALATION_QUEUE_EVENT } from "./useUrgentBroadcastQueue";

/**
 * Subscribes to the escalation event stream and surfaces a toast every time a
 * new escalation lands on the currently-authenticated seller. Owners/Gestores
 * see standard toasts; the assigned seller sees an emphasized one with a CTA
 * that opens the conversation. Urgent mode adds a longer duration + a distinct
 * accent. Runs once per session — used by the inbox shell so the toast is
 * available everywhere inside `/app/`.
 */
export function useEscalationToasts(): void {
  const provider = useSdrEscalationsProvider();
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const seenIds = useRef<Set<ID>>(new Set());
  const seededRef = useRef(false);

  useEffect(() => {
    if (!currentUser) return;
    const userId = currentUser.id;

    async function reconcile() {
      try {
        const list = await provider.list({ status: "assigned" });
        const fresh = list.filter(
          (e) => e.assignedSellerId === userId && !seenIds.current.has(e.id),
        );
        if (!seededRef.current) {
          // First reconcile after login — record everything as seen so we do
          // not flood the user with historical toasts.
          for (const e of list) seenIds.current.add(e.id);
          seededRef.current = true;
          return;
        }
        for (const e of fresh) {
          seenIds.current.add(e.id);
          presentToast(e);
        }
      } catch {
        // Silent fallback — toasts are best-effort.
      }
    }

    function presentToast(e: ISdrEscalation) {
      const name = e.contextSummary.customerName ?? "Cliente";
      const description = `Conversa escalada pelo SDR — ${name}`;
      const isUrgent = e.mode === "urgent";
      const messageFn = isUrgent ? toast.error : toast.info;
      messageFn(
        isUrgent
          ? `🚨 URGENTE — Nova conversa escalada pelo SDR (${name})`
          : `🤖 Nova conversa escalada pelo SDR — ${name}`,
        {
          description,
          duration: isUrgent ? 15_000 : 8_000,
          action: {
            label: "Atender agora",
            onClick: () => {
              void navigate({
                to: "/app/atendimento/$id",
                params: { id: e.conversationId },
              });
            },
          },
        },
      );
    }

    void reconcile();

    let debounceTimer: number | null = null;
    const handler = () => {
      if (debounceTimer !== null) window.clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(() => {
        debounceTimer = null;
        void reconcile();
      }, 800);
    };
    if (typeof window !== "undefined") {
      window.addEventListener(ESCALATION_QUEUE_EVENT, handler);
      return () => {
        window.removeEventListener(ESCALATION_QUEUE_EVENT, handler);
        if (debounceTimer !== null) window.clearTimeout(debounceTimer);
      };
    }
    return undefined;
  }, [provider, currentUser, navigate]);
}
