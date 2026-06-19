import "jsr:@supabase/functions-js/edge-runtime.d.ts";

/**
 * reset-seller-password (PRD-107 Fase 3) — sets a fresh temporary password for a
 * seller who lost theirs, server-side, with the service_role key. The temporary
 * password is generated on the client, shown once for hand-off, and applied here.
 *
 * Works whether the seller is active or deactivated (banned): the password is
 * replaced regardless; an active ban stays in place until an explicit reactivate.
 *
 * Guards: caller must be staff (owner/manager); nobody may reset their own
 * password here, and only an Owner may reset another Owner's password.
 *
 * Shared lifecycle/auth/error patterns: supabase/functions/_shared (PRD-102).
 */

import { bestEffortAudit } from "../_shared/audit.ts";
import { requireCaller, STAFF_ROLES } from "../_shared/auth.ts";
import { HttpError, json, parseJsonBody } from "../_shared/http.ts";
import { servePost } from "../_shared/serve.ts";

servePost(async (req, { log }) => {
  // 1) Identify the caller and require staff.
  const { callerId, admin, profile } = await requireCaller(req, STAFF_ROLES);

  // 2) Parse + validate the input.
  const body = await parseJsonBody(req);
  const sellerId = String(body.sellerId ?? "");
  const password = String(body.password ?? "");
  if (!sellerId || !password) {
    throw new HttpError(400, "missing sellerId or password");
  }
  if (password.length < 8) throw new HttpError(400, "password must be at least 8 characters");

  // 3) Resolve the target seller's access profile (within the caller's store).
  const { data: target } = await admin
    .from("profiles")
    .select("auth_user_id, role, store_id")
    .eq("seller_id", sellerId)
    .maybeSingle();
  if (!target || target.store_id !== profile.store_id) {
    throw new HttpError(404, "seller has no access in your store");
  }

  // 4) Guards: never reset your own password here; only an Owner resets an Owner.
  if (target.auth_user_id === callerId) {
    throw new HttpError(403, "you cannot reset your own password here");
  }
  if (target.role === "owner" && profile.role !== "owner") {
    throw new HttpError(403, "only an owner can reset another owner's password");
  }

  // 5) Apply the new password (works even while the user is banned).
  const { error: updErr } = await admin.auth.admin.updateUserById(target.auth_user_id, {
    password,
  });
  if (updErr) {
    throw new HttpError(400, `could not update auth user: ${updErr.message}`);
  }

  // 6) Audit — best-effort.
  await bestEffortAudit(admin, {
    store_id: profile.store_id,
    actor_id: profile.seller_id,
    action: "seller.password_reset",
    resource: "seller",
    resource_id: sellerId,
  });

  log.info("seller password reset", { sellerId });
  return json({ sellerId }, 200);
});
