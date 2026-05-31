import { useEffect, useMemo, useState } from "react";
import type { ID, IManagerDashboardSettings } from "@/shared/types";
import type { IManagerDashboardSnapshot } from "@/providers/data";
import {
  buildClienteADormenteAlerts,
  buildVendedorSobrecarregadoAlerts,
  buildConversaSemRespostaAlerts,
  type IActiveAlert,
  type AlertSeverity,
} from "@/providers/notifications";

// Re-export the shared alert types so existing PRD-014 consumers
// (ManagerDashboardPage, ActiveAlertsList) keep importing them from this hook.
// The definitions now live in the notifications provider (single source of truth
// shared with the PRD-008 reconciler).
export type { IActiveAlert, AlertSeverity, AlertKind } from "@/providers/notifications";

const DISMISS_PREFIX = "gallo-alert-dismissed-";
const DISMISS_TTL_MS = 24 * 60 * 60 * 1000;

function readDismissed(hash: string): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(`${DISMISS_PREFIX}${hash}`);
    if (!raw) return null;
    const ts = Number(raw);
    return Number.isFinite(ts) ? ts : null;
  } catch {
    return null;
  }
}

function isDismissed(hash: string, now: number): boolean {
  const ts = readDismissed(hash);
  if (ts === null) return false;
  return now - ts < DISMISS_TTL_MS;
}

export function persistDismissal(hash: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(`${DISMISS_PREFIX}${hash}`, Date.now().toString());
  } catch {
    // localStorage may be disabled — non-fatal.
  }
}

export interface IUseActiveAlertsResult {
  alerts: IActiveAlert[];
  /** Total alerts before applying dismissals. */
  totalBeforeDismissals: number;
  dismiss: (hash: string) => void;
  /** Bump key — forces consumers to recompute when dismissals change. */
  refreshTick: number;
}

/**
 * Compute the active alerts list from the snapshot + settings.
 * Re-evaluates on a setInterval driven by `alertPollingSeconds`, and recomputes
 * immediately whenever the snapshot or settings change.
 */
export function useActiveAlerts(
  snapshot: IManagerDashboardSnapshot,
  settings: IManagerDashboardSettings,
): IUseActiveAlertsResult {
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    const intervalMs = Math.max(5, settings.alertPollingSeconds) * 1000;
    const id = window.setInterval(() => setRefreshTick((t) => t + 1), intervalMs);
    return () => window.clearInterval(id);
  }, [settings.alertPollingSeconds]);

  const { alerts, totalBeforeDismissals } = useMemo(() => {
    const now = Date.now();
    const loadBySeller = new Map<ID, number>();
    for (const conv of snapshot.openConversations) {
      if (!conv.assignedSellerId) continue;
      loadBySeller.set(conv.assignedSellerId, (loadBySeller.get(conv.assignedSellerId) ?? 0) + 1);
    }

    let all: IActiveAlert[] = [];
    if (settings.alertClienteADormenteEnabled) {
      all = all.concat(buildClienteADormenteAlerts(snapshot.customers, now));
    }
    if (settings.alertVendedorSobrecarregadoEnabled) {
      all = all.concat(
        buildVendedorSobrecarregadoAlerts(
          snapshot.sellers,
          loadBySeller,
          settings.sellerOverloadThreshold,
        ),
      );
    }
    if (settings.alertConversaSemRespostaEnabled) {
      all = all.concat(
        buildConversaSemRespostaAlerts(
          snapshot.openConversations,
          settings.conversationWaitingHoursThreshold,
          now,
        ),
      );
    }

    // Sort by severity (critical first), then alphabetically for stable order.
    const severityRank: Record<AlertSeverity, number> = {
      critical: 0,
      high: 1,
      medium: 2,
    };
    all.sort((a, b) => {
      const r = severityRank[a.severity] - severityRank[b.severity];
      return r !== 0 ? r : a.message.localeCompare(b.message);
    });

    const filtered = all.filter((a) => !isDismissed(a.hash, now));
    return { alerts: filtered, totalBeforeDismissals: all.length };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot, settings, refreshTick]);

  const dismiss = (hash: string) => {
    persistDismissal(hash);
    setRefreshTick((t) => t + 1);
  };

  return { alerts, totalBeforeDismissals, dismiss, refreshTick };
}

/** Map alert kind → ID used to anchor the customer ficha drill-down. */
export function alertCustomerId(alert: IActiveAlert): ID | null {
  if (alert.kind !== "cliente-a-dormente") return null;
  return alert.id.replace(/^cliente-a-dormente-/, "");
}
