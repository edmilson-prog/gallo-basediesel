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
  return (
    <div
      role="gridcell"
      className={cn("flex flex-col overflow-hidden rounded-lg border border-border bg-card", className)}
    >
      <button
        type="button"
        onClick={onOpen}
        aria-label={asset.fileName ?? MEDIA_STRINGS.card.unnamed}
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
          {asset.sensitivity === "sensitive" && (
            <span className="ml-1 text-severity-warning">· sensível</span>
          )}
        </p>
      </div>
    </div>
  );
}
