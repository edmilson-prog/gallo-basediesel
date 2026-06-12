import { describe, it, expect } from "vitest";
import {
  extensionForMime,
  mediaObjectPath,
  processMediaBackfill,
  type IMediaBackfillDb,
  type IMediaBackfillItem,
  type IMediaDownloader,
} from "./core";
import { WhatsAppProviderError } from "../errors";

describe("extensionForMime", () => {
  it("maps known mimes", () => {
    expect(extensionForMime("image/jpeg")).toBe("jpg");
    expect(extensionForMime("audio/ogg")).toBe("ogg");
    expect(extensionForMime("application/pdf")).toBe("pdf");
  });

  it("tolerates parameters like codecs and casing", () => {
    expect(extensionForMime("audio/ogg; codecs=opus")).toBe("ogg");
    expect(extensionForMime("AUDIO/OGG")).toBe("ogg");
  });

  it("falls back to bin for unknown mimes", () => {
    expect(extensionForMime("application/x-weird")).toBe("bin");
  });
});

describe("mediaObjectPath", () => {
  it("mirrors the webhook layout with the resolved extension", () => {
    expect(mediaObjectPath("conv1", "msg1", "audio/ogg; codecs=opus")).toBe(
      "conversations/conv1/msg1/media.ogg",
    );
  });
});

function makeDb(items: IMediaBackfillItem[]) {
  const uploads: { path: string; mimeType: string }[] = [];
  const stamped: { messageId: string; mediaUrl: string }[] = [];
  const unavailable: string[] = [];
  const db: IMediaBackfillDb = {
    listMissingMedia: async () => items,
    uploadMedia: async (path, _data, mimeType) => {
      uploads.push({ path, mimeType });
    },
    setMessageMedia: async (messageId, mediaUrl) => {
      stamped.push({ messageId, mediaUrl });
    },
    markUnavailable: async (messageId) => {
      unavailable.push(messageId);
    },
  };
  return { db, uploads, stamped, unavailable };
}

const item = (n: number): IMediaBackfillItem => ({
  messageId: `m${n}`,
  conversationId: `c${n}`,
  providerMessageId: `pm${n}`,
  mediaType: "audio",
});

describe("processMediaBackfill", () => {
  it("recovers media that downloads, uploading and stamping the path", async () => {
    const { db, uploads, stamped } = makeDb([item(1), item(2)]);
    const downloader: IMediaDownloader = {
      downloadInboundMedia: async (pmid) => ({
        data: new Uint8Array([1, 2, 3]),
        mimeType: pmid === "pm1" ? "audio/ogg; codecs=opus" : "image/jpeg",
      }),
    };

    const result = await processMediaBackfill({ accountId: "acc", limit: 10, db, downloader });

    expect(result).toEqual({ attempted: 2, recovered: 2, failed: 0, reasons: {} });
    expect(uploads).toEqual([
      { path: "conversations/c1/m1/media.ogg", mimeType: "audio/ogg; codecs=opus" },
      { path: "conversations/c2/m2/media.jpg", mimeType: "image/jpeg" },
    ]);
    expect(stamped).toEqual([
      { messageId: "m1", mediaUrl: "conversations/c1/m1/media.ogg" },
      { messageId: "m2", mediaUrl: "conversations/c2/m2/media.jpg" },
    ]);
  });

  it("counts expired media (provider NOT_FOUND) as a non-fatal reason", async () => {
    const { db, uploads, stamped, unavailable } = makeDb([item(1), item(2)]);
    const downloader: IMediaDownloader = {
      downloadInboundMedia: async (pmid) => {
        if (pmid === "pm2") {
          throw new WhatsAppProviderError("NOT_FOUND", 404, "media gone");
        }
        return { data: new Uint8Array([9]), mimeType: "audio/ogg" };
      },
    };

    const result = await processMediaBackfill({ accountId: "acc", limit: 10, db, downloader });

    expect(result.attempted).toBe(2);
    expect(result.recovered).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.reasons).toEqual({ expired_or_missing: 1 });
    // The recovered one still uploaded/stamped; the failed one did neither.
    expect(uploads).toHaveLength(1);
    expect(stamped).toEqual([{ messageId: "m1", mediaUrl: "conversations/c1/m1/media.ogg" }]);
    // The failed one is marked unavailable so a re-run skips it.
    expect(unavailable).toEqual(["m2"]);
  });

  it("classifies non-provider errors as 'error', marks unavailable, keeps going", async () => {
    const { db, unavailable } = makeDb([item(1)]);
    const downloader: IMediaDownloader = {
      downloadInboundMedia: async () => {
        throw new Error("network down");
      },
    };

    const result = await processMediaBackfill({ accountId: "acc", limit: 10, db, downloader });

    expect(result).toEqual({ attempted: 1, recovered: 0, failed: 1, reasons: { error: 1 } });
    expect(unavailable).toEqual(["m1"]);
  });
});
