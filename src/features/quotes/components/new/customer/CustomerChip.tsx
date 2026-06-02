// src/features/quotes/components/new/customer/CustomerChip.tsx
import type { ICustomer, ID } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { CustomerAutocomplete } from "../CustomerAutocomplete";

function nameOf(c: ICustomer): string {
  return c.type === "B2B" ? c.nomeFantasia || c.razaoSocial : c.fullName;
}

export interface ICustomerChipProps {
  customer: ICustomer | null;
  onChange: (c: ICustomer | null) => void;
  sellerIdFilter?: ID | null;
}

export function CustomerChip({ customer, onChange, sellerIdFilter }: ICustomerChipProps) {
  if (!customer) {
    return (
      <CustomerAutocomplete value={null} onChange={onChange} sellerIdFilter={sellerIdFilter} />
    );
  }
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-2">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-foreground">
          {nameOf(customer)}
          <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
            {customer.type}
          </span>
        </p>
        {customer.address && (
          <p className="truncate text-xs text-muted-foreground">
            <Icon icon="mdi:map-marker-outline" size={12} className="mr-1 inline" />
            {customer.address.street}, {customer.address.number} — {customer.address.city}/
            {customer.address.state}
          </p>
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
  );
}
