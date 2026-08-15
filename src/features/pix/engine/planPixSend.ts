import type { IPixKey } from "@/shared/types";
import { buildPixCaption } from "./pixMessage";

/** One message the composer must dispatch, in the order the array gives them. */
export interface IPlannedPixMessage {
  kind: "caption" | "key";
  text: string;
  /** True only on the key message — its body must reach the customer byte-exact. */
  unsigned?: boolean;
  /** True when this message should carry the QR image. */
  withQr?: boolean;
}

export interface IPlanPixSendOptions {
  sendText: boolean;
  sendQr: boolean;
  /** Attendant-authored text; falls back to the generated block when empty. */
  context: string;
  /**
   * Whether a QR image is actually available to attach. The CALLER decides this
   * — it owns the payload build, the canvas render and the upload, and only it
   * knows what failed at runtime. Keeping the discovery on the I/O side is
   * deliberate: see the note at the bottom of this file.
   */
  qrAvailable: boolean;
}

/**
 * Decides WHAT to send and IN WHICH ORDER. Pure: no network, no canvas, no toast.
 *
 * The ordering is the riskiest property of this feature. WhatsApp's long-press
 * copies the whole message body, so the key must be the last message and the
 * only thing in it — no prefix, no emoji, no full stop. If that ever changes,
 * the customer's copy silently stops working and nobody notices until someone
 * tries to pay. Hence this lives in a tested engine rather than inside a hook.
 *
 * ⚠️ QR degradation stays on the I/O side. This function takes `qrAvailable` as
 * an INPUT; it never discovers a failure itself. If the render/upload try-catch
 * were pulled in here, the two properties `useSendPix` guarantees — the
 * complement never takes the product down, and a retry never resends a key that
 * already went out — would be lost exactly where the tests would look like they
 * cover them. That is the worst way to lose them: with the suite green.
 */
export function planPixSend(
  key: Pick<IPixKey, "keyValue" | "keyType" | "receiverName">,
  opts: IPlanPixSendOptions,
): IPlannedPixMessage[] {
  if (!opts.sendText && !opts.sendQr) return [];

  // QR-only with no QR to send: a lone caption would announce a payment and
  // deliver no way to make it, so nothing goes out and the bar stays open.
  if (!opts.sendText && !opts.qrAvailable) return [];

  const withQr = opts.sendQr && opts.qrAvailable;
  const caption = buildPixCaption({
    receiverName: key.receiverName,
    keyType: key.keyType,
    context: opts.context,
    // Only promise "a chave vai na próxima mensagem" when one really follows.
    includeKeyHint: opts.sendText,
  });

  const messages: IPlannedPixMessage[] = [];
  if (withQr || caption) {
    messages.push({ kind: "caption", text: caption, ...(withQr ? { withQr: true } : {}) });
  }
  if (opts.sendText) {
    // Bare and last. `unsigned` keeps applyAttendantSignature away from it —
    // a `*Nome:* ` prefix would ride along on the customer's copy.
    messages.push({ kind: "key", text: key.keyValue, unsigned: true });
  }
  return messages;
}
