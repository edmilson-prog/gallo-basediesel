import { cn } from "@/lib/utils";

export interface IStatusTab {
  /** Status value, or "all" for the "Todos" tab. */
  key: string;
  label: string;
  count: number;
  /** Optional solid color dot (e.g. "bg-blue-500"). */
  dotClassName?: string;
}

export interface IListStatusTabsProps {
  tabs: IStatusTab[];
  activeKey: string;
  onSelect: (key: string) => void;
  orientation?: "horizontal" | "vertical";
  className?: string;
}

/** Status quick-filter as a row (or column) of pill tabs with counts. */
export function ListStatusTabs({
  tabs,
  activeKey,
  onSelect,
  orientation = "horizontal",
  className,
}: IListStatusTabsProps) {
  return (
    <div
      role="tablist"
      aria-label="Filtrar por status"
      className={cn(
        "flex gap-1.5",
        orientation === "vertical" ? "flex-col" : "flex-wrap items-center",
        className,
      )}
    >
      {tabs.map((tab) => {
        const active = tab.key === activeKey;
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onSelect(tab.key)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              active
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {tab.dotClassName && (
              <span className={cn("h-1.5 w-1.5 rounded-full", tab.dotClassName)} />
            )}
            <span>{tab.label}</span>
            <span
              className={cn("tabular-nums", active ? "text-primary" : "text-muted-foreground/70")}
            >
              {tab.count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
