import { describe, it, expect } from "vitest";
import { applyAttendantSignature, normalizeAttendantName } from "./attendantSignature";

describe("normalizeAttendantName", () => {
  it("trims and drops asterisks", () => {
    expect(normalizeAttendantName("  Edmilson  ")).toBe("Edmilson");
    expect(normalizeAttendantName("*Ed*")).toBe("Ed");
  });

  it("returns empty for nullish / blank / asterisk-only", () => {
    expect(normalizeAttendantName(undefined)).toBe("");
    expect(normalizeAttendantName(null)).toBe("");
    expect(normalizeAttendantName("   ")).toBe("");
    expect(normalizeAttendantName("**")).toBe("");
  });
});

describe("applyAttendantSignature", () => {
  it("prepends a bold signature for a normal text", () => {
    expect(applyAttendantSignature("Bom dia", "Edmilson")).toBe("*Edmilson:* Bom dia");
  });

  it("trims and sanitizes the name before signing", () => {
    expect(applyAttendantSignature("Oi", "  Edmilson  ")).toBe("*Edmilson:* Oi");
    expect(applyAttendantSignature("Oi", "*Ed*")).toBe("*Ed:* Oi");
  });

  it("leaves the text unchanged when there is no usable name", () => {
    expect(applyAttendantSignature("Bom dia", undefined)).toBe("Bom dia");
    expect(applyAttendantSignature("Bom dia", null)).toBe("Bom dia");
    expect(applyAttendantSignature("Bom dia", "   ")).toBe("Bom dia");
    expect(applyAttendantSignature("Bom dia", "**")).toBe("Bom dia");
  });

  it("does not sign blank text (media without caption)", () => {
    expect(applyAttendantSignature("", "Edmilson")).toBe("");
    expect(applyAttendantSignature("   ", "Edmilson")).toBe("   ");
  });

  it("never signs structured-marker payloads", () => {
    expect(applyAttendantSignature("[template] foo", "Edmilson")).toBe("[template] foo");
    expect(applyAttendantSignature('[product]{"id":1}', "Edmilson")).toBe('[product]{"id":1}');
    expect(applyAttendantSignature('[produto]{"id":1}', "Edmilson")).toBe('[produto]{"id":1}');
    expect(applyAttendantSignature('[link]{"url":"x"}', "Edmilson")).toBe('[link]{"url":"x"}');
  });

  it("is idempotent — does not double-sign already-signed text (retry/edit)", () => {
    expect(applyAttendantSignature("*Edmilson:* Bom dia", "Edmilson")).toBe("*Edmilson:* Bom dia");
    // even a signature from another attendant is left as-is (no double prefix)
    expect(applyAttendantSignature("*Maria:* Oi", "Edmilson")).toBe("*Maria:* Oi");
  });
});
