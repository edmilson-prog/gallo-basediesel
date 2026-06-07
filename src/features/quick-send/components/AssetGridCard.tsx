// src/features/quick-send/components/AssetGridCard.tsx
import type { IAssetLibraryItem, RoleName } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { isSensitiveAsset, canSendSensitiveAsset } from "../engine/assetSensitivity";
import { pickSendableVersion } from "../engine/assetVersioning";
import { QUICK_SEND_STRINGS } from "../i18n/pt-BR";

export interface IAssetGridCardProps {
  item: IAssetLibraryItem;
  viewer: { role: RoleName } | null;
  isFavorite: boolean;
  /** True when this card is the listbox's active option (aria-activedescendant). */
  isActive?: boolean;
  onSelect: () => void;
  onToggleFavorite: () => void;
}

const CATEGORY_ICON: Record<IAssetLibraryItem["category"], string> = {
  catalogo: "mdi:book-open-variant",
  ficha_tecnica: "mdi:file-document-outline",
  tabela_preco: "mdi:cash-multiple",
  garantia: "mdi:shield-check-outline",
  video: "mdi:play-circle-outline",
  link: "mdi:link-variant",
};

/** Thumbnail card for grid mode (D-2). Falls back to a category tile (no real bytes). */
export function AssetGridCard({
  item,
  viewer,
  isFavorite,
  isActive = false,
  onSelect,
  onToggleFavorite,
}: IAssetGridCardProps) {
  const blocked = isSensitiveAsset(item) && !canSendSensitiveAsset(viewer);
  const sendable = pickSendableVersion(item) !== null;
  const isArchived = item.status === "archived";

  return (
    <div
      id={`asset-opt-${item.id}`}
      className={cn(
        "relative flex flex-col overflow-hidden rounded-lg border border-border bg-card",
        !blocked && sendable && "cursor-pointer hover:border-primary/40 hover:shadow-sm",
        isActive && !blocked && sendable && "border-primary ring-1 ring-ring",
        (blocked || isArchived) && "opacity-60",
        isSensitiveAsset(item) && "ring-1 ring-amber-500/40",
      )}
      role="option"
      aria-selected={isActive}
      aria-disabled={blocked || !sendable}
      tabIndex={-1}
      onClick={() => {
        if (blocked || !sendable) return;
        onSelect();
      }}
      onKeyDown={(e) => {
        if ((e.key === "Enter" || e.key === " ") && !blocked && sendable) {
          e.preventDefault();
          onSelect();
        }
      }}
    >
      <div className="flex aspect-video items-center justify-center bg-muted text-muted-foreground">
        <Icon icon={blocked ? "mdi:lock-outline" : CATEGORY_ICON[item.category]} size={32} />
      </div>
      <div className="flex items-start gap-1 p-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium text-foreground">{item.title}</p>
          <p className="truncate text-[10px] text-muted-foreground">
            {[item.brand, `v${item.version}`].filter(Boolean).join(" · ")}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 w-6 shrink-0 p-0"
          aria-label={isFavorite ? "Remover dos favoritos" : "Adicionar aos favoritos"}
          aria-pressed={isFavorite}
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite();
          }}
        >
          <Icon
            icon={isFavorite ? "mdi:star" : "mdi:star-outline"}
            size={13}
            className={cn(isFavorite && "text-amber-500")}
          />
        </Button>
      </div>
      {blocked && (
        <span className="absolute left-1 top-1 rounded bg-amber-500/90 px-1 py-0.5 text-[9px] font-medium text-white">
          {QUICK_SEND_STRINGS.library.noPermission}
        </span>
      )}
    </div>
  );
}
