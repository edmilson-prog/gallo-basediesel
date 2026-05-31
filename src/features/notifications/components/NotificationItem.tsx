import type { INotification, INotificationAction } from "@/providers/notifications";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { formatRelativeTimeBR } from "@/shared/utils/format";
import { SEVERITY_TONE, CATEGORY_ICON } from "@/features/notifications/lib/severity";

interface NotificationItemProps {
  notification: INotification;
  onAction: (action: INotificationAction) => void;
  onMarkRead: (id: string) => void;
  /** Compact variant for the dropdown preview. */
  dense?: boolean;
}

/**
 * Presentational notification row — Direção B (edge-by-severity).
 *
 * Pure leaf component: no data fetching, no hooks, no store access.
 * Parents wire onAction/onMarkRead to real mutations.
 */
export function NotificationItem({
  notification,
  onAction,
  onMarkRead,
  dense = false,
}: NotificationItemProps) {
  const tone = SEVERITY_TONE[notification.severity];
  const categoryIcon = CATEGORY_ICON[notification.category];
  const isUnread = notification.status === "unread";
  const hasActions = (notification.actions?.length ?? 0) > 0;
  const showActionRow = hasActions || isUnread;

  return (
    <article
      className={cn(
        // Base card: rounded, right/top/bottom border + thicker tinted left border
        "flex min-w-0 rounded-xl border border-border outline-none",
        "border-l-[3px]",
        tone.border,
        // Unread highlight vs transparent background
        isUnread ? "bg-primary/[0.045]" : "bg-transparent",
        // Cheap transition only (respects prefers-reduced-motion)
        "transition-colors",
        // Focus ring
        "focus-visible:ring-2 focus-visible:ring-primary",
        // Layout
        dense ? "gap-2 p-2" : "gap-3 p-3",
      )}
      tabIndex={0}
      aria-label={notification.title}
    >
      {/* Category icon chip */}
      <div
        className={cn(
          "flex shrink-0 items-center justify-center rounded-lg",
          tone.bg,
          dense ? "h-8 w-8" : "h-9 w-9",
        )}
      >
        <Icon
          icon={categoryIcon}
          size={dense ? 16 : 18}
          className={tone.text}
          // decorative — aria-hidden handled inside Icon when no ariaLabel
        />
      </div>

      {/* Content column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Title row: unread dot + title + relative timestamp */}
        <div className="flex min-w-0 items-center gap-1.5">
          {isUnread && <span className="h-2 w-2 shrink-0 rounded-full bg-primary" aria-hidden />}

          <span
            className={cn("min-w-0 flex-1 truncate font-sans text-sm font-semibold leading-snug")}
          >
            {notification.title}
          </span>

          <time
            dateTime={notification.createdAt}
            className="shrink-0 font-mono text-[11px] text-muted-foreground"
          >
            {formatRelativeTimeBR(notification.createdAt)}
          </time>
        </div>

        {/* Body (optional, single truncated line) */}
        {notification.body && (
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{notification.body}</p>
        )}

        {/* Action row: inline action buttons + "Marcar como lida" */}
        {showActionRow && (
          <div className={cn("flex flex-wrap items-center gap-1.5", dense ? "mt-1.5" : "mt-2")}>
            {notification.actions?.map((action) => (
              <Button
                key={action.id}
                variant="outline"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => onAction(action)}
              >
                {action.label}
              </Button>
            ))}

            {isUnread && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => onMarkRead(notification.id)}
              >
                Marcar como lida
              </Button>
            )}
          </div>
        )}
      </div>
    </article>
  );
}
