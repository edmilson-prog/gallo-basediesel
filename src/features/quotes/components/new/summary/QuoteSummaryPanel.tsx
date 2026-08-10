import { Icon } from "@/components/Icon";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { IShippingQuoteOption, ShippingQuoteSource } from "@/shared/types";
import { formatDecimalBR, parseDecimalBR } from "../../../utils/numberInput";
import { InlineCell } from "../items/InlineCell";

const moneyFormatter = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function formatPct(fraction: number, digits = 1): string {
  return `${(fraction * 100).toLocaleString("pt-BR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}%`;
}

/** How the panel is composed: right rail, inline card, or fixed footer bar. */
export type QuoteSummaryVariant = "rail" | "card" | "bar";

/** Shipping-quote UI state passed down from the editor (Melhor Envio Fase A). */
export interface IShippingQuoteUi {
  /** Whether the Melhor Envio integration is enabled for this store. */
  enabled: boolean;
  loading: boolean;
  source?: ShippingQuoteSource;
  options: IShippingQuoteOption[];
  /** Service id currently applied (controls the option select). */
  selectedServiceId?: number | null;
  freeShippingApplied?: boolean;
  onSelectOption: (serviceId: number) => void;
}

const SOURCE_META: Record<ShippingQuoteSource, { label: string; icon: string; className: string }> =
  {
    melhor_envio: {
      label: "Melhor Envio",
      icon: "mdi:truck-fast-outline",
      className: "text-info",
    },
    region_rules: {
      label: "Regra regional",
      icon: "mdi:map-marker-radius-outline",
      className: "text-muted-foreground",
    },
    to_negotiate: {
      label: "A combinar",
      icon: "mdi:handshake-outline",
      className: "text-severity-warning",
    },
  };

/**
 * Source badge + carrier-option switcher rendered below the "Frete (R$)" input.
 * Hidden entirely when the integration is off (PRD-033 manual mode).
 */
function ShippingQuoteInfo({ quote }: { quote?: IShippingQuoteUi }) {
  if (!quote?.enabled) return null;

  if (quote.loading) {
    return (
      <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Icon icon="mdi:loading" size={12} className="animate-spin motion-reduce:animate-none" />
        Cotando frete…
      </p>
    );
  }
  if (!quote.source) return null;

  const meta = SOURCE_META[quote.source];
  const selected =
    quote.selectedServiceId != null
      ? String(quote.selectedServiceId)
      : quote.options[0]
        ? String(quote.options[0].serviceId)
        : "";

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
        <span className={`inline-flex items-center gap-1 ${meta.className}`}>
          <Icon icon={meta.icon} size={13} />
          {meta.label}
        </span>
        {quote.freeShippingApplied && (
          <span className="inline-flex items-center gap-1 text-severity-success">
            <Icon icon="mdi:gift-outline" size={13} />
            Frete grátis aplicado
          </span>
        )}
      </div>
      {quote.source === "melhor_envio" && quote.options.length > 0 && (
        <Select value={selected} onValueChange={(v) => quote.onSelectOption(Number(v))}>
          <SelectTrigger className="h-8 text-xs" aria-label="Escolher transportadora">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {quote.options.map((option) => (
              <SelectItem key={option.serviceId} value={String(option.serviceId)}>
                {option.serviceName} · {option.companyName} · {option.deliveryDays} d ·{" "}
                {moneyFormatter.format(option.finalPrice)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}

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
  /** Total weight (kg) of the quote — Σ weightKg * quantity. */
  totalWeightKg: number;
  /** Net margin (line margins less the global discount) — shown only when `showMargin`. */
  totalMargin: number;
  /** Margin as fraction of subtotal (0..1). */
  marginPct: number;
  /** Whether to surface margin figures (Owner/Gestor only). */
  showMargin: boolean;
  /** Automatic shipping-quote state (Melhor Envio Fase A). Absent = manual only. */
  quote?: IShippingQuoteUi;
  variant?: QuoteSummaryVariant;
}

function ApprovalBlock({
  needsJustification,
  discountReason,
  onDiscountReason,
}: Pick<IQuoteSummaryPanelProps, "needsJustification" | "discountReason" | "onDiscountReason">) {
  if (!needsJustification) return null;
  return (
    <div
      className="rounded-lg border border-severity-warning/30 bg-severity-warning/5 p-2.5"
      role="alert"
    >
      <p className="flex items-center gap-1.5 text-xs font-medium text-severity-warning">
        <Icon icon="mdi:shield-alert-outline" size={14} />
        Desconto acima do limite — requer aprovação do gestor
      </p>
      <Textarea
        rows={2}
        className={`mt-2 text-xs ${
          discountReason.trim()
            ? ""
            : "border-severity-warning/50 focus-visible:ring-severity-warning/40"
        }`}
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
    <div className="mt-2 space-y-1">
      <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full transition-[width] duration-200 motion-reduce:transition-none ${
            over ? "bg-severity-warning" : "bg-severity-success"
          }`}
          style={{ width: `${fillPct}%` }}
        />
        <span
          className="absolute top-1/2 h-2.5 w-0.5 -translate-y-1/2 bg-foreground/60"
          style={{ left: `${markerPct}%` }}
          aria-hidden
        />
      </div>
      <p className={`text-[11px] ${over ? "text-severity-warning" : "text-muted-foreground"}`}>
        {formatPct(discountPct)} de desconto · limite {formatPct(thresholdPct, 0)}
      </p>
    </div>
  );
}

function marginToneClass(marginPct: number, subtotal: number): string {
  if (subtotal <= 0) return "text-muted-foreground";
  if (marginPct >= 0.22) return "text-severity-success";
  if (marginPct >= 0.12) return "text-severity-warning";
  return "text-severity-critical";
}

function Counters(props: IQuoteSummaryPanelProps) {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 pb-1.5 text-[11px] text-muted-foreground">
      <span>
        {props.itemCount} {props.itemCount === 1 ? "item" : "itens"} · {props.unitCount} un
      </span>
      {props.totalWeightKg > 0 && (
        <span className="inline-flex items-center gap-1">
          <Icon icon="mdi:weight-kilogram" size={12} />
          {props.totalWeightKg.toLocaleString("pt-BR")} kg
        </span>
      )}
      {props.showMargin && (
        <span
          title="Margem bruta estimada, já descontado o desconto global"
          className={`inline-flex items-center gap-1 ${marginToneClass(props.marginPct, props.subtotal)}`}
        >
          <Icon icon="mdi:chart-line" size={12} />
          margem {moneyFormatter.format(props.totalMargin)} ({formatPct(props.marginPct)})
        </span>
      )}
    </div>
  );
}

function Totals(props: IQuoteSummaryPanelProps) {
  return (
    <div className="mt-1 border-t border-border pt-2.5">
      <Counters {...props} />
      <Row label="Subtotal" value={moneyFormatter.format(props.subtotal)} />
      <Row
        label="Desconto"
        value={`− ${moneyFormatter.format(props.discountTotal)}`}
        tone={props.discountTotal > 0 ? "text-severity-warning" : undefined}
      />
      <Row label="Frete" value={`+ ${moneyFormatter.format(props.shippingTotal)}`} />
      <div className="mt-2 flex items-end justify-between gap-2 border-t border-border pt-2.5">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Total
        </span>
        <span className="text-3xl font-bold leading-none tabular-nums text-foreground">
          {moneyFormatter.format(props.total)}
        </span>
      </div>
    </div>
  );
}

function DiscountField(props: IQuoteSummaryPanelProps) {
  return (
    <div>
      <Label className="text-[10px] uppercase tracking-wider">Desconto global (R$)</Label>
      <div className="mt-1.5 rounded-md border border-border bg-background px-1 py-0.5">
        <InlineCell
          value={formatDecimalBR(Number(props.discountInput) || 0)}
          onCommit={(raw) => props.onDiscountInput(String(parseDecimalBR(raw)))}
          prefix="R$"
          ariaLabel="Desconto global em reais"
          inputClassName={props.discountTotal > 0 ? "text-severity-warning" : "text-foreground"}
        />
      </div>
      <DiscountMeter discountPct={props.discountPct} thresholdPct={props.thresholdPct} />
    </div>
  );
}

function ShippingField(props: IQuoteSummaryPanelProps) {
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <Label className="text-[10px] uppercase tracking-wider">Frete (R$)</Label>
        <button
          type="button"
          onClick={props.onCalcShipping}
          className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
        >
          <Icon icon="mdi:truck-fast-outline" size={13} />
          cotar novamente
        </button>
      </div>
      <div className="mt-1.5 rounded-md border border-border bg-background px-1 py-0.5">
        <InlineCell
          value={formatDecimalBR(props.shipping)}
          onCommit={(raw) => props.onShipping(parseDecimalBR(raw))}
          prefix="R$"
          ariaLabel="Valor do frete em reais"
        />
      </div>
      <div className="mt-1.5">
        <ShippingQuoteInfo quote={props.quote} />
      </div>
    </div>
  );
}

export function QuoteSummaryPanel(props: IQuoteSummaryPanelProps) {
  const variant = props.variant ?? "rail";

  if (variant === "bar") {
    return (
      <div className="flex flex-col gap-2">
        <ApprovalBlock
          needsJustification={props.needsJustification}
          discountReason={props.discountReason}
          onDiscountReason={props.onDiscountReason}
        />
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
          <div className="flex flex-wrap items-end gap-4">
            <span className="pb-2 text-[11px] text-muted-foreground">
              {props.itemCount} {props.itemCount === 1 ? "item" : "itens"} · {props.unitCount} un
            </span>
            <div className="w-36">
              <DiscountFieldCompact {...props} />
            </div>
            <div className="w-36">
              <ShippingFieldCompact {...props} />
            </div>
            <div className="pb-1 text-[11px]">
              <p
                className={
                  props.discountPct > props.thresholdPct
                    ? "text-severity-warning"
                    : "text-muted-foreground"
                }
              >
                {formatPct(props.discountPct)} · limite {formatPct(props.thresholdPct, 0)}
              </p>
              {props.showMargin && (
                <p className={marginToneClass(props.marginPct, props.subtotal)}>
                  margem {moneyFormatter.format(props.totalMargin)} ({formatPct(props.marginPct)})
                </p>
              )}
            </div>
          </div>
          <div className="text-right">
            <span className="block text-[10px] uppercase tracking-wider text-muted-foreground">
              Total
            </span>
            <span className="text-2xl font-bold tabular-nums text-foreground">
              {moneyFormatter.format(props.total)}
            </span>
          </div>
        </div>
        <ShippingQuoteInfo quote={props.quote} />
      </div>
    );
  }

  const body = (
    <div className="flex flex-col gap-3">
      <DiscountField {...props} />
      <ShippingField {...props} />
      <ApprovalBlock
        needsJustification={props.needsJustification}
        discountReason={props.discountReason}
        onDiscountReason={props.onDiscountReason}
      />
      <Totals {...props} />
    </div>
  );

  if (variant === "card") {
    return (
      <section className="rounded-lg border border-border bg-card">
        <header className="flex items-center gap-2 border-b border-border px-3 py-2">
          <Icon icon="mdi:receipt-text-outline" size={15} className="text-muted-foreground" />
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Resumo
          </h2>
        </header>
        <div className="p-3">{body}</div>
      </section>
    );
  }

  return <div className="border-b border-border p-3.5">{body}</div>;
}

function DiscountFieldCompact(props: IQuoteSummaryPanelProps) {
  return (
    <>
      <Label className="text-[10px] uppercase tracking-wider">Desconto (R$)</Label>
      <div className="mt-1 rounded-md border border-border bg-background px-1 py-0.5">
        <InlineCell
          value={formatDecimalBR(Number(props.discountInput) || 0)}
          onCommit={(raw) => props.onDiscountInput(String(parseDecimalBR(raw)))}
          prefix="R$"
          ariaLabel="Desconto global em reais"
        />
      </div>
    </>
  );
}

function ShippingFieldCompact(props: IQuoteSummaryPanelProps) {
  return (
    <>
      <Label className="text-[10px] uppercase tracking-wider">Frete (R$)</Label>
      <div className="mt-1 rounded-md border border-border bg-background px-1 py-0.5">
        <InlineCell
          value={formatDecimalBR(props.shipping)}
          onCommit={(raw) => props.onShipping(parseDecimalBR(raw))}
          prefix="R$"
          ariaLabel="Valor do frete em reais"
        />
      </div>
    </>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-0.5 text-[13px]">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-medium tabular-nums ${tone ?? "text-foreground"}`}>{value}</span>
    </div>
  );
}
