import type { ICustomer } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { formatPercent } from "@/shared/utils/format";
import { CUSTOMER_STRINGS } from "../i18n/pt-BR";
import {
  ABC_BADGE_CLASSES,
  STATUS_BADGE_CLASSES,
  TYPE_BADGE_CLASSES,
} from "../utils/customerDisplay";

const DETAIL_COPY = CUSTOMER_STRINGS.detail.badges;

export interface IProfileBadgesProps {
  customer: ICustomer;
  /** Slot for the optional "Histórico pré-conversão" badge (renders a popover). */
  preConversionSlot?: React.ReactNode;
  /** Slot for the optional NPS badge — absent when the customer has no recent answer. */
  npsSlot?: React.ReactNode;
  /**
   * `detail` is the CRM kit's chip treatment used by the detail page: heavier
   * weight, wider tracking, the ABC class spelled out ("Curva B · 2,4%") and an
   * icon on the positivation chip. Opt-in — `default` keeps the compact chips
   * the Atendimento fiche and the list preview were built around.
   */
  variant?: "default" | "detail";
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
export function ProfileBadges({
  customer,
  preConversionSlot,
  npsSlot,
  variant = "default",
  className,
}: IProfileBadgesProps) {
  const positivated = isPositivatedThisMonth(customer);
  const isDetail = variant === "detail";
  // One shared chip shape so the four badges never drift apart. The kit's chips
  // are heavier and wider-tracked than the compact ones used in the fiche.
  const chip = isDetail
    ? "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-[0.07em]"
    : "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide";

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)} role="group">
      <span className={cn(chip, TYPE_BADGE_CLASSES[customer.type])}>
        {CUSTOMER_STRINGS.contactType[customer.type]}
      </span>

      {customer.abcClass && (
        <span
          className={cn(chip, !isDetail && "font-semibold", ABC_BADGE_CLASSES[customer.abcClass])}
          title={CUSTOMER_STRINGS.abc[customer.abcClass]}
        >
          {customer.abcClass === "A" && <span aria-hidden>★</span>}
          {isDetail
            ? DETAIL_COPY.abc(
                customer.abcClass,
                customer.abcShare != null ? formatPercent(customer.abcShare) : null,
              )
            : customer.abcClass}
        </span>
      )}

      <span className={cn(chip, STATUS_BADGE_CLASSES[customer.status])}>
        {CUSTOMER_STRINGS.lifecycle[customer.status]}
      </span>

      <span
        className={cn(
          chip,
          positivated
            ? "bg-severity-success/15 text-severity-success border border-severity-success/30"
            : "bg-muted text-muted-foreground border border-border",
        )}
        title={
          positivated ? "Cliente positivado: comprou neste mês" : "Cliente não positivado neste mês"
        }
      >
        {isDetail ? (
          <Icon
            icon={positivated ? "mdi:check-circle-outline" : "mdi:circle-outline"}
            size={11}
            aria-hidden
          />
        ) : (
          <span aria-hidden>{positivated ? "●" : "○"}</span>
        )}
        {positivated ? DETAIL_COPY.positivated : DETAIL_COPY.notPositivated}
      </span>

      {preConversionSlot}
      {npsSlot}
    </div>
  );
}
