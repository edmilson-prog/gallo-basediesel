import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Icon } from "@/components/Icon";
import { formatBRL } from "@/shared/utils/format";
import type {
  CheckoutIdentity,
  ICheckoutAddress,
  ICheckoutPayment,
} from "../../hooks/useCheckoutState";
import type { ICartItem } from "@/features/storefront/store/cartStore";
import { STOREFRONT_CART_STRINGS as S } from "../../i18n/pt-BR";

export interface IPaymentStepProps {
  value: ICheckoutPayment;
  onChange: (value: ICheckoutPayment) => void;
  identity: CheckoutIdentity | null;
  address: ICheckoutAddress | null;
  items: ICartItem[];
  subtotal: number;
  shipping: number;
  shippingNegotiate: boolean;
}

const METHODS = [
  {
    id: "pix" as const,
    icon: "mdi:qrcode",
    label: S.paymentPix,
    hint: S.paymentPixHint,
  },
  {
    id: "boleto" as const,
    icon: "mdi:barcode",
    label: S.paymentBoleto,
    hint: S.paymentBoletoHint,
  },
  {
    id: "cartao" as const,
    icon: "mdi:credit-card-outline",
    label: S.paymentCard,
    hint: S.paymentCardHint,
  },
];

/**
 * Checkout step 3 — payment method + final review (PRD-064 RF-025–028).
 *
 * All payment methods are placeholders on the MVP — the disclaimer makes
 * that explicit. The review block snapshots identity, address and items so
 * the customer can audit the order before confirming.
 */
export function PaymentStep({
  value,
  onChange,
  identity,
  address,
  items,
  subtotal,
  shipping,
  shippingNegotiate,
}: IPaymentStepProps) {
  const total = subtotal + shipping;

  return (
    <div className="space-y-4">
      <Card className="space-y-4 p-6">
        <h2 className="text-base font-semibold text-foreground">{S.paymentTitle}</h2>
        <RadioGroup
          value={value.method}
          onValueChange={(v) => onChange({ method: v as ICheckoutPayment["method"] })}
          className="space-y-2"
        >
          {METHODS.map((m) => (
            <label
              key={m.id}
              className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors ${
                value.method === m.id ? "border-primary bg-primary/5" : "border-border"
              }`}
            >
              <RadioGroupItem value={m.id} className="mt-1" />
              <Icon icon={m.icon} size={22} className="mt-0.5 text-primary" aria-hidden />
              <div>
                <p className="text-sm font-medium text-foreground">{m.label}</p>
                <p className="text-xs text-muted-foreground">{m.hint}</p>
              </div>
            </label>
          ))}
        </RadioGroup>
      </Card>

      <Card className="space-y-4 p-6">
        <h2 className="text-base font-semibold text-foreground">{S.reviewTitle}</h2>

        <section className="space-y-1">
          <ReviewHeading icon="mdi:account-outline" label={S.checkoutStep1} />
          <div className="text-sm text-muted-foreground">
            {identity?.kind === "guest"
              ? `${identity.fullName} · ${identity.email} · ${identity.phone}`
              : identity?.kind === "registered"
                ? identity.displayName
                : "—"}
          </div>
        </section>

        <section className="space-y-1">
          <ReviewHeading icon="mdi:map-marker-outline" label={S.reviewAddress} />
          {address ? (
            <p className="text-sm text-muted-foreground">
              {address.street}, {address.number}
              {address.complement ? ` ${address.complement}` : ""} — {address.district},{" "}
              {address.city}/{address.state} — CEP {address.zipCode}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">—</p>
          )}
        </section>

        <section className="space-y-1">
          <ReviewHeading icon="mdi:credit-card-outline" label={S.reviewPayment} />
          <p className="text-sm text-muted-foreground">
            {METHODS.find((m) => m.id === value.method)?.label ?? value.method}
          </p>
        </section>

        <section className="space-y-2">
          <ReviewHeading icon="mdi:cart-outline" label={S.reviewItems} />
          <ul className="divide-y divide-border rounded-md border border-border">
            {items.map((item) => (
              <li
                key={item.partId}
                className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
              >
                <div className="min-w-0">
                  <p className="line-clamp-1 font-medium text-foreground">{item.partName}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.quantity} × {formatBRL(item.unitPrice)}
                  </p>
                </div>
                <span className="font-medium text-foreground">
                  {formatBRL(item.unitPrice * item.quantity)}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="space-y-1 border-t border-border pt-3">
          <ReviewHeading icon="mdi:calculator-variant-outline" label={S.reviewTotals} />
          <Row label={S.summarySubtotal} value={formatBRL(subtotal)} />
          <Row
            label={S.summaryShipping}
            value={shippingNegotiate ? S.summaryShippingNegotiate : formatBRL(shipping)}
          />
          <Row label={S.summaryTotal} value={formatBRL(total)} strong />
        </section>
      </Card>
    </div>
  );
}

function ReviewHeading({ icon, label }: { icon: string; label: string }) {
  return (
    <Label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
      <Icon icon={icon} size={14} aria-hidden />
      {label}
    </Label>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className={strong ? "font-semibold text-foreground" : "text-muted-foreground"}>
        {label}
      </span>
      <span
        className={strong ? "text-base font-semibold text-primary" : "font-medium text-foreground"}
      >
        {value}
      </span>
    </div>
  );
}
