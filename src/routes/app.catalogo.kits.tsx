import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/app/catalogo/kits")({
  beforeLoad: () => {
    throw redirect({ to: "/app/kits" });
  },
});
