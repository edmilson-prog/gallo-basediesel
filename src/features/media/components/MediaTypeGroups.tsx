// src/features/media/components/MediaTypeGroups.tsx
import { useId, type ReactNode } from "react";
import type { IMediaAsset } from "@/shared/types";
import type { IMockUserProfile } from "@/features/auth/mock-users";
import { Icon } from "@/components/Icon";
import { mediaKindIcon, formatBytes } from "../utils/mediaDisplay";
import { MediaGrid } from "./MediaGrid";
import { MEDIA_STRINGS, KIND_LABELS } from "../i18n/pt-BR";
import { canViewSensitive, statusChipPriority } from "../engine/sensitiveAccess";

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

function ListRow({
  asset,
  viewer,
  onOpen,
  onRetry,
  snippet,
  playable,
  playLabel,
}: {
  asset: IMediaAsset;
  viewer: IMockUserProfile | null;
  onOpen: () => void;
  onRetry?: () => void;
  snippet?: string;
  playable?: boolean;
  playLabel?: string;
}) {
  const c = MEDIA_STRINGS.chip;
  const chip = statusChipPriority(asset, viewer);
  const locked = chip === "sensitive";
  const failed = chip === "failure";

  // D-6/§5.5: sensitive assets must carry a visible lock signal in every surface.
  // When locked, suppress bytes (snippet/transcription) and show the lock label instead.
  // Real byte-leak guard: the lightbox `canView` gate blocks bytes; onClick must always
  // fire so the attempt is audited (spec §5.5) — matching the grid/cartões paths.
  const showSnippet = !locked && !failed && !!snippet;
  const showLockSignal = locked;

  // aria-label: fall back to kind label when fileName is absent so screen readers
  // don't announce a trailing em-dash placeholder.
  // Also used as the visible filename (minor fix: show kind context instead of '—').
  const displayName = asset.fileName ?? KIND_LABELS[asset.kind];
  const ariaLabel =
    playable && playLabel ? `${playLabel} — ${displayName}` : undefined;

  // §5.5 / D-6 AUDIT: the open button always fires onOpen — even for sensitive/locked
  // assets. The lightbox enforces the canView gate; clicking here triggers the audit
  // trail (actions.auditSensitiveAttempt). Short-circuiting here would silently skip
  // the required audit entry.
  //
  // RF-008 / WCAG 2.1.1: the retry control MUST NOT be nested inside another interactive
  // element. Restructured as a flex row div so the open button and the retry button are
  // siblings — each independently keyboard-focusable, no invalid nesting.
  return (
    <div className="flex w-full items-center gap-1 rounded-md border border-border bg-card text-left">
      <button
        type="button"
        onClick={onOpen}
        aria-label={ariaLabel}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-md px-3 py-2 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-muted text-muted-foreground">
          {/* Play icon is shown for playable assets regardless of lock state;
              the lock signal below communicates the restriction. */}
          <Icon icon={playable ? "mdi:play" : mediaKindIcon(asset.kind)} size={16} aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          {/* Use displayName so nameless assets show a kind label instead of '—'. */}
          <span className="block truncate text-xs font-medium text-foreground">
            {displayName}
          </span>
          {failed ? (
            // Failure indicator: mirrors MediaTile's failure chip (inconsistency fix).
            <span className="inline-flex items-center gap-1 text-[11px] text-severity-critical">
              <Icon icon="mdi:alert-circle" size={12} aria-hidden />
              {c.failure}
            </span>
          ) : showLockSignal ? (
            // Spec §5.5 / D-6: visible lock signal — lock icon (mdi:lock) + label, RNF-004 paired color+icon+text.
            <span className="inline-flex items-center gap-1 text-[11px] text-severity-warning">
              <Icon icon="mdi:lock" size={12} aria-hidden />
              {c.sensitive}
            </span>
          ) : showSnippet ? (
            <span className="block truncate text-[11px] text-muted-foreground">{snippet}</span>
          ) : (
            <span className="block text-[11px] text-muted-foreground">{formatBytes(asset.sizeBytes)}</span>
          )}
        </span>
      </button>
      {failed && onRetry && (
        // Retry affordance for failed assets — sibling of the open button (not nested).
        // tabIndex omitted so it enters the natural tab order (RF-008 / WCAG 2.1.1).
        // i18n: use MEDIA_STRINGS.chip.retry (c.retry) — never hardcode user-facing strings.
        <button
          type="button"
          aria-label={c.retry}
          onClick={(e) => {
            e.stopPropagation();
            onRetry();
          }}
          className="shrink-0 rounded p-2 text-muted-foreground hover:text-severity-critical focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Icon icon="mdi:refresh" size={14} aria-hidden />
        </button>
      )}
    </div>
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
            {docs.map((a) => (
              <ListRow
                key={a.id}
                asset={a}
                viewer={viewer}
                onOpen={() => onOpen(a)}
                onRetry={onRetry ? () => onRetry(a) : undefined}
              />
            ))}
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
              <ListRow
                key={a.id}
                asset={a}
                viewer={viewer}
                onOpen={() => onOpen(a)}
                onRetry={onRetry ? () => onRetry(a) : undefined}
                playable
                playLabel={g.playAudio}
                // D-6/§5.5 defense-in-depth: only expose transcription text when the viewer
                // can access sensitive content OR the asset is not sensitive. This prevents a
                // latent plaintext leak the moment any audio asset is marked sensitivity:'sensitive'.
                snippet={
                  canViewSensitive(viewer) || a.sensitivity !== "sensitive"
                    ? a.transcription
                    : undefined
                }
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
