import { describe, it, expect } from "vitest";
import type { IRelease } from "@/shared/types/about";
import {
  compareSemver,
  selectNewReleases,
  latestVersionToMark,
  MAX_RELEASES_IN_MODAL,
} from "./versionGate";

function rel(version: string, kind: IRelease["kind"]): IRelease {
  return {
    version,
    codename: null,
    date: "2026-01-01",
    kind,
    summary: "",
    block: null,
    categories: [],
    totalItems: 0,
    raw: "",
  };
}

describe("compareSemver", () => {
  it("orders numerically, not lexically (0.10.0 > 0.9.0)", () => {
    expect(compareSemver("0.10.0", "0.9.0")).toBeGreaterThan(0);
  });
  it("returns 0 for equal versions", () => {
    expect(compareSemver("1.2.3", "1.2.3")).toBe(0);
  });
  it("compares the patch segment", () => {
    expect(compareSemver("0.1.1", "0.1.0")).toBeGreaterThan(0);
    expect(compareSemver("0.1.0", "0.1.1")).toBeLessThan(0);
  });
});

describe("selectNewReleases", () => {
  it("baseline: lastSeen null → does not open", () => {
    const res = selectNewReleases([rel("0.110.0", "minor")], null);
    expect(res).toEqual({ shouldOpen: false, newReleases: [], overflowCount: 0 });
  });

  it("skips patches and releases not newer than lastSeen", () => {
    const releases = [rel("0.111.0", "minor"), rel("0.110.1", "patch"), rel("0.110.0", "minor")];
    const res = selectNewReleases(releases, "0.110.0");
    expect(res.shouldOpen).toBe(true);
    expect(res.newReleases.map((r) => r.version)).toEqual(["0.111.0"]);
    expect(res.overflowCount).toBe(0);
  });

  it("rollback: nothing newer → does not open", () => {
    const res = selectNewReleases([rel("0.100.0", "minor")], "0.200.0");
    expect(res.shouldOpen).toBe(false);
    expect(res.newReleases).toHaveLength(0);
  });

  it("caps at maxReleases and reports overflow", () => {
    const releases = Array.from({ length: 7 }, (_, i) => rel(`0.${200 - i}.0`, "minor"));
    const res = selectNewReleases(releases, "0.100.0");
    expect(res.newReleases).toHaveLength(MAX_RELEASES_IN_MODAL);
    expect(res.overflowCount).toBe(2);
    expect(res.shouldOpen).toBe(true);
  });
});

describe("latestVersionToMark", () => {
  it("returns the highest version including patch", () => {
    const releases = [rel("0.110.1", "patch"), rel("0.110.0", "minor")];
    expect(latestVersionToMark(releases)).toBe("0.110.1");
  });
  it("returns null for empty input", () => {
    expect(latestVersionToMark([])).toBeNull();
  });
});
