import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "@/features/shell/components/EmptyState";

export const Route = createFileRoute("/loja/carrinho")({
  component: () => (
    <PlaceholderPage
      publicTone
      icon="mdi:cart-outline"
      title="Carrinho"
      backTo="/loja"
      backLabel="Continuar comprando"
    />
  ),
});
