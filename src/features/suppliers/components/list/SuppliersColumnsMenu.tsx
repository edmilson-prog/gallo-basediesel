import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import {
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { COLUMN_LABELS, OPTIONAL_COLUMNS, type OptionalColumn } from "../../utils/columns";
import { SUPPLIERS_STRINGS } from "../../i18n/pt-BR";

const COPY = SUPPLIERS_STRINGS.columnsMenu;

interface IColumnsMenuProps {
  visible: Set<OptionalColumn>;
  onToggle: (id: OptionalColumn) => void;
  onShowAll: () => void;
}

function isAllVisible(visible: Set<OptionalColumn>): boolean {
  return OPTIONAL_COLUMNS.every((id) => visible.has(id));
}

/** Right-click on the table header — the app's standard place for this menu. */
export function SuppliersColumnsContextContent({
  visible,
  onToggle,
  onShowAll,
}: IColumnsMenuProps) {
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
      <ContextMenuItem onSelect={onShowAll}>{COPY.showAll}</ContextMenuItem>
    </ContextMenuContent>
  );
}

/**
 * Gear button + dropdown — the mouse/touch discovery path for column
 * visibility, since the context menu (right-click) is unreachable on touch.
 * Lives in the table header's trailing actions cell. Mirrors
 * `CatalogColumnsDropdown` (`src/features/catalog/components/list/CatalogColumnsMenu.tsx`).
 */
export function SuppliersColumnsDropdown({ visible, onToggle, onShowAll }: IColumnsMenuProps) {
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
