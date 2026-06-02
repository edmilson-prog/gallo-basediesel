import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/Icon";
import type { ID, IOrder, IPart, IProductIndicator } from "@/shared/types";
import { formatDateBR } from "@/shared/utils/format";
import { computeOrderContribution } from "../../engine/calculate";
import { buildItemMatcher } from "../../engine/matcher";
import { indicatorsPtBR as S } from "../../i18n/pt-BR";
import { formatByMetric } from "../../utils/format";

export interface IIndicatorCompositionSectionProps {
  indicator: IProductIndicator;
  orders: IOrder[];
  parts: IPart[];
  sellerName: (id: ID) => string;
}

export function IndicatorCompositionSection({
  indicator,
  orders,
  parts,
  sellerName,
}: IIndicatorCompositionSectionProps) {
  const rows = useMemo(() => {
    const partsMap = new Map(parts.map((p) => [p.id, p]));
    const matches = buildItemMatcher(indicator.selector, partsMap);
    const { start, end } = indicator.period;

    const result: Array<{
      id: ID;
      number: string | undefined;
      date: string;
      sellerId: ID;
      matchedValue: number;
    }> = [];

    for (const order of orders) {
      if (order.storeId !== indicator.storeId) continue;
      if (indicator.scopeLevel === "individual" && order.sellerId !== indicator.sellerId) continue;
      if (order.paymentStatus !== "pago") continue;
      if (indicator.division && order.division !== indicator.division) continue;
      const ts = order.paidAt ?? order.createdAt;
      if (!ts || ts < start || ts > end) continue;

      const { matched, value } = computeOrderContribution(order, indicator.metric, matches);
      if (!matched) continue;

      result.push({
        id: order.id,
        number: order.number,
        date: ts,
        sellerId: order.sellerId,
        matchedValue: value,
      });
    }

    // Sort by date descending
    result.sort((a, b) => (a.date > b.date ? -1 : a.date < b.date ? 1 : 0));
    return result.slice(0, 50);
  }, [indicator, orders, parts]);

  return (
    <Card className="flex flex-col gap-4 p-5">
      <header className="flex items-baseline justify-between">
        <div>
          <h2 className="text-base font-semibold tracking-tight text-foreground">
            {S.compositionTitle}
          </h2>
          <p className="text-xs text-muted-foreground">{S.compositionSubtitle}</p>
        </div>
        <Icon icon="mdi:format-list-bulleted" size={20} className="text-muted-foreground" />
      </header>

      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">{S.compositionEmpty}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/60 text-left">
                <th className="pb-2 pr-4 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Pedido
                </th>
                <th className="pb-2 pr-4 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Data
                </th>
                <th className="pb-2 pr-4 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Vendedor
                </th>
                <th className="pb-2 text-right text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  {S.metric[indicator.metric]}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {rows.map((row) => (
                <tr key={row.id} className="group transition-colors hover:bg-muted/30">
                  <td className="py-2 pr-4">
                    <Link
                      to="/app/pedidos/$id"
                      params={{ id: row.id }}
                      className="font-medium text-foreground underline-offset-2 hover:underline"
                    >
                      {row.number ?? row.id}
                    </Link>
                  </td>
                  <td className="py-2 pr-4 text-muted-foreground">{formatDateBR(row.date)}</td>
                  <td className="py-2 pr-4 text-muted-foreground">{sellerName(row.sellerId)}</td>
                  <td className="py-2 text-right font-mono font-medium text-foreground">
                    {indicator.metric === "pedidos"
                      ? "1 pedido"
                      : formatByMetric(indicator.metric, row.matchedValue, "full")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
