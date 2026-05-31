import { useNavigate } from "@tanstack/react-router";
import { useCustomerAuth } from "../hooks/useCustomerAuth";
import { useSeoMeta } from "@/features/storefront/hooks/useSeoMeta";
import { useCustomerNotifications, useNotificationMutations } from "@/providers/notifications";
import type { INotification, INotificationAction } from "@/providers/notifications";
import { NotificationListView } from "@/features/notifications/components/NotificationListView";
import { STOREFRONT_ACCOUNT_STRINGS as S } from "../i18n/pt-BR";

export function AccountNotificationsPage() {
  const { customer } = useCustomerAuth();
  const navigate = useNavigate();
  const { data, total, isLoading, isError, refetch } = useCustomerNotifications(customer?.id, {
    statuses: ["unread", "read"],
    pageSize: 50,
  });
  const { markRead } = useNotificationMutations();

  useSeoMeta({ title: "Notificações · GALLO PARTS" });

  // Customer notifications may carry actions targeting internal /app routes
  // (not valid for customers). Always mark read; only navigate for /loja targets.
  const handleAction = (n: INotification, action: INotificationAction) => {
    void markRead(n.id);
    if (action.type === "navigate" && action.target.startsWith("/loja")) {
      void navigate({ to: action.target, params: action.params } as unknown as Parameters<
        typeof navigate
      >[0]);
    }
  };

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
          {S.notificationsTitle}
        </h1>
        <p className="text-sm text-muted-foreground">{S.notificationsSubtitle}</p>
      </header>
      <NotificationListView
        notifications={data}
        total={total}
        isLoading={isLoading}
        isError={isError}
        onRetry={refetch}
        onAction={handleAction}
        onMarkRead={(id) => void markRead(id)}
        emptyTitle={S.notificationsEmptyTitle}
        emptyDescription={S.notificationsEmptyHint}
      />
    </div>
  );
}
