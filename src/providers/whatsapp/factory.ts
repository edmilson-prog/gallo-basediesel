/**
 * WhatsApp provider factory (PRD-111, RF-010..015).
 *
 * Resolves the engine per ACCOUNT (not a singleton): each row of
 * `whatsapp_accounts` carries its own `provider`, so two stores can run Meta
 * and Evolution side by side. Instances are cached per accountId — providers
 * are stateless by contract (RF-012).
 *
 * Engine resolution:
 * - `VITE_WHATSAPP_PROVIDER=mock` or active data source `mock` (the build
 *   default) → MockWhatsAppProvider for ANY accountId (RF-015);
 * - data source `supabase` → account lookup via the shared client (RLS
 *   applies), then the engine for `provider`. Meta/Evolution engines land in
 *   PRDs 112/113 — until then the factory throws NotImplementedError naming
 *   the PRD, mirroring how the data-provider stubs were staged.
 */

import { getActiveDataSource, NotImplementedError } from "@/providers/data";
import { getSupabaseClient } from "@/shared/lib/supabase";
import type { IWhatsAppProvider } from "./IWhatsAppProvider";
import { MockWhatsAppProvider } from "./mock/MockWhatsAppProvider";

/** Raised when the account does not exist, is not visible (RLS) or is off. */
export class WhatsAppAccountNotFoundError extends Error {
  constructor(accountId: string) {
    super(`Conta WhatsApp não encontrada ou inativa (id: ${accountId})`);
    this.name = "WhatsAppAccountNotFoundError";
  }
}

interface IAccountRow {
  id: string;
  provider: string;
  status: string;
}

const cache = new Map<string, IWhatsAppProvider>();

function isMockEngine(): boolean {
  return import.meta.env.VITE_WHATSAPP_PROVIDER === "mock" || getActiveDataSource() === "mock";
}

/**
 * Returns the provider instance bound to a WhatsApp account. Cached per
 * accountId; call {@link invalidateWhatsAppProviderCache} after changing the
 * account's `provider`/`provider_config` (RF-013).
 */
export async function getWhatsAppProvider(accountId: string): Promise<IWhatsAppProvider> {
  const cached = cache.get(accountId);
  if (cached) return cached;

  if (isMockEngine()) {
    const provider = new MockWhatsAppProvider();
    cache.set(accountId, provider);
    return provider;
  }

  const { data, error } = await getSupabaseClient()
    .from("whatsapp_accounts")
    .select("id, provider, status")
    .eq("id", accountId)
    .maybeSingle<IAccountRow>();

  if (error || !data || data.status === "disconnected") {
    throw new WhatsAppAccountNotFoundError(accountId);
  }

  switch (data.provider) {
    case "meta":
      throw new NotImplementedError(
        "MetaCloudProvider — implementar no PRD-112 (Meta Cloud API Provider)",
      );
    case "evolution":
      throw new NotImplementedError(
        "EvolutionProvider — implementar no PRD-113 (Evolution API Provider)",
      );
    default:
      throw new WhatsAppAccountNotFoundError(accountId);
  }
}

/**
 * Drops cached instances so the next call re-resolves the engine — pass an
 * accountId for a targeted drop, omit to clear everything (RF-013).
 */
export function invalidateWhatsAppProviderCache(accountId?: string): void {
  if (accountId) {
    cache.delete(accountId);
  } else {
    cache.clear();
  }
}
