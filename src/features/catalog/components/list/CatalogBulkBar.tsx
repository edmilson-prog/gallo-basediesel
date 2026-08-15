/**
 * Bulk-selection bar from the catalog list design kit.
 *
 * The kit's premise: a catalog this incomplete is corrected by the batch, not
 * part by part. Selecting rows floats this bar with the three corrections that
 * actually move the completeness numbers — category, manufacturer, deactivation
 * — plus an export for the work that has to happen in a spreadsheet.
 */

import { useState } from "react";
import { toast } from "sonner";
import type { ID, IPart, PartCategory } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { CATALOG_STRINGS } from "../../i18n/pt-BR";
import { useCategoryDescriptors } from "../../hooks/useCategoryDescriptors";
import { downloadCatalogCsv } from "../../utils/csvExport";

const COPY = CATALOG_STRINGS.bulk;

type BulkAction = "category" | "manufacturer" | "deactivate";

export interface ICatalogBulkBarProps {
  selected: IPart[];
  onClear: () => void;
  /** Applies a patch to every selected part; resolves with the failure count. */
  onApply: (ids: ID[], patch: Partial<IPart>) => Promise<number>;
  canUpdate: boolean;
}

export function CatalogBulkBar({ selected, onClear, onApply, canUpdate }: ICatalogBulkBarProps) {
  const [action, setAction] = useState<BulkAction | null>(null);
  const [category, setCategory] = useState<PartCategory | "">("");
  const [manufacturer, setManufacturer] = useState("");
  const [isApplying, setApplying] = useState(false);
  const { active: categoryOptions } = useCategoryDescriptors();

  if (selected.length === 0) return null;

  const count = selected.length;

  const closeDialog = () => {
    setAction(null);
    setCategory("");
    setManufacturer("");
  };

  const handleExport = () => {
    downloadCatalogCsv(selected);
    toast.success(COPY.exported(count), { icon: <Icon icon="mdi:download" size={16} /> });
  };

  const runApply = async (patch: Partial<IPart>, successMessage: string) => {
    setApplying(true);
    try {
      const failed = await onApply(
        selected.map((part) => part.id),
        patch,
      );
      if (failed === 0) {
        toast.success(successMessage, { icon: <Icon icon="mdi:check" size={16} /> });
        onClear();
      } else {
        toast.warning(COPY.partialError(count - failed, failed));
      }
      closeDialog();
    } catch {
      toast.error(COPY.error);
    } finally {
      setApplying(false);
    }
  };

  const confirmDisabled =
    isApplying ||
    (action === "category" && !category) ||
    (action === "manufacturer" && manufacturer.trim().length === 0);

  const handleConfirm = () => {
    if (action === "category" && category) {
      void runApply({ category }, COPY.applied(count));
    } else if (action === "manufacturer" && manufacturer.trim()) {
      void runApply({ brand: manufacturer.trim() }, COPY.applied(count));
    } else if (action === "deactivate") {
      void runApply({ active: false }, COPY.deactivated(count));
    }
  };

  return (
    <>
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-4">
        <div className="pointer-events-auto flex flex-wrap items-center gap-2 rounded-xl border border-border bg-popover/95 px-3.5 py-2.5 shadow-xl shadow-foreground/10 backdrop-blur-lg">
          <span className="font-display text-base font-bold tabular-nums text-primary">
            {count}
          </span>
          <span className="mr-1 text-xs font-semibold text-muted-foreground">
            {COPY.selected(count)}
          </span>

          {canUpdate && (
            <>
              <Button variant="secondary" size="sm" onClick={() => setAction("category")}>
                <Icon icon="mdi:shape-outline" size={15} />
                <span className="hidden sm:inline">{COPY.setCategory}</span>
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setAction("manufacturer")}>
                <Icon icon="mdi:factory" size={15} />
                <span className="hidden sm:inline">{COPY.setManufacturer}</span>
              </Button>
            </>
          )}

          <Button variant="secondary" size="sm" onClick={handleExport}>
            <Icon icon="mdi:download-outline" size={15} />
            <span className="hidden sm:inline">{COPY.export}</span>
          </Button>

          {canUpdate && (
            <Button variant="outline" size="sm" onClick={() => setAction("deactivate")}>
              <Icon icon="mdi:archive-arrow-down-outline" size={15} />
              <span className="hidden sm:inline">{COPY.deactivate}</span>
            </Button>
          )}

          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground"
            onClick={onClear}
            aria-label={COPY.clear}
            title={COPY.clear}
          >
            <Icon icon="mdi:close" size={16} />
          </Button>
        </div>
      </div>

      <Dialog open={action !== null} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {action === "category"
                ? COPY.setCategoryTitle
                : action === "manufacturer"
                  ? COPY.setManufacturerTitle
                  : COPY.deactivateTitle}
            </DialogTitle>
            <DialogDescription>
              {action === "category"
                ? COPY.setCategoryDescription(count)
                : action === "manufacturer"
                  ? COPY.setManufacturerDescription(count)
                  : COPY.deactivateDescription(count)}
            </DialogDescription>
          </DialogHeader>

          {action === "category" && (
            <div className="space-y-2">
              <Label htmlFor="bulk-category">{CATALOG_STRINGS.filters.category}</Label>
              <Select value={category} onValueChange={(v) => setCategory(v as PartCategory)}>
                <SelectTrigger id="bulk-category">
                  <SelectValue placeholder={CATALOG_STRINGS.filters.category} />
                </SelectTrigger>
                <SelectContent>
                  {categoryOptions.map((descriptor) => (
                    <SelectItem key={descriptor.value} value={descriptor.value}>
                      {descriptor.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {action === "manufacturer" && (
            <div className="space-y-2">
              <Label htmlFor="bulk-manufacturer">{CATALOG_STRINGS.filters.manufacturer}</Label>
              <Input
                id="bulk-manufacturer"
                value={manufacturer}
                onChange={(e) => setManufacturer(e.target.value)}
                placeholder={COPY.manufacturerPlaceholder}
                autoFocus
              />
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} disabled={isApplying}>
              {COPY.cancel}
            </Button>
            <Button
              variant={action === "deactivate" ? "destructive" : "default"}
              onClick={handleConfirm}
              disabled={confirmDisabled}
            >
              {isApplying
                ? COPY.applying
                : action === "deactivate"
                  ? COPY.confirmDeactivate
                  : COPY.confirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
