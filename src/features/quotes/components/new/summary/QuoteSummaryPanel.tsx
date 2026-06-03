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
  /** Slim horizontal rendering for the footer-bar layout. */
  compact?: boolean;
  /** Total weight (kg) of the quote — Σ weightKg * quantity. */
  totalWeightKg: number;
  /** Total monetary margin — shown only when `showMargin`. */
  totalMargin: number;
  /** Margin as fraction of subtotal (0..1). */
  marginPct: number;
  /** Whether to surface margin figures (Owner/Gestor only). */
  showMargin: boolean;
}

function ApprovalBlock({
  needsJustification,
  discountReason,
  onDiscountReason,
}: Pick<IQuoteSummaryPanelProps, "needsJustification" | "discountReason" | "onDiscountReason">) {
  if (!needsJustification) return null;
  return (
    <div className="rounded-md border border-orange-500/30 bg-orange-500/5 p-3" role="alert">
      <p className="text-xs font-medium text-orange-600 dark:text-orange-300">
        <Icon icon="mdi:shield-alert-outline" size={14} className="mr-1 inline" />
        Desconto acima do limite — requer aprovação do gestor
      </p>
      <Textarea
        className="mt-2"
        placeholder="Justifique o desconto (obrigatório)"
        value={discountReason}
        onChange={(e) => onDiscountReason(e.target.value)}
      />
    </div>
  );
}

function DiscountMeter({
  discountPct,
  thresholdPct,
}: {
  discountPct: number;
  thresholdPct: number;
}) {
  const over = discountPct > thresholdPct + 1e-9;
  // Scale the bar against twice the threshold so the limit sits at the midpoint.
  const scaleMax = Math.max(thresholdPct * 2, discountPct, 0.0001);
  const fillPct = Math.min(100, (discountPct / scaleMax) * 100);
  const markerPct = Math.min(100, (thresholdPct / scaleMax) * 100);
  return (
    <div className="space-y-1">
      <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full ${over ? "bg-orange-500" : "bg-primary"}`}
          style={{ width: `${fillPct}%` }}
        />
        <span
          className="absolute top-1/2 h-2.5 w-0.5 -translate-y-1/2 bg-foreground/60"
          style={{ left: `${markerPct}%` }}
          aria-hidden
        />
      </div>
      <p
        className={`text-xs ${over ? "text-orange-600 dark:text-orange-300" : "text-muted-foreground"}`}
      >
        {(discountPct * 100).toFixed(1)}% de desconto · limite {(thresholdPct * 100).toFixed(0)}%
      </p>
    </div>
  );
}

export function QuoteSummaryPanel(props: IQuoteSummaryPanelProps) {
  if (props.compact) {
    return (
      <div className="flex flex-col gap-2">
        <ApprovalBlock
          needsJustification={props.needsJustification}
          discountReason={props.discountReason}
          onDiscountReason={props.onDiscountReason}
        />
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
          <div className="flex flex-wrap items-end gap-4">
            <span className="pb-2 text-xs text-muted-foreground">
              {props.itemCount} {props.itemCount === 1 ? "item" : "itens"} · {props.unitCount} un
            </span>
            <div>
              <Label htmlFor="discount-compact" className="text-xs">
                Desconto (R$)
              </Label>
              <Input
                id="discount-compact"
                type="number"
                min={0}
                step={0.01}
                value={props.discountInput}
                onChange={(e) => props.onDiscountInput(e.target.value)}
                className="h-9 w-28"
              />
            </div>
            <div>
              <Label htmlFor="shipping-compact" className="text-xs">
                Frete (R$)
              </Label>
              <div className="flex gap-1">
                <Input
                  id="shipping-compact"
                  type="number"
                  min={0}
                  step={0.01}
                  value={props.shipping}
                  onChange={(e) => props.onShipping(Math.max(0, Number(e.target.value) || 0))}
                  className="h-9 w-28"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={props.onCalcShipping}
                  className="h-9 shrink-0 gap-1"
                  aria-label="Calcular frete"
                >
                  <Icon icon="mdi:truck-fast-outline" size={14} />
                </Button>
              </div>
            </div>
          </div>
          <div className="text-right">
            <span className="block text-[10px] uppercase tracking-wide text-muted-foreground">
              Total
            </span>
            <span className="text-xl font-semibold tabular-nums text-primary">
              {moneyFormatter.format(props.total)}
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-lg border border-border bg-card p-4">
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
        <div className="mt-1.5">
          <DiscountMeter discountPct={props.discountPct} thresholdPct={props.thresholdPct} />
        </div>
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

      <ApprovalBlock
        needsJustification={props.needsJustification}
        discountReason={props.discountReason}
        onDiscountReason={props.onDiscountReason}
      />

      <div className="space-y-1 border-t border-border pt-3">
        <div className="flex flex-wrap gap-x-4 gap-y-1 pb-1 text-xs text-muted-foreground">
          <span>
            {props.itemCount} {props.itemCount === 1 ? "item" : "itens"} · {props.unitCount} un
          </span>
          {props.totalWeightKg > 0 && (
            <span>
              <Icon icon="mdi:weight-kilogram" size={12} className="mr-0.5 inline" />
              {props.totalWeightKg.toLocaleString("pt-BR")} kg
            </span>
          )}
          {props.showMargin && (
            <span title="Margem bruta estimada">
              <Icon icon="mdi:chart-line" size={12} className="mr-0.5 inline" />
              margem {moneyFormatter.format(props.totalMargin)} (
              {(props.marginPct * 100).toFixed(1)}%)
            </span>
          )}
        </div>
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
