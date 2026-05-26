import { useEffect, useRef } from "react";
import { toast } from "sonner";
import type { ID, ISdrEscalation, IPlatformSettings } from "@/shared/types";
import {
  recordAuditLogSync,
  useMessagesProvider,
  useSdrEscalationsProvider,
  useSettingsProvider,
} from "@/providers/data";
import { useAuth } from "@/features/auth/useAuth";
import { dispatchEscalationEvent } from "./useUrgentBroadcastQueue";

const POLL_MS = 4_000;

/**
 * Drives the urgent-broadcast timer (PRD-023 RF-013). Owners/Gestores keep the
 * timer running so the broadcast event survives a single seller logging out.
 *
 * The check fires every 4s — cheap enough on Fase 1 (mock store) and accurate
 * enough for a 30s delay. When an urgent escalation is older than the
 * configured delay without an outbound message from the assigned seller, the
 * hook flips `urgentBroadcastAt`, dispatches the queue event and surfaces a
 * toast for everyone with `useEscalationToasts()`.
 */
export function useUrgentBroadcastTimer(enabled: boolean): void {
  const provider = useSdrEscalationsProvider();
  const messagesProvider = useMessagesProvider();
  const settingsProvider = useSettingsProvider();
  const { currentUser } = useAuth();
  const lastRunRef = useRef<number>(0);

  useEffect(() => {
    if (!enabled) return;
    if (!currentUser) return;
    let cancelled = false;

    async function tick() {
      const now = Date.now();
      if (now - lastRunRef.current < POLL_MS - 500) return;
      lastRunRef.current = now;
      try {
        const escalations = await provider.list({ mode: "urgent", status: "assigned" });
        // Only consider truly recent escalations — historical mocks should
        // never be retroactively broadcasted/patched.
        const FRESHNESS_WINDOW_MS = 10 * 60_000;
        const freshnessCutoff = now - FRESHNESS_WINDOW_MS;
        const eligible = escalations.filter((e) => {
          if (e.urgentBroadcastAt) return false;
          if (!e.assignedSellerId || !e.assignedAt) return false;
          const assignedTs = new Date(e.assignedAt).getTime();
          if (!Number.isFinite(assignedTs)) return false;
          return assignedTs >= freshnessCutoff;
        });
        if (eligible.length === 0) return;
        const settings = await loadSettings(eligible[0].storeId, settingsProvider);
        const delaySeconds = settings?.escalationUrgentBroadcastDelaySeconds ?? 30;
        const cutoff = new Date(now - delaySeconds * 1000).toISOString();

        for (const escalation of eligible) {
          if (cancelled) return;
          if ((escalation.assignedAt ?? "") > cutoff) continue;
          // Check whether the assigned seller already sent a message after
          // assignedAt — if so we skip the broadcast (firstHumanResponseAt
          // is recorded explicitly by the conversation send flow, not here).
          if (await hasSellerResponded(escalation, messagesProvider)) continue;
          await broadcast(escalation, provider);
        }
      } catch {
        // Non-fatal — next tick re-runs.
      }
    }

    void tick();
    const interval = window.setInterval(() => {
      void tick();
    }, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [enabled, currentUser, provider, messagesProvider, settingsProvider]);
}

async function broadcast(
  escalation: ISdrEscalation,
  provider: ReturnType<typeof useSdrEscalationsProvider>,
) {
  const now = new Date().toISOString();
  await provider.patch(escalation.id, { urgentBroadcastAt: now });
  recordAuditLogSync({
    storeId: escalation.storeId,
    actorId: escalation.assignedSellerId ?? "system",
    action: "sdr_escalate_broadcast",
    resource: "conversation",
    resourceId: escalation.conversationId,
    after: { escalationId: escalation.id, delaySeconds: secondsSince(escalation.assignedAt) },
  });
  dispatchEscalationEvent({
    kind: "broadcast",
    escalationId: escalation.id,
    payload: {
      conversationId: escalation.conversationId,
      customerName: escalation.contextSummary.customerName,
    },
  });
  toast.warning(
    `URGENTE: conversa aguardando há ${secondsSince(escalation.assignedAt)}s — ${escalation.contextSummary.customerName ?? "cliente"}`,
    { duration: 12_000 },
  );
}

function secondsSince(iso: string | undefined): number {
  if (!iso) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
}

async function hasSellerResponded(
  escalation: ISdrEscalation,
  messagesProvider: ReturnType<typeof useMessagesProvider>,
): Promise<boolean> {
  try {
    const list = await messagesProvider.list({
      conversationId: escalation.conversationId,
      page: 1,
      pageSize: 50,
      orderDir: "desc",
    });
    const since = escalation.assignedAt ?? escalation.createdAt;
    return list.data.some(
      (m) =>
        m.authorType === "seller" && m.authorId === escalation.assignedSellerId && m.sentAt > since,
    );
  } catch {
    return false;
  }
}

async function loadSettings(
  storeId: ID,
  settingsProvider: ReturnType<typeof useSettingsProvider>,
): Promise<IPlatformSettings | null> {
  try {
    return await settingsProvider.get(storeId);
  } catch {
    return null;
  }
}
