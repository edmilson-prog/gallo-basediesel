import { Icon } from "@/components/Icon";
import { Badge } from "@/components/ui/badge";
import { useResizableColumns } from "@/shared/hooks/useResizableColumns";
import type { IFiscalNote } from "@/shared/types";
import { FISCAL_NOTES_STRINGS } from "../../i18n/pt-BR";

const COLUMNS = [
  { id: "note", defaultWidth: 320 },
  { id: "issued", defaultWidth: 100 },
  { id: "entered", defaultWidth: 100 },
  { id: "items", defaultWidth: 72 },
  { id: "total", defaultWidth: 130 },
  { id: "duplicates", defaultWidth: 120 },
  { id: "status", defaultWidth: 170 },
] as const;

type ColumnId = (typeof COLUMNS)[number]["id"];

const brl = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const shortDate = (iso: string) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
};

export interface IFiscalNotesTableProps {
  notes: IFiscalNote[];
  scrollRef?: (el: HTMLDivElement | null) => void;
}

export function FiscalNotesTable({ notes, scrollRef }: IFiscalNotesTableProps) {
  const { widths, totalWidth, startResize } = useResizableColumns<ColumnId>(
    COLUMNS,
    "gallo-fiscal-notes-column-widths",
  );
  const s = FISCAL_NOTES_STRINGS;

  return (
    <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto">
      <table className="w-full table-fixed border-collapse" style={{ minWidth: totalWidth }}>
        <colgroup>
          {COLUMNS.map((col) => (
            <col key={col.id} style={{ width: widths[col.id] }} />
          ))}
        </colgroup>
        <thead className="sticky top-0 z-10 bg-background">
          {/* Delimitadores verticais SOMENTE no header (ux-guidelines §4). */}
          <tr className="border-b border-border [&>th:not(:last-child)]:border-r [&>th:not(:last-child)]:border-border/70">
            {COLUMNS.map((col) => (
              <th
                key={col.id}
                className="relative px-3 py-2 text-left font-semicond text-[10.5px] uppercase tracking-[0.1em] text-muted-foreground"
              >
                {s.columns[col.id]}
                <span
                  role="separator"
                  aria-orientation="vertical"
                  aria-label={s.columns[col.id]}
                  onPointerDown={(e) => startResize(col.id, e)}
                  onClick={(e) => e.stopPropagation()}
                  className="absolute inset-y-0 right-0 w-1.5 cursor-col-resize touch-none hover:bg-primary/40"
                />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {notes.map((note) => {
            const pending = note.items.filter((item) => !item.confirmed).length;
            const isReview = note.status === "conferencia";
            return (
              <tr key={note.id} className="border-b border-border">
                <td className="px-3 py-2">
                  <p className="truncate text-[13px] font-medium text-foreground">
                    NF {note.number} · série {note.series}
                  </p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {s.origin[note.origin]}
                  </p>
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  {shortDate(note.issuedAt)}
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  {shortDate(note.enteredAt)}
                </td>
                <td className="px-3 py-2 text-[13px] tabular-nums text-foreground">
                  {note.items.length}
                </td>
                <td className="px-3 py-2 text-right text-[13px] font-bold tabular-nums text-foreground">
                  {brl(note.total)}
                </td>
                <td className="px-3 py-2 text-xs tabular-nums text-muted-foreground">
                  {note.duplicates.length}×
                </td>
                <td className="px-3 py-2">
                  <Badge
                    variant="outline"
                    className={
                      isReview
                        ? "border-severity-warning/40 text-severity-warning"
                        : "border-severity-success/40 text-severity-success"
                    }
                  >
                    <Icon
                      icon={isReview ? "mdi:clipboard-check-outline" : "mdi:check-all"}
                      size={12}
                      aria-hidden
                    />
                    {s.status[note.status]}
                    {isReview && pending > 0 ? ` · ${pending}` : ""}
                  </Badge>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
