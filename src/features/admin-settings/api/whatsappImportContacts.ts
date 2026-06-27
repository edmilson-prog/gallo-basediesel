import { getSupabaseClient } from "@/shared/lib/supabase";

/**
 * Client surface for the `whatsapp-import-contacts` Edge Function (Evolution Go
 * only). Real mode only — the page hides the entry point in demo mode. Single
 * shot: the contact list is bounded, so one invocation imports all of it.
 */

export interface IContactsImportStats {
  /** Individual contacts the instance returned. */
  contactsFound: number;
  /** New `pending_review` customers created. */
  customersCreated: number;
  /** Contacts that already mapped to a customer (by phone). */
  customersExisting: number;
  /** Contacts that failed to land (counted, never aborts the run). */
  failed: number;
}

export type ContactsImportErrorCode =
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "CONFIG_MISSING"
  | "MISSING_API_KEY"
  | "INTEGRATION_ERROR";

export class WhatsAppContactsImportError extends Error {
  readonly code?: ContactsImportErrorCode;
  constructor(message: string, code?: ContactsImportErrorCode) {
    super(message);
    this.name = "WhatsAppContactsImportError";
    this.code = code;
  }
}

const ERROR_MESSAGES: Partial<Record<ContactsImportErrorCode, string>> & { DEFAULT: string } = {
  NOT_FOUND: "Conta não encontrada nesta loja.",
  VALIDATION_ERROR: "A importação de contatos está disponível apenas para contas Evolution Go.",
  CONFIG_MISSING: "Pareie a conta Evolution Go antes de importar os contatos.",
  MISSING_API_KEY: "Token da instância não cadastrado no cofre.",
  INTEGRATION_ERROR: "Erro ao comunicar com o servidor Evolution Go durante a importação. Tente de novo.",
  DEFAULT: "Não conseguimos importar os contatos agora. Verifique a conexão e tente de novo.",
};

export function contactsImportErrorMessage(error: unknown): string {
  if (error instanceof WhatsAppContactsImportError && error.code) {
    return ERROR_MESSAGES[error.code] ?? ERROR_MESSAGES.DEFAULT;
  }
  return ERROR_MESSAGES.DEFAULT;
}

export function emptyContactsImportStats(): IContactsImportStats {
  return { contactsFound: 0, customersCreated: 0, customersExisting: 0, failed: 0 };
}

async function toContactsImportError(error: unknown): Promise<WhatsAppContactsImportError> {
  const ctx = (error as { context?: Response }).context;
  if (ctx && typeof ctx.json === "function") {
    try {
      const body = (await ctx.json()) as { error?: string; code?: string };
      if (body?.error) {
        return new WhatsAppContactsImportError(body.error, body.code as ContactsImportErrorCode);
      }
    } catch {
      /* fall through */
    }
  }
  return new WhatsAppContactsImportError(
    error instanceof Error ? error.message : "contacts import failed",
  );
}

/** Imports the whole contact list in one shot; returns the run stats. */
export async function runContactsImport(accountId: string): Promise<IContactsImportStats> {
  const { data, error } = await getSupabaseClient().functions.invoke<{ stats: IContactsImportStats }>(
    "whatsapp-import-contacts",
    { body: { accountId } },
  );
  if (error) throw await toContactsImportError(error);
  if (!data?.stats) throw new WhatsAppContactsImportError("resposta vazia do servidor");
  return data.stats;
}
