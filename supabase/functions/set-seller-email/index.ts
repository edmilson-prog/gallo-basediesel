import "jsr:@supabase/functions-js/edge-runtime.d.ts";

/**
 * set-seller-email (users CRUD follow-up) — syncs the platform login e-mail
 * (`auth.users.email`) to match `sellers.email`, server-side, with the
 * service_role key.
 *
 * `sellers.update()` only ever wrote `sellers.email` (contact data) — the
 * login credential lived untouched in `auth.users`, so editing a seller's
 * e-mail in the Users screen silently diverged the two. This function closes
 * that gap for staff-initiated edits; it applies the change immediately (no
 * double opt-in confirmation e-mail), mirroring `reset-seller-password`.
 *
 * Guards: caller must be staff (owner/manager); nobody may change their own
 * login e-mail here (self-service lives at "Meu perfil"); only an Owner may
 * change another Owner's e-mail.
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
  const email = String(body.email ?? "")
    .trim()
    .toLowerCase();
  if (!sellerId || !email) throw new HttpError(400, "missing sellerId or email");
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new HttpError(400, "invalid email");

  // 3) Resolve the target seller's access profile (within the caller's store).
  const { data: target } = await admin
    .from("profiles")
    .select("auth_user_id, role, store_id")
    .eq("seller_id", sellerId)
    .maybeSingle();
  if (!target || target.store_id !== profile.store_id) {
    throw new HttpError(404, "seller has no access in your store");
  }

  // 4) Guards: never change your own login e-mail here; only an Owner changes an Owner's.
  if (target.auth_user_id === callerId) {
    throw new HttpError(403, "you cannot change your own login e-mail here");
  }
  if (target.role === "owner" && profile.role !== "owner") {
    throw new HttpError(403, "only an owner can change another owner's e-mail");
  }

  // 5) Apply the new e-mail (pre-confirmed — same admin-override semantics as
  //    reset-seller-password; no confirmation round-trip).
  const { error: updErr } = await admin.auth.admin.updateUserById(target.auth_user_id, {
    email,
    email_confirm: true,
  });
  if (updErr) {
    throw new HttpError(400, `could not update auth user: ${updErr.message}`);
  }

  // 6) Keep the denormalized profiles.email copy in sync.
  const { error: profErr } = await admin
    .from("profiles")
    .update({ email })
    .eq("seller_id", sellerId);
  if (profErr) {
    throw new HttpError(400, `e-mail updated but profile sync failed: ${profErr.message}`);
  }

  // 7) Audit — best-effort.
  await bestEffortAudit(admin, {
    store_id: profile.store_id,
    actor_id: profile.seller_id,
    action: "seller.email_changed",
    resource: "seller",
    resource_id: sellerId,
    after: { email },
  });

  log.info("seller login e-mail changed", { sellerId });
  return json({ sellerId, email }, 200);
});
