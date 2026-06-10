/**
 * Error model of the WhatsApp engine layer (PRDs 112/113).
 *
 * The PRDs reference a global `AppError` that does not exist in this repo
 * (recorded deviation — same call made in PRD-111 for
 * WhatsAppAccountNotFoundError). This class carries the same semantics:
 * a stable machine `code`, an HTTP-ish status and a pt-BR message.
 *
 * Runtime-agnostic file: relative imports only, Web APIs only.
 */

export type WhatsAppErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "RATE_LIMITED"
  | "TEMPLATE_REQUIRED"
  | "TEMPLATE_NOT_FOUND"
  | "PROVIDER_DISCONNECTED"
  | "NOT_SUPPORTED"
  | "NOT_FOUND"
  | "INTEGRATION_ERROR";

export class WhatsAppProviderError extends Error {
  readonly code: WhatsAppErrorCode;
  readonly httpStatus: number;
  /** Safe-to-log extras (e.g. provider error code, retryAfter). Never secrets. */
  readonly details?: Record<string, unknown>;

  constructor(
    code: WhatsAppErrorCode,
    httpStatus: number,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "WhatsAppProviderError";
    this.code = code;
    this.httpStatus = httpStatus;
    this.details = details;
  }
}
