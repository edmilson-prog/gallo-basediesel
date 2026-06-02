import { createFileRoute, Outlet } from "@tanstack/react-router";

/**
 * Indicators section layout. Outlet-only wrapper so child routes
 * (`/`, `/novo`, `/$id`) render under the same path namespace.
 */
export const Route = createFileRoute("/app/gestao/indicadores")({
  component: () => <Outlet />,
});
