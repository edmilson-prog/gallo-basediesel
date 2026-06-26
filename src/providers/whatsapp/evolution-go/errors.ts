/**
 * Evolution Go error mapping. Go answers `{ message }` / `{ error }` with
 * HTTP-status semantics. The disconnected-session case feeds PRD-120 failover.
 */

import { WhatsAppProviderError } from "../errors";

function extractMessage(body: unknown): string {
  const c = body as { message?: string | string[]; error?: string } | null;
  const raw = c?.message ?? c?.error ?? "";
  return Array.isArray(raw) ? raw.join("; ") : String(raw);
}

const DISCONNECTED_PATTERN = /not connected|not logged in|connection closed|session|disconnected/i;
/** Go answers /instance/create for an existing instance with 403 "already in use". */
const ALREADY_EXISTS_PATTERN = /already in use|already exists/i;

export function mapEvolutionGoError(
  httpStatus: number,
  body: unknown,
  endpoint: string,
): WhatsAppProviderError {
  const message = extractMessage(body);
  const details: Record<string, unknown> = { endpoint, goMessage: message };

  // A name conflict (403 "already in use" on /instance/create) is NOT an auth
  // failure — classifying it as UNAUTHORIZED both masks the cause ("chave
  // recusada") and erases the original text an idempotent-create guard relies
  // on (parity with mapEvolutionError, PR #147). Keep the message intact.
  if (ALREADY_EXISTS_PATTERN.test(message)) {
    return new WhatsAppProviderError("INTEGRATION_ERROR", httpStatus, message, details);
  }
  if (httpStatus === 401 || httpStatus === 403) {
    return new WhatsAppProviderError(
      "UNAUTHORIZED",
      401,
      "Chave de API da Evolution Go inválida ou ausente",
      details,
    );
  }
  if (httpStatus === 429) {
    return new WhatsAppProviderError(
      "RATE_LIMITED",
      429,
      "Limite de requisições da Evolution Go atingido — tente novamente em instantes",
      details,
    );
  }
  if (httpStatus === 404) {
    return new WhatsAppProviderError(
      "NOT_FOUND",
      404,
      "Instância Evolution Go não encontrada — verifique o instanceId",
      details,
    );
  }
  if (DISCONNECTED_PATTERN.test(message)) {
    return new WhatsAppProviderError(
      "PROVIDER_DISCONNECTED",
      503,
      "WhatsApp desconectado, reconectar via QR Code",
      details,
    );
  }
  return new WhatsAppProviderError(
    "INTEGRATION_ERROR",
    502,
    `Erro Evolution Go não mapeado (HTTP ${httpStatus}): ${message || "sem corpo de erro"}`,
    details,
  );
}
