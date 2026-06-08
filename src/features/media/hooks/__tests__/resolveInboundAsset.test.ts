import { describe, expect, it } from "vitest";
import type { IMediaAsset, IMessage } from "@/shared/types";
import { resolveInboundAsset } from "../useEnsureInboundMedia";

function message(over: Partial<IMessage>): IMessage {
  return {
    id: "msg-1",
    conversationId: "conv-1",
    direction: "in",
    authorType: "customer",
    provider: "meta",
    text: "",
    status: "delivered",
    sentAt: "2026-06-05T12:00:00.000Z",
    mediaType: "image",
    mediaUrl: "https://picsum.photos/seed/x/600/400",
    ...over,
  };
}

function asset(over: Partial<IMediaAsset>): IMediaAsset {
  return {
    id: "media-1",
    storeId: "00000000-0000-0000-0000-000000000001",
    conversationId: "conv-1",
    messageId: "msg-1",
    kind: "image",
    mimeType: "image/jpeg",
    sizeBytes: 1000,
    authorType: "customer",
    direction: "in",
    createdAt: "2026-06-05T12:00:00.000Z",
    storageRef: "ref",
    persisted: true,
    sensitivity: "normal",
    ...over,
  };
}

describe("resolveInboundAsset", () => {
  it("skips a message that carries no media", () => {
    expect(resolveInboundAsset(message({ mediaType: undefined, mediaUrl: undefined }), null).action).toBe(
      "skip",
    );
  });
  it("dedups when an asset already exists for the message and is persisted", () => {
    const decision = resolveInboundAsset(message({}), asset({ persisted: true }));
    expect(decision.action).toBe("dedup");
  });
  it("retries when an asset exists but is not yet persisted", () => {
    const decision = resolveInboundAsset(message({}), asset({ persisted: false }));
    expect(decision.action).toBe("retry");
  });
  it("creates when no asset exists yet", () => {
    const decision = resolveInboundAsset(message({}), null);
    expect(decision.action).toBe("create");
  });
  it("only creates for inbound (direction 'in') media", () => {
    expect(resolveInboundAsset(message({ direction: "out" }), null).action).toBe("skip");
  });
});
