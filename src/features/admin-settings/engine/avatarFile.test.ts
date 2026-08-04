import { describe, expect, it } from "vitest";
import {
  AVATAR_ACCEPT_ATTRIBUTE,
  AVATAR_MAX_BYTES,
  formatInitials,
  validateAvatarFile,
} from "./avatarFile";

/** Minimal File stand-in — validation only reads `type` and `size`. */
function fakeFile(type: string, size: number): File {
  return { name: "photo", type, size } as File;
}

describe("validateAvatarFile", () => {
  it("accepts a JPEG under the limit", () => {
    expect(validateAvatarFile(fakeFile("image/jpeg", 1_000_000))).toEqual({ ok: true });
  });

  it("accepts a PNG under the limit", () => {
    expect(validateAvatarFile(fakeFile("image/png", 10))).toEqual({ ok: true });
  });

  it("rejects an unsupported type", () => {
    const result = validateAvatarFile(fakeFile("image/gif", 10));
    expect(result.ok).toBe(false);
    expect(result).toHaveProperty("error", "A foto deve ser um arquivo JPG ou PNG.");
  });

  it("rejects a non-image entirely", () => {
    expect(validateAvatarFile(fakeFile("application/pdf", 10)).ok).toBe(false);
  });

  it("rejects a file over the size limit", () => {
    const result = validateAvatarFile(fakeFile("image/png", AVATAR_MAX_BYTES + 1));
    expect(result.ok).toBe(false);
    expect(result).toHaveProperty("error", "A foto deve ter no máximo 2 MB.");
  });

  it("accepts a file exactly at the limit", () => {
    expect(validateAvatarFile(fakeFile("image/png", AVATAR_MAX_BYTES)).ok).toBe(true);
  });

  it("exposes an accept attribute matching the accepted types", () => {
    expect(AVATAR_ACCEPT_ATTRIBUTE).toBe("image/jpeg,image/png");
  });
});

describe("formatInitials", () => {
  it("takes the first letter of the first and last name", () => {
    expect(formatInitials("Edmilson Souza")).toBe("ES");
  });

  it("handles a single name", () => {
    expect(formatInitials("Edmilson")).toBe("ED");
  });

  it("ignores extra whitespace", () => {
    expect(formatInitials("  Maria   Clara  Cardoso ")).toBe("MC");
  });

  it("falls back for an empty name", () => {
    expect(formatInitials("")).toBe("?");
    expect(formatInitials("   ")).toBe("?");
  });

  it("uppercases the result", () => {
    expect(formatInitials("joão gallo")).toBe("JG");
  });
});
