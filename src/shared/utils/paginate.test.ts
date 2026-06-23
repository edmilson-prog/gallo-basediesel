import { describe, expect, it, vi } from "vitest";
import { drainPaged } from "./paginate";

describe("drainPaged", () => {
  it("returns a single short page in one call", async () => {
    const fetchPage = vi.fn(async () => [1, 2]); // 2 < pageSize 3 → stop
    const out = await drainPaged(fetchPage, 3);
    expect(out).toEqual([1, 2]);
    expect(fetchPage).toHaveBeenCalledTimes(1);
    expect(fetchPage).toHaveBeenCalledWith(0, 3);
  });

  it("returns empty for an empty first page", async () => {
    const fetchPage = vi.fn(async () => [] as number[]);
    const out = await drainPaged(fetchPage, 3);
    expect(out).toEqual([]);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it("stops after a full page followed by an empty page (exact multiple)", async () => {
    const pages: number[][] = [[1, 2], [3, 4], []];
    const fetchPage = vi.fn(async (offset: number) => pages[offset / 2] ?? []);
    const out = await drainPaged(fetchPage, 2);
    expect(out).toEqual([1, 2, 3, 4]);
    expect(fetchPage.mock.calls.map((c) => c[0])).toEqual([0, 2, 4]);
  });

  it("accumulates across pages and stops on the short page", async () => {
    const pages: number[][] = [[1, 2], [3, 4], [5]];
    const fetchPage = vi.fn(async (offset: number) => pages[offset / 2] ?? []);
    const out = await drainPaged(fetchPage, 2);
    expect(out).toEqual([1, 2, 3, 4, 5]);
    expect(fetchPage.mock.calls.map((c) => c[0])).toEqual([0, 2, 4]);
  });

  it("propagates a fetchPage rejection", async () => {
    const fetchPage = vi.fn(async () => {
      throw new Error("boom");
    });
    await expect(drainPaged(fetchPage, 2)).rejects.toThrow("boom");
  });

  it("throws for any non-positive-integer pageSize", async () => {
    const fp = async () => [] as number[];
    await expect(drainPaged(fp, 0)).rejects.toThrow("pageSize must be a positive integer");
    await expect(drainPaged(fp, -1)).rejects.toThrow("pageSize must be a positive integer");
    await expect(drainPaged(fp, 1.5)).rejects.toThrow("pageSize must be a positive integer");
    await expect(drainPaged(fp, NaN)).rejects.toThrow("pageSize must be a positive integer");
    await expect(drainPaged(fp, Infinity)).rejects.toThrow("pageSize must be a positive integer");
  });

  it("throws when the iteration cap is exceeded (fetchPage never short)", async () => {
    const fetchPage = vi.fn(async () => [1]); // length 1 == pageSize 1 → never short
    await expect(drainPaged(fetchPage, 1)).rejects.toThrow(/exceeded \d+ pages/);
  });
});
