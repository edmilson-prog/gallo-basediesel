import { formatBRL } from "@/shared/utils/format";
import { SUPPLIERS_STRINGS } from "../../i18n/pt-BR";

const MONTH_INITIALS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];

/**
 * Twelve month-initial labels ending at `referenceMonth` (0-11, `Date#getMonth()`
 * of the newest bar). Pure arithmetic, no `Date` allocation per label — the
 * one `Date` this feature ever needs to read "now" from lives in the caller
 * (`now` below), not twelve of them built inside a loop.
 */
function monthLabelsEndingAt(referenceMonth: number): string[] {
  return Array.from({ length: 12 }, (_, index) => {
    const offset = 11 - index;
    const month = ((referenceMonth - offset) % 12) + 12;
    return MONTH_INITIALS[month % 12] ?? "";
  });
}

export interface ISupplierPurchasesChartProps {
  /** 12 positions, oldest → newest. */
  monthly: number[];
  /**
   * Reference date for the last bar's month. Defaults to the real current
   * date — injectable so a caller (a test, or a future snapshot view) can
   * freeze it instead of depending on when the component happens to render.
   */
  now?: Date;
}

/**
 * Pure SVG bar chart, no charting library. The last bar (current month) is
 * highlighted; the rest recede. Whether to render this component at all —
 * i.e. whether there is any purchase history — is `SupplierSheet`'s call,
 * not this component's: it always draws whatever `monthly` it's given.
 */
export function SupplierPurchasesChart({
  monthly,
  now = new Date(),
}: ISupplierPurchasesChartProps) {
  const max = Math.max(...monthly, 1);
  const total = monthly.reduce((a, b) => a + b, 0);
  const labels = monthLabelsEndingAt(now.getMonth());

  return (
    <svg
      viewBox="0 0 360 120"
      className="h-[170px] w-full"
      role="img"
      aria-label={SUPPLIERS_STRINGS.chart.purchasesAriaLabel(formatBRL(total))}
    >
      {monthly.map((value, index) => {
        const height = (value / max) * 90;
        return (
          <rect
            key={index}
            x={index * 30 + 6}
            y={100 - height}
            width={18}
            height={height}
            rx={2}
            className={index === monthly.length - 1 ? "fill-primary" : "fill-primary/35"}
          />
        );
      })}
      {labels.map((label, index) => (
        <text
          key={index}
          x={index * 30 + 15}
          y={114}
          textAnchor="middle"
          className="fill-muted-foreground text-[9px]"
        >
          {label}
        </text>
      ))}
    </svg>
  );
}
