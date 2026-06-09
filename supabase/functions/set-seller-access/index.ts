import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.107.0";

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
 */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const STAFF_ROLES = ["owner", "manager"];
// ~100 years — effectively permanent until an explicit reactivate ("none").
const BAN_DURATION = "876600h";

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

  // 2) Caller must be staff.
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
  const { data: callerProfile } = await admin
    .from("profiles")
    .select("role, store_id")
    .eq("auth_user_id", caller.id)
    .maybeSingle();
  if (!callerProfile || !STAFF_ROLES.includes(callerProfile.role)) {
    return json({ error: "forbidden: requires owner or manager" }, 403);
  }

  // 3) Parse + validate the input.
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid json body" }, 400);
  }
  const sellerId = String(body.sellerId ?? "");
  if (!sellerId || typeof body.active !== "boolean") {
    return json({ error: "missing sellerId or active flag" }, 400);
  }
  const active = body.active as boolean;

  // 4) Resolve the target seller's access profile (within the caller's store).
  const { data: target } = await admin
    .from("profiles")
    .select("auth_user_id, role, store_id")
    .eq("seller_id", sellerId)
    .maybeSingle();
  if (!target || target.store_id !== callerProfile.store_id) {
    return json({ error: "seller has no access in your store" }, 404);
  }

  // 5) Guards: never touch your own access; never deactivate an Owner.
  if (target.auth_user_id === caller.id) {
    return json({ error: "you cannot change your own access" }, 403);
  }
  if (!active && target.role === "owner") {
    return json({ error: "owners cannot be deactivated" }, 403);
  }

  // 6) Ban / un-ban the auth user.
  const { error: banErr } = await admin.auth.admin.updateUserById(target.auth_user_id, {
    ban_duration: active ? "none" : BAN_DURATION,
  });
  if (banErr) {
    return json({ error: `could not update auth user: ${banErr.message}` }, 400);
  }

  // 7) Flip the business flag.
  const { error: sellerErr } = await admin
    .from("sellers")
    .update({ active, updated_at: new Date().toISOString() })
    .eq("id", sellerId);
  if (sellerErr) {
    return json({ error: `could not update seller: ${sellerErr.message}` }, 400);
  }

  // 8) Audit — best-effort.
  try {
    await admin.from("audit_logs").insert({
      store_id: callerProfile.store_id,
      actor_id: caller.id,
      action: active ? "seller.access_reactivated" : "seller.access_deactivated",
      resource: "seller",
      resource_id: sellerId,
      after: { active },
    });
  } catch (_) {
    // ignore audit failures
  }

  return json({ sellerId, active }, 200);
});
