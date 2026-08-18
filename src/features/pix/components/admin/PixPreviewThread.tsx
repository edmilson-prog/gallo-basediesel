import { useEffect, useMemo, useRef } from "react";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { WhatsAppText } from "@/features/conversations/components/bubbles/WhatsAppText";
import type { PixKeyType } from "@/shared/types";
import { buildPixPayload } from "../../engine/pixBrCode";
import { buildPixCaption } from "../../engine/pixMessage";
import { drawPixQr } from "../../engine/drawPixQr";
import { PIX_STRINGS } from "../../i18n/pt-BR";

export interface IPixPreviewThreadProps {
  alias: string;
  keyType: PixKeyType;
  /**
   * CANONICAL key — this is what the second bubble renders, because it is what
   * actually leaves the app. See the note on the component below.
   */
  keyValue: string;
  receiverName: string;
  receiverCity: string;
  context: string;
  sendText: boolean;
  sendQr: boolean;
}

/**
 * Shows EXACTLY the two messages, in the real order, inside the SAME
 * `aspect-[4/3] w-[260px]` box `ImageBubble.tsx:57` uses. If a QR would crop in
 * the conversation, it crops here — the error shows up in the editor, not in
 * production.
 *
 * The canvas is drawn with the EXPORT geometry (`drawPixQr` with no `cssSize`),
 * not the square preview mode. This is deliberate and differs from the task
 * brief: `cssSize` makes `drawPixQr` write inline `style.width/height`, which
 * beats `h-full w-full` and would drop a 224px SQUARE canvas into a 260×195
 * box — showing a crop at the bottom and a gap at the right that the customer
 * never sees. The real send is the 800×600 PNG from `PIX_QR_EXPORT`, whose 4:3
 * ratio exists precisely "so ImageBubble's object-cover crops nothing"
 * (qrGeometry.ts). Drawing that same geometry here makes the preview pixel-
 * faithful to the image that leaves the app, supersampled ~3× into the bubble.
 *
 * The second bubble renders the CANONICAL key, not the formatted one — also a
 * departure from the brief, which passed a `displayKey`. `pixKeyFormat.ts` is
 * explicit that the canonical form "is what goes to the clipboard, to the
 * WhatsApp message and to the BR Code payload; the display form exists only to
 * be read on screen". A preview headed "Como o cliente recebe" that showed
 * `11.222.333/0001-81` while the customer received `11222333000181` would be
 * lying about the one field where a mismatch costs money.
 */
export function PixPreviewThread({
  alias,
  keyType,
  keyValue,
  receiverName,
  receiverCity,
  context,
  sendText,
  sendQr,
}: IPixPreviewThreadProps) {
  const s = PIX_STRINGS.editor;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const payload = useMemo(
    () => buildPixPayload({ keyValue, receiverName, receiverCity }),
    [keyValue, receiverName, receiverCity],
  );
  const caption = buildPixCaption({
    receiverName,
    keyType,
    context,
    includeKeyHint: sendText,
  });

  // Hoisted out of the dependency array: a conditional expression inline in the
  // deps is opaque to the exhaustive-deps rule and to the next reader.
  const payloadValue = payload.ok ? payload.value : "";

  useEffect(() => {
    if (!sendQr || !payloadValue || !canvasRef.current) return;
    drawPixQr(canvasRef.current, payloadValue);
  }, [sendQr, payloadValue]);

  // Both switches off means no message at all. `caption` alone cannot decide
  // this — buildPixCaption always returns a non-empty head, so testing it would
  // keep the first bubble on screen for a send that would never happen.
  const willSendAnything = sendText || sendQr;

  return (
    <div className="space-y-1">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {s.previewTitle}
      </p>

      <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-4">
        {!willSendAnything && (
          <p role="status" className="py-6 text-center text-xs text-muted-foreground">
            {s.previewEmpty}
          </p>
        )}

        {willSendAnything && (
          <div className="flex w-full justify-end">
            <div
              className={cn(
                "max-w-[78%] overflow-hidden rounded-2xl text-sm shadow-sm",
                "border border-primary/20 bg-primary/10 text-foreground",
              )}
              role="group"
              aria-label={s.previewBubbleOne}
            >
              {sendQr && (
                <div className="relative aspect-[4/3] w-[260px] max-w-full bg-muted">
                  {payload.ok ? (
                    <canvas
                      ref={canvasRef}
                      className="h-full w-full object-cover"
                      role="img"
                      aria-label={s.qrAlt(alias || "PIX")}
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center px-4 text-center text-[11px] text-muted-foreground">
                      {s.qrUnavailable}
                    </div>
                  )}
                </div>
              )}
              {caption && (
                <WhatsAppText
                  text={caption}
                  className="whitespace-pre-wrap break-words px-3 py-2 text-sm"
                />
              )}
              <div
                className="flex items-center justify-end gap-1 px-3 pb-2 text-[11px] text-muted-foreground"
                aria-hidden="true"
              >
                <span>12:00</span>
                <Icon icon="mdi:check-all" size={13} className="text-primary" />
              </div>
            </div>
          </div>
        )}

        {sendText && (
          <div className="flex w-full justify-end">
            <div
              className="max-w-[78%] rounded-2xl border border-primary/20 bg-primary/10 px-3 py-2 text-sm shadow-sm"
              role="group"
              aria-label={s.previewBubbleTwo}
            >
              {/* break-all: a 36-char random key overflows max-w-[78%], and the
                  preview must show the same wrap the customer will see. Never
                  truncate — a half-visible key looks checkable and isn't. */}
              <p className="break-all font-mono text-sm tabular-nums text-foreground">
                {keyValue || " "}
              </p>
              <div
                className="mt-1 flex items-center justify-end gap-1 text-[11px] text-muted-foreground"
                aria-hidden="true"
              >
                <span>12:00</span>
                <Icon icon="mdi:check-all" size={13} className="text-primary" />
              </div>
            </div>
          </div>
        )}
      </div>

      <p className="text-right text-[10px] text-muted-foreground">{s.previewNote}</p>
    </div>
  );
}
