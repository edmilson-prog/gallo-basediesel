import { createFileRoute, redirect } from "@tanstack/react-router";
import { readCurrentUserSync } from "@/features/auth/guards";
import { AnalisePage } from "@/features/pwa-atendimento/pages/AnalisePage";

/**
 * Terceira aba do app (PRD-051).
 *
 * O guard só exige sessão. A permissão (`customer_service_analytics/view`) é
 * checada dentro da página, que já tem a tela de acesso restrito do PRD — um
 * `redirect` aqui mandaria o usuário para a lista sem explicar por quê.
 */
export const Route = createFileRoute("/atendimento/analise")({
  beforeLoad: () => {
    if (!readCurrentUserSync()) throw redirect({ to: "/atendimento/entrar" });
  },
  component: AnalisePage,
});
