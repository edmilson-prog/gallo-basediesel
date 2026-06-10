import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.107.0";

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
  const password = String(body.password ?? "");
  if (!sellerId || !password) {
    return json({ error: "missing sellerId or password" }, 400);
  }
  if (password.length < 8) return json({ error: "password must be at least 8 characters" }, 400);

  // 4) Resolve the target seller's access profile (within the caller's store).
  const { data: target } = await admin
    .from("profiles")
    .select("auth_user_id, role, store_id")
    .eq("seller_id", sellerId)
    .maybeSingle();
  if (!target || target.store_id !== callerProfile.store_id) {
    return json({ error: "seller has no access in your store" }, 404);
  }

  // 5) Guards: never reset your own password here; only an Owner resets an Owner.
  if (target.auth_user_id === caller.id) {
    return json({ error: "you cannot reset your own password here" }, 403);
  }
  if (target.role === "owner" && callerProfile.role !== "owner") {
    return json({ error: "only an owner can reset another owner's password" }, 403);
  }

  // 6) Apply the new password (works even while the user is banned).
  const { error: updErr } = await admin.auth.admin.updateUserById(target.auth_user_id, {
    password,
  });
  if (updErr) {
    return json({ error: `could not update auth user: ${updErr.message}` }, 400);
  }

  // 7) Audit — best-effort.
  try {
    await admin.from("audit_logs").insert({
      store_id: callerProfile.store_id,
      actor_id: caller.id,
      action: "seller.password_reset",
      resource: "seller",
      resource_id: sellerId,
    });
  } catch (_) {
    // ignore audit failures
  }

  return json({ sellerId }, 200);
});
