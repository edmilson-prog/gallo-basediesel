import "jsr:@supabase/functions-js/edge-runtime.d.ts";

/**
 * delete-seller (users CRUD) — soft-deletes a seller, server-side, with the
 * service_role key.
 *
 * Soft delete: removes the auth user + profile (frees the e-mail for future
 * reuse), then marks `sellers.deleted_at` and flips `active` off. The sellers
 * row stays — 31 tables reference it (orders, customers, audit...), so history
 * keeps resolving. Provider list() hides rows with deleted_at set.
 *
 * Guards: caller must be an Owner; the target must belong to the caller's
 * store; nobody may delete themselves or an Owner.
 *
 * Shared lifecycle/auth/error patterns: supabase/functions/_shared (PRD-102).
 */

import { bestEffortAudit } from "../_shared/audit.ts";
import { requireCaller } from "../_shared/auth.ts";
import { HttpError, json, parseJsonBody } from "../_shared/http.ts";
import { servePost } from "../_shared/serve.ts";

servePost(async (req, { log }) => {
  // 1) Identify the caller and require Owner (stricter than set-seller-access —
  //    deleting is effectively irreversible for the login).
  const { callerId, admin, profile } = await requireCaller(req, ["owner"]);

  // 2) Parse + validate the input.
  const body = await parseJsonBody(req);
  const sellerId = String(body.sellerId ?? "");
  if (!sellerId) throw new HttpError(400, "missing sellerId");

  // 3) Resolve the target seller (may have no access profile at all).
  const { data: seller } = await admin
    .from("sellers")
    .select("id, store_id, deleted_at")
    .eq("id", sellerId)
    .maybeSingle();
  if (!seller || seller.store_id !== profile.store_id) {
    throw new HttpError(404, "seller not found in your store");
  }
  if (seller.deleted_at) throw new HttpError(409, "seller is already deleted");

  // 4) Guards on the access profile (when one exists).
  const { data: access } = await admin
    .from("profiles")
    .select("auth_user_id, role")
    .eq("seller_id", sellerId)
    .maybeSingle();
  if (access?.auth_user_id === callerId) {
    throw new HttpError(403, "you cannot delete yourself");
  }
  if (access?.role === "owner") {
    throw new HttpError(403, "owners cannot be deleted");
  }

  // 5) Revoke the login: delete auth user + profile (frees the e-mail).
  if (access) {
    const { error: authErr } = await admin.auth.admin.deleteUser(access.auth_user_id);
    if (authErr) throw new HttpError(400, `could not delete auth user: ${authErr.message}`);
    // Idempotent — a FK cascade may have removed the row already.
    const { error: profErr } = await admin.from("profiles").delete().eq("seller_id", sellerId);
    if (profErr) throw new HttpError(400, `could not delete profile: ${profErr.message}`);
  }

  // 6) Soft-delete the business row.
  const now = new Date().toISOString();
  const { error: sellerErr } = await admin
    .from("sellers")
    .update({ deleted_at: now, active: false, updated_at: now })
    .eq("id", sellerId);
  if (sellerErr) throw new HttpError(400, `could not soft-delete seller: ${sellerErr.message}`);

  // 7) Audit — best-effort.
  await bestEffortAudit(admin, {
    store_id: profile.store_id,
    actor_id: callerId,
    action: "seller.deleted",
    resource: "seller",
    resource_id: sellerId,
    after: { deleted: true, hadAccess: Boolean(access) },
  });

  log.info("seller soft-deleted", { sellerId, hadAccess: Boolean(access) });
  return json({ sellerId, deleted: true }, 200);
});
