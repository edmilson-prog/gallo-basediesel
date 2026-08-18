/**
 * Password strength scoring and change-form validation for "Meu perfil".
 *
 * Pure functions — no React, no Supabase. The scoring mirrors the four rules
 * surfaced in the UI hint ("mínimo 8 caracteres, com número e maiúscula"), so
 * the meter never claims something the copy did not ask for.
 */

/** Minimum length accepted by Supabase Auth for a new password. */
export const MIN_PASSWORD_LENGTH = 8;

/** Number of segments in the strength meter — one per satisfied rule. */
export const PASSWORD_STRENGTH_BARS = 4;

/** Maps onto the app's severity tokens; `muted` is the untouched/idle state. */
export type PasswordStrengthTone = "muted" | "critical" | "warning" | "success";

export interface IPasswordStrength {
  /** 0–4, one point per satisfied rule. */
  score: number;
  /** pt-BR label shown next to the meter. */
  label: string;
  tone: PasswordStrengthTone;
  /** Segments to paint — same as `score`, kept explicit for the view. */
  filled: number;
}

/** Counts satisfied rules: length, uppercase, digit, symbol. */
export function scorePassword(password: string): number {
  if (!password) return 0;
  const rules = [
    password.length >= MIN_PASSWORD_LENGTH,
    /[A-Z]/.test(password),
    /[0-9]/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ];
  return rules.filter(Boolean).length;
}

interface IStrengthLevel {
  label: string;
  tone: PasswordStrengthTone;
}

const WEAKEST: IStrengthLevel = { label: "Senha muito fraca", tone: "critical" };

const LEVELS: readonly IStrengthLevel[] = [
  { label: "Senha muito fraca", tone: "critical" },
  { label: "Senha fraca", tone: "critical" },
  { label: "Senha razoável", tone: "warning" },
  { label: "Senha boa", tone: "success" },
  { label: "Senha forte", tone: "success" },
];

/** Resolves the meter state for a typed password (idle when empty). */
export function evaluatePassword(password: string): IPasswordStrength {
  if (!password) return { score: 0, label: "Força da senha", tone: "muted", filled: 0 };
  const score = scorePassword(password);
  const level = LEVELS[score] ?? WEAKEST;
  return { score, label: level.label, tone: level.tone, filled: score };
}

export interface IPasswordChangeDraft {
  current: string;
  next: string;
  confirm: string;
}

export type PasswordChangeValidation = { ok: true } | { ok: false; error: string };

/**
 * Validates the change-password form. Order matters: the user is told about the
 * first thing that blocks them, not about everything at once.
 */
export function validatePasswordChange(draft: IPasswordChangeDraft): PasswordChangeValidation {
  if (!draft.current.trim()) return { ok: false, error: "Informe sua senha atual." };
  if (draft.next.length < MIN_PASSWORD_LENGTH) {
    return {
      ok: false,
      error: `A nova senha deve ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`,
    };
  }
  if (draft.next !== draft.confirm) return { ok: false, error: "As senhas não conferem." };
  if (draft.next === draft.current) {
    return { ok: false, error: "A nova senha deve ser diferente da atual." };
  }
  return { ok: true };
}
