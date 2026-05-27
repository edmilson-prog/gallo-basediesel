import { createFileRoute } from "@tanstack/react-router";
import { requireAuth } from "@/features/auth/guards";
import { ABCClassPage, validateABCSearch } from "@/features/abc-curve";

export const Route = createFileRoute("/app/gestao/abc/$class")({
  beforeLoad: ({ location }) =>
    requireAuth(location.pathname, ["Owner", "Gestor", "Vendedor", "Financeiro"]),
  validateSearch: validateABCSearch,
  component: ABCClassPage,
});
