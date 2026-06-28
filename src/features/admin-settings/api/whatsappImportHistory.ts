import { getSupabaseClient } from "@/shared/lib/supabase";

/**
 * Client surface for the `whatsapp-import-history-go` Edge Function (Evolution
 * Go only). Real mode only. Three actions:
 *  - prepare: distill the captured HistorySync chunks into staging → { total, stats }
 *  - land: import one cursored batch → { done, landed, remaining, stats } (loop until done)
 *  - undo: remove exactly what was landed → { removedMessages, removedConversations }
 */

export interface IGoHistoryAggregateStats {
  /** Distinct `@s.whatsapp.net` conversations. */
  individualChats: number;
  /** `@lid` conversations resolved to a phone via the chunk mappings. */
  lidResolved: number;
  /** `@lid` conversations with no mapping (unimportable). */
  lidUnresolved: number;
  groups: number;
  broadcasts: number;
  /** Total messages across the importable items. */
  totalMessages: number;
}

export interface IGoHistoryLandStats {
  customersCreated: number;
  conversationsCreated: number;
  messagesImported: number;
  messagesSkipped: number;
}

export interface IGoHistoryPrepareResult {
  total: number;
  stats: IGoHistoryAggregateStats;
}

export interface IGoHistoryLandResult {
  done: boolean;
  landed: number;
  remaining: number;
  stats: IGoHistoryLandStats;
}

export interface IGoHistoryUndoResult {
  removedMessages: number;
  removedConversations: number;
}

export type GoHistoryErrorCode = "NOT_FOUND" | "VALIDATION_ERROR" | "CONFIG_MISSING" | "UNDO_FAILED";

export class WhatsAppGoHistoryError extends Error {
  readonly code?: GoHistoryErrorCode;
  constructor(message: string, code?: GoHistoryErrorCode) {
    super(message);
    this.name = "WhatsAppGoHistoryError";
    this.code = code;
  }
}

const ERROR_MESSAGES: Partial<Record<GoHistoryErrorCode, string>> & { DEFAULT: string } = {
  NOT_FOUND: "Conta não encontrada nesta loja.",
  VALIDATION_ERROR: "A importação de histórico está disponível apenas para contas Evolution Go.",
  CONFIG_MISSING: "Pareie a conta Evolution Go antes de importar o histórico.",
  UNDO_FAILED: "Não conseguimos desfazer a importação agora. Tente de novo.",
  DEFAULT: "Não conseguimos importar o histórico agora. Verifique a conexão e tente de novo.",
};

export function goHistoryErrorMessage(error: unknown): string {
  if (error instanceof WhatsAppGoHistoryError && error.code) {
    return ERROR_MESSAGES[error.code] ?? ERROR_MESSAGES.DEFAULT;
  }
  return ERROR_MESSAGES.DEFAULT;
}

async function toGoHistoryError(error: unknown): Promise<WhatsAppGoHistoryError> {
  const ctx = (error as { context?: Response }).context;
  if (ctx && typeof ctx.json === "function") {
    try {
      const body = (await ctx.json()) as { error?: string; code?: string };
      if (body?.error) {
        return new WhatsAppGoHistoryError(body.error, body.code as GoHistoryErrorCode);
      }
    } catch {
      /* fall through */
    }
  }
  return new WhatsAppGoHistoryError(
    error instanceof Error ? error.message : "go history import failed",
  );
}

async function invokeGoHistory<T>(
  accountId: string,
  action: "prepare" | "land" | "undo",
): Promise<T> {
  const { data, error } = await getSupabaseClient().functions.invoke<T>(
    "whatsapp-import-history-go",
    { body: { accountId, action } },
  );
  if (error) throw await toGoHistoryError(error);
  if (!data) throw new WhatsAppGoHistoryError("resposta vazia do servidor");
  return data;
}

/** Distill the captured chunks into staging. Returns the importable total. */
export function prepareGoHistory(accountId: string): Promise<IGoHistoryPrepareResult> {
  return invokeGoHistory<IGoHistoryPrepareResult>(accountId, "prepare");
}

/** Land one batch; call repeatedly until `done`. */
export function landGoHistory(accountId: string): Promise<IGoHistoryLandResult> {
  return invokeGoHistory<IGoHistoryLandResult>(accountId, "land");
}

/** Remove everything a prior import landed for this account. */
export function undoGoHistory(accountId: string): Promise<IGoHistoryUndoResult> {
  return invokeGoHistory<IGoHistoryUndoResult>(accountId, "undo");
}
