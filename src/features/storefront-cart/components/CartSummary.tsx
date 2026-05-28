import { Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Icon } from "@/components/Icon";
import { formatBRL } from "@/shared/utils/format";
import type { IUseCartShippingResult } from "../hooks/useCartShipping";
import { formatZip } from "../hooks/useViaCep";
import { STOREFRONT_CART_STRINGS as S } from "../i18n/pt-BR";

export interface ICartSummaryProps {
  subtotal: number;
  shipping: IUseCartShippingResult;
  /** When false, hides the "Finalizar pedido" CTA (used by the mobile sticky). */
  showCheckoutCta?: boolean;
  /** When true, lays the summary out horizontally for the mobile sticky bar. */
  variant?: "default" | "compact";
}

/**
 * Sticky-on-desktop summary of the cart (PRD-064 RF-008).
 *
 * Encapsulates the subtotal/shipping/total math, the CEP calculator and the
 * coupon placeholder. Stays presentational so the checkout review screen can
 * reuse the same component for the final review.
 */
export function CartSummary({
  subtotal,
  shipping,
  showCheckoutCta = true,
  variant = "default",
}: ICartSummaryProps) {
  const shippingValue = shipping.hasValue ? shipping.value : 0;
  const total = subtotal + shippingValue;

  return (
    <Card className={`space-y-4 p-5 ${variant === "compact" ? "" : "lg:sticky lg:top-24"}`}>
      <h2 className="text-base font-semibold text-foreground">{S.summaryTitle}</h2>

      <div className="space-y-2 text-sm">
        <Row label={S.summarySubtotal} value={formatBRL(subtotal)} />
        <Row
          label={S.summaryShipping}
          value={
            shipping.hasValue
              ? formatBRL(shippingValue)
              : shipping.result?.isToNegotiate
                ? S.summaryShippingNegotiate
                : S.summaryShippingToCalculate
          }
        />
        <hr className="border-border" />
        <Row label={S.summaryTotal} value={formatBRL(total)} strong />
      </div>

      <ShippingCalculator shipping={shipping} />

      <CouponPlaceholder />

      {showCheckoutCta && (
        <Button asChild size="lg" className="w-full" disabled={subtotal <= 0}>
          <Link to="/loja/checkout">
            <Icon icon="mdi:credit-card-check-outline" size={16} className="mr-2" aria-hidden />
            {S.summaryCheckoutCta}
          </Link>
        </Button>
      )}
    </Card>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className={strong ? "text-sm font-semibold text-foreground" : "text-muted-foreground"}>
        {label}
      </span>
      <span
        className={
          strong ? "text-base font-semibold text-primary" : "text-sm font-medium text-foreground"
        }
      >
        {value}
      </span>
    </div>
  );
}

function ShippingCalculator({ shipping }: { shipping: IUseCartShippingResult }) {
  return (
    <div className="space-y-2 rounded-md border border-border bg-muted/30 p-3">
      <Label
        htmlFor="cart-zip"
        className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
      >
        {S.shippingCalcTitle}
      </Label>
      <div className="flex items-center gap-2">
        <Input
          id="cart-zip"
          inputMode="numeric"
          autoComplete="postal-code"
          placeholder={S.shippingZipPlaceholder}
          value={shipping.zipInput}
          onChange={(e) => shipping.setZipInput(formatZip(e.target.value))}
          maxLength={9}
        />
        <Button
          variant="outline"
          size="sm"
          onClick={() => void shipping.calculate()}
          disabled={shipping.loading}
        >
          {shipping.loading ? "…" : S.shippingCalcCta}
        </Button>
      </div>
      {shipping.error && <p className="text-xs text-destructive">{shipping.error}</p>}
      {shipping.result && (
        <p className="text-xs text-muted-foreground">
          {shipping.result.isToNegotiate
            ? S.shippingCalcNegotiate
            : shipping.result.appliedRate
              ? S.summaryShipMethod(shipping.result.appliedRate.name)
              : shipping.result.notes}
        </p>
      )}
    </div>
  );
}

function CouponPlaceholder() {
  return (
    <div className="space-y-2 rounded-md border border-dashed border-border bg-muted/20 p-3">
      <Label
        htmlFor="cart-coupon"
        className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
      >
        {S.couponTitle}
      </Label>
      <div className="flex items-center gap-2">
        <Input id="cart-coupon" placeholder={S.couponPlaceholder} disabled />
        <Button variant="outline" size="sm" disabled title={S.couponDisabledHint}>
          Aplicar
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">{S.couponDisabledHint}</p>
    </div>
  );
}
