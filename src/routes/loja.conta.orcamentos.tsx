import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/loja/conta/orcamentos")({
  component: Outlet,
});
