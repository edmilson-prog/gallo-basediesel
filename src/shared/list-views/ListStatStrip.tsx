import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/Icon";

export type StatTone = "default" | "good" | "warn" | "bad";

export interface IStatCell {
  /** Iconify name (mdi:*). */
  icon: string;
  label: string;
  /** Pre-formatted value (R$, %, count). */
  value: ReactNode;
  tone?: StatTone;
}

const TONE_CLASS: Record<StatTone, string> = {
  default: "text-foreground",
  good: "text-emerald-600 dark:text-emerald-400",
  warn: "text-amber-600 dark:text-amber-400",
  bad: "text-destructive",
};

/** Column count per cell-count, kept static so Tailwind can see the classes. */
const HORIZONTAL_COLS: Record<number, string> = {
  3: "grid-cols-2 sm:grid-cols-3",
  4: "grid-cols-2 sm:grid-cols-4",
  5: "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5",
};

export interface IListStatStripProps {
  cells: IStatCell[];
  orientation?: "horizontal" | "vertical";
  className?: string;
}

/**
 * Full-width KPI strip for list pages. Mirrors CustomerStatStrip: hairline cells
 * via gap-px on a bg-border parent with bg-card cells; semantic tokens only.
 * `vertical` stacks the cells in a single column (used by the Console rail).
 */
export function ListStatStrip({
  cells,
  orientation = "horizontal",
  className,
}: IListStatStripProps) {
  const cols =
    orientation === "vertical"
      ? "grid-cols-1"
      : (HORIZONTAL_COLS[cells.length] ?? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5");
  return (
    <dl className={cn("grid gap-px overflow-hidden rounded-lg bg-border", cols, className)}>
      {cells.map((cell) => (
        <div key={cell.label} className="bg-card px-4 py-3">
          <dt className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
            <Icon icon={cell.icon} size={11} />
            {cell.label}
          </dt>
          <dd
            className={cn(
              "mt-1 text-sm font-semibold tabular-nums",
              TONE_CLASS[cell.tone ?? "default"],
            )}
          >
            {cell.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
