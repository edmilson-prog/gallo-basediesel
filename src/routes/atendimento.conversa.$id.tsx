import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { readCurrentUserSync } from "@/features/auth/guards";

/** Pass-through layout: holds the session guard shared by the thread and its
 *  media screen, so neither child repeats it. */
export const Route = createFileRoute("/atendimento/conversa/$id")({
  beforeLoad: () => {
    if (!readCurrentUserSync()) throw redirect({ to: "/atendimento/entrar" });
  },
  component: Outlet,
});
