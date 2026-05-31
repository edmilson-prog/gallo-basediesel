import { forwardRef } from "react";
import type { ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useUnreadCount } from "@/providers/notifications";

type NotificationBellProps = ComponentPropsWithoutRef<typeof Button>;

export const NotificationBell = forwardRef<HTMLButtonElement, NotificationBellProps>(
  function NotificationBell({ className, ...props }, ref) {
    const { count } = useUnreadCount();
    const hasUnread = count > 0;
    const display = count > 99 ? "99+" : String(count);
    return (
      <Button
        ref={ref}
        variant="ghost"
        size="icon"
        aria-label="Notificações"
        className={cn("relative", className)}
        {...props}
      >
        <Icon icon={hasUnread ? "mdi:bell-badge-outline" : "mdi:bell-outline"} size={20} />
        {hasUnread && (
          <Badge
            variant="default"
            aria-hidden
            className="absolute -right-0.5 -top-0.5 h-4 min-w-4 justify-center px-1 text-[10px] tabular-nums"
          >
            {display}
          </Badge>
        )}
        <span className="sr-only" aria-live="polite">
          {hasUnread ? `${count} notificações não lidas` : "Nenhuma notificação não lida"}
        </span>
      </Button>
    );
  },
);
