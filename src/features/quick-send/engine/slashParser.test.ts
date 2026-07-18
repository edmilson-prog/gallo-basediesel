import { describe, expect, it } from "vitest";
import { parseSlash } from "./slashParser";

describe("parseSlash", () => {
  it("fires when '/' starts the message", () => {
    const s = parseSlash("/catalogo", 9);
    expect(s.active).toBe(true);
    expect(s.command).toBe("catalogo");
    expect(s.query).toBe("");
  });

  it("captures the query after the command", () => {
    const value = "/catalogo freio";
    const s = parseSlash(value, value.length);
    expect(s.active).toBe(true);
    expect(s.command).toBe("catalogo");
    expect(s.query).toBe("freio");
  });

  it("fires when '/' follows a space", () => {
    const value = "veja isso /tabela";
    const s = parseSlash(value, value.length);
    expect(s.active).toBe(true);
    expect(s.command).toBe("tabela");
  });

  it("exposes the token start (index of the '/') so callers can splice it out", () => {
    expect(parseSlash("/catalogo", 9).tokenStart).toBe(0);
    const value = "Bom dia! /garantia";
    expect(parseSlash(value, value.length).tokenStart).toBe(9);
  });

  it("does NOT fire inside a URL (http://)", () => {
    const value = "veja http://site.com";
    expect(parseSlash(value, value.length).active).toBe(false);
  });

  it("does NOT fire on a date (12/05)", () => {
    const value = "dia 12/05";
    expect(parseSlash(value, value.length).active).toBe(false);
  });

  it("does NOT fire on a fraction (3/4)", () => {
    const value = "3/4 polegada";
    expect(parseSlash(value, value.length).active).toBe(false);
  });

  it("does NOT fire on a double slash escape (//)", () => {
    const value = "//garantia";
    expect(parseSlash(value, value.length).active).toBe(false);
  });

  it("is inactive when caret is before the slash token", () => {
    const value = "/catalogo freio";
    // caret at position 0 — nothing typed yet at caret
    expect(parseSlash(value, 0).active).toBe(false);
  });
});
