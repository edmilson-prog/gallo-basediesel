/**
 * Two-factor (TOTP) gate decisions — pure, no Supabase client.
 *
 * Supabase expresses MFA state through two assurance levels:
 *   currentLevel — what THIS session has already proven;
 *   nextLevel    — what it COULD reach, i.e. "aal2" once a verified factor exists.
 *
 * So `aal1 → aal2` is the one combination that means "enrolled but not yet
 * challenged", and it is the only case where the app must stop and ask for a code.
 */

/**
 * Widened on purpose: supabase-js types this as its own union (which already
 * includes levels we do not use), and an unknown future level must flow through
 * here rather than fail to compile. Only "aal1"/"aal2" are interpreted.
 */
export type AssuranceLevel = string | null | undefined;

export interface IAssuranceLevels {
  currentLevel: AssuranceLevel;
  nextLevel: AssuranceLevel;
}

export type MfaGate =
  /** No verified factor — nothing to ask. */
  | "not_enrolled"
  /** A verified factor exists and this session has not used it yet. */
  | "challenge_required"
  /** The session already proved the second factor. */
  | "satisfied";

/**
 * Resolves what the app must do about MFA for the current session.
 *
 * Fails OPEN on unknown input: if the assurance level cannot be read, we treat
 * it as "no enrollment" rather than locking every user out of the platform.
 * That is safe because the level is only ever consulted to ADD a step.
 */
export function resolveMfaGate(levels: IAssuranceLevels | null | undefined): MfaGate {
  if (!levels) return "not_enrolled";
  const { currentLevel, nextLevel } = levels;
  if (currentLevel === "aal2") return "satisfied";
  if (currentLevel === "aal1" && nextLevel === "aal2") return "challenge_required";
  return "not_enrolled";
}

/** Shape of the factor entries returned by `auth.mfa.listFactors()`. */
export interface IMfaFactorLike {
  id: string;
  factor_type?: string;
  status?: string;
  friendly_name?: string;
}

/** The verified TOTP factor, or `null` when the account has none. */
export function pickVerifiedTotpFactor<T extends IMfaFactorLike>(
  factors: readonly T[] | null | undefined,
): T | null {
  if (!factors) return null;
  return factors.find((f) => f.factor_type === "totp" && f.status === "verified") ?? null;
}

/** Digits in a TOTP code. */
export const TOTP_CODE_LENGTH = 6;

/** Strips everything that is not a digit and caps the length. */
export function normalizeTotpCode(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, TOTP_CODE_LENGTH);
}

/** True when the code is ready to be submitted. */
export function isCompleteTotpCode(code: string): boolean {
  return new RegExp(`^\\d{${TOTP_CODE_LENGTH}}$`).test(code);
}
