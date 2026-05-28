import type { IPart } from "@/shared/types";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { CategoryFilters } from "./CategoryFilters";
import type { ICategorySlugMapping } from "../data/slugs";
import type { IUseCategoryFiltersResult } from "../hooks/useCategoryFilters";
import { STOREFRONT_CATEGORY_STRINGS as S } from "../i18n/pt-BR";

export interface ICategoryMobileFiltersSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  controller: IUseCategoryFiltersResult;
  mapping: ICategorySlugMapping;
  scopeParts: IPart[];
  totalCount: number;
}

/**
 * Drawer wrapper around `CategoryFilters` for small viewports (PRD-062 RF-031).
 */
export function CategoryMobileFiltersSheet({
  open,
  onOpenChange,
  controller,
  mapping,
  scopeParts,
  totalCount,
}: ICategoryMobileFiltersSheetProps) {
  const countLabel =
    totalCount === 1 ? "1 produto" : `${totalCount.toLocaleString("pt-BR")} produtos`;
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="flex w-full max-w-md flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b border-border p-4">
          <SheetTitle className="text-left">{S.filtersTitle}</SheetTitle>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto p-4">
          <CategoryFilters controller={controller} mapping={mapping} scopeParts={scopeParts} />
        </div>
        <SheetFooter className="border-t border-border p-4">
          <Button className="w-full" onClick={() => onOpenChange(false)}>
            {S.filtersMobileApply} · {countLabel}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
