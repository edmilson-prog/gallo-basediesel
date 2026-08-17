import type { KeyboardEvent, ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface ICustomerRowsColumn {
  label: string;
  /** Fixed track from the kit. Omit on the column that absorbs the leftover. */
  width?: string;
  align?: "left" | "right";
}

export interface ICustomerRow {
  key: string;
  /** One node per column, in the same order. */
  cells: ReactNode[];
  onClick?: () => void;
  /** Spoken label of a clickable row — the cells alone rarely say where it goes. */
  ariaLabel?: string;
  /** Tints the row (the conversation currently open, for instance). */
  isActive?: boolean;
}

export interface ICustomerRowsProps {
  columns: ICustomerRowsColumn[];
  rows: ICustomerRow[];
  /** Below this the wrapper scrolls instead of crushing the columns. */
  minWidth?: number;
  className?: string;
}

/**
 * The kit's `CrmRows`: a hairline table with an uppercase micro-header, used by
 * the detail page's panels to list records (conversations, and next the
 * commercial tabs).
 *
 * A real `<table>` rather than the kit's CSS grid — same picture, but the header
 * stays attached to its column for a screen reader instead of being four loose
 * labels. Row-level navigation lives on the `<tr>` (click plus Enter/Espaço) so
 * a cell can still hold its own control without nesting interactive elements.
 */
export function CustomerRows({ columns, rows, minWidth = 560, className }: ICustomerRowsProps) {
  const handleKeyDown = (event: KeyboardEvent<HTMLTableRowElement>, run?: () => void) => {
    if (!run || (event.key !== "Enter" && event.key !== " ")) return;
    event.preventDefault();
    run();
  };

  return (
    <div className={cn("overflow-x-auto", className)}>
      <table className="w-full table-fixed border-collapse" style={{ minWidth }}>
        <colgroup>
          {columns.map((column) => (
            <col key={column.label} style={column.width ? { width: column.width } : undefined} />
          ))}
        </colgroup>
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.label}
                scope="col"
                className={cn(
                  "border-b border-border px-3 pb-2 text-[9.5px] font-bold uppercase tracking-[0.14em] text-muted-foreground/70",
                  column.align === "right" ? "text-right" : "text-left",
                )}
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr
              key={row.key}
              tabIndex={row.onClick ? 0 : undefined}
              aria-label={row.onClick ? row.ariaLabel : undefined}
              onClick={row.onClick}
              onKeyDown={(event) => handleKeyDown(event, row.onClick)}
              className={cn(
                index < rows.length - 1 && "border-b border-border",
                row.onClick &&
                  "cursor-pointer transition-colors hover:bg-accent/40 focus:outline-none focus-visible:bg-accent/40 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                row.isActive && "bg-primary/5",
              )}
            >
              {row.cells.map((cell, cellIndex) => (
                <td
                  key={columns[cellIndex]?.label ?? cellIndex}
                  className={cn(
                    "px-3 py-2.5 align-middle text-[13px] text-foreground/80",
                    columns[cellIndex]?.align === "right" ? "text-right" : "text-left",
                  )}
                >
                  <div className="min-w-0 truncate">{cell}</div>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
