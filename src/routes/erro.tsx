import { createFileRoute } from "@tanstack/react-router";
import { EmptyLayout } from "@/features/shell/layouts";
import { EmptyState } from "@/features/shell/components/EmptyState";

export const Route = createFileRoute("/erro")({
  component: () => (
    <EmptyLayout>
      <EmptyState
        icon="mdi:alert-circle"
        title="Algo deu errado"
        description="Encontramos um problema ao carregar esta página. Tente novamente."
        actionLabel="Voltar ao início"
        actionTo="/"
      />
    </EmptyLayout>
  ),
});
