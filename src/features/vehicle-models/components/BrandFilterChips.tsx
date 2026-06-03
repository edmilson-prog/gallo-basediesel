import { cn } from "@/lib/utils";
import { BrandAvatar } from "./BrandAvatar";

export interface IBrandFilterChipsProps {
  brands: readonly string[];
  selected: string | null;
  onSelect: (brand: string | null) => void;
}

export function BrandFilterChips({ brands, selected, onSelect }: IBrandFilterChipsProps) {
  return (
    <div role="group" aria-label="Filtrar por marca" className="flex gap-2 overflow-x-auto pb-1">
      <button
        type="button"
        aria-pressed={selected === null}
        onClick={() => onSelect(null)}
        className={cn(
          "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-border px-3 text-sm font-medium transition-colors",
          selected === null
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground",
        )}
      >
        Todas
      </button>
      {brands.map((brand) => (
        <button
          key={brand}
          type="button"
          aria-pressed={selected === brand}
          onClick={() => onSelect(brand)}
          className={cn(
            "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-border px-3 text-sm font-medium transition-colors",
            selected === brand
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground",
          )}
        >
          <BrandAvatar
            brand={brand}
            className={cn(
              "size-5 text-xs",
              selected === brand ? "bg-primary-foreground/20 text-primary-foreground" : "",
            )}
          />
          {brand}
        </button>
      ))}
    </div>
  );
}
