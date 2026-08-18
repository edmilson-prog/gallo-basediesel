import type { ID, IConversationActivityEvent, ICustomerTimelinePayload } from "@/shared/types";
import type { IActivityProvider } from "../../contracts/activity";
import { getSupabaseClient } from "@/shared/lib/supabase";

interface ActivityRow {
  id: string;
  conversation_id: string;
  customer_id: string | null;
  lead_id: string | null;
  store_id: string;
  type: IConversationActivityEvent["type"];
  from_status: string | null;
  to_status: string | null;
  from_seller_id: string | null;
  to_seller_id: string | null;
  actor_id: string | null;
  actor_kind: "seller" | "system";
  created_at: string;
  conversation_channel: IConversationActivityEvent["conversationChannel"];
  conversation_status: IConversationActivityEvent["conversationStatus"];
  conversation_created_at: string;
}

function rowToEvent(r: ActivityRow): IConversationActivityEvent {
  return {
    id: r.id,
    conversationId: r.conversation_id,
    customerId: r.customer_id ?? undefined,
    leadId: r.lead_id ?? undefined,
    storeId: r.store_id,
    type: r.type,
    fromStatus: (r.from_status ?? undefined) as IConversationActivityEvent["fromStatus"],
    toStatus: (r.to_status ?? undefined) as IConversationActivityEvent["toStatus"],
    fromSellerId: r.from_seller_id ?? undefined,
    toSellerId: r.to_seller_id ?? undefined,
    actorId: r.actor_id ?? undefined,
    actorKind: r.actor_kind,
    createdAt: r.created_at,
    conversationChannel: r.conversation_channel,
    conversationStatus: r.conversation_status,
    conversationCreatedAt: r.conversation_created_at,
  };
}

export const supabaseActivityProvider: IActivityProvider = {
  async getCustomerActivity(customerId: ID) {
    const { data, error } = await getSupabaseClient().rpc("get_customer_activity", {
      p_customer_id: customerId,
    });
    if (error)
      throw new Error(
        `[supabase] activity.getCustomerActivity(${customerId}) failed: ${error.message}`,
      );
    return (data as ActivityRow[]).map(rowToEvent);
  },

  async getCustomerTimeline(customerId: ID): Promise<ICustomerTimelinePayload> {
    const { data, error } = await getSupabaseClient().rpc("get_customer_timeline", {
      p_customer_id: customerId,
    });
    if (error)
      throw new Error(
        `[supabase] activity.getCustomerTimeline(${customerId}) failed: ${error.message}`,
      );
    // The RPC already returns the camelCase shape the UI consumes — no row mapping.
    return data as ICustomerTimelinePayload;
  },
};
