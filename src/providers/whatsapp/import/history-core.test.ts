import { describe, expect, it } from "vitest";
import { createHistoryAggregator, normalizeWhatsmeowRecord } from "./history-core";

// Wrapper shape mirrors the captured payload: conversations[].messages[] = { message: WebMessageInfo }.
const wmText = (id: string, fromMe: boolean, text: string, tsSec: number) => ({
  message: { key: { id, fromMe }, messageTimestamp: tsSec, message: { conversation: text } },
});
const wmImage = (id: string, tsSec: number, caption: string) => ({
  message: {
    key: { id, fromMe: false },
    messageTimestamp: tsSec,
    message: { imageMessage: { caption, url: "u", mimetype: "image/jpeg" } },
  },
});

describe("normalizeWhatsmeowRecord", () => {
  it("maps a text message (inbound / delivered)", () => {
    const r = normalizeWhatsmeowRecord(wmText("m1", false, "olá", 1765400000).message);
    expect(r).toMatchObject({
      providerMessageId: "m1",
      direction: "in",
      text: "olá",
      status: "delivered",
      mediaType: null,
    });
  });

  it("maps fromMe as outbound / sent", () => {
    const r = normalizeWhatsmeowRecord(wmText("m2", true, "eu", 1765400000).message);
    expect(r).toMatchObject({ direction: "out", status: "sent" });
  });

  it("maps an image with caption and mediaType", () => {
    const r = normalizeWhatsmeowRecord(wmImage("m3", 1765400000, "foto").message);
    expect(r).toMatchObject({ direction: "in", text: "foto", mediaType: "image" });
  });

  it("rejects records without key.id or with an insane timestamp", () => {
    expect(normalizeWhatsmeowRecord({ key: {}, messageTimestamp: 1765400000 })).toBeNull();
    expect(normalizeWhatsmeowRecord({ key: { id: "x" }, messageTimestamp: 0 })).toBeNull();
    // ms epoch → decades in the future → reject
    expect(
      normalizeWhatsmeowRecord({ key: { id: "x" }, messageTimestamp: 1765400000000 }),
    ).toBeNull();
  });

  it("rejects an unrenderable stub (unknown content, no text)", () => {
    expect(
      normalizeWhatsmeowRecord({ key: { id: "x" }, messageTimestamp: 1765400000, message: {} }),
    ).toBeNull();
  });
});

describe("createHistoryAggregator", () => {
  it("aggregates individuals, resolves @lid via mapping, dedups across chunks", () => {
    const agg = createHistoryAggregator();
    agg.addChunk({
      syncType: 2,
      conversations: [
        {
          ID: "5551988880001@s.whatsapp.net",
          name: "Cliente A",
          messages: [wmText("a1", false, "oi", 1765400000)],
        },
        {
          ID: "111@lid",
          name: "Cliente B",
          messages: [wmText("b1", false, "lid msg", 1765400001)],
        },
        { ID: "999@g.us", name: "Grupo", messages: [wmText("g1", false, "grupo", 1765400002)] },
        { ID: "status@broadcast", messages: [wmText("s1", false, "bc", 1765400003)] },
      ],
      phoneNumberToLidMappings: [{ lidJID: "111@lid", pnJID: "5551988880002@s.whatsapp.net" }],
    });
    // a1 again in a later chunk → must NOT duplicate
    agg.addChunk({
      syncType: 3,
      conversations: [
        { ID: "5551988880001@s.whatsapp.net", messages: [wmText("a1", false, "oi", 1765400000)] },
      ],
    });

    const { items, stats } = agg.finalize();
    expect(items).toHaveLength(2);

    const lidItem = items.find((i) => i.messages.some((m) => m.providerMessageId === "b1"))!;
    const directItem = items.find((i) => i.messages.some((m) => m.providerMessageId === "a1"))!;
    expect(lidItem.messages).toHaveLength(1);
    expect(lidItem.name).toBe("Cliente B");
    expect(directItem.messages).toHaveLength(1); // cross-chunk dedup
    expect(lidItem.phone.startsWith("+")).toBe(true);
    expect(lidItem.phone).not.toBe(directItem.phone);
    expect(stats).toMatchObject({
      individualChats: 1,
      lidResolved: 1,
      lidUnresolved: 0,
      groups: 1,
      broadcasts: 1,
      totalMessages: 2,
    });
  });

  it("skips @lid without a mapping (counts as unresolved)", () => {
    const agg = createHistoryAggregator();
    agg.addChunk({
      syncType: 2,
      conversations: [{ ID: "222@lid", messages: [wmText("c1", false, "x", 1765400000)] }],
      phoneNumberToLidMappings: [],
    });
    const { items, stats } = agg.finalize();
    expect(items).toHaveLength(0);
    expect(stats.lidUnresolved).toBe(1);
  });

  it("merges an individual and a @lid that resolve to the same phone", () => {
    const agg = createHistoryAggregator();
    agg.addChunk({
      conversations: [
        {
          ID: "5551988880003@s.whatsapp.net",
          messages: [wmText("d1", false, "direto", 1765400000)],
        },
        { ID: "333@lid", messages: [wmText("d2", false, "via lid", 1765400001)] },
      ],
      phoneNumberToLidMappings: [{ lidJID: "333@lid", pnJID: "5551988880003@s.whatsapp.net" }],
    });
    const { items } = agg.finalize();
    expect(items).toHaveLength(1);
    const item = items[0]!;
    expect(item.phone.startsWith("+")).toBe(true);
    expect(item.messages.map((m) => m.providerMessageId).sort()).toEqual(["d1", "d2"]);
  });

  it("drops conversations with no renderable messages (no empty item)", () => {
    const agg = createHistoryAggregator();
    agg.addChunk({
      conversations: [
        {
          ID: "5551988880004@s.whatsapp.net",
          name: "Vazio",
          messages: [{ message: { key: { id: "p1" }, messageTimestamp: 1765400000, message: {} } }],
        },
      ],
    });
    const { items, stats } = agg.finalize();
    expect(items).toHaveLength(0);
    expect(stats.individualChats).toBe(1); // seen, but produced no item
  });
});
