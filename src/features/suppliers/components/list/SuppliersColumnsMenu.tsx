import {
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
} from "@/components/ui/context-menu";
import { COLUMN_LABELS, OPTIONAL_COLUMNS, type OptionalColumn } from "../../utils/columns";
import { SUPPLIERS_STRINGS } from "../../i18n/pt-BR";

const COPY = SUPPLIERS_STRINGS.columnsMenu;

interface IColumnsMenuProps {
  visible: Set<OptionalColumn>;
  onToggle: (id: OptionalColumn) => void;
  onShowAll: () => void;
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
