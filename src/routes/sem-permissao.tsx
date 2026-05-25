import { createFileRoute } from "@tanstack/react-router";
import { EmptyLayout } from "@/features/shell/layouts";
import { EmptyState } from "@/features/shell/components/EmptyState";
import { useAuth } from "@/features/auth/useAuth";

export const Route = createFileRoute("/sem-permissao")({
  component: ForbiddenPage,
});

function ForbiddenPage() {
  const { userRole } = useAuth();
  const backTo = userRole === "Cliente" ? "/loja" : "/app/inicio";

  return (
    <EmptyLayout>
      <EmptyState
        icon="mdi:lock-alert"
        title="Acesso negado"
        description="Seu perfil atual não tem permissão para acessar esta área."
        actionLabel="Voltar"
        actionTo={backTo}
      />
    </EmptyLayout>
  );
}
