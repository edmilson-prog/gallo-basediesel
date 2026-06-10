/**
 * Shared request lifecycle for POST-only Edge Functions (PRD-102).
 *
 * Wraps Deno.serve with the boilerplate every GALLO function repeats:
 * CORS preflight, method gate, traceId creation, structured error handling.
 * HttpError → its status/message as `{ error }` (the shape clients consume);
 * anything else → logged with the traceId and returned as an opaque 500.
 */

import { handleOptions } from "./cors.ts";
import { HttpError, json } from "./http.ts";
import { createLogger, type Logger } from "./logger.ts";

export interface RequestContext {
  log: Logger;
  traceId: string;
}

export function servePost(
  handler: (req: Request, ctx: RequestContext) => Promise<Response>,
): void {
  Deno.serve(async (req) => {
    const preflight = handleOptions(req);
    if (preflight) return preflight;
    if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

    const traceId = req.headers.get("x-trace-id") ?? crypto.randomUUID();
    const log = createLogger(traceId);
    try {
      const res = await handler(req, { log, traceId });
      res.headers.set("x-trace-id", traceId);
      return res;
    } catch (err) {
      if (err instanceof HttpError) {
        const res = json({ error: err.message }, err.status);
        res.headers.set("x-trace-id", traceId);
        return res;
      }
      log.error("unhandled error", {
        error: err instanceof Error ? err.message : String(err),
      });
      const res = json({ error: "internal error", traceId }, 500);
      res.headers.set("x-trace-id", traceId);
      return res;
    }
  });
}
