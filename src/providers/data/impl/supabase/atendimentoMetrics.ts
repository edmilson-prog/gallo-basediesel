import type { IAtendimentoMetricsProvider } from "../../contracts/atendimentoMetrics";

/**
 * Placeholder until PRD-214 (`Pulse`) lands the event log + aggregations.
 * Returns empty/zeroed results (NOT NotImplementedError) so the panel renders
 * graceful empty states in production instead of crashing. Swap for the real
 * impl in the 2nd delivery.
 */
export const supabaseAtendimentoMetricsProvider: IAtendimentoMetricsProvider = {
  async getNovosAtendimentos() {
    return { series: [], total: 0, averagePerDay: 0, deltaPct: null, historyStartsAt: null };
  },
  async getMessageVolume() {
    return { series: [], totalSent: 0, totalReceived: 0 };
  },
  async getMessagesByUser(p) {
    return { rows: [], audience: p.audience };
  },
  async getStatusDistribution() {
    return { slices: [], total: 0 };
  },
  async getAccumulatedChats() {
    return { series: [], total: 0 };
  },
  async getHandleTimeStats() {
    return { averageMs: 0, medianMs: null, cycleCount: 0, deltaPct: null };
  },
};
