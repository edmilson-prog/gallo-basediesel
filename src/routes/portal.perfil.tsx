import { createFileRoute, redirect } from "@tanstack/react-router";
import { PortalProfilePage, readPortalSessionSync } from "@/features/b2b-portal";

export const Route = createFileRoute("/portal/perfil")({
  beforeLoad: () => {
    if (!readPortalSessionSync()) throw redirect({ to: "/portal/login" });
  },
  component: PortalProfilePage,
});
