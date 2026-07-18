import type { ID, ISdrEscalation } from "@/shared/types";
import {
  selectAllSdrEscalations,
  selectSdrEscalationById,
  selectSdrEscalationByConversation,
} from "../store/selectors";
import { patchById, upsert } from "../store/mutations";
import { MockConflictError, MockNotFoundError, runApi } from "./utils";
import type { IListSdrEscalationsParams } from "@/providers/data";

export const sdrEscalationsApi = {
  list(params: IListSdrEscalationsParams = {}): Promise<ISdrEscalation[]> {
    return runApi(
      "sdrEscalationsApi",
      "list",
      () => {
        let all = selectAllSdrEscalations();
        if (params.storeId) all = all.filter((e) => e.storeId === params.storeId);
        if (params.conversationId)
          all = all.filter((e) => e.conversationId === params.conversationId);
        if (params.sessionId) all = all.filter((e) => e.sessionId === params.sessionId);
        if (params.customerId) all = all.filter((e) => e.customerId === params.customerId);
        if (params.status) all = all.filter((e) => e.status === params.status);
        if (params.mode) all = all.filter((e) => e.mode === params.mode);
        if (params.reason) all = all.filter((e) => e.reason === params.reason);
        if (params.assignedSellerId)
          all = all.filter((e) => e.assignedSellerId === params.assignedSellerId);
        if (params.fromDate) all = all.filter((e) => e.createdAt >= params.fromDate!);
        if (params.toDate) all = all.filter((e) => e.createdAt <= params.toDate!);
        return [...all].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      },
      { payload: params },
    );
  },

  getById(id: ID): Promise<ISdrEscalation | null> {
    return runApi("sdrEscalationsApi", "getById", () => selectSdrEscalationById(id));
  },

  getByConversation(conversationId: ID): Promise<ISdrEscalation | null> {
    return runApi("sdrEscalationsApi", "getByConversation", () =>
      selectSdrEscalationByConversation(conversationId),
    );
  },

  create(escalation: ISdrEscalation): Promise<ISdrEscalation> {
    return runApi("sdrEscalationsApi", "create", () => upsert("sdrEscalations", escalation));
  },

  patch(id: ID, patch: Partial<ISdrEscalation>): Promise<ISdrEscalation> {
    return runApi("sdrEscalationsApi", "patch", () => {
      const updated = patchById("sdrEscalations", id, patch);
      if (!updated) throw new MockNotFoundError("sdrEscalation", id);
      return updated;
    });
  },

  /** Atomic (single-threaded JS, so trivially so) claim — mirrors the real
   *  claim_sdr_escalation RPC's guard: already-claimed or wrong status throws. */
  claim(id: ID, sellerId: ID): Promise<ISdrEscalation> {
    return runApi("sdrEscalationsApi", "claim", () => {
      const current = selectSdrEscalationById(id);
      if (!current) throw new MockNotFoundError("sdrEscalation", id);
      if (
        current.urgentBroadcastClaimedBySellerId ||
        !["pending", "assigned"].includes(current.status)
      ) {
        throw new MockConflictError(`sdrEscalation already claimed: ${id}`);
      }
      const now = new Date().toISOString();
      const updated = patchById("sdrEscalations", id, {
        assignedSellerId: sellerId,
        assignedAt: now,
        firstHumanResponseAt: undefined,
        status: "assigned",
        urgentBroadcastClaimedBySellerId: sellerId,
        urgentBroadcastClaimedAt: now,
      });
      if (!updated) throw new MockNotFoundError("sdrEscalation", id);
      return updated;
    });
  },
};
