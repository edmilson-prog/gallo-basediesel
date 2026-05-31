import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import {
  useNotifications,
  useUnreadCount,
  useNotificationMutations,
} from "@/providers/notifications";
import type { INotification, INotificationAction } from "@/providers/notifications";
import { NotificationListView } from "../components/NotificationListView";
import { NotificationFilters } from "../components/NotificationFilters";
import { NotificationLayoutSwitcher } from "../components/NotificationLayoutSwitcher";
import { useNotificationLayout } from "../lib/useNotificationLayout";
import { useNotificationsUrlState } from "../hooks/useNotificationsUrlState";
import { filtersToListParams, hasActiveNotificationFilters } from "../lib/notificationFilters";

const PAGE_STEP = 20;

export function NotificationCenterPage() {
  const { filters, setFilters, clear } = useNotificationsUrlState();
  const [layout, setLayout] = useNotificationLayout();
  const [pageSize, setPageSize] = useState(PAGE_STEP);
  const navigate = useNavigate();

  const params = useMemo(
    () => ({ ...filtersToListParams(filters), pageSize }),
    [filters, pageSize],
  );
  const { data, total, isLoading, isFetching, isError, refetch } = useNotifications(params);
  const { count: unreadCount } = useUnreadCount();
  const { markRead, markAllRead } = useNotificationMutations();

  // Notification action targets are dynamic data strings; TanStack navigate is
  // typed to the route tree, so widen the options here (no `any`).
  const go = (to: string, p?: Record<string, string>) => {
    void navigate({ to, params: p } as unknown as Parameters<typeof navigate>[0]);
  };

  const handleAction = (n: INotification, action: INotificationAction) => {
    void markRead(n.id);
    if (action.type === "navigate") go(action.target, action.params);
  };

  const listView = (
    <NotificationListView
      notifications={data}
      total={total}
      isLoading={isLoading}
      isError={isError}
      onRetry={refetch}
      onAction={handleAction}
      onMarkRead={(id) => void markRead(id)}
      canLoadMore={data.length < total}
      onLoadMore={() => setPageSize((s) => s + PAGE_STEP)}
      isFetchingMore={isFetching && !isLoading}
      hasActiveFilters={hasActiveNotificationFilters(filters)}
      onClearFilters={clear}
    />
  );

  return (
    <div className="flex flex-col gap-6 px-4 py-6 md:px-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold leading-tight">Notificações</h1>
          {unreadCount > 0 && (
            <p className="text-sm text-muted-foreground">{unreadCount} não lidas</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={unreadCount === 0}
            onClick={() => void markAllRead()}
          >
            Marcar todas como lidas
          </Button>
          <NotificationLayoutSwitcher value={layout} onChange={setLayout} />
        </div>
      </header>

      {layout === "painel" ? (
        <div className="flex flex-col gap-6 md:flex-row">
          <aside className="md:w-60 md:shrink-0">
            {/* TODO(PRD-009): per-category counts need an aggregate query */}
            <NotificationFilters
              variant="sidebar"
              filters={filters}
              onChange={setFilters}
              onClear={clear}
            />
          </aside>
          <div className="min-w-0 flex-1">{listView}</div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {/* TODO(PRD-009): per-category counts need an aggregate query */}
          <NotificationFilters
            variant="bar"
            filters={filters}
            onChange={setFilters}
            onClear={clear}
          />
          {listView}
        </div>
      )}
    </div>
  );
}
