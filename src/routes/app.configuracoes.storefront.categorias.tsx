import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Legacy route — the per-category storefront editor moved into the Admin da
 * Loja panel (PRD-066 RF-020). Redirect preserves old bookmarks to the
 * categories sub-tab.
 */
export const Route = createFileRoute("/app/configuracoes/storefront/categorias")({
  beforeLoad: () => {
    throw redirect({
      to: "/app/storefront-admin",
      search: { tab: "conteudo", subtab: "categorias" },
    });
  },
});
