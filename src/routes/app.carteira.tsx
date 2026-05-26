import { createFileRoute } from "@tanstack/react-router";
import { requireAuth } from "@/features/auth/guards";
import { CarteiraPage } from "@/features/carteira/pages/CarteiraPage";

export const Route = createFileRoute("/app/carteira")({
  beforeLoad: ({ location }) =>
    requireAuth(location.pathname, ["Owner", "Gestor"], {
      resource: "transfer",
      action: "view",
    }),
  component: CarteiraPage,
});
