import { describe, expect, it, vi } from "vitest";
import { fetchWahaChatMessagesPage, fetchWahaChatsPage } from "./history";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const target = { baseUrl: "https://waha.example.com", sessionName: "loja-abc123" };

describe("fetchWahaChatsPage", () => {
  it("GETs /api/{session}/chats with limit+offset and returns chat ids", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(
        jsonResponse(200, [{ id: "5548999887766@c.us", name: "Zé" }, { id: "999@g.us" }]),
      );
    const rows = await fetchWahaChatsPage("key", fetchFn, target, 0, 100);
    expect(fetchFn.mock.calls[0][0]).toBe(
      "https://waha.example.com/api/loja-abc123/chats?limit=100&offset=0",
    );
    expect(rows).toEqual([{ id: "5548999887766@c.us" }, { id: "999@g.us" }]);
  });

  it("drops rows with no id and returns [] on a non-array body", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(200, { notAnArray: true }));
    const rows = await fetchWahaChatsPage("key", fetchFn, target, 0, 100);
    expect(rows).toEqual([]);
  });
});

describe("fetchWahaChatMessagesPage", () => {
  it("GETs /api/{session}/chats/{chatId}/messages with limit+offset+downloadMedia=false, encoding the chatId", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(
        jsonResponse(200, [
          { id: "abc", timestamp: 1720000000, from: "5548999887766@c.us", fromMe: false, body: "oi" },
        ]),
      );
    const rows = await fetchWahaChatMessagesPage("key", fetchFn, target, "5548999887766@c.us", 0, 100);
    expect(fetchFn.mock.calls[0][0]).toBe(
      "https://waha.example.com/api/loja-abc123/chats/5548999887766%40c.us/messages?limit=100&offset=0&downloadMedia=false",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe("abc");
  });

  it("returns [] on a non-array body", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(200, null));
    const rows = await fetchWahaChatMessagesPage("key", fetchFn, target, "1@c.us", 0, 100);
    expect(rows).toEqual([]);
  });
});
