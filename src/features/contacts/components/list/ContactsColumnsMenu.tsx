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
import {
  CONTACT_COLUMN_LABELS,
  OPTIONAL_CONTACT_COLUMNS,
  type OptionalContactColumn,
} from "../../utils/columns";

const COPY = {
  trigger: "Configurar colunas",
  title: "Colunas visíveis",
  showAll: "Exibir todas",
};

interface IColumnsMenuProps {
  /** Currently visible optional columns. */
  visible: OptionalContactColumn[];
  onToggle: (id: OptionalContactColumn) => void;
  onShowAll: () => void;
}

function isAllVisible(visible: OptionalContactColumn[]): boolean {
  return OPTIONAL_CONTACT_COLUMNS.every((id) => visible.includes(id));
}

/** Gear button + dropdown, for the actions cell in the table header. */
export function ContactsColumnsDropdown({ visible, onToggle, onShowAll }: IColumnsMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={COPY.trigger}>
          <Icon icon="mdi:cog-outline" size={15} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="text-xs uppercase tracking-wide text-muted-foreground">
          {COPY.title}
        </DropdownMenuLabel>
        {OPTIONAL_CONTACT_COLUMNS.map((id) => (
          <DropdownMenuCheckboxItem
            key={id}
            checked={visible.includes(id)}
            onCheckedChange={() => onToggle(id)}
            onSelect={(event) => event.preventDefault()}
          >
            {CONTACT_COLUMN_LABELS[id]}
          </DropdownMenuCheckboxItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={isAllVisible(visible)} onSelect={onShowAll} className="gap-2">
          <Icon icon="mdi:eye-outline" size={15} />
          {COPY.showAll}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Same menu, as the right-click content for the table header (ux-guidelines
 * §4). Rendered inside a `<ContextMenu>` whose trigger wraps the header row.
 */
export function ContactsColumnsContextContent({ visible, onToggle, onShowAll }: IColumnsMenuProps) {
  return (
    <ContextMenuContent className="w-56">
      <ContextMenuLabel className="text-xs uppercase tracking-wide text-muted-foreground">
        {COPY.title}
      </ContextMenuLabel>
      {OPTIONAL_CONTACT_COLUMNS.map((id) => (
        <ContextMenuCheckboxItem
          key={id}
          checked={visible.includes(id)}
          onCheckedChange={() => onToggle(id)}
          onSelect={(event) => event.preventDefault()}
        >
          {CONTACT_COLUMN_LABELS[id]}
        </ContextMenuCheckboxItem>
      ))}
      <ContextMenuSeparator />
      <ContextMenuItem disabled={isAllVisible(visible)} onSelect={onShowAll} className="gap-2">
        <Icon icon="mdi:eye-outline" size={15} />
        {COPY.showAll}
      </ContextMenuItem>
    </ContextMenuContent>
  );
}
