import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { QUICK_SEND_STRINGS } from "../../../i18n/pt-BR";
import { ScheduleModeSwitcher } from "../ScheduleModeSwitcher";
import { SchedulingPanels } from "../SchedulingPanels";
import type { ISchedulingShellProps } from "../types";

export function SchedulingModalShell(props: ISchedulingShellProps) {
  const s = QUICK_SEND_STRINGS.schedule;
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <DialogTitle className="flex items-center gap-2 text-base">
                <span aria-hidden>⏰</span>
                {s.centerTitle}
              </DialogTitle>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {s.centerContext(props.customerName, props.customerPhone)}
              </p>
            </div>
            <ScheduleModeSwitcher mode={props.mode} onModeChange={props.onModeChange} />
          </div>
        </DialogHeader>
        <SchedulingPanels {...props} />
      </DialogContent>
    </Dialog>
  );
}
