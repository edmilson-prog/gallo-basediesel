// src/features/media/components/MediaTypeGroups.tsx
import { useId, type ReactNode } from "react";
import type { IMediaAsset } from "@/shared/types";
import type { IMockUserProfile } from "@/features/auth/mock-users";
import { Icon } from "@/components/Icon";
import { mediaKindIcon, formatBytes } from "../utils/mediaDisplay";
import { MediaGrid } from "./MediaGrid";
import { MEDIA_STRINGS } from "../i18n/pt-BR";

interface IMediaTypeGroupsProps {
  assets: IMediaAsset[];
  columns: number;
  viewer: IMockUserProfile | null;
  onOpen: (asset: IMediaAsset) => void;
  onRetry?: (asset: IMediaAsset) => void;
  isLocked: (asset: IMediaAsset) => boolean;
  renderLockedOverlay: (asset: IMediaAsset) => ReactNode;
  /** Optional stable prefix for section heading IDs. Defaults to a useId()-generated value. */
  instanceId?: string;
}

function ListRow({ asset, onOpen, snippet, playable }: {
  asset: IMediaAsset; onOpen: () => void; snippet?: string; playable?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-3 rounded-md border border-border bg-card px-3 py-2 text-left hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-muted text-muted-foreground">
        <Icon icon={playable ? "mdi:play" : mediaKindIcon(asset.kind)} size={16} aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-medium text-foreground">
          {asset.fileName ?? "—"}
        </span>
        {snippet ? (
          <span className="block truncate text-[11px] text-muted-foreground">{snippet}</span>
        ) : (
          <span className="block text-[11px] text-muted-foreground">{formatBytes(asset.sizeBytes)}</span>
        )}
      </span>
    </button>
  );
}

export function MediaTypeGroups({
  assets, columns, viewer, onOpen, onRetry, isLocked, renderLockedOverlay, instanceId,
}: IMediaTypeGroupsProps) {
  const autoId = useId();
  const prefix = instanceId ?? autoId;
  const g = MEDIA_STRINGS.groups;
  // Videos are grouped with images in the grid (per spec §5.1: "imagens em grid").
  // Documents and audios are shown as list rows below.
  const images = assets.filter((a) => a.kind === "image" || a.kind === "video");
  const docs = assets.filter((a) => a.kind === "document");
  const audios = assets.filter((a) => a.kind === "audio");

  return (
    <div className="flex flex-col gap-4 p-3">
      <section aria-labelledby={`${prefix}-grp-images`}>
        <h3 id={`${prefix}-grp-images`} className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {g.images} · {images.length}
        </h3>
        {images.length === 0 ? (
          <p className="text-xs text-muted-foreground">{g.empty}</p>
        ) : (
          <MediaGrid
            assets={images} columns={columns} viewer={viewer} onOpen={onOpen} onRetry={onRetry}
            isLocked={isLocked} renderLockedOverlay={renderLockedOverlay}
            className="p-0"
          />
        )}
      </section>

      <section aria-labelledby={`${prefix}-grp-docs`}>
        <h3 id={`${prefix}-grp-docs`} className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {g.documents} · {docs.length}
        </h3>
        {docs.length === 0 ? (
          <p className="text-xs text-muted-foreground">{g.empty}</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {docs.map((a) => <ListRow key={a.id} asset={a} onOpen={() => onOpen(a)} />)}
          </div>
        )}
      </section>

      <section aria-labelledby={`${prefix}-grp-audios`}>
        <h3 id={`${prefix}-grp-audios`} className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {g.audios} · {audios.length}
        </h3>
        {audios.length === 0 ? (
          <p className="text-xs text-muted-foreground">{g.empty}</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {audios.map((a) => (
              <ListRow key={a.id} asset={a} onOpen={() => onOpen(a)} playable snippet={a.transcription} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
