import type { ICustomer, ICustomerAddress } from "@/shared/types";
import { CUSTOMER_STRINGS } from "../../i18n/pt-BR";
import { formatCnpj, formatCpf } from "../../utils/cnpjCpf";
// NOT `../../utils/cnpjCpf`: that `formatPhone` is a TYPING MASK — it slices to
// 11 digits so a national number formats progressively as the user types. The
// base stores E.164 with the 55 prefix (1.980 rows), and the mask turned
// `+551120981133` into `(55) 11209-8113` — DDI read as DDD, last digit dropped.
// The shared formatter is the display one and understands the prefix.
import { formatPhone } from "@/shared/utils/format";
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
  /** How many people the Agenda knows for this company. */
  contactCount = 0,
): ICustomerFactCell[] {
  const rawDocument = customer.type === "B2B" ? customer.cnpj : customer.cpf;
  const document = rawDocument?.trim()
    ? customer.type === "B2B"
      ? formatCnpj(rawDocument)
      : formatCpf(rawDocument)
    : null;
  const legalName = customer.type === "B2B" ? customer.razaoSocial : customer.fullName;
  const phoneDigits = customer.phone?.replace(/\D/g, "") ?? "";
  // A company is reached through several people. The header keeps showing the
  // main number — the anchor every surface addresses — and adds "+N" so the
  // existence of the others is visible in the first fold WITHOUT spending a new
  // cell. The label follows: one number is a "Telefone", several are "Contatos".
  const others = Math.max(0, contactCount - 1);

  return [
    {
      key: "phone",
      icon: others > 0 ? "mdi:card-account-phone-outline" : "mdi:phone-outline",
      label: others > 0 ? COPY.contacts : COPY.phone,
      value: customer.phone ? formatPhone(customer.phone) : null,
      suffix: others > 0 ? `+${others}` : undefined,
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
