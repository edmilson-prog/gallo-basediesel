import { describe, expect, it } from "vitest";
import type { IMessage } from "@/shared/types";
import { isContentFreeMessage } from "./contentFreeMessage";

function message(overrides: Partial<IMessage>): IMessage {
  return {
    id: "m1",
    conversationId: "c1",
    direction: "in",
    authorType: "customer",
    provider: "waha",
    text: "",
    status: "delivered",
    sentAt: "2026-07-21T13:10:00.000Z",
    receivedAt: "2026-07-21T13:10:00.000Z",
    ...overrides,
  } as IMessage;
}

describe("isContentFreeMessage", () => {
  it("flags a message with neither text nor media", () => {
    expect(isContentFreeMessage(message({ text: "" }))).toBe(true);
  });

  it("flags a whitespace-only message", () => {
    expect(isContentFreeMessage(message({ text: "   \n  " }))).toBe(true);
  });

  it("does not flag a message with text", () => {
    expect(isContentFreeMessage(message({ text: "Bom dia" }))).toBe(false);
  });

  it("does not flag caption-less media, whose bubble renders the media itself", () => {
    expect(isContentFreeMessage(message({ text: "", mediaType: "image" }))).toBe(false);
  });

  it("does not flag a structured share that encodes its data in text", () => {
    expect(isContentFreeMessage(message({ text: "-27.39,-53.40", mediaType: "location" }))).toBe(
      false,
    );
  });

  it("does not flag a sticker, which renders as an image", () => {
    expect(isContentFreeMessage(message({ text: "", mediaType: "sticker" }))).toBe(false);
  });
});
