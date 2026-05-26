import { useEffect, useRef } from "react";
import { toast } from "sonner";
import type { ID, ISdrEscalation, IPlatformSettings } from "@/shared/types";
import {
  recordAuditLogSync,
  useSdrEscalationsProvider,
  useSettingsProvider,
} from "@/providers/data";
import { dispatchEscalationEvent } from "./useUrgentBroadcastQueue";

const POLL_MS = 30_000;

/**
 * Background watchdog that flags queued escalations whose wait exceeded the
 * configured timeout (PRD-023 RF-015). Owner/Gestor sessions keep it on so
 * notifications surface even when no individual seller is online.
 *
 * The function:
 *  - re-runs every 30 seconds,
 *  - reads `escalationQueueTimeoutMinutesUrgent` / `Normal` from settings,
 *  - emits an audit entry `sdr_escalate_queue_timeout` exactly once per
 *    escalation (tracked via a ref of ids).
 *
 * Pending → `abandoned` after 1h with no human reply (RF-020).
 */
export function useEscalationQueueTimeoutMonitor(enabled: boolean): void {
  const provider = useSdrEscalationsProvider();
  const settingsProvider = useSettingsProvider();
  const reportedRef = useRef<Set<ID>>(new Set());

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    async function tick() {
      try {
        // Cap how far back we look so historical seeds (mocks) don't get
        // retroactively flagged. Anything older than 24h is considered
        // settled — it never gets auto-abandoned or queue-timeout flagged.
        const FRESHNESS_WINDOW_MS = 24 * 60 * 60_000;
        const freshnessCutoff = Date.now() - FRESHNESS_WINDOW_MS;
        const isFresh = (iso: string | undefined) =>
          !!iso && new Date(iso).getTime() >= freshnessCutoff;

        const pendingAll = await provider.list({ status: "pending" });
        const pending = pendingAll.filter((e) => isFresh(e.createdAt));
        if (cancelled) return;
        if (pending.length === 0) {
          // Still need to consider assigned ones below.
        }
        const settingsByStore = new Map<ID, IPlatformSettings>();
        async function getSettings(storeId: ID): Promise<IPlatformSettings | null> {
          if (settingsByStore.has(storeId)) return settingsByStore.get(storeId)!;
          try {
            const s = await settingsProvider.get(storeId);
            settingsByStore.set(storeId, s);
            return s;
          } catch {
            return null;
          }
        }
        const now = Date.now();
        for (const e of pending) {
          if (cancelled) return;
          const settings = await getSettings(e.storeId);
          if (!settings) continue;
          const timeoutMinutes =
            e.mode === "urgent"
              ? settings.escalationQueueTimeoutMinutesUrgent
              : settings.escalationQueueTimeoutMinutesNormal;
          const ageMs = now - new Date(e.createdAt).getTime();
          if (ageMs < timeoutMinutes * 60_000) continue;
          if (reportedRef.current.has(e.id)) continue;
          reportedRef.current.add(e.id);
          notifyTimeout(e, Math.floor(ageMs / 60_000));
        }
        // RF-020 abandon — 1h without human response. Only acts on records
        // assigned within the freshness window so historical mocks stay put.
        const assignedAll = await provider.list({ status: "assigned" });
        for (const e of assignedAll) {
          if (cancelled) return;
          if (!isFresh(e.assignedAt)) continue;
          const ageMs = now - new Date(e.assignedAt!).getTime();
          if (ageMs < 60 * 60_000) continue;
          await provider.patch(e.id, { status: "abandoned" });
          recordAuditLogSync({
            storeId: e.storeId,
            actorId: "system",
            action: "sdr_escalate_abandoned",
            resource: "conversation",
            resourceId: e.conversationId,
            after: { escalationId: e.id, ageMinutes: Math.floor(ageMs / 60_000) },
          });
          dispatchEscalationEvent({ kind: "abandon", escalationId: e.id });
        }
      } catch {
        // best-effort
      }
    }

    function notifyTimeout(escalation: ISdrEscalation, ageMinutes: number) {
      recordAuditLogSync({
        storeId: escalation.storeId,
        actorId: "system",
        action: "sdr_escalate_queue_timeout",
        resource: "conversation",
        resourceId: escalation.conversationId,
        after: { escalationId: escalation.id, ageMinutes, mode: escalation.mode },
      });
      dispatchEscalationEvent({ kind: "queue-timeout", escalationId: escalation.id });
      const name = escalation.contextSummary.customerName ?? "cliente";
      toast.warning(`Escalação em fila há ${ageMinutes} min — ${name}. Distribua manualmente.`, {
        duration: 12_000,
      });
    }

    void tick();
    const interval = window.setInterval(() => {
      void tick();
    }, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [enabled, provider, settingsProvider]);
}
