import type { ID, IQuickReply } from "@/shared/types";
import {
  selectAllQuickReplies,
  selectQuickReplyById,
} from "../store/selectors";
import { patchById, removeById, upsert } from "../store/mutations";
import { MockNotFoundError, runApi } from "./utils";

export const quickReplyApi = {
  list(params: {
    storeId?: ID;
    sellerId?: ID;
    scope?: "private" | "shared";
  } = {}): Promise<IQuickReply[]> {
    return runApi(
      "quickReplyApi",
      "list",
      () => {
        return selectAllQuickReplies().filter((q) => {
          if (params.storeId && q.storeId !== params.storeId) return false;
          if (params.scope && q.scope !== params.scope) return false;
          // A seller sees all `shared` + their own `private` snippets.
          if (params.sellerId) {
            if (q.scope === "shared") return true;
            return q.ownerId === params.sellerId;
          }
          return true;
        });
      },
      { payload: params },
    );
  },

  get(id: ID): Promise<IQuickReply | null> {
    return runApi("quickReplyApi", "get", () => selectQuickReplyById(id), { payload: { id } });
  },

  findByShortcut(shortcut: string, sellerId: ID): Promise<IQuickReply | null> {
    return runApi(
      "quickReplyApi",
      "findByShortcut",
      () => {
        const candidates = selectAllQuickReplies().filter((q) => q.shortcut === shortcut);
        // Prefer the seller's own private snippet, then any shared one.
        const own = candidates.find((q) => q.scope === "private" && q.ownerId === sellerId);
        if (own) return own;
        return candidates.find((q) => q.scope === "shared") ?? null;
      },
      { payload: { shortcut, sellerId } },
    );
  },

  create(input: Omit<IQuickReply, "id" | "createdAt" | "updatedAt">): Promise<IQuickReply> {
    return runApi(
      "quickReplyApi",
      "create",
      () => {
        const nowIso = new Date().toISOString();
        const reply: IQuickReply = {
          ...input,
          id: `qr-${crypto.randomUUID()}`,
          createdAt: nowIso,
          updatedAt: nowIso,
        };
        upsert("quickReplies", reply);
        return reply;
      },
      { payload: input },
    );
  },

  update(id: ID, patch: Partial<IQuickReply>): Promise<IQuickReply> {
    return runApi(
      "quickReplyApi",
      "update",
      () => {
        const updated = patchById("quickReplies", id, {
          ...patch,
          updatedAt: new Date().toISOString(),
        });
        if (!updated) throw new MockNotFoundError("quickReply", id);
        return updated;
      },
      { payload: { id, patch } },
    );
  },

  delete(id: ID): Promise<IQuickReply> {
    return runApi(
      "quickReplyApi",
      "delete",
      () => {
        const before = selectQuickReplyById(id);
        if (!before) throw new MockNotFoundError("quickReply", id);
        removeById("quickReplies", id);
        return before;
      },
      { payload: { id } },
    );
  },
};
