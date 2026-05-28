import { createFileRoute, Outlet } from "@tanstack/react-router";
import { PortalLayout } from "@/features/b2b-portal";

export const Route = createFileRoute("/portal")({
  component: () => (
    <PortalLayout>
      <Outlet />
    </PortalLayout>
  ),
});
