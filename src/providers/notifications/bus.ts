import type { NotificationEventType } from "./events";

export interface INotificationEvent<T = unknown> {
  type: NotificationEventType;
  payload: T;
  /** ISO string supplied by the emitter (router uses it for dedupe window). */
  occurredAt: string;
}
type Handler = (e: INotificationEvent) => void;

const handlers = new Set<Handler>();

export const notificationBus = {
  subscribe(h: Handler): () => void {
    handlers.add(h);
    return () => handlers.delete(h);
  },
  emit(type: NotificationEventType, payload: unknown, occurredAt: string): void {
    const event: INotificationEvent = { type, payload, occurredAt };
    for (const h of handlers) {
      try {
        h(event);
      } catch (err) {
        if (import.meta.env.DEV) console.warn("[notificationBus] handler failed (non-fatal)", err);
      }
    }
  },
};
