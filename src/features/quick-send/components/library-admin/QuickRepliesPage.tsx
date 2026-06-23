// src/features/quick-send/components/library-admin/QuickRepliesPage.tsx
//
// Quick Replies management screen (P2 — PRD-027 §5).
// Two tabs: "Minhas" (private) / "Da loja" (shared).
// Desktop: list left + editor right. Mobile: editor in a Sheet.
// Data: useQuickReplyAdmin only — no direct provider / mock imports.
// Copy: all user-facing text via QUICK_SEND_STRINGS.quickReplies.

import { useMemo, useRef, useEffect, useState } from "react";
import { toast } from "sonner";
import type { IQuickReply } from "@/shared/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from "@/components/ui/sheet";
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
import { useQuickReplyAdmin } from "../../hooks/useQuickReplyAdmin";
import { QuickReplyEditor } from "./QuickReplyEditor";
import { QUICK_SEND_STRINGS } from "../../i18n/pt-BR";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TabKey = "mine" | "store";

interface IEditorState {
  /** null = create mode; IQuickReply = edit mode */
  item: IQuickReply | null;
  scope: "private" | "shared";
}

// ---------------------------------------------------------------------------
// Skeleton list (loading state)
// ---------------------------------------------------------------------------

function SkeletonList() {
  return (
    <ul className="divide-y divide-border rounded-lg border border-border">
      {Array.from({ length: 4 }).map((_, i) => (
        <li key={i} className="flex items-start gap-3 px-4 py-3">
          <Skeleton className="h-5 w-20 rounded" />
          <div className="flex-1 space-y-1">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-full max-w-xs" />
          </div>
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Single quick-reply list row
// ---------------------------------------------------------------------------

interface IReplyRowProps {
  item: IQuickReply;
  canEdit: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onDuplicate?: () => void;
  isSelected: boolean;
  onSelect?: () => void;
}

function ReplyRow({
  item,
  canEdit,
  onEdit,
  onDelete,
  onDuplicate,
  isSelected,
  onSelect,
}: IReplyRowProps) {
  const s = QUICK_SEND_STRINGS.quickReplies;
  return (
    <li
      className={cn(
        "flex items-start justify-between gap-3 px-4 py-3 transition-colors",
        isSelected ? "bg-accent" : "hover:bg-accent/40",
      )}
    >
      {/* Left: shortcut + title + body preview */}
      {onSelect ? (
        <button
          type="button"
          className="min-w-0 flex-1 cursor-pointer text-left"
          onClick={onSelect}
          aria-pressed={isSelected}
          aria-label={`${item.title} — ${item.shortcut}`}
        >
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="shrink-0 font-mono text-[11px]">
              {item.shortcut}
            </Badge>
            <span className="truncate text-sm font-medium text-foreground">{item.title}</span>
          </div>
          <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{item.body}</p>
        </button>
      ) : (
        <div className="min-w-0 flex-1 text-left">
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="shrink-0 font-mono text-[11px]">
              {item.shortcut}
            </Badge>
            <span className="truncate text-sm font-medium text-foreground">{item.title}</span>
          </div>
          <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{item.body}</p>
        </div>
      )}

      {/* Right: action buttons */}
      <div className="flex shrink-0 items-center gap-0.5">
        {canEdit ? (
          <>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 cursor-pointer p-0"
              aria-label={s.edit}
              onClick={onEdit}
            >
              <Icon icon="mdi:pencil-outline" size={15} aria-hidden />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 cursor-pointer p-0 text-destructive hover:text-destructive"
              aria-label={s.delete}
              onClick={onDelete}
            >
              <Icon icon="mdi:trash-can-outline" size={15} aria-hidden />
            </Button>
          </>
        ) : (
          <>
            {/* Lock icon for non-editable store items */}
            <Icon
              icon="mdi:lock-outline"
              size={14}
              className="mr-1 text-muted-foreground"
              aria-hidden
            />
            {onDuplicate && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 cursor-pointer gap-1 px-2 text-xs"
                aria-label={s.duplicate}
                onClick={onDuplicate}
              >
                <Icon icon="mdi:content-copy" size={13} aria-hidden />
                {s.duplicate}
              </Button>
            )}
          </>
        )}
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Editor panel (desktop inline / mobile Sheet)
// ---------------------------------------------------------------------------

interface IEditorPanelProps {
  editorState: IEditorState | null;
  existingShortcuts: string[];
  onSubmit: (v: { shortcut: string; title: string; body: string }) => Promise<void>;
  onCancel: () => void;
}

function EditorPanel({
  editorState,
  existingShortcuts,
  onSubmit,
  onCancel,
}: IEditorPanelProps) {
  const s = QUICK_SEND_STRINGS.quickReplies;
  if (!editorState) return null;

  const isEdit = editorState.item !== null;
  const submitLabel = isEdit ? s.save : s.create;

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <p className="mb-4 text-sm font-semibold text-foreground">
        {isEdit
          ? QUICK_SEND_STRINGS.library.snippetEditTitle
          : QUICK_SEND_STRINGS.library.snippetNewTitle}
      </p>
      <QuickReplyEditor
        key={editorState.item?.id ?? "new"}
        initial={
          editorState.item
            ? {
                shortcut: editorState.item.shortcut,
                title: editorState.item.title,
                body: editorState.item.body,
              }
            : undefined
        }
        onSubmit={onSubmit}
        onCancel={onCancel}
        existingShortcuts={existingShortcuts}
        submitLabel={submitLabel}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

/**
 * Quick Replies management screen. Renders inside SettingsLayout content area
 * (no glass header / ScrollProgressBar — SettingsLayout provides the scaffold).
 *
 * Two tabs: "Minhas" (private, owner=self) and "Da loja" (shared, all staff).
 * Desktop: list-left + editor-right two-column layout.
 * Mobile: editor opens in a Sheet drawer.
 */
export function QuickRepliesPage() {
  const s = QUICK_SEND_STRINGS.quickReplies;
  const { mine, store, isLoading, isError, canEditStore, create, update, remove, duplicateToMine } =
    useQuickReplyAdmin();

  // ── UI state ──────────────────────────────────────────────────────────────

  const [activeTab, setActiveTab] = useState<TabKey>("mine");
  const [rawSearch, setRawSearch] = useState("");
  const debouncedSearch = useDebounce(rawSearch, 250);

  // Editor: null = closed; non-null = open with scope + optional item to edit.
  const [editorState, setEditorState] = useState<IEditorState | null>(null);

  // Mobile sheet
  const [sheetOpen, setSheetOpen] = useState(false);
  const isDesktop = useIsDesktop();

  // Delete confirmation dialog
  const [deleteTarget, setDeleteTarget] = useState<IQuickReply | null>(null);

  // Search input ref for "/" shortcut
  const searchRef = useRef<HTMLInputElement | null>(null);
  const [searchFocused, setSearchFocused] = useState(false);

  // "/" shortcut focuses search (mirroring CatalogHeader / AssetLibraryManagerPage)
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

  // ── Filtering ─────────────────────────────────────────────────────────────

  const q = debouncedSearch.toLowerCase().trim();

  const filteredMine = useMemo(
    () =>
      q
        ? mine.filter(
            (r) =>
              r.shortcut.toLowerCase().includes(q) ||
              r.title.toLowerCase().includes(q) ||
              r.body.toLowerCase().includes(q),
          )
        : mine,
    [mine, q],
  );

  const filteredStore = useMemo(
    () =>
      q
        ? store.filter(
            (r) =>
              r.shortcut.toLowerCase().includes(q) ||
              r.title.toLowerCase().includes(q) ||
              r.body.toLowerCase().includes(q),
          )
        : store,
    [store, q],
  );

  // existingShortcuts for the editor collision check
  const existingShortcuts = useMemo(
    () => [...mine, ...store].map((r) => r.shortcut),
    [mine, store],
  );

  // ── Editor open/close helpers ─────────────────────────────────────────────

  function openCreate(scope: "private" | "shared") {
    setEditorState({ item: null, scope });
    setSheetOpen(true);
  }

  function openEdit(item: IQuickReply) {
    setEditorState({ item, scope: item.scope });
    setSheetOpen(true);
  }

  function closeEditor() {
    setEditorState(null);
    setSheetOpen(false);
  }

  // ── Mutations ─────────────────────────────────────────────────────────────

  async function handleSubmit(v: { shortcut: string; title: string; body: string }) {
    try {
      if (editorState?.item) {
        await update(editorState.item.id, v);
      } else {
        await create({ ...v, scope: editorState?.scope ?? "private" });
      }
      toast.success(s.saved);
      closeEditor();
    } catch {
      toast.error(s.saveError);
    }
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    try {
      await remove(deleteTarget.id);
      toast.success(s.deleted);
    } catch {
      toast.error(s.saveError);
    } finally {
      setDeleteTarget(null);
    }
  }

  async function handleDuplicate(item: IQuickReply) {
    try {
      await duplicateToMine(item);
      toast.success(s.duplicated);
    } catch (error) {
      if (error instanceof Error && error.message === "shortcut-exists") {
        toast.error(s.duplicateShortcutExists);
      } else {
        toast.error(s.saveError);
      }
    }
  }

  // ── Render helpers ────────────────────────────────────────────────────────

  function renderList(items: IQuickReply[], tab: TabKey) {
    const canEdit = tab === "mine" || canEditStore;

    if (isError) {
      return (
        <div role="alert" className="flex flex-col items-center gap-3 py-16 text-center">
          <Icon icon="mdi:alert-circle-outline" size={36} className="text-destructive" aria-hidden />
          <p className="text-sm text-destructive">{QUICK_SEND_STRINGS.errors.loadAssetFailed}</p>
        </div>
      );
    }

    if (isLoading) {
      return <SkeletonList />;
    }

    if (items.length === 0) {
      return (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <Icon icon="mdi:message-flash-outline" size={36} className="text-muted-foreground" aria-hidden />
          <p className="text-sm text-muted-foreground">
            {tab === "mine" ? s.emptyMine : s.emptyStore}
          </p>
          {tab === "mine" && (
            <Button size="sm" className="cursor-pointer" onClick={() => openCreate("private")}>
              <Icon icon="mdi:plus" size={16} aria-hidden />
              {s.newReply}
            </Button>
          )}
        </div>
      );
    }

    return (
      <ul className="divide-y divide-border rounded-lg border border-border">
        {items.map((item) => (
          <ReplyRow
            key={item.id}
            item={item}
            canEdit={canEdit}
            isSelected={editorState?.item?.id === item.id}
            onSelect={canEdit ? () => openEdit(item) : undefined}
            onEdit={() => openEdit(item)}
            onDelete={() => setDeleteTarget(item)}
            onDuplicate={!canEdit ? () => void handleDuplicate(item) : undefined}
          />
        ))}
      </ul>
    );
  }

  const activeItems = activeTab === "mine" ? filteredMine : filteredStore;

  // Editor panel content (shared between desktop inline and mobile Sheet)
  const editorContent = (
    <EditorPanel
      editorState={editorState}
      existingShortcuts={existingShortcuts}
      onSubmit={handleSubmit}
      onCancel={closeEditor}
    />
  );

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{s.pageTitle}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{s.pageDesc}</p>
      </div>

      {/* Action bar: search + "Nova resposta" */}
      <div className="flex items-center gap-2">
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
            value={rawSearch}
            onChange={(e) => setRawSearch(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            onKeyDown={(e) => {
              if (e.key === "Escape") e.currentTarget.blur();
            }}
            placeholder={s.search}
            className="pl-8 pr-9"
            aria-label={s.search}
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

        {(activeTab !== "store" || canEditStore) && (
          <Button
            size="sm"
            className="shrink-0 cursor-pointer"
            onClick={() =>
              openCreate(activeTab === "mine" ? "private" : "shared")
            }
          >
            <Icon icon="mdi:plus" size={16} aria-hidden />
            {s.newReply}
          </Button>
        )}
      </div>

      {/* Tabs */}
      <Tabs
        value={activeTab}
        onValueChange={(v) => {
          setActiveTab(v as TabKey);
          closeEditor();
        }}
      >
        <TabsList>
          <TabsTrigger value="mine">{s.tabMine}</TabsTrigger>
          <TabsTrigger value="store">{s.tabStore}</TabsTrigger>
        </TabsList>

        {/* ── Minhas ── */}
        <TabsContent value="mine" className="mt-4">
          <div className="grid gap-6 lg:grid-cols-2">
            {/* List column */}
            <div>{renderList(filteredMine, "mine")}</div>

            {/* Editor column — desktop only */}
            <div className="hidden lg:block">
              {editorState && activeTab === "mine" && editorContent}
            </div>
          </div>
        </TabsContent>

        {/* ── Da loja ── */}
        <TabsContent value="store" className="mt-4">
          <div className="grid gap-6 lg:grid-cols-2">
            {/* List column */}
            <div>
              {!canEditStore && store.length > 0 && (
                <p className="mb-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Icon icon="mdi:lock-outline" size={13} aria-hidden />
                  {s.lockedHint}
                </p>
              )}
              {renderList(filteredStore, "store")}
            </div>

            {/* Editor column — desktop only (only when canEditStore) */}
            <div className="hidden lg:block">
              {canEditStore && editorState && activeTab === "store" && editorContent}
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Mobile Sheet (editor) */}
      <Sheet open={sheetOpen && !isDesktop && (activeTab === "mine" || canEditStore)} onOpenChange={(open) => !open && closeEditor()}>
        <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto p-5">
          <SheetTitle className="sr-only">
            {editorState?.item
              ? QUICK_SEND_STRINGS.library.snippetEditTitle
              : QUICK_SEND_STRINGS.library.snippetNewTitle}
          </SheetTitle>
          {editorContent}
        </SheetContent>
      </Sheet>

      {/* Delete confirmation */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{s.deleteTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget ? s.deleteDesc(deleteTarget.title) : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{s.cancel}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void handleConfirmDelete()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {s.delete}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reactive desktop check at the lg breakpoint (>= 1024 px). Subscribes to the
// media query so the layout (whether the mobile Sheet should be open) re-renders
// when the viewport crosses the boundary — e.g. rotating a tablet — instead of
// reading matchMedia non-reactively at render time.
// ---------------------------------------------------------------------------

function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches,
  );
  useEffect(() => {
    const mql = window.matchMedia("(min-width: 1024px)");
    const onChange = () => setIsDesktop(mql.matches);
    mql.addEventListener("change", onChange);
    onChange();
    return () => mql.removeEventListener("change", onChange);
  }, []);
  return isDesktop;
}
