import { Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { STOREFRONT_CATEGORY_STRINGS as S } from "../i18n/pt-BR";

export interface ICategoryEmptyStateProps {
  /** Number of active secondary filters — when 0 we don't suggest "clear". */
  activeFilterCount: number;
  onClearFilters: () => void;
}

/**
 * Empty result state inside a category page (PRD-062 RF-033).
 */
export function CategoryEmptyState({
  activeFilterCount,
  onClearFilters,
}: ICategoryEmptyStateProps) {
  return (
    <Card className="flex flex-col items-center gap-4 border-dashed border-border bg-muted/30 p-10 text-center">
      <span className="grid h-16 w-16 place-items-center rounded-full bg-primary/10 text-primary">
        <Icon icon="mdi:package-variant-closed" size={32} aria-hidden />
      </span>
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-foreground">{S.emptyTitle}</h2>
        <p className="max-w-md text-sm text-muted-foreground">{S.emptyHint}</p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        {activeFilterCount > 0 && (
          <Button variant="outline" onClick={onClearFilters}>
            <Icon icon="mdi:filter-remove-outline" size={14} className="mr-1" aria-hidden />
            {S.emptyClearFilters}
          </Button>
        )}
        <Button asChild>
          <Link to="/loja">
            <Icon icon="mdi:storefront-outline" size={14} className="mr-1" aria-hidden />
            {S.emptyBackToCategories}
          </Link>
        </Button>
      </div>
    </Card>
  );
}
