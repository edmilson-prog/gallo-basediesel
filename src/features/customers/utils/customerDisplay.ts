import type { ICustomer, CustomerStatus, ABCClass } from "@/shared/types";
import { hashHue, initialsFrom, avatarColors, isPhoneLikeName } from "@/shared/utils/avatar";

/** Visual descriptor of a customer used by the profile header & related surfaces. */
export interface ICustomerDisplay {
  name: string;
  initials: string;
  /** Public URL of the contact's synced WhatsApp photo, when available. */
  avatarUrl?: string;
  /**
   * The display name is really just a phone number (unsaved WhatsApp contact) —
   * surfaces render a generic person icon instead of a useless `"+5"`.
   */
  isPhoneName: boolean;
  hue: number;
  bg: string;
  fg: string;
}

/** Resolve display name based on the B2B/B2C discriminated union. */
export function getCustomerName(customer: ICustomer): string {
  if (customer.type === "B2B") {
    return customer.nomeFantasia || customer.razaoSocial;
  }
  return customer.fullName;
}

export function getCustomerDisplay(customer: ICustomer): ICustomerDisplay {
  const name = getCustomerName(customer);
  const hue = hashHue(customer.id);
  const colors = avatarColors(hue);
  return {
    name,
    initials: initialsFrom(name),
    avatarUrl: customer.avatarUrl,
    isPhoneName: isPhoneLikeName(name),
    hue,
    bg: colors.bg,
    fg: colors.fg,
  };
}

/**
 * Color tokens for each lifecycle status badge. Anchored to semantic Tailwind
 * tokens so the look adapts across themes & modes.
 */
export const STATUS_BADGE_CLASSES: Record<CustomerStatus, string> = {
  ativo: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30",
  dormente: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30",
  recuperacao: "bg-sky-500/15 text-sky-700 dark:text-sky-300 border border-sky-500/30",
  perdido: "bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30",
};

/**
 * Tones for the ABC class chip. A → gold, B → silver, C → neutral.
 * Uses gradient-style backgrounds so the gold/silver feel is obvious without
 * leaving the design system.
 */
export const ABC_BADGE_CLASSES: Record<ABCClass, string> = {
  A: "bg-amber-400/20 text-amber-700 dark:text-amber-300 border border-amber-400/40",
  B: "bg-zinc-400/15 text-zinc-700 dark:text-zinc-300 border border-zinc-400/30",
  C: "bg-muted text-muted-foreground border border-border",
};

/** Tone for the customer-type chip (B2B emphasized, B2C neutral). */
export const TYPE_BADGE_CLASSES: Record<ICustomer["type"], string> = {
  B2B: "bg-primary/10 text-primary border border-primary/30",
  B2C: "bg-muted text-muted-foreground border border-border",
};

/** Human labels (pt-BR) for each customer lifecycle status. */
export const CUSTOMER_STATUS_LABELS: Record<CustomerStatus, string> = {
  ativo: "Ativo",
  dormente: "Dormente",
  recuperacao: "Recuperação",
  perdido: "Perdido",
};
