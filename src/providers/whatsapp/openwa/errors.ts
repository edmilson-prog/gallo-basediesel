/**
 * OpenWA REST error mapping.
 *
 * Confirmed live (2026-07-07): error body is NestJS-shaped
 * `{message, error, statusCode}` — `message` may be a string or a
 * class-validator array (joined here). 409 "Session is not connected. The
 * WhatsApp client is not ready." confirmed for send attempts on a disconnected
 * session; 401/403/404 mappings below are the standard NestJS conventions for
 * those statuses, not individually confirmed against every endpoint.
 */

import { WhatsAppProviderError } from "../errors";

function extractMessage(body: unknown): string {
  const candidate = body as { message?: string | string[]; error?: string } | null;
  const raw = candidate?.message ?? candidate?.error ?? "";
  return Array.isArray(raw) ? raw.join("; ") : String(raw);
}

const DISCONNECTED_PATTERN = /not connected|disconnected|session.*(closed|expired)|logged out/i;
const NOT_FOUND_PATTERN = /session|instance/i;

export function mapOpenWaError(
  httpStatus: number,
  body: unknown,
  endpoint: string,
): WhatsAppProviderError {
  const message = extractMessage(body);
  const details: Record<string, unknown> = { endpoint, openwaMessage: message };

  if (httpStatus === 401 || httpStatus === 403) {
    return new WhatsAppProviderError(
      "UNAUTHORIZED",
      401,
      "API key da OpenWA inválida ou ausente",
      details,
    );
  }
  if (httpStatus === 404 && NOT_FOUND_PATTERN.test(message)) {
    return new WhatsAppProviderError(
      "NOT_FOUND",
      404,
      "Sessão OpenWA não encontrada — verifique o sessionId",
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
    `Erro OpenWA não mapeado (HTTP ${httpStatus}): ${message || "sem corpo de erro"}`,
    details,
  );
}
