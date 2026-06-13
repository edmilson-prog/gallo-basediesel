import type { ID, ISO8601, IScheduledSend, IScheduledSendWithContext, ICustomer } from "@/shared/types";
import {
  selectAllScheduledSends,
  selectScheduledSendsByConversation,
  selectConversationById,
  selectCustomerById,
} from "../store/selectors";
import { patchById, upsert } from "../store/mutations";
import { isDue } from "@/features/quick-send/engine/scheduledSend";
import { MockNotFoundError, runApi } from "./utils";

function getById(id: ID): IScheduledSend | null {
  return selectAllScheduledSends().find((s) => s.id === id) ?? null;
}

/** Recipient name/phone for the global queue. B2B → trade/legal name; B2C → full name. */
function resolveCustomerContext(c: ICustomer | null): { name: string | null; phone: string | null } {
  if (!c) return { name: null, phone: null };
  const name =
    c.type === "B2B"
      ? c.nomeFantasia || c.razaoSocial || c.contactName || null
      : c.fullName || null;
  return { name, phone: c.phone ?? null };
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

  create(
    input: Omit<IScheduledSend, "id" | "createdAt" | "status"> & {
      status?: IScheduledSend["status"];
    },
  ): Promise<IScheduledSend> {
    return runApi(
      "scheduledSendApi",
      "create",
      () => {
        const send: IScheduledSend = {
          ...input,
          id: `sched-${crypto.randomUUID()}`,
          status: input.status ?? "pending",
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

  listStore(params?: { status?: IScheduledSend["status"][] }): Promise<IScheduledSendWithContext[]> {
    const statuses = params?.status ?? ["pending"];
    return runApi(
      "scheduledSendApi",
      "listStore",
      () =>
        selectAllScheduledSends()
          .filter((s) => statuses.includes(s.status))
          .sort((a, b) => (a.scheduledFor ?? "").localeCompare(b.scheduledFor ?? ""))
          .map((s) => {
            const conv = selectConversationById(s.conversationId);
            const customer = conv?.customerId ? selectCustomerById(conv.customerId) : null;
            const ctx = resolveCustomerContext(customer ?? null);
            return { ...s, customerName: ctx.name, customerPhone: ctx.phone };
          }),
      { payload: { statuses } },
    );
  },

  /** Test/maintenance aid — not part of the provider contract. */
  _getById: getById,
};
