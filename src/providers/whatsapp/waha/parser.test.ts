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

  it("parses fromMe=true as an outbound echo, reading the recipient from `from` (not `to`)", () => {
    // Real WAHA 2026.6.2 message.any payloads set `to: null` on every
    // fromMe:true envelope — `from` is the chat/recipient JID instead
    // (confirmed via a live capture). This fixture mirrors that shape.
    const result = parseWahaMessageEvent(
      {
        id: "id4",
        timestamp: 1720000003,
        from: "5511988887777@c.us",
        fromMe: true,
        to: undefined,
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

  it("marks an @lid sender as fromLid and leaves fromPhone empty", () => {
    const result = parseWahaMessageEvent(
      {
        id: "id6",
        timestamp: 1720000005,
        from: "67186324430852@lid",
        fromMe: false,
        to: "5511999998888@c.us",
        body: "oi",
        hasMedia: false,
      },
      accountId,
    );
    if (result.type !== "message") throw new Error("expected message");
    expect(result.fromPhone).toBe("");
    expect(result.fromLid).toBe("67186324430852@lid");
  });

  it("does not set fromLid for a regular @c.us sender", () => {
    const result = parseWahaMessageEvent(
      {
        id: "id7",
        timestamp: 1720000006,
        from: "5511988887777@c.us",
        fromMe: false,
        to: "5511999998888@c.us",
        body: "oi",
        hasMedia: false,
      },
      accountId,
    );
    if (result.type !== "message") throw new Error("expected message");
    expect(result.fromPhone).toBe("+5511988887777");
    expect(result.fromLid).toBeUndefined();
  });

  it("marks an @lid recipient of an outbound echo as toLid and leaves toPhone empty", () => {
    const result = parseWahaMessageEvent(
      {
        id: "id8",
        timestamp: 1720000007,
        from: "67186324430852@lid",
        fromMe: true,
        to: undefined,
        body: "Retorno já já",
        hasMedia: false,
      },
      accountId,
    );
    expect(result.type).toBe("outbound-echo");
    if (result.type !== "outbound-echo") throw new Error("expected outbound-echo");
    expect(result.toPhone).toBe("");
    expect(result.toLid).toBe("67186324430852@lid");
  });

  it("does not set toLid for a regular @c.us recipient of an outbound echo", () => {
    const result = parseWahaMessageEvent(
      {
        id: "id9",
        timestamp: 1720000008,
        from: "5511988887777@c.us",
        fromMe: true,
        to: undefined,
        body: "Retorno já já",
        hasMedia: false,
      },
      accountId,
    );
    if (result.type !== "outbound-echo") throw new Error("expected outbound-echo");
    expect(result.toPhone).toBe("+5511988887777");
    expect(result.toLid).toBeUndefined();
  });

  it("matches a real WAHA 2026.6.2 message.any capture (fromMe:true, to:null, @lid chat)", () => {
    // Verbatim shape from a live webhook capture (n8n debug hook), trimmed to
    // the fields this parser reads — `to` really is `null`, not omitted.
    const result = parseWahaMessageEvent(
      {
        id: "true_250358089674933@lid_A56A1A16962657FFAE651FAD8278C623",
        timestamp: 1783870875,
        from: "250358089674933@lid",
        fromMe: true,
        to: null as unknown as undefined,
        body: "TesteEco",
        hasMedia: false,
      },
      accountId,
    );
    expect(result.type).toBe("outbound-echo");
    if (result.type !== "outbound-echo") throw new Error("expected outbound-echo");
    expect(result.toPhone).toBe("");
    expect(result.toLid).toBe("250358089674933@lid");
    expect(result.text).toBe("TesteEco");
  });
});

describe("parseWahaMessageEvent — shared contact card (vCard)", () => {
  const vcard =
    "BEGIN:VCARD\nVERSION:3.0\nN:Pitao;Lurival Spuldaro - Loja do Basculante Binotto Group;Binoto;;\nFN:Lurival Spuldaro - Loja do Basculante Binotto Group Binoto Pitao\nitem1.TEL;waid=555499005499:+55 54 9900-5499\nEND:VCARD";

  it("parses an inbound shared-contact-card message (real capture shape, 2026-07-16)", () => {
    const result = parseWahaMessageEvent(
      {
        id: "false_34420606116003@lid_ACA3C349CEB6519AF06CB3EC04948445",
        timestamp: 1752666641,
        from: "34420606116003@lid",
        fromMe: false,
        body: "",
        hasMedia: false,
        vCards: [vcard],
      },
      accountId,
    );
    if (result.type !== "message") throw new Error("expected message");
    expect(result.contentType).toBe("contact");
    expect(result.text).toBe(
      "Lurival Spuldaro - Loja do Basculante Binotto Group Binoto Pitao\n+555499005499",
    );
  });

  it("uses only the first vCard when multiple contacts are shared at once", () => {
    const secondVcard = "BEGIN:VCARD\nVERSION:3.0\nFN:Segundo Contato\nEND:VCARD";
    const result = parseWahaMessageEvent(
      {
        id: "id-multi",
        timestamp: 1752666641,
        from: "5511988887777@c.us",
        fromMe: false,
        body: "",
        hasMedia: false,
        vCards: [vcard, secondVcard],
      },
      accountId,
    );
    if (result.type !== "message") throw new Error("expected message");
    expect(result.contentType).toBe("contact");
    expect(result.text).toContain("Lurival Spuldaro");
    expect(result.text).not.toContain("Segundo Contato");
  });

  it("parses an outbound echo of a shared-contact-card the same way", () => {
    const result = parseWahaMessageEvent(
      {
        id: "id-echo",
        timestamp: 1752666641,
        from: "5511988887777@c.us",
        fromMe: true,
        to: undefined,
        body: "",
        hasMedia: false,
        vCards: [vcard],
      },
      accountId,
    );
    expect(result.type).toBe("outbound-echo");
    if (result.type !== "outbound-echo") throw new Error("expected outbound-echo");
    expect(result.contentType).toBe("contact");
    expect(result.text).toBe(
      "Lurival Spuldaro - Loja do Basculante Binotto Group Binoto Pitao\n+555499005499",
    );
  });

  it("falls back to plain text when vCards is an empty array (no card actually shared)", () => {
    const result = parseWahaMessageEvent(
      {
        id: "id-no-card",
        timestamp: 1752666641,
        from: "5511988887777@c.us",
        fromMe: false,
        body: "Mensagem normal",
        hasMedia: false,
        vCards: [],
      },
      accountId,
    );
    if (result.type !== "message") throw new Error("expected message");
    expect(result.contentType).toBe("text");
    expect(result.text).toBe("Mensagem normal");
  });
});

describe("parseWahaMessageEvent — ad referral (hypothesized _data.Message shape)", () => {
  it("extracts adReferral when _data.Message carries externalAdReply", () => {
    const parsed = parseWahaMessageEvent(
      {
        id: "WAHA1",
        timestamp: 1765400000,
        from: "5555988887777@c.us",
        fromMe: false,
        body: "Opa! Vim do anúncio",
        hasMedia: false,
        _data: {
          Message: {
            extendedTextMessage: {
              contextInfo: {
                externalAdReply: {
                  title: "Módulos Volvo — instale em minutos",
                  body: "Fale com a GALLO",
                  sourceID: "120210000000000",
                  sourceType: "ad",
                  sourceURL: "https://fb.me/xyz",
                  mediaType: "IMAGE",
                  mediaURL: "https://scontent.example/ad.jpg",
                  ctwaClid: "AfE...clid",
                },
              },
            },
          },
        },
      },
      "acc-1",
    ) as { adReferral?: unknown };
    expect(parsed.adReferral).toEqual({
      sourceId: "120210000000000",
      sourceUrl: "https://fb.me/xyz",
      sourceType: "ad",
      headline: "Módulos Volvo — instale em minutos",
      body: "Fale com a GALLO",
      mediaType: "image",
      mediaUrl: "https://scontent.example/ad.jpg",
    });
  });

  it("leaves adReferral undefined when _data is absent (today's real payload shape)", () => {
    const parsed = parseWahaMessageEvent(
      { id: "WAHA2", timestamp: 1765400000, from: "5555988887777@c.us", fromMe: false, body: "oi" },
      "acc-1",
    ) as { adReferral?: unknown };
    expect(parsed.adReferral).toBeUndefined();
  });

  it("normalizes integer mediaType without throwing", () => {
    const parsed = parseWahaMessageEvent(
      {
        id: "WAHA3",
        timestamp: 1765400000,
        from: "5555988887777@c.us",
        fromMe: false,
        body: "Opa!",
        hasMedia: false,
        _data: {
          Message: {
            extendedTextMessage: {
              contextInfo: { externalAdReply: { title: "Anúncio", mediaType: 2 } },
            },
          },
        },
      },
      "acc-1",
    ) as { adReferral?: { mediaType?: string } };
    expect(parsed.adReferral?.mediaType).toBe("video");
  });
});

describe("parseWahaMessageEvent — reply to a WhatsApp Status", () => {
  // Trimmed from a real webhook_deliveries capture (2026-07-20): a customer
  // commented "Valor galo ?" on the store's own Status update. The comment
  // itself carries no media (hasMedia:false) — the photo lives ONLY in the
  // quoted status, surfaced by WAHA at the top-level `replyTo`. Without
  // pulling it in here, the image is gone forever (statuses aren't a
  // conversation we store).
  const statusReplyPayload = {
    id: "false_15608045400129@lid_3A3DC5324010B5C93AF3",
    timestamp: 1784553997,
    from: "15608045400129@lid",
    fromMe: false,
    body: "Valor galo ?",
    hasMedia: false,
    media: null,
    _data: {
      Message: {
        extendedTextMessage: {
          text: "Valor galo ?",
          contextInfo: {
            remoteJID: "status@broadcast",
            participant: "64780991787087@lid",
          },
        },
      },
    },
    replyTo: {
      id: "2AA57D4DC61F483E9164",
      body: "PLD EURO 5/3 NOVO.",
      hasMedia: true,
      media: {
        url: "https://waha.ailainteligente.com.br/api/files/vendas-waha-6ea34d/2AA57D4DC61F483E9164.jpeg",
        mimetype: "image/jpeg",
      },
      participant: "64780991787087@lid",
    },
  };

  it("attaches the quoted status image as this message's own media, keeping the customer's comment as text", () => {
    const parsed = parseWahaMessageEvent(statusReplyPayload, "acc-1");
    if (parsed.type !== "message") throw new Error("expected message");
    expect(parsed.contentType).toBe("image");
    expect(parsed.mediaId).toBe(
      "https://waha.ailainteligente.com.br/api/files/vendas-waha-6ea34d/2AA57D4DC61F483E9164.jpeg",
    );
    expect(parsed.text).toBe("Valor galo ?");
  });

  it("falls back to plain text when the quoted status has no media (text-only status)", () => {
    const parsed = parseWahaMessageEvent(
      {
        ...statusReplyPayload,
        id: "id-no-media-status",
        replyTo: { ...statusReplyPayload.replyTo, hasMedia: false, media: undefined },
      },
      "acc-1",
    );
    if (parsed.type !== "message") throw new Error("expected message");
    expect(parsed.contentType).toBe("text");
    expect(parsed.text).toBe("Valor galo ?");
  });

  it("does NOT pull in quoted media for a normal in-chat reply (not a status)", () => {
    // Same replyTo shape, but contextInfo.remoteJID points at the chat itself
    // instead of "status@broadcast" — quoting a message already visible in
    // this conversation's own history, so re-attaching it would duplicate it.
    const parsed = parseWahaMessageEvent(
      {
        ...statusReplyPayload,
        id: "id-normal-quote",
        _data: {
          Message: {
            extendedTextMessage: {
              text: "Valor galo ?",
              contextInfo: { remoteJID: "5519993249725@s.whatsapp.net" },
            },
          },
        },
      },
      "acc-1",
    );
    if (parsed.type !== "message") throw new Error("expected message");
    expect(parsed.contentType).toBe("text");
    expect(parsed.mediaId).toBeUndefined();
  });
});
