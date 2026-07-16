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

import { getActiveDataSource } from "@/providers/data";
import { getSupabaseClient } from "@/shared/lib/supabase";
import { WhatsAppProviderError } from "./errors";
import type { IWhatsAppProvider } from "./IWhatsAppProvider";
import type { IProviderCapabilities, WhatsAppProviderEngine } from "./types";
import { EVOLUTION_GO_CAPABILITIES } from "./evolution-go/constants";
import { EVOLUTION_CAPABILITIES } from "./evolution/constants";
import { META_CAPABILITIES } from "./meta/constants";
import { MockWhatsAppProvider } from "./mock/MockWhatsAppProvider";
import { OPENWA_CAPABILITIES } from "./openwa/constants";

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
    case "evolution":
    case "evolution-go":
    case "openwa":
      // The real engines (PRDs 112/113) exist but require Edge Function
      // secrets — they run SERVER-SIDE only (webhook PRD-114, send PRD-115,
      // via `buildWhatsAppEngine`). In the app, use the mock engine or the
      // static capability matrix below for read-only surfaces.
      throw new WhatsAppProviderError(
        "NOT_SUPPORTED",
        501,
        `Engine '${data.provider}' roda server-side (Edge Functions — PRDs 114/115). No app, use VITE_WHATSAPP_PROVIDER=mock ou getEngineCapabilities('${data.provider}').`,
      );
    default:
      throw new WhatsAppAccountNotFoundError(accountId);
  }
}

/**
 * Static capability matrix per engine (PRD-111 RF-004) — safe for read-only
 * UI surfaces without instantiating an engine (no secrets involved).
 */
export function getEngineCapabilities(engine: WhatsAppProviderEngine): IProviderCapabilities {
  switch (engine) {
    case "meta":
      return META_CAPABILITIES;
    case "evolution":
      return EVOLUTION_CAPABILITIES;
    case "evolution-go":
      return EVOLUTION_GO_CAPABILITIES;
    case "openwa":
      return OPENWA_CAPABILITIES;
    case "mock":
      return new MockWhatsAppProvider().capabilities;
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
