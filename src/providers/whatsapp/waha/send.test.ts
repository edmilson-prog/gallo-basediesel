import { describe, expect, it, vi } from "vitest";
import { extractLidChatId, sendWahaMedia, sendWahaText } from "./send";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const target = { baseUrl: "https://waha.example.com", sessionName: "loja-abc123" };

describe("sendWahaText", () => {
  it("POSTs /api/sendText with session, chatId, text", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(200, { id: "true_123@c.us_ABC" }));
    const result = await sendWahaText("key", fetchFn, target, {
      toPhone: "+5511988887777",
      text: "Olá!",
    });
    expect(result.providerMessageId).toBe("true_123@c.us_ABC");
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("https://waha.example.com/api/sendText");
    const body = JSON.parse(init.body);
    expect(body).toEqual({ session: "loja-abc123", chatId: "5511988887777@c.us", text: "Olá!" });
  });

  it("throws when the response has no id", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(200, {}));
    await expect(
      sendWahaText("key", fetchFn, target, { toPhone: "+5511988887777", text: "oi" }),
    ).rejects.toThrow();
  });
});

describe("sendWahaMedia", () => {
  it("POSTs /api/sendImage for image mediaType", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(200, { id: "true_456@c.us_DEF" }));
    const result = await sendWahaMedia("key", fetchFn, target, {
      toPhone: "+5511988887777",
      mediaType: "image",
      mediaUrl: "https://storage.example.com/signed.jpg",
      caption: "Peça em anexo",
      filename: "peca.jpg",
    });
    expect(result.providerMessageId).toBe("true_456@c.us_DEF");
    expect(fetchFn.mock.calls[0][0]).toBe("https://waha.example.com/api/sendImage");
    const body = JSON.parse(fetchFn.mock.calls[0][1].body);
    expect(body.file).toEqual({
      mimetype: undefined,
      url: "https://storage.example.com/signed.jpg",
      filename: "peca.jpg",
    });
    expect(body.caption).toBe("Peça em anexo");
  });

  it("POSTs /api/sendFile for document mediaType", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(200, { id: "true_789@c.us_GHI" }));
    await sendWahaMedia("key", fetchFn, target, {
      toPhone: "+5511988887777",
      mediaType: "document",
      mediaUrl: "https://storage.example.com/orcamento.pdf",
      filename: "orcamento.pdf",
    });
    expect(fetchFn.mock.calls[0][0]).toBe("https://waha.example.com/api/sendFile");
  });

  it("POSTs /api/sendVoice with convert:true for audio mediaType (native playable voice note, not a downloadable file)", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(200, { id: "true_999@c.us_JKL" }));
    const result = await sendWahaMedia("key", fetchFn, target, {
      toPhone: "+5511988887777",
      mediaType: "audio",
      mediaUrl: "https://storage.example.com/signed/nota-de-voz.webm",
      mimetype: "audio/webm;codecs=opus",
      filename: "nota-de-voz.webm",
    });
    expect(result.providerMessageId).toBe("true_999@c.us_JKL");
    expect(fetchFn.mock.calls[0][0]).toBe("https://waha.example.com/api/sendVoice");
    const body = JSON.parse(fetchFn.mock.calls[0][1].body);
    expect(body).toEqual({
      session: "loja-abc123",
      chatId: "5511988887777@c.us",
      file: {
        mimetype: "audio/webm;codecs=opus",
        url: "https://storage.example.com/signed/nota-de-voz.webm",
        filename: "nota-de-voz.webm",
      },
      convert: true,
    });
  });

  it("POSTs /api/sendVideo with convert:true + video/mp4 for a video within the inline limit", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(200, { id: "true_vid@c.us_A" }));
    await sendWahaMedia("key", fetchFn, target, {
      toPhone: "+5511988887777",
      mediaType: "video",
      mediaUrl: "https://storage.example.com/signed/clipe.mp4",
      filename: "clipe.mp4",
      caption: "olha a peça",
      sizeBytes: 8 * 1024 * 1024,
    });
    expect(fetchFn.mock.calls[0][0]).toBe("https://waha.example.com/api/sendVideo");
    const body = JSON.parse(fetchFn.mock.calls[0][1].body);
    expect(body.file.mimetype).toBe("video/mp4");
    expect(body.convert).toBe(true);
    expect(body.caption).toBe("olha a peça");
  });

  it("keeps the caller's mimetype on /api/sendVideo when one is supplied", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(200, { id: "true_vid@c.us_B" }));
    await sendWahaMedia("key", fetchFn, target, {
      toPhone: "+5511988887777",
      mediaType: "video",
      mediaUrl: "https://storage.example.com/signed/clipe.mov",
      mimetype: "video/quicktime",
      sizeBytes: 2 * 1024 * 1024,
    });
    const body = JSON.parse(fetchFn.mock.calls[0][1].body);
    expect(body.file.mimetype).toBe("video/quicktime");
  });

  it("falls back to /api/sendFile for a video ABOVE the 16 MB inline limit", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(200, { id: "true_vid@c.us_C" }));
    await sendWahaMedia("key", fetchFn, target, {
      toPhone: "+5511988887777",
      mediaType: "video",
      mediaUrl: "https://storage.example.com/signed/grande.mp4",
      sizeBytes: 40 * 1024 * 1024,
    });
    expect(fetchFn.mock.calls[0][0]).toBe("https://waha.example.com/api/sendFile");
    const body = JSON.parse(fetchFn.mock.calls[0][1].body);
    expect(body.convert).toBeUndefined();
  });

  it("sends a video as /api/sendFile when the size is unknown (safe default)", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(200, { id: "true_vid@c.us_D" }));
    await sendWahaMedia("key", fetchFn, target, {
      toPhone: "+5511988887777",
      mediaType: "video",
      mediaUrl: "https://storage.example.com/signed/semtamanho.mp4",
    });
    expect(fetchFn.mock.calls[0][0]).toBe("https://waha.example.com/api/sendFile");
  });

  it("treats a video exactly at 16 MB as inline (boundary is inclusive)", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(200, { id: "true_vid@c.us_E" }));
    await sendWahaMedia("key", fetchFn, target, {
      toPhone: "+5511988887777",
      mediaType: "video",
      mediaUrl: "https://storage.example.com/signed/limite.mp4",
      sizeBytes: 16 * 1024 * 1024,
    });
    expect(fetchFn.mock.calls[0][0]).toBe("https://waha.example.com/api/sendVideo");
  });

  it("falls back to /api/sendFile when /api/sendVideo is rejected (engine without the endpoint)", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(404, { error: "Not Found" })) // sendVideo → 404
      .mockResolvedValueOnce(jsonResponse(200, { id: "true_vid@c.us_F" })); // sendFile → ok
    const result = await sendWahaMedia("key", fetchFn, target, {
      toPhone: "+5511988887777",
      mediaType: "video",
      mediaUrl: "https://storage.example.com/signed/clipe.mp4",
      sizeBytes: 5 * 1024 * 1024,
    });
    expect(result.providerMessageId).toBe("true_vid@c.us_F");
    expect(fetchFn.mock.calls[0][0]).toBe("https://waha.example.com/api/sendVideo");
    expect(fetchFn.mock.calls[1][0]).toBe("https://waha.example.com/api/sendFile");
  });

  it("does NOT fall back on a timeout/abort — WAHA may have sent it, so a retry would duplicate", async () => {
    const abort = Object.assign(new Error("aborted"), { name: "AbortError" });
    const fetchFn = vi.fn().mockRejectedValue(abort);
    await expect(
      sendWahaMedia("key", fetchFn, target, {
        toPhone: "+5511988887777",
        mediaType: "video",
        mediaUrl: "https://storage.example.com/signed/clipe.mp4",
        sizeBytes: 5 * 1024 * 1024,
      }),
    ).rejects.toThrow();
    // Only the sendVideo attempt — no second (sendFile) call.
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("does not send a caption on /api/sendVoice (WAHA voice notes carry no text)", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(200, { id: "true_999@c.us_JKL" }));
    await sendWahaMedia("key", fetchFn, target, {
      toPhone: "+5511988887777",
      mediaType: "audio",
      mediaUrl: "https://storage.example.com/signed/nota-de-voz.webm",
      caption: "não deveria ir",
    });
    const body = JSON.parse(fetchFn.mock.calls[0][1].body);
    expect(body.caption).toBeUndefined();
  });
});

describe("chatId override (lid-addressed chats)", () => {
  it("sendWahaText uses an explicit chatId verbatim instead of deriving one from toPhone", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(200, { id: "true_1@lid_A" }));
    await sendWahaText("key", fetchFn, target, {
      toPhone: "",
      chatId: "34523215618230@lid",
      text: "oi",
    });
    const body = JSON.parse(fetchFn.mock.calls[0][1].body);
    expect(body.chatId).toBe("34523215618230@lid");
  });

  it("sendWahaMedia uses an explicit chatId verbatim too", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(200, { id: "true_2@lid_B" }));
    await sendWahaMedia("key", fetchFn, target, {
      toPhone: "",
      chatId: "34523215618230@lid",
      mediaType: "image",
      mediaUrl: "https://storage.example.com/signed.jpg",
    });
    const body = JSON.parse(fetchFn.mock.calls[0][1].body);
    expect(body.chatId).toBe("34523215618230@lid");
  });

  it("still derives the chatId from toPhone when no override is given", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(200, { id: "true_3@c.us_C" }));
    await sendWahaText("key", fetchFn, target, { toPhone: "+5511988887777", text: "oi" });
    const body = JSON.parse(fetchFn.mock.calls[0][1].body);
    expect(body.chatId).toBe("5511988887777@c.us");
  });
});

describe("extractLidChatId", () => {
  it("extracts the chat JID from a lid-addressed WAHA message id", () => {
    expect(extractLidChatId("false_34523215618230@lid_3A671E9C4C83C7AD6082")).toBe(
      "34523215618230@lid",
    );
  });

  it("returns null for a phone-addressed (c.us) id", () => {
    expect(extractLidChatId("true_554796061632@c.us_2A8E35912FEA3E0493A7")).toBeNull();
  });

  it("returns null for group ids even when a participant segment is a lid", () => {
    expect(extractLidChatId("false_120363043211@g.us_ABC_456@lid")).toBeNull();
  });

  it("returns null for empty or malformed input", () => {
    expect(extractLidChatId("")).toBeNull();
    expect(extractLidChatId("not-a-waha-id")).toBeNull();
    expect(extractLidChatId("34523215618230@lid")).toBeNull();
  });
});

describe("toChatId country-code normalization", () => {
  it("prefixes Brazil's DDI on a bare local phone stored without it (DINTEC import shape)", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(200, { id: "true_1@c.us_X" }));
    await sendWahaText("key", fetchFn, target, { toPhone: "49988184540", text: "oi" });
    const body = JSON.parse(fetchFn.mock.calls[0][1].body);
    expect(body.chatId).toBe("5549988184540@c.us");
  });

  it("does not prefix an explicit E.164 foreign phone (Chile mobile is also 11 digits)", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(200, { id: "true_2@c.us_Y" }));
    await sendWahaText("key", fetchFn, target, { toPhone: "+56995070445", text: "hola" });
    const body = JSON.parse(fetchFn.mock.calls[0][1].body);
    expect(body.chatId).toBe("56995070445@c.us");
  });

  it("normalizes the chatId on media sends too (same toChatId path)", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(200, { id: "true_3@c.us_Z" }));
    await sendWahaMedia("key", fetchFn, target, {
      toPhone: "49988184540",
      mediaType: "image",
      mediaUrl: "https://storage.example.com/signed.jpg",
    });
    const body = JSON.parse(fetchFn.mock.calls[0][1].body);
    expect(body.chatId).toBe("5549988184540@c.us");
  });
});

describe("reply_to (quoted reply)", () => {
  // WAHA expects the SERIALIZED id here — the same value we persist in
  // messages.provider_message_id.
  it("emits reply_to on a text send when quoting", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(200, { id: "true_1@c.us_NEW" }));
    await sendWahaText("key", fetchFn, target, {
      toPhone: "+5511988887777",
      text: "temos sim",
      replyTo: "false_5511988887777@c.us_ABC",
    });
    const body = JSON.parse(fetchFn.mock.calls[0][1].body);
    expect(body.reply_to).toBe("false_5511988887777@c.us_ABC");
  });

  it("omits reply_to entirely on a text send when not quoting", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(200, { id: "true_1@c.us_NEW" }));
    await sendWahaText("key", fetchFn, target, { toPhone: "+5511988887777", text: "oi" });
    const body = JSON.parse(fetchFn.mock.calls[0][1].body);
    expect("reply_to" in body).toBe(false);
  });

  it("emits reply_to on a media send when quoting", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(200, { id: "true_2@c.us_NEW" }));
    await sendWahaMedia("key", fetchFn, target, {
      toPhone: "+5511988887777",
      mediaType: "image",
      mediaUrl: "https://storage.example.com/signed.jpg",
      replyTo: "false_5511988887777@c.us_ABC",
    });
    const body = JSON.parse(fetchFn.mock.calls[0][1].body);
    expect(body.reply_to).toBe("false_5511988887777@c.us_ABC");
  });
});
