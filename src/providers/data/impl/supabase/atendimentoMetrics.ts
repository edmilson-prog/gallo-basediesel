import type { IAtendimentoMetricsProvider } from "../../contracts/atendimentoMetrics";
import type {
  INovosAtendimentosResult,
  IMessageVolumeResult,
  IMessagesByUserResult,
  IStatusDistributionResult,
  IAccumulatedChatsResult,
  IHandleTimeStatsResult,
  IHeadlineKpisResult,
  ISellerLoadCountsResult,
  IHeatmapResult,
} from "@/shared/types";
import { getSupabaseClient } from "@/shared/lib/supabase";

/**
 * PRD-214 — real Supabase impl of the service-volume metrics provider.
 * Each method is a thin passthrough over a SECURITY DEFINER RPC that returns the
 * contract shape as jsonb (built server-side). The RPC enforces the role gate +
 * store scope + demo-seed exclusion; this layer only maps params and casts.
 */
async function callRpc<T>(
  name: string,
  params: Record<string, unknown>,
  fallback: T,
): Promise<T> {
  const { data, error } = await getSupabaseClient().rpc(name, params);
  if (error) throw new Error(`${name}: ${error.message}`);
  return (data as T | null) ?? fallback;
}

export const supabaseAtendimentoMetricsProvider: IAtendimentoMetricsProvider = {
  async getNovosAtendimentos({ storeId, sellerId, from, to, granularity }) {
    return callRpc<INovosAtendimentosResult>(
      "service_volume_novos_atendimentos",
      { p_store_id: storeId ?? null, p_from: from, p_to: to, p_granularity: granularity, p_seller_id: sellerId ?? null },
      { series: [], total: 0, averagePerDay: 0, deltaPct: null, historyStartsAt: null },
    );
  },

  async getMessageVolume({ storeId, sellerId, from, to, granularity }) {
    return callRpc<IMessageVolumeResult>(
      "service_volume_message_volume",
      { p_store_id: storeId ?? null, p_from: from, p_to: to, p_granularity: granularity, p_seller_id: sellerId ?? null },
      { series: [], totalSent: 0, totalReceived: 0 },
    );
  },

  async getMessagesByUser({ storeId, sellerId, from, to, audience }) {
    return callRpc<IMessagesByUserResult>(
      "service_volume_messages_by_user",
      { p_store_id: storeId ?? null, p_from: from, p_to: to, p_seller_id: sellerId ?? null, p_audience: audience },
      { rows: [], audience },
    );
  },

  async getStatusDistribution({ storeId, sellerId }) {
    return callRpc<IStatusDistributionResult>(
      "service_volume_status_distribution",
      { p_store_id: storeId ?? null, p_seller_id: sellerId ?? null },
      { slices: [], total: 0 },
    );
  },

  async getAccumulatedChats({ storeId, sellerId, from, to, granularity }) {
    return callRpc<IAccumulatedChatsResult>(
      "service_volume_accumulated_chats",
      { p_store_id: storeId ?? null, p_from: from, p_to: to, p_granularity: granularity, p_seller_id: sellerId ?? null },
      { series: [], total: 0 },
    );
  },

  async getHandleTimeStats({ storeId, sellerId, from, to }) {
    return callRpc<IHandleTimeStatsResult>(
      "service_volume_handle_time",
      { p_store_id: storeId ?? null, p_from: from, p_to: to, p_seller_id: sellerId ?? null },
      { averageMs: 0, medianMs: null, cycleCount: 0, deltaPct: null },
    );
  },

  async getHeadlineKpis({ storeId, sellerId, from, to, prevFrom, prevTo }) {
    return callRpc<IHeadlineKpisResult>(
      "service_volume_headline_kpis",
      {
        p_store_id: storeId ?? null,
        p_from: from,
        p_to: to,
        p_prev_from: prevFrom,
        p_prev_to: prevTo,
        p_seller_id: sellerId ?? null,
      },
      {
        tmaMinutes: { current: null, previous: null },
        tmrMinutes: { current: null, previous: null },
        resolutionRatePct: { current: null, previous: null },
        backlog: 0,
      },
    );
  },

  async getSellerLoad({ storeId, sellerId }) {
    return callRpc<ISellerLoadCountsResult>(
      "service_volume_seller_load",
      { p_store_id: storeId ?? null, p_seller_id: sellerId ?? null },
      { rows: [] },
    );
  },

  async getVolumeHeatmap({ storeId, sellerId, from, to }) {
    return callRpc<IHeatmapResult>(
      "service_volume_heatmap",
      { p_store_id: storeId ?? null, p_from: from, p_to: to, p_seller_id: sellerId ?? null },
      { rows: [], totalMessages: 0 },
    );
  },
};
