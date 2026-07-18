/**
 * Dispatches the SDR's reply to the customer. Two isolated pipelines exist in
 * this codebase for outbound WhatsApp sends:
 *
 *  - Legacy (meta / evolution / evolution-go / openwa): `processSendRequest`,
 *    the same core `scheduled-send-worker` already uses without a logged-in
 *    user (buildSystemSender + service_role).
 *  - WAHA: `waha-send/index.ts` is deliberately "FULLY ISOLATED" and requires
 *    a real user JWT — it is NOT called here. Instead this module imports the
 *    same low-level send functions (`sendWahaText`) directly and persists the
 *    message row itself, exactly mirroring what `waha-send/index.ts` does
 *    internally, without touching that file.
 */
import { type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.107.0";
import { createSecretResolver } from "../_shared/secrets.ts";
import { makeSendDb, makeEngineDeps } from "../_shared/whatsappSendAdapter.ts";
import { buildWhatsAppEngine } from "../_shared/whatsapp/build.ts";
import {
  processSendRequest,
  type ISendRequest,
  type ISender,
} from "../_shared/whatsapp/send/core.ts";
import { sendWahaText } from "../_shared/whatsapp/waha/send.ts";
import { HttpError } from "../_shared/http.ts";

interface IConversationAccountRow {
  whatsapp_account_id: string | null;
  customers: { phone: string | null } | null;
}

async function dispatchWaha(
  admin: SupabaseClient,
  conversationId: string,
  accountId: string,
  text: string,
): Promise<{ messageId: string }> {
  const { data: account } = await admin
    .from("whatsapp_accounts")
    .select("id, provider_config, waha_server_id")
    .eq("id", accountId)
    .maybeSingle();
  if (!account) throw new HttpError(422, "conta WAHA não encontrada");
  const sessionName = String(
    (account.provider_config as Record<string, unknown> | null)?.sessionName ?? "",
  );
  if (!sessionName) throw new HttpError(422, "sessão WAHA sem sessionName configurado");

  const { data: server } = await admin
    .from("waha_servers")
    .select("base_url, api_key_ref")
    .eq("id", account.waha_server_id as string)
    .maybeSingle();
  if (!server) throw new HttpError(422, "servidor WAHA não encontrado");
  const baseUrl = String(server.base_url ?? "").replace(/\/+$/, "");
  const apiKey = await createSecretResolver(admin)(String(server.api_key_ref ?? ""));
  if (!apiKey) throw new HttpError(422, "chave de API do servidor WAHA não definida");

  const { data: convRow } = await admin
    .from("conversations")
    .select("customers(phone)")
    .eq("id", conversationId)
    .maybeSingle<IConversationAccountRow>();
  const toPhone = convRow?.customers?.phone;
  if (!toPhone) throw new HttpError(422, "cliente sem telefone cadastrado");

  const messageId = crypto.randomUUID();
  const { error: insertErr } = await admin.from("messages").insert({
    id: messageId,
    conversation_id: conversationId,
    direction: "out",
    author_type: "sdr",
    author_id: null,
    provider: "waha",
    text,
    status: "queued",
    sent_at: new Date().toISOString(),
  });
  if (insertErr) throw new HttpError(500, `falha ao registrar a mensagem: ${insertErr.message}`);

  try {
    const result = await sendWahaText(apiKey, globalThis.fetch, { baseUrl, sessionName }, {
      toPhone,
      text,
    });
    await admin
      .from("messages")
      .update({ status: "sent", provider_message_id: result.providerMessageId })
      .eq("id", messageId);
    await admin
      .from("conversations")
      .update({ last_message_at: new Date().toISOString() })
      .eq("id", conversationId);
    return { messageId };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    await admin.from("messages").update({ status: "failed", failure_reason: reason }).eq("id", messageId);
    throw err;
  }
}

async function dispatchLegacy(
  admin: SupabaseClient,
  traceId: string,
  conversationId: string,
  storeId: string,
  text: string,
): Promise<{ messageId: string }> {
  const db = makeSendDb(admin, traceId);
  const deps = makeEngineDeps(admin, traceId);
  const request: ISendRequest = { conversationId, kind: "text", text };
  // role: "owner" — identical to buildSystemSender's shape, so the
  // permission check's isStaff bypass keeps working exactly as before.
  // isAutomatedSdr: true is the DEDICATED signal that lets
  // processSendRequest's insertQueuedMessage persist messages.author_type =
  // "sdr" instead of "seller", so the SDR's own reply never satisfies the
  // sdr_pause_on_human_message trigger (author_type = 'seller' only). This is
  // deliberately NOT derived from role — "sdr" is itself a real
  // profiles.role value for human SDR staff, so branching on role would
  // misclassify their genuine sends as bot sends too.
  const sender: ISender = { sellerId: null, role: "owner", storeId, isAutomatedSdr: true };
  const result = await processSendRequest({
    input: request,
    sender,
    db,
    buildProvider: (account) =>
      buildWhatsAppEngine({
        engine: account.provider,
        accountId: account.id,
        providerConfig: account.providerConfig,
        credentialsRef: account.credentialsRef,
        deps,
      }),
    traceId,
  });
  return { messageId: result.messageId };
}

/** Dispatches the SDR's reply, branching on the conversation's account provider. */
export async function dispatchSdrReply(
  admin: SupabaseClient,
  traceId: string,
  conversationId: string,
  storeId: string,
  text: string,
): Promise<{ messageId: string }> {
  const { data: conv } = await admin
    .from("conversations")
    .select("whatsapp_account_id")
    .eq("id", conversationId)
    .maybeSingle();
  const accountId = conv?.whatsapp_account_id as string | null;
  if (!accountId) throw new HttpError(422, "conversa sem conta WhatsApp associada");

  const { data: account } = await admin
    .from("whatsapp_accounts")
    .select("provider")
    .eq("id", accountId)
    .maybeSingle();
  if (!account) throw new HttpError(422, "conta WhatsApp não encontrada");

  if (account.provider === "waha") {
    return dispatchWaha(admin, conversationId, accountId, text);
  }
  return dispatchLegacy(admin, traceId, conversationId, storeId, text);
}
