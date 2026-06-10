// AUTO-GENERATED MIRROR — DO NOT EDIT.
// Source: src/providers/whatsapp/build.ts (sync: bun run scripts/sync-whatsapp-shared.ts)

/**
 * Pure engine builder (PRDs 112/113).
 *
 * Maps a `whatsapp_accounts` row (engine + non-secret provider_config +
 * credentials_ref) plus injected deps to a concrete IWhatsAppProvider. This
 * is the piece the server-side consumers (webhook PRD-114, send pipeline
 * PRD-115) call after loading the account — it has NO environment access of
 * its own, so it runs identically in browser tests and Edge Functions.
 *
 * Runtime-agnostic file: relative imports only, Web APIs only.
 */

import { WhatsAppProviderError } from "./errors.ts";
import type { IWhatsAppProvider } from "./IWhatsAppProvider.ts";
import type { IEngineDeps, WhatsAppProviderEngine } from "./types.ts";
import { EvolutionProvider } from "./evolution/EvolutionProvider.ts";
import { MetaCloudProvider } from "./meta/MetaCloudProvider.ts";
import { MockWhatsAppProvider } from "./mock/MockWhatsAppProvider.ts";

export interface IBuildEngineInput {
  engine: WhatsAppProviderEngine;
  /** `whatsapp_accounts.id`. */
  accountId: string;
  /** `whatsapp_accounts.provider_config` (non-secret jsonb — PRD-111). */
  providerConfig: Record<string, unknown> | null;
  /** `whatsapp_accounts.credentials_ref` — Edge Function secret prefix. */
  credentialsRef: string | null;
  deps: IEngineDeps;
}

function requireString(
  config: Record<string, unknown> | null,
  key: string,
  engine: string,
): string {
  const value = config?.[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new WhatsAppProviderError(
      "VALIDATION_ERROR",
      422,
      `provider_config da conta ${engine} sem '${key}' — configure antes de ativar (PRD-111 RF-032)`,
    );
  }
  return value;
}

export function buildWhatsAppEngine(input: IBuildEngineInput): IWhatsAppProvider {
  if (input.engine === "mock") {
    return new MockWhatsAppProvider();
  }
  const credentialsRef = input.credentialsRef;
  if (!credentialsRef) {
    throw new WhatsAppProviderError(
      "VALIDATION_ERROR",
      422,
      `Conta ${input.engine} sem credentials_ref — nomeie o prefixo dos secrets das Edge Functions`,
    );
  }
  if (input.engine === "meta") {
    return new MetaCloudProvider(
      {
        accountId: input.accountId,
        phoneNumberId: requireString(input.providerConfig, "phoneNumberId", "meta"),
        businessAccountId: requireString(input.providerConfig, "businessAccountId", "meta"),
        credentialsRef,
      },
      input.deps,
    );
  }
  if (input.engine === "evolution") {
    return new EvolutionProvider(
      {
        accountId: input.accountId,
        baseUrl: requireString(input.providerConfig, "baseUrl", "evolution"),
        instanceName: requireString(input.providerConfig, "instanceName", "evolution"),
        credentialsRef,
      },
      input.deps,
    );
  }
  throw new WhatsAppProviderError(
    "VALIDATION_ERROR",
    422,
    `Engine WhatsApp desconhecido: ${String(input.engine)}`,
  );
}
