import { createFileRoute } from "@tanstack/react-router";
import { LoginPage } from "@/features/pwa-atendimento/pages/LoginPage";

export const Route = createFileRoute("/atendimento/entrar")({
  component: LoginPage,
});
