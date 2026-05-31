import { NotImplementedError } from "../errors";
import type { INotificationChannel } from "./contract";

/**
 * Deferred channel (skeleton). The router records it as `deferred` and never
 * dispatches to it in Fase 1; a direct call fails loudly so misuse is caught.
 * Real implementation: PRD-141 (Onda 8 — e-mail transacional).
 */
export const emailChannel: INotificationChannel = {
  channel: "email",
  async send() {
    throw new NotImplementedError(
      "EmailChannel.send — implementar no PRD-141 (Onda 8 / e-mail transacional).",
    );
  },
};
