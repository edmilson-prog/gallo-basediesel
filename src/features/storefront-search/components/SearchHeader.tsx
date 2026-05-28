import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import type { IPart, PartCategory } from "@/shared/types";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Icon } from "@/components/Icon";
import { useAutoComplete } from "../hooks/useAutoComplete";
import { AutoCompleteDropdown } from "./AutoCompleteDropdown";
import type { IUseSearchFiltersResult, SearchSort } from "../hooks/useSearchFilters";
import { STOREFRONT_SEARCH_STRINGS as S } from "../i18n/pt-BR";

export interface ISearchHeaderProps {
  controller: IUseSearchFiltersResult;
  parts: IPart[];
  vehicleBrandOptions: string[];
  totalCount: number;
  isLoading: boolean;
  onOpenMobileFilters?: () => void;
  activeFilterCount: number;
}

/**
 * Page header for `/loja/busca`: large search input with debounced
 * auto-complete dropdown, result counter and sort selector. Submits on
 * Enter; URL sync is delegated to the filter controller.
 */
export function SearchHeader({
  controller,
  parts,
  vehicleBrandOptions,
  totalCount,
  isLoading,
  onOpenMobileFilters,
  activeFilterCount,
}: ISearchHeaderProps) {
  const navigate = useNavigate();
  const [draft, setDraft] = useState(controller.state.q);
  const [acOpen, setAcOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  // Keep the input in sync if the URL changes externally (e.g. from a
  // category click in the auto-complete or a back navigation).
  useEffect(() => {
    setDraft(controller.state.q);
  }, [controller.state.q]);

  // Close auto-complete on outside click.
  useEffect(() => {
    if (!acOpen) return undefined;
    const handler = (e: MouseEvent) => {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(e.target as Node)) setAcOpen(false);
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, [acOpen]);

  const { suggestions } = useAutoComplete(draft, parts, vehicleBrandOptions);

  const submitSearch = () => {
    controller.setQuery(draft);
    setAcOpen(false);
  };

  return (
    <header className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            {S.pageTitle}
          </h1>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">{S.resultsLoading}</p>
          ) : (
            <p className="text-sm text-muted-foreground">{S.resultsCount(totalCount)}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {onOpenMobileFilters && (
            <Button variant="outline" size="sm" onClick={onOpenMobileFilters} className="lg:hidden">
              <Icon icon="mdi:filter-variant" size={14} className="mr-1" aria-hidden />
              {S.filtersMobileCta}
              {activeFilterCount > 0 && (
                <span className="ml-1.5 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">
                  {activeFilterCount}
                </span>
              )}
            </Button>
          )}
          <Select
            value={controller.state.sort}
            onValueChange={(v) => controller.setSort(v as SearchSort)}
          >
            <SelectTrigger className="min-w-[180px] bg-background" aria-label={S.sortLabel}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="relevance">{S.sortRelevance}</SelectItem>
              <SelectItem value="price-asc">{S.sortPriceAsc}</SelectItem>
              <SelectItem value="price-desc">{S.sortPriceDesc}</SelectItem>
              <SelectItem value="top-selling">{S.sortTopSelling}</SelectItem>
              <SelectItem value="newest">{S.sortNewest}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="relative" ref={wrapperRef}>
        <form
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            submitSearch();
          }}
        >
          <Icon
            icon="mdi:magnify"
            size={20}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            value={draft}
            placeholder={S.searchPlaceholder}
            aria-label={S.searchAriaLabel}
            className="h-12 pl-10 pr-12 text-base"
            onChange={(e) => {
              setDraft(e.target.value);
              setAcOpen(true);
            }}
            onFocus={() => setAcOpen(true)}
          />
          {draft.length > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-2 top-1/2 h-8 w-8 -translate-y-1/2"
              aria-label="Limpar busca"
              onClick={() => {
                setDraft("");
                controller.setQuery("");
                setAcOpen(false);
              }}
            >
              <Icon icon="mdi:close" size={16} />
            </Button>
          )}
        </form>

        <AutoCompleteDropdown
          open={acOpen}
          query={draft}
          suggestions={suggestions}
          onSelectCategory={(slug) => {
            controller.toggleCategory(slug as PartCategory);
            setAcOpen(false);
          }}
          onSelectBrand={(brand) => {
            controller.setBrand(brand);
            setAcOpen(false);
          }}
          onSelectProduct={() => void navigate}
          onClose={() => setAcOpen(false)}
        />
      </div>
    </header>
  );
}
