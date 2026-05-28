import { useMemo } from "react";
import type { IPart, PartCategory } from "@/shared/types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Icon } from "@/components/Icon";
import { PART_CATEGORY_DESCRIPTORS } from "@/features/catalog";
import { VehicleFilter } from "./VehicleFilter";
import type { IUseSearchFiltersResult } from "../hooks/useSearchFilters";
import { STOREFRONT_SEARCH_STRINGS as S } from "../i18n/pt-BR";

export interface ISearchFiltersProps {
  controller: IUseSearchFiltersResult;
  /** Catalog used to derive vehicle + manufacturer dropdowns. */
  parts: IPart[];
  /** Optional brands of compatible vehicles surfaced as a quick radio. */
  vehicleBrandOptions: string[];
}

/**
 * Sidebar / drawer body for `/loja/busca` (PRD-061 RF-008/009/010).
 *
 * Wires the URL-synced controller from {@link useSearchFilters} into the
 * concrete UI. The vehicle filter is rendered first (commercial highlight)
 * and the price / stock filters go last.
 */
export function SearchFilters({ controller, parts, vehicleBrandOptions }: ISearchFiltersProps) {
  const state = controller.state;

  const manufacturers = useMemo(() => {
    const set = new Set<string>();
    for (const p of parts) {
      if (p.brand) set.add(p.brand);
    }
    return [...set].sort();
  }, [parts]);

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

      <VehicleFilter
        brand={state.vehicle.brand}
        model={state.vehicle.model}
        year={state.vehicle.year}
        parts={parts}
        onApply={controller.setVehicle}
      />

      <FilterCard title={S.brandFilterTitle}>
        <RadioGroup
          value={state.brand ?? "all"}
          onValueChange={(v) => controller.setBrand(v === "all" ? null : v)}
          className="space-y-1"
        >
          <RadioOption value="all" label={S.brandFilterAll} />
          {vehicleBrandOptions.map((b) => (
            <RadioOption key={b} value={b} label={b} />
          ))}
        </RadioGroup>
      </FilterCard>

      <FilterCard title={S.categoryFilterTitle}>
        <ul className="space-y-1">
          {PART_CATEGORY_DESCRIPTORS.map((cat) => {
            const checked = state.categories.includes(cat.value as PartCategory);
            return (
              <li key={cat.value}>
                <label className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1 text-sm hover:bg-muted/60">
                  <Checkbox
                    checked={checked}
                    onCheckedChange={() => controller.toggleCategory(cat.value as PartCategory)}
                  />
                  <Icon icon={cat.icon} size={14} className="text-primary" aria-hidden />
                  {cat.label}
                </label>
              </li>
            );
          })}
        </ul>
      </FilterCard>

      <FilterCard title={S.typeFilterTitle}>
        <RadioGroup
          value={state.type}
          onValueChange={(v) => controller.setType(v as "all" | "original" | "equivalent")}
          className="space-y-1"
        >
          <RadioOption value="all" label={S.typeAll} />
          <RadioOption value="original" label={S.typeOriginal} />
          <RadioOption value="equivalent" label={S.typeEquivalent} />
        </RadioGroup>
      </FilterCard>

      <FilterCard title={S.manufacturerFilterTitle}>
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

      <FilterCard title={S.priceFilterTitle}>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            inputMode="numeric"
            min={0}
            placeholder={S.priceMinPlaceholder}
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
            placeholder={S.priceMaxPlaceholder}
            value={state.priceMax ?? ""}
            onChange={(e) => {
              const value = e.target.value === "" ? null : Number(e.target.value);
              controller.setPriceRange(state.priceMin, value);
            }}
          />
        </div>
      </FilterCard>

      <FilterCard title={S.stockFilterTitle}>
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="filter-only-in-stock" className="text-sm">
            {S.stockOnlyAvailable}
          </Label>
          <Switch
            id="filter-only-in-stock"
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
