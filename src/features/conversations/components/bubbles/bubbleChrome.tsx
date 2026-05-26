import type { ReactNode } from "react";
import type { IMessage } from "@/shared/types";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/Icon";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { formatTime, statusVisual } from "../../utils/messageDisplay";
import { CONVERSATION_STRINGS } from "../../i18n/pt-BR";

export interface IBubbleChromeProps {
  message: IMessage;
  children: ReactNode;
  onRetry?: () => void;
  /** Extra trailing element below the bubble (e.g. caption). */
  footer?: ReactNode;
  /** Hide the inner padding wrapper — used by media bubbles that fill the body. */
  unpadded?: boolean;
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
}: IBubbleChromeProps) {
  const isOut = message.direction === "out";
  const isSdr = message.authorType === "sdr";
  const isFailed = message.status === "failed";

  const align = isOut ? "items-end" : "items-start";
  const bubbleColor = !isOut
    ? "bg-card border border-border text-foreground"
    : isSdr
      ? "bg-emerald-500/10 border border-l-2 border-l-emerald-500 border-border text-foreground"
      : "bg-primary/10 border border-primary/20 text-foreground";
  const failedColor = isFailed ? "ring-1 ring-destructive bg-destructive/5" : "";

  const status = statusVisual(message.status);
  const time = formatTime(message.sentAt);

  return (
    <div className={cn("flex w-full flex-col gap-0.5", align)}>
      <div
        className={cn(
          "relative max-w-[78%] rounded-2xl text-sm shadow-sm",
          bubbleColor,
          failedColor,
          unpadded ? "overflow-hidden" : "px-3 py-2",
        )}
      >
        {children}

        <div className="mt-1 flex items-center justify-end gap-1 text-[11px] text-muted-foreground">
          <span>{time}</span>
          {isOut && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className={cn("inline-flex", status.className)} aria-label={status.label}>
                  <Icon icon={status.icon} size={13} />
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {message.status === "failed"
                  ? CONVERSATION_STRINGS.statusTooltip.failed
                  : message.status === "sent"
                    ? CONVERSATION_STRINGS.statusTooltip.sent(time)
                    : message.status === "delivered"
                      ? CONVERSATION_STRINGS.statusTooltip.delivered(time)
                      : CONVERSATION_STRINGS.statusTooltip.read(time)}
              </TooltipContent>
            </Tooltip>
          )}
        </div>

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

      {isOut && isFailed && (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1 px-2 text-[11px] text-destructive hover:bg-destructive/10"
          onClick={onRetry}
        >
          <Icon icon="mdi:refresh" size={12} />
          {CONVERSATION_STRINGS.retry}
        </Button>
      )}
    </div>
  );
}
