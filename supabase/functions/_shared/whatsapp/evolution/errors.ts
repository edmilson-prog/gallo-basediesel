// AUTO-GENERATED MIRROR — DO NOT EDIT.
// Source: src/providers/whatsapp/evolution/errors.ts (sync: bun run scripts/sync-whatsapp-shared.ts)

/**
 * Evolution API error mapping (PRD-113 RF-080).
 *
 * Evolution errors are HTTP-status driven with free-text messages. The one
 * with domain semantics is the disconnected instance (WhatsApp session lost —
 * needs QR Code reconnection), which PRD-120's failover reacts to.
 */

import { WhatsAppProviderError } from "../errors.ts";

function extractMessage(body: unknown): string {
  const candidate = body as {
    message?: string | string[];
    error?: string;
    response?: { message?: string | string[] };
  } | null;
  const raw = candidate?.response?.message ?? candidate?.message ?? candidate?.error ?? "";
  return Array.isArray(raw) ? raw.join("; ") : String(raw);
}

const DISCONNECTED_PATTERN = /not connected|connection closed|session|disconnected/i;
/** Evolution reports a name conflict on /instance/create as 403 "already in use". */
const ALREADY_EXISTS_PATTERN = /already in use|already exists/i;

export function mapEvolutionError(
  httpStatus: number,
  body: unknown,
  endpoint: string,
): WhatsAppProviderError {
  const message = extractMessage(body);
  const details: Record<string, unknown> = { endpoint, evolutionMessage: message };

  // A name conflict (Evolution answers /instance/create with 403 "already in
  // use") is NOT an auth failure — classifying it as UNAUTHORIZED both masks
  // the cause from the user ("chave de API recusada") and erases the original
  // text the idempotent createInstance guard relies on. Keep the message intact.
  if (ALREADY_EXISTS_PATTERN.test(message)) {
    return new WhatsAppProviderError("INTEGRATION_ERROR", httpStatus, message, details);
  }
  if (httpStatus === 401 || httpStatus === 403) {
    return new WhatsAppProviderError(
      "UNAUTHORIZED",
      401,
      "API key da Evolution inválida ou ausente",
      details,
    );
  }
  if (httpStatus === 404 && /instance/i.test(message)) {
    return new WhatsAppProviderError(
      "NOT_FOUND",
      404,
      "Instância Evolution não encontrada — verifique instanceName",
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
    `Erro Evolution não mapeado (HTTP ${httpStatus}): ${message || "sem corpo de erro"}`,
    details,
  );
}
