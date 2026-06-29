import { createFileRoute } from "@tanstack/react-router";
import { requireAuth } from "@/features/auth/guards";
import { PendingContactsPage } from "@/features/contact-review";

export const Route = createFileRoute("/app/atendimento_/contatos-pendentes")({
  beforeLoad: ({ location }) => requireAuth(location.pathname, ["Owner", "Gestor"]),
  component: PendingContactsPage,
});
