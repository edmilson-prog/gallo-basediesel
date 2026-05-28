import { createFileRoute } from "@tanstack/react-router";
import { PWALoginPage } from "@/features/external-seller-pwa";

export const Route = createFileRoute("/pwa/login")({
  component: PWALoginPage,
});
