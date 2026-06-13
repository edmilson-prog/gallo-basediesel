import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { QUICK_SEND_STRINGS } from "../../../i18n/pt-BR";
import { ScheduleModeSwitcher } from "../ScheduleModeSwitcher";
import { SchedulingPanels } from "../SchedulingPanels";
import type { ISchedulingShellProps } from "../types";

/** Inline panel above the composer — pushes the history, never an overlay. */
export function SchedulingInlineShell(props: ISchedulingShellProps) {
  const s = QUICK_SEND_STRINGS.schedule;
  if (!props.open) return null;
  return (
    <div className="border-t border-border bg-card px-3 py-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span aria-hidden>⏰</span>
          <span className="text-sm font-medium text-foreground">{s.centerTitle}</span>
          <span className="truncate text-xs text-muted-foreground">
            {s.centerContext(props.customerName, props.customerPhone)}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <ScheduleModeSwitcher mode={props.mode} onModeChange={props.onModeChange} />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            aria-label={QUICK_SEND_STRINGS.slash.close}
            onClick={() => props.onOpenChange(false)}
          >
            <Icon icon="mdi:chevron-down" size={16} />
          </Button>
        </div>
      </div>
      <SchedulingPanels {...props} />
    </div>
  );
}
