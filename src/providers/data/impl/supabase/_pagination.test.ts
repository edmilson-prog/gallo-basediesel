import { describe, expect, it, vi } from "vitest";
import { fetchLargePage } from "./_pagination";

function makeChunkFetcher(items: number[]) {
  return vi.fn(async (from: number, to: number) => ({
    data: items.slice(from, to + 1),
    count: items.length,
  }));
}

describe("fetchLargePage", () => {
  it("returns everything in one call when pageSize covers the whole set", async () => {
    const items = Array.from({ length: 30 }, (_, i) => i);
    const fetchChunk = makeChunkFetcher(items);
    const result = await fetchLargePage(fetchChunk, 0, 1000);
    expect(result).toEqual({ data: items, total: 30 });
    expect(fetchChunk).toHaveBeenCalledTimes(1);
    expect(fetchChunk).toHaveBeenCalledWith(0, 999);
  });

  it("loops across multiple 1000-row chunks until pageSize is satisfied", async () => {
    const items = Array.from({ length: 2500 }, (_, i) => i);
    const fetchChunk = makeChunkFetcher(items);
    const result = await fetchLargePage(fetchChunk, 0, 2500);
    expect(result.data).toEqual(items);
    expect(result.total).toBe(2500);
    expect(fetchChunk).toHaveBeenCalledTimes(3);
    expect(fetchChunk).toHaveBeenNthCalledWith(1, 0, 999);
    expect(fetchChunk).toHaveBeenNthCalledWith(2, 1000, 1999);
    expect(fetchChunk).toHaveBeenNthCalledWith(3, 2000, 2499);
  });

  it("stops once the reported total is reached, without an extra request", async () => {
    const items = Array.from({ length: 2000 }, (_, i) => i);
    const fetchChunk = makeChunkFetcher(items);
    await fetchLargePage(fetchChunk, 0, 2000);
    expect(fetchChunk).toHaveBeenCalledTimes(2);
  });

  it("respects a non-zero starting offset (page > 1)", async () => {
    const items = Array.from({ length: 2500 }, (_, i) => i);
    const fetchChunk = makeChunkFetcher(items);
    const result = await fetchLargePage(fetchChunk, 1500, 1000);
    expect(result.data).toEqual(items.slice(1500, 2500));
    expect(fetchChunk).toHaveBeenCalledTimes(1);
    expect(fetchChunk).toHaveBeenCalledWith(1500, 2499);
  });

  it("stops defensively if a chunk returns fewer rows than the reported total (avoids infinite loop)", async () => {
    const fetchChunk = vi.fn(async (from: number) => ({
      data: from === 0 ? [1, 2, 3] : [],
      count: 100,
    }));
    const result = await fetchLargePage(fetchChunk, 0, 5000);
    expect(result.data).toEqual([1, 2, 3]);
    expect(fetchChunk).toHaveBeenCalledTimes(2);
  });

  it("returns an empty result when there is nothing to fetch", async () => {
    const fetchChunk = makeChunkFetcher([]);
    const result = await fetchLargePage(fetchChunk, 0, 1000);
    expect(result).toEqual({ data: [], total: 0 });
    expect(fetchChunk).toHaveBeenCalledTimes(1);
  });
});
