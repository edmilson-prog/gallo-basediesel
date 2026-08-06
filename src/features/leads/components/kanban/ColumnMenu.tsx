import type { ILeadFunnelStage } from "@/shared/types";
import { Icon } from "@/components/Icon";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { BOARD_SORT_MODES, type BoardSortMode } from "@/features/funnels/engine/boardSort";
import { LEADS_STRINGS } from "../../i18n/pt-BR";

export interface IColumnMenuProps {
  stage: ILeadFunnelStage;
  mode: BoardSortMode;
  onSortChange: (mode: BoardSortMode) => void;
  onToggleCollapsed: () => void;
}

export function ColumnMenu({ stage, mode, onSortChange, onToggleCollapsed }: IColumnMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={LEADS_STRINGS.kanban.columnMenu(stage.name)}
        className="inline-flex size-5 items-center justify-center rounded text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Icon icon="mdi:dots-vertical" size={14} aria-hidden />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel className="text-xs">{LEADS_STRINGS.kanban.sortLabel}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={mode}
          onValueChange={(v) => onSortChange(v as BoardSortMode)}
        >
          {BOARD_SORT_MODES.map((m) => (
            <DropdownMenuRadioItem key={m} value={m} className="text-xs">
              {LEADS_STRINGS.kanban.sortModes[m]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>

        <DropdownMenuSeparator />
        <DropdownMenuItem className="gap-2 text-xs" onSelect={onToggleCollapsed}>
          <Icon icon="mdi:arrow-collapse-horizontal" size={14} aria-hidden />
          {LEADS_STRINGS.kanban.collapse}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
