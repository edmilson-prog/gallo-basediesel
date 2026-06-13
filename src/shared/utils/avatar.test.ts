import { describe, expect, it } from "vitest";
import { initialsFrom, isPhoneLikeName } from "./avatar";

describe("isPhoneLikeName", () => {
  it("flags names that are just a phone number", () => {
    expect(isPhoneLikeName("+5511916327394")).toBe(true);
    expect(isPhoneLikeName("+55 11 91632-7394")).toBe(true);
    expect(isPhoneLikeName("(11) 91632-7394")).toBe(true);
    expect(isPhoneLikeName("555481572275")).toBe(true);
  });

  it("does not flag real names (even with digits)", () => {
    expect(isPhoneLikeName("João Silva")).toBe(false);
    expect(isPhoneLikeName("Maria")).toBe(false);
    expect(isPhoneLikeName("Auto Peças 24h")).toBe(false);
    expect(isPhoneLikeName("Posto 7")).toBe(false);
  });

  it("does not flag empty or punctuation-only names", () => {
    expect(isPhoneLikeName("")).toBe(false);
    expect(isPhoneLikeName("   ")).toBe(false);
    expect(isPhoneLikeName("?")).toBe(false);
    expect(isPhoneLikeName("--")).toBe(false);
  });
});

// Guard the existing behavior we rely on for the non-phone fallback.
describe("initialsFrom", () => {
  it("keeps deriving initials from real names", () => {
    expect(initialsFrom("João Silva")).toBe("JS");
    expect(initialsFrom("Maria")).toBe("MA");
  });
});
