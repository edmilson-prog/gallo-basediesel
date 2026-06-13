import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { QUICK_SEND_STRINGS } from "../../../i18n/pt-BR";
import { ScheduleModeSwitcher } from "../ScheduleModeSwitcher";
import { SchedulingPanels } from "../SchedulingPanels";
import type { ISchedulingShellProps } from "../types";

export function SchedulingDrawerShell(props: ISchedulingShellProps) {
  const s = QUICK_SEND_STRINGS.schedule;
  return (
    <Sheet open={props.open} onOpenChange={props.onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-3 sm:max-w-md">
        <SheetHeader className="space-y-0">
          <div className="flex items-start justify-between gap-3">
            <div>
              <SheetTitle className="flex items-center gap-2 text-base">
                <span aria-hidden>⏰</span>
                {s.centerTitle}
              </SheetTitle>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {s.centerContext(props.customerName, props.customerPhone)}
              </p>
            </div>
            <ScheduleModeSwitcher mode={props.mode} onModeChange={props.onModeChange} />
          </div>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <SchedulingPanels {...props} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
