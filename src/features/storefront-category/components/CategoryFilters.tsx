import { useMemo } from "react";
import type { IPart } from "@/shared/types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Icon } from "@/components/Icon";
import { getSubcategoriesFor } from "@/features/catalog";
import type { ICategorySlugMapping } from "../data/slugs";
import type { CategoryType, IUseCategoryFiltersResult } from "../hooks/useCategoryFilters";
import { STOREFRONT_CATEGORY_STRINGS as S } from "../i18n/pt-BR";

export interface ICategoryFiltersProps {
  controller: IUseCategoryFiltersResult;
  mapping: ICategorySlugMapping;
  /** Parts already filtered down to the active scope (category/special). */
  scopeParts: IPart[];
}

/**
 * Sidebar of the category page (PRD-062 RF-013/014/015).
 *
 * Filters are intentionally lighter than `/loja/busca`: the category itself
 * is encoded in the URL path, so we expose only the secondary controls that
 * narrow inside the active scope.
 */
export function CategoryFilters({ controller, mapping, scopeParts }: ICategoryFiltersProps) {
  const state = controller.state;

  const subcategories = useMemo(() => {
    // Special listings have heterogeneous categories; surface the union of
    // subcategories actually present in the scope so the filter is useful.
    if (mapping.kind === "category") {
      const declared = getSubcategoriesFor(mapping.category);
      if (declared.length > 0) return [...declared];
    }
    const set = new Set<string>();
    for (const p of scopeParts) {
      if (p.subcategory) set.add(p.subcategory);
    }
    return [...set].sort();
  }, [mapping, scopeParts]);

  const vehicleBrandOptions = useMemo(() => {
    const set = new Set<string>();
    for (const p of scopeParts) {
      for (const app of p.applications) set.add(app.vehicleBrand);
    }
    return [...set].sort();
  }, [scopeParts]);

  const manufacturers = useMemo(() => {
    const set = new Set<string>();
    for (const p of scopeParts) {
      if (p.brand) set.add(p.brand);
    }
    return [...set].sort();
  }, [scopeParts]);

  return (
    <aside className="flex flex-col gap-4" aria-label={S.filtersTitle}>
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-foreground">
          {S.filtersTitle}
        </h2>
        {controller.activeCount > 0 && (
          <Button variant="ghost" size="sm" className="text-xs" onClick={controller.reset}>
            <Icon icon="mdi:filter-remove-outline" size={14} className="mr-1" aria-hidden />
            {S.filtersClearAll}
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">{S.filtersActive(controller.activeCount)}</p>

      {subcategories.length > 0 && (
        <FilterCard title={S.filtersSubcategoryTitle}>
          <RadioGroup
            value={state.subcategory ?? "all"}
            onValueChange={(v) => controller.setSubcategory(v === "all" ? null : v)}
            className="space-y-1"
          >
            <RadioOption value="all" label={S.filtersBrandAll} />
            {subcategories.map((sub) => (
              <RadioOption key={sub} value={sub} label={capitalize(sub)} />
            ))}
          </RadioGroup>
        </FilterCard>
      )}

      {vehicleBrandOptions.length > 0 && (
        <FilterCard title={S.filtersBrandTitle}>
          <RadioGroup
            value={state.brand ?? "all"}
            onValueChange={(v) => controller.setBrand(v === "all" ? null : v)}
            className="space-y-1"
          >
            <RadioOption value="all" label={S.filtersBrandAll} />
            {vehicleBrandOptions.map((b) => (
              <RadioOption key={b} value={b} label={b} />
            ))}
          </RadioGroup>
        </FilterCard>
      )}

      <FilterCard title={S.filtersTypeTitle}>
        <RadioGroup
          value={state.type}
          onValueChange={(v) => controller.setType(v as CategoryType)}
          className="space-y-1"
        >
          <RadioOption value="all" label={S.filtersTypeAll} />
          <RadioOption value="original" label={S.filtersTypeOriginal} />
          <RadioOption value="equivalent" label={S.filtersTypeEquivalent} />
        </RadioGroup>
      </FilterCard>

      {manufacturers.length > 1 && (
        <FilterCard title={S.filtersManufacturerTitle}>
          <ul className="space-y-1 max-h-48 overflow-y-auto pr-1">
            {manufacturers.map((m) => {
              const checked = state.manufacturers.includes(m);
              return (
                <li key={m}>
                  <label className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1 text-sm hover:bg-muted/60">
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => controller.toggleManufacturer(m)}
                    />
                    {m}
                  </label>
                </li>
              );
            })}
          </ul>
        </FilterCard>
      )}

      <FilterCard title={S.filtersPriceTitle}>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            inputMode="numeric"
            min={0}
            placeholder={S.filtersPriceMinPlaceholder}
            value={state.priceMin ?? ""}
            onChange={(e) => {
              const value = e.target.value === "" ? null : Number(e.target.value);
              controller.setPriceRange(value, state.priceMax);
            }}
          />
          <span aria-hidden className="text-muted-foreground">
            —
          </span>
          <Input
            type="number"
            inputMode="numeric"
            min={0}
            placeholder={S.filtersPriceMaxPlaceholder}
            value={state.priceMax ?? ""}
            onChange={(e) => {
              const value = e.target.value === "" ? null : Number(e.target.value);
              controller.setPriceRange(state.priceMin, value);
            }}
          />
        </div>
      </FilterCard>

      <FilterCard title={S.filtersStockTitle}>
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="category-only-in-stock" className="text-sm">
            {S.filtersStockOnlyAvailable}
          </Label>
          <Switch
            id="category-only-in-stock"
            checked={state.onlyInStock}
            onCheckedChange={controller.setOnlyInStock}
          />
        </div>
      </FilterCard>
    </aside>
  );
}

function FilterCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="space-y-2 p-3">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h3>
      {children}
    </Card>
  );
}

function RadioOption({ value, label }: { value: string; label: string }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1 text-sm hover:bg-muted/60">
      <RadioGroupItem value={value} />
      {label}
    </label>
  );
}

function capitalize(value: string): string {
  if (value.length === 0) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}
