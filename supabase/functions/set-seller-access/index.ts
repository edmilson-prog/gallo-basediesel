import "jsr:@supabase/functions-js/edge-runtime.d.ts";

/**
 * set-seller-access (PRD-107 Fase 3) — turns a seller's platform login on/off,
 * server-side, with the service_role key.
 *
 * Deactivate (`active:false`): bans the auth user (login + token refresh fail,
 * so the active session drops on its next refresh) and flips `sellers.active`.
 * Reactivate (`active:true`): un-bans + flips back. It is reversible — the
 * seller's history (orders, carteira, commissions) is untouched.
 *
 * Guards: caller must be staff (owner/manager); nobody may change their own
 * access or deactivate an Owner.
 *
 * Shared lifecycle/auth/error patterns: supabase/functions/_shared (PRD-102).
 */

import { bestEffortAudit } from "../_shared/audit.ts";
import { requireCaller, STAFF_ROLES } from "../_shared/auth.ts";
import { HttpError, json, parseJsonBody } from "../_shared/http.ts";
import { servePost } from "../_shared/serve.ts";

// ~100 years — effectively permanent until an explicit reactivate ("none").
const BAN_DURATION = "876600h";

servePost(async (req, { log }) => {
  // 1) Identify the caller and require staff.
  const { callerId, admin, profile } = await requireCaller(req, STAFF_ROLES);

  // 2) Parse + validate the input.
  const body = await parseJsonBody(req);
  const sellerId = String(body.sellerId ?? "");
  if (!sellerId || typeof body.active !== "boolean") {
    throw new HttpError(400, "missing sellerId or active flag");
  }
  const active = body.active as boolean;

  // 3) Resolve the target seller's access profile (within the caller's store).
  const { data: target } = await admin
    .from("profiles")
    .select("auth_user_id, role, store_id")
    .eq("seller_id", sellerId)
    .maybeSingle();
  if (!target || target.store_id !== profile.store_id) {
    throw new HttpError(404, "seller has no access in your store");
  }

  // 4) Guards: never touch your own access; never deactivate an Owner.
  if (target.auth_user_id === callerId) {
    throw new HttpError(403, "you cannot change your own access");
  }
  if (!active && target.role === "owner") {
    throw new HttpError(403, "owners cannot be deactivated");
  }

  // 5) Ban / un-ban the auth user.
  const { error: banErr } = await admin.auth.admin.updateUserById(target.auth_user_id, {
    ban_duration: active ? "none" : BAN_DURATION,
  });
  if (banErr) {
    throw new HttpError(400, `could not update auth user: ${banErr.message}`);
  }

  // 6) Flip the business flag.
  const { error: sellerErr } = await admin
    .from("sellers")
    .update({ active, updated_at: new Date().toISOString() })
    .eq("id", sellerId);
  if (sellerErr) {
    throw new HttpError(400, `could not update seller: ${sellerErr.message}`);
  }

  // 7) Audit — best-effort.
  await bestEffortAudit(admin, {
    store_id: profile.store_id,
    actor_id: callerId,
    action: active ? "seller.access_reactivated" : "seller.access_deactivated",
    resource: "seller",
    resource_id: sellerId,
    after: { active },
  });

  log.info("seller access toggled", { sellerId, active });
  return json({ sellerId, active }, 200);
});
