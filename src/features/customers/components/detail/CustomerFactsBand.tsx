import type { ICustomer, ICustomerAddress } from "@/shared/types";
import { CUSTOMER_STRINGS } from "../../i18n/pt-BR";
import { formatCnpj, formatCpf, formatPhone } from "../../utils/cnpjCpf";
import { CustomerFact } from "./CustomerFact";

const COPY = CUSTOMER_STRINGS.detail.facts;

/** "BR 386, 37 — São Cristóvão · Frederico Westphalen / RS" */
function formatAddress(address: ICustomerAddress | undefined): string | null {
  if (!address) return null;
  const line = [address.street, address.number].filter(Boolean).join(", ");
  const district = address.district ? ` — ${address.district}` : "";
  const city = [address.city, address.state].filter(Boolean).join(" / ");
  return [`${line}${district}`, city].filter(Boolean).join(" · ");
}

export interface ICustomerFactsBandProps {
  customer: ICustomer;
  sellerName: string | null;
  storeName: string | null;
}

/**
 * Band 2 — the contact data a seller needs within three seconds of opening the
 * page. All of it used to live behind the "Visão geral" tab.
 *
 * The address gets the flexible column because it is the longest field by far;
 * the rest keep their natural width so the row stays scannable.
 */
export function CustomerFactsBand({ customer, sellerName, storeName }: ICustomerFactsBandProps) {
  const rawDocument = customer.type === "B2B" ? customer.cnpj : customer.cpf;
  const document = rawDocument?.trim()
    ? customer.type === "B2B"
      ? formatCnpj(rawDocument)
      : formatCpf(rawDocument)
    : null;
  const legalName = customer.type === "B2B" ? customer.razaoSocial : customer.fullName;
  const phoneDigits = customer.phone?.replace(/\D/g, "") ?? "";

  return (
    <div className="flex flex-wrap items-start gap-y-3 px-4 py-2.5 sm:px-6">
      <div className="min-w-0 shrink-0 basis-1/2 pr-4 sm:basis-auto sm:pr-5">
        <CustomerFact
          icon="mdi:phone-outline"
          label={COPY.phone}
          value={customer.phone ? formatPhone(customer.phone) : null}
          href={phoneDigits ? `tel:${phoneDigits}` : undefined}
          copyable
          mono
        />
      </div>

      <div className="min-w-0 shrink-0 basis-1/2 border-border pl-0 pr-4 sm:basis-auto sm:border-l sm:pl-5 sm:pr-5">
        <CustomerFact
          icon="mdi:card-account-details-outline"
          label={customer.type === "B2B" ? COPY.cnpj : COPY.cpf}
          value={document}
          copyable
          mono
        />
      </div>

      <div className="min-w-0 shrink-0 basis-1/2 border-border pr-4 sm:max-w-[260px] sm:basis-auto sm:border-l sm:pl-5 sm:pr-5">
        <CustomerFact
          icon="mdi:office-building-outline"
          label={customer.type === "B2B" ? COPY.razaoSocial : COPY.fullName}
          value={legalName}
        />
      </div>

      <div className="min-w-0 shrink-0 basis-1/2 border-border pr-4 sm:basis-auto sm:border-l sm:pl-5 sm:pr-5">
        <CustomerFact
          icon="mdi:email-outline"
          label={COPY.email}
          value={customer.email}
          href={customer.email ? `mailto:${customer.email}` : undefined}
          copyable
        />
      </div>

      <div className="min-w-0 flex-1 basis-full border-border pr-4 sm:basis-[220px] sm:border-l sm:pl-5 sm:pr-5">
        <CustomerFact
          icon="mdi:map-marker-outline"
          label={COPY.address}
          value={formatAddress(customer.address)}
          copyable
        />
      </div>

      <div className="min-w-0 shrink-0 basis-1/2 border-border pr-4 sm:basis-auto sm:border-l sm:pl-5 sm:pr-5">
        <CustomerFact
          icon="mdi:account-tie-outline"
          label={COPY.seller}
          value={sellerName}
          empty={COPY.noSeller}
        />
      </div>

      <div className="min-w-0 shrink-0 basis-1/2 border-border sm:basis-auto sm:border-l sm:pl-5">
        <CustomerFact icon="mdi:store-outline" label={COPY.store} value={storeName} />
      </div>
    </div>
  );
}
