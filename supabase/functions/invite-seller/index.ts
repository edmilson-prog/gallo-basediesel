import "jsr:@supabase/functions-js/edge-runtime.d.ts";

/**
 * invite-seller (PRD-107 Fase 3) — creates platform access for an existing
 * seller, server-side, so the service_role key never reaches the browser.
 *
 * Flow: the Owner triggers this from /app/configuracoes/usuarios. The function
 *  1. identifies the caller from their JWT and verifies they are staff
 *     (owner/manager) — defence in depth on top of the gateway's verify_jwt,
 *  2. validates the target seller belongs to the caller's store and has no
 *     access yet,
 *  3. creates the auth user (email pre-confirmed — email-invite lives in
 *     `invite-seller-email`),
 *  4. links a `profiles` row (auth_user_id → seller, store, role), rolling back
 *     the auth user if the link fails (no orphans),
 *  5. writes a best-effort audit log.
 *
 * Shared lifecycle/auth/error patterns: supabase/functions/_shared (PRD-102).
 */

import { bestEffortAudit } from "../_shared/audit.ts";
import { requireCaller, STAFF_ROLES } from "../_shared/auth.ts";
import { HttpError, json, parseJsonBody } from "../_shared/http.ts";
import { servePost } from "../_shared/serve.ts";

const ALLOWED_ROLES = ["seller_internal", "seller_external", "manager"];

servePost(async (req, { log }) => {
  // 1) Identify the caller and require staff.
  const { callerId, admin, profile } = await requireCaller(req, STAFF_ROLES);

  // 2) Parse + validate the input.
  const body = await parseJsonBody(req);
  const sellerId = String(body.sellerId ?? "");
  const email = String(body.email ?? "")
    .trim()
    .toLowerCase();
  const password = String(body.password ?? "");
  const role = String(body.role ?? "");
  if (!sellerId || !email || !password) {
    throw new HttpError(400, "missing sellerId, email or password");
  }
  if (password.length < 8) throw new HttpError(400, "password must be at least 8 characters");
  if (!ALLOWED_ROLES.includes(role)) throw new HttpError(400, "invalid role");

  // 3) The target seller must belong to the caller's store.
  const { data: seller } = await admin
    .from("sellers")
    .select("id, store_id, full_name")
    .eq("id", sellerId)
    .maybeSingle();
  if (!seller || seller.store_id !== profile.store_id) {
    throw new HttpError(400, "seller not found in your store");
  }

  // 4) Refuse if this seller already has an access profile.
  const { data: existing } = await admin
    .from("profiles")
    .select("auth_user_id")
    .eq("seller_id", sellerId)
    .maybeSingle();
  if (existing) throw new HttpError(409, "this seller already has platform access");

  // 5) Create the auth user (email pre-confirmed).
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createErr || !created?.user) {
    throw new HttpError(400, `could not create user: ${createErr?.message ?? "unknown error"}`);
  }

  // 6) Link the profile; roll back the auth user on failure (no orphans).
  const { error: profErr } = await admin.from("profiles").insert({
    auth_user_id: created.user.id,
    seller_id: sellerId,
    store_id: profile.store_id,
    role,
    display_name: seller.full_name,
    email,
  });
  if (profErr) {
    await admin.auth.admin.deleteUser(created.user.id);
    throw new HttpError(400, `could not link profile: ${profErr.message}`);
  }

  // 7) Audit — best-effort, never fails the request.
  await bestEffortAudit(admin, {
    store_id: profile.store_id,
    actor_id: callerId,
    action: "seller.access_created",
    resource: "seller",
    resource_id: sellerId,
    after: { email, role, authUserId: created.user.id },
  });

  log.info("seller access created", { sellerId, role });
  return json({ userId: created.user.id, sellerId, email, role }, 200);
});
