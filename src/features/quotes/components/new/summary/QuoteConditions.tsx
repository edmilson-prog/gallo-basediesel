// src/features/quotes/components/new/summary/QuoteConditions.tsx
import type { QuotePaymentMethod } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const PAYMENT_OPTIONS: ReadonlyArray<{ value: QuotePaymentMethod; label: string }> = [
  { value: "pix", label: "PIX" },
  { value: "boleto", label: "Boleto" },
  { value: "cartao", label: "Cartão" },
  { value: "prazo", label: "Prazo" },
  { value: "outro", label: "Outro" },
];

const VALIDITY_SHORTCUTS = [7, 15, 30];

function isoDatePlusDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export interface IQuoteConditionsProps {
  paymentMethod: QuotePaymentMethod;
  onPaymentMethod: (v: QuotePaymentMethod) => void;
  paymentTerms: string;
  onPaymentTerms: (v: string) => void;
  validUntil: string;
  onValidUntil: (v: string) => void;
  /** Store default validity, surfaced next to the shortcuts. */
  defaultValidityDays: number;
  /** `card` lays the three fields side by side; `rail` stacks them. */
  variant?: "rail" | "card";
}

/** Payment method, delivery terms and validity — the commercial conditions. */
export function QuoteConditions({
  paymentMethod,
  onPaymentMethod,
  paymentTerms,
  onPaymentTerms,
  validUntil,
  onValidUntil,
  defaultValidityDays,
  variant = "rail",
}: IQuoteConditionsProps) {
  const isCard = variant === "card";

  const body = (
    <div className="flex flex-col gap-3">
      <div className={isCard ? "grid gap-3 md:grid-cols-3" : "flex flex-col gap-3"}>
        <div>
          <Label htmlFor="quote-payment" className="text-[10px] uppercase tracking-wider">
            Forma de pagamento
          </Label>
          <Select
            value={paymentMethod}
            onValueChange={(v) => onPaymentMethod(v as QuotePaymentMethod)}
          >
            <SelectTrigger id="quote-payment" className="mt-1.5">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAYMENT_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="quote-terms" className="text-[10px] uppercase tracking-wider">
            Prazo
          </Label>
          <Input
            id="quote-terms"
            className="mt-1.5"
            value={paymentTerms}
            onChange={(e) => onPaymentTerms(e.target.value)}
            placeholder="ex.: 30/60/90 dias"
          />
        </div>
        <div>
          <Label htmlFor="quote-valid" className="text-[10px] uppercase tracking-wider">
            Válido até
          </Label>
          <Input
            id="quote-valid"
            type="date"
            className="mt-1.5"
            value={validUntil}
            onChange={(e) => onValidUntil(e.target.value)}
          />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {VALIDITY_SHORTCUTS.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => onValidUntil(isoDatePlusDays(d))}
            className="rounded-md border border-border px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground motion-reduce:transition-none"
          >
            +{d} dias
          </button>
        ))}
        <span className="text-[11px] text-muted-foreground">
          padrão da loja: {defaultValidityDays} dias
        </span>
      </div>
    </div>
  );

  if (isCard) {
    return (
      <section className="rounded-lg border border-border bg-card">
        <header className="flex items-center gap-2 border-b border-border px-3 py-2">
          <Icon icon="mdi:credit-card-outline" size={15} className="text-muted-foreground" />
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Condições de pagamento
          </h2>
        </header>
        <div className="p-3">{body}</div>
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-2.5 border-b border-border p-3.5">
      <div className="flex items-center gap-2">
        <Icon icon="mdi:credit-card-outline" size={15} className="text-muted-foreground" />
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Condições de pagamento
        </h2>
      </div>
      {body}
    </div>
  );
}
