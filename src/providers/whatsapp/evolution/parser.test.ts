import { describe, expect, it } from "vitest";
import { parseEvolutionInbound } from "./parser";

function upsertEvent(overrides: {
  fromMe?: boolean;
  remoteJid?: string;
  message?: Record<string, unknown>;
  keyId?: string;
}) {
  return {
    event: "messages.upsert",
    instance: "gallo-matriz",
    sender: "5555911111111@s.whatsapp.net",
    data: {
      key: {
        id: overrides.keyId ?? "KEY1",
        remoteJid: overrides.remoteJid ?? "5555988887777@s.whatsapp.net",
        fromMe: overrides.fromMe ?? false,
      },
      message: overrides.message ?? { conversation: "olá" },
      messageTimestamp: 1765400000,
    },
  };
}

describe("parseEvolutionInbound — outbound echo (fromMe)", () => {
  it("parses fromMe=true as outbound-echo with destination phone and content", () => {
    const parsed = parseEvolutionInbound(
      upsertEvent({ fromMe: true, message: { conversation: "te envio o boleto" }, keyId: "3EB0X" }),
      "",
    );
    expect(parsed).toMatchObject({
      type: "outbound-echo",
      providerMessageId: "3EB0X",
      toPhone: "+5555988887777",
      contentType: "text",
      text: "te envio o boleto",
      timestamp: new Date(1765400000 * 1000).toISOString(),
    });
  });

  it("parses fromMe media echo with caption and contentType", () => {
    const parsed = parseEvolutionInbound(
      upsertEvent({ fromMe: true, message: { imageMessage: { caption: "orçamento" } } }),
      "",
    );
    expect(parsed).toMatchObject({
      type: "outbound-echo",
      contentType: "image",
      mediaCaption: "orçamento",
    });
  });
});

describe("parseEvolutionInbound — group/broadcast guard", () => {
  it.each([
    ["group", "120363041234567890@g.us"],
    ["status broadcast", "status@broadcast"],
    ["newsletter", "120363041234567890@newsletter"],
  ])("throws (= ignored upstream) for %s jids, inbound", (_label, remoteJid) => {
    expect(() => parseEvolutionInbound(upsertEvent({ remoteJid }), "")).toThrow(/grupo|broadcast/i);
  });

  it("throws for group jids even when fromMe=true", () => {
    expect(() =>
      parseEvolutionInbound(upsertEvent({ fromMe: true, remoteJid: "1203630@g.us" }), ""),
    ).toThrow(/grupo|broadcast/i);
  });
});

describe("parseEvolutionInbound — regression", () => {
  it("still parses a customer text message as inbound", () => {
    const parsed = parseEvolutionInbound(upsertEvent({}), "");
    expect(parsed).toMatchObject({
      type: "message",
      fromPhone: "+5555988887777",
      contentType: "text",
      text: "olá",
    });
  });

  it("still parses messages.update as status", () => {
    const parsed = parseEvolutionInbound(
      {
        event: "messages.update",
        instance: "gallo-matriz",
        data: { keyId: "K9", status: "READ", messageTimestamp: 1765400000 },
      },
      "",
    );
    expect(parsed).toMatchObject({ type: "status", providerMessageId: "K9", status: "read" });
  });
});
