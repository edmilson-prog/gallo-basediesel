import { createFileRoute, redirect } from "@tanstack/react-router";
import { PortalBillingPage, readPortalSessionSync } from "@/features/b2b-portal";

export const Route = createFileRoute("/portal/faturamento")({
  beforeLoad: () => {
    if (!readPortalSessionSync()) throw redirect({ to: "/portal/login" });
  },
  component: PortalBillingPage,
});
