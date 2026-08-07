import { useCallback, useState } from "react";
import { toast } from "sonner";
import type { IConversation, IPixKey, IWhatsAppAccount } from "@/shared/types";
import { useMessageSend } from "@/features/conversations/hooks/useMessageSend";
import { useAttachmentUpload } from "@/features/conversations/hooks/useAttachmentUpload";
import { buildPixPayload } from "../engine/pixBrCode";
import { buildPixCaption } from "../engine/pixMessage";
import { canvasToPixFile, drawPixQr } from "../engine/drawPixQr";
import { PIX_STRINGS } from "../i18n/pt-BR";

export interface IPixSendOptions {
  sendText: boolean;
  sendQr: boolean;
  context: string;
}

export interface IUseSendPixResult {
  /**
   * Resolves `true` when at least one message reached the thread, `false` when
   * nothing did. The staged bar keys off this: `false` keeps it open with the
   * context preserved so the attendant retries without retyping (spec §10).
   * `true` closes it even on a partial failure, because a retry would duplicate
   * whatever already went out — that retry belongs to the failed bubble.
   */
  sendPix: (key: IPixKey, opts: IPixSendOptions) => Promise<boolean>;
  isSending: boolean;
}

/**
 * Dispatches a PIX as up to two messages, in this order:
 *
 *   1. the QR image carrying the caption (or the caption alone in text mode);
 *   2. the key, ALONE and LAST, raw.
 *
 * Message 2 is the whole point. WhatsApp's long-press copies the entire message
 * body, so the key must be the only thing in it — no prefix, no emoji, no full
 * stop. Anything concatenated there produces a string that fails to paste into a
 * bank app, which is the exact failure this design exists to prevent.
 */
export function useSendPix(
  conversation: IConversation,
  whatsappAccount: IWhatsAppAccount | null,
): IUseSendPixResult {
  const { send } = useMessageSend(conversation, whatsappAccount);
  const { prepareAttachment } = useAttachmentUpload(conversation);
  const [isSending, setIsSending] = useState(false);

  const sendPix = useCallback(
    async (key: IPixKey, opts: IPixSendOptions): Promise<boolean> => {
      if (!opts.sendText && !opts.sendQr) return false;
      setIsSending(true);
      // Counts messages that actually reached the thread — drives both the
      // return value and the "did a retry become unsafe" decision below.
      let delivered = 0;
      try {
        const caption = buildPixCaption({
          receiverName: key.receiverName,
          keyType: key.keyType,
          context: opts.context,
          // The caption only promises "a chave vai na próxima mensagem" when a
          // key message really follows.
          includeKeyHint: opts.sendText,
        });

        // ── Message 1: the QR image, with the caption ────────────────────────
        // Its own try/catch on purpose. The QR is the complement; the key is the
        // product. A render or upload failure degrades to text, it never takes
        // the send down. (The brief let prepareAttachment's throw escape to the
        // outer catch, which silently dropped the key — see the task report.)
        let qrSent = false;
        let qrFailed = false;
        if (opts.sendQr) {
          try {
            const payload = buildPixPayload({
              keyValue: key.keyValue,
              receiverName: key.receiverName,
              receiverCity: key.receiverCity,
            });
            if (!payload.ok) throw new Error(payload.reason);

            const canvas = document.createElement("canvas");
            if (!drawPixQr(canvas, payload.value)) throw new Error("canvas-unavailable");

            const file = await canvasToPixFile(canvas, key.alias);
            if (!file) throw new Error("blob-null");

            // null = rejected by the size cap; prepareAttachment already toasted.
            const media = await prepareAttachment(file, "image", caption);
            if (!media) throw new Error("attachment-rejected");

            await send(media);
            qrSent = true;
            delivered += 1;
          } catch {
            qrFailed = true;
            toast.error(
              opts.sendText ? PIX_STRINGS.errors.qrRenderFailed : PIX_STRINGS.errors.qrFailedAlone,
            );
          }
        }

        // Caption as a plain message when the image did not go out — but only
        // when the key still follows it. A lone caption in QR-only mode would
        // announce a payment and deliver no way to make it, so in that case
        // nothing is sent and the bar stays open for a retry.
        if (!qrSent && opts.sendText && caption) {
          await send({ text: caption });
          delivered += 1;
        }

        // ── Message 2: the key, alone and last ───────────────────────────────
        // `unsigned` keeps applyAttendantSignature away from this body. Without
        // it, a seller with a display name would ship `*Nome:* 11222333000181`
        // and the customer's long-press would copy an unusable string.
        if (opts.sendText) {
          await send({ text: key.keyValue, unsigned: true });
          delivered += 1;
        }

        if (delivered === 0) return false;
        // The degraded-QR toast already says the key went as text; a success
        // toast on top would just contradict it.
        if (!qrFailed) toast.success(PIX_STRINGS.composer.sent);
        return true;
      } catch {
        toast.error(PIX_STRINGS.errors.sendFailed);
        // Something is already in the thread: closing the bar is the safe move,
        // since re-sending would duplicate it. Retry is the failed bubble's job
        // (spec §10 — no automatic retry; a PIX key arriving twice unprompted
        // confuses the customer).
        return delivered > 0;
      } finally {
        setIsSending(false);
      }
    },
    [prepareAttachment, send],
  );

  return { sendPix, isSending };
}
