import { getSupabaseClient } from "@/shared/lib/supabase";

/**
 * Client surface for the Owner-only `waha-connect` Edge Function. Shared by
 * the "WAHA" tab (session lifecycle) and the "Servidor WAHA" section
 * (connectivity check) — both isolated from the Meta/Evolution/Evolution Go
 * pipeline, mirroring the edge's own isolation.
 */

/** Stable machine code the edge returns for known error branches (e.g. `HAS_LINKED_DATA`). */
export class WahaConnectError extends Error {
  readonly code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.name = "WahaConnectError";
    this.code = code;
  }
}

async function toWahaError(error: unknown, fallback: string): Promise<WahaConnectError> {
  const ctx = (error as { context?: Response }).context;
  if (ctx && typeof ctx.json === "function") {
    try {
      const body = (await ctx.json()) as { error?: string; code?: string };
      if (body?.error) return new WahaConnectError(body.error, body.code);
    } catch {
      /* fall through */
    }
  }
  return new WahaConnectError(error instanceof Error ? error.message : fallback);
}

export async function invokeWaha<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await getSupabaseClient().functions.invoke<T>("waha-connect", { body });
  if (error) throw await toWahaError(error, "Falha ao falar com o servidor WAHA.");
  return data as T;
}

/** Ad-hoc validation send — never persisted as a conversation message. */
export async function sendWahaTestMessage(accountId: string, toDigits: string): Promise<void> {
  await invokeWaha<{ ok: boolean }>({ accountId, action: "test-message", to: toDigits });
}
