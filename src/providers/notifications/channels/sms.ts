import { NotImplementedError } from "../errors";
import type { INotificationChannel } from "./contract";

/**
 * Deferred channel (skeleton). Real implementation: PRD-144 (Onda 8 — SMS).
 */
export const smsChannel: INotificationChannel = {
  channel: "sms",
  async send() {
    throw new NotImplementedError("SmsChannel.send — implementar no PRD-144 (Onda 8 / SMS).");
  },
};
