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
});
