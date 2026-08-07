import type { IContact, ID } from "@/shared/types";
import type { ContactsOrderBy } from "@/providers/data";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ContextMenu, ContextMenuTrigger } from "@/components/ui/context-menu";
import { Icon } from "@/components/Icon";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useResizableColumns } from "@/shared/hooks/useResizableColumns";
import { cn } from "@/lib/utils";
import { contactInitials } from "../../engine/contactInitials";
import {
  CONTACT_COLUMNS,
  CONTACT_COLUMN_LABELS,
  CONTACT_COLUMN_SORT_KEY,
  CONTACT_COLUMN_WIDTHS,
  CONTACT_COLUMN_WIDTHS_STORAGE_KEY,
  type ContactColumn,
  type OptionalContactColumn,
} from "../../utils/columns";
import { ContactsColumnsContextContent, ContactsColumnsDropdown } from "./ContactsColumnsMenu";
import { ContactsEmptyState } from "./ContactsEmptyState";

export interface IContactsSort {
  orderBy: ContactsOrderBy;
  orderDir: "asc" | "desc";
}

export interface IContactsTableProps {
  contacts: IContact[];
  visibleColumns: OptionalContactColumn[];
  selectedIds: Set<ID>;
  sort: IContactsSort;
  onSortChange: (sort: IContactsSort) => void;
  onSelect: (contact: IContact, selected: boolean) => void;
  onToggleAllInPage: (checked: boolean) => void;
  onOpen: (contact: IContact) => void;
  onToggleColumn: (id: OptionalContactColumn) => void;
  onShowAllColumns: () => void;
}

const RESIZABLE_COLUMNS = CONTACT_COLUMNS.map((id) => ({
  id,
  defaultWidth: CONTACT_COLUMN_WIDTHS[id],
}));

function formatCityUf(city: string | null, uf: string | null): string {
  if (city && uf) return `${city} / ${uf}`;
  return city ?? uf ?? "—";
}

/**
 * Dense table view of the Agenda (ux-guidelines §4).
 *
 * Vertical dividers appear ONLY in the header — body cells carry no side
 * borders, which is what keeps a table this wide readable.
 */
export function ContactsTable({
  contacts,
  visibleColumns,
  selectedIds,
  sort,
  onSortChange,
  onSelect,
  onToggleAllInPage,
  onOpen,
  onToggleColumn,
  onShowAllColumns,
}: IContactsTableProps) {
  const { widths, startResize } = useResizableColumns(
    RESIZABLE_COLUMNS,
    CONTACT_COLUMN_WIDTHS_STORAGE_KEY,
  );

  const columns: ContactColumn[] = CONTACT_COLUMNS.filter(
    (id) => id === "nome" || visibleColumns.includes(id as OptionalContactColumn),
  );

  const allInPageSelected =
    contacts.length > 0 && contacts.every((contact) => selectedIds.has(contact.id));
  const someInPageSelected = contacts.some((contact) => selectedIds.has(contact.id));

  function handleHeaderClick(column: ContactColumn) {
    const key = CONTACT_COLUMN_SORT_KEY[column];
    if (!key) return;
    if (sort.orderBy === key) {
      onSortChange({ orderBy: key, orderDir: sort.orderDir === "asc" ? "desc" : "asc" });
      return;
    }
    onSortChange({ orderBy: key, orderDir: "asc" });
  }

  function renderCell(column: ContactColumn, contact: IContact) {
    switch (column) {
      case "nome":
        return (
          <span className="inline-flex min-w-0 items-center gap-2">
            <span
              aria-hidden
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-muted text-[10px] font-semibold text-muted-foreground"
            >
              {contactInitials(contact.name)}
            </span>
            <span className="truncate font-medium text-foreground">{contact.name}</span>
          </span>
        );
      case "phone":
        return (
          <span className="inline-flex items-center gap-1.5 tabular-nums">
            {contact.phone ?? "—"}
            {contact.hasWhatsapp && (
              <Icon
                icon="mdi:whatsapp"
                size={13}
                className="text-severity-success"
                aria-label="Tem WhatsApp"
              />
            )}
          </span>
        );
      case "customer":
        return contact.customerName ? (
          <span className="truncate text-primary">{contact.customerName}</span>
        ) : (
          <span className="inline-flex items-center gap-1 text-severity-info">
            <Icon icon="mdi:link-off" size={13} />
            Sem cliente
          </span>
        );
      case "role":
        return contact.role ?? <span className="text-muted-foreground">—</span>;
      case "email":
        return contact.email ?? <span className="text-muted-foreground">—</span>;
      case "city":
        return formatCityUf(contact.city, contact.uf);
      case "owner":
        return contact.ownerName ? (
          <span className="truncate">{contact.ownerName.split(" ")[0]}</span>
        ) : (
          <span className="text-muted-foreground">não atribuído</span>
        );
      case "tags":
        return contact.tags.length ? (
          <span className="inline-flex gap-1">
            {contact.tags.slice(0, 2).map((tag) => (
              <Badge key={tag} variant="outline" className="px-1.5 py-0 text-[10px]">
                {tag}
              </Badge>
            ))}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        );
      case "last":
        return <span className="text-muted-foreground">{contact.lastContactAt ?? "—"}</span>;
      case "status":
        return contact.optOut ? (
          <Badge variant="outline" className="border-severity-critical text-severity-critical">
            Opt-out
          </Badge>
        ) : (
          <Badge variant="outline" className="border-severity-success text-severity-success">
            Ativo
          </Badge>
        );
      case "source":
        return <span className="text-muted-foreground">{contact.source}</span>;
      default:
        return null;
    }
  }

  if (contacts.length === 0) return <ContactsEmptyState />;

  return (
    <Table containerClassName="h-full">
      <TableHeader className="sticky top-0 z-10 bg-background">
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-10 border-r border-border px-3">
                <Checkbox
                  aria-label="Selecionar todos da página"
                  checked={allInPageSelected ? true : someInPageSelected ? "indeterminate" : false}
                  onCheckedChange={(checked) => onToggleAllInPage(Boolean(checked))}
                />
              </TableHead>
              {columns.map((column, index) => {
                const sortKey = CONTACT_COLUMN_SORT_KEY[column];
                const isSorted = sortKey && sort.orderBy === sortKey;
                return (
                  <TableHead
                    key={column}
                    style={{ width: widths[column] }}
                    onClick={() => handleHeaderClick(column)}
                    className={cn(
                      "relative select-none whitespace-nowrap text-xs font-semibold uppercase tracking-wide text-muted-foreground",
                      // Vertical dividers only in the header — never in the body.
                      index < columns.length - 1 && "border-r border-border",
                      sortKey && "cursor-pointer hover:text-foreground",
                      isSorted && "text-primary",
                    )}
                  >
                    <span className="inline-flex items-center gap-1">
                      {CONTACT_COLUMN_LABELS[column]}
                      {sortKey && (
                        <Icon
                          icon={
                            isSorted
                              ? sort.orderDir === "asc"
                                ? "mdi:chevron-up"
                                : "mdi:chevron-down"
                              : "mdi:unfold-more-horizontal"
                          }
                          size={13}
                          className={cn(!isSorted && "opacity-40")}
                        />
                      )}
                    </span>
                    <span
                      role="separator"
                      aria-orientation="vertical"
                      aria-label={`Redimensionar ${CONTACT_COLUMN_LABELS[column]}`}
                      onPointerDown={(event) => {
                        event.stopPropagation();
                        startResize(column, event);
                      }}
                      onClick={(event) => event.stopPropagation()}
                      className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-primary/40"
                    />
                  </TableHead>
                );
              })}
              <TableHead className="w-10 px-1 text-right">
                <ContactsColumnsDropdown
                  visible={visibleColumns}
                  onToggle={onToggleColumn}
                  onShowAll={onShowAllColumns}
                />
              </TableHead>
            </TableRow>
          </ContextMenuTrigger>
          <ContactsColumnsContextContent
            visible={visibleColumns}
            onToggle={onToggleColumn}
            onShowAll={onShowAllColumns}
          />
        </ContextMenu>
      </TableHeader>

      <TableBody>
        {contacts.map((contact) => {
          const selected = selectedIds.has(contact.id);
          return (
            <TableRow
              key={contact.id}
              onClick={() => onOpen(contact)}
              data-state={selected ? "selected" : undefined}
              className="cursor-pointer text-xs"
            >
              <TableCell className="px-3" onClick={(event) => event.stopPropagation()}>
                <Checkbox
                  aria-label={`Selecionar ${contact.name}`}
                  checked={selected}
                  onCheckedChange={(checked) => onSelect(contact, Boolean(checked))}
                />
              </TableCell>
              {columns.map((column) => (
                <TableCell
                  key={column}
                  style={{ width: widths[column] }}
                  className="max-w-0 truncate"
                >
                  {renderCell(column, contact)}
                </TableCell>
              ))}
              <TableCell />
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
