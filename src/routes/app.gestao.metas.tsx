import { createFileRoute, Outlet } from "@tanstack/react-router";

/**
 * Goals section layout (PRD-042). Outlet-only wrapper so child routes
 * (`/`, `/nova`, `/$id`) render under the same path namespace. Page-level
 * auth guards and search validation live on the index and child routes.
 */
export const Route = createFileRoute("/app/gestao/metas")({
  component: () => <Outlet />,
});
