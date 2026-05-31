import { NotImplementedError } from "../errors";
import type { INotificationChannel } from "./contract";

/**
 * Deferred channel (skeleton). Real implementation: PRD-143 (Onda 8 — WhatsApp HSM).
 */
export const whatsappChannel: INotificationChannel = {
  channel: "whatsapp",
  async send() {
    throw new NotImplementedError(
      "WhatsAppChannel.send — implementar no PRD-143 (Onda 8 / WhatsApp HSM).",
    );
  },
};
