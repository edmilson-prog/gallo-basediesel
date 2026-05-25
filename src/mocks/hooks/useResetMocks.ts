import { useCallback, useState } from "react";
import { DEFAULT_SEED } from "../config";
import { resetMockStore } from "../store/mockStore";

export interface IResetResult {
  seed: number;
  generatedAt: string;
  totalItems: number;
}

/**
 * Administrative hook to repopulate the in-memory mock dataset with a fresh
 * seed. Exposed through the `/design-system` page (PRD-001) — dev-only — and
 * never reachable from the production app shell.
 *
 * Returns the last result alongside a `loading` flag so the UI can render
 * progress feedback during the (very fast) re-bootstrap.
 */
export function useResetMocks(): {
  reset: (seed?: number) => IResetResult;
  loading: boolean;
  lastResult: IResetResult | null;
} {
  const [loading, setLoading] = useState(false);
  const [lastResult, setLastResult] = useState<IResetResult | null>(null);

  const reset = useCallback((seed?: number): IResetResult => {
    setLoading(true);
    try {
      const effectiveSeed = seed ?? Date.now() % 100_000;
      const dataset = resetMockStore(effectiveSeed);
      const totalItems =
        dataset.customers.length +
        dataset.vehicles.length +
        dataset.leads.length +
        dataset.conversations.length +
        dataset.messages.length +
        dataset.parts.length +
        dataset.quotes.length +
        dataset.orders.length +
        dataset.commissions.length +
        dataset.goals.length +
        dataset.recommendations.length +
        dataset.transfers.length +
        dataset.segments.length +
        dataset.audits.length +
        dataset.badges.length +
        dataset.abcClassifications.length +
        dataset.customerNotes.length +
        dataset.vehicleServiceEntries.length +
        dataset.sellers.length +
        dataset.stores.length +
        dataset.roles.length +
        dataset.whatsappAccounts.length +
        dataset.rankings.length +
        dataset.positivations.length;
      const result: IResetResult = {
        seed: effectiveSeed,
        generatedAt: dataset.generatedAt,
        totalItems,
      };
      setLastResult(result);
      console.info(`[mock-reset] seed=${effectiveSeed} items=${totalItems}`);
      return result;
    } finally {
      setLoading(false);
    }
  }, []);

  return { reset, loading, lastResult };
}

export { DEFAULT_SEED };
