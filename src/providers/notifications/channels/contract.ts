import type { ChannelDeliveryStatus, INotification, NotificationChannel } from "@/shared/types";

export interface IChannelResult {
  status: ChannelDeliveryStatus;
  detail?: string;
}

/**
 * A delivery channel. Active channels (inApp/toast) actually dispatch in Fase 1;
 * deferred channels (email/whatsapp/sms/push) are skeletons whose direct `send`
 * throws — the router records them as `deferred` and never calls them until the
 * Onda 8 providers (PRD-141+) go live.
 */
export interface INotificationChannel {
  readonly channel: NotificationChannel;
  send(notification: INotification): Promise<IChannelResult>;
}
