import type { ICustomer } from "@/shared/types";
import { cn } from "@/lib/utils";
import { CUSTOMER_STRINGS } from "../i18n/pt-BR";
import {
  ABC_BADGE_CLASSES,
  STATUS_BADGE_CLASSES,
  TYPE_BADGE_CLASSES,
} from "../utils/customerDisplay";

export interface IProfileBadgesProps {
  customer: ICustomer;
  /** Slot for the optional "Histórico pré-conversão" badge (renders a popover). */
  preConversionSlot?: React.ReactNode;
  className?: string;
}

/**
 * Positivated this month = the most recent paid purchase falls in the current
 * calendar month — same definition as the positivation engine (PRD-044).
 */
function isPositivatedThisMonth(customer: ICustomer, now: Date = new Date()): boolean {
  if (!customer.lastPurchaseAt) return false;
  const t = Date.parse(customer.lastPurchaseAt);
  if (!Number.isFinite(t)) return false;
  const last = new Date(t);
  return last.getFullYear() === now.getFullYear() && last.getMonth() === now.getMonth();
}

/**
 * Inline strip of status badges on the profile header:
 * - customer type (B2B/B2C)
 * - ABC class when available
 * - lifecycle status (ativo / dormente / recuperação / perdido)
 * - "Histórico pré-conversão" — passed via slot so the popover trigger lives
 *   in the parent (which owns the lead data fetch).
 */
export function ProfileBadges({ customer, preConversionSlot, className }: IProfileBadgesProps) {
  const positivated = isPositivatedThisMonth(customer);
  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)} role="group">
      <span
        className={cn(
          "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
          TYPE_BADGE_CLASSES[customer.type],
        )}
      >
        {CUSTOMER_STRINGS.contactType[customer.type]}
      </span>

      {customer.abcClass && (
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
            ABC_BADGE_CLASSES[customer.abcClass],
          )}
          title={CUSTOMER_STRINGS.abc[customer.abcClass]}
        >
          {customer.abcClass === "A" && <span aria-hidden>★</span>}
          {customer.abcClass}
        </span>
      )}

      <span
        className={cn(
          "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
          STATUS_BADGE_CLASSES[customer.status],
        )}
      >
        {CUSTOMER_STRINGS.lifecycle[customer.status]}
      </span>

      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
          positivated
            ? "bg-severity-success/15 text-severity-success border border-severity-success/30"
            : "bg-muted text-muted-foreground border border-border",
        )}
        title={
          positivated ? "Cliente positivado: comprou neste mês" : "Cliente não positivado neste mês"
        }
      >
        <span aria-hidden>{positivated ? "●" : "○"}</span>
        {positivated ? "Positivado" : "Não positivado"}
      </span>

      {preConversionSlot}
    </div>
  );
}
