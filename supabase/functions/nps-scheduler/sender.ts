import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.107.0";
import { dispatchWahaText } from "../_shared/wahaSendAdapter.ts";
import { makeSendDb, makeEngineDeps } from "../_shared/whatsappSendAdapter.ts";
import { buildWhatsAppEngine } from "../_shared/whatsapp/build.ts";
import { processSendRequest } from "../_shared/whatsapp/send/core.ts";
import { buildScheduledSendRequest, buildSystemSender } from "../_shared/whatsapp/scheduled/core.ts";

/**
 * The NPS delivery boundary.
 *
 * PRD-148B assumed the survey would ride the Onda 8 dispatch (PRD-141) as an
 * HSM template. That infrastructure does not exist — `notification-dispatch`
 * was never built and both notification channels are stubs — and the engine
 * actually carrying production traffic is WAHA, which has neither a 24-hour
 * window nor Meta templates. So the survey goes out as ordinary text on the
 * conversation thread that already exists.
 *
 * Everything I/O-bound lives behind {@link INpsSurveySender} on purpose: when
 * the dispatch does land, a second implementation of this interface replaces
 * the send without the scheduler knowing.
 */
export interface INpsSurveyDispatch {
  conversationId: string;
  storeId: string;
  text: string;
}

export interface INpsSendResult {
  channel: "whatsapp";
  status: "sent" | "failed";
  error?: string;
}

export interface INpsSurveySender {
  send(dispatch: INpsSurveyDispatch): Promise<INpsSendResult>;
}

/**
 * Reads the conversation's engine. WAHA accounts must never reach
 * `processSendRequest`/`buildWhatsAppEngine`: that pipeline is isolation-scoped
 * to meta/evolution/evolution-go/openwa by design (PRDs 112/113) and throws
 * `Engine WhatsApp desconhecido: waha`.
 */
async function resolveConversationProvider(
  admin: SupabaseClient,
  conversationId: string,
): Promise<string | null> {
  const { data: conv } = await admin
    .from("conversations")
    .select("whatsapp_account_id")
    .eq("id", conversationId)
    .maybeSingle();
  if (!conv?.whatsapp_account_id) return null;
  const { data: account } = await admin
    .from("whatsapp_accounts")
    .select("provider")
    .eq("id", conv.whatsapp_account_id as string)
    .maybeSingle();
  return (account?.provider as string | undefined) ?? null;
}

/**
 * Sends through the same path `scheduled-send-worker` uses, as a system sender
 * (no seller attribution — the survey is the platform speaking, not a person).
 *
 * Verified before shipping (2026-08-12), because the survey lands on a
 * conversation whose status is already `resolvida`:
 *  - no trigger on `messages` touches `conversations.status`, so sending does
 *    NOT reopen the thread — `sync_conversation_awaiting_reply` only clears
 *    `awaiting_reply_since`;
 *  - the provider echo does not spawn a second conversation, because
 *    persist-before-send writes the row first and matches the echo by
 *    `provider_message_id`.
 *
 * Known side effect, inherited rather than introduced: the shared adapter
 * stamps `author_type: 'seller'`, which fires `sdr_escalation_first_response`
 * and `sdr_pause_on_human_message`. On a resolved conversation with a pending
 * SDR escalation the survey would be counted as the first human reply.
 * `scheduled-send-worker` has behaved this way since it shipped; fixing it
 * means teaching the adapter a system author type, which is a change to a
 * shared send path and belongs in its own PR.
 *
 * Registry-based engines (evolution-go, openwa) keep their `base_url` outside
 * `provider_config`, and this sender does not resolve that registry. Such an
 * account fails loudly with VALIDATION_ERROR and the survey is marked `failed`
 * rather than silently skipped — no production instance uses those engines
 * today, and a wrong send is worse than a visible failure.
 */
export function makeWhatsAppSender(admin: SupabaseClient, traceId: string): INpsSurveySender {
  const db = makeSendDb(admin, traceId);
  const deps = makeEngineDeps(admin, traceId);

  return {
    async send(dispatch: INpsSurveyDispatch): Promise<INpsSendResult> {
      try {
        const provider = await resolveConversationProvider(admin, dispatch.conversationId);

        if (provider === "waha") {
          await dispatchWahaText(admin, {
            conversationId: dispatch.conversationId,
            storeId: dispatch.storeId,
            text: dispatch.text,
            sellerId: null,
          });
          return { channel: "whatsapp", status: "sent" };
        }

        const request = buildScheduledSendRequest(dispatch.conversationId, {
          type: "snippet",
          contextMessage: dispatch.text,
        });
        await processSendRequest({
          input: request,
          sender: buildSystemSender(dispatch.storeId),
          db,
          buildProvider: (account) =>
            buildWhatsAppEngine({
              engine: account.provider,
              accountId: account.id,
              providerConfig: account.providerConfig,
              credentialsRef: account.credentialsRef,
              deps,
            }),
        });
        return { channel: "whatsapp", status: "sent" };
      } catch (error) {
        return {
          channel: "whatsapp",
          status: "failed",
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  };
}
