import type { PermissionAction, PermissionScope } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { permissionCellLabel } from "../../i18n/pt-BR";

export interface IPermissionCellProps {
  resourceLabel: string;
  action: PermissionAction;
  allowed: boolean;
  scope: PermissionScope;
}

/**
 * Read-only permission cell (PRD-211 Task 9 — scaffold).
 *
 * Renders as a disabled `role="checkbox"` so the matrix is keyboard- and
 * screen-reader-navigable while clearly non-editable. State is conveyed by the
 * icon shape (filled check vs outline circle) — never color alone — to stay
 * accessible to color-blind users.
 *
 * Editing / `onChange` is intentionally absent; it lands in the editable task.
 */
export function PermissionCell({ resourceLabel, action, allowed, scope }: IPermissionCellProps) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={allowed}
      aria-label={permissionCellLabel(resourceLabel, action, allowed, scope)}
      disabled
      className="inline-flex h-8 w-8 cursor-not-allowed items-center justify-center rounded-md disabled:opacity-100"
    >
      <Icon
        icon={allowed ? "mdi:check-circle" : "mdi:circle-outline"}
        size={18}
        className={cn(allowed ? "text-primary" : "text-muted-foreground/40")}
      />
    </button>
  );
}
