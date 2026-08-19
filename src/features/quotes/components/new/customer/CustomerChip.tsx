// src/features/quotes/components/new/customer/CustomerChip.tsx
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import type { ICustomer, ID, ISeller, IVehicle } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { NewCustomerModal } from "@/features/customers/components/list/NewCustomerModal";
import { useCustomersProvider } from "@/providers/data/hooks/useCustomersProvider";
import { useSellersProvider } from "@/providers/data/hooks/useSellersProvider";
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
  /** Store the quick-registered customer belongs to. */
  storeId: ID;
  /** Seller pre-filled in the quick registration (null lets the user pick). */
  defaultSellerId?: ID | null;
  /** True for a Vendedor — the seller field is theirs and cannot be changed. */
  sellerLocked?: boolean;
}

/**
 * Empty band: the search field with the quick-registration door beside it. A
 * customer who is not in the base yet would otherwise stop the quote here.
 */
function EmptyCustomerBand({
  onChange,
  sellerIdFilter,
  storeId,
  defaultSellerId = null,
  sellerLocked = false,
}: Omit<ICustomerChipProps, "customer" | "vehicles">) {
  const [registering, setRegistering] = useState(false);
  const customersProvider = useCustomersProvider();
  const sellersProvider = useSellersProvider();

  // Only fetched once the modal is asked for — the band itself needs no sellers.
  const sellersQuery = useQuery({
    queryKey: ["sellers-for-quick-customer", storeId] as const,
    queryFn: () => sellersProvider.list({ storeId, active: true }),
    enabled: registering,
    staleTime: 60_000,
  });
  const sellers: ISeller[] = sellersQuery.data ?? [];
  const selectableSellers = sellerLocked
    ? sellers.filter((s) => s.id === defaultSellerId)
    : sellers;

  return (
    <div className="flex shrink-0 items-center gap-2.5 rounded-lg border border-border bg-card px-3 py-2.5">
      <Icon icon="mdi:account-search-outline" size={17} className="shrink-0 text-primary" />
      <div className="min-w-0 flex-1">
        <CustomerAutocomplete
          value={null}
          onChange={onChange}
          sellerIdFilter={sellerIdFilter}
          borderless
        />
      </div>
      <span className="hidden shrink-0 font-semicond text-[11px] uppercase italic tracking-wide text-muted-foreground sm:inline">
        obrigatório para salvar
      </span>
      <span className="hidden h-5 w-px shrink-0 bg-border sm:block" aria-hidden />
      <Button type="button" variant="ghost" size="sm" onClick={() => setRegistering(true)}>
        <Icon icon="mdi:account-plus-outline" size={15} />
        Cadastrar
      </Button>

      <NewCustomerModal
        open={registering}
        sellers={selectableSellers}
        defaultSellerId={defaultSellerId}
        sellerLocked={sellerLocked}
        storeId={storeId}
        onClose={() => setRegistering(false)}
        onSubmit={async (input) => {
          const created = await customersProvider.create(input);
          setRegistering(false);
          // Registered from inside the quote, so it is also the quote's customer.
          onChange(created);
          toast.success("Cliente criado e selecionado no orçamento.");
        }}
      />
    </div>
  );
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
  storeId,
  defaultSellerId = null,
  sellerLocked = false,
}: ICustomerChipProps) {
  if (!customer) {
    return (
      <EmptyCustomerBand
        onChange={onChange}
        sellerIdFilter={sellerIdFilter}
        storeId={storeId}
        defaultSellerId={defaultSellerId}
        sellerLocked={sellerLocked}
      />
    );
  }

  const display = getCustomerDisplay(customer);
  const document = formatDocument(customer);
  const lastPurchase = formatLastPurchase(customer.lastPurchaseAt);
  const finance = customerFinanceSummary(customer);

  return (
    <div className="flex shrink-0 items-start gap-3 rounded-lg border border-border bg-card px-3 py-2.5">
      <span
        className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-lg font-display text-[13.5px] font-extrabold"
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
              <span className="truncate font-semicond text-xs text-muted-foreground">
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
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 font-semicond text-xs text-muted-foreground">
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
                className="rounded border border-border px-1.5 py-0.5 font-semicond text-[11.5px] text-muted-foreground"
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
