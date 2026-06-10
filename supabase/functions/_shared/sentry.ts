/**
 * Minimal Sentry client for Edge Functions (PRD-110, RF-004).
 *
 * Posts error events straight to the Sentry envelope endpoint — no SDK
 * dependency, a few hundred bytes of code. Gated on the SENTRY_DSN function
 * secret: when absent every call is a no-op. Strictly fail-open (RNF-006):
 * a Sentry outage can never affect the function's own response.
 *
 * Events carry the traceId (frontend <-> backend correlation, RNF-004) and
 * the function name. No request bodies and no PII are ever attached.
 */

interface ParsedDsn {
  endpoint: string;
  publicKey: string;
}

function parseDsn(dsn: string): ParsedDsn | null {
  try {
    const url = new URL(dsn);
    const projectId = url.pathname.replace(/^\//, "");
    if (!url.username || !projectId) return null;
    return {
      endpoint: `${url.protocol}//${url.host}/api/${projectId}/envelope/`,
      publicKey: url.username,
    };
  } catch {
    return null;
  }
}

const dsn = Deno.env.get("SENTRY_DSN") ?? "";
const parsed = dsn ? parseDsn(dsn) : null;

export interface SentryContext {
  traceId: string;
  functionName: string;
}

/**
 * Reports an exception to Sentry (fire-and-forget). No-op without SENTRY_DSN.
 * Uses EdgeRuntime.waitUntil when available so the response is never delayed.
 */
export function captureException(err: unknown, ctx: SentryContext): void {
  if (!parsed) return;
  try {
    const eventId = crypto.randomUUID().replaceAll("-", "");
    const now = new Date().toISOString();
    const message = err instanceof Error ? err.message : String(err);
    const type = err instanceof Error ? err.name : "Error";
    const stack = err instanceof Error ? (err.stack ?? "") : "";

    const event = {
      event_id: eventId,
      timestamp: now,
      platform: "javascript",
      level: "error",
      environment: "edge",
      server_name: ctx.functionName,
      tags: { traceId: ctx.traceId, function: ctx.functionName, runtime: "deno-edge" },
      exception: { values: [{ type, value: message }] },
      extra: stack ? { stack } : undefined,
    };
    const envelope =
      JSON.stringify({ event_id: eventId, sent_at: now, dsn }) +
      "\n" +
      JSON.stringify({ type: "event" }) +
      "\n" +
      JSON.stringify(event);

    const send = fetch(parsed.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-sentry-envelope",
        "X-Sentry-Auth": `Sentry sentry_version=7, sentry_key=${parsed.publicKey}, sentry_client=gallo-edge/1.0`,
      },
      body: envelope,
      signal: AbortSignal.timeout(3000),
    }).catch(() => {
      // Fail-open: telemetry errors are swallowed.
    });

    // deno-lint-ignore no-explicit-any
    const runtime = (globalThis as any).EdgeRuntime;
    if (runtime?.waitUntil) {
      runtime.waitUntil(send);
    }
  } catch {
    // Fail-open: building/sending the event must never throw.
  }
}
