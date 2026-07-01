import { Icon } from "@/components/Icon";
import { INBOX_STRINGS } from "../i18n/pt-BR";

export interface IMessageSearchBannerProps {
  term: string;
  onBack: () => void;
}

/** Banner shown above the Inbox list while in "search inside messages" mode (Opção D). */
export function MessageSearchBanner({ term, onBack }: IMessageSearchBannerProps) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-primary/25 bg-primary/10 px-3 py-1.5 text-xs">
      <span className="flex items-center gap-1.5 font-medium text-primary">
        <Icon icon="mdi:text-search" size={14} />
        {INBOX_STRINGS.messageSearch.bannerTitle(term)}
      </span>
      <button
        type="button"
        className="shrink-0 font-medium text-foreground hover:underline"
        onClick={onBack}
      >
        {INBOX_STRINGS.messageSearch.bannerBack}
      </button>
    </div>
  );
}
