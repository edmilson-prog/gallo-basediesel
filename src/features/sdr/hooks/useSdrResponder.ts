import { useCallback } from "react";
import type {
  ID,
  IConversation,
  IMessage,
  IPlatformSettings,
  ISdrResponse,
  ISdrSession,
} from "@/shared/types";
import { useMessagesProvider, useSdrSessionsProvider, recordAuditLogSync } from "@/providers/data";
import { applyResponseToSession, createSdrSession, sdrRespond } from "../engine/respond";

export interface ISdrTurnResult {
  session: ISdrSession;
  response: ISdrResponse;
  emittedMessages: IMessage[];
}

interface IRunTurnArgs {
  conversation: IConversation;
  incoming: IMessage;
  settings: IPlatformSettings;
  /** Pre-loaded session; when missing the hook bootstraps a new one. */
  existingSession?: ISdrSession | null;
}

const SDR_AUTHOR_ID = "sdr-agent";

/**
 * Glue between the pure engine and the mock store. Runs a single SDR turn —
 * loads/creates the session, calls `sdrRespond()`, persists side effects:
 *  - outbound messages (`authorType='sdr'`)
 *  - session state updates (state, collectedData, finishReason)
 *  - audit log entries for transition / escalation
 *
 * The hook itself is React-aware (uses providers) but the engine it wraps is
 * pure — the same `runTurn` call must produce the same outputs given the same
 * inputs (modulo the SDR session id, which is generated once on first turn).
 */
export function useSdrResponder() {
  const messagesProvider = useMessagesProvider();
  const sessionsProvider = useSdrSessionsProvider();

  const runTurn = useCallback(
    async ({
      conversation,
      incoming,
      settings,
      existingSession,
    }: IRunTurnArgs): Promise<ISdrTurnResult> => {
      const now = new Date().toISOString();
      const session: ISdrSession = existingSession ?? createSdrSession(conversation.id, now);

      if (!existingSession) {
        recordAuditLogSync({
          storeId: conversation.storeId,
          actorId: SDR_AUTHOR_ID,
          action: "sdr_session_start",
          resource: "conversation",
          resourceId: conversation.id,
        });
      }

      const response = sdrRespond(incoming, session, settings);
      const updatedSession = applyResponseToSession(session, response, now);
      await sessionsProvider.upsert(updatedSession);

      if (response.nextState !== session.state) {
        recordAuditLogSync({
          storeId: conversation.storeId,
          actorId: SDR_AUTHOR_ID,
          action: "sdr_state_transition",
          resource: "conversation",
          resourceId: conversation.id,
          before: { state: session.state },
          after: { state: response.nextState },
        });
      }

      const emitted: IMessage[] = [];
      for (const action of response.actions) {
        if (action.kind === "send_message") {
          const sent = await messagesProvider.send(conversation.id, {
            authorType: "sdr",
            authorId: SDR_AUTHOR_ID,
            text: action.text,
          });
          emitted.push(sent);
        } else if (action.kind === "escalate_to_human") {
          recordAuditLogSync({
            storeId: conversation.storeId,
            actorId: SDR_AUTHOR_ID,
            action: "sdr_escalate",
            resource: "conversation",
            resourceId: conversation.id,
            after: { reason: action.reason },
          });
        } else if (action.kind === "identify_part") {
          recordAuditLogSync({
            storeId: conversation.storeId,
            actorId: SDR_AUTHOR_ID,
            action: "sdr_identify_part_requested",
            resource: "conversation",
            resourceId: conversation.id,
            after: { text: action.text },
          });
        } else if (action.kind === "create_quote") {
          recordAuditLogSync({
            storeId: conversation.storeId,
            actorId: SDR_AUTHOR_ID,
            action: "sdr_quote_requested",
            resource: "conversation",
            resourceId: conversation.id,
            after: { partId: action.partId },
          });
        }
      }

      return {
        session: updatedSession,
        response,
        emittedMessages: emitted,
      };
    },
    [messagesProvider, sessionsProvider],
  );

  return { runTurn };
}

export function getSdrAuthorId(): ID {
  return SDR_AUTHOR_ID;
}
