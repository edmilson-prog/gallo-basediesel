import type { ReactNode } from "react";

/**
 * Cockpit: pinned strip + tabs (padded) above a full-bleed filters bar; only the
 * table scrolls. The filters slot brings its own bar chrome (border-b/px).
 */
export function CockpitShell({
  strip,
  tabs,
  filters,
  table,
}: {
  strip: ReactNode;
  tabs: ReactNode;
  filters: ReactNode;
  table: ReactNode;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 space-y-3 px-4 pb-3 pt-4 md:px-6">
        {strip}
        {tabs}
      </div>
      {filters}
      <div className="min-h-0 flex-1 overflow-auto">{table}</div>
    </div>
  );
}

/**
 * Console: left rail (vertical strip + status + stacked filters) beside a
 * scrolling table. On < md the rail stacks above the table.
 */
export function ConsoleShell({ rail, table }: { rail: ReactNode; table: ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col md:flex-row">
      <aside className="shrink-0 space-y-3 overflow-y-auto border-b border-border p-4 md:w-72 md:border-b-0 md:border-r">
        {rail}
      </aside>
      <div className="min-h-0 flex-1 overflow-auto">{table}</div>
    </div>
  );
}

/** Rows: compact strip (padded) + full-bleed filters bar; the enriched table scrolls. */
export function RowsShell({
  strip,
  filters,
  table,
}: {
  strip: ReactNode;
  filters: ReactNode;
  table: ReactNode;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 px-4 pb-3 pt-4 md:px-6">{strip}</div>
      {filters}
      <div className="min-h-0 flex-1 overflow-auto">{table}</div>
    </div>
  );
}
