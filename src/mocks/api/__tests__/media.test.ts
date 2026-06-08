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
    const asset = await mediaApi.ensureFromMessage(inbound({ mediaType: "sticker" }), "00000000-0000-0000-0000-000000000001");
    expect(asset.kind).toBe("image");
  });
  it("populates classification via classifyMedia at creation", async () => {
    // A nota-fiscal caption drives classifyMedia to 'nota_fiscal'.
    const nf = await mediaApi.ensureFromMessage(
      inbound({ mediaType: "document", text: "Segue a nota fiscal danfe 55321" }),
      "00000000-0000-0000-0000-000000000001",
    );
    expect(nf.classification).toBe("nota_fiscal");
    // An unmarked image still gets a (non-undefined) suggested classification.
    const img = await mediaApi.ensureFromMessage(inbound({ mediaType: "image" }), "00000000-0000-0000-0000-000000000001");
    expect(img.classification).toBeDefined();
  });

  it("auto-tags an inbound nota_fiscal message as sensitive (RF-021)", async () => {
    const nf = await mediaApi.ensureFromMessage(
      inbound({ mediaType: "document", text: "Segue a nota fiscal danfe 55321" }),
      "00000000-0000-0000-0000-000000000001",
    );
    expect(nf.classification).toBe("nota_fiscal");
    expect(nf.sensitivity).toBe("sensitive");
  });

  it("auto-tags an inbound comprovante message as sensitive (RF-021)", async () => {
    const comp = await mediaApi.ensureFromMessage(
      inbound({ mediaType: "image", text: "Segue o comprovante de transferência pix" }),
      "00000000-0000-0000-0000-000000000001",
    );
    expect(comp.classification).toBe("comprovante");
    expect(comp.sensitivity).toBe("sensitive");
  });

  it("keeps a non-sensitive classification as normal (RF-021)", async () => {
    const peca = await mediaApi.ensureFromMessage(
      inbound({ mediaType: "image", mediaUrl: "pastilha-freio.jpg" }),
      "00000000-0000-0000-0000-000000000001",
    );
    expect(peca.sensitivity).toBe("normal");
  });
});

describe("mediaApi.upload (RF-021 sensitivity derivation)", () => {
  it("auto-tags an uploaded nota_fiscal as sensitive", async () => {
    const asset = await mediaApi.upload({
      storeId: "00000000-0000-0000-0000-000000000001",
      kind: "document",
      mimeType: "application/pdf",
      sizeBytes: 64_000,
      authorType: "seller",
      direction: "out",
      classification: "nota_fiscal",
    });
    expect(asset.sensitivity).toBe("sensitive");
  });
  it("defaults to normal when no classification is supplied", async () => {
    const asset = await mediaApi.upload({
      storeId: "00000000-0000-0000-0000-000000000001",
      kind: "image",
      mimeType: "image/jpeg",
      sizeBytes: 64_000,
      authorType: "seller",
      direction: "out",
    });
    expect(asset.sensitivity).toBe("normal");
  });
});
