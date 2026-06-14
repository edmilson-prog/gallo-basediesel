import { Icon } from "@/components/Icon";
import {
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";
import { CONVERSATION_STRINGS } from "../../i18n/pt-BR";
import { STATUS_CONTROL_MODES, type StatusControlMode } from "../../engine/statusControlMode";

/**
 * Status-control display-mode picker rendered as a nested sub-menu, so it can
 * live inside the conversation's "more actions" (kebab) menu as an
 * option → sub-options entry instead of a standalone header button.
 */
export function StatusControlModeSubmenu({
  value,
  onChange,
}: {
  value: StatusControlMode;
  onChange: (mode: StatusControlMode) => void;
}) {
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <Icon icon="mdi:cog-outline" size={14} className="mr-2" />
        {CONVERSATION_STRINGS.statusControl.modeSwitchLabel}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="w-44">
        <DropdownMenuLabel>{CONVERSATION_STRINGS.statusControl.modeSwitchLabel}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={value}
          onValueChange={(v) => onChange(v as StatusControlMode)}
        >
          {STATUS_CONTROL_MODES.map((m) => (
            <DropdownMenuRadioItem key={m} value={m}>
              {CONVERSATION_STRINGS.statusControl.modes[m]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}
