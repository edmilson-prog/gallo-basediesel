import type { NotificationChannel } from "@/shared/types";
import type { INotificationStores } from "../contracts";
import type { INotificationChannel } from "./contract";
import { makeInAppChannel } from "./inApp";
import { makeToastChannel } from "./toast";
import { emailChannel } from "./email";
import { whatsappChannel } from "./whatsapp";
import { smsChannel } from "./sms";
import { pushChannel } from "./push";

/** Channels that actually dispatch in Fase 1. Everything else resolves `deferred`. */
export const ACTIVE_CHANNELS: readonly NotificationChannel[] = ["inApp", "toast"];

/** True when the channel dispatches in the current phase. */
export function isActive(channel: NotificationChannel): boolean {
  return ACTIVE_CHANNELS.includes(channel);
}

/**
 * Builds the channel registry bound to the given stores. The inApp channel needs
 * the stores to persist; the rest are stateless. The router dispatches only to
 * ACTIVE_CHANNELS — deferred channels are present for completeness but never
 * receive a `send` call in Fase 1.
 */
export function makeChannelRegistry(
  stores: INotificationStores,
): Record<NotificationChannel, INotificationChannel> {
  return {
    inApp: makeInAppChannel(stores),
    toast: makeToastChannel(),
    email: emailChannel,
    whatsapp: whatsappChannel,
    sms: smsChannel,
    push: pushChannel,
  };
}
