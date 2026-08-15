import type { ICustomer, ICustomerAddress } from "@/shared/types";
import { CUSTOMER_STRINGS } from "../../i18n/pt-BR";
import { formatCnpj, formatCpf, formatPhone } from "../../utils/cnpjCpf";
import type { ICustomerFactProps } from "./CustomerFact";

const COPY = CUSTOMER_STRINGS.detail.facts;

/** "BR 386, 37 — São Cristóvão · Frederico Westphalen / RS" */
export function formatAddress(address: ICustomerAddress | undefined): string | null {
  if (!address) return null;
  const line = [address.street, address.number].filter(Boolean).join(", ");
  const district = address.district ? ` — ${address.district}` : "";
  const city = [address.city, address.state].filter(Boolean).join(" / ");
  return [`${line}${district}`, city].filter(Boolean).join(" · ");
}

export interface ICustomerFactCell extends ICustomerFactProps {
  key: string;
}

/**
 * The contact facts of the header, in kit order: phone, document, legal name,
 * e-mail, address, seller, store.
 *
 * Shared by both header directions — A lays them out in a single row with
 * dividers, B in a two-column grid — so the two can never disagree on what a
 * customer's document or address is.
 */
export function buildCustomerFactCells(
  customer: ICustomer,
  sellerName: string | null,
  storeName: string | null,
): ICustomerFactCell[] {
  const rawDocument = customer.type === "B2B" ? customer.cnpj : customer.cpf;
  const document = rawDocument?.trim()
    ? customer.type === "B2B"
      ? formatCnpj(rawDocument)
      : formatCpf(rawDocument)
    : null;
  const legalName = customer.type === "B2B" ? customer.razaoSocial : customer.fullName;
  const phoneDigits = customer.phone?.replace(/\D/g, "") ?? "";

  return [
    {
      key: "phone",
      icon: "mdi:phone-outline",
      label: COPY.phone,
      value: customer.phone ? formatPhone(customer.phone) : null,
      href: phoneDigits ? `tel:${phoneDigits}` : undefined,
      copyable: true,
      mono: true,
    },
    {
      key: "document",
      icon: "mdi:card-account-details-outline",
      label: customer.type === "B2B" ? COPY.cnpj : COPY.cpf,
      value: document,
      copyable: true,
      mono: true,
    },
    {
      key: "legalName",
      icon: "mdi:office-building-outline",
      label: customer.type === "B2B" ? COPY.razaoSocial : COPY.fullName,
      value: legalName,
    },
    {
      key: "email",
      icon: "mdi:email-outline",
      label: COPY.email,
      value: customer.email,
      href: customer.email ? `mailto:${customer.email}` : undefined,
      copyable: true,
    },
    {
      key: "address",
      icon: "mdi:map-marker-outline",
      label: COPY.address,
      value: formatAddress(customer.address),
      copyable: true,
    },
    {
      key: "seller",
      icon: "mdi:account-tie-outline",
      label: COPY.seller,
      value: sellerName,
      empty: COPY.noSeller,
    },
    {
      key: "store",
      icon: "mdi:store-outline",
      label: COPY.store,
      value: storeName,
    },
  ];
}
