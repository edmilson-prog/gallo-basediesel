import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/app/configuracoes/")({
  beforeLoad: () => {
    throw redirect({ to: "/app/configuracoes/perfil" });
  },
});
