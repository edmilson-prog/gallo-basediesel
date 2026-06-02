// src/features/quotes/components/new/summary/QuoteSummaryPanel.tsx
import { Icon } from "@/components/Icon";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const moneyFormatter = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export interface IQuoteSummaryPanelProps {
  itemCount: number;
  unitCount: number;
  subtotal: number;
  discountInput: string;
  onDiscountInput: (v: string) => void;
  discountPct: number;
  thresholdPct: number;
  shipping: number;
  onShipping: (v: number) => void;
  onCalcShipping: () => void;
  discountTotal: number;
  shippingTotal: number;
  total: number;
  needsJustification: boolean;
  discountReason: string;
  onDiscountReason: (v: string) => void;
  compact?: boolean;
}

export function QuoteSummaryPanel(props: IQuoteSummaryPanelProps) {
  return (
    <div className="space-y-4 rounded-lg border border-border bg-card p-4">
      <p className="text-xs font-medium text-muted-foreground">
        {props.itemCount} {props.itemCount === 1 ? "item" : "itens"} · {props.unitCount} un
      </p>

      <div>
        <Label htmlFor="discount">Desconto global (R$)</Label>
        <Input
          id="discount"
          type="number"
          min={0}
          step={0.01}
          value={props.discountInput}
          onChange={(e) => props.onDiscountInput(e.target.value)}
        />
        <p className="mt-1 text-xs text-muted-foreground">
          {(props.discountPct * 100).toFixed(1)}% do subtotal · limite{" "}
          {(props.thresholdPct * 100).toFixed(0)}%
        </p>
      </div>

      <div>
        <Label htmlFor="shipping">Frete (R$)</Label>
        <div className="flex gap-2">
          <Input
            id="shipping"
            type="number"
            min={0}
            step={0.01}
            value={props.shipping}
            onChange={(e) => props.onShipping(Math.max(0, Number(e.target.value) || 0))}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={props.onCalcShipping}
            className="shrink-0 gap-1"
          >
            <Icon icon="mdi:truck-fast-outline" size={14} />
            Calcular
          </Button>
        </div>
      </div>

      {props.needsJustification && (
        <div className="rounded-md border border-orange-500/30 bg-orange-500/5 p-3" role="alert">
          <p className="text-xs font-medium text-orange-600 dark:text-orange-300">
            <Icon icon="mdi:shield-alert-outline" size={14} className="mr-1 inline" />
            Desconto acima do limite — requer aprovação do gestor
          </p>
          <Textarea
            className="mt-2"
            placeholder="Justifique o desconto (obrigatório)"
            value={props.discountReason}
            onChange={(e) => props.onDiscountReason(e.target.value)}
          />
        </div>
      )}

      <div className="space-y-1 border-t border-border pt-3">
        <Row label="Subtotal" value={moneyFormatter.format(props.subtotal)} />
        <Row label="Desconto" value={`-${moneyFormatter.format(props.discountTotal)}`} />
        <Row label="Frete" value={`+${moneyFormatter.format(props.shippingTotal)}`} />
        <div className="flex justify-between border-t border-border pt-2 text-base font-semibold text-foreground">
          <span>Total</span>
          <span className="tabular-nums text-primary">{moneyFormatter.format(props.total)}</span>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm text-muted-foreground">
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
