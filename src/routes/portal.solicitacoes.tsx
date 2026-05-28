import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { readPortalSessionSync } from "@/features/b2b-portal";

export const Route = createFileRoute("/portal/solicitacoes")({
  beforeLoad: () => {
    if (!readPortalSessionSync()) throw redirect({ to: "/portal/login" });
  },
  component: () => <Outlet />,
});
