import type { ID, ISO8601, IScheduledSend } from "@/shared/types";
import {
  selectAllScheduledSends,
  selectScheduledSendsByConversation,
} from "../store/selectors";
import { patchById, upsert } from "../store/mutations";
import { isDue } from "@/features/quick-send/engine/scheduledSend";
import { MockNotFoundError, runApi } from "./utils";

function getById(id: ID): IScheduledSend | null {
  return selectAllScheduledSends().find((s) => s.id === id) ?? null;
}

export const scheduledSendApi = {
  list(conversationId: ID): Promise<IScheduledSend[]> {
    return runApi(
      "scheduledSendApi",
      "list",
      () => selectScheduledSendsByConversation(conversationId),
      { payload: { conversationId } },
    );
  },

  listDue(now: ISO8601): Promise<IScheduledSend[]> {
    return runApi(
      "scheduledSendApi",
      "listDue",
      () =>
        selectAllScheduledSends().filter(
          (s) => s.status === "pending" && !!s.scheduledFor && isDue(s.scheduledFor, now),
        ),
      { payload: { now } },
    );
  },

  create(input: Omit<IScheduledSend, "id" | "status" | "createdAt">): Promise<IScheduledSend> {
    return runApi(
      "scheduledSendApi",
      "create",
      () => {
        const send: IScheduledSend = {
          ...input,
          id: `sched-${crypto.randomUUID()}`,
          status: "pending",
          createdAt: new Date().toISOString(),
        };
        upsert("scheduledSends", send);
        return send;
      },
      { payload: input },
    );
  },

  update(id: ID, patch: Partial<IScheduledSend>): Promise<IScheduledSend> {
    return runApi(
      "scheduledSendApi",
      "update",
      () => {
        const updated = patchById("scheduledSends", id, patch);
        if (!updated) throw new MockNotFoundError("scheduledSend", id);
        return updated;
      },
      { payload: { id, patch } },
    );
  },

  cancel(id: ID): Promise<IScheduledSend> {
    return runApi(
      "scheduledSendApi",
      "cancel",
      () => {
        const updated = patchById("scheduledSends", id, { status: "cancelled" });
        if (!updated) throw new MockNotFoundError("scheduledSend", id);
        return updated;
      },
      { payload: { id } },
    );
  },

  markSent(id: ID): Promise<IScheduledSend> {
    return runApi(
      "scheduledSendApi",
      "markSent",
      () => {
        const updated = patchById("scheduledSends", id, { status: "sent" });
        if (!updated) throw new MockNotFoundError("scheduledSend", id);
        return updated;
      },
      { payload: { id } },
    );
  },

  markFailed(id: ID, reason: string): Promise<IScheduledSend> {
    return runApi(
      "scheduledSendApi",
      "markFailed",
      () => {
        const updated = patchById("scheduledSends", id, {
          status: "failed",
          failureReason: reason,
        });
        if (!updated) throw new MockNotFoundError("scheduledSend", id);
        return updated;
      },
      { payload: { id, reason } },
    );
  },

  /** Test/maintenance aid — not part of the provider contract. */
  _getById: getById,
};
