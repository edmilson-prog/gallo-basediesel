/** WAHA error mapping. The server answers `{ message }` or `{ error }` with HTTP-status semantics. */

import { WhatsAppProviderError } from "../errors";

function extractMessage(body: unknown): string {
  const c = body as { message?: string | string[]; error?: string } | null;
  const raw = c?.message ?? c?.error ?? "";
  return Array.isArray(raw) ? raw.join("; ") : String(raw);
}

export function mapWahaError(
  httpStatus: number,
  body: unknown,
  endpoint: string,
): WhatsAppProviderError {
  const message = extractMessage(body);
  const details: Record<string, unknown> = { endpoint, wahaMessage: message };

  if (httpStatus === 401 || httpStatus === 403) {
    return new WhatsAppProviderError(
      "UNAUTHORIZED",
      401,
      "Chave da API WAHA inválida ou ausente",
      details,
    );
  }
  if (httpStatus === 429) {
    return new WhatsAppProviderError(
      "RATE_LIMITED",
      429,
      "Limite de requisições do WAHA atingido — tente novamente em instantes",
      details,
    );
  }
  if (httpStatus === 404) {
    return new WhatsAppProviderError("NOT_FOUND", 404, "Sessão WAHA não encontrada", details);
  }
  return new WhatsAppProviderError(
    "INTEGRATION_ERROR",
    502,
    `Erro WAHA não mapeado (HTTP ${httpStatus}): ${message || "sem corpo de erro"}`,
    details,
  );
}
