import { useState } from "react";
import { toast } from "sonner";
import type { ID, ISO8601, IScheduledSend } from "@/shared/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { useConversationScheduled } from "../hooks/useConversationScheduled";
import { formatScheduleLabel } from "../engine/scheduledSend";
import { ScheduleSendMenu } from "./ScheduleSendMenu";
import { QUICK_SEND_STRINGS } from "../i18n/pt-BR";

export interface IScheduledListProps {
  conversationId: ID;
}

const PAYLOAD_LABEL: Record<
  IScheduledSend["payload"]["type"],
  keyof typeof QUICK_SEND_STRINGS.schedule
> = {
  asset: "payloadAsset",
  snippet: "payloadSnippet",
  combo: "payloadCombo",
  product: "payloadProduct",
};

function formatWhen(iso: ISO8601): string {
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Collapsible "Agendados (N)" bar above the composer (D-11). Only pending
 * items are actionable; edit re-schedules a new time, cancel offers a 5s undo
 * via sonner before committing the provider cancel.
 */
export function ScheduledList({ conversationId }: IScheduledListProps) {
  const s = QUICK_SEND_STRINGS.schedule;
  const { items, cancel, update, isLoading, isError } = useConversationScheduled(conversationId);
  const [open, setOpen] = useState(false);

  const pending = items.filter((i) => i.status === "pending");
  const visible = items.filter((i) => i.status !== "cancelled");

  if (isLoading) return null;

  if (isError) {
    return (
      <div className="border-b border-border bg-muted/30">
        <p className="px-4 py-3 text-center text-sm text-destructive">
          {QUICK_SEND_STRINGS.errors.loadAssetFailed}
        </p>
      </div>
    );
  }

  if (visible.length === 0) return null;

  const handleCancel = (item: IScheduledSend) => {
    let undone = false;
    toast(s.cancelled, {
      action: {
        label: s.undo,
        onClick: () => {
          undone = true;
        },
      },
      duration: 5_000,
      onAutoClose: () => {
        if (!undone) cancel(item.id);
      },
      onDismiss: () => {
        if (!undone) cancel(item.id);
      },
    });
  };

  const handleReschedule = (item: IScheduledSend, scheduledFor: ISO8601) => {
    update(item.id, { scheduledFor });
    toast.success(s.scheduledToast(formatScheduleLabel(scheduledFor)));
  };

  return (
    <div className="border-b border-border bg-muted/30">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-1.5 text-[11px] font-medium text-muted-foreground hover:bg-muted/50"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <Icon icon="mdi:calendar-clock" size={14} />
        <span>
          {s.listTitle} · {s.scheduledCount(pending.length)}
        </span>
        <Icon
          icon="mdi:chevron-down"
          size={14}
          className={cn("ml-auto transition-transform", open && "rotate-180")}
        />
      </button>
      {open && (
        <ul className="divide-y divide-border/60 px-3 pb-2">
          {visible.map((item) => {
            const labelKey = PAYLOAD_LABEL[item.payload.type];
            const payloadLabel = s[labelKey] as string;
            return (
              <li key={item.id} className="flex items-center gap-2 py-2 text-xs">
                <Icon icon="mdi:clock-outline" size={14} className="text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-foreground">
                    {payloadLabel}
                    {item.payload.contextMessage ? ` — ${item.payload.contextMessage}` : ""}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {formatWhen(item.scheduledFor)}
                  </p>
                </div>
                {item.status === "failed" && (
                  <Badge
                    variant="outline"
                    className="border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300"
                  >
                    {s.failedBadge}
                  </Badge>
                )}
                {item.status === "sent" && <Badge variant="secondary">{s.sentBadge}</Badge>}
                {item.status === "pending" && (
                  <div className="flex items-center gap-0.5">
                    <ScheduleSendMenu onSchedule={(iso) => handleReschedule(item, iso)} />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                      aria-label={s.cancel}
                      onClick={() => handleCancel(item)}
                    >
                      <Icon icon="mdi:close" size={14} />
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
