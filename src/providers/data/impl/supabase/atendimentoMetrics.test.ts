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
    const out = await P.getStatusDistribution({ ...PARAMS, storeId: undefined });
    expect(rpc).toHaveBeenCalledWith("service_volume_status_distribution", { p_store_id: null, p_seller_id: null });
    expect(out).toEqual({ slices: [], total: 0 });
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

  it("getAccumulatedChats passes granularity and returns the fallback on null", async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    const out = await P.getAccumulatedChats(PARAMS);
    expect(rpc).toHaveBeenCalledWith("service_volume_accumulated_chats", {
      p_store_id: "store-1", p_from: PARAMS.from, p_to: PARAMS.to, p_granularity: "day", p_seller_id: null,
    });
    expect(out).toEqual({ series: [], total: 0 });
  });

  it("throws when the RPC returns an error", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    await expect(P.getHandleTimeStats(PARAMS)).rejects.toThrow(/service_volume_handle_time: boom/);
  });

  it("getHeadlineKpis calls the RPC with both windows and returns the jsonb shape", async () => {
    const payload = {
      tmaMinutes: { current: 90, previous: 101 },
      tmrMinutes: { current: 38, previous: 30 },
      resolutionRatePct: { current: 37, previous: 36 },
      backlog: 2141,
    };
    rpc.mockResolvedValue({ data: payload, error: null });
    const out = await P.getHeadlineKpis({
      ...PARAMS,
      prevFrom: "2026-05-25T00:00:00Z",
      prevTo: "2026-06-01T00:00:00Z",
    });
    expect(rpc).toHaveBeenCalledWith("service_volume_headline_kpis", {
      p_store_id: "store-1",
      p_from: PARAMS.from,
      p_to: PARAMS.to,
      p_prev_from: "2026-05-25T00:00:00Z",
      p_prev_to: "2026-06-01T00:00:00Z",
      p_seller_id: null,
    });
    expect(out).toEqual(payload);
  });

  it("getHeadlineKpis returns the empty fallback when data is null", async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    const out = await P.getHeadlineKpis({
      ...PARAMS,
      prevFrom: "2026-05-25T00:00:00Z",
      prevTo: "2026-06-01T00:00:00Z",
    });
    expect(out).toEqual({
      tmaMinutes: { current: null, previous: null },
      tmrMinutes: { current: null, previous: null },
      resolutionRatePct: { current: null, previous: null },
      backlog: 0,
    });
  });

  it("getSellerLoad calls the RPC with mapped params and falls back to empty rows", async () => {
    const payload = { rows: [{ sellerId: "s1", activeCount: 4 }] };
    rpc.mockResolvedValue({ data: payload, error: null });
    const out = await P.getSellerLoad({ storeId: "store-1" });
    expect(rpc).toHaveBeenCalledWith("service_volume_seller_load", {
      p_store_id: "store-1",
      p_seller_id: null,
    });
    expect(out).toEqual(payload);

    rpc.mockResolvedValue({ data: null, error: null });
    expect(await P.getSellerLoad({})).toEqual({ rows: [] });
  });

  it("getVolumeHeatmap calls the RPC with the window and falls back to the empty shape", async () => {
    const payload = { rows: [{ day: 1, hour: 9, count: 4 }], totalMessages: 4 };
    rpc.mockResolvedValue({ data: payload, error: null });
    const out = await P.getVolumeHeatmap({ storeId: "store-1", from: PARAMS.from, to: PARAMS.to });
    expect(rpc).toHaveBeenCalledWith("service_volume_heatmap", {
      p_store_id: "store-1",
      p_from: PARAMS.from,
      p_to: PARAMS.to,
      p_seller_id: null,
    });
    expect(out).toEqual(payload);

    rpc.mockResolvedValue({ data: null, error: null });
    expect(await P.getVolumeHeatmap({ from: PARAMS.from, to: PARAMS.to })).toEqual({
      rows: [],
      totalMessages: 0,
    });
  });
});
