import { createFileRoute, redirect } from "@tanstack/react-router";
import { PortalHomePage, readPortalSessionSync } from "@/features/b2b-portal";

export const Route = createFileRoute("/portal/inicio")({
  beforeLoad: () => {
    if (!readPortalSessionSync()) throw redirect({ to: "/portal/login" });
  },
  component: PortalHomePage,
});
