/**
 * Derived-condition reconciler (PRD-008, RF-024+). Replaces the localStorage
 * dismissal side-effects of PRD-014: instead of computing alerts only inside the
 * manager dashboard, it runs off the render path (boot + interval) and projects
 * the three shared derived conditions into `lifecycle:"derived"` notifications.
 *
 * Each pass rebuilds the current conditions from the data snapshot using the
 * SAME `build*` functions the dashboard uses (conditions/derivedConditions), maps
 * each IActiveAlert to a derived INotification per recipient, and calls
 * `reconcileDerived` so conditions that disappeared are expired automatically —
 * no manual dismissal bookkeeping.
 *
 * Data access is injected (the notification provider is mounted inside the data
 * provider), keeping this module free of React and of the manager-dashboard
 * feature layer. When no data access is supplied (e.g. stories), it is a no-op.
 */
import type { ID, IManagerDashboardSettings, INotification, IStore } from "@/shared/types";
import type {
  IManagerDashboardProvider,
  IManagerDashboardSnapshot,
  IManagerDashboardSnapshotParams,
  ISettingsProvider,
  IStoresProvider,
} from "@/providers/data";
import type { INotificationStores } from "./contracts";
import {
  buildClienteADormenteAlerts,
  buildConversaSemRespostaAlerts,
  buildVendedorSobrecarregadoAlerts,
  type AlertKind,
  type IActiveAlert,
} from "./conditions/derivedConditions";
import type { NotificationEventType } from "./events";
import { ROUTING_RULES } from "./routing/rules";

/** Data providers the reconciler reads from (injected by the provider). */
export interface IReconcilerData {
  stores: IStoresProvider;
  settings: ISettingsProvider;
  managerDashboard: IManagerDashboardProvider;
}

/** Fallback cadence (seconds) when settings cannot be read. */
const DEFAULT_POLL_SECONDS = 60;
const MIN_POLL_SECONDS = 15;

/** Maps each derived alert kind to its catalogue event type (Anexo A). */
const EVENT_BY_KIND: Record<AlertKind, NotificationEventType> = {
  "cliente-a-dormente": "cliente.dormente",
  "vendedor-sobrecarregado": "vendedor.sobrecarregado",
  "conversa-sem-resposta": "conversa.semResposta",
};

/**
 * Boots the reconciler: one immediate pass, then a polling interval driven by
 * `alertPollingSeconds`. Returns a stop function. A no-op when `data` is absent.
 */
export function startReconciler(stores: INotificationStores, data?: IReconcilerData): () => void {
  if (!data) return () => {};

  let stopped = false;
  let timer: number | undefined;

  const tick = (): void => {
    void reconcileOnce(stores, data).catch((err) => {
      if (import.meta.env.DEV) {
        console.error("[notificationReconciler] pass failed", err);
      }
    });
  };

  void (async () => {
    const pollSeconds = await resolvePollSeconds(data);
    if (stopped) return;
    tick(); // immediate boot pass
    timer = window.setInterval(tick, Math.max(MIN_POLL_SECONDS, pollSeconds) * 1000);
  })();

  return () => {
    stopped = true;
    if (timer !== undefined) window.clearInterval(timer);
  };
}

async function resolvePollSeconds(data: IReconcilerData): Promise<number> {
  try {
    const stores = await data.stores.list();
    const first = stores[0];
    if (!first) return DEFAULT_POLL_SECONDS;
    const platform = await data.settings.get(first.id);
    return platform.managerDashboard?.alertPollingSeconds ?? DEFAULT_POLL_SECONDS;
  } catch {
    return DEFAULT_POLL_SECONDS;
  }
}

async function reconcileOnce(notif: INotificationStores, data: IReconcilerData): Promise<void> {
  const stores = await data.stores.list();
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();

  const upsert: INotification[] = [];
  const keepKeys: string[] = [];
  const recipientScope = new Set<ID>();

  for (const store of stores) {
    const platform = await data.settings.get(store.id);
    const settings = platform.managerDashboard;
    if (!settings) continue; // store without dashboard settings → skip
    const snapshot = await data.managerDashboard.snapshot(snapshotParams(store.id, nowMs));

    // Every internal recipient is in scope so cleared conditions get expired,
    // even when they produce no alert this pass.
    for (const seller of snapshot.sellers) recipientScope.add(seller.id);
    recipientScope.add(store.managerId);

    const alerts = collectAlerts(snapshot, settings, nowMs);
    for (const alert of alerts) {
      const event = EVENT_BY_KIND[alert.kind];
      const rule = ROUTING_RULES[event];
      for (const recipientId of resolveRecipients(alert, snapshot, store)) {
        const dedupeKey = `derived:${alert.hash}:${recipientId}`;
        keepKeys.push(dedupeKey);
        upsert.push({
          id: `notif-${dedupeKey}`,
          dedupeKey,
          lifecycle: "derived",
          type: event,
          category: rule.category,
          severity: rule.severity,
          recipientId,
          recipientType: "seller",
          storeId: store.id,
          title: alert.message,
          status: "unread",
          channels: ["inApp"],
          source: "rule",
          createdAt: nowIso,
        });
      }
    }
  }

  await notif.notifications.reconcileDerived({
    recipientScope: [...recipientScope],
    upsert,
    keepKeys,
  });
}

/** Replicates the manager dashboard's alert gating (PRD-014) over a snapshot. */
function collectAlerts(
  snapshot: IManagerDashboardSnapshot,
  settings: IManagerDashboardSettings,
  nowMs: number,
): IActiveAlert[] {
  const loadBySeller = new Map<ID, number>();
  for (const conv of snapshot.openConversations) {
    if (!conv.assignedSellerId) continue;
    loadBySeller.set(conv.assignedSellerId, (loadBySeller.get(conv.assignedSellerId) ?? 0) + 1);
  }

  let alerts: IActiveAlert[] = [];
  if (settings.alertClienteADormenteEnabled) {
    alerts = alerts.concat(buildClienteADormenteAlerts(snapshot.customers, nowMs));
  }
  if (settings.alertVendedorSobrecarregadoEnabled) {
    alerts = alerts.concat(
      buildVendedorSobrecarregadoAlerts(
        snapshot.sellers,
        loadBySeller,
        settings.sellerOverloadThreshold,
      ),
    );
  }
  if (settings.alertConversaSemRespostaEnabled) {
    alerts = alerts.concat(
      buildConversaSemRespostaAlerts(
        snapshot.openConversations,
        settings.conversationWaitingHoursThreshold,
        nowMs,
      ),
    );
  }
  return alerts;
}

/**
 * Resolves the internal recipients for a derived alert (Anexo A):
 *  - cliente.dormente        → the customer's owner seller + the store gestor
 *  - vendedor.sobrecarregado → the store gestor (owner targeting deferred)
 *  - conversa.semResposta    → the store gestor
 */
function resolveRecipients(
  alert: IActiveAlert,
  snapshot: IManagerDashboardSnapshot,
  store: IStore,
): ID[] {
  const recipients = new Set<ID>();
  if (alert.kind === "cliente-a-dormente") {
    const customerId = alert.id.replace(/^cliente-a-dormente-/, "");
    const customer = snapshot.customers.find((c) => c.id === customerId);
    if (customer) recipients.add(customer.ownerId);
  }
  recipients.add(store.managerId);
  return [...recipients];
}

function snapshotParams(storeId: ID, nowMs: number): IManagerDashboardSnapshotParams {
  const day = 86_400_000;
  return {
    storeId,
    fromIso: new Date(nowMs - 30 * day).toISOString(),
    toIso: new Date(nowMs).toISOString(),
    prevFromIso: new Date(nowMs - 60 * day).toISOString(),
    prevToIso: new Date(nowMs - 30 * day).toISOString(),
  };
}
