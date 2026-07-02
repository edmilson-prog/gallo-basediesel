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

  it("parses fromMe echo carried as extendedTextMessage", () => {
    const parsed = parseEvolutionInbound(
      upsertEvent({ fromMe: true, message: { extendedTextMessage: { text: "segue o link" } } }),
      "",
    );
    expect(parsed).toMatchObject({
      type: "outbound-echo",
      contentType: "text",
      text: "segue o link",
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

  it.each([
    ["inbound", false],
    ["fromMe", true],
  ])("throws for @lid jids (no resolvable phone), %s", (_label, fromMe) => {
    expect(() =>
      parseEvolutionInbound(upsertEvent({ fromMe, remoteJid: "20363041234567890@lid" }), ""),
    ).toThrow(/@lid/);
  });
});

describe("parseEvolutionInbound — structured shares (location/contact)", () => {
  it("normalizes a shared location into the canonical location text", () => {
    const parsed = parseEvolutionInbound(
      upsertEvent({
        message: { locationMessage: { name: "Oficina Central", degreesLatitude: -27.39, degreesLongitude: -53.4 } },
      }),
      "",
    ) as { contentType: string; text: string };
    expect(parsed.contentType).toBe("location");
    expect(parsed.text).toBe("Oficina Central\n-27.39,-53.4");
  });

  it("falls back to the location address when no name was attached", () => {
    const parsed = parseEvolutionInbound(
      upsertEvent({
        message: {
          locationMessage: { address: "Av. Brasil, 1000 - Centro", degreesLatitude: -27.39, degreesLongitude: -53.4 },
        },
      }),
      "",
    ) as { contentType: string; text: string };
    expect(parsed.text).toBe("Av. Brasil, 1000 - Centro\n-27.39,-53.4");
  });

  it("normalizes a single shared contact (name + phone from the vCard)", () => {
    const parsed = parseEvolutionInbound(
      upsertEvent({
        message: {
          contactMessage: {
            displayName: "Fornecedor X",
            vcard: "BEGIN:VCARD\nFN:Fornecedor X\nTEL;waid=5554998887777:+55 54 99888-7777\nEND:VCARD",
          },
        },
      }),
      "",
    ) as { contentType: string; text: string };
    expect(parsed.contentType).toBe("contact");
    expect(parsed.text).toBe("Fornecedor X\n+5554998887777");
  });

  it("surfaces the first card of a multi-contact (contactsArrayMessage) share", () => {
    const parsed = parseEvolutionInbound(
      upsertEvent({
        message: {
          contactsArrayMessage: {
            contacts: [
              { displayName: "Primeiro", vcard: "BEGIN:VCARD\nTEL;waid=5511999990000:+55 11 99999-0000\nEND:VCARD" },
              { displayName: "Segundo", vcard: "BEGIN:VCARD\nTEL;waid=5511888880000:+55 11 88888-0000\nEND:VCARD" },
            ],
          },
        },
      }),
      "",
    ) as { contentType: string; text: string };
    expect(parsed.contentType).toBe("contact");
    expect(parsed.text).toBe("Primeiro\n+5511999990000");
  });
});

describe("parseEvolutionInbound — document filename (mediaFilename)", () => {
  it("inbound document exposes the original fileName as mediaFilename", () => {
    const parsed = parseEvolutionInbound(
      {
        event: "messages.upsert",
        sender: "5555911111111@s.whatsapp.net",
        data: {
          key: { id: "M-doc", remoteJid: "5555988887777@s.whatsapp.net", fromMe: false },
          message: { documentMessage: { fileName: "Catalogo-UFI.pdf", caption: "segue" } },
          messageTimestamp: 1750000000,
        },
      },
      "acc-1",
    );
    expect(parsed).toMatchObject({
      type: "message",
      contentType: "document",
      mediaFilename: "Catalogo-UFI.pdf",
    });
  });

  it("outbound-echo document also carries mediaFilename", () => {
    const parsed = parseEvolutionInbound(
      {
        event: "messages.upsert",
        data: {
          key: { id: "M-echo", remoteJid: "5555988887777@s.whatsapp.net", fromMe: true },
          message: { documentMessage: { fileName: "Tabela-precos.xlsx" } },
          messageTimestamp: 1750000000,
        },
      },
      "acc-1",
    );
    expect(parsed).toMatchObject({ type: "outbound-echo", mediaFilename: "Tabela-precos.xlsx" });
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
