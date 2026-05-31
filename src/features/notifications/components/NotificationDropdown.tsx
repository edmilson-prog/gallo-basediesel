import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { NotificationBell } from "@/features/notifications/components/NotificationBell";
import { NotificationItem } from "@/features/notifications/components/NotificationItem";
import { useNotifications, useNotificationMutations } from "@/providers/notifications";
import type { INotification, INotificationAction } from "@/providers/notifications";

// ---------------------------------------------------------------------------
// Grouping helper — unread-first, collapsed by groupKey
// ---------------------------------------------------------------------------

interface IPreviewGroup {
  representative: INotification;
  count: number;
}

function groupForPreview(items: INotification[]): IPreviewGroup[] {
  const unreadFirst = [...items].sort(
    (a, b) => Number(b.status === "unread") - Number(a.status === "unread"),
  );
  const groups: IPreviewGroup[] = [];
  const indexByKey = new Map<string, number>();
  for (const n of unreadFirst) {
    const key = n.groupKey ?? n.id; // ungrouped → its own group
    const idx = indexByKey.get(key);
    if (idx === undefined) {
      indexByKey.set(key, groups.length);
      groups.push({ representative: n, count: 1 });
    } else {
      const g = groups[idx];
      if (g) g.count += 1;
    }
  }
  return groups;
}

// ---------------------------------------------------------------------------
// NotificationDropdown
// ---------------------------------------------------------------------------

export function NotificationDropdown() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  // Notification targets are dynamic data strings and some routes are created in
  // later tasks; TanStack's navigate is typed to the route tree, so widen the
  // options here (no `any`). Runtime accepts the path string.
  const go = (to: string, params?: Record<string, string>) => {
    void navigate({ to, params } as unknown as Parameters<typeof navigate>[0]);
  };

  const { data, isLoading } = useNotifications({ pageSize: 8 });
  const { markRead, markAllRead } = useNotificationMutations();

  const groups = groupForPreview(data);

  const handleAction = (notification: INotification, action: INotificationAction) => {
    void markRead(notification.id);
    if (action.type === "navigate") {
      go(action.target, action.params);
    }
    // TODO: named-mutation registry for action.type === "mutation" deferred to a later PRD
    setOpen(false);
  };

  const handleMarkRead = (id: string) => {
    void markRead(id);
    // Keep popover open so the user sees the item turn read
  };

  const handleMarkAllRead = () => {
    void markAllRead();
    // Keep popover open intentionally
  };

  const handleViewAll = () => {
    setOpen(false);
    go("/app/notificacoes");
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <NotificationBell />
      </PopoverTrigger>

      <PopoverContent align="end" className="w-[22rem] p-0">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-3 py-2.5">
          <span className="font-display text-sm font-semibold">Notificações</span>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={handleMarkAllRead}
          >
            Marcar todas lidas
          </Button>
        </div>

        {/* Body */}
        <div className="max-h-[22rem] overflow-y-auto p-2">
          {isLoading ? (
            // Skeleton rows (respects prefers-reduced-motion — pulse is CSS-only)
            <div className="flex flex-col gap-2" aria-label="Carregando notificações">
              <div className="h-14 animate-pulse rounded-xl bg-muted/50" />
              <div className="h-14 animate-pulse rounded-xl bg-muted/50" />
              <div className="h-14 animate-pulse rounded-xl bg-muted/50" />
            </div>
          ) : groups.length === 0 ? (
            <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
              Nada novo por aqui ✅
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {groups.map(({ representative, count }) => (
                <li key={representative.id}>
                  <NotificationItem
                    notification={representative}
                    onAction={(action) => handleAction(representative, action)}
                    onMarkRead={handleMarkRead}
                    dense
                  />
                  {count > 1 && (
                    <p className="mt-1 px-1 text-[11px] text-muted-foreground">
                      +{count - 1} relacionada{count - 1 > 1 ? "s" : ""}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Footer */}
        <div className="border-t p-1">
          <Button variant="ghost" size="sm" className="h-8 w-full text-xs" onClick={handleViewAll}>
            Ver todas
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
