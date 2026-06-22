// src/features/tour/config/tours.test.ts
import { describe, expect, it } from "vitest";
import { TOURS, getTourByKey } from "./tours";
import { resolveTourForPath } from "../engine/tourResolution";

describe("TOURS registry", () => {
  it("has unique keys", () => {
    const keys = TOURS.map((t) => t.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("welcome tours have exactly one step and an exact route", () => {
    for (const t of TOURS.filter((x) => x.kind === "welcome")) {
      expect(t.steps.length, t.key).toBe(1);
      expect(t.route, t.key).toBeTruthy();
    }
  });

  it("rich tours have at least two steps", () => {
    for (const t of TOURS.filter((x) => x.kind === "rich")) {
      expect(t.steps.length, t.key).toBeGreaterThanOrEqual(2);
    }
  });

  it("resolves the Atendimento tours by path", () => {
    expect(resolveTourForPath("/app/atendimento", TOURS)?.key).toBe("atendimento-inbox");
    expect(resolveTourForPath("/app/atendimento/xyz", TOURS)?.key).toBe("atendimento-conversa");
  });

  it("resolves a welcome tour by path", () => {
    expect(resolveTourForPath("/app/clientes", TOURS)?.key).toBe("welcome-clientes");
  });

  it("getTourByKey finds a known tour", () => {
    expect(getTourByKey("welcome-pedidos")?.label).toBe("Pedidos");
    expect(getTourByKey("nope")).toBeUndefined();
  });
});
