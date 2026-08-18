import type { IPart } from "@/shared/types";
import { cn } from "@/lib/utils";
import { CATALOG_STRINGS } from "../i18n/pt-BR";

export interface IStockBadgeProps {
  part: Pick<IPart, "stockAvailable" | "stockMinimum">;
  /** Compact form omits the wrapping label, used inside table cells. */
  variant?: "default" | "compact";
  className?: string;
}

export function StockBadge({ part, variant = "default", className }: IStockBadgeProps) {
  const isZero = part.stockAvailable <= 0;
  const isLow = !isZero && part.stockAvailable <= part.stockMinimum;
  const tone = isZero
    ? "bg-severity-critical/15 text-severity-critical"
    : isLow
      ? "bg-severity-warning/15 text-severity-warning"
      : "bg-severity-success/15 text-severity-success";

  const label = isZero
    ? CATALOG_STRINGS.stockLabels.zero
    : isLow
      ? CATALOG_STRINGS.stockLabels.low(part.stockAvailable)
      : CATALOG_STRINGS.stockLabels.inStock(part.stockAvailable);

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full font-medium",
        variant === "compact" ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-xs",
        tone,
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          isZero ? "bg-severity-critical" : isLow ? "bg-severity-warning" : "bg-severity-success",
        )}
      />
      {label}
    </span>
  );
}
