// src/features/quotes/components/new/customer/CustomerChip.tsx
import type { ICustomer, ID, IVehicle } from "@/shared/types";
import { Icon } from "@/components/Icon";
import {
  getCustomerName,
  STATUS_BADGE_CLASSES,
  ABC_BADGE_CLASSES,
  TYPE_BADGE_CLASSES,
  CUSTOMER_STATUS_LABELS,
} from "@/features/customers/utils/customerDisplay";
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

export interface ICustomerChipProps {
  customer: ICustomer | null;
  onChange: (c: ICustomer | null) => void;
  sellerIdFilter?: ID | null;
  /** Customer fleet, shown as vehicle chips. */
  vehicles?: IVehicle[];
}

export function CustomerChip({
  customer,
  onChange,
  sellerIdFilter,
  vehicles = [],
}: ICustomerChipProps) {
  if (!customer) {
    return (
      <CustomerAutocomplete value={null} onChange={onChange} sellerIdFilter={sellerIdFilter} />
    );
  }

  const lastPurchase = formatLastPurchase(customer.lastPurchaseAt);
  const finance = customerFinanceSummary(customer);

  return (
    <div className="rounded-md border border-border bg-card p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="truncate text-sm font-semibold text-foreground">
              {getCustomerName(customer)}
            </span>
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

          {customer.address && (
            <p className="truncate text-xs text-muted-foreground">
              <Icon icon="mdi:map-marker-outline" size={12} className="mr-1 inline" />
              {customer.address.street}, {customer.address.number} — {customer.address.city}/
              {customer.address.state}
            </p>
          )}

          {lastPurchase && (
            <p className="text-xs text-muted-foreground">
              <Icon icon="mdi:history" size={12} className="mr-1 inline" />
              Última compra em {lastPurchase}
            </p>
          )}

          {finance.hasAny && (
            <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
              {finance.creditLimit !== undefined && (
                <span className="rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                  <Icon icon="mdi:credit-card-outline" size={11} className="mr-1 inline" />
                  Limite {moneyFormatter.format(finance.creditLimit)}
                </span>
              )}
              {finance.overdueTitlesCount !== undefined && (
                <span className="rounded border border-severity-critical/30 bg-severity-critical/10 px-1.5 py-0.5 text-[10px] text-severity-critical">
                  <Icon icon="mdi:alert-circle-outline" size={11} className="mr-1 inline" />
                  {finance.overdueTitlesCount} título{finance.overdueTitlesCount > 1 ? "s" : ""}{" "}
                  vencido
                  {finance.overdueTitlesCount > 1 ? "s" : ""}
                </span>
              )}
              {finance.contractDiscountPct !== undefined && (
                <span className="rounded border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">
                  <Icon icon="mdi:file-document-outline" size={11} className="mr-1 inline" />
                  Contrato −{(finance.contractDiscountPct * 100).toFixed(0)}%
                </span>
              )}
              {finance.contractPaymentTerms && (
                <span className="rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                  <Icon icon="mdi:calendar-clock-outline" size={11} className="mr-1 inline" />
                  {finance.contractPaymentTerms}
                </span>
              )}
            </div>
          )}

          {vehicles.length > 0 && (
            <div className="flex flex-wrap items-center gap-1 pt-0.5">
              <Icon
                icon="mdi:truck-outline"
                size={12}
                className="text-muted-foreground"
                aria-hidden
              />
              {vehicles.map((v) => (
                <span
                  key={v.id}
                  className="rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
                >
                  {v.brand} {v.model} {v.year}
                  {v.plate ? ` · ${v.plate}` : ""}
                </span>
              ))}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => onChange(null)}
          className="shrink-0 text-xs text-muted-foreground hover:text-foreground"
        >
          Alterar
        </button>
      </div>
    </div>
  );
}
