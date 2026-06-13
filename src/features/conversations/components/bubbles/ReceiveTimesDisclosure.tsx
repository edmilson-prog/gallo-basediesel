import { useState } from "react";
import type { IMessage } from "@/shared/types";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/Icon";
import { formatFullTimestamp, formatTime } from "../../utils/messageDisplay";
import { CONVERSATION_STRINGS } from "../../i18n/pt-BR";

const STR = CONVERSATION_STRINGS.receiveTimes;

/**
 * Inbound footer: shows a single time by default (when the customer sent the
 * message — the WhatsApp `sentAt`) and a chevron that expands a compact
 * "receipt" inside the bubble with BOTH full timestamps:
 *   ▷ sent by the customer       (sentAt)
 *   ⤓ received/stored by us       (receivedAt — the row's created_at)
 *
 * Replaces the always-visible inline second time: the data is one tap away
 * instead of permanently doubling the footer. When there is no `receivedAt`
 * (legacy rows) it degrades to the single time, exactly as before.
 */
export function ReceiveTimesDisclosure({ message }: { message: IMessage }) {
  const [open, setOpen] = useState(false);
  const time = formatTime(message.sentAt);
  const { receivedAt, sentAt } = message;

  if (!receivedAt) {
    return (
      <div className="mt-1 flex items-center justify-end gap-1 text-[11px] text-muted-foreground">
        <span className="tabular-nums">{time}</span>
      </div>
    );
  }

  return (
    <div className="mt-1 flex flex-col gap-1 text-[11px] text-muted-foreground">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={open ? STR.collapse : STR.expand}
        className="flex items-center gap-0.5 self-end rounded transition-colors hover:text-foreground"
      >
        <span className="tabular-nums">{time}</span>
        <Icon
          icon="mdi:chevron-down"
          size={14}
          className={cn("transition-transform", open && "rotate-180")}
        />
      </button>

      {open && (
        <div className="flex flex-col gap-1 self-stretch rounded-md border border-border bg-background/50 px-2 py-1.5 font-mono text-[11px] tabular-nums text-foreground">
          <span className="flex items-center gap-1.5">
            <Icon
              icon="mdi:play"
              size={13}
              ariaLabel={STR.sentLabel}
              className="text-muted-foreground"
            />
            {formatFullTimestamp(sentAt)}
          </span>
          <span className="flex items-center gap-1.5">
            <Icon
              icon="mdi:tray-arrow-down"
              size={13}
              ariaLabel={STR.receivedLabel}
              className="text-muted-foreground"
            />
            {formatFullTimestamp(receivedAt)}
          </span>
        </div>
      )}
    </div>
  );
}
