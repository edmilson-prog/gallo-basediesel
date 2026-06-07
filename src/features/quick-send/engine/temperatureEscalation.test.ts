import { describe, expect, it } from "vitest";
import { nextTemperature } from "./temperatureEscalation";

describe("nextTemperature", () => {
  it("escalates frio → morno", () => {
    expect(nextTemperature("frio")).toBe("morno");
  });
  it("escalates morno → quente", () => {
    expect(nextTemperature("morno")).toBe("quente");
  });
  it("keeps quente stable (never overflows)", () => {
    expect(nextTemperature("quente")).toBe("quente");
  });
});
