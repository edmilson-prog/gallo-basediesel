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
 * Inline strip of status badges on the profile header:
 * - customer type (B2B/B2C)
 * - ABC class when available
 * - lifecycle status (ativo / dormente / recuperação / perdido)
 * - "Histórico pré-conversão" — passed via slot so the popover trigger lives
 *   in the parent (which owns the lead data fetch).
 */
export function ProfileBadges({ customer, preConversionSlot, className }: IProfileBadgesProps) {
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

      {preConversionSlot}
    </div>
  );
}
