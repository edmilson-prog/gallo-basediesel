import { describe, it, expect } from "vitest";
import type { IMessage } from "@/shared/types";
import {
  messageToMediaItem,
  filterMediaItems,
  countByKind,
  periodDays,
  groupMediaByType,
  type IConversationMediaItem,
} from "./conversationMedia";

function msg(over: Partial<IMessage>): IMessage {
  return {
    id: "m1",
    conversationId: "c1",
    direction: "in",
    authorType: "customer",
    provider: "evolution",
    text: "",
    status: "delivered",
    sentAt: "2026-06-10T12:00:00.000Z",
    ...over,
  };
}

describe("messageToMediaItem", () => {
  it("skips messages without media type or url", () => {
    expect(messageToMediaItem(msg({ text: "oi" }))).toBeNull();
    expect(messageToMediaItem(msg({ mediaType: "image" }))).toBeNull(); // no url
    expect(messageToMediaItem(msg({ mediaType: undefined, mediaUrl: "x" }))).toBeNull();
  });

  it("maps an image message to an item, carrying caption + author", () => {
    const item = messageToMediaItem(
      msg({ mediaType: "image", mediaUrl: "conversations/c1/m1/media.jpg", text: "turbina" }),
    );
    expect(item).toEqual({
      id: "m1",
      conversationId: "c1",
      kind: "image",
      mediaUrl: "conversations/c1/m1/media.jpg",
      caption: "turbina",
      authorType: "customer",
      direction: "in",
      sentAt: "2026-06-10T12:00:00.000Z",
    });
  });

  it("normalizes sticker to image", () => {
    expect(messageToMediaItem(msg({ mediaType: "sticker", mediaUrl: "u" }))?.kind).toBe("image");
  });

  it("keeps audio/video/document kinds", () => {
    expect(messageToMediaItem(msg({ mediaType: "audio", mediaUrl: "u" }))?.kind).toBe("audio");
    expect(messageToMediaItem(msg({ mediaType: "video", mediaUrl: "u" }))?.kind).toBe("video");
    expect(messageToMediaItem(msg({ mediaType: "document", mediaUrl: "u" }))?.kind).toBe("document");
  });

  it("leaves caption undefined when text is empty", () => {
    expect(messageToMediaItem(msg({ mediaType: "image", mediaUrl: "u" }))?.caption).toBeUndefined();
  });

  it("propagates the original mediaFilename to the media item", () => {
    const item = messageToMediaItem(
      msg({
        mediaType: "document",
        mediaUrl: "conversations/c1/m1/media.pdf",
        mediaFilename: "Catalogo-UFI.pdf",
      }),
    );
    expect(item?.fileName).toBe("Catalogo-UFI.pdf");
  });
});

const item = (over: Partial<IConversationMediaItem>): IConversationMediaItem => ({
  id: "i",
  conversationId: "c1",
  kind: "image",
  mediaUrl: "u",
  authorType: "customer",
  direction: "in",
  sentAt: "2026-06-10T12:00:00.000Z",
  ...over,
});

describe("filterMediaItems", () => {
  const now = new Date("2026-06-12T12:00:00.000Z").getTime();
  const items = [
    item({ id: "a", kind: "image", direction: "in", sentAt: "2026-06-12T10:00:00.000Z" }),
    item({ id: "b", kind: "audio", direction: "out", sentAt: "2026-06-01T10:00:00.000Z" }),
    item({ id: "c", kind: "document", direction: "in", sentAt: "2026-03-01T10:00:00.000Z" }),
  ];

  it("returns all with default filters", () => {
    expect(
      filterMediaItems(items, { kind: "all", author: "all", period: "all" }, now).map((i) => i.id),
    ).toEqual(["a", "b", "c"]);
  });

  it("filters by kind", () => {
    expect(
      filterMediaItems(items, { kind: "audio", author: "all", period: "all" }, now).map((i) => i.id),
    ).toEqual(["b"]);
  });

  it("filters by author side (in/out)", () => {
    expect(
      filterMediaItems(items, { kind: "all", author: "out", period: "all" }, now).map((i) => i.id),
    ).toEqual(["b"]);
    expect(
      filterMediaItems(items, { kind: "all", author: "in", period: "all" }, now).map((i) => i.id),
    ).toEqual(["a", "c"]);
  });

  it("filters by period window", () => {
    // 7d window from 2026-06-12 includes a (2d) but not b (11d) or c (months).
    expect(
      filterMediaItems(items, { kind: "all", author: "all", period: "7d" }, now).map((i) => i.id),
    ).toEqual(["a"]);
    // 30d includes a and b, not c.
    expect(
      filterMediaItems(items, { kind: "all", author: "all", period: "30d" }, now).map((i) => i.id),
    ).toEqual(["a", "b"]);
  });

  it("combines filters (AND)", () => {
    expect(
      filterMediaItems(items, { kind: "image", author: "in", period: "7d" }, now).map((i) => i.id),
    ).toEqual(["a"]);
  });
});

describe("countByKind", () => {
  it("tallies per kind", () => {
    expect(
      countByKind([
        item({ kind: "image" }),
        item({ kind: "image" }),
        item({ kind: "audio" }),
      ]),
    ).toEqual({ image: 2, audio: 1, video: 0, document: 0 });
  });
});

describe("periodDays", () => {
  it("maps presets", () => {
    expect(periodDays("all")).toBeNull();
    expect(periodDays("7d")).toBe(7);
    expect(periodDays("30d")).toBe(30);
    expect(periodDays("90d")).toBe(90);
  });
});

describe("groupMediaByType", () => {
  it("buckets images+videos, documents and audios in that order", () => {
    const groups = groupMediaByType([
      item({ id: "img", kind: "image" }),
      item({ id: "doc", kind: "document" }),
      item({ id: "aud", kind: "audio" }),
      item({ id: "vid", kind: "video" }),
    ]);
    expect(groups.map((g) => g.key)).toEqual(["imagesVideos", "documents", "audios"]);
    expect(groups[0]!.items.map((i) => i.id)).toEqual(["img", "vid"]);
    expect(groups[1]!.items.map((i) => i.id)).toEqual(["doc"]);
    expect(groups[2]!.items.map((i) => i.id)).toEqual(["aud"]);
  });

  it("preserves input order within a bucket", () => {
    const groups = groupMediaByType([
      item({ id: "b", kind: "image" }),
      item({ id: "a", kind: "image" }),
    ]);
    expect(groups[0]!.items.map((i) => i.id)).toEqual(["b", "a"]);
  });

  it("drops empty buckets", () => {
    const groups = groupMediaByType([item({ id: "aud", kind: "audio" })]);
    expect(groups.map((g) => g.key)).toEqual(["audios"]);
  });

  it("returns nothing for an empty input", () => {
    expect(groupMediaByType([])).toEqual([]);
  });
});
