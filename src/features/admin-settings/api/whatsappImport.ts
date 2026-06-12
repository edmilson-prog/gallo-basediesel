import { getSupabaseClient } from "@/shared/lib/supabase";

/**
 * Client surface for the `whatsapp-import-history` Edge Function (real-inbox
 * spec 2026-06-11). Real mode only — the page hides the entry point in demo
 * mode (there is no Evolution instance to import from).
 */

export interface IImportStats {
  chatsProcessed: number;
  chatsSkippedGroup: number;
  chatsFailed: number;
  customersCreated: number;
  conversationsCreated: number;
  messagesImported: number;
  messagesSkipped: number;
}

export interface IImportBatchResponse {
  done: boolean;
  nextCursor: number;
  stats: IImportStats;
}

export interface IImportProgress {
  batches: number;
  total: IImportStats;
  done: boolean;
}

export type ImportErrorCode =
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "CONFIG_MISSING"
  | "MISSING_API_KEY"
  | "INTEGRATION_ERROR";

export class WhatsAppImportError extends Error {
  readonly code?: ImportErrorCode;
  constructor(message: string, code?: ImportErrorCode) {
    super(message);
    this.name = "WhatsAppImportError";
    this.code = code;
  }
}

const IMPORT_ERROR_MESSAGES: Partial<Record<ImportErrorCode, string>> & { DEFAULT: string } = {
  NOT_FOUND: "Conta não encontrada nesta loja.",
  VALIDATION_ERROR: "A importação está disponível apenas para contas Evolution.",
  CONFIG_MISSING: "Configure a URL do servidor e a instância antes de importar.",
  MISSING_API_KEY: "Salve a chave de API no cofre antes de importar.",
  INTEGRATION_ERROR:
    "Erro ao comunicar com o servidor Evolution durante a importação. Tente de novo — a importação retoma de onde parou.",
  DEFAULT:
    "Não conseguimos importar agora. Verifique a conexão com o servidor Evolution e tente de novo — a importação retoma de onde parou.",
};

export function importErrorMessage(error: unknown): string {
  if (error instanceof WhatsAppImportError && error.code) {
    return IMPORT_ERROR_MESSAGES[error.code] ?? IMPORT_ERROR_MESSAGES.DEFAULT;
  }
  return IMPORT_ERROR_MESSAGES.DEFAULT;
}

export function emptyImportStats(): IImportStats {
  return {
    chatsProcessed: 0,
    chatsSkippedGroup: 0,
    chatsFailed: 0,
    customersCreated: 0,
    conversationsCreated: 0,
    messagesImported: 0,
    messagesSkipped: 0,
  };
}

function accumulate(total: IImportStats, batch: IImportStats): void {
  for (const key of Object.keys(total) as Array<keyof IImportStats>) {
    total[key] += batch[key] ?? 0;
  }
}

async function toImportError(error: unknown): Promise<WhatsAppImportError> {
  const ctx = (error as { context?: Response }).context;
  if (ctx && typeof ctx.json === "function") {
    try {
      const body = (await ctx.json()) as { error?: string; code?: string };
      if (body?.error) return new WhatsAppImportError(body.error, body.code as ImportErrorCode);
    } catch {
      /* fall through */
    }
  }
  return new WhatsAppImportError(error instanceof Error ? error.message : "import failed");
}

async function invokeImportBatch(accountId: string, cursor: number): Promise<IImportBatchResponse> {
  const { data, error } = await getSupabaseClient().functions.invoke<IImportBatchResponse>(
    "whatsapp-import-history",
    { body: { accountId, cursor } },
  );
  if (error) throw await toImportError(error);
  // A 2xx with no/invalid body leaves data null — guard so the loop never
  // dereferences undefined stats (surfaces as the pt-BR DEFAULT message).
  if (!data) throw new WhatsAppImportError("resposta vazia do servidor");
  return data;
}

/**
 * Drives the batched import until done, reporting progress per batch.
 * Throwing mid-run is safe: re-running resumes (server-side idempotency).
 * A hard cap on iterations guards against a server that never reports `done`.
 */
export async function runHistoryImport(
  accountId: string,
  onProgress: (progress: IImportProgress) => void,
): Promise<IImportStats> {
  const total = emptyImportStats();
  let cursor = 0;
  let batches = 0;
  // Safety cap: 10k chats / 10 per batch = 1000; double it for headroom.
  const MAX_BATCHES = 2000;
  for (;;) {
    const response = await invokeImportBatch(accountId, cursor);
    batches++;
    accumulate(total, response.stats);
    onProgress({ batches, total: { ...total }, done: response.done });
    if (response.done) return total;
    // Guard against a non-advancing cursor (server bug) — avoid an infinite loop.
    if (response.nextCursor <= cursor || batches >= MAX_BATCHES) return total;
    cursor = response.nextCursor;
  }
}
