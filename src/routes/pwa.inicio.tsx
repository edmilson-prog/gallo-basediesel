import { createFileRoute, redirect } from "@tanstack/react-router";
import { PWAHomePage, readPwaSessionSync } from "@/features/external-seller-pwa";

export const Route = createFileRoute("/pwa/inicio")({
  beforeLoad: () => {
    if (!readPwaSessionSync()) throw redirect({ to: "/pwa/login" });
  },
  component: PWAHomePage,
});
