import type { ID, ITrackableLink } from "@/shared/types";
import { trackableLinkApi } from "@/mocks";
import type { ITrackableLinkProvider } from "../../contracts/trackableLink";
import { logMockMutation } from "./_audit";
import { withCreateStoreId } from "./_storeScope";

export const mockTrackableLinkProvider: ITrackableLinkProvider = {
  create: async (input) => {
    const scoped = withCreateStoreId(input as typeof input & { storeId?: ID });
    const created = await trackableLinkApi.create(scoped);
    logMockMutation({
      action: "create",
      resource: "trackable_link",
      resourceId: created.id,
      after: created,
      storeId: created.storeId,
    });
    return created;
  },

  get: (id) => trackableLinkApi.get(id),

  listByConversation: (conversationId) => trackableLinkApi.listByConversation(conversationId),

  registerOpen: (id) => trackableLinkApi.registerOpen(id),
};
