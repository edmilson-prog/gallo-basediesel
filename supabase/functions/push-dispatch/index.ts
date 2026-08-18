import "jsr:@supabase/functions-js/edge-runtime.d.ts";

/**
 * push-dispatch — turns one inbound message into a Web Push notification for
 * the attendant who owns that conversation (PRD-145, atendimento PWA slice).
 *
 * Called by a database trigger through `pg_net` (migration
 * 20260811160100_messages_push_trigger.sql), NOT by the browser: the WhatsApp
 * webhooks are already in production and this deliberately stays out of their
 * path, so a push failure can never delay or break message ingestion.
 *
 * Scope, on purpose: only the ASSIGNED seller is notified. A pool conversation
 * notifies nobody. Broadcasting to every staff member of a store is exactly the
 * shape of the SDR mass-dispatch incident, and it needs an explicit opt-in
 * before it ships — see docs/dev/notification-push.md.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.107.0";
import { requiredEnv } from "../_shared/env.ts";
import { HttpError, json } from "../_shared/http.ts";
import { servePost, type RequestContext } from "../_shared/serve.ts";
import { createSecretResolver } from "../_shared/secrets.ts";
import { verifyWorkerSecret } from "../_shared/workerAuth.ts";
import { sendWebPush, type IVapidKeys } from "../_shared/webpush.ts";
import { resolveRecipient, type IRecipientReader } from "./recipient.ts";

const WORKER_SECRET_NAME = "PUSH_DISPATCH_WORKER_SECRET";
const VAPID_PRIVATE_NAME = "VAPID_PRIVATE_KEY";
const VAPID_PUBLIC_NAME = "VAPID_PUBLIC_KEY";
const VAPID_SUBJECT_NAME = "VAPID_SUBJECT";

/** Notification body cap — a lock screen truncates long text anyway, and the
 *  encrypted payload has a hard 3KB ceiling. */
const BODY_MAX_CHARS = 140;

interface IDispatchBody {
  conversationId?: string;
  messageId?: string;
}

interface IConversationRow {
  id: string;
  assigned_seller_id: string | null;
  status: string;
}

interface ISubscriptionRow {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

interface IMessageRow {
  id: string;
  conversation_id: string;
  direction: string;
  text: string | null;
  media_type: string | null;
}

const MEDIA_LABEL: Record<string, string> = {
  image: "Enviou uma foto",
  audio: "Enviou um áudio",
  video: "Enviou um vídeo",
  document: "Enviou um documento",
  sticker: "Enviou um sticker",
  location: "Enviou uma localização",
  contact: "Enviou um contato",
};

/** What the lock screen shows. Media never leaks a caption longer than the cap. */
function buildBody(message: IMessageRow): string {
  const text = (message.text ?? "").trim();
  if (message.media_type) {
    const label = MEDIA_LABEL[message.media_type] ?? "Enviou um anexo";
    return text ? `${label}: ${text}`.slice(0, BODY_MAX_CHARS) : label;
  }
  if (!text) return "Nova mensagem";
  return text.length > BODY_MAX_CHARS ? `${text.slice(0, BODY_MAX_CHARS - 1)}…` : text;
}

async function resolveVapid(
  resolve: (name: string) => Promise<string | undefined>,
): Promise<IVapidKeys> {
  const [privateKey, publicKey, subject] = await Promise.all([
    resolve(VAPID_PRIVATE_NAME),
    resolve(VAPID_PUBLIC_NAME),
    resolve(VAPID_SUBJECT_NAME),
  ]);
  if (!privateKey || !publicKey) {
    throw new HttpError(503, "VAPID keys not provisioned");
  }
  return {
    privateKey,
    publicKey,
    subject: subject ?? "mailto:suporte@gallobasediesel.com.br",
  };
}

/** Display name for the notification title, resolved through the same RPC the
 *  Inbox uses; falls back to a neutral label rather than failing the dispatch. */
async function resolveContactName(
  admin: ReturnType<typeof createClient>,
  conversationId: string,
): Promise<string> {
  try {
    // ⚠️ O argumento chama-se `p_ids`. O PostgREST resolve função por NOME de
    // argumento, então `p_conversation_ids` não achava nada (PGRST202), o erro
    // caía no fallback e TODO push de mensagem chegava como "Nova mensagem" em
    // vez do nome de quem escreveu — silenciosamente, porque o fallback existe
    // justamente para nunca derrubar o disparo.
    const { data, error } = await admin.rpc("conversation_contacts", {
      p_ids: [conversationId],
    });
    if (error || !Array.isArray(data) || data.length === 0) return "Nova mensagem";
    const row = data[0] as { name?: string };
    // Caixa alta, como na lista do app: os nomes vêm da agenda do WhatsApp e de
    // importações, então sem isso a tela de bloqueio mistura "EDER BATISTA" e
    // "Marcelo Viana". Mesma regra de `shortNameOf` no front.
    const name = row.name?.trim();
    return name ? name.toLocaleUpperCase("pt-BR") : "Nova mensagem";
  } catch {
    return "Nova mensagem";
  }
}

servePost(async (req: Request, ctx: RequestContext): Promise<Response> => {
  const provided = req.headers.get("x-worker-secret") ?? "";
  const admin = createClient(
    requiredEnv("SUPABASE_URL"),
    requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false } },
  );
  const resolveSecret = createSecretResolver(admin);

  if (!verifyWorkerSecret(provided, await resolveSecret(WORKER_SECRET_NAME))) {
    throw new HttpError(401, "unauthorized");
  }

  const body = (await req.json().catch(() => ({}))) as IDispatchBody;
  if (!body.messageId || !body.conversationId) {
    throw new HttpError(400, "messageId and conversationId are required");
  }

  const { data: messageData, error: messageError } = await admin
    .from("messages")
    .select("id, conversation_id, direction, text, media_type")
    .eq("id", body.messageId)
    .maybeSingle();
  if (messageError) throw new HttpError(500, `message read failed: ${messageError.message}`);
  const message = messageData as IMessageRow | null;
  // Outbound echoes reach the trigger too; only the customer's own messages are
  // worth waking a phone for.
  if (!message || message.direction !== "in") {
    return json({ skipped: "not an inbound message" });
  }

  const { data: conversationData, error: conversationError } = await admin
    .from("conversations")
    .select("id, assigned_seller_id, status")
    .eq("id", body.conversationId)
    .maybeSingle();
  if (conversationError) {
    throw new HttpError(500, `conversation read failed: ${conversationError.message}`);
  }
  const conversation = conversationData as IConversationRow | null;
  if (!conversation) return json({ skipped: "conversation not found" });
  if (!conversation.assigned_seller_id) return json({ skipped: "pool conversation" });
  if (conversation.status === "resolvida" || conversation.status === "arquivada") {
    return json({ skipped: "closed conversation" });
  }

  const authUserId = await resolveRecipient(
    admin as unknown as IRecipientReader,
    conversation.assigned_seller_id,
  );
  if (!authUserId) return json({ skipped: "assignee has no login" });

  const { data: subscriptionData, error: subscriptionError } = await admin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("recipient_id", authUserId);
  if (subscriptionError) {
    throw new HttpError(500, `subscriptions read failed: ${subscriptionError.message}`);
  }
  const subscriptions = (subscriptionData ?? []) as ISubscriptionRow[];
  if (subscriptions.length === 0) return json({ skipped: "NO_SUBSCRIPTION" });

  const vapid = await resolveVapid(resolveSecret);
  const title = await resolveContactName(admin, conversation.id);
  const payload = JSON.stringify({
    title,
    body: buildBody(message),
    url: `/atendimento/conversa/${conversation.id}`,
    tag: `conversa-${conversation.id}`,
  });

  const results = await Promise.all(
    subscriptions.map(async (subscription) => {
      const result = await sendWebPush(subscription, payload, vapid);
      return { subscription, result };
    }),
  );

  const expired = results
    .filter((entry) => entry.result.isExpired)
    .map((entry) => entry.subscription.id);
  if (expired.length > 0) {
    // A zombie endpoint is a phantom delivery — prune it the moment it answers
    // 410, not on some later sweep.
    await admin.from("push_subscriptions").delete().in("id", expired);
    ctx.log.info("pruned expired push subscriptions", { count: expired.length });
  }

  const delivered = results.filter(
    (entry) => entry.result.status >= 200 && entry.result.status < 300,
  );
  if (delivered.length > 0) {
    await admin
      .from("push_subscriptions")
      .update({ last_used_at: new Date().toISOString() })
      .in(
        "id",
        delivered.map((entry) => entry.subscription.id),
      );
  }

  const failed = results
    .filter(
      (entry) =>
        !entry.result.isExpired && (entry.result.status < 200 || entry.result.status >= 300),
    )
    .map((entry) => ({ endpoint: entry.subscription.endpoint, ...entry.result }));
  if (failed.length > 0) ctx.log.error("push delivery failures", { failed });

  return json({
    sent: delivered.length,
    expired: expired.length,
    failed: failed.length,
  });
});
