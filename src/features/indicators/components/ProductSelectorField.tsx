/**
 * ProductSelectorField — controlled field for building a ProductSelector value.
 *
 * Supports 3 modes (tabs): category, sku, group.
 * All selector state is controlled via `value`/`onChange` — no internal selector state.
 * Transient UI state (search term, popover open, part name cache) is held locally.
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ID, IPart, PartCategory, ProductSelector } from "@/shared/types";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Icon } from "@/components/Icon";
import { usePartsProvider } from "@/providers/data";
import { useDebounce } from "@/shared/hooks/useDebounce";
import { indicatorsPtBR as S } from "../i18n/pt-BR";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

type PartCategoryEntry = { value: PartCategory; label: string };

const PART_CATEGORIES: PartCategoryEntry[] = [
  { value: "filtro", label: S.productSelector.partCategories.filtro },
  { value: "freio", label: S.productSelector.partCategories.freio },
  { value: "correia", label: S.productSelector.partCategories.correia },
  { value: "motor", label: S.productSelector.partCategories.motor },
  { value: "embreagem", label: S.productSelector.partCategories.embreagem },
  { value: "eletrica", label: S.productSelector.partCategories.eletrica },
  { value: "transmissao", label: S.productSelector.partCategories.transmissao },
  { value: "suspensao", label: S.productSelector.partCategories.suspensao },
  { value: "arrefecimento", label: S.productSelector.partCategories.arrefecimento },
  { value: "lubrificante", label: S.productSelector.partCategories.lubrificante },
];

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface IProductSelectorFieldProps {
  value: ProductSelector;
  onChange: (next: ProductSelector) => void;
}

// ---------------------------------------------------------------------------
// Helpers — fresh empty selectors for each mode
// ---------------------------------------------------------------------------

function freshCategory(): ProductSelector {
  return { kind: "category", categories: [] };
}

function freshSku(): ProductSelector {
  return { kind: "sku", partIds: [] };
}

function freshGroup(): ProductSelector {
  return { kind: "group", label: "", categories: [], partIds: [] };
}

// ---------------------------------------------------------------------------
// Sub-component: CategoryChips
// ---------------------------------------------------------------------------

interface ICategoryChipsProps {
  selected: PartCategory[];
  onToggle: (cat: PartCategory) => void;
}

function CategoryChips({ selected, onToggle }: ICategoryChipsProps) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label={S.productSelector.modeLabel}>
      {PART_CATEGORIES.map((cat) => {
        const isActive = selected.includes(cat.value);
        return (
          <button
            key={cat.value}
            type="button"
            onClick={() => onToggle(cat.value)}
            aria-pressed={isActive}
            className={[
              "inline-flex cursor-pointer items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              isActive
                ? "border-transparent bg-primary text-primary-foreground shadow hover:bg-primary/80"
                : "border-border bg-background text-foreground hover:bg-accent hover:text-accent-foreground",
            ].join(" ")}
          >
            {cat.label}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-component: SkuSearch
// Mirrors the search pattern from PWAQuickQuotePage (search param, debounce,
// useQuery with enabled guard, list of results as cards, removable chips).
// ---------------------------------------------------------------------------

interface ISkuSearchProps {
  /** Currently selected part IDs. */
  partIds: ID[];
  /** Called with the full updated list of IDs. */
  onPartIdsChange: (ids: ID[]) => void;
  /** Ref to a shared part-name cache so chips can render names. */
  nameCache: React.MutableRefObject<Record<ID, string>>;
}

function SkuSearch({ partIds, onPartIdsChange, nameCache }: ISkuSearchProps) {
  const partsProvider = usePartsProvider();
  const [searchTerm, setSearchTerm] = useState("");
  const debouncedTerm = useDebounce(searchTerm, 300);
  const shouldSearch = debouncedTerm.trim().length >= 2;

  const searchQuery = useQuery({
    queryKey: ["product-selector", "parts-search", debouncedTerm] as const,
    enabled: shouldSearch,
    queryFn: async () =>
      (await partsProvider.list({ search: debouncedTerm.trim(), pageSize: 20 })).data,
    staleTime: 30_000,
  });

  // Populate name cache whenever we get results
  useEffect(() => {
    if (searchQuery.data) {
      for (const part of searchQuery.data) {
        nameCache.current[part.id] = `${part.name} · ${part.sku}`;
      }
    }
  }, [searchQuery.data, nameCache]);

  const addPart = useCallback(
    (part: IPart) => {
      if (!partIds.includes(part.id)) {
        nameCache.current[part.id] = `${part.name} · ${part.sku}`;
        onPartIdsChange([...partIds, part.id]);
      }
      setSearchTerm("");
    },
    [partIds, onPartIdsChange, nameCache],
  );

  const removePart = useCallback(
    (id: ID) => {
      onPartIdsChange(partIds.filter((pid) => pid !== id));
    },
    [partIds, onPartIdsChange],
  );

  const results: IPart[] = searchQuery.data ?? [];
  // Exclude already-selected parts from results list
  const unselectedResults = results.filter((p) => !partIds.includes(p.id));

  return (
    <div className="space-y-3">
      {/* Selected chips */}
      {partIds.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">
            {S.productSelector.skuSelected} ({partIds.length})
          </p>
          <div className="flex flex-wrap gap-2">
            {partIds.map((id) => {
              const label = nameCache.current[id] ?? id;
              return (
                <Badge key={id} variant="secondary" className="gap-1 pr-1">
                  <span className="max-w-[18ch] truncate">{label}</span>
                  <button
                    type="button"
                    onClick={() => removePart(id)}
                    aria-label={`${S.productSelector.remove} ${label}`}
                    className="ml-0.5 cursor-pointer rounded focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    <Icon icon="mdi:close" size={12} aria-hidden />
                  </button>
                </Badge>
              );
            })}
          </div>
        </div>
      )}

      {/* Search input */}
      <div className="relative">
        <Icon
          icon="mdi:magnify"
          size={16}
          className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          type="search"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder={S.productSelector.skuSearchPlaceholder}
          className="pl-8"
          aria-label={S.productSelector.skuSearchPlaceholder}
        />
      </div>

      {/* Status / results */}
      {!shouldSearch && partIds.length === 0 && (
        <p className="text-xs text-muted-foreground">{S.productSelector.skuMinChars}</p>
      )}

      {shouldSearch && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">
            {S.productSelector.skuSearchResults}
          </p>
          {searchQuery.isLoading && (
            <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
              <Icon icon="mdi:loading" size={14} className="animate-spin" />
              <span>{S.productSelector.skuSearching}</span>
            </div>
          )}
          {!searchQuery.isLoading && unselectedResults.length === 0 && (
            <p className="py-2 text-xs text-muted-foreground">{S.productSelector.skuNoResults}</p>
          )}
          {unselectedResults.length > 0 && (
            <ScrollArea className="max-h-48 rounded-md border border-border">
              <ul className="divide-y divide-border">
                {unselectedResults.map((part) => (
                  <li key={part.id}>
                    <button
                      type="button"
                      onClick={() => addPart(part)}
                      className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:outline-none"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">{part.name}</p>
                        <p className="text-xs text-muted-foreground">{part.sku}</p>
                      </div>
                      <Icon
                        icon="mdi:plus-circle-outline"
                        size={16}
                        className="shrink-0 text-primary"
                      />
                    </button>
                  </li>
                ))}
              </ul>
            </ScrollArea>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ProductSelectorField({ value, onChange }: IProductSelectorFieldProps) {
  /**
   * Cache for part display names: { [partId]: "name · sku" }
   * Shared between sku and group modes so chips render names even after
   * switching modes. Never stored in the selector — only transient display.
   */
  const nameCache = useRef<Record<ID, string>>({});

  // -------------------------------------------------------------------------
  // Mode switcher
  // -------------------------------------------------------------------------

  const handleModeChange = (mode: string) => {
    switch (mode as ProductSelector["kind"]) {
      case "category":
        onChange(freshCategory());
        break;
      case "sku":
        onChange(freshSku());
        break;
      case "group":
        onChange(freshGroup());
        break;
    }
  };

  // -------------------------------------------------------------------------
  // Category mode handlers
  // -------------------------------------------------------------------------

  const toggleCategory = useCallback(
    (cat: PartCategory) => {
      if (value.kind !== "category" && value.kind !== "group") return;
      const current = value.categories ?? [];
      const next = current.includes(cat) ? current.filter((c) => c !== cat) : [...current, cat];
      onChange({ ...value, categories: next });
    },
    [value, onChange],
  );

  // -------------------------------------------------------------------------
  // SKU mode handlers (for both sku and group)
  // -------------------------------------------------------------------------

  const handleSkuPartIdsChange = useCallback(
    (ids: ID[]) => {
      if (value.kind !== "sku" && value.kind !== "group") return;
      onChange({ ...value, partIds: ids });
    },
    [value, onChange],
  );

  // -------------------------------------------------------------------------
  // Group label handler
  // -------------------------------------------------------------------------

  const handleGroupLabelChange = useCallback(
    (label: string) => {
      if (value.kind !== "group") return;
      onChange({ ...value, label });
    },
    [value, onChange],
  );

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <Tabs value={value.kind} onValueChange={handleModeChange} className="w-full">
      <TabsList className="mb-4 w-full">
        <TabsTrigger value="category" className="flex-1 gap-1.5">
          <Icon icon="mdi:shape-outline" size={14} />
          {S.selectorKind.category}
        </TabsTrigger>
        <TabsTrigger value="sku" className="flex-1 gap-1.5">
          <Icon icon="mdi:barcode" size={14} />
          {S.selectorKind.sku}
        </TabsTrigger>
        <TabsTrigger value="group" className="flex-1 gap-1.5">
          <Icon icon="mdi:tag-multiple-outline" size={14} />
          {S.selectorKind.group}
        </TabsTrigger>
      </TabsList>

      {/* ------------------------------------------------------------------ */}
      {/* CATEGORY mode                                                        */}
      {/* ------------------------------------------------------------------ */}
      <TabsContent value="category" className="space-y-3">
        <p className="text-xs text-muted-foreground">{S.productSelector.categoryHint}</p>
        <CategoryChips
          selected={value.kind === "category" ? value.categories : []}
          onToggle={toggleCategory}
        />
      </TabsContent>

      {/* ------------------------------------------------------------------ */}
      {/* SKU mode                                                             */}
      {/* ------------------------------------------------------------------ */}
      <TabsContent value="sku" className="space-y-3">
        <p className="text-xs text-muted-foreground">{S.productSelector.skuHint}</p>
        <SkuSearch
          partIds={value.kind === "sku" ? value.partIds : []}
          onPartIdsChange={handleSkuPartIdsChange}
          nameCache={nameCache}
        />
      </TabsContent>

      {/* ------------------------------------------------------------------ */}
      {/* GROUP mode                                                           */}
      {/* ------------------------------------------------------------------ */}
      <TabsContent value="group" className="space-y-4">
        {/* Group label */}
        <div className="space-y-1.5">
          <Label htmlFor="group-label-input">{S.productSelector.groupLabelLabel}</Label>
          <Input
            id="group-label-input"
            value={value.kind === "group" ? value.label : ""}
            onChange={(e) => handleGroupLabelChange(e.target.value)}
            placeholder={S.productSelector.groupLabelPlaceholder}
          />
        </div>

        {/* Category sub-section */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">
            {S.productSelector.groupCategorySection}
          </p>
          <CategoryChips
            selected={value.kind === "group" ? (value.categories ?? []) : []}
            onToggle={toggleCategory}
          />
        </div>

        {/* SKU sub-section */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">
            {S.productSelector.groupSkuSection}
          </p>
          <SkuSearch
            partIds={value.kind === "group" ? (value.partIds ?? []) : []}
            onPartIdsChange={handleSkuPartIdsChange}
            nameCache={nameCache}
          />
        </div>
      </TabsContent>
    </Tabs>
  );
}
