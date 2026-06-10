/**
 * DINTEC provider factory (PRD-121, RF-010..013).
 *
 * Resolves the import provider per STORE — future store-level configuration
 * (`stores.dintec_provider_config`) may point different stores at different
 * sources. Instances are cached per storeId; providers are stateless by
 * contract.
 *
 * Engine resolution:
 * - `VITE_DINTEC_PROVIDER=mock` or active data source `mock` (the build
 *   default) → MockDintecProvider for ANY storeId (RF-011);
 * - data source `supabase` → `CsvDintecProvider`, the MVP implementation.
 *   It lands in PRD-122 — until then the factory throws DintecProviderError
 *   naming the PRD, mirroring how the WhatsApp engines were staged.
 */

import { getActiveDataSource } from "@/providers/data";
import { DintecProviderError } from "./errors";
import type { IDintecImportProvider } from "./IDintecImportProvider";
import { MockDintecProvider } from "./mock/MockDintecProvider";

const cache = new Map<string, IDintecImportProvider>();

function isMockProvider(): boolean {
  return import.meta.env.VITE_DINTEC_PROVIDER === "mock" || getActiveDataSource() === "mock";
}

/**
 * Returns the DINTEC import provider bound to a store. Cached per storeId;
 * call {@link invalidateDintecProviderCache} after changing provider config.
 */
export async function getDintecProvider(storeId: string): Promise<IDintecImportProvider> {
  const cached = cache.get(storeId);
  if (cached) return cached;

  if (isMockProvider()) {
    const provider = new MockDintecProvider();
    cache.set(storeId, provider);
    return provider;
  }

  // MVP default is the CSV provider (RF-012) — implemented by PRD-122.
  throw new DintecProviderError(
    "NOT_IMPLEMENTED",
    "CsvDintecProvider chega com o PRD-122. Use VITE_DINTEC_PROVIDER=mock por enquanto.",
  );
}

/**
 * Drops cached instances so the next call re-resolves the provider — pass a
 * storeId for a targeted drop, omit to clear everything.
 */
export function invalidateDintecProviderCache(storeId?: string): void {
  if (storeId) {
    cache.delete(storeId);
  } else {
    cache.clear();
  }
}
