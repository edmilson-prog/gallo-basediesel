import { useState } from "react";
import type { INotification, INotificationAction } from "@/providers/notifications";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/Icon";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { NotificationItem } from "./NotificationItem";

interface NotificationGroupProps {
  /** length >= 2 (singletons are rendered directly by the list view) */
  items: INotification[];
  onAction: (notification: INotification, action: INotificationAction) => void;
  onMarkRead: (id: string) => void;
  /** default true */
  defaultOpen?: boolean;
}

export function NotificationGroup({
  items,
  onAction,
  onMarkRead,
  defaultOpen = true,
}: NotificationGroupProps) {
  const [open, setOpen] = useState(defaultOpen);

  // Guard for noUncheckedIndexedAccess
  const lead = items[0];
  if (!lead) return null;
  const hasUnread = items.some((n) => n.status === "unread");

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      {/* Group header trigger */}
      <CollapsibleTrigger
        className={cn(
          "flex w-full items-center gap-2 rounded-xl border border-border px-3 py-2 text-left",
          "transition-colors hover:bg-muted/40",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        )}
      >
        {/* Chevron — rotates when open */}
        <Icon
          icon="mdi:chevron-down"
          size={18}
          className={cn(
            "shrink-0 text-muted-foreground transition-transform duration-200",
            open && "rotate-180",
          )}
        />

        {/* Representative title */}
        <span className="min-w-0 flex-1 truncate font-sans text-sm font-semibold leading-snug">
          {lead.title}
        </span>

        {/* Unread dot */}
        {hasUnread && <span className="h-2 w-2 shrink-0 rounded-full bg-primary" aria-hidden />}

        {/* Count badge */}
        <span
          className={cn(
            "shrink-0 rounded-full bg-muted px-1.5 py-0.5 font-mono text-[11px] font-medium",
            "text-muted-foreground",
          )}
        >
          {items.length}
        </span>
      </CollapsibleTrigger>

      {/* Expanded items — indented */}
      <CollapsibleContent className="mt-1 flex flex-col gap-1 pl-6">
        {items.map((notification) => (
          <NotificationItem
            key={notification.id}
            dense
            notification={notification}
            onAction={(action) => onAction(notification, action)}
            onMarkRead={onMarkRead}
          />
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}
