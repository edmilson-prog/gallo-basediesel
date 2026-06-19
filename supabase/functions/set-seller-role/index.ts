import "jsr:@supabase/functions-js/edge-runtime.d.ts";

/**
 * set-seller-role (PRD-107 Fase 3) — changes a seller's platform access role
 * (profiles.role), server-side, with the service_role key.
 *
 * The role drives RLS (is_staff / carteira isolation), so changing it is a
 * privileged action: owner-only. The new role lands in the target's JWT on
 * their next token refresh (the custom access token hook reads profiles.role).
 *
 * sellers.type is kept in sync for the two seller roles (internal/external);
 * promoting to manager keeps the underlying business type as-is.
 *
 * Guards: caller must be the Owner; nobody may change their own role, change an
 * Owner's role, or target a seller outside their store / without access.
 *
 * Shared lifecycle/auth/error patterns: supabase/functions/_shared (PRD-102).
 */

import { bestEffortAudit } from "../_shared/audit.ts";
import { requireCaller } from "../_shared/auth.ts";
import { HttpError, json, parseJsonBody } from "../_shared/http.ts";
import { servePost } from "../_shared/serve.ts";

const ALLOWED_ROLES = ["seller_internal", "seller_external", "manager", "sdr", "financeiro"];
// profiles.role -> sellers.type. manager/sdr/financeiro are not seller business
// types (sellers.type is internal|external|representative), so they keep whatever
// type the seller already had (null = no type change).
const TYPE_BY_ROLE: Record<string, string | null> = {
  seller_internal: "internal",
  seller_external: "external",
  manager: null,
  sdr: null,
  financeiro: null,
};

servePost(async (req, { log }) => {
  // 1) Identify the caller — changing roles is privilege-sensitive: owner-only.
  const { callerId, admin, profile } = await requireCaller(req, ["owner"]);

  // 2) Parse + validate the input.
  const body = await parseJsonBody(req);
  const sellerId = String(body.sellerId ?? "");
  const role = String(body.role ?? "");
  if (!sellerId || !role) throw new HttpError(400, "missing sellerId or role");
  if (!ALLOWED_ROLES.includes(role)) throw new HttpError(400, "invalid role");

  // 3) Resolve the target seller's access profile (within the caller's store).
  const { data: target } = await admin
    .from("profiles")
    .select("auth_user_id, role, store_id")
    .eq("seller_id", sellerId)
    .maybeSingle();
  if (!target || target.store_id !== profile.store_id) {
    throw new HttpError(404, "seller has no access in your store");
  }

  // 4) Guards: never change your own role, nor an Owner's.
  if (target.auth_user_id === callerId) {
    throw new HttpError(403, "you cannot change your own role");
  }
  if (target.role === "owner") {
    throw new HttpError(403, "an owner's role cannot be changed");
  }

  // 5) Update the access role.
  const { error: roleErr } = await admin.from("profiles").update({ role }).eq("seller_id", sellerId);
  if (roleErr) {
    throw new HttpError(400, `could not update role: ${roleErr.message}`);
  }

  // 6) Keep the business type in sync (skipped for manager).
  const nextType = TYPE_BY_ROLE[role];
  if (nextType) {
    const { error: typeErr } = await admin
      .from("sellers")
      .update({ type: nextType, updated_at: new Date().toISOString() })
      .eq("id", sellerId);
    if (typeErr) {
      throw new HttpError(400, `role updated but type sync failed: ${typeErr.message}`);
    }
  }

  // 7) Audit — best-effort.
  await bestEffortAudit(admin, {
    store_id: profile.store_id,
    actor_id: callerId,
    action: "seller.role_changed",
    resource: "seller",
    resource_id: sellerId,
    before: { role: target.role },
    after: { role },
  });

  log.info("seller role changed", { sellerId, role });
  return json({ sellerId, role }, 200);
});
