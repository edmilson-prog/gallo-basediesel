import { createFileRoute, redirect } from "@tanstack/react-router";
import { readPwaSessionSync } from "@/features/external-seller-pwa";

export const Route = createFileRoute("/pwa/")({
  beforeLoad: () => {
    throw redirect({ to: readPwaSessionSync() ? "/pwa/inicio" : "/pwa/login" });
  },
});
