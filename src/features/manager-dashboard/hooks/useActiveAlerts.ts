import { useEffect, useMemo, useState } from "react";
import type {
  IConversation,
  ICustomer,
  ID,
  IManagerDashboardSettings,
  ISeller,
} from "@/shared/types";
import type { IManagerDashboardSnapshot } from "@/providers/data";

export type AlertSeverity = "critical" | "high" | "medium";
export type AlertKind = "cliente-a-dormente" | "vendedor-sobrecarregado" | "conversa-sem-resposta";

export interface IActiveAlert {
  id: string;
  kind: AlertKind;
  severity: AlertSeverity;
  /** Specific text already localized (pt-BR). */
  message: string;
  /** Stable hash used to persist dismissals across reloads. */
  hash: string;
  /** Navigation target — `to` path and optional search params. */
  view: { to: string; search?: Record<string, string> };
}

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

function buildClienteADormenteAlerts(customers: ICustomer[], now: number): IActiveAlert[] {
  const alerts: IActiveAlert[] = [];
  for (const c of customers) {
    if (c.abcClass !== "A" || c.status !== "dormente") continue;
    const name = c.type === "B2B" ? c.nomeFantasia : c.fullName;
    const since = c.lastPurchaseAt ? new Date(c.lastPurchaseAt).getTime() : null;
    const days = since !== null ? Math.max(1, Math.round((now - since) / (24 * 3600_000))) : 0;
    alerts.push({
      id: `cliente-a-dormente-${c.id}`,
      kind: "cliente-a-dormente",
      severity: "high",
      message: `Cliente A dormente: ${name} — ${days} dia${days === 1 ? "" : "s"} sem compra`,
      hash: `cliente-a-dormente-${c.id}`,
      view: { to: "/app/clientes/$id", search: {} },
    });
  }
  return alerts;
}

function buildVendedorSobrecarregadoAlerts(
  sellers: ISeller[],
  loadBySeller: Map<ID, number>,
  threshold: number,
): IActiveAlert[] {
  const alerts: IActiveAlert[] = [];
  for (const seller of sellers) {
    const load = loadBySeller.get(seller.id) ?? 0;
    if (load <= threshold) continue;
    alerts.push({
      id: `vendedor-sobrecarregado-${seller.id}`,
      kind: "vendedor-sobrecarregado",
      severity: "medium",
      message: `${seller.fullName} está sobrecarregado — ${load} conversas ativas (limite ${threshold})`,
      hash: `vendedor-sobrecarregado-${seller.id}`,
      view: { to: "/app/atendimento", search: { assignment: seller.id } },
    });
  }
  return alerts;
}

function buildConversaSemRespostaAlerts(
  conversations: IConversation[],
  thresholdHours: number,
  now: number,
): IActiveAlert[] {
  const cutoff = now - thresholdHours * 3600_000;
  const stale = conversations.filter(
    (c) => c.status === "aguardando" && new Date(c.lastMessageAt).getTime() < cutoff,
  );
  if (stale.length === 0) return [];
  return [
    {
      id: `conversa-sem-resposta-${thresholdHours}h`,
      kind: "conversa-sem-resposta",
      severity: "critical",
      message: `${stale.length} conversa${stale.length === 1 ? "" : "s"} sem resposta há mais de ${thresholdHours}h`,
      hash: `conversa-sem-resposta`,
      view: { to: "/app/atendimento", search: { status: "aguardando", sort: "waiting" } },
    },
  ];
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
