import { describe, expect, it } from "vitest";
import type { IMessage } from "@/shared/types";
import { canReplyTo, quotedAuthorLabel, quotedMediaLabel } from "./replyRef";

function message(patch: Partial<IMessage> = {}): IMessage {
  return {
    id: "m1",
    conversationId: "c1",
    direction: "in",
    authorType: "customer",
    provider: "waha",
    text: "oi",
    status: "delivered",
    sentAt: "2026-08-10T12:00:00.000Z",
    ...patch,
  };
}

describe("canReplyTo", () => {
  it("allows quoting a delivered inbound message", () => {
    expect(canReplyTo(message())).toBe(true);
  });

  it("allows quoting a sent outbound message", () => {
    expect(canReplyTo(message({ direction: "out", status: "sent" }))).toBe(true);
  });

  // A queued/failed message never reached WhatsApp, so it has no provider id
  // for WAHA's reply_to — offering the action would produce a send with a
  // silently dropped quote.
  it("refuses a message that never left (queued or failed)", () => {
    expect(canReplyTo(message({ status: "queued" }))).toBe(false);
    expect(canReplyTo(message({ status: "failed" }))).toBe(false);
  });

  it("refuses a system message", () => {
    expect(canReplyTo(message({ authorType: "system" }))).toBe(false);
  });
});

describe("quotedAuthorLabel", () => {
  it("labels our own message as Você", () => {
    expect(quotedAuthorLabel({ direction: "out" }, "João Transportes")).toBe("Você");
  });

  it("uses the contact name for the customer's message", () => {
    expect(quotedAuthorLabel({ direction: "in" }, "João Transportes")).toBe("João Transportes");
  });

  it("falls back to Cliente when the contact has no name", () => {
    expect(quotedAuthorLabel({ direction: "in" }, undefined)).toBe("Cliente");
    expect(quotedAuthorLabel({ direction: "in" }, "   ")).toBe("Cliente");
  });
});

describe("quotedMediaLabel", () => {
  it("returns null when the quote has readable text", () => {
    expect(quotedMediaLabel({ text: "Filtro racor", mediaType: "image" })).toBeNull();
  });

  it("labels an image without caption", () => {
    expect(quotedMediaLabel({ mediaType: "image" })).toEqual({
      icon: "mdi:image",
      label: "Foto",
    });
  });

  it("labels an audio without caption", () => {
    expect(quotedMediaLabel({ mediaType: "audio" })).toEqual({
      icon: "mdi:microphone",
      label: "Áudio",
    });
  });

  it("labels a document without caption", () => {
    expect(quotedMediaLabel({ mediaType: "document" })).toEqual({
      icon: "mdi:file-document",
      label: "Documento",
    });
  });

  it("falls back to a generic label when there is neither text nor media type", () => {
    expect(quotedMediaLabel({})).toEqual({
      icon: "mdi:message-outline",
      label: "Mensagem",
    });
  });
});
