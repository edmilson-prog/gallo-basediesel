// src/features/pix/components/admin/PixKeysPage.tsx
//
// PIX keys management screen. Same layout grammar as QuickRepliesPage: list on
// the left, editor on the right, Sheet on mobile, AlertDialog for delete.
// Data: usePixKeyAdmin only — no direct provider / mock imports.
// Copy: all user-facing text via PIX_STRINGS.

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import type { IPixKey } from "@/shared/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
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
import { useQuickReplies } from "@/features/quick-send";
import { toDisplayPixKey } from "../../engine/pixKeyFormat";
import { usePixKeyAdmin, type PixKeyDraft } from "../../hooks/usePixKeyAdmin";
import { CopyKeyButton } from "../CopyKeyButton";
import { PixKeyEditor } from "./PixKeyEditor";
import { PIX_STRINGS, PIX_TYPE_LABEL, PIX_TYPE_ICON } from "../../i18n/pt-BR";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface IEditorState {
  /** null = create mode; IPixKey = edit mode */
  item: IPixKey | null;
}

// ---------------------------------------------------------------------------
// Skeleton list (loading state)
// ---------------------------------------------------------------------------

function SkeletonList() {
  return (
    <ul className="divide-y divide-border rounded-lg border border-border">
      {Array.from({ length: 3 }).map((_, i) => (
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
// Single PIX key list row
// ---------------------------------------------------------------------------

interface IPixKeyRowProps {
  item: IPixKey;
  canManage: boolean;
  isSelected: boolean;
  onSelect?: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

function PixKeyRow({ item, canManage, isSelected, onSelect, onEdit, onDelete }: IPixKeyRowProps) {
  const s = PIX_STRINGS;

  // Type is signalled by icon + label inside a NEUTRAL badge. Colour on this
  // screen means state (default / inactive / error), never key type: five key
  // types have no severity semantics, and no five-colour scale survives every
  // theme with guaranteed contrast.
  const summary = (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary" className="shrink-0 gap-1 text-[11px]">
          <Icon icon={PIX_TYPE_ICON[item.keyType]} size={12} />
          {PIX_TYPE_LABEL[item.keyType]}
        </Badge>
        <span className="truncate text-sm font-medium text-foreground">{item.alias}</span>
        {item.isDefault && (
          <span className="inline-flex shrink-0 items-center">
            <Icon icon="mdi:star" size={14} className="text-primary" />
            <span className="sr-only">{s.list.defaultKey}</span>
          </span>
        )}
        {!item.isActive && (
          <Badge variant="outline" className="shrink-0 text-[10px]">
            {s.list.inactive}
          </Badge>
        )}
      </div>
      {/* Formatted for READING. Never truncated: a half-visible key looks
          checkable and isn't. The canonical value goes to CopyKeyButton. */}
      <p className="mt-1 break-all font-mono text-xs tabular-nums text-muted-foreground">
        {toDisplayPixKey(item.keyType, item.keyValue)}
      </p>
      {item.shortcut && (
        <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">{item.shortcut}</p>
      )}
    </>
  );

  return (
    <li
      className={cn(
        "flex items-start justify-between gap-3 px-4 py-3 transition-colors",
        isSelected ? "bg-accent" : "hover:bg-accent/40",
      )}
    >
      {onSelect ? (
        <button
          type="button"
          className="min-w-0 flex-1 cursor-pointer text-left"
          onClick={onSelect}
          aria-pressed={isSelected}
          aria-label={`${item.alias} — ${PIX_TYPE_LABEL[item.keyType]}`}
        >
          {summary}
        </button>
      ) : (
        <div className="min-w-0 flex-1 text-left">{summary}</div>
      )}

      <div className="flex shrink-0 items-center gap-0.5">
        {/* CANONICAL value — the formatted one above is for the eye only. */}
        <CopyKeyButton value={item.keyValue} label={item.alias} compact />
        {canManage && (
          <>
            {/* h-9 w-9 (36px), not ReplyRow's h-8 w-8: 32px is under the
                minimum touch target and that debt is not worth replicating. */}
            <Button
              variant="ghost"
              size="sm"
              className="h-9 w-9 cursor-pointer p-0"
              aria-label={s.edit}
              onClick={onEdit}
            >
              <Icon icon="mdi:pencil-outline" size={16} />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-9 w-9 cursor-pointer p-0 text-destructive hover:text-destructive"
              aria-label={s.delete}
              onClick={onDelete}
            >
              <Icon icon="mdi:trash-can-outline" size={16} />
            </Button>
          </>
        )}
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toDraft(item: IPixKey): PixKeyDraft {
  return {
    alias: item.alias,
    keyType: item.keyType,
    keyValue: item.keyValue,
    receiverName: item.receiverName,
    receiverCity: item.receiverCity,
    defaultContext: item.defaultContext ?? "",
    shortcut: item.shortcut ?? "",
    defaultSendText: item.defaultSendText,
    defaultSendQr: item.defaultSendQr,
    isDefault: item.isDefault,
    isActive: item.isActive,
  };
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

/**
 * PIX keys management screen. Renders inside SettingsLayout's content area
 * (no glass header / ScrollProgressBar — SettingsLayout provides the scaffold).
 *
 * Desktop: list-left + editor-right. Mobile: editor opens in a Sheet.
 *
 * The two columns are NOT 50/50 like QuickRepliesPage. The preview carries a
 * hard 260px floor (ImageBubble's box) plus its own two-column form, while a
 * PIX row is short. With the shell sidebar and the settings sidebar both taking
 * width, an even split leaves the editor too narrow to show the preview at true
 * size until roughly 1800px. A ~22rem list column fixes that from `lg` up.
 */
export function PixKeysPage() {
  const s = PIX_STRINGS;
  const { keys, isLoading, isError, canManage, create, update, remove } = usePixKeyAdmin();
  // The collision check must cross BOTH sets: a PIX shortcut that shadows a
  // quick reply (or vice versa) makes the composer's resolution ambiguous.
  const { replies } = useQuickReplies();

  const [editorState, setEditorState] = useState<IEditorState | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<IPixKey | null>(null);
  const isDesktop = useIsDesktop();

  // Default first, active before inactive, then alphabetical — the order the
  // attendant reasons about the list in.
  const sortedKeys = useMemo(
    () =>
      [...keys].sort(
        (a, b) =>
          Number(b.isActive) - Number(a.isActive) ||
          Number(b.isDefault) - Number(a.isDefault) ||
          a.alias.localeCompare(b.alias, "pt-BR"),
      ),
    [keys],
  );

  const editingId = editorState?.item?.id;

  // The row being edited is excluded, otherwise re-saving a key without
  // touching its shortcut would collide with itself and block the save.
  const existingShortcuts = useMemo(
    () =>
      [
        ...keys.filter((k) => k.id !== editingId).map((k) => k.shortcut ?? ""),
        ...replies.map((r) => r.shortcut),
      ].filter((value) => value !== ""),
    [keys, replies, editingId],
  );

  // ── Editor open/close helpers ─────────────────────────────────────────────

  function openCreate() {
    setEditorState({ item: null });
    setSheetOpen(true);
  }

  function openEdit(item: IPixKey) {
    setEditorState({ item });
    setSheetOpen(true);
  }

  function closeEditor() {
    setEditorState(null);
    setSheetOpen(false);
  }

  // ── Mutations ─────────────────────────────────────────────────────────────

  async function handleSubmit(draft: PixKeyDraft) {
    try {
      if (editorState?.item) {
        await update(editorState.item.id, draft);
      } else {
        await create(draft);
      }
      toast.success(s.editor.saved);
      closeEditor();
    } catch {
      toast.error(s.errors.saveFailed);
    }
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    try {
      await remove(deleteTarget.id);
      toast.success(s.list.deleted);
      if (editorState?.item?.id === deleteTarget.id) closeEditor();
    } catch {
      toast.error(s.errors.saveFailed);
    } finally {
      setDeleteTarget(null);
    }
  }

  // ── Render helpers ────────────────────────────────────────────────────────

  function renderList() {
    if (isError) {
      return (
        <div role="alert" className="flex flex-col items-center gap-3 py-16 text-center">
          <Icon icon="mdi:alert-circle-outline" size={36} className="text-destructive" />
          <p className="text-sm text-destructive">{s.errors.loadFailed}</p>
        </div>
      );
    }

    if (isLoading) return <SkeletonList />;

    if (sortedKeys.length === 0) {
      return (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <Icon icon="mdi:qrcode" size={36} className="text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{s.list.empty}</p>
          <p className="max-w-xs text-xs text-muted-foreground">{s.list.emptyHint}</p>
          {canManage && (
            <Button size="sm" className="cursor-pointer" onClick={openCreate}>
              <Icon icon="mdi:plus" size={16} />
              {s.list.newKey}
            </Button>
          )}
        </div>
      );
    }

    return (
      <ul className="divide-y divide-border rounded-lg border border-border">
        {sortedKeys.map((item) => (
          <PixKeyRow
            key={item.id}
            item={item}
            canManage={canManage}
            isSelected={editingId === item.id}
            onSelect={canManage ? () => openEdit(item) : undefined}
            onEdit={() => openEdit(item)}
            onDelete={() => setDeleteTarget(item)}
          />
        ))}
      </ul>
    );
  }

  const editorContent = editorState && (
    <div className="rounded-lg border border-border bg-card p-5">
      <p className="mb-4 text-sm font-semibold text-foreground">
        {editorState.item ? s.editor.editTitle : s.editor.newTitle}
      </p>
      <PixKeyEditor
        key={editorState.item?.id ?? "new"}
        initial={editorState.item ? toDraft(editorState.item) : undefined}
        onSubmit={handleSubmit}
        onCancel={closeEditor}
        existingShortcuts={existingShortcuts}
      />
    </div>
  );

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{s.pageTitle}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{s.pageDescription}</p>
        </div>
        {canManage && (
          <Button size="sm" className="shrink-0 cursor-pointer" onClick={openCreate}>
            <Icon icon="mdi:plus" size={16} />
            {s.list.newKey}
          </Button>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        {/* List column */}
        <div>
          {!canManage && (
            <p className="mb-3 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Icon icon="mdi:lock-outline" size={13} />
              {s.list.readOnly}
            </p>
          )}
          {renderList()}
        </div>

        {/* Editor column — desktop only. Gated on `isDesktop` and not only on
            the `hidden lg:block` class: the Sheet renders the same editor, and
            two mounted copies would duplicate every field `id` on the page, so
            tapping a label on mobile would focus the display:none twin. */}
        <div className="hidden lg:block">{canManage && isDesktop && editorContent}</div>
      </div>

      {/* Mobile Sheet (editor) */}
      <Sheet
        open={sheetOpen && !isDesktop && canManage}
        onOpenChange={(open) => !open && closeEditor()}
      >
        <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto p-5">
          <SheetTitle className="sr-only">
            {editorState?.item ? s.editor.editTitle : s.editor.newTitle}
          </SheetTitle>
          {!isDesktop && editorContent}
        </SheetContent>
      </Sheet>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{s.list.deleteTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget ? s.list.deleteDesc(deleteTarget.alias) : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{s.editor.cancel}</AlertDialogCancel>
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
