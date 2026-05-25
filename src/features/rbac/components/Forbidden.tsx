import { EmptyState } from "@/features/shell/components/EmptyState";

export interface IForbiddenProps {
  title?: string;
  message?: string;
  actionLabel?: string;
  actionTo?: string;
}

/**
 * Standard "you cannot see this" panel. Drop inside a layout slot when the
 * route renders but the current user lacks fine-grained permission to read
 * the contained widget.
 */
export function Forbidden({
  title = "Acesso negado",
  message = "Seu perfil atual não tem permissão para visualizar este conteúdo.",
  actionLabel,
  actionTo,
}: IForbiddenProps) {
  return (
    <EmptyState
      icon="mdi:lock-outline"
      title={title}
      description={message}
      actionLabel={actionLabel}
      actionTo={actionTo}
    />
  );
}
