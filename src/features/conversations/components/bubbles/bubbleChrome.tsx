import type { ReactNode } from "react";
import type { IMessage } from "@/shared/types";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/Icon";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { formatTime, isReprocessable, statusVisual } from "../../utils/messageDisplay";
import { CONVERSATION_STRINGS } from "../../i18n/pt-BR";
import { ReceiveTimesDisclosure } from "./ReceiveTimesDisclosure";
import { BubbleActionsMenu } from "./BubbleActionsMenu";
import { QuotedPreview } from "./QuotedPreview";

export interface IBubbleChromeProps {
  message: IMessage;
  children: ReactNode;
  onRetry?: () => void;
  /** Extra trailing element below the bubble (e.g. caption). */
  footer?: ReactNode;
  /** Hide the inner padding wrapper — used by media bubbles that fill the body. */
  unpadded?: boolean;
  /** Nome do contato — autor da citação quando ela é do cliente. */
  contactName?: string;
  /** Inicia uma resposta citando esta mensagem. Ausente = ação indisponível. */
  onReply?: () => void;
  /** Leva até a mensagem citada. Ausente = citação não clicável. */
  onJumpToQuoted?: () => void;
  /** Destaque temporário — a bolha acabou de ser alvo de um pulo. */
  flash?: boolean;
}

/**
 * Shared chrome (alignment, surface, status row, SDR styling) for every
 * non-system bubble. Subcomponents render their own content inside the
 * `children` slot. Keeping this generic avoids duplicating the SDR/seller/
 * customer alignment rules across each media type.
 */
export function BubbleChrome({
  message,
  children,
  onRetry,
  footer,
  unpadded = false,
  contactName,
  onReply,
  onJumpToQuoted,
  flash = false,
}: IBubbleChromeProps) {
  const isOut = message.direction === "out";
  const isSdr = message.authorType === "sdr";
  const isFailed = message.status === "failed";
  // Failed → "Tentar novamente" (PRD-118). Stuck `queued` → "Reprocessar":
  // the edge persisted the row but the dispatch never settled.
  const reprocessable = isReprocessable(message);

  const align = isOut ? "items-end" : "items-start";
  const bubbleColor = !isOut
    ? "bg-card border border-border text-foreground"
    : isSdr
      ? "bg-emerald-500/10 border border-l-2 border-l-emerald-500 border-border text-foreground"
      : "bg-primary/10 border border-primary/20 text-foreground";
  const failedColor = isFailed ? "ring-1 ring-destructive bg-destructive/5" : "";

  const status = statusVisual(message.status);
  const time = formatTime(message.sentAt);
  // Audio voice notes: `read` means PLAYED — surface "Ouvido" instead of "Lida".
  const isHeardAudio = message.mediaType === "audio" && message.status === "read";
  const statusLabel = isHeardAudio ? CONVERSATION_STRINGS.heardLabel : status.label;

  return (
    <div className={cn("flex w-full flex-col gap-0.5", align)}>
      <div
        data-message-id={message.id}
        className={cn(
          "group/bubble relative max-w-[78%] rounded-2xl text-sm shadow-sm",
          bubbleColor,
          failedColor,
          unpadded ? "overflow-hidden" : "px-3 py-2",
          flash && "ring-2 ring-primary/60",
        )}
      >
        <BubbleActionsMenu message={message} onReply={onReply} />
        {message.replyTo && (
          // Bolhas de mídia são `unpadded` (o conteúdo encosta na borda), então
          // a citação precisa do próprio respiro para não colar nas laterais.
          <div className={unpadded ? "px-2 pt-2" : undefined}>
            <QuotedPreview
              reply={message.replyTo}
              contactName={contactName}
              onJump={message.replyTo.messageId ? onJumpToQuoted : undefined}
            />
          </div>
        )}
        {children}

        {isOut ? (
          <div className="mt-1 flex items-center justify-end gap-1 text-[11px] text-muted-foreground">
            <span>{time}</span>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className={cn("inline-flex", status.className)} aria-label={statusLabel}>
                  <Icon icon={status.icon} size={13} />
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {message.status === "failed"
                  ? // PRD-118 RF-012: surface WHY it failed when the provider told us.
                    message.failureReason
                    ? CONVERSATION_STRINGS.statusTooltip.failedWithReason(message.failureReason)
                    : CONVERSATION_STRINGS.statusTooltip.failed
                  : message.status === "queued"
                    ? CONVERSATION_STRINGS.statusTooltip.queued
                    : message.status === "sent"
                      ? CONVERSATION_STRINGS.statusTooltip.sent(time)
                      : message.status === "delivered"
                        ? CONVERSATION_STRINGS.statusTooltip.delivered(time)
                        : isHeardAudio
                          ? CONVERSATION_STRINGS.statusTooltip.heard(time)
                          : CONVERSATION_STRINGS.statusTooltip.read(time)}
              </TooltipContent>
            </Tooltip>
          </div>
        ) : (
          // Inbound: single send-time by default; a chevron expands a receipt
          // with BOTH timestamps (customer send time + our receive/stored time).
          <ReceiveTimesDisclosure message={message} />
        )}

        {isSdr && isOut && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="absolute -top-2 right-2 inline-flex select-none items-center rounded-full border border-emerald-500/40 bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-300">
                {CONVERSATION_STRINGS.sdrBadge}
              </span>
            </TooltipTrigger>
            <TooltipContent side="top">{CONVERSATION_STRINGS.sdrBubbleTooltip}</TooltipContent>
          </Tooltip>
        )}
      </div>

      {footer}

      {reprocessable && (
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            "h-7 gap-1 px-2 text-[11px]",
            isFailed
              ? "text-destructive hover:bg-destructive/10"
              : "text-muted-foreground hover:bg-muted",
          )}
          onClick={onRetry}
        >
          <Icon icon="mdi:refresh" size={12} />
          {isFailed ? CONVERSATION_STRINGS.retry : CONVERSATION_STRINGS.reprocess}
        </Button>
      )}
    </div>
  );
}
