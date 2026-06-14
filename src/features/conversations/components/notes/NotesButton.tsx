import type { ID } from "@/shared/types";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Icon } from "@/components/Icon";
import { useConversationNotes } from "../../hooks/useConversationNotes";
import { CONVERSATION_STRINGS } from "../../i18n/pt-BR";

const S = CONVERSATION_STRINGS.conversationNotes;

interface IProps {
  conversationId: ID;
  storeId: ID;
  active?: boolean;
  onToggle: () => void;
  disabled?: boolean;
}

/**
 * Composer entry for the conversation notes panel — sits next to the attach /
 * emoji / audio / schedule icons. Shows a count badge mirroring ScheduleButton.
 */
export function NotesButton({ conversationId, storeId, active, onToggle, disabled }: IProps) {
  const { notes } = useConversationNotes(conversationId, storeId);
  const count = notes.length;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant={active ? "secondary" : "ghost"}
          size="sm"
          className="relative h-9 w-9 shrink-0 p-0"
          aria-label={S.entryTooltip}
          aria-pressed={active}
          disabled={disabled}
          onClick={onToggle}
        >
          <Icon icon="mdi:note-text-outline" size={18} />
          {count > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-none text-primary-foreground">
              {count}
            </span>
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{S.entryTooltip}</TooltipContent>
    </Tooltip>
  );
}
