import "jsr:@supabase/functions-js/edge-runtime.d.ts";

/**
 * hello-trace (PRD-102) — canary function demonstrating the `_shared` patterns.
 *
 * It is the living template for new GALLO Edge Functions:
 *   - `servePost` lifecycle (CORS preflight, method gate, traceId, error handling)
 *   - `requireCaller` defence-in-depth authorization (here: any profile role)
 *   - structured logging bound to the request traceId
 *   - typed errors (`HttpError`) instead of ad-hoc early returns
 *
 * Call it with any signed-in user's JWT to receive the trace echo. It performs
 * no mutations — safe to invoke at any time as a deployment smoke test.
 */

import { requireCaller } from "../_shared/auth.ts";
import { json, parseJsonBody } from "../_shared/http.ts";
import { servePost } from "../_shared/serve.ts";

const ANY_PROFILE_ROLE = [
  "owner",
  "manager",
  "seller_internal",
  "seller_external",
  "sdr",
  "financeiro",
  "b2b_customer",
  "b2c_customer",
] as const;

servePost(async (req, { log, traceId }) => {
  const { callerId, profile } = await requireCaller(req, ANY_PROFILE_ROLE);

  // Body is optional for the canary; an empty object keeps the contract simple.
  const body = await parseJsonBody(req).catch(() => ({}) as Record<string, unknown>);

  log.info("hello-trace invoked", { callerId, role: profile.role });

  return json({
    ok: true,
    traceId,
    caller: { id: callerId, role: profile.role, storeId: profile.store_id },
    echo: body.echo ?? null,
    now: new Date().toISOString(),
  });
});
