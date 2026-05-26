import type {
  ICustomer,
  ICustomerAddress,
  ISdrShippingPlaceholderSettings,
  ISdrShippingResult,
} from "@/shared/types";

/**
 * Placeholder shipping calculator used by the SDR-quote engine until PRD-033
 * ships. Pure — the caller is responsible for plugging the resolved value
 * into the quote totals.
 *
 * Decision table (PRD-022 RF-008):
 *  - missing address → `to_negotiate`
 *  - same city → `sameCityValue`
 *  - same state → `sameStateValue`
 *  - other state with `otherStatesAction === 'fixed_value'` → `otherStatesValue`
 *  - other state with `otherStatesAction === 'to_negotiate'` → `to_negotiate`
 */
export function calculateShippingPlaceholder(
  address: ICustomerAddress | undefined,
  settings: ISdrShippingPlaceholderSettings,
): ISdrShippingResult {
  if (!address || !address.city || !address.state) {
    return { isToNegotiate: true, reason: "missing_address" };
  }
  const normalize = (input: string): string => input.trim().toLowerCase();
  const stateUf = address.state.trim().toUpperCase();

  if (normalize(address.city) === normalize(settings.homeCity)) {
    return { value: settings.sameCityValue, isToNegotiate: false, reason: "same_city" };
  }
  if (stateUf === settings.homeState.toUpperCase()) {
    return { value: settings.sameStateValue, isToNegotiate: false, reason: "same_state" };
  }

  if (settings.otherStatesAction === "fixed_value" && settings.otherStatesValue != null) {
    return {
      value: settings.otherStatesValue,
      isToNegotiate: false,
      reason: "other_state_fixed",
    };
  }
  return { isToNegotiate: true, reason: "other_state_negotiate" };
}

/** Convenience overload — accepts an `ICustomer` and extracts the address. */
export function calculateShippingPlaceholderFor(
  customer: ICustomer | undefined,
  settings: ISdrShippingPlaceholderSettings,
): ISdrShippingResult {
  return calculateShippingPlaceholder(customer?.address, settings);
}
