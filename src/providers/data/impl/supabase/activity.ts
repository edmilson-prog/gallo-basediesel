import type { ID, ICustomerTimelinePayload } from "@/shared/types";
import type { IActivityProvider } from "../../contracts/activity";
import { getSupabaseClient } from "@/shared/lib/supabase";

export const supabaseActivityProvider: IActivityProvider = {
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
