import { describe, it, expect } from "vitest";
import { formatPhone } from "./format";

describe("formatPhone", () => {
  it("formats 11 digits", () => {
    expect(formatPhone("11987654321")).toBe("(11) 98765-4321");
  });
  it("formats 10-digit landline", () => {
    expect(formatPhone("1133334444")).toBe("(11) 3333-4444");
  });
  it("formats 13-digit E.164 with 55 prefix (mobile)", () => {
    expect(formatPhone("5511987654321")).toBe("+55 (11) 98765-4321");
  });
  it("formats 12-digit E.164 with 55 prefix (landline)", () => {
    expect(formatPhone("551133334444")).toBe("+55 (11) 3333-4444");
  });
  it("leaves unknown lengths unchanged", () => {
    expect(formatPhone("123")).toBe("123");
  });
});
