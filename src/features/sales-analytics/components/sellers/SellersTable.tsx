import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { formatBRL, formatBRLCompact } from "@/shared/utils/format";
import { SALES_ANALYTICS_STRINGS as S } from "../../i18n/pt-BR";
import { attainmentBand, type ISellerLeaderboardRow } from "../../utils/sellerLeaderboard";

const BAND_BAR: Record<string, string> = {
  success: "bg-success",
  warning: "bg-warning",
  below: "bg-destructive",
  none: "bg-muted-foreground/40",
};

export interface ISellersTableProps {
  rows: ISellerLeaderboardRow[];
  onSelect: (sellerId: string) => void;
}

export function SellersTable({ rows, onSelect }: ISellersTableProps) {
  const total = rows.reduce(
    (acc, r) => {
      acc.revenue += r.revenue;
      acc.orders += r.orderCount;
      acc.quotes += r.quoteCount;
      return acc;
    },
    { revenue: 0, orders: 0, quotes: 0 },
  );
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="text-[11px] uppercase tracking-wide text-muted-foreground">
            <Th className="text-left">{S.sellersColRank}</Th>
            <Th className="text-left">{S.sellersColSeller}</Th>
            <Th>{S.sellersColAttainment}</Th>
            <Th>{S.sellersColRevenue}</Th>
            <Th>{S.sellersColOrders}</Th>
            <Th>{S.sellersColTicket}</Th>
            <Th>{S.sellersColProjection}</Th>
            <Th>{S.sellersColPositived}</Th>
            <Th>{S.sellersColQuotes}</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const band = attainmentBand(r.attainmentPct);
            return (
              <tr
                key={r.sellerId}
                onClick={() => onSelect(r.sellerId)}
                className="cursor-pointer border-t border-border/60 hover:bg-muted/50"
              >
                <Td className="text-left font-bold text-muted-foreground">{r.rank}</Td>
                <Td className="text-left font-semibold text-foreground">{r.sellerName}</Td>
                <Td>
                  <span className="flex items-center justify-end gap-2">
                    <span className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-muted md:block">
                      <span
                        className={cn("block h-full", BAND_BAR[band])}
                        style={{ width: `${Math.min(100, Math.max(0, r.attainmentPct ?? 0))}%` }}
                      />
                    </span>
                    {r.attainmentPct == null ? "—" : `${Math.round(r.attainmentPct)}%`}
                  </span>
                </Td>
                <Td className="font-bold">{formatBRLCompact(r.revenue)}</Td>
                <Td>{r.orderCount}</Td>
                <Td>{formatBRL(r.avgTicket)}</Td>
                <Td>{formatBRLCompact(r.projection)}</Td>
                <Td>{r.positivedCustomers}</Td>
                <Td>{r.quoteCount}</Td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-border bg-muted/60 text-sm font-extrabold">
            <Td className="text-left" />
            <Td className="text-left">
              {rows.length} {S.sellersTotalLabel}
            </Td>
            <Td>—</Td>
            <Td>{formatBRLCompact(total.revenue)}</Td>
            <Td>{total.orders}</Td>
            <Td>—</Td>
            <Td>—</Td>
            <Td>—</Td>
            <Td>{total.quotes}</Td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function Th({ children, className }: { children?: ReactNode; className?: string }) {
  return <th className={cn("px-3 py-2 text-right font-semibold", className)}>{children}</th>;
}
function Td({ children, className }: { children?: ReactNode; className?: string }) {
  return <td className={cn("px-3 py-2.5 text-right tabular-nums", className)}>{children}</td>;
}
