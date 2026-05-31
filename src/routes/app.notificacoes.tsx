import { createFileRoute } from "@tanstack/react-router";
import { NotificationCenterPage } from "@/features/notifications/pages/NotificationCenterPage";
import { validateNotificationsSearch } from "@/features/notifications/lib/notificationFilters";

export const Route = createFileRoute("/app/notificacoes")({
  validateSearch: validateNotificationsSearch,
  component: NotificationCenterPage,
});
