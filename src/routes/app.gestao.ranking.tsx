import { createFileRoute, Outlet } from "@tanstack/react-router";

/**
 * Ranking section layout (PRD-043). Outlet-only wrapper so the child routes
 * (`/`, `/$sellerId`) render under the same path namespace. The page-level
 * auth guard lives on the index and drill-down routes.
 */
export const Route = createFileRoute("/app/gestao/ranking")({
  component: () => <Outlet />,
});
