import type { INotification, INotificationAction } from "@/providers/notifications";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { NotificationItem } from "./NotificationItem";
import { NotificationGroup } from "./NotificationGroup";
import { NotificationsSkeleton } from "./states/Skeleton";
import { NotificationsEmpty } from "./states/Empty";
import { NotificationsErrorState } from "./states/ErrorState";

interface NotificationListViewProps {
  notifications: INotification[];
  total: number;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  onAction: (notification: INotification, action: INotificationAction) => void;
  onMarkRead: (id: string) => void;
  canLoadMore?: boolean;
  onLoadMore?: () => void;
  isFetchingMore?: boolean;
  hasActiveFilters?: boolean;
  onClearFilters?: () => void;
  emptyTitle?: string;
  emptyDescription?: string;
}

// ---------------------------------------------------------------------------
// Module-level pure helper — clusters items sharing the same groupKey.
// Guards array access for noUncheckedIndexedAccess.
// ---------------------------------------------------------------------------
function clusterByGroupKey(items: INotification[]): { key: string; items: INotification[] }[] {
  const clusters: { key: string; items: INotification[] }[] = [];
  const indexByKey = new Map<string, number>();
  for (const n of items) {
    const key = n.groupKey ?? n.id;
    const idx = indexByKey.get(key);
    if (idx === undefined) {
      indexByKey.set(key, clusters.length);
      clusters.push({ key, items: [n] });
    } else {
      const c = clusters[idx];
      if (c) c.items.push(n);
    }
  }
  return clusters;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export function NotificationListView({
  notifications,
  total,
  isLoading,
  isError,
  onRetry,
  onAction,
  onMarkRead,
  canLoadMore = false,
  onLoadMore,
  isFetchingMore = false,
  hasActiveFilters = false,
  onClearFilters,
  emptyTitle,
  emptyDescription,
}: NotificationListViewProps) {
  // --- State: loading ---
  if (isLoading) {
    return <NotificationsSkeleton />;
  }

  // --- State: error ---
  if (isError) {
    return <NotificationsErrorState onRetry={onRetry} />;
  }

  // --- State: empty ---
  if (notifications.length === 0) {
    return (
      <NotificationsEmpty
        hasActiveFilters={hasActiveFilters}
        onClearFilters={onClearFilters}
        title={emptyTitle}
        description={emptyDescription}
      />
    );
  }

  // --- State: list ---
  const clusters = clusterByGroupKey(notifications);

  return (
    <div className="flex flex-col gap-2">
      {/* Notification rows (singletons) and groups */}
      {clusters.map((cluster) => {
        if (cluster.items.length === 1) {
          // Singleton — guard indexed access
          const single = cluster.items[0];
          if (!single) return null;
          return (
            <NotificationItem
              key={cluster.key}
              notification={single}
              onAction={(action) => onAction(single, action)}
              onMarkRead={onMarkRead}
            />
          );
        }
        return (
          <NotificationGroup
            key={cluster.key}
            items={cluster.items}
            onAction={onAction}
            onMarkRead={onMarkRead}
          />
        );
      })}

      {/* Bounded "Carregar mais" pagination */}
      {canLoadMore && (
        <div className="flex flex-col items-center gap-1 pt-2">
          <Button
            variant="ghost"
            size="sm"
            disabled={isFetchingMore}
            onClick={onLoadMore}
            className="w-full"
          >
            {isFetchingMore ? "Carregando…" : "Carregar mais"}
          </Button>
          <p className={cn("font-mono text-[11px] text-muted-foreground")}>
            Mostrando {notifications.length} de {total}
          </p>
        </div>
      )}
    </div>
  );
}
