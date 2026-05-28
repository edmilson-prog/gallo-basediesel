import type { IPart } from "@/shared/types";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { SearchFilters } from "./SearchFilters";
import type { IUseSearchFiltersResult } from "../hooks/useSearchFilters";
import { STOREFRONT_SEARCH_STRINGS as S } from "../i18n/pt-BR";

export interface IMobileFiltersSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  controller: IUseSearchFiltersResult;
  parts: IPart[];
  vehicleBrandOptions: string[];
  totalCount: number;
}

/**
 * Slide-in drawer wrapping the SearchFilters on small viewports
 * (PRD-061 RF-025/026). The CTA closes the sheet so the user lands on
 * the refined result list immediately.
 */
export function MobileFiltersSheet({
  open,
  onOpenChange,
  controller,
  parts,
  vehicleBrandOptions,
  totalCount,
}: IMobileFiltersSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="flex w-full max-w-md flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b border-border p-4">
          <SheetTitle className="text-left">{S.filtersTitle}</SheetTitle>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto p-4">
          <SearchFilters
            controller={controller}
            parts={parts}
            vehicleBrandOptions={vehicleBrandOptions}
          />
        </div>
        <SheetFooter className="border-t border-border p-4">
          <Button className="w-full" onClick={() => onOpenChange(false)}>
            {S.filtersMobileApply} · {S.resultsCount(totalCount)}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
