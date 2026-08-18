import { describe, it, expect } from "vitest";
import { readChangelogPayload } from "./readChangelogPayload";

const VALID_CHANGELOG = `# Changelog

## [0.2.0] — Pulse · 2026-05-27

### Added

- Something new

## [0.1.0] — Genesis · 2026-04-12

### Fixed

- Something fixed
`;

const HTML_FALLBACK = `<!doctype html>
<html lang="pt-BR">
  <head><meta charset="utf-8" /></head>
  <body><div id="root"></div></body>
</html>`;

describe("readChangelogPayload (issue #430 — silent-failure guard)", () => {
  it("parses a valid changelog body", () => {
    const releases = readChangelogPayload("text/markdown", VALID_CHANGELOG);
    expect(releases).toHaveLength(2);
    expect(releases[0]?.version).toBe("0.2.0");
  });

  it("throws when the response content-type is HTML (SPA rewrite fallback)", () => {
    expect(() => readChangelogPayload("text/html; charset=utf-8", VALID_CHANGELOG)).toThrow(/HTML/);
  });

  it("throws when a non-empty body parses into zero releases (e.g. an HTML body without content-type)", () => {
    expect(() => readChangelogPayload(null, HTML_FALLBACK)).toThrow(/release/i);
  });

  it("returns an empty list for an empty body (no false error state)", () => {
    expect(readChangelogPayload("text/markdown", "")).toEqual([]);
  });
});
