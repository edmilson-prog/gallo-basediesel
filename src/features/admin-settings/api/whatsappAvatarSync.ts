import { getSupabaseClient } from "@/shared/lib/supabase";

/**
 * Client surface for the `whatsapp-avatar-sync` Edge Function. Real mode only —
 * the page hides the entry point in demo mode (there is no Evolution instance to
 * fetch contact photos from). The backend drains pending contacts
 * (customers.avatar_synced_at IS NULL) in batches; this loops until `done`.
 */

export interface IAvatarSyncStats {
  /** Contacts looked at in this run. */
  processed: number;
  /** Contacts whose WhatsApp photo was fetched and stored. */
  withPhoto: number;
  /** Contacts with no public photo / private / invalid number (attempt stamped). */
  withoutPhoto: number;
  /** Contacts that errored mid-sync (stamped so a re-run drains forward). */
  failed: number;
}

export interface IAvatarSyncBatchResponse extends IAvatarSyncStats {
  done: boolean;
}

export interface IAvatarSyncProgress {
  batches: number;
  total: IAvatarSyncStats;
  done: boolean;
}

export type AvatarSyncErrorCode =
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "CONFIG_MISSING"
  | "MISSING_API_KEY"
  | "INTEGRATION_ERROR";

export class WhatsAppAvatarSyncError extends Error {
  readonly code?: AvatarSyncErrorCode;
  constructor(message: string, code?: AvatarSyncErrorCode) {
    super(message);
    this.name = "WhatsAppAvatarSyncError";
    this.code = code;
  }
}

const SYNC_ERROR_MESSAGES: Partial<Record<AvatarSyncErrorCode, string>> & { DEFAULT: string } = {
  NOT_FOUND: "Conta não encontrada nesta loja.",
  VALIDATION_ERROR: "A sincronização de fotos está disponível apenas para contas Evolution.",
  CONFIG_MISSING: "Configure a URL do servidor e a instância antes de sincronizar.",
  MISSING_API_KEY: "Salve a chave de API no cofre antes de sincronizar.",
  INTEGRATION_ERROR:
    "Erro ao comunicar com o servidor Evolution durante a sincronização. Tente de novo — ela retoma de onde parou.",
  DEFAULT:
    "Não conseguimos sincronizar as fotos agora. Verifique a conexão com o servidor Evolution e tente de novo — ela retoma de onde parou.",
};

export function avatarSyncErrorMessage(error: unknown): string {
  if (error instanceof WhatsAppAvatarSyncError && error.code) {
    return SYNC_ERROR_MESSAGES[error.code] ?? SYNC_ERROR_MESSAGES.DEFAULT;
  }
  return SYNC_ERROR_MESSAGES.DEFAULT;
}

export function emptyAvatarSyncStats(): IAvatarSyncStats {
  return { processed: 0, withPhoto: 0, withoutPhoto: 0, failed: 0 };
}

function accumulate(total: IAvatarSyncStats, batch: IAvatarSyncBatchResponse): void {
  total.processed += batch.processed ?? 0;
  total.withPhoto += batch.withPhoto ?? 0;
  total.withoutPhoto += batch.withoutPhoto ?? 0;
  total.failed += batch.failed ?? 0;
}

async function toSyncError(error: unknown): Promise<WhatsAppAvatarSyncError> {
  const ctx = (error as { context?: Response }).context;
  if (ctx && typeof ctx.json === "function") {
    try {
      const body = (await ctx.json()) as { error?: string; code?: string };
      if (body?.error) {
        return new WhatsAppAvatarSyncError(body.error, body.code as AvatarSyncErrorCode);
      }
    } catch {
      /* fall through */
    }
  }
  return new WhatsAppAvatarSyncError(error instanceof Error ? error.message : "avatar sync failed");
}

async function invokeBatch(accountId: string): Promise<IAvatarSyncBatchResponse> {
  const { data, error } = await getSupabaseClient().functions.invoke<IAvatarSyncBatchResponse>(
    "whatsapp-avatar-sync",
    { body: { accountId } },
  );
  if (error) throw await toSyncError(error);
  if (!data) throw new WhatsAppAvatarSyncError("resposta vazia do servidor");
  return data;
}

export type ContactAvatarSyncOutcome = "with-photo" | "without-photo" | "failed";

/**
 * Forced re-sync of ONE contact's photo (conversation kebab action). Unlike the
 * batch drain, this re-attempts even contacts already stamped — it's an explicit
 * user retry (e.g. the automatic fetch ran too early and got null).
 */
export async function runContactAvatarSync(
  accountId: string,
  customerId: string,
): Promise<ContactAvatarSyncOutcome> {
  const { data, error } = await getSupabaseClient().functions.invoke<IAvatarSyncBatchResponse>(
    "whatsapp-avatar-sync",
    { body: { accountId, customerId } },
  );
  if (error) throw await toSyncError(error);
  if (!data) throw new WhatsAppAvatarSyncError("resposta vazia do servidor");
  if (data.withPhoto > 0) return "with-photo";
  if (data.failed > 0) return "failed";
  return "without-photo";
}

/**
 * Drives the batched avatar sync until done, reporting progress per batch.
 * Throwing mid-run is safe: re-running resumes (only pending contacts are
 * touched). A hard cap guards against a backend that never reports `done`.
 */
export async function runAvatarSync(
  accountId: string,
  onProgress: (progress: IAvatarSyncProgress) => void,
): Promise<IAvatarSyncStats> {
  const total = emptyAvatarSyncStats();
  let batches = 0;
  // Safety cap: 50 per batch over tens of thousands of contacts is plenty.
  const MAX_BATCHES = 2000;
  for (;;) {
    const response = await invokeBatch(accountId);
    batches += 1;
    accumulate(total, response);
    onProgress({ batches, total: { ...total }, done: response.done });
    if (response.done || batches >= MAX_BATCHES) return total;
  }
}
