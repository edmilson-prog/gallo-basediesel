/**
 * GALLO BASE DIESEL — DINTEC provider layer errors (PRD-121).
 *
 * Thin error type for provider-level failures (factory resolution, source
 * loading). Structural validation issues are NOT exceptions — they travel as
 * data in `DintecValidationResult` so the Owner sees them in the UI.
 */

export type DintecErrorCode =
  | "NOT_IMPLEMENTED"
  | "NOT_SUPPORTED"
  | "SOURCE_UNAVAILABLE"
  | "PARSE_FAILED";

export class DintecProviderError extends Error {
  readonly code: DintecErrorCode;

  constructor(code: DintecErrorCode, message: string) {
    super(message);
    this.name = "DintecProviderError";
    this.code = code;
  }
}
