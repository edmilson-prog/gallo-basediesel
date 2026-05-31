import type { INotification } from "@/shared/types";
import type { INotificationStores } from "../contracts";
import type { IChannelResult, INotificationChannel } from "./contract";

/**
 * Active channel — persists the notification so it surfaces in the bell and the
 * Notification Center (PRD-009). The store assigns the canonical id/createdAt and
 * defaults status to "unread", so the notification's transient id (set by the
 * router) is intentionally discarded here.
 */
export function makeInAppChannel(stores: INotificationStores): INotificationChannel {
  return {
    channel: "inApp",
    async send(notification: INotification): Promise<IChannelResult> {
      await stores.notifications.create(notification);
      return { status: "sent" };
    },
  };
}
