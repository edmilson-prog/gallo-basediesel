import type { ID, IPixKey } from "@/shared/types";
import { selectAllPixKeys, selectPixKeyById } from "../store/selectors";
import { patchById, removeById, upsert } from "../store/mutations";
import { MockNotFoundError, runApi } from "./utils";

export const pixKeyApi = {
  list(params: { storeId?: ID; activeOnly?: boolean } = {}): Promise<IPixKey[]> {
    return runApi(
      "pixKeyApi",
      "list",
      () =>
        selectAllPixKeys().filter((k) => {
          if (params.storeId && k.storeId !== params.storeId) return false;
          if (params.activeOnly && !k.isActive) return false;
          return true;
        }),
      { payload: params },
    );
  },

  get(id: ID): Promise<IPixKey | null> {
    return runApi("pixKeyApi", "get", () => selectPixKeyById(id), { payload: { id } });
  },

  create(input: Omit<IPixKey, "id" | "createdAt" | "updatedAt">): Promise<IPixKey> {
    return runApi(
      "pixKeyApi",
      "create",
      () => {
        const nowIso = new Date().toISOString();
        const key: IPixKey = {
          ...input,
          id: `pix-${crypto.randomUUID()}`,
          createdAt: nowIso,
          updatedAt: nowIso,
        };
        upsert("pixKeys", key);
        return key;
      },
      { payload: input },
    );
  },

  update(id: ID, patch: Partial<IPixKey>): Promise<IPixKey> {
    return runApi(
      "pixKeyApi",
      "update",
      () => {
        const updated = patchById("pixKeys", id, { ...patch, updatedAt: new Date().toISOString() });
        if (!updated) throw new MockNotFoundError("pixKey", id);
        return updated;
      },
      { payload: { id, patch } },
    );
  },

  delete(id: ID): Promise<IPixKey> {
    return runApi(
      "pixKeyApi",
      "delete",
      () => {
        const before = selectPixKeyById(id);
        if (!before) throw new MockNotFoundError("pixKey", id);
        removeById("pixKeys", id);
        return before;
      },
      { payload: { id } },
    );
  },
};
