import type { PermissionAction, PermissionScope } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { permissionCellLabel } from "../../i18n/pt-BR";

export interface IPermissionCellProps {
  resourceLabel: string;
  action: PermissionAction;
  allowed: boolean;
  scope: PermissionScope;
  /** Read-only mode (Owner immutable, or the user lacks edit permission). */
  readOnly?: boolean;
  /** Toggles the action when the cell is editable. */
  onToggle?: () => void;
  /** Roving-tabindex / grid keyboard wiring (provided by `ResourceAreaGroup`). */
  tabIndex?: number;
  onKeyDown?: (e: React.KeyboardEvent<HTMLButtonElement>) => void;
  /** Identifies the cell within the grid for arrow-key navigation. */
  dataRow?: number;
  dataCol?: number;
}

/**
 * A single permission cell (PRD-211 Task 10 — editable).
 *
 * Renders as a `role="checkbox"` button. When editable, clicking or pressing
 * Space toggles the action; the parent grid handles arrow-key navigation and a
 * roving tabindex. When read-only it stays focusable (`aria-disabled`) so the
 * label remains reachable by keyboard/screen-reader users — never a hard
 * `disabled` that would drop it from the tab order. State is conveyed by the
 * icon shape (filled check vs outline circle), never color alone.
 */
export function PermissionCell({
  resourceLabel,
  action,
  allowed,
  scope,
  readOnly = false,
  onToggle,
  tabIndex,
  onKeyDown,
  dataRow,
  dataCol,
}: IPermissionCellProps) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={allowed}
      aria-disabled={readOnly || undefined}
      aria-label={permissionCellLabel(resourceLabel, action, allowed, scope)}
      tabIndex={tabIndex}
      data-cell-row={dataRow}
      data-cell-col={dataCol}
      onClick={readOnly ? undefined : onToggle}
      onKeyDown={onKeyDown}
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center rounded-md outline-none transition-colors",
        "focus-visible:ring-2 focus-visible:ring-ring",
        readOnly
          ? "cursor-not-allowed"
          : "cursor-pointer hover:bg-muted/60 motion-safe:transition-colors",
      )}
    >
      <Icon
        icon={allowed ? "mdi:check-circle" : "mdi:circle-outline"}
        size={18}
        className={cn(allowed ? "text-primary" : "text-muted-foreground/40")}
      />
    </button>
  );
}
