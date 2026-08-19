import "jsr:@supabase/functions-js/edge-runtime.d.ts";

/**
 * quote-send-email — sends a saved quote to the customer by e-mail.
 *
 * INERT until `RESEND_API_KEY` is set: without it the function runs its guards,
 * sends nothing and answers `{ sent: false, reason: "missing_key" }`, so the UI
 * can tell the seller the channel is off instead of claiming a delivery that
 * never happened.
 *
 * Authorization is RLS, not a role list: the quote is read with the CALLER's
 * client, so whoever cannot read the quote cannot mail it. The body is built
 * server-side from the persisted row — the client never supplies HTML.
 *
 * Secrets (Owner-controlled, Configurações → Integrações & Chaves; Vault-first
 * with env fallback):
 *  - RESEND_API_KEY   Resend API key
 *  - RESEND_FROM      verified sender, e.g. "GALLO <nao-responda@dominio>"
 *
 * Input:  { quoteId: string, to?: string }
 * Output: { sent: boolean, to?: string, reason?: string }
 */

import { bestEffortAudit } from "../_shared/audit.ts";
import { requireAnyCaller } from "../_shared/auth.ts";
import { HttpError, json, parseJsonBody } from "../_shared/http.ts";
import { createSecretResolver } from "../_shared/secrets.ts";
import { servePost } from "../_shared/serve.ts";
import {
  buildQuoteEmailHtml,
  buildQuoteEmailSubject,
  buildQuoteEmailText,
  type IQuoteMessageItem,
} from "../_shared/quotes/quoteMessage.ts";

/** Very small sanity check — the provider rejects the rest. */
function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

async function sendViaResend(params: {
  apiKey: string;
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
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
      text: params.text,
    }),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Resend responded ${res.status}: ${detail}`);
  }
}

servePost(async (req, { log }) => {
  // Any authenticated profile; what they may send is decided by RLS below.
  const { admin, callerClient, profile } = await requireAnyCaller(req);

  const body = await parseJsonBody(req);
  const quoteId = String(body.quoteId ?? "");
  const explicitTo = String(body.to ?? "").trim();
  const message = String(body.message ?? "").trim();
  if (!quoteId) throw new HttpError(400, "missing quoteId");

  // Read through the caller's client: RLS is the authorization.
  const { data: quote, error: quoteError } = await callerClient
    .from("quotes")
    .select(
      "id, store_id, number, customer_id, subtotal, discount, shipping, total, valid_until, status",
    )
    .eq("id", quoteId)
    .maybeSingle();
  if (quoteError) throw new HttpError(403, `cannot read quote: ${quoteError.message}`);
  if (!quote) throw new HttpError(404, "quote not found");

  const { data: itemRows, error: itemsError } = await callerClient
    .from("quote_items")
    .select("part_name, quantity, total")
    .eq("quote_id", quoteId);
  if (itemsError) throw new HttpError(403, `cannot read quote items: ${itemsError.message}`);

  const items: IQuoteMessageItem[] = (itemRows ?? []).map((row) => ({
    partName: String(row.part_name ?? ""),
    quantity: Number(row.quantity ?? 0),
    total: Number(row.total ?? 0),
  }));

  // Recipient: whoever the caller named, else the customer on file.
  let to = explicitTo;
  let customerName: string | undefined;
  if (quote.customer_id) {
    const { data: customer } = await callerClient
      .from("customers")
      .select("email, nome_fantasia, razao_social, full_name")
      .eq("id", quote.customer_id)
      .maybeSingle();
    if (customer) {
      customerName =
        customer.nome_fantasia || customer.razao_social || customer.full_name || undefined;
      if (!to) to = String(customer.email ?? "").trim();
    }
  }
  if (!to) throw new HttpError(400, "no recipient e-mail: pass `to` or set one on the customer");
  if (!looksLikeEmail(to)) throw new HttpError(400, "invalid recipient e-mail");

  const { data: store } = await admin
    .from("stores")
    .select("name")
    .eq("id", quote.store_id)
    .maybeSingle();

  const message = {
    number: String(quote.number ?? ""),
    customerName,
    storeName: store?.name ?? undefined,
    items,
    subtotal: Number(quote.subtotal ?? 0),
    discount: Number(quote.discount ?? 0),
    shipping: Number(quote.shipping ?? 0),
    total: Number(quote.total ?? 0),
    validUntil: String(quote.valid_until ?? ""),
    ...(message ? { message } : {}),
  };

  const resolveSecret = createSecretResolver(admin);
  const RESEND_API_KEY = await resolveSecret("RESEND_API_KEY");
  const RESEND_FROM = (await resolveSecret("RESEND_FROM")) ?? "GALLO <onboarding@resend.dev>";

  if (!RESEND_API_KEY) {
    log("quote-send-email inert: RESEND_API_KEY not set");
    return json({
      sent: false,
      reason: "missing_key",
      note: "Configure RESEND_API_KEY em Integrações & Chaves para ativar o envio por e-mail.",
    });
  }

  await sendViaResend({
    apiKey: RESEND_API_KEY,
    from: RESEND_FROM,
    to,
    subject: buildQuoteEmailSubject(message),
    html: buildQuoteEmailHtml(message),
    text: buildQuoteEmailText(message),
  });

  await bestEffortAudit(admin, {
    store_id: profile.store_id,
    actor_id: profile.seller_id,
    action: "quote.email_sent",
    resource: "quote",
    resource_id: quoteId,
    after: { to, number: message.number },
  });

  return json({ sent: true, to });
});
