import { describe, it, expect } from "vitest";
import { classifyVersionResponse, parseVersionJson } from "./buildId";

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

describe("classifyVersionResponse (issue #430 — silent-failure guard)", () => {
  const HTML = "<!doctype html><html></html>";

  it("accepts a healthy JSON response without warning", () => {
    expect(
      classifyVersionResponse({
        ok: true,
        status: 200,
        contentType: "application/json",
        body: '{"buildId":"abc.123"}',
      }),
    ).toEqual({ buildId: "abc.123", warning: null });
  });

  it("rejects an HTML body even when the status is 200 (SPA rewrite fallback)", () => {
    const result = classifyVersionResponse({
      ok: true,
      status: 200,
      contentType: "text/html; charset=utf-8",
      body: HTML,
    });
    expect(result.buildId).toBe(null);
    expect(result.warning).toMatch(/HTML/);
  });

  it("surfaces a warning on non-ok status so the mute watcher leaves a trace", () => {
    const result = classifyVersionResponse({ ok: false, status: 404, contentType: null, body: "" });
    expect(result.buildId).toBe(null);
    expect(result.warning).toMatch(/404/);
  });

  it("warns when a non-empty body yields no buildId", () => {
    const result = classifyVersionResponse({
      ok: true,
      status: 200,
      contentType: "application/json",
      body: '{"version":"0.1.0"}',
    });
    expect(result.buildId).toBe(null);
    expect(result.warning).not.toBe(null);
  });

  it("tolerates a missing content-type when the body parses", () => {
    expect(
      classifyVersionResponse({
        ok: true,
        status: 200,
        contentType: null,
        body: '{"buildId":"abc.123"}',
      }),
    ).toEqual({ buildId: "abc.123", warning: null });
  });
});
