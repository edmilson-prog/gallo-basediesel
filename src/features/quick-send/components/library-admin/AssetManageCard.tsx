// src/features/quick-send/components/library-admin/AssetManageCard.tsx
//
// Management-mode card for the Asset Library admin grid (P1).
// Does NOT encode send-mode rules (no blocked/sendable gates) so staff can
// act on draft/archived/sensitive items that AssetGridCard intentionally hides.

import type { IAssetLibraryItem } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { isSensitiveAsset } from "../../engine/assetSensitivity";
import { QUICK_SEND_STRINGS } from "../../i18n/pt-BR";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface IAssetManageCardProps {
  item: IAssetLibraryItem;
  isFavorite: boolean;
  onPreview: () => void;
  onEdit: () => void;
  onNewVersion: () => void;
  onTogglePublish: () => void;
  onToggleSensitive: () => void;
  onDelete: () => void;
  onToggleFavorite: () => void;
  /** When true, all action buttons/menu items are disabled (async op in-flight). */
  busy?: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Fallback icon per asset kind (visual cue when no real thumbnail byte exists). */
const KIND_ICON: Record<IAssetLibraryItem["kind"], string> = {
  document: "mdi:file-document-outline",
  video: "mdi:play-circle-outline",
  image: "mdi:image-outline",
  link: "mdi:link-variant",
};

/**
 * Semantic token classes per status — mirrors STATUS_TONE in LibraryManagerPage
 * but applied to a Badge instead of an inline span.
 */
const STATUS_TONE: Record<IAssetLibraryItem["status"], string> = {
  published: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  draft: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  archived: "border-border bg-muted text-muted-foreground",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Card for management-mode grid. Renders a thumbnail area (icon-fallback),
 * status/sensitive/version badges, a favourite toggle and a ⋮ action menu.
 *
 * Clicking the thumbnail or the title triggers `onPreview`.
 * All callbacks are no-ops when `busy` is true.
 */
export function AssetManageCard({
  item,
  isFavorite,
  onPreview,
  onEdit,
  onNewVersion,
  onTogglePublish,
  onToggleSensitive,
  onDelete,
  onToggleFavorite,
  busy = false,
}: IAssetManageCardProps) {
  const s = QUICK_SEND_STRINGS.library;
  const sensitive = isSensitiveAsset(item);

  return (
    <div
      className={cn(
        "relative flex flex-col overflow-hidden rounded-lg border border-border bg-card",
        "transition-colors duration-150",
        "hover:border-primary/40 hover:shadow-sm",
        sensitive && "ring-1 ring-amber-500/40",
      )}
    >
      {/* ------------------------------------------------------------------ */}
      {/* Thumbnail area — clicking opens preview                             */}
      {/* ------------------------------------------------------------------ */}
      <button
        type="button"
        className={cn(
          "flex aspect-video w-full items-center justify-center bg-muted text-muted-foreground",
          "cursor-pointer transition-opacity duration-150 hover:opacity-80",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        )}
        onClick={onPreview}
        aria-label={`${s.preview}: ${item.title}`}
        tabIndex={0}
      >
        <Icon icon={KIND_ICON[item.kind]} size={32} />
      </button>

      {/* ------------------------------------------------------------------ */}
      {/* Badges overlaid in top-left corner                                  */}
      {/* ------------------------------------------------------------------ */}
      <div className="absolute left-1.5 top-1.5 flex flex-wrap gap-1">
        {/* Status badge */}
        <Badge
          variant="outline"
          className={cn("px-1.5 py-0 text-[10px] font-medium", STATUS_TONE[item.status])}
        >
          {item.status === "published"
            ? s.statusPublished
            : item.status === "draft"
              ? s.draft
              : s.archived}
        </Badge>

        {/* Sensitive badge */}
        {sensitive && (
          <Badge
            variant="outline"
            className="gap-0.5 border-amber-500/40 bg-amber-500/10 px-1 py-0 text-[10px] text-amber-700 dark:text-amber-300"
          >
            <Icon icon="mdi:lock-outline" size={10} />
          </Badge>
        )}

        {/* Version badge */}
        <Badge
          variant="secondary"
          className="px-1.5 py-0 font-mono text-[10px]"
        >
          v{item.version}
        </Badge>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Footer: title + meta + favourite + ⋮ menu                          */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex items-start gap-1 p-2">
        {/* Title + category · brand (clickable → preview) */}
        <div className="min-w-0 flex-1">
          <button
            type="button"
            className={cn(
              "block w-full text-left",
              "cursor-pointer",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
            )}
            onClick={onPreview}
            tabIndex={0}
          >
            <p className="truncate text-xs font-medium text-foreground">{item.title}</p>
            <p className="truncate text-[10px] text-muted-foreground">
              {[item.category, item.brand].filter(Boolean).join(" · ")}
            </p>
          </button>
        </div>

        {/* Favourite toggle */}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 w-6 shrink-0 p-0"
          aria-label={isFavorite ? s.unfavorite : s.favorite}
          aria-pressed={isFavorite}
          disabled={busy}
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite();
          }}
        >
          <Icon
            icon={isFavorite ? "mdi:star" : "mdi:star-outline"}
            size={13}
            className={cn("transition-colors duration-150", isFavorite && "text-amber-500")}
          />
        </Button>

        {/* ⋮ action menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 w-6 shrink-0 p-0"
              aria-label="Ações do ativo"
              disabled={busy}
              onClick={(e) => e.stopPropagation()}
            >
              <Icon icon="mdi:dots-vertical" size={14} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem
              onSelect={onPreview}
            >
              <Icon icon="mdi:eye-outline" size={14} className="mr-2" />
              {s.preview}
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={onEdit}
            >
              <Icon icon="mdi:pencil-outline" size={14} className="mr-2" />
              {s.editAsset}
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={onNewVersion}
            >
              <Icon icon="mdi:numeric-positive-1" size={14} className="mr-2" />
              {s.newVersionTitle}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={onTogglePublish}
            >
              <Icon
                icon={item.status === "published" ? "mdi:eye-off-outline" : "mdi:publish"}
                size={14}
                className="mr-2"
              />
              {item.status === "published" ? s.unpublish : s.publish}
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={onToggleSensitive}
            >
              <Icon
                icon={sensitive ? "mdi:lock-open-outline" : "mdi:lock-outline"}
                size={14}
                className="mr-2"
              />
              {s.permission}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={onDelete}
              className="text-destructive focus:text-destructive"
            >
              <Icon icon="mdi:trash-can-outline" size={14} className="mr-2" />
              {s.deleteAssetTitle}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
