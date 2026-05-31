/**
 * Notification domain model (PRD-008). Single source of truth — PRD-009 (UI)
 * and the Onda 8 real channels consume these types, never redefine them.
 *
 * Conventions (match the rest of the domain): IDs are strings, timestamps are
 * ISO 8601 strings (never `Date`), optional fields use `?` (never `| null`),
 * and enums are string-literal unions (never TS `enum`).
 *
 * @see ../../../docs/glossario.md
 */
import type { ID, ISO8601 } from "./common";
import type { NotificationEventType } from "@/providers/notifications/events";

export type NotificationLifecycle = "event" | "derived";

export type NotificationCategory =
  | "transactional"
  | "commercial"
  | "operational"
  | "gamification"
  | "system"
  | "marketing";

export type NotificationSeverity = "info" | "success" | "warning" | "critical";

export type NotificationStatus = "unread" | "read" | "archived";

export type NotificationChannel = "inApp" | "toast" | "email" | "whatsapp" | "sms" | "push";

export type NotificationRecipientType = "seller" | "customer";

export type ChannelDeliveryStatus =
  | "pending"
  | "sent"
  | "delivered"
  | "failed"
  | "skipped"
  | "deferred";

/** Inline action a notification can offer (rendered as a button by PRD-009). */
export interface INotificationAction {
  /** Stable id, unique within the notification. */
  id: string;
  /** Button label (pt-BR). */
  label: string;
  /** Navigate to a route, or run a named mutation handled by the UI. */
  type: "navigate" | "mutation";
  /** For `navigate`: TanStack route path. For `mutation`: handler name. */
  target: string;
  /** Optional search params for `navigate`. */
  params?: Record<string, string>;
}

/** Reference to the domain entity that originated the notification. */
export interface INotificationEntityRef {
  type: string;
  id: ID;
}

/** Per-channel delivery outcome (optional; filled by the router). */
export interface IChannelDelivery {
  channel: NotificationChannel;
  status: ChannelDeliveryStatus;
  detail?: string;
}

export interface INotification {
  id: ID;
  /** Deterministic key collapsing the same fact emitted twice in a window. */
  dedupeKey: string;
  lifecycle: NotificationLifecycle;
  type: NotificationEventType;
  category: NotificationCategory;
  severity: NotificationSeverity;
  recipientId: ID;
  recipientType: NotificationRecipientType;
  storeId?: ID;
  /** Snapshot text, copied at creation (survives changes to the source record). */
  title: string;
  body?: string;
  entityRef?: INotificationEntityRef;
  actions?: INotificationAction[];
  status: NotificationStatus;
  /** Resolved target channels for this recipient. */
  channels: NotificationChannel[];
  deliveryStatus?: IChannelDelivery[];
  /** Collapses notifications of the same nature in the UI. */
  groupKey?: string;
  source: "system" | "rule" | "user";
  createdAt: ISO8601;
  readAt?: ISO8601;
  expiresAt?: ISO8601;
  metadata?: Record<string, unknown>;
}

/** Per-recipient channel×category preference matrix. */
export interface INotificationPreference {
  recipientId: ID;
  recipientType: NotificationRecipientType;
  /** channel enabled? indexed by category then channel. */
  matrix: Record<NotificationCategory, Partial<Record<NotificationChannel, boolean>>>;
  /** Modelled but dormant in the MVP (quiet hours). */
  quietHours?: { start: string; end: string };
  updatedAt: ISO8601;
}
