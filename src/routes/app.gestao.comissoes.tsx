import { createFileRoute, Outlet } from "@tanstack/react-router";

/**
 * Commissions section layout (PRD-047). Outlet-only wrapper so child routes
 * (`/`, `/$sellerId`) render under the same path namespace. The page-level
 * auth guard lives on the index and drill-down routes.
 */
export const Route = createFileRoute("/app/gestao/comissoes")({
  component: () => <Outlet />,
});
