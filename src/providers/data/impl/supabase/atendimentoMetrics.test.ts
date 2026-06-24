import { describe, it, expect, vi, beforeEach } from "vitest";

const rpc = vi.fn();
vi.mock("@/shared/lib/supabase", () => ({
  getSupabaseClient: () => ({ rpc }),
}));

import { supabaseAtendimentoMetricsProvider as P } from "./atendimentoMetrics";

const PARAMS = { storeId: "store-1", sellerId: undefined, from: "2026-06-01T00:00:00Z", to: "2026-06-07T00:00:00Z", granularity: "day" as const };

beforeEach(() => rpc.mockReset());

describe("supabaseAtendimentoMetricsProvider", () => {
  it("getNovosAtendimentos calls the RPC with mapped params and returns the jsonb shape", async () => {
    const payload = { series: [{ bucket: "2026-06-01", value: 3 }], total: 3, averagePerDay: 0.4, deltaPct: 10, historyStartsAt: null };
    rpc.mockResolvedValue({ data: payload, error: null });
    const out = await P.getNovosAtendimentos(PARAMS);
    expect(rpc).toHaveBeenCalledWith("service_volume_novos_atendimentos", {
      p_store_id: "store-1", p_from: PARAMS.from, p_to: PARAMS.to, p_granularity: "day", p_seller_id: null,
    });
    expect(out).toEqual(payload);
  });

  it("maps undefined storeId/sellerId to null params", async () => {
    rpc.mockResolvedValue({ data: { slices: [], total: 0 }, error: null });
    await P.getStatusDistribution({ ...PARAMS, storeId: undefined });
    expect(rpc).toHaveBeenCalledWith("service_volume_status_distribution", { p_store_id: null, p_seller_id: null });
  });

  it("passes audience to messages_by_user", async () => {
    rpc.mockResolvedValue({ data: { rows: [], audience: "human" }, error: null });
    await P.getMessagesByUser({ ...PARAMS, audience: "human" });
    expect(rpc).toHaveBeenCalledWith("service_volume_messages_by_user", {
      p_store_id: "store-1", p_from: PARAMS.from, p_to: PARAMS.to, p_seller_id: null, p_audience: "human",
    });
  });

  it("returns the empty fallback when data is null", async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    const out = await P.getMessageVolume(PARAMS);
    expect(out).toEqual({ series: [], totalSent: 0, totalReceived: 0 });
  });

  it("throws when the RPC returns an error", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    await expect(P.getHandleTimeStats(PARAMS)).rejects.toThrow(/service_volume_handle_time: boom/);
  });
});
