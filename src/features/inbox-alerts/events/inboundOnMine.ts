import type { MessageMediaType } from "@/shared/types";

/**
 * An inbound message landed on a conversation assigned to the signed-in seller
 * WHILE that conversation was not on screen. Raw message fields — formatting is
 * the consumer's job (see `engine/inboundPreview`).
 */
export interface IInboundOnMineEvent {
  conversationId: string;
  /** Absent on the `last_message_at` fallback path, which has no message row. */
  text?: string | null;
  mediaType?: MessageMediaType | null;
}

type InboundOnMineListener = (event: IInboundOnMineEvent) => void;

const listeners = new Set<InboundOnMineListener>();

/**
 * Publish the event. Deliberately UI-free so the Realtime monitor never has to
 * import sonner or the router.
 *
 * Iterates over a copy so a listener that unsubscribes during dispatch cannot
 * disturb the walk, and isolates listener failures: one broken consumer must
 * not swallow the alert for the others.
 */
export function emitInboundOnMine(event: IInboundOnMineEvent): void {
  for (const listener of [...listeners]) {
    try {
      listener(event);
    } catch {
      /* a failing consumer must not break the others */
    }
  }
}

/** Subscribe; returns the unsubscribe function. */
export function subscribeInboundOnMine(listener: InboundOnMineListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
