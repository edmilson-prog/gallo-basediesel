/** Shared HTTP helpers: JSON responses, typed errors, body parsing (PRD-102). */

import { CORS } from "./cors.ts";

/** JSON response with the shared CORS headers. */
export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

/**
 * Throwable HTTP error. Handlers `throw new HttpError(403, "forbidden: …")`
 * instead of early-returning responses; `servePost` turns it into the same
 * `{ error }` JSON shape the clients already consume.
 */
export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

/** Parses the JSON body or throws 400 — same contract as the inline try/catch it replaces. */
export async function parseJsonBody(req: Request): Promise<Record<string, unknown>> {
  try {
    return await req.json();
  } catch {
    throw new HttpError(400, "invalid json body");
  }
}
