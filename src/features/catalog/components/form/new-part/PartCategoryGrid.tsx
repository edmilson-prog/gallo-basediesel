import type { PartCategory } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { CATALOG_STRINGS } from "../../../i18n/pt-BR";
import { getSubcategoriesFor } from "../../../utils/categories";
import { useCategoryDescriptors } from "../../../hooks/useCategoryDescriptors";

const COPY = CATALOG_STRINGS.newPart.category;

export interface IPartCategoryGridProps {
  category: PartCategory | undefined;
  subcategory: string | undefined;
  onCategoryChange: (next: PartCategory | undefined) => void;
  onSubcategoryChange: (next: string | undefined) => void;
  invalid?: boolean;
}

/**
 * Category as a grid of one-click tiles instead of a dropdown.
 *
 * Ten options fit on screen at once, and 1.981 of the 2.778 rows in the base
 * have no category at all — the cost of the dropdown was one extra click and
 * one extra decision on the single field that most often goes unfilled.
 *
 * Selection is carried by the semantic `primary` token plus a check glyph, not
 * by the family colour: the ten tones are raw Tailwind hues that mean "which
 * family", and reusing them for "which one did I pick" would make the state
 * unreadable for anyone who can't separate emerald from lime.
 */
export function PartCategoryGrid({
  category,
  subcategory,
  onCategoryChange,
  onSubcategoryChange,
  invalid,
}: IPartCategoryGridProps) {
  const { descriptors, active: categoryOptions } = useCategoryDescriptors();
  const subcategories = getSubcategoriesFor(category, descriptors);

  const pickCategory = (value: PartCategory) => {
    const next = category === value ? undefined : value;
    onCategoryChange(next);
    onSubcategoryChange(undefined);
  };

  return (
    <div>
      <div
        className={cn(
          // Sized by the container, not by the viewport: this grid lives in a
          // column whose width does not track breakpoints.
          "grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-2",
          invalid && "rounded-lg ring-1 ring-severity-critical/60",
        )}
        role="group"
        aria-label={COPY.groupLabel}
      >
        {categoryOptions.map((descriptor) => {
          const selected = category === descriptor.value;
          return (
            <button
              key={descriptor.value}
              type="button"
              onClick={() => pickCategory(descriptor.value)}
              aria-pressed={selected}
              className={cn(
                "flex min-w-0 items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left",
                "transition-[background-color,border-color] duration-150 motion-reduce:transition-none",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:ring-offset-background",
                selected
                  ? "border-primary bg-primary/10 ring-1 ring-inset ring-primary"
                  : "border-border bg-muted/25 hover:bg-muted/60",
              )}
            >
              <span
                className={cn(
                  "grid size-[26px] shrink-0 place-items-center rounded-[7px]",
                  descriptor.tone,
                )}
              >
                <Icon icon={descriptor.icon} size={15} />
              </span>
              <span
                className={cn(
                  "min-w-0 flex-1 truncate text-[11.5px] font-bold",
                  selected ? "text-foreground" : "text-muted-foreground",
                )}
                title={descriptor.label}
              >
                {descriptor.label}
              </span>
              {selected && (
                <Icon icon="mdi:check" size={14} className="shrink-0 text-primary" aria-hidden />
              )}
            </button>
          );
        })}
      </div>

      {subcategories.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="mr-0.5 text-[10px] font-bold uppercase tracking-[0.13em] text-muted-foreground">
            {COPY.subcategoryLabel}
          </span>
          {subcategories.map((option) => {
            const selected = subcategory === option;
            return (
              <button
                key={option}
                type="button"
                aria-pressed={selected}
                onClick={() => onSubcategoryChange(selected ? undefined : option)}
                className={cn(
                  "rounded-md border px-2.5 py-1 text-[11px] font-bold",
                  "transition-colors duration-150 motion-reduce:transition-none",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:ring-offset-background",
                  selected
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-transparent text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                )}
              >
                {option}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
