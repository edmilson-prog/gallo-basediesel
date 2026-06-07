import type { ID, ITrackableLink } from "@/shared/types";
import {
  selectTrackableLinkById,
  selectTrackableLinksByConversation,
} from "../store/selectors";
import { patchById, upsert } from "../store/mutations";
import { buildShortRef, buildUtm } from "@/features/quick-send/engine/trackableLink";
import { MockNotFoundError, runApi } from "./utils";

export const trackableLinkApi = {
  create(
    input: Omit<ITrackableLink, "id" | "createdAt" | "opens">,
  ): Promise<ITrackableLink> {
    return runApi(
      "trackableLinkApi",
      "create",
      () => {
        const id = `tl-${crypto.randomUUID()}`;
        const link: ITrackableLink = {
          ...input,
          id,
          shortRef: input.shortRef || buildShortRef(id),
          utm: input.utm ?? buildUtm({ source: "whatsapp", medium: "chat", campaign: "manual" }),
          opens: 0,
          createdAt: new Date().toISOString(),
        };
        upsert("trackableLinks", link);
        return link;
      },
      { payload: input },
    );
  },

  get(id: ID): Promise<ITrackableLink | null> {
    return runApi("trackableLinkApi", "get", () => selectTrackableLinkById(id), {
      payload: { id },
    });
  },

  listByConversation(conversationId: ID): Promise<ITrackableLink[]> {
    return runApi(
      "trackableLinkApi",
      "listByConversation",
      () => selectTrackableLinksByConversation(conversationId),
      { payload: { conversationId } },
    );
  },

  registerOpen(id: ID): Promise<ITrackableLink> {
    return runApi(
      "trackableLinkApi",
      "registerOpen",
      () => {
        const current = selectTrackableLinkById(id);
        if (!current) throw new MockNotFoundError("trackableLink", id);
        const updated = patchById("trackableLinks", id, {
          opens: current.opens + 1,
          lastOpenedAt: new Date().toISOString(),
        });
        if (!updated) throw new MockNotFoundError("trackableLink", id);
        return updated;
      },
      { payload: { id } },
    );
  },
};
