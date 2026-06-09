import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.107.0";

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
 */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ALLOWED_ROLES = ["seller_internal", "seller_external", "manager"];
// profiles.role -> sellers.type. `manager` keeps whatever type the seller had.
const TYPE_BY_ROLE: Record<string, string | null> = {
  seller_internal: "internal",
  seller_external: "external",
  manager: null,
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "missing authorization" }, 401);

  // 1) Identify the caller.
  const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: callerData, error: callerErr } = await callerClient.auth.getUser();
  if (callerErr || !callerData?.user) return json({ error: "invalid session" }, 401);
  const caller = callerData.user;

  // 2) Caller must be the Owner (changing roles is privilege-sensitive).
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
  const { data: callerProfile } = await admin
    .from("profiles")
    .select("role, store_id")
    .eq("auth_user_id", caller.id)
    .maybeSingle();
  if (!callerProfile || callerProfile.role !== "owner") {
    return json({ error: "forbidden: requires owner" }, 403);
  }

  // 3) Parse + validate the input.
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid json body" }, 400);
  }
  const sellerId = String(body.sellerId ?? "");
  const role = String(body.role ?? "");
  if (!sellerId || !role) return json({ error: "missing sellerId or role" }, 400);
  if (!ALLOWED_ROLES.includes(role)) return json({ error: "invalid role" }, 400);

  // 4) Resolve the target seller's access profile (within the caller's store).
  const { data: target } = await admin
    .from("profiles")
    .select("auth_user_id, role, store_id")
    .eq("seller_id", sellerId)
    .maybeSingle();
  if (!target || target.store_id !== callerProfile.store_id) {
    return json({ error: "seller has no access in your store" }, 404);
  }

  // 5) Guards: never change your own role, nor an Owner's.
  if (target.auth_user_id === caller.id) {
    return json({ error: "you cannot change your own role" }, 403);
  }
  if (target.role === "owner") {
    return json({ error: "an owner's role cannot be changed" }, 403);
  }

  // 6) Update the access role.
  const { error: roleErr } = await admin
    .from("profiles")
    .update({ role })
    .eq("seller_id", sellerId);
  if (roleErr) {
    return json({ error: `could not update role: ${roleErr.message}` }, 400);
  }

  // 7) Keep the business type in sync (skipped for manager).
  const nextType = TYPE_BY_ROLE[role];
  if (nextType) {
    const { error: typeErr } = await admin
      .from("sellers")
      .update({ type: nextType, updated_at: new Date().toISOString() })
      .eq("id", sellerId);
    if (typeErr) {
      return json({ error: `role updated but type sync failed: ${typeErr.message}` }, 400);
    }
  }

  // 8) Audit — best-effort.
  try {
    await admin.from("audit_logs").insert({
      store_id: callerProfile.store_id,
      actor_id: caller.id,
      action: "seller.role_changed",
      resource: "seller",
      resource_id: sellerId,
      before: { role: target.role },
      after: { role },
    });
  } catch (_) {
    // ignore audit failures
  }

  return json({ sellerId, role }, 200);
});
