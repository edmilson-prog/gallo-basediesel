import { createFileRoute } from "@tanstack/react-router";
import { requireAuth } from "@/features/auth/guards";

export const Route = createFileRoute("/app/suprimentos/notas")({
  // `roles` fica undefined de propósito: no requireAuth, `roles` e `permission`
  // são AND, e uma lista de papéis anularia o Editor de Papéis para papéis
  // customizados que recebam supplies.view.
  beforeLoad: ({ location }) =>
    requireAuth(location.pathname, undefined, { resource: "supplies", action: "view" }),
  component: () => <div />,
});
