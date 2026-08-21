/**
 * Category manager — the taxonomy drawer from the `catalog/lista` design kit.
 *
 * The kit's point is that a category is not a label but a bucket with a filling
 * level: each family shows how many parts it holds, how many of those are ready
 * to sell, and which raw ERP groups already land in it. "Sem categoria" sits at
 * the bottom as the queue, one click from the triage view.
 *
 * Built-in families live in code and cannot be deleted — they can be renamed,
 * recoloured, emptied and archived. Only families created here can be removed,
 * and only once no part references them.
 */

import { useMemo, useState } from "react";
import { toast } from "sonner";
import type { IPart, PartCategory } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { CATALOG_STRINGS } from "../../i18n/pt-BR";
import {
  categoryTone,
  DEFAULT_CATEGORY_COLOR,
  DEFAULT_CATEGORY_ICON,
  PART_CATEGORY_COLORS,
  PART_CATEGORY_ICONS,
  toCategorySlug,
  type IPartCategoryDescriptor,
} from "../../utils/categories";
import { isReadyToSell } from "../../utils/completeness";
import { useCategoryAdmin, useCategoryDescriptors } from "../../hooks/useCategoryDescriptors";
import { PartChip } from "../detail/PartChip";

const COPY = CATALOG_STRINGS.categories;

interface ICategoryStats {
  total: number;
  ready: number;
  erpGroups: string[];
}

function statsFor(parts: IPart[]): ICategoryStats {
  const erpGroups = new Set<string>();
  let ready = 0;
  for (const part of parts) {
    if (isReadyToSell(part)) ready += 1;
    if (part.group) erpGroups.add(part.group);
  }
  return { total: parts.length, ready, erpGroups: Array.from(erpGroups).sort() };
}

/* ── Shared editor fields ────────────────────────────────────────────────── */

interface IEditorValue {
  label: string;
  icon: string;
  color: string;
}

function CategoryEditorFields({
  value,
  onChange,
  idPrefix,
}: {
  value: IEditorValue;
  onChange: (next: IEditorValue) => void;
  idPrefix: string;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2.5">
        <span
          className={cn(
            "grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-current/25",
            categoryTone(value.color),
          )}
          aria-hidden="true"
        >
          <Icon icon={value.icon} size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <Label htmlFor={`${idPrefix}-name`} className="sr-only">
            {COPY.nameLabel}
          </Label>
          <Input
            id={`${idPrefix}-name`}
            value={value.label}
            onChange={(e) => onChange({ ...value, label: e.target.value })}
            placeholder={COPY.namePlaceholder}
          />
        </div>
      </div>

      <div>
        <span className="mb-1.5 block text-[9.5px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
          {COPY.iconLabel}
        </span>
        <div className="flex flex-wrap gap-1">
          {PART_CATEGORY_ICONS.map((icon) => (
            <button
              key={icon}
              type="button"
              aria-label={icon}
              aria-pressed={value.icon === icon}
              onClick={() => onChange({ ...value, icon })}
              className={cn(
                "grid h-8 w-8 place-items-center rounded-md border transition-colors",
                value.icon === icon
                  ? cn("border-current/40", categoryTone(value.color))
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon icon={icon} size={16} />
            </button>
          ))}
        </div>
      </div>

      <div>
        <span className="mb-1.5 block text-[9.5px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
          {COPY.colorLabel}
        </span>
        <div className="flex flex-wrap gap-1.5">
          {PART_CATEGORY_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              aria-label={color}
              aria-pressed={value.color === color}
              onClick={() => onChange({ ...value, color })}
              className={cn(
                "grid h-7 w-7 place-items-center rounded-full ring-2 ring-offset-2 ring-offset-background transition-all",
                categoryTone(color),
                value.color === color ? "ring-foreground" : "ring-transparent",
              )}
            >
              <Icon icon="mdi:circle" size={12} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Row ─────────────────────────────────────────────────────────────────── */

function CategoryRow({
  descriptor,
  stats,
  canManage,
  onEdit,
  onMove,
  onArchive,
  onRemove,
}: {
  descriptor: IPartCategoryDescriptor;
  stats: ICategoryStats;
  canManage: boolean;
  onEdit: () => void;
  onMove: () => void;
  onArchive: () => void;
  onRemove: () => void;
}) {
  const percent = stats.total > 0 ? Math.round((stats.ready / stats.total) * 100) : 0;
  // Only a stored row can be deleted, and only once it is empty: built-ins live
  // in code, so "delete" for them means archive.
  const removable = !descriptor.builtin && descriptor.id != null && stats.total === 0;

  return (
    <div
      className={cn(
        "group flex items-center gap-2.5 border-b border-border px-4 py-2.5 transition-colors hover:bg-muted/40",
        descriptor.archived && "opacity-55",
      )}
    >
      <span
        className={cn(
          "grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-current/25",
          categoryTone(descriptor.color),
        )}
        aria-hidden="true"
      >
        <Icon icon={descriptor.icon} size={16} />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="truncate text-[13px] font-bold text-foreground">{descriptor.label}</span>
          <span className="text-[11px] text-muted-foreground">{COPY.partCount(stats.total)}</span>
          {descriptor.archived && (
            <PartChip variant="ghost" size="sm">
              {COPY.archived}
            </PartChip>
          )}
        </div>

        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <span
            className="inline-block h-1 w-[70px] shrink-0 overflow-hidden rounded-full bg-foreground/10"
            role="presentation"
          >
            <span
              className="block h-full rounded-full bg-severity-success"
              style={{ width: `${percent}%` }}
            />
          </span>
          <span className="text-[10.5px] text-muted-foreground">
            {COPY.readyCount(stats.ready)}
          </span>
          {stats.erpGroups.length > 0 && (
            <span className="flex flex-wrap items-center gap-1" title={COPY.erpGroupsTitle}>
              {stats.erpGroups.slice(0, 3).map((group) => (
                <PartChip key={group} variant="ghost" size="sm">
                  {group}
                </PartChip>
              ))}
              {stats.erpGroups.length > 3 && (
                <span className="text-[10.5px] text-muted-foreground">
                  +{stats.erpGroups.length - 3}
                </span>
              )}
            </span>
          )}
        </div>
      </div>

      {canManage && (
        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground"
            onClick={onEdit}
            aria-label={COPY.rename}
            title={COPY.rename}
          >
            <Icon icon="mdi:pencil-outline" size={15} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground"
            onClick={onMove}
            disabled={stats.total === 0}
            aria-label={COPY.merge}
            title={stats.total === 0 ? COPY.merge : COPY.mergeTitle}
          >
            <Icon icon="mdi:call-merge" size={15} />
          </Button>
          {removable ? (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-severity-critical"
              onClick={onRemove}
              aria-label={COPY.remove}
              title={COPY.removeTitle}
            >
              <Icon icon="mdi:trash-can-outline" size={15} />
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground"
              onClick={onArchive}
              aria-label={descriptor.archived ? COPY.unarchive : COPY.archive}
              title={
                descriptor.builtin
                  ? COPY.archiveTitle
                  : stats.total > 0
                    ? COPY.removeBlocked
                    : COPY.archive
              }
            >
              <Icon
                icon={descriptor.archived ? "mdi:archive-arrow-up-outline" : "mdi:archive-outline"}
                size={15}
              />
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Drawer ──────────────────────────────────────────────────────────────── */

export interface ICatalogCategoriesDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The whole catalog — drives every count in here. */
  parts: IPart[];
  canManage: boolean;
  /** Opens the grouped view filtered to the uncategorised queue. */
  onTriage: () => void;
  /** Reassigns every given part to `to`; resolves with the failure count. */
  onMoveParts: (to: PartCategory, parts: IPart[]) => Promise<number>;
}

export function CatalogCategoriesDrawer({
  open,
  onOpenChange,
  parts,
  canManage,
  onTriage,
  onMoveParts,
}: ICatalogCategoriesDrawerProps) {
  const { descriptors, isLoading, isDegraded } = useCategoryDescriptors();
  const { save, remove, isSaving } = useCategoryAdmin();

  const [editing, setEditing] = useState<IPartCategoryDescriptor | null>(null);
  const [editorValue, setEditorValue] = useState<IEditorValue>({
    label: "",
    icon: DEFAULT_CATEGORY_ICON,
    color: DEFAULT_CATEGORY_COLOR,
  });
  const [draft, setDraft] = useState<IEditorValue>({
    label: "",
    icon: DEFAULT_CATEGORY_ICON,
    color: DEFAULT_CATEGORY_COLOR,
  });
  const [movingFrom, setMovingFrom] = useState<IPartCategoryDescriptor | null>(null);
  const [moveTarget, setMoveTarget] = useState<PartCategory | "">("");
  const [isMoving, setMoving] = useState(false);

  const byCategory = useMemo(() => {
    const map = new Map<string, IPart[]>();
    for (const part of parts) {
      if (!part.category) continue;
      const bucket = map.get(part.category) ?? [];
      bucket.push(part);
      map.set(part.category, bucket);
    }
    return map;
  }, [parts]);

  const uncategorised = useMemo(() => parts.filter((part) => !part.category), [parts]);
  const uncategorisedStats = useMemo(() => statsFor(uncategorised), [uncategorised]);

  const openEditor = (descriptor: IPartCategoryDescriptor) => {
    setEditing(descriptor);
    setEditorValue({
      label: descriptor.label,
      icon: descriptor.icon,
      color: descriptor.color,
    });
  };

  const nameTaken = (label: string, exceptValue?: string) =>
    descriptors.some(
      (d) => d.value !== exceptValue && d.label.trim().toLowerCase() === label.trim().toLowerCase(),
    );

  const commitEdit = async () => {
    if (!editing) return;
    const label = editorValue.label.trim();
    if (label.length < 3) return toast.error(COPY.nameTooShort);
    if (nameTaken(label, editing.value)) return toast.error(COPY.nameTaken);
    try {
      await save({
        value: editing.value,
        label,
        icon: editorValue.icon,
        color: editorValue.color,
        position: editing.position,
        archived: editing.archived,
      });
      toast.success(COPY.saved(label));
      setEditing(null);
    } catch {
      toast.error(COPY.error);
    }
  };

  const commitCreate = async () => {
    const label = draft.label.trim();
    if (label.length < 3) return toast.error(COPY.nameTooShort);
    if (nameTaken(label)) return toast.error(COPY.nameTaken);
    const value = toCategorySlug(label);
    if (!value) return toast.error(COPY.nameTooShort);
    try {
      await save({
        value,
        label,
        icon: draft.icon,
        color: draft.color,
        position: descriptors.length,
      });
      toast.success(COPY.created(label));
      setDraft({ label: "", icon: DEFAULT_CATEGORY_ICON, color: DEFAULT_CATEGORY_COLOR });
    } catch {
      toast.error(COPY.error);
    }
  };

  const toggleArchive = async (descriptor: IPartCategoryDescriptor) => {
    try {
      await save({
        value: descriptor.value,
        label: descriptor.label,
        icon: descriptor.icon,
        color: descriptor.color,
        position: descriptor.position,
        archived: !descriptor.archived,
      });
      toast.success(
        descriptor.archived
          ? COPY.unarchivedToast(descriptor.label)
          : COPY.archivedToast(descriptor.label),
      );
    } catch {
      toast.error(COPY.error);
    }
  };

  const removeCategory = async (descriptor: IPartCategoryDescriptor) => {
    if (!descriptor.id) return;
    try {
      await remove(descriptor.id);
      toast.success(COPY.removed(descriptor.label));
    } catch {
      toast.error(COPY.error);
    }
  };

  const commitMove = async () => {
    if (!movingFrom || !moveTarget) return;
    const moving = byCategory.get(movingFrom.value) ?? [];
    setMoving(true);
    try {
      const failed = await onMoveParts(moveTarget, moving);
      const target = descriptors.find((d) => d.value === moveTarget);
      if (failed === 0) {
        toast.success(COPY.merged(moving.length, target?.label ?? moveTarget));
      } else {
        toast.warning(CATALOG_STRINGS.bulk.partialError(moving.length - failed, failed));
      }
      setMovingFrom(null);
      setMoveTarget("");
    } catch {
      toast.error(CATALOG_STRINGS.bulk.error);
    } finally {
      setMoving(false);
    }
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-lg">
          <SheetHeader className="border-b border-border px-4 py-3">
            <div className="flex items-center gap-2.5">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                <Icon icon="mdi:shape-outline" size={17} />
              </span>
              <div className="min-w-0">
                <SheetTitle className="font-display text-base font-extrabold uppercase tracking-[0.03em]">
                  {COPY.title}
                </SheetTitle>
                <SheetDescription className="text-[11px]">
                  {COPY.subtitle(descriptors.length, uncategorisedStats.total)}
                </SheetDescription>
              </div>
            </div>
          </SheetHeader>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {isDegraded && (
              <p className="border-b border-border bg-severity-warning/10 px-4 py-2 text-[11px] text-severity-warning">
                {COPY.degraded}
              </p>
            )}

            {isLoading && descriptors.length === 0
              ? Array.from({ length: 6 }).map((_, i) => (
                  <div key={`cat-skeleton-${i}`} className="border-b border-border px-4 py-3">
                    <Skeleton className="h-9 w-full" />
                  </div>
                ))
              : descriptors.map((descriptor) => (
                  <CategoryRow
                    key={descriptor.value}
                    descriptor={descriptor}
                    stats={statsFor(byCategory.get(descriptor.value) ?? [])}
                    canManage={canManage}
                    onEdit={() => openEditor(descriptor)}
                    onMove={() => {
                      setMovingFrom(descriptor);
                      setMoveTarget("");
                    }}
                    onArchive={() => void toggleArchive(descriptor)}
                    onRemove={() => void removeCategory(descriptor)}
                  />
                ))}

            {/* The queue itself — always last, always the loudest row. */}
            <div className="flex items-center gap-2.5 bg-severity-critical/5 px-4 py-3">
              <span
                className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-dashed border-border bg-muted/40 text-muted-foreground"
                aria-hidden="true"
              >
                <Icon icon="mdi:cube-outline" size={16} />
              </span>
              <div className="min-w-0 flex-1">
                <span className="text-[13px] font-bold text-severity-critical">
                  {COPY.uncategorised}
                </span>
                <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                  {COPY.partCount(uncategorisedStats.total)}
                  {uncategorisedStats.erpGroups.length > 0 && (
                    <>
                      {" · "}
                      {COPY.uncategorisedHint} {uncategorisedStats.erpGroups.slice(0, 4).join(", ")}
                      {uncategorisedStats.erpGroups.length > 4 && "…"}
                    </>
                  )}
                </div>
              </div>
              <Button
                variant="secondary"
                size="sm"
                className="shrink-0"
                onClick={() => {
                  onTriage();
                  onOpenChange(false);
                }}
                title={COPY.triageTitle}
              >
                <Icon icon="mdi:format-list-checks" size={15} />
                {COPY.triage}
              </Button>
            </div>
          </div>

          {canManage ? (
            <div className="border-t border-border bg-muted/30 px-4 py-3">
              <span className="mb-2 block text-[9.5px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                {COPY.newTitle}
              </span>
              <CategoryEditorFields value={draft} onChange={setDraft} idPrefix="new-category" />
              <div className="mt-3 flex items-center gap-2">
                <Button
                  size="sm"
                  onClick={() => void commitCreate()}
                  disabled={isSaving || draft.label.trim().length < 3}
                >
                  <Icon icon="mdi:plus" size={15} />
                  {COPY.create}
                </Button>
                <span className="text-[11px] text-muted-foreground">{COPY.createHint}</span>
              </div>
            </div>
          ) : (
            <p className="border-t border-border px-4 py-3 text-[11px] text-muted-foreground">
              {COPY.readOnly}
            </p>
          )}
        </SheetContent>
      </Sheet>

      {/* Rename / recolour */}
      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? COPY.editTitle(editing.label) : COPY.rename}</DialogTitle>
          </DialogHeader>
          <CategoryEditorFields
            value={editorValue}
            onChange={setEditorValue}
            idPrefix="edit-category"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)} disabled={isSaving}>
              {COPY.cancel}
            </Button>
            <Button
              onClick={() => void commitEdit()}
              disabled={isSaving || editorValue.label.trim().length < 3}
            >
              {COPY.save}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Move every part out of a family */}
      <Dialog open={movingFrom !== null} onOpenChange={(o) => !o && setMovingFrom(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {movingFrom ? COPY.mergeDialogTitle(movingFrom.label) : COPY.merge}
            </DialogTitle>
            <DialogDescription>
              {movingFrom
                ? COPY.mergeDialogDescription(
                    (byCategory.get(movingFrom.value) ?? []).length,
                    movingFrom.label,
                  )
                : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="merge-target">{COPY.mergeTarget}</Label>
            <Select value={moveTarget} onValueChange={(v) => setMoveTarget(v as PartCategory)}>
              <SelectTrigger id="merge-target">
                <SelectValue placeholder={COPY.mergeTarget} />
              </SelectTrigger>
              <SelectContent>
                {descriptors
                  .filter((d) => !d.archived && d.value !== movingFrom?.value)
                  .map((d) => (
                    <SelectItem key={d.value} value={d.value}>
                      {d.label}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMovingFrom(null)} disabled={isMoving}>
              {COPY.cancel}
            </Button>
            <Button onClick={() => void commitMove()} disabled={isMoving || !moveTarget}>
              {isMoving ? CATALOG_STRINGS.bulk.applying : COPY.mergeConfirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
