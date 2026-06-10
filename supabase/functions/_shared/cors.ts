/** Shared CORS surface for all GALLO Edge Functions (PRD-102). */

export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
} as const;

/** Returns the preflight response for OPTIONS requests, or null otherwise. */
export function handleOptions(req: Request): Response | null {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  return null;
}
