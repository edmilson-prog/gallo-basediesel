import { describe, expect, it } from "vitest";
import { parseOpenWaInbound } from "./parser";

function messageEvent(overrides: {
  direction?: "incoming" | "outgoing";
  from?: string;
  to?: string;
  type?: string;
  body?: string;
  waMessageId?: string;
  chatName?: string;
  metadata?: { media?: { mimetype?: string; data?: string; filename?: string } } | null;
  event?: string;
}) {
  return {
    event: overrides.event ?? "message.received",
    sessionId: "sess-1",
    data: {
      id: "row-uuid-1",
      sessionId: "sess-1",
      waMessageId: overrides.waMessageId ?? "MSG1",
      chatId: overrides.from ?? "5555988887777@c.us",
      chatName: overrides.chatName ?? "Cliente Teste",
      from: overrides.from ?? "5555988887777@c.us",
      to: overrides.to ?? "5555911111111@c.us",
      body: overrides.body ?? "olá",
      type: overrides.type ?? "text",
      direction: overrides.direction ?? "incoming",
      timestamp: 1765400000,
      metadata: overrides.metadata ?? null,
      status: "sent",
      createdAt: "2026-07-07T00:00:00.000Z",
    },
  };
}

describe("parseOpenWaInbound — inbound text", () => {
  it("normalizes a text-type message as inbound text", () => {
    const parsed = parseOpenWaInbound(messageEvent({}), "acc-openwa-1");
    expect(parsed).toMatchObject({
      type: "message",
      providerMessageId: "MSG1",
      fromPhone: "+5555988887777",
      toAccountPhone: "+5555911111111",
      accountId: "acc-openwa-1",
      contentType: "text",
      text: "olá",
      senderName: "Cliente Teste",
    });
  });

  it("falls back to the row id when waMessageId is missing", () => {
    const parsed = parseOpenWaInbound(
      {
        event: "message.received",
        sessionId: "sess-1",
        data: {
          id: "PLAINID",
          from: "5555988887777@c.us",
          to: "5555911111111@c.us",
          type: "text",
          direction: "incoming",
          body: "oi",
          timestamp: 1765400000,
        },
      },
      "acc",
    );
    expect(parsed).toMatchObject({ providerMessageId: "PLAINID" });
  });
});

describe("parseOpenWaInbound — outbound echo (direction=outgoing)", () => {
  it("classifies a fromMe waMessageId (true_...) as echo even when direction lies as incoming", () => {
    // Confirmed live 2026-07-09: the server's history re-sync delivered
    // phone-sent messages with direction "incoming" — trusting it minted a
    // customer for the account's OWN number. The id prefix is authoritative.
    const parsed = parseOpenWaInbound(
      messageEvent({
        direction: "incoming",
        waMessageId: "true_5555911111111@c.us_AC42",
        body: "Bom dia Filha",
      }),
      "acc",
    );
    expect(parsed).toMatchObject({
      type: "outbound-echo",
      providerMessageId: "true_5555911111111@c.us_AC42",
      toPhone: "+5555911111111",
      text: "Bom dia Filha",
    });
  });

  it("parses an outgoing message as outbound-echo with destination phone and content", () => {
    const parsed = parseOpenWaInbound(
      messageEvent({ direction: "outgoing", body: "te envio o boleto", waMessageId: "ECHO1" }),
      "acc",
    );
    expect(parsed).toMatchObject({
      type: "outbound-echo",
      providerMessageId: "ECHO1",
      toPhone: "+5555911111111",
      contentType: "text",
      text: "te envio o boleto",
    });
  });

  it("parses an outgoing media echo with mediaId packing the inline bytes", () => {
    const parsed = parseOpenWaInbound(
      messageEvent({
        direction: "outgoing",
        type: "image",
        waMessageId: "ECHOIMG",
        body: "orçamento",
        metadata: { media: { mimetype: "image/jpeg", data: "YQ==" } },
      }),
      "acc",
    ) as { type: string; contentType: string; mediaId?: string; mediaCaption?: string };
    expect(parsed).toMatchObject({
      type: "outbound-echo",
      contentType: "image",
      mediaCaption: "orçamento",
    });
    expect(parsed.mediaId).toBeDefined();
    expect(JSON.parse(parsed.mediaId!)).toMatchObject({ data: "YQ==", mimeType: "image/jpeg" });
  });
});

describe("parseOpenWaInbound — media types", () => {
  it("normalizes an image with caption, mediaId packing the inline base64", () => {
    const parsed = parseOpenWaInbound(
      messageEvent({
        type: "image",
        waMessageId: "IMG1",
        body: "foto da peça",
        metadata: { media: { mimetype: "image/png", data: "Zm90bw==", filename: undefined } },
      }),
      "acc",
    ) as { contentType: string; mediaId?: string; mediaCaption?: string };
    expect(parsed).toMatchObject({ type: "message", contentType: "image", mediaCaption: "foto da peça" });
    expect(JSON.parse(parsed.mediaId!)).toMatchObject({ data: "Zm90bw==", mimeType: "image/png" });
  });

  it("normalizes a ptt (voice note) as audio with no caption", () => {
    const parsed = parseOpenWaInbound(
      messageEvent({ type: "ptt", waMessageId: "PTT1", metadata: { media: { mimetype: "audio/ogg", data: "YQ==" } } }),
      "acc",
    );
    expect(parsed).toMatchObject({ type: "message", contentType: "audio" });
  });

  it("normalizes a document, carrying mediaFilename from metadata", () => {
    const parsed = parseOpenWaInbound(
      messageEvent({
        type: "document",
        waMessageId: "DOC1",
        body: "segue",
        metadata: { media: { mimetype: "application/pdf", data: "YQ==", filename: "Catalogo.pdf" } },
      }),
      "acc",
    );
    expect(parsed).toMatchObject({
      type: "message",
      contentType: "document",
      mediaFilename: "Catalogo.pdf",
      mediaCaption: "segue",
    });
  });

  it("has no mediaId when metadata carries no media (text message)", () => {
    const parsed = parseOpenWaInbound(messageEvent({ type: "text", body: "oi" }), "acc") as {
      mediaId?: string;
    };
    expect(parsed.mediaId).toBeUndefined();
  });
});

describe("parseOpenWaInbound — group/broadcast/@lid guard", () => {
  it.each([
    ["group", "120363041234567890@g.us"],
    ["status broadcast", "status@broadcast"],
    ["newsletter", "120363041234567890@newsletter"],
  ])("throws for %s jids", (_label, from) => {
    expect(() => parseOpenWaInbound(messageEvent({ from }), "acc")).toThrow(/grupo|broadcast/i);
  });

  it("throws for @lid jids (no resolvable phone)", () => {
    expect(() =>
      parseOpenWaInbound(messageEvent({ from: "20363041234567890@lid" }), "acc"),
    ).toThrow(/@lid/);
  });
});

describe("parseOpenWaInbound — ack/status events", () => {
  it("normalizes a string status to a canonical status", () => {
    const parsed = parseOpenWaInbound(
      {
        event: "message.ack",
        sessionId: "sess-1",
        data: { waMessageId: "MSG1", status: "read", timestamp: 1765400100 },
      },
      "acc",
    );
    expect(parsed).toMatchObject({ type: "status", providerMessageId: "MSG1", status: "read" });
  });

  it("maps a failed/error status to failed with a failureReason", () => {
    const parsed = parseOpenWaInbound(
      {
        event: "message.ack",
        sessionId: "sess-1",
        data: { waMessageId: "MSG2", status: "failed", timestamp: 1765400100 },
      },
      "acc",
    ) as { status: string; failureReason?: string };
    expect(parsed.status).toBe("failed");
    expect(parsed.failureReason).toBe("failed");
  });

  it("throws on an unrecognized status value", () => {
    expect(() =>
      parseOpenWaInbound(
        { event: "message.ack", sessionId: "sess-1", data: { waMessageId: "MSG3", status: "banana" } },
        "acc",
      ),
    ).toThrow(/desconhecido/);
  });
});

describe("parseOpenWaInbound — malformed/unsupported payloads", () => {
  it("throws on a payload with no message body at all", () => {
    expect(() => parseOpenWaInbound({ foo: "bar" }, "acc")).toThrow(/irreconhecível/);
  });

  it("throws on an unsupported event type (session.status/session.qr dropped)", () => {
    expect(() =>
      parseOpenWaInbound({ event: "session.qr", sessionId: "sess-1", data: {} }, "acc"),
    ).toThrow(/não suportado/);
  });
});
