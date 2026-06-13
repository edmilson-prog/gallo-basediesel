import { Icon } from "@/components/Icon";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { SchedulingViewMode } from "../../hooks/useSchedulingViewMode";
import { QUICK_SEND_STRINGS } from "../../i18n/pt-BR";

export interface IScheduleModeSwitcherProps {
  mode: SchedulingViewMode;
  onModeChange: (mode: SchedulingViewMode) => void;
}

const MODES: { id: SchedulingViewMode; icon: string; label: string }[] = [
  { id: "modal", icon: "mdi:card-outline", label: QUICK_SEND_STRINGS.schedule.modeModal },
  { id: "drawer", icon: "mdi:dock-right", label: QUICK_SEND_STRINGS.schedule.modeDrawer },
  { id: "inline", icon: "mdi:dock-bottom", label: QUICK_SEND_STRINGS.schedule.modeInline },
  { id: "timeline", icon: "mdi:timeline-clock-outline", label: QUICK_SEND_STRINGS.schedule.modeTimeline },
];

export function ScheduleModeSwitcher({ mode, onModeChange }: IScheduleModeSwitcherProps) {
  return (
    <ToggleGroup
      type="single"
      value={mode}
      onValueChange={(v) => v && onModeChange(v as SchedulingViewMode)}
      aria-label={QUICK_SEND_STRINGS.schedule.modeSwitcherLabel}
      className="gap-0.5"
    >
      {MODES.map((m) => (
        <Tooltip key={m.id}>
          <TooltipTrigger asChild>
            <ToggleGroupItem
              value={m.id}
              aria-label={m.label}
              className="h-7 w-7 p-0 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
            >
              <Icon icon={m.icon} size={15} />
            </ToggleGroupItem>
          </TooltipTrigger>
          <TooltipContent>{m.label}</TooltipContent>
        </Tooltip>
      ))}
    </ToggleGroup>
  );
}
