import type { IPart } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { CATALOG_STRINGS } from "../../i18n/pt-BR";
import { getCategoryLabel } from "../../utils/categories";
import { PartImage } from "../PartImage";

export interface IPartDetailHeaderProps {
  part: IPart;
  canEdit: boolean;
  canToggle: boolean;
  onBack: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onToggleActive: () => void;
}

export function PartDetailHeader({
  part,
  canEdit,
  canToggle,
  onBack,
  onEdit,
  onDuplicate,
  onToggleActive,
}: IPartDetailHeaderProps) {
  return (
    <div className="border-b border-border bg-card px-4 py-5 md:px-8">
      <Button variant="ghost" size="sm" onClick={onBack} className="-ml-2 mb-3 text-xs">
        <Icon icon="mdi:arrow-left" size={14} />
        {CATALOG_STRINGS.detail.backToList}
      </Button>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <PartImage part={part} size="lg" />
        <div className="flex flex-1 flex-col gap-2">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-xl font-semibold uppercase tracking-tight text-foreground">
                {part.name}
              </h1>
              <p className="font-mono text-xs text-muted-foreground">
                SKU {part.sku} · OEM {part.oemCodes[0] ?? "—"}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {canEdit && (
                <Button variant="outline" size="sm" onClick={onEdit}>
                  <Icon icon="mdi:pencil-outline" size={14} />
                  {CATALOG_STRINGS.detail.actions.edit}
                </Button>
              )}
              {canEdit && (
                <Button variant="outline" size="sm" onClick={onDuplicate}>
                  <Icon icon="mdi:content-copy" size={14} />
                  {CATALOG_STRINGS.detail.actions.duplicate}
                </Button>
              )}
              {canToggle && (
                <Button variant="outline" size="sm" onClick={onToggleActive}>
                  <Icon
                    icon={part.active ? "mdi:archive-outline" : "mdi:archive-arrow-up-outline"}
                    size={14}
                  />
                  {part.active
                    ? CATALOG_STRINGS.detail.actions.deactivate
                    : CATALOG_STRINGS.detail.actions.activate}
                </Button>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {part.category && (
              <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs text-foreground">
                {getCategoryLabel(part.category)}
              </span>
            )}
            {part.subcategory && (
              <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
                {part.subcategory}
              </span>
            )}
            {part.isOriginal ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-400/20 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:text-amber-300">
                <Icon icon="mdi:check-decagram" size={12} />
                {CATALOG_STRINGS.badges.original}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
                {CATALOG_STRINGS.badges.equivalent}
              </span>
            )}
            {!part.active && (
              <span className="inline-flex items-center gap-1 rounded-full bg-destructive/15 px-2.5 py-1 text-xs text-destructive">
                {CATALOG_STRINGS.status.inactive}
              </span>
            )}
          </div>
          {part.description && (
            <p className="pt-2 text-sm text-muted-foreground">{part.description}</p>
          )}
        </div>
      </div>
    </div>
  );
}
