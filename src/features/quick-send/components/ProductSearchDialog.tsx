// src/features/quick-send/components/ProductSearchDialog.tsx
import { useMemo, useState, useEffect } from "react";
import type { IPart } from "@/shared/types";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Icon } from "@/components/Icon";
import { useCatalogList } from "@/features/catalog/hooks/useCatalogList";
import { EMPTY_FILTERS, DEFAULT_SORT, DEFAULT_PAGE_SIZE } from "@/features/catalog/utils/listFilters";
import { QUICK_SEND_STRINGS } from "../i18n/pt-BR";

export interface IProductSearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (part: IPart) => void;
}

function useDebounced<T>(value: T, delay = 300): T {
  const [d, setD] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setD(value), delay);
    return () => window.clearTimeout(t);
  }, [value, delay]);
  return d;
}

/** Catalog search dialog to pick a part for the product card (D-7). */
export function ProductSearchDialog({ open, onOpenChange, onSelect }: IProductSearchDialogProps) {
  const [query, setQuery] = useState("");
  const debounced = useDebounced(query);
  const filters = useMemo(
    () => ({ ...EMPTY_FILTERS, search: debounced }),
    [debounced],
  );
  // pageSize MUST be a CatalogPageSize (25 | 50 | 100) — passing a raw literal
  // like `20` is TS2345 under strict and breaks the `bun run build` delta gate.
  const list = useCatalogList(filters, DEFAULT_SORT, 1, DEFAULT_PAGE_SIZE);

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-border p-3">
          <DialogTitle className="text-sm">{QUICK_SEND_STRINGS.productCard.sendProduct}</DialogTitle>
        </DialogHeader>
        <div className="border-b border-border p-3">
          <div className="relative">
            <Icon
              icon="mdi:magnify"
              size={16}
              className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={QUICK_SEND_STRINGS.productCard.searchPlaceholder}
              className="h-9 pl-8"
              aria-label={QUICK_SEND_STRINGS.productCard.searchPlaceholder}
            />
          </div>
        </div>
        <ScrollArea className="h-72">
          {list.isLoading ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground" aria-busy="true">
              <Icon icon="mdi:loading" size={16} className="mr-1 inline animate-spin" />
            </p>
          ) : list.data.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              {QUICK_SEND_STRINGS.picker.emptyState}
            </p>
          ) : (
            <div className="p-1.5">
              {list.data.map((part) => (
                <button
                  key={part.id}
                  type="button"
                  className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-sm hover:bg-muted/60"
                  onClick={() => {
                    onSelect(part);
                    onOpenChange(false);
                  }}
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                    <Icon icon="mdi:cog-outline" size={18} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-foreground">{part.name}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {[part.oemCodes[0], part.brand].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
