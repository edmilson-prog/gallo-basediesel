import type { IPart } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { PartResultRow } from "./PartResultRow";
import { PART_LOOKUP_STRINGS as S } from "../i18n/pt-BR";

export interface IPartResultListProps {
  parts: IPart[];
  isLoading: boolean;
  isError: boolean;
  query: string;
  activeId?: string;
  onSelect: (part: IPart) => void;
  onRetry: () => void;
  onOpenCatalog: () => void;
}

export function PartResultList(props: IPartResultListProps) {
  const { parts, isLoading, isError, query, activeId, onSelect, onRetry, onOpenCatalog } = props;

  if (isError) {
    return (
      <div className="rounded-md border border-severity-critical/50 bg-severity-critical/5 p-4 text-center text-sm">
        <p className="text-foreground">{S.error}</p>
        <Button variant="outline" size="sm" className="mt-2" onClick={onRetry}>
          {S.retry}
        </Button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-2" aria-busy="true">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="h-[52px] animate-pulse rounded-md border border-border bg-muted/40"
          />
        ))}
      </div>
    );
  }

  if (parts.length === 0) {
    return (
      <div className="rounded-md border border-border bg-card p-4 text-center text-sm">
        <p className="text-foreground">{query ? S.noResults(query) : S.emptyQuery}</p>
        {query && <p className="mt-1 text-xs text-muted-foreground">{S.noResultsHint}</p>}
        <Button variant="outline" size="sm" className="mt-2" onClick={onOpenCatalog}>
          <Icon icon="mdi:open-in-new" size={14} className="mr-1.5" />
          {S.openCatalog}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {parts.map((part) => (
        <PartResultRow
          key={part.id}
          part={part}
          active={part.id === activeId}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}
