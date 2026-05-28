import { createFileRoute, redirect } from "@tanstack/react-router";
import { PortalSupportPage, readPortalSessionSync } from "@/features/b2b-portal";

export const Route = createFileRoute("/portal/suporte")({
  beforeLoad: () => {
    if (!readPortalSessionSync()) throw redirect({ to: "/portal/login" });
  },
  component: PortalSupportPage,
});
