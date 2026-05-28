import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Legacy route — the storefront editor moved into the consolidated Admin da
 * Loja panel (PRD-066 RF-020). Redirect preserves old bookmarks.
 */
export const Route = createFileRoute("/app/configuracoes/storefront")({
  beforeLoad: () => {
    throw redirect({
      to: "/app/storefront-admin",
      search: { tab: "conteudo", subtab: "home" },
    });
  },
});
