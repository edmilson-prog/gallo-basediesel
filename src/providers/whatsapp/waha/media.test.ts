import { describe, expect, it, vi } from "vitest";
import { downloadWahaMedia } from "./media";

describe("downloadWahaMedia", () => {
  it("GETs the media URL with X-Api-Key and returns bytes + mimetype", async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const fetchFn = vi
      .fn()
      .mockResolvedValue(
        new Response(bytes, { status: 200, headers: { "content-type": "image/jpeg" } }),
      );
    const result = await downloadWahaMedia(
      "api-key",
      fetchFn,
      "https://waha.example.com/api/files/x.jpg",
    );
    expect(fetchFn).toHaveBeenCalledWith(
      "https://waha.example.com/api/files/x.jpg",
      expect.objectContaining({ headers: { "X-Api-Key": "api-key" } }),
    );
    expect(result.data).toEqual(bytes);
    expect(result.mimeType).toBe("image/jpeg");
    expect(result.sizeBytes).toBe(4);
  });

  it("throws on a non-2xx response", async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response("", { status: 404 }));
    await expect(
      downloadWahaMedia("api-key", fetchFn, "https://waha.example.com/api/files/missing.jpg"),
    ).rejects.toThrow();
  });
});
