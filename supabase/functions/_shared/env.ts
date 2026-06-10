/** Shared environment access (PRD-102). */

/** Returns a required env var or throws at startup — fail fast, not mid-request. */
export function requiredEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`missing required env var: ${name}`);
  return value;
}

/** Returns an optional env var (empty string when unset). */
export function optionalEnv(name: string, fallback = ""): string {
  return Deno.env.get(name) ?? fallback;
}
