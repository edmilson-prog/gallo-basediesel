// src/features/quick-send/components/library-admin/AssetPreviewDialog.tsx
//
// Lightbox dialog for previewing an IAssetLibraryItem by type.
//
// Design rules:
// - URL is re-resolved on every open (signed URLs ~5 min) — never cached across opens.
// - Never imports useResolvedMediaUrl (coupled to the messages provider).
// - Data only via useAssetLibraryAdmin().resolvePreviewUrl.
// - All user-facing copy via QUICK_SEND_STRINGS.library.

import { useEffect, useState } from "react";
import type { IAssetLibraryItem } from "@/shared/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { isSensitiveAsset } from "../../engine/assetSensitivity";
import { useAssetLibraryAdmin } from "../../hooks/useAssetLibraryAdmin";
import { QUICK_SEND_STRINGS } from "../../i18n/pt-BR";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface IAssetPreviewDialogProps {
  open: boolean;
  item: IAssetLibraryItem | null;
  onOpenChange: (open: boolean) => void;
}

interface IResolveState {
  url: string | null;
  loading: boolean;
  error: boolean;
}

const INITIAL_STATE: IResolveState = { url: null, loading: false, error: false };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Icon per kind — used in metadata aside and fallback areas. */
const KIND_ICON: Record<IAssetLibraryItem["kind"], string> = {
  document: "mdi:file-document-outline",
  video: "mdi:play-circle-outline",
  image: "mdi:image-outline",
  link: "mdi:link-variant",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Large lightbox dialog that previews an asset by kind:
 * - image → <img> (object-contain)
 * - video → <video controls>
 * - document (PDF) → <iframe> embed + fallback "Abrir" button
 * - link → card with URL + "Abrir link" button
 *
 * The signed URL is re-resolved each time the dialog opens; it is NOT cached
 * across opens so that short-lived URLs stay fresh.
 */
export function AssetPreviewDialog({ open, item, onOpenChange }: IAssetPreviewDialogProps) {
  const s = QUICK_SEND_STRINGS.library;
  const { resolvePreviewUrl } = useAssetLibraryAdmin();
  const [state, setState] = useState<IResolveState>(INITIAL_STATE);

  // Resolve the URL whenever the dialog opens or the item changes while open.
  // Reset state immediately so stale content is never shown.
  useEffect(() => {
    if (!open || !item) {
      setState(INITIAL_STATE);
      return;
    }

    // Avoid resolving for link kind (item.url is the URL directly)
    if (item.kind === "link") {
      setState({ url: item.url ?? null, loading: false, error: false });
      return;
    }

    let cancelled = false;
    setState({ url: null, loading: true, error: false });

    resolvePreviewUrl(item)
      .then((url) => {
        if (!cancelled) {
          setState({ url, loading: false, error: false });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setState({ url: null, loading: false, error: true });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [open, item, resolvePreviewUrl]);

  const sensitive = item ? isSensitiveAsset(item) : false;
  const { url, loading } = state;
  // Treat null url (mock/no bytes) as unavailable preview, not an error
  const previewUnavailable = !loading && url === null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "flex max-h-[92dvh] w-[min(92vw,1100px)] max-w-none flex-col gap-0 overflow-hidden p-0",
        )}
        aria-label={item ? `${s.preview}: ${item.title}` : s.preview}
      >
        {/* Header */}
        <DialogHeader className="shrink-0 border-b border-border px-5 py-3">
          <DialogTitle className="flex items-center gap-2 truncate text-base">
            {item && (
              <Icon
                icon={KIND_ICON[item.kind]}
                size={18}
                className="shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
            )}
            <span className="truncate">{item?.title ?? s.preview}</span>
          </DialogTitle>
        </DialogHeader>

        {/* Body — two-column layout: preview area + metadata aside */}
        <div className="flex min-h-0 flex-1 overflow-hidden">
          {/* ------------ Preview area ------------ */}
          <div className="relative flex min-h-0 flex-1 items-center justify-center bg-muted/40 p-4">
            {loading && (
              <div
                className="flex h-full w-full flex-col items-center justify-center gap-3"
                aria-busy="true"
                aria-label="Carregando pré-visualização"
              >
                <Skeleton className="h-64 w-full rounded-md" />
                <Skeleton className="h-4 w-48 rounded" />
              </div>
            )}

            {!loading && previewUnavailable && (
              <PreviewUnavailable item={item} />
            )}

            {!loading && !previewUnavailable && item && url && (
              <PreviewContent item={item} url={url} />
            )}
          </div>

          {/* ------------ Metadata aside ------------ */}
          {item && (
            <aside
              className="flex w-52 shrink-0 flex-col gap-3 overflow-y-auto border-l border-border bg-card px-4 py-4 text-sm"
              aria-label="Metadados do ativo"
            >
              <MetadataSection item={item} sensitive={sensitive} />
            </aside>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Renders the actual preview content for a resolved URL by item.kind. */
function PreviewContent({ item, url }: { item: IAssetLibraryItem; url: string }) {
  const s = QUICK_SEND_STRINGS.library;

  switch (item.kind) {
    case "image":
      return (
        <img
          src={url}
          alt={item.title}
          className="max-h-full max-w-full rounded object-contain"
        />
      );

    case "video":
      return (
        <video
          src={url}
          controls
          className="max-h-full max-w-full rounded"
          aria-label={item.title}
        />
      );

    case "document":
      return (
        <div className="flex h-full w-full flex-col gap-2">
          <iframe
            src={url}
            title={item.title}
            className="h-full min-h-[400px] w-full rounded border border-border bg-background"
            aria-label={item.title}
          />
          <div className="flex shrink-0 justify-end">
            <Button
              variant="outline"
              size="sm"
              asChild
            >
              <a href={url} target="_blank" rel="noopener noreferrer" aria-label={`${s.openInNewTab}: ${item.title}`}>
                <Icon icon="mdi:open-in-new" size={14} className="mr-1.5" aria-hidden="true" />
                {s.openInNewTab}
              </a>
            </Button>
          </div>
        </div>
      );

    case "link":
      // For link kind, url === item.url
      return (
        <div className="flex flex-col items-center gap-4 rounded-lg border border-border bg-card p-6 text-center">
          <Icon icon="mdi:link-variant" size={40} className="text-primary" aria-hidden="true" />
          <p className="max-w-xs break-all text-sm text-muted-foreground">{url}</p>
          <Button asChild>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`${s.openLink}: ${item.title}`}
            >
              <Icon icon="mdi:open-in-new" size={14} className="mr-1.5" aria-hidden="true" />
              {s.openLink}
            </a>
          </Button>
        </div>
      );

    default:
      return null;
  }
}

/** Shown when the URL could not be resolved (mock mode or failure). */
function PreviewUnavailable({ item }: { item: IAssetLibraryItem | null }) {
  const s = QUICK_SEND_STRINGS.library;
  // Fallback open target: item.url for link kind; otherwise undefined
  const fallbackUrl = item?.kind === "link" ? item.url : undefined;

  return (
    <div className="flex flex-col items-center gap-4 text-center text-muted-foreground">
      <Icon icon="mdi:eye-off-outline" size={40} aria-hidden="true" />
      <p className="text-sm">{s.previewUnavailable}</p>
      {fallbackUrl && (
        <Button variant="outline" size="sm" asChild>
          <a href={fallbackUrl} target="_blank" rel="noopener noreferrer">
            <Icon icon="mdi:open-in-new" size={14} className="mr-1.5" aria-hidden="true" />
            {s.open}
          </a>
        </Button>
      )}
    </div>
  );
}

/** Metadata sidebar content. */
function MetadataSection({
  item,
  sensitive,
}: {
  item: IAssetLibraryItem;
  sensitive: boolean;
}) {
  const s = QUICK_SEND_STRINGS.library;

  return (
    <>
      {item.category && (
        <MetaRow label={s.metaCategory} value={item.category} />
      )}
      {item.brand && (
        <MetaRow label={s.metaBrand} value={item.brand} />
      )}
      {item.productLine && (
        <MetaRow label={s.metaLine} value={item.productLine} />
      )}
      <MetaRow label={s.version} value={`v${item.version}`} mono />
      {sensitive && (
        <div className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
          <Icon icon="mdi:lock-outline" size={13} aria-hidden="true" />
          <span className="text-xs font-medium">{s.sensitive}</span>
        </div>
      )}
    </>
  );
}

function MetaRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <Badge
        variant="secondary"
        className={cn("w-fit max-w-full truncate px-1.5 py-0 text-xs font-normal", mono && "font-mono")}
      >
        {value}
      </Badge>
    </div>
  );
}
