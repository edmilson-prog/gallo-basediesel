import { useMemo, useState } from "react";
import type { IPixKey } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { buildPixPayload } from "../engine/pixBrCode";
import type { IPixSendOptions } from "../hooks/useSendPix";
import { PIX_STRINGS, PIX_TYPE_ICON, PIX_TYPE_LABEL } from "../i18n/pt-BR";

export interface IComposerStagedPixProps {
  pixKey: IPixKey;
  /** How many keys the attendant may choose from — the swap control only exists above 1. */
  keyCount: number;
  isSending: boolean;
  onSend: (opts: IPixSendOptions) => void;
  onCancel: () => void;
  onSwapKey: () => void;
}

/**
 * The confirmation step before money moves. Twin of `ComposerStagedAsset` —
 * same frame, same icon slot, same `h-8` buttons, because the two bars can show
 * up on the same day and any height difference reads as a bug.
 *
 * NEVER a one-click send: a PIX sent to the wrong account is the worst failure
 * this feature has, so the key is always on screen before it goes out.
 *
 * Unlike `ComposerStagedAsset` (fully controlled by the composer), this bar owns
 * its context text and its two toggles. That is deliberate: spec §10 requires the
 * bar to survive a failed send "with the context preserved, to try again without
 * retyping", and internal state gives that for free as long as the parent keeps
 * the bar mounted. It also keeps the send-safety rules in one file instead of
 * splitting them across the composer.
 */
export function ComposerStagedPix({
  pixKey,
  keyCount,
  isSending,
  onSend,
  onCancel,
  onSwapKey,
}: IComposerStagedPixProps) {
  const s = PIX_STRINGS.composer;

  const [context, setContext] = useState(pixKey.defaultContext ?? "");
  const [sendText, setSendText] = useState(pixKey.defaultSendText);
  const [sendQr, setSendQr] = useState(pixKey.defaultSendQr);
  // Tracks which key the state above was seeded from, so swapping keys re-seeds
  // the toggles (each key carries its own defaults). Adjusting state during
  // render is React's documented alternative to a prop-sync effect.
  const [seeded, setSeeded] = useState({ id: pixKey.id, context: pixKey.defaultContext ?? "" });
  if (seeded.id !== pixKey.id) {
    const nextContext = pixKey.defaultContext ?? "";
    setSeeded({ id: pixKey.id, context: nextContext });
    setSendText(pixKey.defaultSendText);
    setSendQr(pixKey.defaultSendQr);
    // Text the attendant actually typed survives a swap; a still-pristine field
    // follows the new key's default instead of carrying the old one over.
    if (context === seeded.context) setContext(nextContext);
  }

  // A half-typed or over-long receiver means there is no valid BR Code. Gate the
  // chip rather than render half a QR — an unscannable code is worse than none.
  const payloadOk = useMemo(
    () =>
      buildPixPayload({
        keyValue: pixKey.keyValue,
        receiverName: pixKey.receiverName,
        receiverCity: pixKey.receiverCity,
      }).ok,
    [pixKey.keyValue, pixKey.receiverName, pixKey.receiverCity],
  );
  const qrOn = sendQr && payloadOk;

  // The lock: with both options off there is no message, so Enviar AND Enter are
  // dead — same grammar as `sendDisabledReason` in MessageInput.tsx.
  const nothingSelected = !sendText && !qrOn;
  const sendDisabled = nothingSelected || isSending;
  const sendDisabledReason = nothingSelected
    ? s.nothingSelected
    : isSending
      ? s.sending
      : undefined;

  const handleSend = () => {
    if (sendDisabled) return;
    onSend({ sendText, sendQr: qrOn, context: context.trim() });
  };

  return (
    <div
      role="group"
      aria-label={s.stagedLabel}
      className="flex items-center gap-2 border-b border-border bg-muted/30 px-3 py-2"
    >
      <Tooltip>
        <TooltipTrigger asChild>
          {/* asChild + span: a focusable trigger here would land a tab stop
              before the context field and break the spec's tab order. The
              receiver is duplicated in aria-label for anyone not hovering.
              role="img" so the label is announced reliably (same pairing as the
              preview canvas). The inner Icon needs no aria-hidden: the wrapper
              sets it automatically whenever no ariaLabel is passed. */}
          <span
            role="img"
            aria-label={s.receiverTooltip(pixKey.receiverName)}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-background text-muted-foreground"
          >
            <Icon icon="mdi:qrcode" size={16} />
          </span>
        </TooltipTrigger>
        <TooltipContent>{s.receiverTooltip(pixKey.receiverName)}</TooltipContent>
      </Tooltip>

      <div className="min-w-0 flex-1">
        {/* flex-wrap so a 36-char random key drops to its own line instead of
            being cut. NEVER truncate the key: a half-visible key looks
            checkable and is not, and this bar exists precisely to be checked.
            The alias truncates instead — a nickname is the expendable one. */}
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
          <span className="max-w-[10rem] truncate text-xs font-medium text-foreground">
            {pixKey.alias}
          </span>
          <Badge variant="secondary" className="shrink-0 gap-1 px-1.5 py-0 text-[10px]">
            <Icon icon={PIX_TYPE_ICON[pixKey.keyType]} size={10} />
            {PIX_TYPE_LABEL[pixKey.keyType]}
          </Badge>
          {/* The KEY is the security discriminator between matriz and filial —
              the receiver name is nearly always the same across a company's
              keys. So the key is what stays visible, in text-foreground. */}
          <span className="min-w-0 break-all font-mono text-xs tabular-nums text-foreground">
            {pixKey.keyValue}
          </span>
          <span className="hidden max-w-[12rem] truncate text-[11px] text-muted-foreground lg:inline">
            {pixKey.receiverName}
          </span>
        </div>
        <input
          type="text"
          value={context}
          onChange={(e) => setContext(e.target.value)}
          onKeyDown={(e) => {
            // Enter sends, Escape cancels — same as ComposerStagedAsset. Enter
            // obeys the same lock as the button: no options, no send.
            if (e.key === "Enter") {
              e.preventDefault();
              handleSend();
            }
            if (e.key === "Escape") {
              e.preventDefault();
              onCancel();
            }
          }}
          placeholder={s.contextPlaceholder}
          aria-label={s.contextPlaceholder}
          className="mt-0.5 w-full bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground"
        />
      </div>

      {/* State is never carried by colour alone: aria-pressed for AT, the icon
          goes outline → filled, and a check appears. MDI ships no
          `qrcode-outline`, so the QR chip's shape channel is the check — which
          is the requirement that actually matters. */}
      <Button
        type="button"
        variant={sendText ? "secondary" : "outline"}
        size="sm"
        aria-pressed={sendText}
        onClick={() => setSendText((v) => !v)}
        className="h-8 shrink-0 gap-1 px-2 focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
      >
        <Icon icon={sendText ? "mdi:key" : "mdi:key-outline"} size={14} />
        <span className="hidden sm:inline">{s.optionText}</span>
        {sendText && <Icon icon="mdi:check" size={12} />}
      </Button>

      {/* title on the wrapper, not the button: a disabled button swallows the
          mouse events a native tooltip needs. */}
      <span className="shrink-0" title={payloadOk ? undefined : s.qrUnavailable}>
        <Button
          type="button"
          variant={qrOn ? "secondary" : "outline"}
          size="sm"
          disabled={!payloadOk}
          aria-pressed={qrOn}
          onClick={() => setSendQr((v) => !v)}
          className="h-8 gap-1 px-2 focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
        >
          <Icon icon="mdi:qrcode" size={14} />
          <span className="hidden sm:inline">{s.optionQr}</span>
          {qrOn && <Icon icon="mdi:check" size={12} />}
        </Button>
      </span>

      {/* No control with nothing to do: one key means nothing to swap to. */}
      {keyCount > 1 && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onSwapKey}
          aria-label={s.swapKey}
          title={s.swapKey}
          className="h-8 w-8 shrink-0 p-0"
        >
          <Icon icon="mdi:swap-horizontal" size={14} />
        </Button>
      )}

      <Button
        type="button"
        size="sm"
        onClick={handleSend}
        disabled={sendDisabled}
        aria-label={s.send}
        title={sendDisabledReason ?? s.send}
        className="h-8 shrink-0 gap-1 px-2.5"
      >
        <Icon
          icon={isSending ? "mdi:loading" : "mdi:send"}
          size={14}
          className={isSending ? "animate-spin" : undefined}
        />
      </Button>

      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onCancel}
        aria-label={s.cancel}
        className="h-8 w-8 shrink-0 p-0"
      >
        <Icon icon="mdi:close" size={14} />
      </Button>
    </div>
  );
}
