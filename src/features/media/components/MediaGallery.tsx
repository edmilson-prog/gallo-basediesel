// src/features/media/components/MediaGallery.tsx
import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import type { IMediaAsset, IMediaClassification } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/features/auth/useAuth";
import { Can } from "@/features/rbac/components/Can";
import { canViewSensitive } from "../engine/sensitiveAccess";
import { applyMediaFilters } from "../engine/mediaFiltering";
import { mediaCounterLabel } from "../utils/mediaDisplay";
import { useMediaViewMode } from "../hooks/useMediaViewMode";
import { useMediaFilters, type MediaFilterScope } from "../hooks/useMediaFilters";
import { useMediaActions } from "../hooks/useMediaActions";
import { MediaFilters } from "./MediaFilters";
import { MediaGrid } from "./MediaGrid";
import { MediaCardTile } from "./MediaCardTile";
import { MediaTypeGroups } from "./MediaTypeGroups";
import { MediaLightbox } from "./MediaLightbox";
import { MediaAnnotator } from "./MediaAnnotator";
import { SensitiveLock } from "./SensitiveLock";
import { MEDIA_STRINGS } from "../i18n/pt-BR";

interface IMediaGalleryProps {
  scope: MediaFilterScope;
  assets: IMediaAsset[];
  isLoading: boolean;
  isError: boolean;
  onRetryLoad: () => void;
  /** Grid columns for this scope (3 in drawer; 2..6 responsive for customer). */
  columns: number;
}

export function MediaGallery({
  scope,
  assets,
  isLoading,
  isError,
  onRetryLoad,
  columns,
}: IMediaGalleryProps) {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useMediaViewMode();
  const filtersApi = useMediaFilters(scope);
  const actions = useMediaActions();
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [annotating, setAnnotating] = useState<IMediaAsset | null>(null);
  const [classifying, setClassifying] = useState<IMediaAsset | null>(null);
  const [linking, setLinking] = useState<IMediaAsset | null>(null);
  const [pendingDelete, setPendingDelete] = useState<IMediaAsset | null>(null);
  const g = MEDIA_STRINGS.gallery;

  const filtered = useMemo(() => {
    // Map the period preset to a `from` ISO BEFORE filtering — applyMediaFilters
    // uses from?/to? (NOT a period enum); passing `period` is an excess-property error.
    const days =
      filtersApi.filters.period === "7d"
        ? 7
        : filtersApi.filters.period === "30d"
          ? 30
          : filtersApi.filters.period === "90d"
            ? 90
            : null;
    const from =
      days === null ? undefined : new Date(Date.now() - days * 86_400_000).toISOString();
    return applyMediaFilters(assets, {
      search: filtersApi.filters.search,
      kind: filtersApi.filters.kind === "all" ? undefined : filtersApi.filters.kind,
      authorType: filtersApi.filters.authorType === "all" ? undefined : filtersApi.filters.authorType,
      from,
      classification:
        scope === "customer" && filtersApi.filters.classification !== "all"
          ? (filtersApi.filters.classification as IMediaClassification)
          : undefined,
    });
  }, [assets, filtersApi.filters, scope]);

  // canViewSensitive takes ONE arg (the viewer) — role-based gate (contract).
  const isLocked = (a: IMediaAsset) =>
    a.sensitivity === "sensitive" && !canViewSensitive(currentUser);

  const renderLockedOverlay = (a: IMediaAsset) => (
    <SensitiveLock variant="tile" onAttempt={() => actions.auditSensitiveAttempt(a, "view")} />
  );

  const openLightbox = (asset: IMediaAsset) => {
    const idx = filtered.findIndex((x) => x.id === asset.id);
    if (idx >= 0) setLightboxIndex(idx);
    if (asset.sensitivity === "sensitive") {
      if (canViewSensitive(currentUser)) actions.auditSensitiveAccess(asset, "open");
      else actions.auditSensitiveAttempt(asset, "open");
    }
  };

  const openConversation = (asset: IMediaAsset) => {
    if (!asset.conversationId) return;
    void navigate({ to: "/app/atendimento/$id", params: { id: asset.conversationId } });
    setLightboxIndex(null);
  };

  const renderActions = (asset: IMediaAsset) => {
    const suggestion = actions.suggestClassification(asset);
    const suggestionLabel = MEDIA_STRINGS.filters.classification[suggestion];
    return (
      <div className="flex flex-col gap-2">
        {/* Assisted classify: preselect the engine suggestion (spec §3.3) — not a hardcoded 'outro'. */}
        <Can resource="media" action="edit">
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground">
              {MEDIA_STRINGS.actions.suggestedClassification(suggestionLabel)}
            </span>
            <Button
              variant="secondary"
              size="sm"
              className="h-7 gap-1"
              onClick={() => void actions.setClassification(asset, suggestion)}
            >
              <Icon icon="mdi:auto-fix" size={13} />
              {MEDIA_STRINGS.actions.applySuggestion}
            </Button>
          </div>
        </Can>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setAnnotating(asset)}>
            <Icon icon="mdi:pencil-outline" size={14} className="mr-1" />
            {MEDIA_STRINGS.actions.annotate}
          </Button>
          <Can resource="media" action="edit">
            <Button variant="outline" size="sm" onClick={() => setClassifying(asset)}>
              <Icon icon="mdi:tag-outline" size={14} className="mr-1" />
              {MEDIA_STRINGS.actions.classify}
            </Button>
          </Can>
          {/* Link picker (vehicle/order/part) with explicit confirmation + audit (spec §3.3/Fase 4). */}
          <Can resource="media" action="edit">
            <Button variant="outline" size="sm" onClick={() => setLinking(asset)}>
              <Icon icon="mdi:link-variant" size={14} className="mr-1" />
              {MEDIA_STRINGS.actions.link}
            </Button>
          </Can>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              actions.auditSensitiveAccess(asset, "download");
            }}
          >
            <Icon icon="mdi:download" size={14} className="mr-1" />
            {MEDIA_STRINGS.actions.download}
          </Button>
          <Can resource="media" action="delete">
            <Button
              variant="outline"
              size="sm"
              className="text-severity-critical"
              onClick={() => setPendingDelete(asset)}
            >
              <Icon icon="mdi:trash-can-outline" size={14} className="mr-1" />
              {MEDIA_STRINGS.actions.delete}
            </Button>
          </Can>
        </div>
      </div>
    );
  };

  // ---- error state ----
  if (isError) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
        <Icon icon="mdi:alert-circle-outline" size={28} className="text-severity-critical" />
        <p className="text-sm text-foreground">{g.loadError}</p>
        <Button variant="outline" size="sm" onClick={onRetryLoad}>
          {g.retry}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border bg-card px-3 py-2">
        <h2 className="text-sm font-semibold text-foreground">{g.title}</h2>
      </div>

      {/* Counters — aria-live so screen readers announce filter changes.
          Suppressed while loading to avoid announcing an inaccurate zero count
          simultaneously with the loading spinner (spec coherence + a11y). */}
      <p className="px-3 pt-2 text-xs text-muted-foreground" aria-live="polite">
        {isLoading ? null : mediaCounterLabel(filtered)}
      </p>

      {/* Filters + view switcher */}
      <MediaFilters filtersApi={filtersApi} viewMode={viewMode} onViewModeChange={setViewMode} />

      {/* Body — switches by view mode */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {isLoading ? (
          <div
            className="flex h-full items-center justify-center text-xs text-muted-foreground"
            aria-busy="true"
          >
            <Icon icon="mdi:loading" className="mr-2 animate-spin" size={16} />
            {g.loading}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-muted-foreground">
            <Icon icon="mdi:image-off-outline" size={28} />
            <p className="text-sm">{assets.length === 0 ? g.empty : g.emptyFiltered}</p>
          </div>
        ) : viewMode === "grade" ? (
          <MediaGrid
            assets={filtered}
            columns={columns}
            viewer={currentUser}
            onOpen={openLightbox}
            onRetry={(a) => void actions.retryPersist(a)}
            isLocked={isLocked}
            renderLockedOverlay={renderLockedOverlay}
          />
        ) : viewMode === "cartoes" ? (
          // role="list" (not role="grid") because we do not implement the roving-tabindex /
          // arrow-key navigation contract required by role="grid". Each MediaCardTile button
          // remains independently Tab-focusable, matching the <ul>/<li> list semantic.
          <ul
            className="flex flex-col gap-2 p-3 list-none"
            aria-label={g.title}
          >
            {Array.from({ length: Math.ceil(filtered.length / 2) }, (_, r) => (
              <li
                key={r}
                role="listitem"
                className="grid gap-2"
                style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}
              >
                {filtered.slice(r * 2, r * 2 + 2).map((a) => (
                  <MediaCardTile
                    key={a.id}
                    asset={a}
                    onOpen={() => openLightbox(a)}
                    lockedOverlay={isLocked(a) ? renderLockedOverlay(a) : undefined}
                  />
                ))}
              </li>
            ))}
          </ul>
        ) : (
          <MediaTypeGroups
            assets={filtered}
            columns={columns}
            viewer={currentUser}
            onOpen={openLightbox}
            onRetry={(a) => void actions.retryPersist(a)}
            isLocked={isLocked}
            renderLockedOverlay={renderLockedOverlay}
          />
        )}
      </div>

      {/* Lightbox */}
      <MediaLightbox
        assets={filtered}
        index={lightboxIndex}
        onIndexChange={setLightboxIndex}
        canView={(a) => a.sensitivity !== "sensitive" || canViewSensitive(currentUser)}
        renderActions={renderActions}
        onSensitiveAttempt={(a) => actions.auditSensitiveAttempt(a, "open")}
        onOpenConversation={scope === "customer" ? openConversation : undefined}
        searchTerm={filtersApi.filters.search}
      />

      {/* Annotator dialog */}
      {annotating && currentUser && (
        <AlertDialog open onOpenChange={(o) => !o && setAnnotating(null)}>
          <AlertDialogContent className="max-w-2xl">
            <AlertDialogHeader>
              <AlertDialogTitle>{MEDIA_STRINGS.actions.annotate}</AlertDialogTitle>
            </AlertDialogHeader>
            <div className="h-[420px]">
              <MediaAnnotator
                asset={annotating}
                currentUserId={currentUser.id}
                onClose={() => setAnnotating(null)}
              />
            </div>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {/* Classify picker — suggestion preselected; user confirms (spec §3.3). */}
      {classifying && (
        <AlertDialog open onOpenChange={(o) => !o && setClassifying(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{MEDIA_STRINGS.actions.classify}</AlertDialogTitle>
              <AlertDialogDescription>
                {MEDIA_STRINGS.actions.suggestedClassification(
                  MEDIA_STRINGS.filters.classification[actions.suggestClassification(classifying)],
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(MEDIA_STRINGS.filters.classification) as IMediaClassification[]).map(
                (c) => (
                  <Button
                    key={c}
                    variant={
                      c === actions.suggestClassification(classifying) ? "secondary" : "outline"
                    }
                    size="sm"
                    onClick={() => {
                      void actions.setClassification(classifying, c);
                      setClassifying(null);
                    }}
                  >
                    {MEDIA_STRINGS.filters.classification[c]}
                  </Button>
                ),
              )}
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel>{MEDIA_STRINGS.actions.cancel}</AlertDialogCancel>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {/* Link picker — vehicle (PRD-016) / order / part (PRD-021), explicit confirm + audit (spec §3.3). */}
      {linking && (
        <AlertDialog open onOpenChange={(o) => !o && setLinking(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{MEDIA_STRINGS.actions.linkConfirmTitle}</AlertDialogTitle>
              <AlertDialogDescription>
                {MEDIA_STRINGS.actions.linkConfirmBody}
              </AlertDialogDescription>
            </AlertDialogHeader>
            {/* Fase 1 mock: pick the first suggested entity id; real entity search arrives in Fase 2. */}
            <div className="flex flex-col gap-2">
              <Button
                variant="outline"
                size="sm"
                className="justify-start gap-2"
                onClick={() => {
                  void actions.linkVehicle(linking, `veh-${linking.id}`);
                  setLinking(null);
                }}
              >
                <Icon icon="mdi:truck-outline" size={14} />
                {MEDIA_STRINGS.actions.linkVehicle}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="justify-start gap-2"
                onClick={() => {
                  void actions.linkOrder(linking, `ord-${linking.id}`);
                  setLinking(null);
                }}
              >
                <Icon icon="mdi:clipboard-list-outline" size={14} />
                {MEDIA_STRINGS.actions.linkOrder}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="justify-start gap-2"
                onClick={() => {
                  void actions.linkPart(linking, `prt-${linking.id}`);
                  setLinking(null);
                }}
              >
                <Icon icon="mdi:cog-outline" size={14} />
                {MEDIA_STRINGS.actions.linkPart}
              </Button>
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel>{MEDIA_STRINGS.actions.cancel}</AlertDialogCancel>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {/* Delete confirmation */}
      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(o) => !o && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{MEDIA_STRINGS.actions.deleteTitle}</AlertDialogTitle>
            <AlertDialogDescription>{MEDIA_STRINGS.actions.deleteBody}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{MEDIA_STRINGS.actions.cancel}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingDelete) void actions.remove(pendingDelete);
                setPendingDelete(null);
                setLightboxIndex(null);
              }}
            >
              {MEDIA_STRINGS.actions.deleteConfirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
