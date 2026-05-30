import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
} from "@/components/ui/context-menu";
import { COLUMN_LABELS, OPTIONAL_COLUMNS, type OptionalColumn } from "../../utils/columns";
import { VEHICLE_STRINGS } from "../../i18n/pt-BR";

const COPY = VEHICLE_STRINGS.list.columnsMenu;

interface IColumnsMenuProps {
  visible: Set<OptionalColumn>;
  onToggle: (id: OptionalColumn) => void;
  onShowAll: () => void;
}

function isAllVisible(visible: Set<OptionalColumn>): boolean {
  return OPTIONAL_COLUMNS.every((id) => visible.has(id));
}

/** Gear button + dropdown. Self-contained trigger; lives in the table header actions cell. */
export function VehiclesColumnsDropdown({ visible, onToggle, onShowAll }: IColumnsMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-foreground"
          aria-label={COPY.trigger}
          title={COPY.trigger}
          onClick={(e) => e.stopPropagation()}
        >
          <Icon icon="mdi:view-column-outline" size={16} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel>{COPY.title}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {OPTIONAL_COLUMNS.map((id) => (
          <DropdownMenuCheckboxItem
            key={id}
            checked={visible.has(id)}
            onCheckedChange={() => onToggle(id)}
            onSelect={(e) => e.preventDefault()}
          >
            {COLUMN_LABELS[id]}
          </DropdownMenuCheckboxItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={isAllVisible(visible)} onSelect={() => onShowAll()}>
          <Icon icon="mdi:eye-outline" size={14} />
          {COPY.showAll}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Context-menu content only — the trigger wraps the header row in VehiclesTable. */
export function VehiclesColumnsContextContent({ visible, onToggle, onShowAll }: IColumnsMenuProps) {
  return (
    <ContextMenuContent className="w-52">
      <ContextMenuLabel>{COPY.title}</ContextMenuLabel>
      <ContextMenuSeparator />
      {OPTIONAL_COLUMNS.map((id) => (
        <ContextMenuCheckboxItem
          key={id}
          checked={visible.has(id)}
          onCheckedChange={() => onToggle(id)}
          onSelect={(e) => e.preventDefault()}
        >
          {COLUMN_LABELS[id]}
        </ContextMenuCheckboxItem>
      ))}
      <ContextMenuSeparator />
      <ContextMenuItem disabled={isAllVisible(visible)} onSelect={() => onShowAll()}>
        <Icon icon="mdi:eye-outline" size={14} />
        {COPY.showAll}
      </ContextMenuItem>
    </ContextMenuContent>
  );
}
