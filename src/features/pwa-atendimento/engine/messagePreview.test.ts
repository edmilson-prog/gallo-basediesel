import { describe, expect, it } from "vitest";
import type { IMessage, MessageMediaType } from "@/shared/types";
import { buildPwaPreview } from "./messagePreview";

function message(overrides: Partial<IMessage> = {}): IMessage {
  return {
    id: "m1",
    conversationId: "c1",
    direction: "in",
    authorType: "customer",
    provider: "waha",
    text: "Bom dia",
    status: "delivered",
    sentAt: "2026-08-11T09:00:00.000Z",
    ...overrides,
  };
}

describe("buildPwaPreview", () => {
  it("returns plain inbound text with no icon", () => {
    expect(buildPwaPreview(message())).toEqual({ icon: null, text: "Bom dia" });
  });

  it("marks outbound messages with the sender prefix", () => {
    expect(buildPwaPreview(message({ direction: "out" })).text).toBe("Você: Bom dia");
  });

  it("labels media with an icon instead of an emoji", () => {
    const preview = buildPwaPreview(message({ mediaType: "audio", text: "" }));
    expect(preview).toEqual({ icon: "mdi:microphone", text: "Áudio" });
    expect(preview.text).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it("prefers a caption over the generic media label", () => {
    expect(buildPwaPreview(message({ mediaType: "image", text: "Etiqueta do bico" }))).toEqual({
      icon: "mdi:image-outline",
      text: "Etiqueta do bico",
    });
  });

  it("keeps the prefix on outbound media", () => {
    expect(buildPwaPreview(message({ direction: "out", mediaType: "document", text: "" })).text).toBe(
      "Você: Documento",
    );
  });

  it("covers every media type", () => {
    const types: MessageMediaType[] = [
      "image",
      "audio",
      "video",
      "document",
      "sticker",
      "location",
      "contact",
    ];
    for (const mediaType of types) {
      const preview = buildPwaPreview(message({ mediaType, text: "" }));
      expect(preview.icon).toBeTruthy();
      expect(preview.text.length).toBeGreaterThan(0);
    }
  });

  it("names a content-free message instead of rendering a blank row", () => {
    expect(buildPwaPreview(message({ text: "   " }))).toEqual({
      icon: null,
      text: "Mensagem não suportada",
    });
  });

  it("returns empty for a conversation with no messages yet", () => {
    expect(buildPwaPreview(null)).toEqual({ icon: null, text: "" });
  });
});
