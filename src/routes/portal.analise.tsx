import { createFileRoute, redirect } from "@tanstack/react-router";
import { PortalAnalyticsPage, readPortalSessionSync } from "@/features/b2b-portal";

export const Route = createFileRoute("/portal/analise")({
  beforeLoad: () => {
    if (!readPortalSessionSync()) throw redirect({ to: "/portal/login" });
  },
  component: PortalAnalyticsPage,
});
