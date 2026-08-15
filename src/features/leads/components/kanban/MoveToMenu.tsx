import type { ID, ILeadFunnelStage } from "@/shared/types";
import { Icon } from "@/components/Icon";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { getAccentClasses } from "@/features/funnels/engine/accentClasses";
import { LEADS_STRINGS } from "../../i18n/pt-BR";

export interface IMoveToMenuProps {
  stages: ILeadFunnelStage[];
  currentStageId: ID;
  onMove: (stageId: ID) => void;
}

/**
 * The way to move a lead that does not require a pointer at all.
 *
 * `LEADS_STRINGS.kanban.quickMove` has existed since it was written and never
 * had a consumer. This is it.
 *
 * Enter on the card still opens the lead's page — that is today's behaviour and
 * what anyone expects of a card. The menu is one Tab away, on the `⋮`; reusing
 * Enter for it would break the main path to save a keystroke.
 */
export function MoveToMenu({ stages, currentStageId, onMove }: IMoveToMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={LEADS_STRINGS.kanban.quickMove}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        className="inline-flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 transition hover:bg-muted hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100 data-[state=open]:opacity-100"
      >
        <Icon icon="mdi:dots-vertical" size={14} aria-hidden />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-48" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuLabel className="text-xs">{LEADS_STRINGS.kanban.quickMove}</DropdownMenuLabel>
        {stages.map((s) => (
          <DropdownMenuItem
            key={s.id}
            disabled={s.id === currentStageId}
            className="gap-2 text-xs"
            onSelect={() => onMove(s.id)}
          >
            <span
              aria-hidden
              className={cn("size-2 shrink-0 rounded-sm", getAccentClasses(s.accent).dot)}
            />
            <span className="truncate">{s.name}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
