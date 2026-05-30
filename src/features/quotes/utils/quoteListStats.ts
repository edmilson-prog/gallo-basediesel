import type { IQuote, QuoteStatus } from "@/shared/types";
import type { IStatCell } from "@/shared/list-views";
import { formatBRL, formatPercent } from "@/shared/utils/format";
import { validityBucket } from "./quoteTotals";

/** Statuses that count as "presented to the customer" (left draft). */
const PRESENTED: readonly QuoteStatus[] = [
  "enviado",
  "aceito",
  "recusado",
  "expirado",
  "convertido",
];

const sumTotal = (list: IQuote[]): number => list.reduce((acc, q) => acc + q.total, 0);

/**
 * The 5 KPI cells for the quotes list, computed over `quotes` (the pre-status
 * filtered set). `now` is injected for deterministic validity math.
 */
export function quoteStatCells(quotes: IQuote[], now: Date): IStatCell[] {
  const open = quotes.filter((q) => q.status === "rascunho" || q.status === "enviado");
  const converted = quotes.filter((q) => q.status === "convertido");
  const presented = quotes.filter((q) => PRESENTED.includes(q.status));

  const conversion = presented.length > 0 ? converted.length / presented.length : null;
  const ticket = quotes.length > 0 ? sumTotal(quotes) / quotes.length : null;
  const expiring = quotes.filter((q) => {
    if (q.status !== "enviado") return false;
    const bucket = validityBucket(q.validUntil, now);
    return bucket === "critical" || bucket === "warning";
  }).length;

  return [
    { icon: "mdi:cash-clock", label: "Em aberto", value: formatBRL(sumTotal(open)) },
    {
      icon: "mdi:swap-horizontal-bold",
      label: "Convertido",
      value: formatBRL(sumTotal(converted)),
      tone: "good",
    },
    { icon: "mdi:trending-up", label: "Conversão", value: formatPercent(conversion, 0) },
    { icon: "mdi:cash-multiple", label: "Ticket médio", value: formatBRL(ticket) },
    {
      icon: "mdi:clock-alert-outline",
      label: "Expirando ≤3d",
      value: expiring,
      tone: expiring > 0 ? "warn" : "default",
    },
  ];
}

/** Count of quotes per status, over the pre-status filtered set (for the tabs). */
export function quoteStatusCounts(quotes: IQuote[]): Record<QuoteStatus, number> {
  const counts: Record<QuoteStatus, number> = {
    rascunho: 0,
    enviado: 0,
    aceito: 0,
    recusado: 0,
    expirado: 0,
    convertido: 0,
  };
  for (const q of quotes) counts[q.status] += 1;
  return counts;
}
