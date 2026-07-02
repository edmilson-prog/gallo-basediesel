import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { INBOX_STRINGS } from "../i18n/pt-BR";

export interface IInboxEmptyStateProps {
  hasFilters: boolean;
  searchTerm: string;
  onClearFilters?: () => void;
  /** True while showing "search inside messages" results (Opção D) with zero matches. */
  messageSearchActive?: boolean;
}

export function InboxEmptyState({
  hasFilters,
  searchTerm,
  onClearFilters,
  messageSearchActive = false,
}: IInboxEmptyStateProps) {
  let title: string = INBOX_STRINGS.emptyDefault.title;
  let description: string = INBOX_STRINGS.emptyDefault.description;
  if (messageSearchActive) {
    title = INBOX_STRINGS.messageSearch.emptyTitle;
    description = INBOX_STRINGS.messageSearch.emptyDescription(searchTerm);
  } else if (searchTerm.length > 0) {
    const s = INBOX_STRINGS.emptySearch(searchTerm);
    title = s.title;
    description = s.description;
  } else if (hasFilters) {
    title = INBOX_STRINGS.emptyFiltered.title;
    description = INBOX_STRINGS.emptyFiltered.description;
  }
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Icon icon="mdi:inbox-outline" size={24} />
      </div>
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="max-w-[18rem] text-xs text-muted-foreground">{description}</p>
      {!messageSearchActive && hasFilters && onClearFilters && (
        <Button type="button" variant="outline" size="sm" onClick={onClearFilters} className="mt-2">
          {INBOX_STRINGS.clearAll}
        </Button>
      )}
    </div>
  );
}
