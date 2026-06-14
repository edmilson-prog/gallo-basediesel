import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { CONVERSATION_STRINGS } from "../../i18n/pt-BR";
import {
  STATUS_CONTROL_MODES,
  type StatusControlMode,
} from "../../engine/statusControlMode";

export function StatusControlModeSwitcher({
  value,
  onChange,
}: {
  value: StatusControlMode;
  onChange: (mode: StatusControlMode) => void;
}) {
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-muted-foreground"
              aria-label={CONVERSATION_STRINGS.statusControl.modeSwitchLabel}
            >
              <Icon icon="mdi:cog-outline" size={14} />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>{CONVERSATION_STRINGS.statusControl.modeSwitchLabel}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuLabel>{CONVERSATION_STRINGS.statusControl.modeSwitchLabel}</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={value} onValueChange={(v) => onChange(v as StatusControlMode)}>
          {STATUS_CONTROL_MODES.map((m) => (
            <DropdownMenuRadioItem key={m} value={m}>
              {CONVERSATION_STRINGS.statusControl.modes[m]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
