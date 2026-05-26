import type { ID, ISdrSession, SdrFinishReason, SdrSessionState } from "@/shared/types";
import {
  selectActiveSdrSessions,
  selectAllSdrSessions,
  selectSdrSessionByConversation,
} from "../store/selectors";
import { patchById, upsert } from "../store/mutations";
import { MockNotFoundError, runApi } from "./utils";

export interface IListSdrSessionsParams {
  storeId?: ID;
  conversationId?: ID;
  state?: SdrSessionState;
  finishReason?: SdrFinishReason;
  fromDate?: string;
  toDate?: string;
}

export const sdrSessionsApi = {
  list(params: IListSdrSessionsParams = {}): Promise<ISdrSession[]> {
    return runApi(
      "sdrSessionsApi",
      "list",
      () => {
        let all = selectAllSdrSessions();
        if (params.conversationId)
          all = all.filter((s) => s.conversationId === params.conversationId);
        if (params.state) all = all.filter((s) => s.state === params.state);
        if (params.finishReason) all = all.filter((s) => s.finishReason === params.finishReason);
        if (params.fromDate) all = all.filter((s) => s.startedAt >= params.fromDate!);
        if (params.toDate) all = all.filter((s) => s.startedAt <= params.toDate!);
        return [...all].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
      },
      { payload: params },
    );
  },

  listActive(): Promise<ISdrSession[]> {
    return runApi("sdrSessionsApi", "listActive", () => selectActiveSdrSessions());
  },

  getByConversation(conversationId: ID): Promise<ISdrSession | null> {
    return runApi("sdrSessionsApi", "getByConversation", () =>
      selectSdrSessionByConversation(conversationId),
    );
  },

  upsert(session: ISdrSession): Promise<ISdrSession> {
    return runApi("sdrSessionsApi", "upsert", () => upsert("sdrSessions", session));
  },

  patch(id: ID, patch: Partial<ISdrSession>): Promise<ISdrSession> {
    return runApi("sdrSessionsApi", "patch", () => {
      const updated = patchById("sdrSessions", id, patch);
      if (!updated) throw new MockNotFoundError("sdrSession", id);
      return updated;
    });
  },

  pause(id: ID, now: string = new Date().toISOString()): Promise<ISdrSession> {
    return runApi("sdrSessionsApi", "pause", () => {
      const current = selectAllSdrSessions().find((s) => s.id === id);
      if (!current) throw new MockNotFoundError("sdrSession", id);
      const updated = patchById("sdrSessions", id, {
        state: "pausado",
        pausedFromState: current.state,
        finishReason: "paused_by_human",
        lastActivityAt: now,
      });
      if (!updated) throw new MockNotFoundError("sdrSession", id);
      return updated;
    });
  },

  resume(id: ID, now: string = new Date().toISOString()): Promise<ISdrSession> {
    return runApi("sdrSessionsApi", "resume", () => {
      const current = selectAllSdrSessions().find((s) => s.id === id);
      if (!current) throw new MockNotFoundError("sdrSession", id);
      const restored = current.pausedFromState ?? "qualificacao";
      const updated = patchById("sdrSessions", id, {
        state: restored,
        pausedFromState: undefined,
        finishReason: undefined,
        finishedAt: undefined,
        lastActivityAt: now,
      });
      if (!updated) throw new MockNotFoundError("sdrSession", id);
      return updated;
    });
  },
};
