import { describe, it, expect } from "vitest";
import { parseVersionJson } from "./buildId";

describe("parseVersionJson", () => {
  it("extracts a non-empty buildId", () => {
    expect(parseVersionJson('{"buildId":"a.1","version":"0.1.0"}')).toBe("a.1");
  });
  it("returns null when buildId is missing", () => {
    expect(parseVersionJson('{"version":"0.1.0"}')).toBe(null);
  });
  it("returns null when buildId is empty", () => {
    expect(parseVersionJson('{"buildId":""}')).toBe(null);
  });
  it("returns null on non-JSON (e.g. the SPA index.html fallback)", () => {
    expect(parseVersionJson("<!doctype html><html></html>")).toBe(null);
  });
});
