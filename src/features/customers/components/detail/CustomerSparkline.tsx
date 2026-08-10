import { formatBRLCompact } from "@/shared/utils/format";
import { CUSTOMER_STRINGS } from "../../i18n/pt-BR";
import type { IMonthlyPurchasePoint } from "../../utils/purchaseSeries";

const COPY = CUSTOMER_STRINGS.detail.commercial;

export interface ICustomerSparklineProps {
  series: IMonthlyPurchasePoint[];
  width?: number;
  height?: number;
}

/**
 * Twelve monthly bars, oldest to newest. Months with no purchase keep a 2px
 * stub rather than vanishing, so the gap reads as "nothing bought" instead of
 * "no bar drawn here".
 *
 * The current month is highlighted; the rest share a dimmed primary so the
 * trend stays readable without turning into a rainbow.
 */
export function CustomerSparkline({ series, width = 200, height = 44 }: ICustomerSparklineProps) {
  const max = Math.max(...series.map((point) => point.total), 1);
  const gap = 3;
  const barWidth = (width - gap * (series.length - 1)) / series.length;

  return (
    <svg
      width={width}
      height={height + 12}
      viewBox={`0 0 ${width} ${height + 12}`}
      role="img"
      aria-label={COPY.evolutionAria}
      className="overflow-visible"
    >
      {series.map((point, index) => {
        const isLast = index === series.length - 1;
        const barHeight = point.total > 0 ? Math.max(3, (point.total / max) * height) : 2;
        return (
          <rect
            key={point.month}
            x={index * (barWidth + gap)}
            y={height - barHeight}
            width={barWidth}
            height={barHeight}
            rx={1.5}
            className={
              point.total > 0
                ? isLast
                  ? "fill-primary"
                  : "fill-primary/45"
                : "fill-muted-foreground/20"
            }
          >
            <title>{`${point.label}: ${formatBRLCompact(point.total)}`}</title>
          </rect>
        );
      })}
      {series.map((point, index) => (
        <text
          key={`label-${point.month}`}
          x={index * (barWidth + gap) + barWidth / 2}
          y={height + 10}
          textAnchor="middle"
          fontSize="8"
          className={
            index === series.length - 1 ? "fill-muted-foreground" : "fill-muted-foreground/50"
          }
        >
          {point.label.charAt(0).toUpperCase()}
        </text>
      ))}
    </svg>
  );
}
