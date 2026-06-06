// src/features/media/components/MediaCardTile.tsx
import type { ReactNode } from "react";
import type { IMediaAsset } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { formatRelativeTimeBR } from "@/shared/utils/format";
import { mediaKindIcon, formatBytes } from "../utils/mediaDisplay";
import { MEDIA_STRINGS } from "../i18n/pt-BR";

interface IMediaCardTileProps {
  asset: IMediaAsset;
  onOpen: () => void;
  lockedOverlay?: ReactNode;
  className?: string;
}

export function MediaCardTile({ asset, onOpen, lockedOverlay, className }: IMediaCardTileProps) {
  const classLabel = asset.classification
    ? MEDIA_STRINGS.filters.classification[asset.classification]
    : MEDIA_STRINGS.card.noClassification;

  const isSensitive = asset.sensitivity === "sensitive";

  // Viewer-agnostic by design: MediaCardTile receives no viewer prop (unlike MediaTile which
  // uses statusChipPriority). The sensitive marker is intentionally shown to all viewers;
  // the caller is responsible for passing a lockedOverlay when canViewSensitive(viewer) is false.
  const ariaLabel = [
    asset.fileName ?? MEDIA_STRINGS.card.unnamed,
    isSensitive ? MEDIA_STRINGS.chip.sensitive : null,
  ]
    .filter(Boolean)
    .join(" — ");

  return (
    <div
      role="gridcell"
      className={cn("flex flex-col overflow-hidden rounded-lg border border-border bg-card", className)}
    >
      <button
        type="button"
        onClick={onOpen}
        aria-label={ariaLabel}
        className="relative aspect-video w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {lockedOverlay ?? (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-muted to-muted/60 text-muted-foreground">
            <Icon icon={mediaKindIcon(asset.kind)} size={32} />
          </div>
        )}
      </button>
      <div className="flex flex-col gap-1 p-2">
        <span className="inline-flex w-fit items-center gap-1 rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
          <Icon icon={mediaKindIcon(asset.kind)} size={11} aria-hidden />
          {classLabel}
        </span>
        <p className="truncate text-xs font-medium text-foreground">
          {asset.fileName ?? MEDIA_STRINGS.card.unnamed}
        </p>
        <p className="text-[11px] text-muted-foreground">
          {formatBytes(asset.sizeBytes)}
          <span className="ml-1">· {formatRelativeTimeBR(asset.createdAt)}</span>
          {isSensitive && (
            <span className="ml-1 inline-flex items-center gap-0.5 text-severity-warning">
              ·{" "}
              <Icon icon="mdi:lock" size={11} aria-hidden />
              {MEDIA_STRINGS.chip.sensitive}
            </span>
          )}
        </p>
      </div>
    </div>
  );
}
