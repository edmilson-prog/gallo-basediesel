import { describe, expect, it } from "vitest";
import { createInboundToastAccumulator } from "./inboundToastAccumulator";

describe("createInboundToastAccumulator", () => {
  it("starts a conversation at count 1", () => {
    const acc = createInboundToastAccumulator();
    expect(acc.register("conv-1", "Bom dia")).toEqual({ preview: "Bom dia", count: 1 });
  });

  it("counts up and keeps the most recent preview", () => {
    const acc = createInboundToastAccumulator();
    acc.register("conv-1", "Bom dia");
    acc.register("conv-1", "Tem esse filtro?");
    expect(acc.register("conv-1", "E o preço?")).toEqual({ preview: "E o preço?", count: 3 });
  });

  it("keeps conversations independent", () => {
    const acc = createInboundToastAccumulator();
    acc.register("conv-1", "Bom dia");
    acc.register("conv-1", "Tem esse filtro?");
    expect(acc.register("conv-2", "Boa tarde")).toEqual({ preview: "Boa tarde", count: 1 });
    expect(acc.peek("conv-1")?.count).toBe(2);
  });

  it("peeks without mutating", () => {
    const acc = createInboundToastAccumulator();
    acc.register("conv-1", "Bom dia");
    expect(acc.peek("conv-1")).toEqual({ preview: "Bom dia", count: 1 });
    expect(acc.peek("conv-1")).toEqual({ preview: "Bom dia", count: 1 });
  });

  it("peeks null for an unknown conversation", () => {
    expect(createInboundToastAccumulator().peek("nope")).toBeNull();
  });

  it("restarts the count after clear", () => {
    const acc = createInboundToastAccumulator();
    acc.register("conv-1", "Bom dia");
    acc.register("conv-1", "Tem esse filtro?");
    acc.clear("conv-1");
    expect(acc.peek("conv-1")).toBeNull();
    expect(acc.register("conv-1", "Voltei")).toEqual({ preview: "Voltei", count: 1 });
  });

  it("clears every conversation at once", () => {
    const acc = createInboundToastAccumulator();
    acc.register("conv-1", "Bom dia");
    acc.register("conv-2", "Boa tarde");
    acc.clearAll();
    expect(acc.peek("conv-1")).toBeNull();
    expect(acc.peek("conv-2")).toBeNull();
  });
});
