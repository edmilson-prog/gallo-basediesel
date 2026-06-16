import type { PermissionScope } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Badge } from "@/components/ui/badge";
import { SCOPE_DESCRIPTIONS, SCOPE_ICONS, SCOPE_LABELS } from "../../i18n/pt-BR";

export interface IScopeSelectProps {
  scope: PermissionScope;
  /** When the resource has no permission at all, the scope is not applicable. */
  disabled?: boolean;
}

/**
 * Compact, read-only display of a permission scope (PRD-211 Task 9 — scaffold).
 *
 * Renders as a `Badge` with the scope icon + label so it is visually consistent
 * with the rest of the matrix and clearly non-editable. The actual `Select`
 * (own/team/store/all) is wired in the editable task.
 */
export function ScopeSelect({ scope, disabled = false }: IScopeSelectProps) {
  if (disabled) {
    return (
      <span aria-hidden className="text-sm text-muted-foreground/40">
        —
      </span>
    );
  }

  return (
    <Badge
      variant="secondary"
      className="gap-1 font-normal"
      title={SCOPE_DESCRIPTIONS[scope]}
    >
      <Icon icon={SCOPE_ICONS[scope]} size={13} ariaLabel={`Escopo: ${SCOPE_LABELS[scope]}`} />
      {SCOPE_LABELS[scope]}
    </Badge>
  );
}
