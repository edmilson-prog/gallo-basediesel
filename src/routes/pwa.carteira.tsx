import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { readPwaSessionSync } from "@/features/external-seller-pwa";

export const Route = createFileRoute("/pwa/carteira")({
  beforeLoad: () => {
    if (!readPwaSessionSync()) throw redirect({ to: "/pwa/login" });
  },
  component: () => <Outlet />,
});
