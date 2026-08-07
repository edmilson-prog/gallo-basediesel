import { useCallback, useState } from "react";
import { toast } from "sonner";
import type { IConversation, IPixKey, IWhatsAppAccount } from "@/shared/types";
import { recordAuditLog } from "@/providers/data";
import { useAuth } from "@/features/auth/useAuth";
import { useMessageSend } from "@/features/conversations/hooks/useMessageSend";
import { useAttachmentUpload } from "@/features/conversations/hooks/useAttachmentUpload";
import { buildPixPayload } from "../engine/pixBrCode";
import { canvasToPixFile, drawPixQr } from "../engine/drawPixQr";
import { planPixSend } from "../engine/planPixSend";
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
  const { currentUser } = useAuth();
  const [isSending, setIsSending] = useState(false);

  const sendPix = useCallback(
    async (key: IPixKey, opts: IPixSendOptions): Promise<boolean> => {
      if (!opts.sendText && !opts.sendQr) return false;
      setIsSending(true);
      // Counts messages that actually reached the thread — drives both the
      // return value and the "did a retry become unsafe" decision below.
      let delivered = 0;
      try {
        // ── Render the QR first, so the plan knows whether one exists ────────
        // This block owns its own try/catch on purpose. The QR is the
        // complement; the key is the product. A render or upload failure
        // degrades to text and never takes the send down. The decision of WHAT
        // to send lives in planPixSend; discovering what FAILED lives here,
        // because only this side runs the canvas and the upload.
        let qrMedia: Awaited<ReturnType<typeof prepareAttachment>> = null;
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

            // The caption travels as the image's caption, so the plan is built
            // first to know what that text is.
            const planned = planPixSend(key, { ...opts, qrAvailable: true });
            const captionText = planned.find((m) => m.kind === "caption")?.text ?? "";

            // null = rejected by the size cap; prepareAttachment already toasted.
            const media = await prepareAttachment(file, "image", captionText);
            if (!media) throw new Error("attachment-rejected");
            qrMedia = media;
          } catch {
            qrFailed = true;
            toast.error(
              opts.sendText ? PIX_STRINGS.errors.qrRenderFailed : PIX_STRINGS.errors.qrFailedAlone,
            );
          }
        }

        // ── Dispatch exactly what the plan says, in the order it gives ───────
        const plan = planPixSend(key, { ...opts, qrAvailable: qrMedia !== null });
        for (const message of plan) {
          if (message.withQr && qrMedia) {
            await send(qrMedia);
          } else {
            await send({
              text: message.text,
              ...(message.unsigned ? { unsigned: true } : {}),
            });
          }
          delivered += 1;
        }

        if (delivered === 0) return false;

        // Who sent which key, in which conversation. This is a fraud surface —
        // the trail is what makes it investigable after the fact.
        if (currentUser) {
          void recordAuditLog({
            actorId: currentUser.id,
            storeId: conversation.storeId,
            action: "send",
            resource: "pix_key",
            resourceId: key.id,
            after: {
              conversationId: conversation.id,
              alias: key.alias,
              keyType: key.keyType,
              sentText: opts.sendText,
              sentQr: qrMedia !== null,
            },
          });
        }

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
    [prepareAttachment, send, currentUser, conversation.id, conversation.storeId],
  );

  return { sendPix, isSending };
}
