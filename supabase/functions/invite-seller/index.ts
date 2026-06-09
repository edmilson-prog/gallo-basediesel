import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.107.0";

/**
 * invite-seller (PRD-107 Fase 3) — creates platform access for an existing
 * seller, server-side, so the service_role key never reaches the browser.
 *
 * Flow: the Owner triggers this from /app/configuracoes/usuarios. The function
 *  1. identifies the caller from their JWT,
 *  2. verifies the caller is staff (owner/manager) — defence in depth on top of
 *     the gateway's verify_jwt,
 *  3. validates the target seller belongs to the caller's store and has no
 *     access yet,
 *  4. creates the auth user (email pre-confirmed — email-invite via Resend is
 *     deferred to PRD-141),
 *  5. links a `profiles` row (auth_user_id → seller, store, role), rolling back
 *     the auth user if the link fails (no orphans),
 *  6. writes a best-effort audit log.
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
const ALLOWED_ROLES = ["seller_internal", "seller_external", "manager"];

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

  // 1) Identify the caller from their JWT.
  const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: callerData, error: callerErr } = await callerClient.auth.getUser();
  if (callerErr || !callerData?.user) return json({ error: "invalid session" }, 401);
  const caller = callerData.user;

  // 2) Verify the caller is staff. Service role bypasses RLS for the lookups.
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
  const email = String(body.email ?? "")
    .trim()
    .toLowerCase();
  const password = String(body.password ?? "");
  const role = String(body.role ?? "");
  if (!sellerId || !email || !password) {
    return json({ error: "missing sellerId, email or password" }, 400);
  }
  if (password.length < 8) return json({ error: "password must be at least 8 characters" }, 400);
  if (!ALLOWED_ROLES.includes(role)) return json({ error: "invalid role" }, 400);

  // 4) The target seller must belong to the caller's store.
  const { data: seller } = await admin
    .from("sellers")
    .select("id, store_id, full_name")
    .eq("id", sellerId)
    .maybeSingle();
  if (!seller || seller.store_id !== callerProfile.store_id) {
    return json({ error: "seller not found in your store" }, 400);
  }

  // 5) Refuse if this seller already has an access profile.
  const { data: existing } = await admin
    .from("profiles")
    .select("auth_user_id")
    .eq("seller_id", sellerId)
    .maybeSingle();
  if (existing) return json({ error: "this seller already has platform access" }, 409);

  // 6) Create the auth user (email pre-confirmed).
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createErr || !created?.user) {
    return json({ error: `could not create user: ${createErr?.message ?? "unknown error"}` }, 400);
  }

  // 7) Link the profile; roll back the auth user on failure (no orphans).
  const { error: profErr } = await admin.from("profiles").insert({
    auth_user_id: created.user.id,
    seller_id: sellerId,
    store_id: callerProfile.store_id,
    role,
    display_name: seller.full_name,
    email,
  });
  if (profErr) {
    await admin.auth.admin.deleteUser(created.user.id);
    return json({ error: `could not link profile: ${profErr.message}` }, 400);
  }

  // 8) Audit — best-effort, never fails the request.
  try {
    await admin.from("audit_logs").insert({
      store_id: callerProfile.store_id,
      actor_id: caller.id,
      action: "seller.access_created",
      resource: "seller",
      resource_id: sellerId,
      after: { email, role, authUserId: created.user.id },
    });
  } catch (_) {
    // ignore audit failures
  }

  return json({ userId: created.user.id, sellerId, email, role }, 200);
});
