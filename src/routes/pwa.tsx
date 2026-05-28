import { createFileRoute, Outlet } from "@tanstack/react-router";
import { PWALayout } from "@/features/external-seller-pwa";

export const Route = createFileRoute("/pwa")({
  component: () => (
    <PWALayout>
      <Outlet />
    </PWALayout>
  ),
});
