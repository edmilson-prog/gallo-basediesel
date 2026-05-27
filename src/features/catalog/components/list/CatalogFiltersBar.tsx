import { useMemo } from "react";
import type { ID, IStore, PartCategory } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { CATALOG_STRINGS } from "../../i18n/pt-BR";
import { PART_CATEGORY_DESCRIPTORS, getSubcategoriesFor } from "../../utils/categories";
import {
  activeFilterCount,
  type ICatalogListFilters,
  type OriginBucket,
  type StatusBucket,
  type StockBucket,
} from "../../utils/listFilters";

export interface ICatalogFiltersBarProps {
  filters: ICatalogListFilters;
  patch: (partial: Partial<ICatalogListFilters>) => void;
  onClear: () => void;
  manufacturerOptions: string[];
  vehicleBrandOptions: string[];
  vehicleModelOptions: string[];
  vehicleYearOptions: number[];
  stores: IStore[];
  canFilterStore: boolean;
}

export function CatalogFiltersBar({
  filters,
  patch,
  onClear,
  manufacturerOptions,
  vehicleBrandOptions,
  vehicleModelOptions,
  vehicleYearOptions,
  stores,
  canFilterStore,
}: ICatalogFiltersBarProps) {
  const count = activeFilterCount(filters);
  const subOptions = useMemo(
    () => (filters.categories.length === 1 ? getSubcategoriesFor(filters.categories[0]) : []),
    [filters.categories],
  );

  const toggleCategory = (value: PartCategory, checked: boolean) => {
    const next = checked
      ? Array.from(new Set([...filters.categories, value]))
      : filters.categories.filter((c) => c !== value);
    patch({ categories: next, subcategory: next.length === 1 ? filters.subcategory : undefined });
  };

  const toggleManufacturer = (value: string, checked: boolean) => {
    const next = checked
      ? Array.from(new Set([...filters.manufacturers, value]))
      : filters.manufacturers.filter((c) => c !== value);
    patch({ manufacturers: next });
  };

  const toggleStore = (value: ID, checked: boolean) => {
    const next = checked
      ? Array.from(new Set([...filters.storeIds, value]))
      : filters.storeIds.filter((c) => c !== value);
    patch({ storeIds: next });
  };

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/30 px-4 py-2.5 md:px-6">
      {/* Categoria multi-select */}
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm">
            <Icon icon="mdi:shape-outline" size={14} />
            {CATALOG_STRINGS.filters.category}
            {filters.categories.length > 0 && (
              <span className="ml-1 rounded-full bg-primary/15 px-1.5 text-[10px] font-semibold text-primary">
                {filters.categories.length}
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-64 p-2">
          <div className="max-h-72 space-y-1 overflow-y-auto">
            {PART_CATEGORY_DESCRIPTORS.map((descriptor) => {
              const checked = filters.categories.includes(descriptor.value);
              return (
                <label
                  key={descriptor.value}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(v) => toggleCategory(descriptor.value, v === true)}
                  />
                  <Icon icon={descriptor.icon} size={16} className="text-muted-foreground" />
                  <span className="text-foreground">{descriptor.label}</span>
                </label>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>

      {/* Subcategoria - dependente */}
      {subOptions.length > 0 && (
        <Select
          value={filters.subcategory ?? "__all__"}
          onValueChange={(v) => patch({ subcategory: v === "__all__" ? undefined : v })}
        >
          <SelectTrigger className="h-8 w-44 text-xs">
            <SelectValue placeholder={CATALOG_STRINGS.filters.subcategory} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Todas as subcategorias</SelectItem>
            {subOptions.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {/* Fabricante */}
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm">
            <Icon icon="mdi:factory" size={14} />
            {CATALOG_STRINGS.filters.manufacturer}
            {filters.manufacturers.length > 0 && (
              <span className="ml-1 rounded-full bg-primary/15 px-1.5 text-[10px] font-semibold text-primary">
                {filters.manufacturers.length}
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-64 p-2">
          <div className="max-h-72 space-y-1 overflow-y-auto">
            {manufacturerOptions.map((m) => {
              const checked = filters.manufacturers.includes(m);
              return (
                <label
                  key={m}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(v) => toggleManufacturer(m, v === true)}
                  />
                  <span className="text-foreground">{m}</span>
                </label>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>

      {/* Origem (Original/Equivalente) */}
      <Select value={filters.origin} onValueChange={(v) => patch({ origin: v as OriginBucket })}>
        <SelectTrigger className="h-8 w-36 text-xs">
          <SelectValue placeholder={CATALOG_STRINGS.filters.origin} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="any">{CATALOG_STRINGS.filters.originAny}</SelectItem>
          <SelectItem value="original">{CATALOG_STRINGS.filters.originOriginal}</SelectItem>
          <SelectItem value="equivalent">{CATALOG_STRINGS.filters.originEquivalent}</SelectItem>
        </SelectContent>
      </Select>

      {/* Veículo compatível */}
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={cn(
              (filters.vehicleBrand || filters.vehicleModel || filters.vehicleYear !== undefined) &&
                "border-primary text-primary",
            )}
          >
            <Icon icon="mdi:truck-outline" size={14} />
            {CATALOG_STRINGS.filters.vehicle}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72 space-y-2 p-3">
          <div className="space-y-1">
            <Label className="text-xs">{CATALOG_STRINGS.filters.vehicleBrand}</Label>
            <Select
              value={filters.vehicleBrand ?? "__all__"}
              onValueChange={(v) =>
                patch({
                  vehicleBrand: v === "__all__" ? undefined : v,
                  vehicleModel: undefined,
                })
              }
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todas</SelectItem>
                {vehicleBrandOptions.map((b) => (
                  <SelectItem key={b} value={b}>
                    {b}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{CATALOG_STRINGS.filters.vehicleModel}</Label>
            <Select
              value={filters.vehicleModel ?? "__all__"}
              onValueChange={(v) => patch({ vehicleModel: v === "__all__" ? undefined : v })}
              disabled={!filters.vehicleBrand}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos</SelectItem>
                {vehicleModelOptions.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{CATALOG_STRINGS.filters.vehicleYear}</Label>
            <Select
              value={filters.vehicleYear !== undefined ? String(filters.vehicleYear) : "__all__"}
              onValueChange={(v) => patch({ vehicleYear: v === "__all__" ? undefined : Number(v) })}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos</SelectItem>
                {vehicleYearOptions.map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </PopoverContent>
      </Popover>

      {/* Preço */}
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={cn(
              (filters.priceMin !== undefined || filters.priceMax !== undefined) &&
                "border-primary text-primary",
            )}
          >
            <Icon icon="mdi:cash" size={14} />
            {CATALOG_STRINGS.filters.price}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-60 space-y-2 p-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">{CATALOG_STRINGS.filters.priceMin}</Label>
              <Input
                type="number"
                inputMode="decimal"
                value={filters.priceMin ?? ""}
                onChange={(e) =>
                  patch({
                    priceMin: e.target.value === "" ? undefined : Number(e.target.value),
                  })
                }
                className="h-8"
              />
            </div>
            <div>
              <Label className="text-xs">{CATALOG_STRINGS.filters.priceMax}</Label>
              <Input
                type="number"
                inputMode="decimal"
                value={filters.priceMax ?? ""}
                onChange={(e) =>
                  patch({
                    priceMax: e.target.value === "" ? undefined : Number(e.target.value),
                  })
                }
                className="h-8"
              />
            </div>
          </div>
        </PopoverContent>
      </Popover>

      {/* Estoque */}
      <Select value={filters.stock} onValueChange={(v) => patch({ stock: v as StockBucket })}>
        <SelectTrigger className="h-8 w-32 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="any">{CATALOG_STRINGS.filters.stockAny}</SelectItem>
          <SelectItem value="in_stock">{CATALOG_STRINGS.filters.stockInStock}</SelectItem>
          <SelectItem value="low">{CATALOG_STRINGS.filters.stockLow}</SelectItem>
          <SelectItem value="zero">{CATALOG_STRINGS.filters.stockZero}</SelectItem>
        </SelectContent>
      </Select>

      {/* Status */}
      <Select value={filters.status} onValueChange={(v) => patch({ status: v as StatusBucket })}>
        <SelectTrigger className="h-8 w-32 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="active">{CATALOG_STRINGS.filters.statusActive}</SelectItem>
          <SelectItem value="inactive">{CATALOG_STRINGS.filters.statusInactive}</SelectItem>
          <SelectItem value="any">Todos</SelectItem>
        </SelectContent>
      </Select>

      {canFilterStore && stores.length > 1 && (
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm">
              <Icon icon="mdi:store-outline" size={14} />
              {CATALOG_STRINGS.filters.store}
              {filters.storeIds.length > 0 && (
                <span className="ml-1 rounded-full bg-primary/15 px-1.5 text-[10px] font-semibold text-primary">
                  {filters.storeIds.length}
                </span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-56 p-2">
            <div className="space-y-1">
              {stores.map((s) => {
                const checked = filters.storeIds.includes(s.id);
                return (
                  <label
                    key={s.id}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(v) => toggleStore(s.id, v === true)}
                    />
                    <span>{s.name}</span>
                  </label>
                );
              })}
            </div>
          </PopoverContent>
        </Popover>
      )}

      {count > 0 && (
        <Button variant="ghost" size="sm" onClick={onClear} className="ml-auto text-xs">
          <Icon icon="mdi:close-circle-outline" size={14} />
          {CATALOG_STRINGS.filters.clear}
          <span className="ml-1 text-muted-foreground">·</span>
          <span className="text-muted-foreground">
            {CATALOG_STRINGS.filters.activeCount(count)}
          </span>
        </Button>
      )}
    </div>
  );
}
