/**
 * Error tracking façade (PRD-110, RF-001..006).
 *
 * Sentry is loaded via dynamic import ONLY when `VITE_SENTRY_DSN` is set, so
 * builds without a DSN ship zero Sentry bytes in the critical path and every
 * call here becomes a no-op (telemetry is fail-open by design — RNF-006).
 *
 * PII policy (RF-003/RF-050): events carry sellerId/storeId/role/traceId and
 * NEVER customer-identifying fields. `scrubEvent` strips known PII keys from
 * the whole event before it leaves the browser.
 */

type SentryModule = typeof import("@sentry/react");

const DSN = import.meta.env.VITE_SENTRY_DSN;

/** Keys whose values are dropped anywhere in the outgoing event (RF-050). */
const PII_KEYS = [
  "name",
  "displayname",
  "email",
  "phone",
  "whatsapp",
  "document",
  "cpf",
  "cnpj",
  "address",
  "password",
];

let sentry: SentryModule | null = null;
let pendingUser: IObservabilityUser | null | undefined;

export interface IObservabilityUser {
  id: string;
  role: string | null;
  storeId: string | null;
  sellerId?: string | null;
}

function isPiiKey(key: string): boolean {
  const lower = key.toLowerCase();
  return PII_KEYS.some((pii) => lower.includes(pii));
}

/** Recursively removes PII-named fields from a JSON-ish structure. */
export function scrubPii<T>(value: T, depth = 0): T {
  if (depth > 8 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    return value.map((item) => scrubPii(item, depth + 1)) as T;
  }
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    if (isPiiKey(key)) {
      out[key] = "[scrubbed]";
    } else {
      out[key] = scrubPii(val, depth + 1);
    }
  }
  return out as T;
}

function applyUser(mod: SentryModule, user: IObservabilityUser | null): void {
  if (!user) {
    mod.setUser(null);
    mod.setTags({ role: null, storeId: null, sellerId: null });
    return;
  }
  // Only opaque ids — never name/email (RF-003).
  mod.setUser({ id: user.id });
  mod.setTags({
    role: user.role ?? undefined,
    storeId: user.storeId ?? undefined,
    sellerId: user.sellerId ?? undefined,
  });
}

/**
 * Boots Sentry when a DSN is configured. Called once from `src/main.tsx`;
 * a failed load never breaks the app (fail-open).
 */
export function initObservability(): void {
  if (!DSN) return;
  void import("@sentry/react")
    .then((mod) => {
      mod.init({
        dsn: DSN,
        release: `gallo-base-diesel@${__APP_VERSION__}`,
        environment: import.meta.env.MODE,
        // No APM/tracing in the MVP (PRD-110 exclusion) — errors only.
        tracesSampleRate: 0,
        sendDefaultPii: false,
        beforeSend(event) {
          return scrubPii(event);
        },
      });
      sentry = mod;
      if (pendingUser !== undefined) applyUser(mod, pendingUser);
    })
    .catch(() => {
      // Telemetry must never take the app down (RNF-006).
    });
}

/**
 * Tags events with the signed-in user's opaque ids (or clears them on
 * sign-out). Safe to call before/without init — the value is buffered.
 */
export function setObservabilityUser(user: IObservabilityUser | null): void {
  pendingUser = user;
  if (sentry) applyUser(sentry, user);
}

/** Manual capture for handled-but-relevant errors. No-op without DSN. */
export function captureObservabilityException(
  error: unknown,
  context?: Record<string, unknown>,
): void {
  if (!sentry) return;
  sentry.captureException(error, context ? { extra: scrubPii(context) } : undefined);
}
