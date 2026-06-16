import type { PermissionScope } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SCOPE_ORDER } from "../../permissions/scopes";
import { SCOPE_DESCRIPTIONS, SCOPE_ICONS, SCOPE_LABELS } from "../../i18n/pt-BR";

export interface IScopeSelectProps {
  scope: PermissionScope;
  /** When the resource has no permission at all, the scope is not applicable. */
  disabled?: boolean;
  /** Read-only mode (Owner immutable, or the user lacks edit permission). */
  readOnly?: boolean;
  /** Changes the row scope when editable. */
  onChange?: (scope: PermissionScope) => void;
}

/**
 * Per-row permission scope control (PRD-211 Task 10 — editable).
 *
 * When read-only it renders as a compact `Badge` (visually consistent with the
 * matrix). When editable it is an actual `Select` (own/team/store/all) that
 * changes the row's scope. The empty-state dash is shown when the resource has
 * no actions selected, so scope is not applicable.
 */
export function ScopeSelect({
  scope,
  disabled = false,
  readOnly = false,
  onChange,
}: IScopeSelectProps) {
  if (disabled) {
    return (
      <span aria-hidden className="text-sm text-muted-foreground/40">
        —
      </span>
    );
  }

  if (readOnly) {
    return (
      <Badge variant="secondary" className="gap-1 font-normal" title={SCOPE_DESCRIPTIONS[scope]}>
        <Icon icon={SCOPE_ICONS[scope]} size={13} ariaLabel={`Escopo: ${SCOPE_LABELS[scope]}`} />
        {SCOPE_LABELS[scope]}
      </Badge>
    );
  }

  return (
    <Select value={scope} onValueChange={(value) => onChange?.(value as PermissionScope)}>
      <SelectTrigger
        className="h-7 w-full gap-1 px-2 text-xs"
        aria-label={`Escopo: ${SCOPE_LABELS[scope]}`}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {SCOPE_ORDER.map((value) => (
          <SelectItem key={value} value={value} className="text-xs">
            <span className="flex items-center gap-1.5">
              <Icon icon={SCOPE_ICONS[value]} size={13} />
              {SCOPE_LABELS[value]}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
