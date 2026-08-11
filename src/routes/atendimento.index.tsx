import { createFileRoute, redirect } from "@tanstack/react-router";
import { readCurrentUserSync } from "@/features/auth/guards";

export const Route = createFileRoute("/atendimento/")({
  beforeLoad: () => {
    throw redirect({ to: readCurrentUserSync() ? "/atendimento/conversas" : "/atendimento/entrar" });
  },
});
