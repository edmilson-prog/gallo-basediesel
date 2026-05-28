import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { STOREFRONT_SEARCH_STRINGS as S } from "../i18n/pt-BR";

export interface ISearchPaginationProps {
  page: number;
  pageCount: number;
  onChange: (page: number) => void;
}

export function SearchPagination({ page, pageCount, onChange }: ISearchPaginationProps) {
  if (pageCount <= 1) return null;
  const canPrev = page > 1;
  const canNext = page < pageCount;
  return (
    <nav className="flex items-center justify-between gap-3 py-4" aria-label="Paginação">
      <Button
        variant="outline"
        size="sm"
        onClick={() => canPrev && onChange(page - 1)}
        disabled={!canPrev}
      >
        <Icon icon="mdi:chevron-left" size={16} className="mr-1" aria-hidden />
        {S.paginationPrev}
      </Button>
      <span className="text-sm text-muted-foreground">{S.paginationLabel(page, pageCount)}</span>
      <Button
        variant="outline"
        size="sm"
        onClick={() => canNext && onChange(page + 1)}
        disabled={!canNext}
      >
        {S.paginationNext}
        <Icon icon="mdi:chevron-right" size={16} className="ml-1" aria-hidden />
      </Button>
    </nav>
  );
}
