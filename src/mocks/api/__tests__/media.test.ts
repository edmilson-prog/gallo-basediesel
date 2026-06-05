import { describe, expect, it } from "vitest";
import type { IMessage } from "@/shared/types";
import { mediaApi } from "../media";

function inbound(over: Partial<IMessage>): IMessage {
  return {
    id: `msg-test-${Math.random().toString(36).slice(2)}`,
    conversationId: "conv-test",
    direction: "in",
    authorType: "customer",
    provider: "mock",
    text: "",
    status: "delivered",
    sentAt: "2026-06-05T12:00:00.000Z",
    ...over,
  };
}

describe("mediaApi.ensureFromMessage (creation wiring)", () => {
  it("normalizes a sticker message to kind 'image' (4-kind invariant)", async () => {
    const asset = await mediaApi.ensureFromMessage(inbound({ mediaType: "sticker" }), "store-matriz");
    expect(asset.kind).toBe("image");
  });
  it("populates classification via classifyMedia at creation", async () => {
    // A nota-fiscal caption drives classifyMedia to 'nota_fiscal'.
    const nf = await mediaApi.ensureFromMessage(
      inbound({ mediaType: "document", text: "Segue a nota fiscal danfe 55321" }),
      "store-matriz",
    );
    expect(nf.classification).toBe("nota_fiscal");
    // An unmarked image still gets a (non-undefined) suggested classification.
    const img = await mediaApi.ensureFromMessage(inbound({ mediaType: "image" }), "store-matriz");
    expect(img.classification).toBeDefined();
  });
});
