import { formatBRL } from "@/shared/utils/format";
import { DetailCard } from "./DetailCard";

export interface IDetailSummaryCardProps {
  subtotal: number;
  discount: number;
  shipping: number;
  total: number;
}

export function DetailSummaryCard({
  subtotal,
  discount,
  shipping,
  total,
}: IDetailSummaryCardProps) {
  return (
    <DetailCard icon="mdi:cash-multiple" title="Resumo">
      <dl className="space-y-1 text-sm">
        <div className="flex justify-between text-muted-foreground">
          <dt>Subtotal</dt>
          <dd className="tabular-nums">{formatBRL(subtotal)}</dd>
        </div>
        <div className="flex justify-between text-muted-foreground">
          <dt>Desconto</dt>
          <dd className="tabular-nums">-{formatBRL(discount)}</dd>
        </div>
        <div className="flex justify-between text-muted-foreground">
          <dt>Frete</dt>
          <dd className="tabular-nums">+{formatBRL(shipping)}</dd>
        </div>
        <div className="flex justify-between border-t border-border pt-2 text-base font-semibold text-foreground">
          <dt>Total</dt>
          <dd className="tabular-nums">{formatBRL(total)}</dd>
        </div>
      </dl>
    </DetailCard>
  );
}
