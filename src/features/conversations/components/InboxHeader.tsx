import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/Icon";
import { RealtimeToggle } from "./RealtimeToggle";
import { INBOX_STRINGS } from "../i18n/pt-BR";

export interface IInboxHeaderProps {
  totalLabel: string;
  unreadGlobal: number;
  realtimeEnabled: boolean;
  onToggleRealtime: (next: boolean) => void;
  sortDescription?: string;
  /** Realtime channel health (PRD-105) — undefined keeps the mock behaviour. */
  realtimeConnected?: boolean;
}

export function InboxHeader({
  totalLabel,
  unreadGlobal,
  realtimeEnabled,
  onToggleRealtime,
  sortDescription,
  realtimeConnected,
}: IInboxHeaderProps) {
  return (
    <div className="flex flex-col gap-1 border-b border-border px-3 py-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon icon="mdi:inbox" size={18} className="text-muted-foreground" />
          <h1 className="text-sm font-semibold text-foreground">{INBOX_STRINGS.pageTitle}</h1>
          <span className="text-xs text-muted-foreground">{totalLabel}</span>
          {unreadGlobal > 0 && (
            <Badge variant="default" className="h-5 px-1.5 text-[10px]">
              {INBOX_STRINGS.unreadGlobal(unreadGlobal)}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          <RealtimeToggle
            enabled={realtimeEnabled}
            onToggle={onToggleRealtime}
            connected={realtimeConnected}
          />
        </div>
      </div>
      <div className="flex min-h-[1rem] items-center justify-between text-[11px] text-muted-foreground">
        {sortDescription && (
          <span>
            {INBOX_STRINGS.sortBy} <span className="font-medium">{sortDescription}</span>
          </span>
        )}
        {!realtimeEnabled && (
          <span className="ml-auto inline-flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground" />
            {INBOX_STRINGS.realtimePaused}
          </span>
        )}
      </div>
    </div>
  );
}
