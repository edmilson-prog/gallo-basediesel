/**
 * "Lembrar-me" persistence for the login screen.
 *
 * Stores only the e-mail the user typed (never the password) so it can be
 * pre-filled on the next visit. Mirrors the localStorage handling of
 * `authSession.ts`: a `window` guard plus `try/catch` keeps it safe under SSR
 * and private-browsing modes where storage is unavailable or throws.
 */

const REMEMBER_EMAIL_KEY = "gallo-remember-email";

/** Reads the remembered e-mail, or `null` when none is stored. */
export function readRememberedEmail(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(REMEMBER_EMAIL_KEY);
    return raw && raw.length > 0 ? raw : null;
  } catch {
    return null;
  }
}

/** Persists the e-mail. An empty/blank value clears the entry instead. */
export function saveRememberedEmail(email: string): void {
  if (typeof window === "undefined") return;
  const value = email.trim();
  if (value.length === 0) {
    clearRememberedEmail();
    return;
  }
  try {
    window.localStorage.setItem(REMEMBER_EMAIL_KEY, value);
  } catch {
    // localStorage may be unavailable (private mode). Nothing to persist.
  }
}

/** Removes the remembered e-mail. */
export function clearRememberedEmail(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(REMEMBER_EMAIL_KEY);
  } catch {
    // localStorage may be unavailable (private mode). Nothing to clear.
  }
}
