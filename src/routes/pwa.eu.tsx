import { createFileRoute, redirect } from "@tanstack/react-router";
import { PWAProfilePage, readPwaSessionSync } from "@/features/external-seller-pwa";

export const Route = createFileRoute("/pwa/eu")({
  beforeLoad: () => {
    if (!readPwaSessionSync()) throw redirect({ to: "/pwa/login" });
  },
  component: PWAProfilePage,
});
