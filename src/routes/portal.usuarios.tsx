import { createFileRoute, redirect } from "@tanstack/react-router";
import { PortalUsersPage, readPortalSessionSync } from "@/features/b2b-portal";

export const Route = createFileRoute("/portal/usuarios")({
  beforeLoad: () => {
    const session = readPortalSessionSync();
    if (!session) throw redirect({ to: "/portal/login" });
    if (session.role !== "admin") throw redirect({ to: "/portal/inicio" });
  },
  component: PortalUsersPage,
});
