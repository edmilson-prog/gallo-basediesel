import "jsr:@supabase/functions-js/edge-runtime.d.ts";

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
 * Secrets to set when activating (Owner-controlled — managed from the
 * platform at Configurações → Integrações & Chaves, Vault-first with env
 * secret fallback):
 *  - RESEND_API_KEY      Resend API key
 *  - RESEND_FROM         verified sender, e.g. "GALLO <nao-responda@seu-dominio>"
 *  - INVITE_REDIRECT_URL where the invite link lands (/auth/definir-senha)
 *
 * Shared lifecycle/auth/error patterns: supabase/functions/_shared (PRD-102).
 */

import { bestEffortAudit } from "../_shared/audit.ts";
import { requireCaller, STAFF_ROLES } from "../_shared/auth.ts";
import { HttpError, json, parseJsonBody } from "../_shared/http.ts";
import { createSecretResolver } from "../_shared/secrets.ts";
import { servePost } from "../_shared/serve.ts";

const ALLOWED_ROLES = ["seller_internal", "seller_external", "manager"];

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
async function sendViaResend(params: {
  apiKey: string;
  from: string;
  to: string;
  subject: string;
  html: string;
}): Promise<void> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: params.from,
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

servePost(async (req, { log }) => {
  // 1) Identify the caller and require staff.
  const { callerId, admin, profile } = await requireCaller(req, STAFF_ROLES);

  // Resend settings: Vault-first (Integrações & Chaves), env fallback.
  // Their absence is what keeps this function inert.
  const resolveSecret = createSecretResolver(admin);
  const RESEND_API_KEY = await resolveSecret("RESEND_API_KEY");
  const RESEND_FROM = (await resolveSecret("RESEND_FROM")) ?? "GALLO <onboarding@resend.dev>";
  const INVITE_REDIRECT_URL = await resolveSecret("INVITE_REDIRECT_URL");

  // 2) Parse + validate the input (no password — the seller sets their own).
  const body = await parseJsonBody(req);
  const sellerId = String(body.sellerId ?? "");
  const email = String(body.email ?? "")
    .trim()
    .toLowerCase();
  const role = String(body.role ?? "");
  if (!sellerId || !email) throw new HttpError(400, "missing sellerId or email");
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

  // 5) INERT MODE — no Resend key configured. Run the guards, preview the email,
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

  // 6) ACTIVE MODE — generate the invite link (this creates the auth user).
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: "invite",
    email,
    options: INVITE_REDIRECT_URL ? { redirectTo: INVITE_REDIRECT_URL } : undefined,
  });
  if (linkErr || !linkData?.user || !linkData.properties?.action_link) {
    throw new HttpError(400, `could not create invite: ${linkErr?.message ?? "unknown error"}`);
  }
  const newUserId = linkData.user.id;
  const actionLink = linkData.properties.action_link;

  // 7) Link the profile; roll back the auth user on failure (no orphans).
  const { error: profErr } = await admin.from("profiles").insert({
    auth_user_id: newUserId,
    seller_id: sellerId,
    store_id: profile.store_id,
    role,
    display_name: seller.full_name,
    email,
  });
  if (profErr) {
    await admin.auth.admin.deleteUser(newUserId);
    throw new HttpError(400, `could not link profile: ${profErr.message}`);
  }

  // 8) Send the branded invite email. Roll back on failure (no half-invited user).
  try {
    await sendViaResend({
      apiKey: RESEND_API_KEY,
      from: RESEND_FROM,
      to: email,
      subject: "Seu acesso à plataforma GALLO BASE DIESEL",
      html: inviteEmailHtml({ sellerName: seller.full_name, actionLink }),
    });
  } catch (sendErr) {
    await admin.from("profiles").delete().eq("auth_user_id", newUserId);
    await admin.auth.admin.deleteUser(newUserId);
    const msg = sendErr instanceof Error ? sendErr.message : "unknown error";
    throw new HttpError(502, `could not send invite email: ${msg}`);
  }

  // 9) Audit — best-effort, never fails the request.
  await bestEffortAudit(admin, {
    store_id: profile.store_id,
    actor_id: callerId,
    action: "seller.invited_email",
    resource: "seller",
    resource_id: sellerId,
    after: { email, role, authUserId: newUserId },
  });

  log.info("seller invited by email", { sellerId, role });
  return json({ sent: true, userId: newUserId, sellerId, email, role }, 200);
});
