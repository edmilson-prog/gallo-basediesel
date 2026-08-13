import { useCallback, useEffect, useState } from "react";

export type CustomerDetailLayout = "faixas" | "painel";

const STORAGE_KEY = "gallo-customer-detail-layout";

/** `A · Faixas` is the direction chosen in the refactor; `B · Painel` is the alternative. */
const DEFAULT_LAYOUT: CustomerDetailLayout = "faixas";

function read(): CustomerDetailLayout {
  if (typeof window === "undefined") return DEFAULT_LAYOUT;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "painel" ? "painel" : DEFAULT_LAYOUT;
  } catch {
    // Storage blocked (private mode / denied permission) — the layout is a
    // preference, not state worth failing the page over.
    return DEFAULT_LAYOUT;
  }
}

/**
 * Which header direction of the CRM kit the detail page renders.
 *
 * Persisted per browser so whoever is comparing A against B keeps their choice
 * across customers and reloads. It is a preference, not a permission: the gate
 * on who gets to see the switch lives in `CustomerLayoutToggle`.
 */
export function useCustomerDetailLayout(): {
  layout: CustomerDetailLayout;
  setLayout: (next: CustomerDetailLayout) => void;
  toggle: () => void;
} {
  const [layout, setLayoutState] = useState<CustomerDetailLayout>(read);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, layout);
    } catch {
      // Same reasoning as above — losing the preference beats breaking the page.
    }
  }, [layout]);

  const setLayout = useCallback((next: CustomerDetailLayout) => setLayoutState(next), []);
  const toggle = useCallback(
    () => setLayoutState((prev) => (prev === "faixas" ? "painel" : "faixas")),
    [],
  );

  return { layout, setLayout, toggle };
}
