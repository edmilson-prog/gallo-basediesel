import { describe, it, expect } from "vitest";
import { nextStatusOnOutboundHuman } from "./statusFlow";

describe("nextStatusOnOutboundHuman", () => {
  it("claims aguardando, aguardando_cliente and resolvida into em_andamento", () => {
    expect(nextStatusOnOutboundHuman("aguardando")).toBe("em_andamento");
    expect(nextStatusOnOutboundHuman("aguardando_cliente")).toBe("em_andamento");
    expect(nextStatusOnOutboundHuman("resolvida")).toBe("em_andamento");
  });

  it("is a no-op when already em_andamento", () => {
    expect(nextStatusOnOutboundHuman("em_andamento")).toBeNull();
  });

  it("never touches an archived conversation", () => {
    expect(nextStatusOnOutboundHuman("arquivada")).toBeNull();
  });
});
