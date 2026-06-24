import { describe, expect, it } from "vitest";
import { synthesizeNovoAtendimentoTimestamps } from "./synthesizeCycles";

const base = { id: "conv-1", createdAt: "2026-06-01T12:00:00Z", lastMessageAt: "2026-06-10T12:00:00Z" };

describe("synthesizeNovoAtendimentoTimestamps", () => {
  it("inclui sempre o 1º contato (createdAt)", () => {
    const out = synthesizeNovoAtendimentoTimestamps({ ...base, status: "aguardando" });
    expect(out[0]).toBe("2026-06-01T12:00:00Z");
  });
  it("é determinístico (mesmo id → mesmo resultado)", () => {
    const a = synthesizeNovoAtendimentoTimestamps({ ...base, status: "resolvida" });
    const b = synthesizeNovoAtendimentoTimestamps({ ...base, status: "resolvida" });
    expect(a).toEqual(b);
  });
  it("reaberturas caem dentro de [createdAt, lastMessageAt]", () => {
    const out = synthesizeNovoAtendimentoTimestamps({ ...base, status: "resolvida" });
    const lo = new Date(base.createdAt).getTime();
    const hi = new Date(base.lastMessageAt).getTime();
    for (const ts of out) {
      const t = new Date(ts).getTime();
      expect(t).toBeGreaterThanOrEqual(lo);
      expect(t).toBeLessThanOrEqual(hi);
    }
  });
  it("createdAt === lastMessageAt → só o 1º contato (sem reabertura possível)", () => {
    const out = synthesizeNovoAtendimentoTimestamps({
      id: "x",
      createdAt: "2026-06-01T12:00:00Z",
      lastMessageAt: "2026-06-01T12:00:00Z",
      status: "resolvida",
    });
    expect(out).toEqual(["2026-06-01T12:00:00Z"]);
  });
});
