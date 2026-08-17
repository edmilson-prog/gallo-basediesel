import type { ISupplier, SupplierCategory } from "@/shared/types";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { SUPPLIERS_STRINGS } from "../../i18n/pt-BR";
import { nextSort, type ISuppliersSort, type SupplierSortBy } from "../../utils/sort";
import { SuppliersSearch } from "./SuppliersSearch";

const COPY = SUPPLIERS_STRINGS;

const CATEGORIES: Array<SupplierCategory | "all"> = [
  "all",
  "parts",
  "services",
  "freight",
  "financial",
];

const SORTS: SupplierSortBy[] = ["name", "parts", "purchases", "completeness"];

interface ISuppliersFiltersBarProps {
  suppliers: ISupplier[];
  category: SupplierCategory | "all";
  onCategoryChange: (category: SupplierCategory | "all") => void;
  search: string;
  onSearchChange: (value: string) => void;
  sort: ISuppliersSort;
  onSortChange: (sort: ISuppliersSort) => void;
  canCreate: boolean;
  onCreate: () => void;
}

export function SuppliersFiltersBar({
  suppliers,
  category,
  onCategoryChange,
  search,
  onSearchChange,
  sort,
  onSortChange,
  canCreate,
  onCreate,
}: ISuppliersFiltersBarProps) {
  const countFor = (key: SupplierCategory | "all") =>
    key === "all" ? suppliers.length : suppliers.filter((s) => s.category === key).length;

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      {CATEGORIES.map((key) => {
        const on = category === key;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onCategoryChange(key)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
              on
                ? "border-primary/50 bg-primary/15 text-foreground"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {COPY.categories[key === "all" ? "all" : key]}
            <span className="ml-1.5 text-muted-foreground">{countFor(key)}</span>
          </button>
        );
      })}

      <div className="ml-auto flex shrink-0 items-center gap-2">
        <SuppliersSearch value={search} onChange={onSearchChange} />
        <div className="flex shrink-0 items-center gap-0.5 rounded-lg border border-border p-0.5">
          {SORTS.map((by) => (
            <button
              key={by}
              type="button"
              onClick={() => onSortChange(nextSort(sort, by))}
              className={cn(
                "rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors",
                sort.by === by
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {COPY.sort[by]}
            </button>
          ))}
        </div>
        {canCreate && (
          <Button size="sm" className="shrink-0" onClick={onCreate}>
            <Icon icon="mdi:plus" size={16} />
            {COPY.actions.create}
          </Button>
        )}
      </div>
    </div>
  );
}
