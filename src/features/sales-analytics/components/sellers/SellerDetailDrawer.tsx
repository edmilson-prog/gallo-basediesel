import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { formatBRL } from "@/shared/utils/format";
import { SALES_ANALYTICS_STRINGS as S } from "../../i18n/pt-BR";
import { attainmentBand, type ISellerLeaderboardRow } from "../../utils/sellerLeaderboard";
import { SellerMiniChart } from "./SellerMiniChart";
import { BAND_TEXT } from "./bandTokens";

export interface ISellerDetailDrawerProps {
  row: ISellerLeaderboardRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SellerDetailDrawer({ row, open, onOpenChange }: ISellerDetailDrawerProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-md">
        {row && (
          <>
            <SheetHeader>
              <SheetTitle className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/15 text-sm font-extrabold text-primary">
                  {row.rank}º
                </span>
                <span className="flex flex-col">
                  <span className="text-base">{row.sellerName}</span>
                  <span
                    className={cn(
                      "text-xs font-medium",
                      BAND_TEXT[attainmentBand(row.attainmentPct)],
                    )}
                  >
                    {row.attainmentPct == null
                      ? S.sellersDrawerNoTarget
                      : `${Math.round(row.attainmentPct)}% ${S.sellersDrawerOfTarget}`}
                  </span>
                </span>
              </SheetTitle>
            </SheetHeader>

            <div className="flex flex-col gap-4 px-4 pb-6">
              <SellerMiniChart dailySeries={row.dailySeries} target={row.target} />
              <p className="-mt-2 text-center text-[10px] text-muted-foreground">
                {S.sellersDrawerChartLegend}
              </p>

              <dl className="flex flex-col">
                <Metric label={S.sellersColRevenue} value={formatBRL(row.revenue)} />
                <Metric
                  label={S.sellersDrawerTarget}
                  value={row.target == null ? "—" : formatBRL(row.target)}
                />
                <Metric label={S.sellersColProjection} value={formatBRL(row.projection)} />
                <Metric label={S.sellersColOrders} value={String(row.orderCount)} />
                <Metric label={S.sellersColTicket} value={formatBRL(row.avgTicket)} />
                <Metric label={S.sellersColPositived} value={String(row.positivedCustomers)} />
                <Metric label={S.sellersColCustomers} value={String(row.customerCount)} />
                <Metric
                  label={S.sellersDrawerOpenQuotes}
                  value={`${row.quoteCount} · ${formatBRL(row.openQuotesValue)}`}
                  last
                />
              </dl>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Metric({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <div
      className={cn(
        "flex items-center justify-between py-2 text-sm",
        !last && "border-b border-dashed border-border",
      )}
    >
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-bold tabular-nums text-foreground">{value}</dd>
    </div>
  );
}
