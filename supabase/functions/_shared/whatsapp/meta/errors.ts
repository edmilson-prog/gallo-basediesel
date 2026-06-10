// AUTO-GENERATED MIRROR — DO NOT EDIT.
// Source: src/providers/whatsapp/meta/errors.ts (sync: bun run scripts/sync-whatsapp-shared.ts)

/**
 * Meta Graph API error mapping (PRD-112 RF-110).
 *
 * Meta returns `{ error: { message, type, code, error_subcode, fbtrace_id } }`.
 * Codes carry domain semantics the callers (PRDs 115–117, 120) react to —
 * notably 131047 (outside the 24h window → template required).
 */

import { WhatsAppProviderError } from "../errors.ts";

interface IMetaErrorBody {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };
}

const RATE_LIMIT_CODES = new Set([4, 17, 80007]);

export function mapMetaError(
  httpStatus: number,
  body: unknown,
  endpoint: string,
  retryAfter?: string | null,
): WhatsAppProviderError {
  const error = (body as IMetaErrorBody | null)?.error;
  const code = error?.code;
  const details: Record<string, unknown> = {
    endpoint,
    metaCode: code,
    metaSubcode: error?.error_subcode,
    fbtraceId: error?.fbtrace_id,
  };

  if (code === 131026) {
    return new WhatsAppProviderError("VALIDATION_ERROR", 422, "Número não é WhatsApp", details);
  }
  if (code === 131047) {
    return new WhatsAppProviderError(
      "TEMPLATE_REQUIRED",
      422,
      "Fora da janela de 24h, use template",
      details,
    );
  }
  // 132 family: template not found / not approved / param mismatch.
  if (code === 132 || (typeof code === "number" && code >= 132000 && code <= 132999)) {
    return new WhatsAppProviderError(
      "TEMPLATE_NOT_FOUND",
      422,
      "Template não encontrado ou não aprovado pela Meta",
      details,
    );
  }
  if (code === 190) {
    return new WhatsAppProviderError(
      "UNAUTHORIZED",
      401,
      "Access token Meta inválido ou expirado",
      details,
    );
  }
  if (httpStatus === 429 || (typeof code === "number" && RATE_LIMIT_CODES.has(code))) {
    return new WhatsAppProviderError("RATE_LIMITED", 429, "Rate limit da Meta atingido", {
      ...details,
      retryAfter: retryAfter ?? undefined,
    });
  }
  if (code === 100) {
    return new WhatsAppProviderError(
      "VALIDATION_ERROR",
      422,
      `Parâmetro inválido na chamada Meta: ${error?.message ?? "sem detalhe"}`,
      details,
    );
  }
  return new WhatsAppProviderError(
    "INTEGRATION_ERROR",
    502,
    `Erro Meta não mapeado (HTTP ${httpStatus}): ${error?.message ?? "sem corpo de erro"}`,
    details,
  );
}
