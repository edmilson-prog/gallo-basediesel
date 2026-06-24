import type { IAtendimentoMetricsProvider } from "../../contracts/atendimentoMetrics";

export const mockAtendimentoMetricsProvider: IAtendimentoMetricsProvider = {
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
