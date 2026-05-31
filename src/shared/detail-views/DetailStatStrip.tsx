import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/Icon";

export type StatTone = "default" | "good" | "warn" | "bad";

export interface IDetailStat {
  label: string;
  /** Pre-formatted value (status, R$, count). */
  value: ReactNode;
  /** Optional secondary line (date, "estimada", "% do subtotal"). */
  sub?: ReactNode;
  tone?: StatTone;
  /** Iconify name (mdi:*). */
  icon?: string;
}

const TONE_CLASS: Record<StatTone, string> = {
  default: "text-foreground",
  good: "text-emerald-600 dark:text-emerald-400",
  warn: "text-amber-600 dark:text-amber-400",
  bad: "text-destructive",
};

/** Column count per cell-count, kept static so Tailwind can see the classes. */
const COLS: Record<number, string> = {
  3: "grid-cols-2 sm:grid-cols-3",
  4: "grid-cols-2 sm:grid-cols-4",
  5: "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5",
};

export interface IDetailStatStripProps {
  stats: IDetailStat[];
  className?: string;
}

/** Full-width KPI strip for detail pages. Hairline cells (gap-px on bg-border). */
export function DetailStatStrip({ stats, className }: IDetailStatStripProps) {
  const cols = COLS[stats.length] ?? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5";
  return (
    <dl className={cn("grid gap-px overflow-hidden rounded-lg bg-border", cols, className)}>
      {stats.map((s) => (
        <div key={s.label} className="bg-card px-4 py-3">
          <dt className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
            {s.icon && <Icon icon={s.icon} size={11} />}
            {s.label}
          </dt>
          <dd
            className={cn(
              "mt-1 text-base font-semibold tabular-nums",
              TONE_CLASS[s.tone ?? "default"],
            )}
          >
            {s.value}
          </dd>
          {s.sub != null && (
            <dd className="text-[11px] tabular-nums text-muted-foreground">{s.sub}</dd>
          )}
        </div>
      ))}
    </dl>
  );
}
