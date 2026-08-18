import { createFileRoute, redirect } from "@tanstack/react-router";
import { readCurrentUserSync } from "@/features/auth/guards";
import { ConversasPage } from "@/features/pwa-atendimento/pages/ConversasPage";

export const Route = createFileRoute("/atendimento/conversas")({
  beforeLoad: () => {
    if (!readCurrentUserSync()) throw redirect({ to: "/atendimento/entrar" });
  },
  component: ConversasPage,
});
