import { describe, expect, it } from "vitest";
import { isDetractor, isWellFormedToken, parseSubmission } from "./validation";

const TOKEN = "a".repeat(64);

describe("isWellFormedToken", () => {
  it("accepts the 64 hex chars the scheduler mints", () => {
    expect(isWellFormedToken(TOKEN)).toBe(true);
  });

  it("rejects anything else without touching the database", () => {
    expect(isWellFormedToken("short")).toBe(false);
    expect(isWellFormedToken("z".repeat(64))).toBe(false);
    expect(isWellFormedToken(`${TOKEN}extra`)).toBe(false);
    expect(isWellFormedToken(null)).toBe(false);
    expect(isWellFormedToken(12345)).toBe(false);
  });
});

describe("parseSubmission", () => {
  it("accepts a valid submission", () => {
    expect(parseSubmission({ token: TOKEN, score: 9, comment: "atendimento rápido" })).toEqual({
      ok: true,
      token: TOKEN,
      score: 9,
      comment: "atendimento rápido",
    });
  });

  it("accepts both ends of the scale", () => {
    expect(parseSubmission({ token: TOKEN, score: 0 }).ok).toBe(true);
    expect(parseSubmission({ token: TOKEN, score: 10 }).ok).toBe(true);
  });

  it("rejects a score outside 0..10", () => {
    expect(parseSubmission({ token: TOKEN, score: 11 })).toEqual({
      ok: false,
      error: "nota inválida",
    });
    expect(parseSubmission({ token: TOKEN, score: -1 }).ok).toBe(false);
  });

  it("rejects a non-integer score", () => {
    expect(parseSubmission({ token: TOKEN, score: 7.5 }).ok).toBe(false);
    expect(parseSubmission({ token: TOKEN, score: "9" }).ok).toBe(false);
  });

  it("normalises an empty or whitespace comment to null", () => {
    const result = parseSubmission({ token: TOKEN, score: 8, comment: "   " });
    expect(result).toEqual({ ok: true, token: TOKEN, score: 8, comment: null });
  });

  it("trims the comment", () => {
    const result = parseSubmission({ token: TOKEN, score: 8, comment: "  ok  " });
    expect(result.ok && result.comment).toBe("ok");
  });

  it("rejects a comment past the limit", () => {
    const result = parseSubmission({ token: TOKEN, score: 8, comment: "x".repeat(1001) });
    expect(result).toEqual({ ok: false, error: "comentário muito longo" });
  });

  it("accepts a comment exactly at the limit", () => {
    expect(parseSubmission({ token: TOKEN, score: 8, comment: "x".repeat(1000) }).ok).toBe(true);
  });

  it("rejects a malformed body", () => {
    expect(parseSubmission(null).ok).toBe(false);
    expect(parseSubmission("nope").ok).toBe(false);
    expect(parseSubmission({ score: 9 }).ok).toBe(false);
  });
});

describe("isDetractor", () => {
  it("marks 0 through 6", () => {
    expect(isDetractor(0)).toBe(true);
    expect(isDetractor(6)).toBe(true);
  });

  it("does not mark 7 and above", () => {
    expect(isDetractor(7)).toBe(false);
    expect(isDetractor(10)).toBe(false);
  });
});
