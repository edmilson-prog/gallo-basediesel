const KEY = "gallo-explicit-login";

/** Set by the login route right before navigating into the app. */
export function markExplicitLogin(): void {
  try {
    sessionStorage.setItem(KEY, "1");
  } catch {
    /* storage unavailable — briefing simply won't show */
  }
}

/** One-shot consumer: true exactly once per explicit login. */
export function consumeExplicitLogin(): boolean {
  try {
    const present = sessionStorage.getItem(KEY) === "1";
    if (present) sessionStorage.removeItem(KEY);
    return present;
  } catch {
    return false;
  }
}
