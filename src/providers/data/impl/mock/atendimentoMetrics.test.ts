import { describe, expect, it } from "vitest";
import { mockAtendimentoMetricsProvider as p } from "./atendimentoMetrics";
import { getMockState } from "@/mocks/store/mockStore";
import { resetMockStorePerFile } from "@/mocks/test-setup";

resetMockStorePerFile();

const params = {
  from: "2000-01-01T00:00:00Z",
  to: "2100-01-01T00:00:00Z",
  granularity: "day" as const,
};

describe("mockAtendimentoMetricsProvider", () => {
  it("getStatusDistribution: soma das fatias = total e total > 0 (seed populado)", async () => {
    const r = await p.getStatusDistribution(params);
    const sum = r.slices.reduce((a, s) => a + s.count, 0);
    expect(sum).toBe(r.total);
    expect(r.total).toBeGreaterThan(0);
  });

  it("getNovosAtendimentos: total >= número de conversas (1º contato garante isso) e é determinístico", async () => {
    const a = await p.getNovosAtendimentos(params);
    const b = await p.getNovosAtendimentos(params);
    expect(a.total).toBe(b.total);
    expect(a.total).toBeGreaterThan(0);
    expect(a.series.length).toBeGreaterThan(0);
    expect(a.total).toBeGreaterThanOrEqual(getMockState().conversations.length);
  });

  it("getMessageVolume: totais batem com a soma das séries", async () => {
    const r = await p.getMessageVolume(params);
    const sent = r.series.reduce((a, x) => a + x.sent, 0);
    const received = r.series.reduce((a, x) => a + x.received, 0);
    expect(sent).toBe(r.totalSent);
    expect(received).toBe(r.totalReceived);
  });

  it("getMessagesByUser: audience='automation' não inclui authorType seller", async () => {
    const r = await p.getMessagesByUser({ ...params, audience: "automation" });
    expect(r.rows.every((row) => row.authorType !== "seller")).toBe(true);
  });

  it("getHeadlineKpis: valores plausíveis e determinísticos", async () => {
    const headlineParams = { ...params, prevFrom: "1900-01-01T00:00:00Z", prevTo: params.from };
    const a = await p.getHeadlineKpis(headlineParams);
    const b = await p.getHeadlineKpis(headlineParams);
    expect(a).toEqual(b);
    expect(a.backlog).toBeGreaterThanOrEqual(0);
    if (a.resolutionRatePct.current !== null) {
      expect(a.resolutionRatePct.current).toBeGreaterThanOrEqual(0);
      expect(a.resolutionRatePct.current).toBeLessThanOrEqual(100);
    }
    if (a.tmaMinutes.current !== null) expect(a.tmaMinutes.current).toBeGreaterThanOrEqual(0);
    if (a.tmrMinutes.current !== null) expect(a.tmrMinutes.current).toBeGreaterThanOrEqual(0);
  });

  it("getSellerLoad: conta só conversas abertas atribuídas, ordenado por carga desc", async () => {
    const r = await p.getSellerLoad({});
    const open = new Set(["aguardando", "em_andamento", "aguardando_cliente"]);
    const expected = getMockState().conversations.filter(
      (c) => open.has(c.status) && c.assignedSellerId,
    ).length;
    const sum = r.rows.reduce((a, row) => a + row.activeCount, 0);
    expect(sum).toBe(expected);
    for (let i = 1; i < r.rows.length; i++) {
      expect(r.rows[i - 1]!.activeCount).toBeGreaterThanOrEqual(r.rows[i]!.activeCount);
    }
  });

  it("getSellerLoad: janela de atividade filtra por lastMessageAt", async () => {
    const all = await p.getSellerLoad({});
    const windowed = await p.getSellerLoad({ from: params.from, to: params.to });
    expect(windowed).toEqual(all); // janela 2000–2100 cobre tudo
    const none = await p.getSellerLoad({
      from: "1900-01-01T00:00:00Z",
      to: "1900-12-31T00:00:00Z",
    });
    expect(none.rows).toEqual([]);
  });

  it("getVolumeHeatmap: total = soma das células, células dentro do range 7x24", async () => {
    const r = await p.getVolumeHeatmap(params);
    const sum = r.rows.reduce((a, row) => a + row.count, 0);
    expect(sum).toBe(r.totalMessages);
    expect(r.totalMessages).toBeGreaterThan(0);
    expect(
      r.rows.every((c) => c.day >= 0 && c.day <= 6 && c.hour >= 0 && c.hour <= 23 && c.count > 0),
    ).toBe(true);
    const b = await p.getVolumeHeatmap(params);
    expect(r).toEqual(b);
  });
});
