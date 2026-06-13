import type { IScheduledSend } from "@/shared/types";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { formatScheduleLabel } from "../../engine/scheduledSend";
import { QUICK_SEND_STRINGS } from "../../i18n/pt-BR";

export interface IScheduledItemCardProps {
  item: IScheduledSend;
  /** Recipient line for the global queue (Owner/Gestor). */
  recipient?: string | null;
  onEdit: (item: IScheduledSend) => void;
  onCancel: (item: IScheduledSend) => void;
}

const TYPE_ICON: Record<IScheduledSend["payload"]["type"], string> = {
  snippet: "mdi:message-text-outline",
  media: "mdi:paperclip",
  asset: "mdi:file-outline",
  combo: "mdi:package-variant",
  product: "mdi:cog-outline",
};

function previewText(item: IScheduledSend): string {
  const caption = item.payload.contextMessage?.trim();
  if (item.payload.type === "media") {
    const name = item.payload.fileName ?? QUICK_SEND_STRINGS.schedule.payloadMedia;
    return caption ? `${name} — ${caption}` : name;
  }
  return caption || QUICK_SEND_STRINGS.schedule.payloadSnippet;
}

export function ScheduledItemCard({ item, recipient, onEdit, onCancel }: IScheduledItemCardProps) {
  const s = QUICK_SEND_STRINGS.schedule;
  const isPending = item.status === "pending";
  const isFailed = item.status === "failed";
  const isSent = item.status === "sent";

  return (
    <div className="flex items-start gap-2.5 rounded-md border border-border bg-card p-3">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded bg-background text-muted-foreground">
        <Icon icon={TYPE_ICON[item.payload.type]} size={16} />
      </span>
      <div className="min-w-0 flex-1">
        {recipient && <p className="truncate text-[11px] text-muted-foreground">{s.recipient(recipient)}</p>}
        <p className="truncate text-sm text-foreground">{previewText(item)}</p>
        <div className="mt-0.5 flex items-center gap-2 text-[11px]">
          <span className="text-muted-foreground">
            {item.scheduledFor ? formatScheduleLabel(item.scheduledFor) : s.draftNoTime}
          </span>
          <span
            className={cn(
              "font-medium",
              isPending && "text-severity-info",
              isSent && "text-severity-success",
              isFailed && "text-severity-critical",
            )}
          >
            · {isPending ? s.pendingBadge : isSent ? s.sentBadge : isFailed ? s.failedBadge : ""}
          </span>
        </div>
        {isFailed && item.failureReason && (
          <p className="mt-0.5 text-[11px] text-severity-critical">{item.failureReason}</p>
        )}
      </div>
      {(isPending || isFailed) && (
        <div className="flex shrink-0 items-center gap-0.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-xs"
            onClick={() => onEdit(item)}
          >
            {isFailed ? s.reschedule : s.edit}
          </Button>
          {isPending && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 text-severity-critical hover:text-severity-critical"
              aria-label={s.cancel}
              onClick={() => onCancel(item)}
            >
              <Icon icon="mdi:close" size={14} />
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
