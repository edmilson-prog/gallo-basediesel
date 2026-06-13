import type { ID } from "@/shared/types";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useConversationScheduled } from "../../hooks/useConversationScheduled";
import { QUICK_SEND_STRINGS } from "../../i18n/pt-BR";
import type { SchedulingTab } from "./types";

export interface IScheduleButtonProps {
  conversationId: ID;
  /** Opens the center; "scheduled" when there are pending items, else "new". */
  onOpen: (tab: SchedulingTab) => void;
  disabled?: boolean;
}

/** Composer entry to the Scheduling Center. Badge = pending count (drafts excluded). */
export function ScheduleButton({ conversationId, onOpen, disabled = false }: IScheduleButtonProps) {
  const s = QUICK_SEND_STRINGS.schedule;
  const { items } = useConversationScheduled(conversationId);
  const pending = items.filter((i) => i.status === "pending").length;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="relative h-9 w-9 shrink-0 p-0"
          aria-label={s.entryTooltip}
          aria-haspopup="dialog"
          disabled={disabled}
          onClick={() => onOpen(pending > 0 ? "scheduled" : "new")}
        >
          <Icon icon="mdi:calendar-clock" size={18} />
          {pending > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-none text-primary-foreground">
              {pending}
            </span>
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{s.entryTooltip}</TooltipContent>
    </Tooltip>
  );
}
