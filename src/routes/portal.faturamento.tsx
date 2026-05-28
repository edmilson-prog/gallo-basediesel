import { createFileRoute, redirect } from "@tanstack/react-router";
import {
  PortalBillingPage,
  readPortalSessionSync,
  readPortalUserSync,
} from "@/features/b2b-portal";

export const Route = createFileRoute("/portal/faturamento")({
  beforeLoad: () => {
    const session = readPortalSessionSync();
    if (!session) throw redirect({ to: "/portal/login" });
    // RF-038: financial data is sensitive — block by canViewFinancial, not just
    // by an authenticated session (hiding the nav item is not enough).
    const user = readPortalUserSync(session.portalUserId);
    if (!user?.canViewFinancial) throw redirect({ to: "/portal/inicio" });
  },
  component: PortalBillingPage,
});
