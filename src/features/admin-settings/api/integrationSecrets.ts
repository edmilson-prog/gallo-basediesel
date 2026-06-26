import { getSupabaseClient } from "@/shared/lib/supabase";

/**
 * Client surface for the "Integrações & Chaves" screen. Everything goes
 * through the Owner-only `integration-secrets` Edge Function — values are
 * stored encrypted in Supabase Vault and are NEVER echoed back: the list
 * returns only name, description, last update and a 4-char hint.
 */

export interface IIntegrationSecretStatus {
  name: string;
  description?: string | null;
  updatedAt?: string | null;
  /** Last 4 chars, for recognition only. */
  hint?: string | null;
}

/** Lists the secrets currently stored in the Vault (status only, no values). */
export async function listIntegrationSecrets(): Promise<IIntegrationSecretStatus[]> {
  const { data, error } = await getSupabaseClient().functions.invoke<{
    secrets: IIntegrationSecretStatus[];
  }>("integration-secrets", { body: { action: "list" } });
  if (error)
    throw new Error(await extractFunctionError(error, "Não foi possível carregar as chaves."));
  return data?.secrets ?? [];
}

/** Creates or rotates a secret. The value travels once over HTTPS and never comes back. */
export async function setIntegrationSecret(
  name: string,
  value: string,
  description?: string,
): Promise<void> {
  const { error } = await getSupabaseClient().functions.invoke("integration-secrets", {
    body: { action: "set", name, value, description },
  });
  if (error) throw new Error(await extractFunctionError(error, "Não foi possível salvar a chave."));
}

/** Removes a secret from the Vault (used when a Go server is deleted). */
export async function deleteIntegrationSecret(name: string): Promise<void> {
  const { error } = await getSupabaseClient().functions.invoke("integration-secrets", {
    body: { action: "delete", name },
  });
  if (error)
    throw new Error(await extractFunctionError(error, "Não foi possível remover a chave."));
}

/** Pulls the JSON `error` field out of a non-2xx Edge Function response. */
async function extractFunctionError(error: unknown, fallback: string): Promise<string> {
  const ctx = (error as { context?: Response }).context;
  if (ctx && typeof ctx.json === "function") {
    try {
      const body = (await ctx.json()) as { error?: string };
      if (body?.error) return body.error;
    } catch {
      /* fall through to the generic message */
    }
  }
  return error instanceof Error ? error.message : fallback;
}
