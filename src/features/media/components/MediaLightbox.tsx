// src/features/media/components/MediaLightbox.tsx
import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { IMediaAsset } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { formatBytes } from "../utils/mediaDisplay";
import { MediaAudioPlayer } from "./MediaAudioPlayer";
import { SensitiveLock } from "./SensitiveLock";
import { AnnotationLayer } from "./AnnotationLayer";
import { MEDIA_STRINGS } from "../i18n/pt-BR";

interface IMediaLightboxProps {
  assets: IMediaAsset[];
  index: number | null;
  onIndexChange: (i: number | null) => void;
  /** Whether the current user may view the active asset (false → blocked body). */
  canView: (asset: IMediaAsset) => boolean;
  /** Right-aside actions (Anotar/Classificar/Vincular/Baixar/Excluir), RBAC-gated by the gallery. */
  renderActions: (asset: IMediaAsset) => ReactNode;
  /**
   * Audited whenever a blocked sensitive asset becomes the active asset (open
   * or arrow-key navigation). Fired via effect keyed on `asset.id`, not only
   * on click, so every visualisation attempt is captured (spec §5.5 / D-6).
   */
  onSensitiveAttempt?: (asset: IMediaAsset) => void;
  /**
   * Navigate to the origin conversation (customer scope only). When provided
   * AND the asset has a conversationId, the aside renders an "Abrir conversa"
   * action (spec §5.3/D-12). The gallery wires this with TanStack Router navigate.
   */
  onOpenConversation?: (asset: IMediaAsset) => void;
  searchTerm?: string;
}

function isFormField(el: EventTarget | null): boolean {
  const node = el as HTMLElement | null;
  if (!node) return false;
  const tag = node.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || node.getAttribute("role") === "slider" || node.isContentEditable;
}

export function MediaLightbox({
  assets, index, onIndexChange, canView, renderActions, onSensitiveAttempt, onOpenConversation, searchTerm,
}: IMediaLightboxProps) {
  const open = index !== null;
  const asset = open ? assets[index] : null;
  const [zoom, setZoom] = useState(1);
  const [asideOpen, setAsideOpen] = useState(false);
  const audioToggle = useRef<(() => void) | null>(null);
  const l = MEDIA_STRINGS.lightbox;

  const go = useCallback((delta: number) => {
    if (index === null) return;
    const next = index + delta;
    if (next >= 0 && next < assets.length) { onIndexChange(next); setZoom(1); }
  }, [index, assets.length, onIndexChange]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (isFormField(e.target)) return;
      if (asideOpen) return;
      if (e.key === "ArrowRight") { e.preventDefault(); go(1); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); go(-1); }
      else if (e.key === "Escape") { onIndexChange(null); }
      else if (e.key === " ") { if (asset?.kind === "audio") { e.preventDefault(); audioToggle.current?.(); } }
      else if ((e.key === "+" || e.key === "=") && (asset?.kind === "image" || asset?.kind === "video")) { e.preventDefault(); setZoom((z) => Math.min(z + 0.25, 3)); }
      else if (e.key === "-" && (asset?.kind === "image" || asset?.kind === "video")) { e.preventDefault(); setZoom((z) => Math.max(z - 0.25, 1)); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, go, asset, onIndexChange, asideOpen]);

  // Audit when a blocked asset becomes active (open + navigate), not only on click
  // (spec §5.5 / D-6 — every sensitive visualisation attempt must be recorded).
  useEffect(() => {
    if (open && asset && !canView(asset)) {
      onSensitiveAttempt?.(asset);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, asset?.id]);

  if (!open || !asset) return null;
  const allowed = canView(asset);

  const Aside = (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-4">
      <h3 className="text-sm font-semibold text-foreground">{l.details}</h3>
      {allowed ? (
        <>
          <dl className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-1 text-xs">
            <dt className="text-muted-foreground">{l.meta.author}</dt>
            <dd className="text-foreground">{MEDIA_STRINGS.filters.author[asset.authorType]}</dd>
            <dt className="text-muted-foreground">{l.meta.date}</dt>
            <dd className="text-foreground">{new Date(asset.createdAt).toLocaleString("pt-BR")}</dd>
            <dt className="text-muted-foreground">{l.meta.size}</dt>
            <dd className="text-foreground">{formatBytes(asset.sizeBytes)}</dd>
            <dt className="text-muted-foreground">{l.meta.classification}</dt>
            <dd>
              <span className={cn(
                "rounded-full border px-2 py-0.5 text-[11px]",
                asset.sensitivity === "sensitive"
                  ? "border-severity-warning/30 bg-severity-warning/15 text-severity-warning"
                  : "border-border bg-muted text-muted-foreground",
              )}>
                {asset.classification ? MEDIA_STRINGS.filters.classification[asset.classification] : "—"}
              </span>
            </dd>
          </dl>
          {/* Vínculos — Pedido / Peça / Veículo read-back (spec §5.4 / i18n: lightbox.meta.links) */}
          <div className="border-t border-border pt-3">
            <h4 className="mb-1.5 text-xs font-medium text-muted-foreground">{l.meta.links}</h4>
            {asset.linkedOrderId || asset.linkedPartId || asset.linkedVehicleId ? (
              <dl className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-1 text-xs">
                {asset.linkedOrderId && (
                  <>
                    <dt className="text-muted-foreground">Pedido</dt>
                    <dd className="truncate text-foreground">{asset.linkedOrderId}</dd>
                  </>
                )}
                {asset.linkedPartId && (
                  <>
                    <dt className="text-muted-foreground">Peça</dt>
                    <dd className="truncate text-foreground">{asset.linkedPartId}</dd>
                  </>
                )}
                {asset.linkedVehicleId && (
                  <>
                    <dt className="text-muted-foreground">Veículo</dt>
                    <dd className="truncate text-foreground">{asset.linkedVehicleId}</dd>
                  </>
                )}
              </dl>
            ) : (
              <p className="text-xs text-muted-foreground">{l.noLinks}</p>
            )}
          </div>
          {/* "Abrir conversa" — customer scope, origin conversation (spec §5.3/D-12) */}
          {onOpenConversation && asset.conversationId && (
            <Button
              variant="outline"
              size="sm"
              className="w-fit gap-1"
              onClick={() => onOpenConversation(asset)}
            >
              <Icon icon="mdi:message-text-outline" size={14} />
              {l.openConversation}
            </Button>
          )}
          <div className="border-t border-border pt-3">{renderActions(asset)}</div>
        </>
      ) : (
        <p className="text-xs text-muted-foreground">{MEDIA_STRINGS.sensitive.caption}</p>
      )}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onIndexChange(null)}>
      <DialogContent
        className="h-[100dvh] w-screen max-w-none gap-0 border-0 bg-background/98 p-0 sm:rounded-none"
        // Surface the implemented keymap for assistive technology (spec §7).
        aria-keyshortcuts="ArrowLeft ArrowRight Escape Space Equal Minus"
      >
        <DialogTitle className="sr-only">{asset.fileName ?? "Mídia"}</DialogTitle>
        <div className="flex h-full min-h-0 flex-col lg:flex-row">
          {/* center */}
          <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden">
            {/* The built-in shadcn DialogContent close 'X' lives at absolute right-4 top-4
                (dialog.tsx line 47). No second close button is rendered here. */}
            <span className="absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-full bg-card/80 px-3 py-1 text-[11px] text-muted-foreground">
              {l.counter(index + 1, assets.length)}
            </span>

            {index > 0 && (
              <Button variant="ghost" size="icon" className="absolute left-3 top-1/2 z-10 -translate-y-1/2"
                      aria-label={l.prev} onClick={() => go(-1)}>
                <Icon icon="mdi:chevron-left" size={28} />
              </Button>
            )}
            {index < assets.length - 1 && (
              <Button variant="ghost" size="icon" className="absolute right-3 top-1/2 z-10 -translate-y-1/2"
                      aria-label={l.next} onClick={() => go(1)}>
                <Icon icon="mdi:chevron-right" size={28} />
              </Button>
            )}

            {!allowed ? (
              // Audit is fired by the effect keyed on asset.id (open + navigate),
              // so no onClickCapture duplicate is needed here.
              <div className="relative h-full w-full">
                <SensitiveLock variant="full" />
              </div>
            ) : asset.kind === "image" || asset.kind === "video" ? (
              <>
                <div
                  className="relative flex h-full w-full items-center justify-center bg-muted/40 text-muted-foreground"
                  style={{ transform: `scale(${zoom})` }}
                >
                  {/* Fase 1: placeholder thumbnail (no real bytes). */}
                  <Icon icon="mdi:image-outline" size={72} aria-hidden />
                  {/* read-only annotation read-back over the image (spec §5.7) */}
                  {asset.annotations && asset.annotations.length > 0 && (
                    <AnnotationLayer annotations={asset.annotations} className="absolute inset-0" />
                  )}
                </div>
                <div className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 gap-1 rounded-full bg-card/80 p-1">
                  <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={l.zoomOut}
                          onClick={() => setZoom((z) => Math.max(z - 0.25, 1))}>
                    <Icon icon="mdi:magnify-minus-outline" size={18} />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={l.zoomIn}
                          onClick={() => setZoom((z) => Math.min(z + 0.25, 3))}>
                    <Icon icon="mdi:magnify-plus-outline" size={18} />
                  </Button>
                </div>
              </>
            ) : asset.kind === "audio" ? (
              <div className="w-full max-w-xl px-6">
                <MediaAudioPlayer
                  asset={asset}
                  searchTerm={searchTerm}
                  registerToggle={(t) => { audioToggle.current = t; }}
                />
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 text-muted-foreground">
                <Icon icon="mdi:file-document-outline" size={64} aria-hidden />
                <p className="text-sm text-foreground">{asset.fileName ?? "—"}</p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm"><Icon icon="mdi:open-in-new" size={15} className="mr-1" />{l.openDoc}</Button>
                  <Button variant="secondary" size="sm"><Icon icon="mdi:download" size={15} className="mr-1" />{l.downloadDoc}</Button>
                </div>
              </div>
            )}

            {/* mobile: open aside as bottom sheet (D-12) */}
            <Button
              variant="secondary" size="sm"
              className="absolute bottom-3 right-3 z-10 lg:hidden"
              onClick={() => setAsideOpen(true)}
            >
              <Icon icon="mdi:information-outline" size={15} className="mr-1" />
              {l.details}
            </Button>
          </div>

          {/* desktop aside */}
          <aside className="hidden w-80 shrink-0 border-l border-border bg-card lg:block">{Aside}</aside>
        </div>

        {/* mobile bottom sheet */}
        <Sheet open={asideOpen} onOpenChange={setAsideOpen}>
          <SheetContent side="bottom" className="max-h-[70vh] p-0 lg:hidden">
            <SheetHeader className="sr-only"><SheetTitle>{l.details}</SheetTitle></SheetHeader>
            {Aside}
          </SheetContent>
        </Sheet>
      </DialogContent>
    </Dialog>
  );
}
