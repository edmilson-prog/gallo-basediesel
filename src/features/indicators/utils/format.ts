import type { IndicatorMetric } from "@/shared/types";
import { formatBRL, formatBRLCompact } from "@/shared/utils/format";

/**
 * Format a raw indicator value according to its metric type.
 * Currency metrics: BRL (compact on "compact" variant).
 * Count metrics: plain Brazilian number.
 */
export function formatByMetric(
  metric: IndicatorMetric,
  value: number,
  variant: "full" | "compact" = "compact",
): string {
  if (metric === "faturamento" || metric === "margem") {
    return variant === "compact" ? formatBRLCompact(value) : formatBRL(value);
  }
  return value.toLocaleString("pt-BR");
}
