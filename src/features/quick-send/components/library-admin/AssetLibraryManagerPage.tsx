// src/features/quick-send/components/library-admin/AssetLibraryManagerPage.tsx
//
// Full management screen for the Asset Library (P1 — PRD-027 §4.1 / §4.6).
// Composes: AssetLibraryFilters, AssetManageCard, AssetFormSheet, AssetPreviewDialog.
// Data: useAssetLibrary (read) + useAssetLibraryAdmin (mutations).
// Copy: all user-facing text via QUICK_SEND_STRINGS.library — no hardcoded strings.

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type { IAssetLibraryItem } from "@/shared/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
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
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { useDebounce } from "@/shared/hooks/useDebounce";
import { useAssetLibrary } from "../../hooks/useAssetLibrary";
import { useAssetLibraryAdmin } from "../../hooks/useAssetLibraryAdmin";
import { filterAssets } from "../../engine/assetFiltering";
import { QUICK_SEND_STRINGS } from "../../i18n/pt-BR";
import type { IAssetLibraryFiltersValue } from "./AssetLibraryFilters";
import { AssetLibraryFilters } from "./AssetLibraryFilters";
import { AssetManageCard } from "./AssetManageCard";
import type { AssetFormMode } from "./AssetFormSheet";
import { AssetFormSheet } from "./AssetFormSheet";
import { AssetPreviewDialog } from "./AssetPreviewDialog";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface IFormSheetState {
  open: boolean;
  mode: AssetFormMode;
  asset?: IAssetLibraryItem;
}

interface IDeleteState {
  open: boolean;
  item: IAssetLibraryItem | null;
}

// ---------------------------------------------------------------------------
// Skeleton grid for loading state
// ---------------------------------------------------------------------------

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className="overflow-hidden rounded-lg border border-border bg-card"
        >
          <Skeleton className="aspect-video w-full" />
          <div className="space-y-1.5 p-2">
            <Skeleton className="h-3 w-3/4" />
            <Skeleton className="h-2.5 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

/**
 * Asset Library management screen (P1). Renders section header, a sticky
 * action bar (dynamic-width search + "Novo ativo" button), filter bar,
 * and a responsive grid of AssetManageCard items.
 *
 * Filter reconciliation:
 *   - category / brand / productLine / query → forwarded to the provider
 *     via `useAssetLibrary` (server-side, single TanStack Query path).
 *   - status / sensitiveOnly → applied CLIENT-SIDE via `filterAssets` after the query
 *     result arrives (the provider interface does not expose a `status` or `sensitiveOnly`
 *     parameter), bounded by the hook's `pageSize: 200` cap.
 * This avoids a secondary manual-refresh state that could desync with the query.
 */
export function AssetLibraryManagerPage() {
  const s = QUICK_SEND_STRINGS.library;
  const e = QUICK_SEND_STRINGS.errors;

  // ── Local UI state ────────────────────────────────────────────────────────

  // Raw (unthrottled) search string controlled by the input
  const [rawQuery, setRawQuery] = useState("");
  // 300 ms debounced value forwarded to the provider
  const debouncedQuery = useDebounce(rawQuery, 300);

  const [filters, setFilters] = useState<IAssetLibraryFiltersValue>({});

  // Search input focus state — drives max-w transition (CatalogHeader pattern)
  const [searchFocused, setSearchFocused] = useState(false);
  const searchRef = useRef<HTMLInputElement | null>(null);

  // "/" shortcut focuses the search field (same as CatalogHeader)
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key !== "/" || e.defaultPrevented) return;
      const target = e.target as HTMLElement | null;
      const isEditable =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable === true;
      if (isEditable) return;
      e.preventDefault();
      searchRef.current?.focus();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  // ── Form sheet state ──────────────────────────────────────────────────────

  const [formSheet, setFormSheet] = useState<IFormSheetState>({
    open: false,
    mode: "create",
  });

  function openCreate() {
    setFormSheet({ open: true, mode: "create", asset: undefined });
  }

  function openEdit(item: IAssetLibraryItem) {
    setFormSheet({ open: true, mode: "edit", asset: item });
  }

  function openNewVersion(item: IAssetLibraryItem) {
    setFormSheet({ open: true, mode: "newVersion", asset: item });
  }

  // ── Preview dialog state ──────────────────────────────────────────────────

  const [previewItem, setPreviewItem] = useState<IAssetLibraryItem | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  function openPreview(item: IAssetLibraryItem) {
    setPreviewItem(item);
    setPreviewOpen(true);
  }

  // ── Delete confirmation state ─────────────────────────────────────────────

  const [deleteState, setDeleteState] = useState<IDeleteState>({
    open: false,
    item: null,
  });

  function requestDelete(item: IAssetLibraryItem) {
    setDeleteState({ open: true, item });
  }

  // ── Busy tracking for per-card operations ─────────────────────────────────

  const [busyId, setBusyId] = useState<string | null>(null);

  // ── Data ──────────────────────────────────────────────────────────────────

  // Build the provider filter from state.
  // IAssetFilter (used by useAssetLibrary) supports: category, brand, productLine, query.
  // It does NOT have status or sensitiveOnly — both are applied CLIENT-SIDE below.
  const providerFilter = useMemo(
    () => ({
      category: filters.category,
      brand: filters.brand,
      productLine: filters.productLine,
      query: debouncedQuery || undefined,
    }),
    [filters.category, filters.brand, filters.productLine, debouncedQuery],
  );

  const { items: rawItems, favorites, isLoading, isError, refetch, toggleFavorite } =
    useAssetLibrary(providerFilter);

  const { setPublished, setSensitive, deleteAsset } = useAssetLibraryAdmin();

  // Client-side passes: status filter + sensitiveOnly (single filter chain,
  // no secondary query path — avoids desync with the TanStack Query result).
  const items = useMemo(() => {
    let result = rawItems;
    if (filters.status) {
      result = result.filter((i) => i.status === filters.status);
    }
    if (filters.sensitiveOnly) {
      result = filterAssets(result, { sensitiveOnly: true });
    }
    return result;
  }, [rawItems, filters.status, filters.sensitiveOnly]);

  // Derive brand/productLine lists from loaded items (distinct, sorted)
  const brands = useMemo(
    () =>
      Array.from(
        new Set(rawItems.map((i) => i.brand).filter((b): b is string => Boolean(b))),
      ).sort(),
    [rawItems],
  );

  const productLines = useMemo(
    () =>
      Array.from(
        new Set(rawItems.map((i) => i.productLine).filter((l): l is string => Boolean(l))),
      ).sort(),
    [rawItems],
  );

  // Build favorite-id set for O(1) lookup in card props
  const favoriteIds = useMemo(() => new Set(favorites.map((f) => f.id)), [favorites]);

  // ── Mutation helpers ──────────────────────────────────────────────────────

  async function runMutation(id: string, op: () => Promise<unknown>, successMsg: string) {
    setBusyId(id);
    try {
      await op();
      toast.success(successMsg);
      refetch();
    } catch {
      toast.error(s.actionFailed);
    } finally {
      setBusyId(null);
    }
  }

  async function handleConfirmDelete() {
    const item = deleteState.item;
    if (!item) return;
    setDeleteState({ open: false, item: null });
    await runMutation(item.id, () => deleteAsset(item.id), s.deletedToast);
  }

  function handleTogglePublish(item: IAssetLibraryItem) {
    void runMutation(
      item.id,
      () => setPublished(item.id, item.status !== "published"),
      item.status === "published" ? s.unpublishedToast : s.publishedToast,
    );
  }

  function handleToggleSensitive(item: IAssetLibraryItem) {
    void runMutation(
      item.id,
      () => setSensitive(item.id, item.sensitivity !== "sensitive"),
      s.permissionUpdatedToast,
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Section header — inside SettingsLayout content, no full-bleed glass */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{s.managerTitle}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{s.managerDesc}</p>
      </div>

      {/* Sticky action bar: dynamic search + "Novo ativo" button */}
      <div className="sticky top-0 z-10 -mx-1 flex items-center gap-2 bg-background/90 px-1 py-2 backdrop-blur-sm">
        {/* Dynamic-width search (CatalogHeader pattern) */}
        <div
          className={cn(
            "relative flex-1 transition-[max-width] duration-300 ease-out motion-reduce:transition-none",
            searchFocused ? "max-w-2xl" : "max-w-sm",
          )}
        >
          <Icon
            icon="mdi:magnify"
            size={16}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            ref={searchRef}
            type="search"
            value={rawQuery}
            onChange={(e) => setRawQuery(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            onKeyDown={(e) => {
              if (e.key === "Escape") e.currentTarget.blur();
            }}
            placeholder={s.searchAssets}
            className="pl-8 pr-9"
            aria-label={s.searchAssets}
          />
          <kbd
            aria-hidden
            className={cn(
              "pointer-events-none absolute right-2 top-1/2 hidden h-5 min-w-5 -translate-y-1/2 items-center justify-center rounded border border-border bg-muted px-1.5 font-mono text-[10px] text-muted-foreground transition-opacity duration-200 sm:flex",
              searchFocused ? "opacity-0" : "opacity-100",
            )}
          >
            /
          </kbd>
        </div>

        {/* "Novo ativo" button */}
        <Button size="sm" className="shrink-0 cursor-pointer" onClick={openCreate}>
          <Icon icon="mdi:plus" size={16} aria-hidden />
          {s.newAsset}
        </Button>
      </div>

      {/* Filter bar */}
      <AssetLibraryFilters
        value={filters}
        brands={brands}
        productLines={productLines}
        onChange={setFilters}
      />

      {/* Grid / empty / loading / error */}
      {isError ? (
        <div role="alert" className="flex flex-col items-center gap-3 py-16 text-center">
          <Icon icon="mdi:alert-circle-outline" size={36} className="text-destructive" aria-hidden />
          <p className="text-sm text-destructive">{e.loadAssetFailed}</p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            {s.retryAction}
          </Button>
        </div>
      ) : isLoading ? (
        <SkeletonGrid />
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center gap-4 py-16 text-center">
          <Icon
            icon="mdi:folder-open-outline"
            size={40}
            className="text-muted-foreground"
            aria-hidden
          />
          <p className="text-sm text-muted-foreground">{s.assetsEmpty}</p>
          <Button size="sm" className="cursor-pointer" onClick={openCreate}>
            <Icon icon="mdi:plus" size={16} aria-hidden />
            {s.newAsset}
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
          {items.map((item) => (
            <AssetManageCard
              key={item.id}
              item={item}
              isFavorite={favoriteIds.has(item.id)}
              busy={busyId === item.id}
              onPreview={() => openPreview(item)}
              onEdit={() => openEdit(item)}
              onNewVersion={() => openNewVersion(item)}
              onTogglePublish={() => handleTogglePublish(item)}
              onToggleSensitive={() => handleToggleSensitive(item)}
              onDelete={() => requestDelete(item)}
              onToggleFavorite={() => toggleFavorite(item.id)}
            />
          ))}
        </div>
      )}

      {/* Create / edit / newVersion sheet */}
      <AssetFormSheet
        open={formSheet.open}
        mode={formSheet.mode}
        asset={formSheet.asset}
        onOpenChange={(open) => setFormSheet((prev) => ({ ...prev, open }))}
        onSaved={() => {
          setFormSheet((prev) => ({ ...prev, open: false }));
          refetch();
        }}
      />

      {/* Preview dialog */}
      <AssetPreviewDialog
        open={previewOpen}
        item={previewItem}
        onOpenChange={(open) => {
          setPreviewOpen(open);
          if (!open) setPreviewItem(null);
        }}
      />

      {/* Delete confirmation */}
      <AlertDialog
        open={deleteState.open}
        onOpenChange={(open) => {
          if (!open) setDeleteState({ open: false, item: null });
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{s.deleteAssetTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteState.item ? s.deleteAssetDesc(deleteState.item.title) : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{s.cancel}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void handleConfirmDelete()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {s.confirmDelete}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
