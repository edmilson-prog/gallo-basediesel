import { getSupabaseClient } from "@/shared/lib/supabase";
import { AUTH_SOURCE } from "./authSource";
import {
  type IMfaFactorLike,
  type MfaGate,
  pickVerifiedTotpFactor,
  resolveMfaGate,
} from "./engine/mfaGate";

/**
 * Two-factor (TOTP) surface over Supabase Auth.
 *
 * Optional by design: a user with no enrolled factor never meets any of this.
 * Everything here is inert under the mock backend, which has no real session.
 *
 * @see ./engine/mfaGate.ts for the pure decision logic.
 */

export interface ITotpEnrollment {
  factorId: string;
  /** `data:image/svg+xml…` — safe to use as an <img> src. */
  qrCode: string;
  /** Same secret, for keying in by hand when the camera is not an option. */
  secret: string;
}

/** Friendly name attached to the factor, shown in authenticator apps. */
const FACTOR_NAME = "GALLO Base Diesel";

function authIsReal(): boolean {
  return AUTH_SOURCE === "supabase";
}

/**
 * Reads the MFA gate for the CURRENT session. Never throws: a failure resolves
 * to "not_enrolled" so a transient error can't lock anyone out (fail open — the
 * gate only ever ADDS a step).
 */
export async function readMfaGate(): Promise<MfaGate> {
  if (!authIsReal()) return "not_enrolled";
  try {
    const { data, error } = await getSupabaseClient().auth.mfa.getAuthenticatorAssuranceLevel();
    if (error) return "not_enrolled";
    return resolveMfaGate(data);
  } catch {
    return "not_enrolled";
  }
}

/** The verified TOTP factor of the signed-in user, or `null`. */
export async function getVerifiedTotpFactor(): Promise<IMfaFactorLike | null> {
  if (!authIsReal()) return null;
  const { data, error } = await getSupabaseClient().auth.mfa.listFactors();
  if (error) return null;
  return pickVerifiedTotpFactor(data?.all as IMfaFactorLike[] | undefined);
}

/**
 * Starts an enrollment and returns the QR code to scan. Any half-finished
 * (unverified) factor is cleared first, otherwise Supabase rejects the new
 * enrollment for a duplicate friendly name.
 */
export async function startTotpEnrollment(): Promise<ITotpEnrollment> {
  const supabase = getSupabaseClient();

  const { data: existing } = await supabase.auth.mfa.listFactors();
  const stale = ((existing?.all ?? []) as IMfaFactorLike[]).filter(
    (f) => f.factor_type === "totp" && f.status !== "verified",
  );
  for (const factor of stale) {
    await supabase.auth.mfa.unenroll({ factorId: factor.id }).catch(() => undefined);
  }

  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: FACTOR_NAME,
  });
  if (error || !data) {
    throw new Error(translateMfaError(error?.message, "Não foi possível iniciar a ativação."));
  }
  return { factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret };
}

/**
 * Confirms an enrollment with the first code from the authenticator app. On
 * success the factor becomes `verified` AND this session is raised to aal2.
 */
export async function confirmTotpEnrollment(factorId: string, code: string): Promise<void> {
  const { error } = await getSupabaseClient().auth.mfa.challengeAndVerify({ factorId, code });
  if (error) {
    throw new Error(translateMfaError(error.message, "Não foi possível confirmar o código."));
  }
}

/** Answers the login challenge, raising the session from aal1 to aal2. */
export async function verifyTotpChallenge(factorId: string, code: string): Promise<void> {
  const { error } = await getSupabaseClient().auth.mfa.challengeAndVerify({ factorId, code });
  if (error) {
    throw new Error(translateMfaError(error.message, "Não foi possível validar o código."));
  }
}

/**
 * Turns the second factor off. Supabase requires an aal2 session to unenroll a
 * verified factor — which the user has, since reaching this screen means they
 * passed the challenge at login.
 */
export async function disableTotp(factorId: string): Promise<void> {
  const { error } = await getSupabaseClient().auth.mfa.unenroll({ factorId });
  if (error) {
    throw new Error(translateMfaError(error.message, "Não foi possível desativar a verificação."));
  }
}

/** Maps the handful of Supabase MFA errors users actually hit into pt-BR. */
function translateMfaError(raw: string | undefined, fallback: string): string {
  const message = (raw ?? "").toLowerCase();
  if (message.includes("invalid totp code") || message.includes("invalid code")) {
    return "Código inválido. Confira o app autenticador e tente de novo.";
  }
  if (message.includes("expired")) {
    return "O código expirou. Digite o código atual do aplicativo.";
  }
  if (message.includes("rate limit") || message.includes("too many")) {
    return "Muitas tentativas seguidas. Aguarde um instante e tente novamente.";
  }
  if (message.includes("mfa") && message.includes("disabled")) {
    return "A verificação em duas etapas não está habilitada neste projeto Supabase.";
  }
  if (message.includes("insufficient aal")) {
    return "Esta ação exige uma sessão verificada em duas etapas. Entre novamente e confirme o código.";
  }
  return raw ? `${fallback} (${raw})` : fallback;
}
