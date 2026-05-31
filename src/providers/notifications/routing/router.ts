/**
 * Event router (PRD-008). Subscribes to the notificationBus and, for each domain
 * event, fans out one notification per recipient: it looks up the routing rule,
 * resolves recipients, crosses the rule's target channels with each recipient's
 * preferences (honouring non-silenceable locks), computes a dedupe key, builds
 * the notification, and dispatches it to the active channels (inApp/toast).
 *
 * Channels disabled by preference are recorded `skipped`; channels enabled but
 * not yet active (external) are recorded `deferred` until the Onda 8 providers
 * (PRD-141+) go live. When no channel survives, the notification is dropped.
 */
import type { IChannelDelivery, INotification, NotificationChannel } from "@/shared/types";
import { notificationBus, type INotificationEvent } from "../bus";
import type { NotificationEventType } from "../events";
import type { INotificationStores } from "../contracts";
import type { INotificationChannel } from "../channels/contract";
import { isActive, makeChannelRegistry } from "../channels/registry";
import { isChannelLocked } from "../preferences/defaults";
import { dedupeKey } from "./dedupe";
import {
  ROUTING_RULES,
  type IRecipientRef,
  type IRoutingContext,
  type IRoutingPayload,
  type IRoutingRule,
} from "./rules";

type ChannelRegistry = Record<NotificationChannel, INotificationChannel>;

/** Event types whose notifications collapse into a per-recipient daily group (PRD-009 UI). */
const GROUPABLE_EVENTS: ReadonlySet<NotificationEventType> = new Set<NotificationEventType>([
  "conversa.atribuida",
  "lead.novo",
  "carteira.transferenciaRecebida",
]);

/** Structural group key for collapsible events; undefined leaves the notification ungrouped. */
function groupKeyFor(
  type: NotificationEventType,
  recipientId: string,
  occurredAtIso: string,
): string | undefined {
  if (!GROUPABLE_EVENTS.has(type)) return undefined;
  const dayBucket = occurredAtIso.slice(0, 10); // YYYY-MM-DD
  return `group:${type}:${recipientId}:${dayBucket}`;
}

/**
 * Subscribes the router to the bus and returns an unsubscribe function. The
 * optional `ctx` lets rules expand role-based recipients (gestor/owner); in
 * Fase 1 it is empty and rules fall back to payload-provided ids.
 */
export function startRouter(stores: INotificationStores, ctx: IRoutingContext = {}): () => void {
  const registry = makeChannelRegistry(stores);

  return notificationBus.subscribe((event) => {
    // The bus is synchronous and must never block the emitter, so routing runs
    // fire-and-forget; any failure is contained and logged in DEV.
    void routeEvent(event, stores, ctx, registry).catch((err) => {
      if (import.meta.env.DEV) {
        console.error("[notificationRouter] failed to route", event.type, err);
      }
    });
  });
}

async function routeEvent(
  event: INotificationEvent,
  stores: INotificationStores,
  ctx: IRoutingContext,
  registry: ChannelRegistry,
): Promise<void> {
  const rule = ROUTING_RULES[event.type];
  if (!rule) {
    if (import.meta.env.DEV) {
      console.warn("[notificationRouter] unknown event ignored", event.type);
    }
    return;
  }

  const payload = (event.payload ?? {}) as IRoutingPayload;
  const recipients = rule.resolveRecipients(payload, ctx);
  if (recipients.length === 0) {
    if (import.meta.env.DEV) {
      console.warn("[notificationRouter] event resolved no recipients", event.type);
    }
    return;
  }

  for (const recipient of recipients) {
    await routeToRecipient(event, payload, rule, recipient, stores, registry);
  }
}

async function routeToRecipient(
  event: INotificationEvent,
  payload: IRoutingPayload,
  rule: IRoutingRule,
  recipient: IRecipientRef,
  stores: INotificationStores,
  registry: ChannelRegistry,
): Promise<void> {
  const pref = await stores.preferences.get(recipient.recipientId, recipient.recipientType);
  const categoryPrefs = pref.matrix[rule.category];

  const deliveryStatus: IChannelDelivery[] = [];
  const dispatchChannels: NotificationChannel[] = [];

  for (const channel of rule.channels) {
    const enabled = isChannelLocked(rule.category, channel) || categoryPrefs[channel] === true;
    if (!enabled) {
      deliveryStatus.push({ channel, status: "skipped", detail: "desabilitado por preferência" });
    } else if (!isActive(channel)) {
      deliveryStatus.push({ channel, status: "deferred", detail: "canal disponível na Onda 8" });
    } else {
      deliveryStatus.push({ channel, status: "sent" });
      dispatchChannels.push(channel);
    }
  }

  const resolvedChannels = deliveryStatus
    .filter((d) => d.status !== "skipped")
    .map((d) => d.channel);

  // Recipient opted out of an optional category and nothing is locked/deferred:
  // there is nothing to deliver or show, so drop the notification entirely.
  if (resolvedChannels.length === 0) {
    logSummary(event, rule, recipient, deliveryStatus);
    return;
  }

  const notification: INotification = {
    id: crypto.randomUUID(),
    dedupeKey: dedupeKey(event.type, payload.entityId, event.occurredAt, recipient.recipientId),
    lifecycle: "event",
    type: event.type,
    category: rule.category,
    severity: rule.severity,
    recipientId: recipient.recipientId,
    recipientType: recipient.recipientType,
    storeId: recipient.storeId,
    title: payload.title ?? event.type,
    body: payload.body,
    entityRef: payload.entityId
      ? { type: payload.entityType ?? "unknown", id: payload.entityId }
      : undefined,
    status: "unread",
    channels: resolvedChannels,
    deliveryStatus,
    groupKey: groupKeyFor(event.type, recipient.recipientId, event.occurredAt),
    source: "rule",
    createdAt: event.occurredAt,
  };

  // Dispatch to active channels (inApp persists, toast shows). A single channel
  // failure is contained so it never blocks the others.
  for (const channel of dispatchChannels) {
    try {
      await registry[channel].send(notification);
    } catch (err) {
      const entry = deliveryStatus.find((d) => d.channel === channel);
      if (entry) {
        entry.status = "failed";
        entry.detail = err instanceof Error ? err.message : String(err);
      }
      if (import.meta.env.DEV) {
        console.error("[notificationRouter] channel failed", channel, err);
      }
    }
  }

  logSummary(event, rule, recipient, deliveryStatus);
}

function logSummary(
  event: INotificationEvent,
  rule: IRoutingRule,
  recipient: IRecipientRef,
  deliveryStatus: IChannelDelivery[],
): void {
  if (!import.meta.env.DEV) return;
  const by = (status: IChannelDelivery["status"]) =>
    deliveryStatus.filter((d) => d.status === status).map((d) => d.channel);
  console.info("[notificationRouter]", {
    event: event.type,
    recipient: recipient.recipientId,
    recipientType: recipient.recipientType,
    category: rule.category,
    severity: rule.severity,
    sent: by("sent"),
    deferred: by("deferred"),
    skipped: by("skipped"),
    failed: by("failed"),
    dataSource: import.meta.env.VITE_DATA_SOURCE,
  });
}
