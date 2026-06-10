import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.107.0";

/**
 * invite-seller-email (PRD-141) — SCAFFOLD.
 *
 * Email-based seller invitation: instead of handing the Owner a temporary
 * password (see `invite-seller`), this creates the user via an invite action
 * link and emails it through Resend so the seller sets their own password.
 *
 * It is INERT until `RESEND_API_KEY` is set:
 *  - WITHOUT the key  -> runs the guards, returns { scaffold: true, ... } and
 *    performs ZERO mutations (no user, no profile, no email). Safe "off" state.
 *  - WITH the key      -> generates an invite link (creates the auth user),
 *    links the profile (rolling back the user on failure), sends a branded
 *    pt-BR email via Resend, and writes a best-effort audit log.
 *
 * Wiring left as follow-up (not part of this scaffold):
 *  - client `inviteSellerByEmail` in src/features/admin-settings/api/sellerAccess.ts
 *  - a dialog in the Usuários page
 *  - the `/auth/definir-senha` route the invite link redirects to
 *
 * Secrets to set when activating (Owner-controlled):
 *  - RESEND_API_KEY      Resend API key
 *  - RESEND_FROM         verified sender, e.g. "GALLO <nao-responda@seu-dominio>"
 *  - INVITE_REDIRECT_URL where the invite link lands (the set-password page)
 */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

// Optional — their absence is what keeps this function inert.
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const RESEND_FROM = Deno.env.get("RESEND_FROM") ?? "GALLO <onboarding@resend.dev>";
const INVITE_REDIRECT_URL = Deno.env.get("INVITE_REDIRECT_URL") ?? "";

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

/** Branded pt-BR invite email. `actionLink` is the Supabase invite action link. */
function inviteEmailHtml(params: { sellerName: string; actionLink: string }): string {
  const { sellerName, actionLink } = params;
  return `<!doctype html>
<html lang="pt-BR">
  <body style="margin:0;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 0;">
      <tr><td align="center">
        <table role="presentation" width="520" cellpadding="0" cellspacing="0"
               style="background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;">
          <tr><td style="background:#15803d;padding:24px 32px;">
            <span style="color:#ffffff;font-size:20px;font-weight:bold;letter-spacing:0.5px;">GALLO BASE DIESEL</span>
          </td></tr>
          <tr><td style="padding:32px;">
            <h1 style="margin:0 0 16px;font-size:20px;">Olá, ${sellerName}!</h1>
            <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">
              Você foi convidado para acessar a plataforma <strong>GALLO BASE DIESEL</strong>.
              Clique no botão abaixo para definir sua senha e ativar seu acesso.
            </p>
            <table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">
              <tr><td style="border-radius:8px;background:#15803d;">
                <a href="${actionLink}"
                   style="display:inline-block;padding:14px 28px;color:#ffffff;font-size:15px;
                          font-weight:bold;text-decoration:none;border-radius:8px;">
                  Definir minha senha
                </a>
              </td></tr>
            </table>
            <p style="margin:0 0 8px;font-size:13px;color:#64748b;line-height:1.6;">
              Se o botão não funcionar, copie e cole este endereço no navegador:
            </p>
            <p style="margin:0;font-size:12px;color:#15803d;word-break:break-all;">${actionLink}</p>
            <hr style="border:none;border-top:1px solid #e2e8f0;margin:28px 0;" />
            <p style="margin:0;font-size:12px;color:#94a3b8;line-height:1.6;">
              Você recebeu este email porque um administrador criou um acesso para você.
              Se não esperava por isso, pode ignorar com segurança.
            </p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

/** POSTs a single email through the Resend API. Throws on a non-2xx response. */
async function sendViaResend(params: { to: string; subject: string; html: string }): Promise<void> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: RESEND_FROM,
      to: [params.to],
      subject: params.subject,
      html: params.html,
    }),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Resend responded ${res.status}: ${detail}`);
  }
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

  // 3) Parse + validate the input (no password — the seller sets their own).
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
  const role = String(body.role ?? "");
  if (!sellerId || !email) return json({ error: "missing sellerId or email" }, 400);
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

  // 6) INERT MODE — no Resend key configured. Run the guards, preview the email,
  //    mutate nothing. This is the default "off" state for the scaffold.
  if (!RESEND_API_KEY) {
    return json(
      {
        scaffold: true,
        note: "RESEND_API_KEY not set — invite email not sent and no user created. Set the secret to activate.",
        wouldEmail: email,
        emailPreviewHtml: inviteEmailHtml({
          sellerName: seller.full_name,
          actionLink: "https://<invite-link-generated-on-activation>",
        }),
      },
      200,
    );
  }

  // 7) ACTIVE MODE — generate the invite link (this creates the auth user).
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: "invite",
    email,
    options: INVITE_REDIRECT_URL ? { redirectTo: INVITE_REDIRECT_URL } : undefined,
  });
  if (linkErr || !linkData?.user || !linkData.properties?.action_link) {
    return json({ error: `could not create invite: ${linkErr?.message ?? "unknown error"}` }, 400);
  }
  const newUserId = linkData.user.id;
  const actionLink = linkData.properties.action_link;

  // 8) Link the profile; roll back the auth user on failure (no orphans).
  const { error: profErr } = await admin.from("profiles").insert({
    auth_user_id: newUserId,
    seller_id: sellerId,
    store_id: callerProfile.store_id,
    role,
    display_name: seller.full_name,
    email,
  });
  if (profErr) {
    await admin.auth.admin.deleteUser(newUserId);
    return json({ error: `could not link profile: ${profErr.message}` }, 400);
  }

  // 9) Send the branded invite email. Roll back on failure (no half-invited user).
  try {
    await sendViaResend({
      to: email,
      subject: "Seu acesso à plataforma GALLO BASE DIESEL",
      html: inviteEmailHtml({ sellerName: seller.full_name, actionLink }),
    });
  } catch (sendErr) {
    await admin.from("profiles").delete().eq("auth_user_id", newUserId);
    await admin.auth.admin.deleteUser(newUserId);
    const msg = sendErr instanceof Error ? sendErr.message : "unknown error";
    return json({ error: `could not send invite email: ${msg}` }, 502);
  }

  // 10) Audit — best-effort, never fails the request.
  try {
    await admin.from("audit_logs").insert({
      store_id: callerProfile.store_id,
      actor_id: caller.id,
      action: "seller.invited_email",
      resource: "seller",
      resource_id: sellerId,
      after: { email, role, authUserId: newUserId },
    });
  } catch (_) {
    // ignore audit failures
  }

  return json({ sent: true, userId: newUserId, sellerId, email, role }, 200);
});
