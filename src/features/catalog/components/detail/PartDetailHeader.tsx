import type { IPart } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { CATALOG_STRINGS } from "../../i18n/pt-BR";
import type { PartDetailLayout } from "../../config/layout";
import { PartLayoutSwitcher } from "./PartLayoutSwitcher";

export interface IPartDetailHeaderProps {
  part: IPart;
  canEdit: boolean;
  canToggle: boolean;
  layout: PartDetailLayout;
  onLayoutChange: (layout: PartDetailLayout) => void;
  onBack: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onToggleActive: () => void;
  editing: boolean;
}

/**
 * Action row from the design kit (`CatActionHeader`): a plain back link on the
 * left, then the mode switch, a rule, and the record actions on the right. It
 * sits inside the content column — deliberately not a full-bleed toolbar.
 */
export function PartDetailHeader({
  part,
  canEdit,
  canToggle,
  layout,
  onLayoutChange,
  onBack,
  onEdit,
  onDuplicate,
  onToggleActive,
  editing,
}: IPartDetailHeaderProps) {
  const hasActions = !editing && (canEdit || canToggle);

  return (
    <div className="flex flex-wrap items-center gap-3.5">
      <button
        type="button"
        onClick={onBack}
        disabled={editing}
        className="flex cursor-pointer items-center gap-2.5 py-1 text-[15px] font-semibold text-foreground transition-colors hover:text-muted-foreground disabled:pointer-events-none disabled:opacity-50"
      >
        <Icon icon="mdi:arrow-left" size={18} />
        {CATALOG_STRINGS.detail.backToList}
      </button>

      <div className="ml-auto flex flex-wrap items-center gap-2">
        <PartLayoutSwitcher value={layout} onChange={onLayoutChange} disabled={editing} />

        {hasActions && <span aria-hidden className="h-[26px] w-px bg-border" />}

        {editing ? (
          <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Icon icon="mdi:pencil-outline" size={14} />
            {CATALOG_STRINGS.detail.actions.editing}
          </span>
        ) : (
          <>
            {canEdit && (
              <Button variant="secondary" size="sm" className="cursor-pointer" onClick={onEdit}>
                <Icon icon="mdi:pencil-outline" size={15} />
                {CATALOG_STRINGS.detail.actions.edit}
              </Button>
            )}
            {canEdit && (
              <Button
                variant="secondary"
                size="sm"
                className="cursor-pointer"
                onClick={onDuplicate}
              >
                <Icon icon="mdi:content-copy" size={15} />
                {CATALOG_STRINGS.detail.actions.duplicate}
              </Button>
            )}
            {canToggle && (
              <Button
                variant="outline"
                size="sm"
                className="cursor-pointer"
                onClick={onToggleActive}
              >
                <Icon icon={part.active ? "mdi:power" : "mdi:restart"} size={15} />
                {part.active
                  ? CATALOG_STRINGS.detail.actions.deactivate
                  : CATALOG_STRINGS.detail.actions.activate}
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
