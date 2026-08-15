import "jsr:@supabase/functions-js/edge-runtime.d.ts";

/**
 * reset-seller-mfa — removes every enrolled MFA factor from a seller's login,
 * server-side, with the service_role key.
 *
 * Two-factor is OPTIONAL and TOTP-only, and Supabase has no native recovery
 * codes: someone who loses their authenticator app is locked out for good
 * unless a human can clear the factor. This is that escape hatch.
 *
 * Owner-only — deliberately stricter than the sibling password reset (staff),
 * because clearing a second factor weakens an account's protection rather than
 * just rotating a credential. Nobody clears their own factor here: with a live
 * session you turn 2FA off in Configurações → Meu perfil, and allowing it would
 * let a hijacked aal1 session strip its own second factor.
 *
 * Shared lifecycle/auth/error patterns: supabase/functions/_shared (PRD-102).
 */

import { bestEffortAudit } from "../_shared/audit.ts";
import { requireCaller } from "../_shared/auth.ts";
import { HttpError, json, parseJsonBody } from "../_shared/http.ts";
import { servePost } from "../_shared/serve.ts";

const OWNER_ONLY = ["owner"] as const;

servePost(async (req, { log }) => {
  // 1) Identify the caller and require Owner.
  const { callerId, admin, profile } = await requireCaller(req, OWNER_ONLY);

  // 2) Parse + validate the input.
  const body = await parseJsonBody(req);
  const sellerId = String(body.sellerId ?? "");
  if (!sellerId) throw new HttpError(400, "missing sellerId");

  // 3) Resolve the target seller's access profile (within the caller's store).
  const { data: target } = await admin
    .from("profiles")
    .select("auth_user_id, role, store_id")
    .eq("seller_id", sellerId)
    .maybeSingle();
  if (!target || target.store_id !== profile.store_id) {
    throw new HttpError(404, "seller has no access in your store");
  }

  // 4) Guard: never clear your own second factor through this path.
  if (target.auth_user_id === callerId) {
    throw new HttpError(403, "you cannot reset your own two-factor here");
  }

  // 5) Read the enrolled factors straight off the auth user.
  const { data: userData, error: userErr } = await admin.auth.admin.getUserById(
    target.auth_user_id,
  );
  if (userErr || !userData?.user) {
    throw new HttpError(400, `could not load auth user: ${userErr?.message ?? "not found"}`);
  }
  const factors = userData.user.factors ?? [];
  if (factors.length === 0) {
    return json({ sellerId, removed: 0, note: "no factors enrolled" }, 200);
  }

  // 6) Delete every factor (an account may hold an unverified leftover too).
  let removed = 0;
  for (const factor of factors) {
    const { error } = await admin.auth.admin.mfa.deleteFactor({
      userId: target.auth_user_id,
      id: factor.id,
    });
    if (error) throw new HttpError(400, `could not remove factor: ${error.message}`);
    removed += 1;
  }

  // 7) Audit — best-effort.
  await bestEffortAudit(admin, {
    store_id: profile.store_id,
    actor_id: profile.seller_id,
    action: "seller.mfa_reset",
    resource: "seller",
    resource_id: sellerId,
    after: { removed },
  });

  log.info("seller mfa reset", { sellerId, removed });
  return json({ sellerId, removed }, 200);
});
