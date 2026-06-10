import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { INBOX_STRINGS } from "../i18n/pt-BR";

export interface IRealtimeToggleProps {
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  /**
   * Channel health (PRD-105). When enabled but not yet connected the icon goes
   * amber ("conectando"). Defaults to true so the mock simulator keeps the
   * solid green state it always had.
   */
  connected?: boolean;
}

export function RealtimeToggle({ enabled, onToggle, connected = true }: IRealtimeToggleProps) {
  const connecting = enabled && !connected;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-pressed={enabled}
          aria-label={INBOX_STRINGS.realtimeToggleLabel}
          onClick={() => onToggle(!enabled)}
          className={cn(
            "h-8 w-8 p-0",
            !enabled && "text-muted-foreground",
            enabled && !connecting && "text-emerald-600 dark:text-emerald-400",
            connecting && "text-amber-500 dark:text-amber-400",
          )}
        >
          <Icon icon={enabled ? "mdi:radio-tower" : "mdi:radio-tower-off"} size={16} />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {!enabled
          ? INBOX_STRINGS.realtimePaused
          : connecting
            ? INBOX_STRINGS.realtimeConnecting
            : INBOX_STRINGS.realtimeActive}
      </TooltipContent>
    </Tooltip>
  );
}
