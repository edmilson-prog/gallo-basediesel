import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { INBOX_STRINGS } from "../i18n/pt-BR";

export interface IRealtimeToggleProps {
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
}

export function RealtimeToggle({ enabled, onToggle }: IRealtimeToggleProps) {
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
            enabled ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground",
          )}
        >
          <Icon icon={enabled ? "mdi:radio-tower" : "mdi:radio-tower-off"} size={16} />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {enabled ? INBOX_STRINGS.realtimeActive : INBOX_STRINGS.realtimePaused}
      </TooltipContent>
    </Tooltip>
  );
}
