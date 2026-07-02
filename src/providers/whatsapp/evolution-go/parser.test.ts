import { describe, expect, it } from "vitest";
import { parseEvolutionGoInbound } from "./parser";
import { decodeGoMediaRef } from "./media";

function messageEvent(message: unknown, info: Record<string, unknown> = {}) {
  return {
    event: "Message",
    instanceId: "inst-uuid-1",
    instanceToken: "tok-1",
    data: {
      Info: {
        Chat: "5555988887777@s.whatsapp.net",
        Sender: "5555988887777@s.whatsapp.net",
        IsFromMe: false,
        Type: "text",
        PushName: "Cliente Teste",
        ID: "GOMSG1",
        Timestamp: "2026-06-25T10:00:00Z",
        ...info,
      },
      Message: message,
    },
  };
}

describe("parseEvolutionGoInbound", () => {
  it("normalizes conversation text", () => {
    const parsed = parseEvolutionGoInbound(messageEvent({ conversation: "preciso de um filtro" }), "acc-go-1");
    expect(parsed).toMatchObject({
      type: "message",
      providerMessageId: "GOMSG1",
      fromPhone: "+5555988887777",
      accountId: "acc-go-1",
      contentType: "text",
      text: "preciso de um filtro",
      senderName: "Cliente Teste",
    });
  });

  it("normalizes extendedTextMessage text", () => {
    const parsed = parseEvolutionGoInbound(
      messageEvent({ extendedTextMessage: { text: "olá com link" } }),
      "acc",
    );
    expect(parsed).toMatchObject({ contentType: "text", text: "olá com link" });
  });

  it("normalizes image with caption — mediaId carries the download metadata", () => {
    const parsed = parseEvolutionGoInbound(
      messageEvent(
        { imageMessage: { caption: "foto da peça", mimetype: "image/jpeg", url: "https://m/x.enc", directPath: "/v/t", mediaKey: "AAAA", fileLength: 99 } },
        { Type: "image" },
      ),
      "acc",
    ) as { type: string; contentType: string; mediaId: string; mediaCaption?: string };
    expect(parsed.type).toBe("message");
    expect(parsed.contentType).toBe("image");
    expect(parsed.mediaCaption).toBe("foto da peça");
    // The media sub-node is forwarded VERBATIM under its proto key, so the
    // download call can POST it back as `{ message: { imageMessage: … } }`.
    expect(decodeGoMediaRef(parsed.mediaId)).toEqual({
      imageMessage: {
        caption: "foto da peça",
        mimetype: "image/jpeg",
        url: "https://m/x.enc",
        directPath: "/v/t",
        mediaKey: "AAAA",
        fileLength: 99,
      },
    });
  });

  it("normalizes a shared location into the canonical location text", () => {
    const parsed = parseEvolutionGoInbound(
      messageEvent(
        { locationMessage: { name: "Oficina Central", degreesLatitude: -27.39, degreesLongitude: -53.4 } },
        { Type: "location" },
      ),
      "acc",
    ) as { contentType: string; text: string };
    expect(parsed.contentType).toBe("location");
    expect(parsed.text).toBe("Oficina Central\n-27.39,-53.4");
  });

  it("normalizes a shared contact (name + phone from the vCard)", () => {
    const parsed = parseEvolutionGoInbound(
      messageEvent(
        {
          contactMessage: {
            displayName: "Fornecedor X",
            vcard: "BEGIN:VCARD\nFN:Fornecedor X\nTEL;waid=5554998887777:+55 54 99888-7777\nEND:VCARD",
          },
        },
        { Type: "contact" },
      ),
      "acc",
    ) as { contentType: string; text: string };
    expect(parsed.contentType).toBe("contact");
    expect(parsed.text).toBe("Fornecedor X\n+5554998887777");
  });

  it("returns outbound-echo when IsFromMe=true", () => {
    const parsed = parseEvolutionGoInbound(
      messageEvent({ conversation: "eco" }, { IsFromMe: true }),
      "acc",
    );
    expect(parsed).toMatchObject({ type: "outbound-echo", toPhone: "+5555988887777", contentType: "text", text: "eco" });
  });

  it("parses the SendMessage event kind (phone-sent) as outbound-echo", () => {
    const ev = messageEvent({ conversation: "mandei do celular" }, { IsFromMe: true });
    (ev as { event?: string }).event = "SendMessage";
    const parsed = parseEvolutionGoInbound(ev, "acc-1");
    expect(parsed.type).toBe("outbound-echo");
    if (parsed.type === "outbound-echo") {
      expect(parsed.text).toBe("mandei do celular");
    }
  });

  it("maps Receipt delivered/read to status (state at top OR data.Type)", () => {
    const delivered = parseEvolutionGoInbound(
      { event: "Receipt", instanceId: "i", data: { MessageIDs: ["GOMSG1"], Type: "delivered", Timestamp: "2026-06-25T10:01:00Z" } },
      "acc",
    );
    expect(delivered).toMatchObject({ type: "status", providerMessageId: "GOMSG1", status: "delivered" });

    const read = parseEvolutionGoInbound(
      { event: "Receipt", state: "Read", instanceId: "i", data: { MessageIDs: ["GOMSG2"] } },
      "acc",
    );
    expect(read).toMatchObject({ type: "status", providerMessageId: "GOMSG2", status: "read" });
  });

  it("parses a unix-seconds Timestamp into ISO", () => {
    const parsed = parseEvolutionGoInbound(
      { event: "Receipt", state: "Delivered", instanceId: "i", data: { MessageIDs: ["GOMSG9"], Timestamp: 1750845600 } },
      "acc",
    ) as { timestamp: string };
    expect(parsed.timestamp).toBe(new Date(1750845600 * 1000).toISOString());
  });

  it("inbound document exposes the original fileName as mediaFilename", () => {
    const parsed = parseEvolutionGoInbound(
      {
        event: "Message",
        data: {
          Info: {
            Chat: "5555988887777@s.whatsapp.net",
            Sender: "5555988887777@s.whatsapp.net",
            IsFromMe: false,
            ID: "G-doc",
            Timestamp: 1750000000,
          },
          Message: {
            documentMessage: { fileName: "NF-4321.pdf", caption: "nota", url: "u", mediaKey: "k" },
          },
        },
      },
      "acc-1",
    );
    expect(parsed).toMatchObject({
      type: "message",
      contentType: "document",
      mediaFilename: "NF-4321.pdf",
    });
  });

  it("throws on group/@lid chats and on non-message events", () => {
    expect(() =>
      parseEvolutionGoInbound(messageEvent({ conversation: "x" }, { Chat: "123@g.us" }), "acc"),
    ).toThrow();
    expect(() =>
      parseEvolutionGoInbound(messageEvent({ conversation: "x" }, { Chat: "123@lid" }), "acc"),
    ).toThrow();
    expect(() => parseEvolutionGoInbound({ event: "Connection", data: {} }, "acc")).toThrow();
    expect(() => parseEvolutionGoInbound({ foo: "bar" }, "acc")).toThrow();
  });
});
