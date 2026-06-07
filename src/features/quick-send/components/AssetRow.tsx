// src/features/quick-send/components/AssetRow.tsx
import type { IAssetLibraryItem, RoleName } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { isSensitiveAsset, canSendSensitiveAsset } from "../engine/assetSensitivity";
import { pickSendableVersion } from "../engine/assetVersioning";
import { QUICK_SEND_STRINGS } from "../i18n/pt-BR";

export interface IAssetRowProps {
  item: IAssetLibraryItem;
  viewer: { role: RoleName } | null;
  isFavorite: boolean;
  /** True when this row is the listbox's active option (aria-activedescendant). */
  isActive?: boolean;
  onSelect: () => void;
  onSendNow?: () => void;
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

/** Scannable row for palette/sheet modes: icon · title · brand · vN · ★ (D-2). */
export function AssetRow({
  item,
  viewer,
  isFavorite,
  isActive = false,
  onSelect,
  onSendNow,
  onToggleFavorite,
}: IAssetRowProps) {
  const blocked = isSensitiveAsset(item) && !canSendSensitiveAsset(viewer);
  const sendable = pickSendableVersion(item) !== null;
  const isArchived = item.status === "archived";
  const isDraft = item.status === "draft";

  return (
    <div
      id={`asset-opt-${item.id}`}
      className={cn(
        "group flex items-center gap-3 rounded-md px-2 py-2 text-sm",
        !blocked && sendable && "cursor-pointer hover:bg-muted/60",
        isActive && !blocked && sendable && "bg-muted/60 ring-1 ring-ring",
        (blocked || isArchived) && "opacity-60",
      )}
      role="option"
      aria-selected={isActive}
      aria-disabled={blocked || !sendable}
      onClick={() => {
        if (blocked || !sendable) return;
        onSelect();
      }}
      onKeyDown={(e) => {
        if (blocked || !sendable) return;
        // ⌘/Ctrl+Enter sends immediately (spec §6.2 "envia já"); plain Enter/Space stages.
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && onSendNow) {
          e.preventDefault();
          onSendNow();
          return;
        }
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      tabIndex={-1}
    >
      <span
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground",
          isSensitiveAsset(item) ? "bg-amber-500/10 ring-1 ring-amber-500/40" : "bg-muted",
        )}
      >
        <Icon icon={blocked ? "mdi:lock-outline" : CATEGORY_ICON[item.category]} size={18} />
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-foreground">{item.title}</p>
        <p className="truncate text-[11px] text-muted-foreground">
          {[item.brand, item.productLine, `v${item.version}`].filter(Boolean).join(" · ")}
        </p>
      </div>

      {isDraft && (
        <span className="shrink-0 rounded-full border border-border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
          {QUICK_SEND_STRINGS.library.draft}
        </span>
      )}
      {blocked && (
        <span className="shrink-0 text-[10px] text-amber-600 dark:text-amber-400">
          {QUICK_SEND_STRINGS.library.noPermission}
        </span>
      )}

      {!blocked && sendable && onSendNow && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="hidden h-7 w-7 shrink-0 p-0 group-hover:inline-flex"
          aria-label={QUICK_SEND_STRINGS.productCard.sendProduct}
          onClick={(e) => {
            e.stopPropagation();
            onSendNow();
          }}
        >
          <Icon icon="mdi:send" size={14} />
        </Button>
      )}

      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 w-7 shrink-0 p-0"
        aria-label={isFavorite ? "Remover dos favoritos" : "Adicionar aos favoritos"}
        aria-pressed={isFavorite}
        onClick={(e) => {
          e.stopPropagation();
          onToggleFavorite();
        }}
      >
        <Icon
          icon={isFavorite ? "mdi:star" : "mdi:star-outline"}
          size={14}
          className={cn(isFavorite && "text-amber-500")}
        />
      </Button>
    </div>
  );
}
