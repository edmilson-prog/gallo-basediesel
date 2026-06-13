import { describe, expect, it } from "vitest";
import { WhatsAppProviderError } from "../errors";
import { buildScheduledSendRequest, buildSystemSender, type IScheduledPayload } from "./core";

describe("buildScheduledSendRequest — snippet (the only server-dispatchable kind)", () => {
  it("maps a snippet payload to a text send request", () => {
    const req = buildScheduledSendRequest("conv-1", {
      type: "snippet",
      contextMessage: "Bom dia! Seu orçamento está pronto.",
    });
    expect(req).toEqual({
      conversationId: "conv-1",
      kind: "text",
      text: "Bom dia! Seu orçamento está pronto.",
    });
  });

  it("trims surrounding whitespace from the message", () => {
    const req = buildScheduledSendRequest("conv-1", {
      type: "snippet",
      contextMessage: "  olá  ",
    });
    expect(req.text).toBe("olá");
  });

  it("rejects an empty message with VALIDATION_ERROR", () => {
    for (const contextMessage of ["", "   ", undefined]) {
      try {
        buildScheduledSendRequest("conv-1", { type: "snippet", contextMessage });
        expect.unreachable("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(WhatsAppProviderError);
        expect((err as WhatsAppProviderError).code).toBe("VALIDATION_ERROR");
      }
    }
  });

  it("rejects a missing conversationId with VALIDATION_ERROR", () => {
    expect(() => buildScheduledSendRequest("", { type: "snippet", contextMessage: "oi" })).toThrow(
      WhatsAppProviderError,
    );
  });
});

describe("buildScheduledSendRequest — unsupported payload types fail loudly", () => {
  it.each<IScheduledPayload["type"]>(["asset", "combo", "product"])(
    "rejects %s with NOT_SUPPORTED",
    (type) => {
      try {
        buildScheduledSendRequest("conv-1", { type, assetIds: ["a"], contextMessage: "x" });
        expect.unreachable("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(WhatsAppProviderError);
        expect((err as WhatsAppProviderError).code).toBe("NOT_SUPPORTED");
        // The message becomes the scheduled row's failure_reason — must name the type.
        expect((err as WhatsAppProviderError).message).toContain(type);
      }
    },
  );
});

describe("buildSystemSender", () => {
  it("builds a trusted staff sender scoped to the store, with null seller", () => {
    expect(buildSystemSender("store-7")).toEqual({
      sellerId: null,
      role: "owner",
      storeId: "store-7",
    });
  });
});

describe("buildScheduledSendRequest — media (image/video/audio/document)", () => {
  it("maps a media payload to a media send request with path, type, filename and caption", () => {
    const req = buildScheduledSendRequest("conv-1", {
      type: "media",
      mediaPath: "store-1/2026/06/turbo-scania.jpg",
      mediaType: "image",
      fileName: "turbo-scania.jpg",
      contextMessage: "Segue o orçamento do turbo.",
    });
    expect(req).toEqual({
      conversationId: "conv-1",
      kind: "media",
      mediaPath: "store-1/2026/06/turbo-scania.jpg",
      mediaType: "image",
      fileName: "turbo-scania.jpg",
      text: "Segue o orçamento do turbo.",
    });
  });

  it("allows media with no caption (empty text)", () => {
    const req = buildScheduledSendRequest("conv-1", {
      type: "media",
      mediaPath: "store-1/a.pdf",
      mediaType: "document",
      fileName: "a.pdf",
    });
    expect(req.text).toBe("");
    expect(req.kind).toBe("media");
  });

  it("rejects media without a mediaPath with VALIDATION_ERROR", () => {
    try {
      buildScheduledSendRequest("conv-1", { type: "media", mediaType: "image" });
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(WhatsAppProviderError);
      expect((err as WhatsAppProviderError).code).toBe("VALIDATION_ERROR");
    }
  });
});
