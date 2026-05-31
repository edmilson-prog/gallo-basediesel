import { NotImplementedError } from "../errors";
import type { INotificationChannel } from "./contract";

/**
 * Deferred channel (skeleton). Real implementation: PRD-145 (Onda 8 — Push Web).
 */
export const pushChannel: INotificationChannel = {
  channel: "push",
  async send() {
    throw new NotImplementedError("PushChannel.send — implementar no PRD-145 (Onda 8 / Push Web).");
  },
};
