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
  saving: boolean;
  onSave: () => void;
  onCancel: () => void;
}

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
  saving,
  onSave,
  onCancel,
}: IPartDetailHeaderProps) {
  return (
    <div className="border-b border-border bg-card">
      <div className="mx-auto w-full max-w-[1600px] px-4 py-4 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={onBack}
            disabled={editing}
            className="-ml-2 cursor-pointer text-xs"
          >
            <Icon icon="mdi:arrow-left" size={14} />
            {CATALOG_STRINGS.detail.backToList}
          </Button>

          <div className="flex flex-wrap items-center gap-2">
            <PartLayoutSwitcher value={layout} onChange={onLayoutChange} disabled={editing} />
            {editing ? (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className="cursor-pointer"
                  onClick={onCancel}
                  disabled={saving}
                >
                  {CATALOG_STRINGS.detail.actions.cancel}
                </Button>
                <Button size="sm" className="cursor-pointer" onClick={onSave} disabled={saving}>
                  {saving ? (
                    <>
                      <Icon icon="svg-spinners:ring-resize" size={14} />
                      {CATALOG_STRINGS.detail.actions.saving}
                    </>
                  ) : (
                    CATALOG_STRINGS.detail.actions.save
                  )}
                </Button>
              </>
            ) : (
              <>
                {canEdit && (
                  <Button variant="outline" size="sm" className="cursor-pointer" onClick={onEdit}>
                    <Icon icon="mdi:pencil-outline" size={14} />
                    {CATALOG_STRINGS.detail.actions.edit}
                  </Button>
                )}
                {canEdit && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="cursor-pointer"
                    onClick={onDuplicate}
                  >
                    <Icon icon="mdi:content-copy" size={14} />
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
                    <Icon
                      icon={part.active ? "mdi:archive-outline" : "mdi:archive-arrow-up-outline"}
                      size={14}
                    />
                    {part.active
                      ? CATALOG_STRINGS.detail.actions.deactivate
                      : CATALOG_STRINGS.detail.actions.activate}
                  </Button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
