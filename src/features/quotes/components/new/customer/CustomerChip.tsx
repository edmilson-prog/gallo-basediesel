// src/features/quotes/components/new/customer/CustomerChip.tsx
import type { ICustomer, ID, IVehicle } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import {
  getCustomerName,
  getCustomerDisplay,
  STATUS_BADGE_CLASSES,
  ABC_BADGE_CLASSES,
  TYPE_BADGE_CLASSES,
  CUSTOMER_STATUS_LABELS,
} from "@/features/customers/utils/customerDisplay";
import { formatCnpj, formatCpf } from "@/features/customers/utils/cnpjCpf";
import { CustomerAutocomplete } from "../CustomerAutocomplete";
import { customerFinanceSummary } from "../../../utils/customerFinance";

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const moneyFormatter = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function formatLastPurchase(iso?: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return dateFormatter.format(d);
}

/** "CNPJ 12.345.678/0001-90" / "CPF 004.221.330-05", or null when absent. */
function formatDocument(customer: ICustomer): string | null {
  if (customer.type === "B2B") return customer.cnpj ? `CNPJ ${formatCnpj(customer.cnpj)}` : null;
  return customer.cpf ? `CPF ${formatCpf(customer.cpf)}` : null;
}

/** One commercial fact chip — the facts that decide the discount. */
function Fact({
  icon,
  children,
  tone,
}: {
  icon: string;
  children: React.ReactNode;
  tone?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] ${
        tone ?? "border-border text-muted-foreground"
      }`}
    >
      <Icon icon={icon} size={12} />
      {children}
    </span>
  );
}

export interface ICustomerChipProps {
  customer: ICustomer | null;
  onChange: (c: ICustomer | null) => void;
  sellerIdFilter?: ID | null;
  /** Customer fleet, shown as vehicle chips. */
  vehicles?: IVehicle[];
}

/**
 * Customer band — a single row rather than a card: identity, document, address,
 * the commercial facts that decide the discount, and the fleet as chips.
 * Empty state is the search field itself.
 */
export function CustomerChip({
  customer,
  onChange,
  sellerIdFilter,
  vehicles = [],
}: ICustomerChipProps) {
  if (!customer) {
    return (
      <div className="flex shrink-0 items-center gap-3">
        <div className="min-w-0 flex-1">
          <CustomerAutocomplete value={null} onChange={onChange} sellerIdFilter={sellerIdFilter} />
        </div>
        <span className="hidden shrink-0 text-[11px] uppercase italic tracking-wide text-muted-foreground sm:inline">
          obrigatório para salvar
        </span>
      </div>
    );
  }

  const display = getCustomerDisplay(customer);
  const document = formatDocument(customer);
  const lastPurchase = formatLastPurchase(customer.lastPurchaseAt);
  const finance = customerFinanceSummary(customer);

  return (
    <div className="flex shrink-0 items-start gap-3 rounded-lg border border-border bg-card px-3 py-2.5">
      <span
        className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-lg text-xs font-bold"
        style={{ background: display.bg, color: display.fg }}
        aria-hidden
      >
        {display.avatarUrl ? (
          <img src={display.avatarUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          display.initials
        )}
      </span>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="truncate text-sm font-semibold text-foreground">
            {getCustomerName(customer)}
          </span>
          {customer.type === "B2B" &&
            customer.razaoSocial &&
            customer.razaoSocial !== getCustomerName(customer) && (
              <span className="truncate text-xs text-muted-foreground">
                ({customer.razaoSocial})
              </span>
            )}
          <span
            className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ${TYPE_BADGE_CLASSES[customer.type]}`}
          >
            {customer.type}
          </span>
          <span
            className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${STATUS_BADGE_CLASSES[customer.status]}`}
          >
            {CUSTOMER_STATUS_LABELS[customer.status]}
          </span>
          {customer.abcClass && (
            <span
              className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${ABC_BADGE_CLASSES[customer.abcClass]}`}
              title="Classe ABC"
            >
              ABC {customer.abcClass}
            </span>
          )}
        </div>

        {(document || customer.address) && (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
            {document && <span>{document}</span>}
            {document && customer.address && (
              <span className="h-0.5 w-0.5 rounded-full bg-muted-foreground/60" aria-hidden />
            )}
            {customer.address && (
              <span className="inline-flex min-w-0 items-center gap-1">
                <Icon icon="mdi:map-marker-outline" size={12} className="shrink-0" />
                <span className="truncate">
                  {customer.address.street}, {customer.address.number} — {customer.address.city}/
                  {customer.address.state}
                </span>
              </span>
            )}
          </div>
        )}

        {(finance.hasAny || lastPurchase) && (
          <div className="flex flex-wrap items-center gap-1.5">
            {finance.creditLimit !== undefined && (
              <Fact icon="mdi:credit-card-outline">
                Limite {moneyFormatter.format(finance.creditLimit)}
              </Fact>
            )}
            {finance.overdueTitlesCount !== undefined && (
              <Fact
                icon="mdi:alert-circle-outline"
                tone="border-severity-critical/30 bg-severity-critical/10 text-severity-critical"
              >
                {finance.overdueTitlesCount} título{finance.overdueTitlesCount > 1 ? "s" : ""}{" "}
                vencido{finance.overdueTitlesCount > 1 ? "s" : ""}
              </Fact>
            )}
            {finance.contractDiscountPct !== undefined && (
              <Fact
                icon="mdi:file-document-outline"
                tone="border-primary/30 bg-primary/10 text-primary"
              >
                Contrato −{(finance.contractDiscountPct * 100).toFixed(0)}%
              </Fact>
            )}
            {finance.contractPaymentTerms && (
              <Fact icon="mdi:calendar-clock-outline">{finance.contractPaymentTerms}</Fact>
            )}
            {lastPurchase && <Fact icon="mdi:history">Última compra {lastPurchase}</Fact>}
          </div>
        )}

        {vehicles.length > 0 && (
          <div className="flex flex-wrap items-center gap-1">
            <Icon
              icon="mdi:truck-outline"
              size={12}
              className="text-muted-foreground"
              aria-hidden
            />
            {vehicles.map((v) => (
              <span
                key={v.id}
                className="rounded border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground"
              >
                {v.brand} {v.model} {v.year}
                {v.plate ? ` · ${v.plate}` : ""}
              </span>
            ))}
          </div>
        )}
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="shrink-0"
        onClick={() => onChange(null)}
      >
        <Icon icon="mdi:swap-horizontal" size={14} />
        Alterar
      </Button>
    </div>
  );
}
