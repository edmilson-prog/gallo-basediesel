import "jsr:@supabase/functions-js/edge-runtime.d.ts";

/**
 * set-seller-role (PRD-107 Fase 3 + custom role assignment) — assigns a role to
 * a seller, server-side, with the service_role key.
 *
 * The role drives RLS (is_staff / carteira isolation), so changing it is a
 * privileged action: owner-only. The caller picks a role from the catalog (a
 * `roles.id` — system, e.g. "Vendedor"/"SDR", or custom, e.g. "role-<uuid>").
 * The function resolves that role's `base_role`, writes the matching DB role into
 * `profiles.role` (so RLS stays governed by the base role) and pins the effective
 * role into `profiles.role_id` (NULL for system roles — the base role already
 * resolves them; the custom id only for custom roles). Both land in the target's
 * session on their next token refresh (the custom access token hook reads
 * profiles.role).
 *
 * sellers.type is kept in sync for the two seller roles (internal/external);
 * other base roles keep the underlying business type as-is.
 *
 * Guards: caller must be the Owner; nobody may change their own role, change an
 * Owner's role, assign the Owner role, or target a seller / role outside their
 * store.
 *
 * Shared lifecycle/auth/error patterns: supabase/functions/_shared (PRD-102).
 */

import { bestEffortAudit } from "../_shared/audit.ts";
import { requireCaller } from "../_shared/auth.ts";
import { HttpError, json, parseJsonBody } from "../_shared/http.ts";
import { servePost } from "../_shared/serve.ts";

// roles.base_role uses the frontend RoleName vocabulary; profiles.role / RLS use
// the DB role vocabulary. This is the inverse of the frontend roleMap.ts.
const DB_ROLE_BY_BASE_ROLE: Record<string, string> = {
  Owner: "owner",
  Gestor: "manager",
  Vendedor: "seller_internal",
  VendedorExterno: "seller_external",
  SDR: "sdr",
  Financeiro: "financeiro",
  Cliente: "b2c_customer",
};

// profiles.role -> sellers.type sync. Only the two seller business roles map to a
// concrete sellers.type (internal|external); everything else keeps the seller's
// existing type (null = no type change).
const TYPE_BY_DB_ROLE: Record<string, string | null> = {
  seller_internal: "internal",
  seller_external: "external",
};

servePost(async (req, { log }) => {
  // 1) Identify the caller — changing roles is privilege-sensitive: owner-only.
  const { callerId, admin, profile } = await requireCaller(req, ["owner"]);

  // 2) Parse + validate the input.
  const body = await parseJsonBody(req);
  const sellerId = String(body.sellerId ?? "");
  const roleId = String(body.roleId ?? "");
  if (!sellerId || !roleId) throw new HttpError(400, "missing sellerId or roleId");

  // 3) Resolve the chosen role (system or custom) from the catalog.
  const { data: role } = await admin
    .from("roles")
    .select("id, base_role, is_system, is_owner_immutable, store_id")
    .eq("id", roleId)
    .maybeSingle();
  if (!role) throw new HttpError(404, "role not found");
  if (role.is_owner_immutable) throw new HttpError(403, "this role cannot be assigned");
  if (role.store_id && role.store_id !== profile.store_id) {
    throw new HttpError(403, "role belongs to another store");
  }

  const dbRole = DB_ROLE_BY_BASE_ROLE[role.base_role as string];
  if (!dbRole) throw new HttpError(400, `unsupported base role: ${role.base_role}`);
  if (dbRole === "owner") throw new HttpError(403, "cannot assign the owner role");
  // Customer-base roles are not platform access for staff — assigning one would
  // turn a seller into a customer and brick their access. The dialog already
  // filters these out; the Edge is the trust boundary, so enforce it. (Cliente
  // is the only customer base role, mapping to b2c_customer.)
  if (dbRole === "b2c_customer") {
    throw new HttpError(403, "cannot assign a customer role to a seller");
  }

  // 4) Resolve the target seller's access profile (within the caller's store).
  const { data: target } = await admin
    .from("profiles")
    .select("auth_user_id, role, role_id, store_id")
    .eq("seller_id", sellerId)
    .maybeSingle();
  if (!target || target.store_id !== profile.store_id) {
    throw new HttpError(404, "seller has no access in your store");
  }

  // 5) Guards: never change your own role, nor an Owner's.
  if (target.auth_user_id === callerId) {
    throw new HttpError(403, "you cannot change your own role");
  }
  if (target.role === "owner") {
    throw new HttpError(403, "an owner's role cannot be changed");
  }

  // 6) Update the access role. System roles need no override (the base role
  // resolves them); only custom roles pin role_id.
  const nextRoleId = role.is_system ? null : (role.id as string);
  const { error: roleErr } = await admin
    .from("profiles")
    .update({ role: dbRole, role_id: nextRoleId })
    .eq("seller_id", sellerId);
  if (roleErr) {
    throw new HttpError(400, `could not update role: ${roleErr.message}`);
  }

  // 7) Keep the business type in sync for the two seller roles.
  const nextType = TYPE_BY_DB_ROLE[dbRole];
  if (nextType) {
    const { error: typeErr } = await admin
      .from("sellers")
      .update({ type: nextType, updated_at: new Date().toISOString() })
      .eq("id", sellerId);
    if (typeErr) {
      throw new HttpError(400, `role updated but type sync failed: ${typeErr.message}`);
    }
  }

  // 8) Audit — best-effort. actor_id is an FK to sellers(id), so skip the audit
  // when the caller has no linked seller rather than write the caller's
  // auth.users id (which would just violate the FK and be dropped).
  if (profile.seller_id) {
    await bestEffortAudit(admin, {
      store_id: profile.store_id,
      actor_id: profile.seller_id,
      action: "seller.role_changed",
      resource: "seller",
      resource_id: sellerId,
      before: { role: target.role, role_id: target.role_id ?? null },
      after: { role: dbRole, role_id: nextRoleId, assigned_role: roleId },
    });
  }

  log.info("seller role changed", { sellerId, roleId, dbRole });
  return json({ sellerId, roleId, role: dbRole, roleIdPinned: nextRoleId }, 200);
});
