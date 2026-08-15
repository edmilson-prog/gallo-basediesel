import { createFileRoute, redirect } from "@tanstack/react-router";
import { readCurrentUserSync } from "@/features/auth/guards";
import { EsperaPage } from "@/features/pwa-atendimento/pages/EsperaPage";

export const Route = createFileRoute("/atendimento/espera")({
  beforeLoad: () => {
    if (!readCurrentUserSync()) throw redirect({ to: "/atendimento/entrar" });
  },
  component: EsperaPage,
});
