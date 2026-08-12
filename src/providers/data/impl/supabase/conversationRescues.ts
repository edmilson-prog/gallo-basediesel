import type { ID, IConversationRescue } from "@/shared/types";
import type { IConversationRescuesProvider } from "../../contracts/conversationRescues";
import { getSupabaseClient } from "@/shared/lib/supabase";

interface IConversationRescueRow {
  id: string;
  conversation_id: string;
  store_id: string;
  whatsapp_account_id: string | null;
  absent_seller_id: string;
  absence_kind: "schedule" | "temporary";
  contact_name: string;
  last_inbound_preview: string | null;
  status: "broadcasting" | "claimed" | "forced" | "cancelled";
  broadcast_at: string;
  claimed_by_seller_id: string | null;
  claimed_at: string | null;
  forced_seller_id: string | null;
  forced_at: string | null;
  cancelled_reason: string | null;
  created_at: string;
}

function fromRow(row: IConversationRescueRow): IConversationRescue {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    storeId: row.store_id,
    whatsappAccountId: row.whatsapp_account_id,
    absentSellerId: row.absent_seller_id,
    absenceKind: row.absence_kind,
    contactName: row.contact_name,
    lastInboundPreview: row.last_inbound_preview,
    status: row.status,
    broadcastAt: row.broadcast_at,
    claimedBySellerId: row.claimed_by_seller_id ?? undefined,
    claimedAt: row.claimed_at ?? undefined,
    forcedSellerId: row.forced_seller_id ?? undefined,
    forcedAt: row.forced_at ?? undefined,
    cancelledReason: row.cancelled_reason ?? undefined,
    createdAt: row.created_at,
  };
}

export const supabaseConversationRescuesProvider: IConversationRescuesProvider = {
  async list(): Promise<IConversationRescue[]> {
    const { data, error } = await getSupabaseClient()
      .from("conversation_rescues")
      .select("*")
      .eq("status", "broadcasting")
      .order("broadcast_at", { ascending: true });
    if (error) throw new Error(`[supabase] conversationRescues.list() failed: ${error.message}`);
    return (data as IConversationRescueRow[]).map(fromRow);
  },

  async claim(rescueId: ID): Promise<IConversationRescue> {
    const { data, error } = await getSupabaseClient().rpc("claim_conversation_rescue", {
      p_rescue_id: rescueId,
    });
    if (error)
      throw new Error(`[supabase] conversationRescues.claim(${rescueId}) failed: ${error.message}`);
    return fromRow(data as IConversationRescueRow);
  },
};
