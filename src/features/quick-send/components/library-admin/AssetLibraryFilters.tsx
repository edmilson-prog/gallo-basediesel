// src/features/quick-send/components/library-admin/AssetLibraryFilters.tsx
import type { AssetCategory, AssetStatus } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { Toggle } from "@/components/ui/toggle";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { QUICK_SEND_STRINGS } from "../../i18n/pt-BR";

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface IAssetLibraryFiltersValue {
  category?: AssetCategory;
  brand?: string;
  productLine?: string;
  status?: AssetStatus;
  sensitiveOnly?: boolean;
}

export interface IAssetLibraryFiltersProps {
  value: IAssetLibraryFiltersValue;
  brands: string[];
  productLines: string[];
  onChange: (next: IAssetLibraryFiltersValue) => void;
}

// ---------------------------------------------------------------------------
// Label maps (pt-BR) — appended to library group (categoryLabels)
// ---------------------------------------------------------------------------

const CATEGORY_LABELS: Record<AssetCategory, string> = {
  catalogo: "Catálogo",
  ficha_tecnica: "Ficha técnica",
  tabela_preco: "Tabela de preço",
  garantia: "Garantia",
  video: "Vídeo",
  link: "Link",
};

const STATUS_LABELS: Record<AssetStatus, string> = {
  published: QUICK_SEND_STRINGS.library.statusPublished,
  draft: QUICK_SEND_STRINGS.library.draft,
  archived: QUICK_SEND_STRINGS.library.archived,
};

// Sentinel value used internally to represent "no filter selected"
const ALL = "__all__";

const CATEGORIES: AssetCategory[] = [
  "catalogo",
  "ficha_tecnica",
  "tabela_preco",
  "garantia",
  "video",
  "link",
];

const STATUSES: AssetStatus[] = ["published", "draft", "archived"];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AssetLibraryFilters({
  value,
  brands,
  productLines,
  onChange,
}: IAssetLibraryFiltersProps) {
  const s = QUICK_SEND_STRINGS.library;

  // Count active filter fields (sensitiveOnly=false is not active)
  const activeCount = [
    value.category,
    value.brand,
    value.productLine,
    value.status,
    value.sensitiveOnly || undefined,
  ].filter(Boolean).length;

  // Immutable helpers
  function set<K extends keyof IAssetLibraryFiltersValue>(
    key: K,
    val: IAssetLibraryFiltersValue[K],
  ) {
    onChange({ ...value, [key]: val });
  }

  function clearAll() {
    onChange({});
  }

  // Select onChange helpers — maps the sentinel ALL back to undefined
  function handleSelectChange(
    key: "category" | "brand" | "productLine" | "status",
    raw: string,
  ) {
    if (raw === ALL) {
      const next = { ...value };
      delete next[key];
      onChange(next);
    } else {
      set(key, raw as never);
    }
  }

  return (
    <div
      className="flex flex-wrap items-center gap-2 border-b border-border bg-card px-3 py-2"
      role="group"
      aria-label={s.filterCategory}
    >
      {/* Categoria */}
      <Select
        value={value.category ?? ALL}
        onValueChange={(v) => handleSelectChange("category", v)}
      >
        <SelectTrigger
          className="h-8 w-[160px] cursor-pointer text-xs"
          aria-label={s.filterCategory}
        >
          <SelectValue placeholder={s.filterCategory} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{s.filterCategory}</SelectItem>
          {CATEGORIES.map((c) => (
            <SelectItem key={c} value={c}>
              {CATEGORY_LABELS[c]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Marca */}
      <Select
        value={value.brand ?? ALL}
        onValueChange={(v) => handleSelectChange("brand", v)}
        disabled={brands.length === 0}
      >
        <SelectTrigger
          className="h-8 w-[160px] cursor-pointer text-xs"
          aria-label={s.filterBrand}
        >
          <SelectValue placeholder={s.filterBrand} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{s.filterBrand}</SelectItem>
          {brands.map((b) => (
            <SelectItem key={b} value={b}>
              {b}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Linha */}
      <Select
        value={value.productLine ?? ALL}
        onValueChange={(v) => handleSelectChange("productLine", v)}
        disabled={productLines.length === 0}
      >
        <SelectTrigger
          className="h-8 w-[160px] cursor-pointer text-xs"
          aria-label={s.filterLine}
        >
          <SelectValue placeholder={s.filterLine} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{s.filterLine}</SelectItem>
          {productLines.map((l) => (
            <SelectItem key={l} value={l}>
              {l}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Status */}
      <Select
        value={value.status ?? ALL}
        onValueChange={(v) => handleSelectChange("status", v)}
      >
        <SelectTrigger
          className="h-8 w-[120px] cursor-pointer text-xs"
          aria-label={s.filterStatus}
        >
          <SelectValue placeholder={s.filterStatus} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{s.filterStatus}</SelectItem>
          {STATUSES.map((st) => (
            <SelectItem key={st} value={st}>
              {STATUS_LABELS[st]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Sensível toggle */}
      <Toggle
        pressed={value.sensitiveOnly === true}
        onPressedChange={(pressed) => set("sensitiveOnly", pressed || undefined)}
        variant="outline"
        size="sm"
        aria-label={s.filterSensitive}
        className="h-8 cursor-pointer gap-1.5 px-2 text-xs"
      >
        <Icon icon="mdi:eye-off-outline" size={14} aria-hidden />
        {s.filterSensitive}
      </Toggle>

      {/* Active count + clear */}
      {activeCount > 0 && (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 cursor-pointer gap-1 px-2 text-xs"
          onClick={clearAll}
          aria-label={s.clearFilters}
        >
          <Icon icon="mdi:filter-remove-outline" size={14} aria-hidden />
          {s.clearFilters}
          <span className="ml-1 rounded-full bg-muted px-1.5 text-[10px]">{activeCount}</span>
        </Button>
      )}
    </div>
  );
}
