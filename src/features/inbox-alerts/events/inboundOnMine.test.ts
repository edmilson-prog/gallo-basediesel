import { describe, expect, it, vi } from "vitest";
import { emitInboundOnMine, subscribeInboundOnMine } from "./inboundOnMine";

describe("inboundOnMine emitter", () => {
  it("delivers the event to a subscriber", () => {
    const listener = vi.fn();
    const off = subscribeInboundOnMine(listener);
    emitInboundOnMine({ conversationId: "conv-1", text: "Bom dia", mediaType: null });
    expect(listener).toHaveBeenCalledWith({
      conversationId: "conv-1",
      text: "Bom dia",
      mediaType: null,
    });
    off();
  });

  it("stops delivering after unsubscribe", () => {
    const listener = vi.fn();
    const off = subscribeInboundOnMine(listener);
    off();
    emitInboundOnMine({ conversationId: "conv-1" });
    expect(listener).not.toHaveBeenCalled();
  });

  it("delivers to every subscriber", () => {
    const a = vi.fn();
    const b = vi.fn();
    const offA = subscribeInboundOnMine(a);
    const offB = subscribeInboundOnMine(b);
    emitInboundOnMine({ conversationId: "conv-1" });
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    offA();
    offB();
  });

  it("does not throw with no subscriber", () => {
    expect(() => emitInboundOnMine({ conversationId: "conv-1" })).not.toThrow();
  });

  it("keeps delivering when one listener throws", () => {
    const boom = vi.fn(() => {
      throw new Error("boom");
    });
    const healthy = vi.fn();
    const offBoom = subscribeInboundOnMine(boom);
    const offHealthy = subscribeInboundOnMine(healthy);
    expect(() => emitInboundOnMine({ conversationId: "conv-1" })).not.toThrow();
    expect(healthy).toHaveBeenCalledTimes(1);
    offBoom();
    offHealthy();
  });
});
