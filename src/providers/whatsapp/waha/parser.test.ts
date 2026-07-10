import { describe, expect, it } from "vitest";
import { parseWahaMessageEvent } from "./parser";

const accountId = "acct-1";

describe("parseWahaMessageEvent", () => {
  it("parses an inbound text message", () => {
    const result = parseWahaMessageEvent(
      {
        id: "true_5511988887777@c.us_ABC123",
        timestamp: 1720000000,
        from: "5511988887777@c.us",
        fromMe: false,
        to: "5511999998888@c.us",
        body: "Olá, tudo bem?",
        hasMedia: false,
      },
      accountId,
    );
    expect(result.type).toBe("message");
    if (result.type !== "message") throw new Error("expected message");
    expect(result.fromPhone).toBe("+5511988887777");
    expect(result.contentType).toBe("text");
    expect(result.text).toBe("Olá, tudo bem?");
    expect(result.providerMessageId).toBe("true_5511988887777@c.us_ABC123");
    expect(result.accountId).toBe(accountId);
  });

  it("parses an inbound image message with media", () => {
    const result = parseWahaMessageEvent(
      {
        id: "id2",
        timestamp: 1720000001,
        from: "5511988887777@c.us",
        fromMe: false,
        to: "5511999998888@c.us",
        body: "",
        hasMedia: true,
        media: {
          url: "https://waha.example.com/api/files/id2.jpg",
          mimetype: "image/jpeg",
          filename: null,
        },
      },
      accountId,
    );
    if (result.type !== "message") throw new Error("expected message");
    expect(result.contentType).toBe("image");
    expect(result.mediaId).toBe("https://waha.example.com/api/files/id2.jpg");
  });

  it("parses an inbound document with filename", () => {
    const result = parseWahaMessageEvent(
      {
        id: "id3",
        timestamp: 1720000002,
        from: "5511988887777@c.us",
        fromMe: false,
        to: "5511999998888@c.us",
        body: "",
        hasMedia: true,
        media: {
          url: "https://waha.example.com/api/files/id3.pdf",
          mimetype: "application/pdf",
          filename: "nota.pdf",
        },
      },
      accountId,
    );
    if (result.type !== "message") throw new Error("expected message");
    expect(result.contentType).toBe("document");
    expect(result.mediaFilename).toBe("nota.pdf");
  });

  it("parses fromMe=true as an outbound echo", () => {
    const result = parseWahaMessageEvent(
      {
        id: "id4",
        timestamp: 1720000003,
        from: "5511999998888@c.us",
        fromMe: true,
        to: "5511988887777@c.us",
        body: "Retorno já já",
        hasMedia: false,
      },
      accountId,
    );
    expect(result.type).toBe("outbound-echo");
    if (result.type !== "outbound-echo") throw new Error("expected outbound-echo");
    expect(result.toPhone).toBe("+5511988887777");
    expect(result.text).toBe("Retorno já já");
  });

  it("throws on a group chat (@g.us)", () => {
    expect(() =>
      parseWahaMessageEvent(
        {
          id: "id5",
          timestamp: 1720000004,
          from: "120363000000000000@g.us",
          fromMe: false,
          to: "5511999998888@c.us",
          body: "oi grupo",
          hasMedia: false,
        },
        accountId,
      ),
    ).toThrow();
  });
});
