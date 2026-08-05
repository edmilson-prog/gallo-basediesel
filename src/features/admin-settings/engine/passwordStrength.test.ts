import { describe, expect, it } from "vitest";
import {
  MIN_PASSWORD_LENGTH,
  evaluatePassword,
  scorePassword,
  validatePasswordChange,
} from "./passwordStrength";

describe("scorePassword", () => {
  it("scores an empty password as zero", () => {
    expect(scorePassword("")).toBe(0);
  });

  it("awards one point per satisfied rule", () => {
    expect(scorePassword("abcdefgh")).toBe(1); // length only
    expect(scorePassword("Abcdefgh")).toBe(2); // + uppercase
    expect(scorePassword("Abcdefg1")).toBe(3); // + digit
    expect(scorePassword("Abcdefg1!")).toBe(4); // + symbol
  });

  it("does not award the length point below the minimum", () => {
    expect(scorePassword("Ab1!")).toBe(3);
  });

  it("caps the score at four", () => {
    expect(scorePassword("Abcdefghijk1234!@#$")).toBe(4);
  });
});

describe("evaluatePassword", () => {
  it("reports an idle state for an empty password", () => {
    const result = evaluatePassword("");
    expect(result).toEqual({ score: 0, label: "Força da senha", tone: "muted", filled: 0 });
  });

  it("labels a weak password as critical", () => {
    expect(evaluatePassword("abcdefgh")).toMatchObject({
      score: 1,
      label: "Senha fraca",
      tone: "critical",
    });
  });

  it("labels a mid password as a warning", () => {
    expect(evaluatePassword("Abcdefgh")).toMatchObject({
      score: 2,
      label: "Senha razoável",
      tone: "warning",
    });
  });

  it("labels strong passwords as success", () => {
    expect(evaluatePassword("Abcdefg1")).toMatchObject({ score: 3, tone: "success" });
    expect(evaluatePassword("Abcdefg1!")).toMatchObject({
      score: 4,
      label: "Senha forte",
      tone: "success",
    });
  });

  it("mirrors the score onto the number of filled bars", () => {
    expect(evaluatePassword("Abcdefg1!").filled).toBe(4);
    expect(evaluatePassword("Ab1!").filled).toBe(3);
  });
});

describe("validatePasswordChange", () => {
  const valid = { current: "old-secret", next: "Abcdefg1!", confirm: "Abcdefg1!" };

  it("accepts a well-formed change", () => {
    expect(validatePasswordChange(valid)).toEqual({ ok: true });
  });

  it("requires the current password", () => {
    expect(validatePasswordChange({ ...valid, current: "   " })).toEqual({
      ok: false,
      error: "Informe sua senha atual.",
    });
  });

  it("enforces the minimum length on the new password", () => {
    const short = "Ab1!";
    expect(validatePasswordChange({ ...valid, next: short, confirm: short })).toEqual({
      ok: false,
      error: `A nova senha deve ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`,
    });
  });

  it("rejects a mismatched confirmation", () => {
    expect(validatePasswordChange({ ...valid, confirm: "Abcdefg1?" })).toEqual({
      ok: false,
      error: "As senhas não conferem.",
    });
  });

  it("rejects reusing the current password", () => {
    expect(
      validatePasswordChange({ current: "Abcdefg1!", next: "Abcdefg1!", confirm: "Abcdefg1!" }),
    ).toEqual({ ok: false, error: "A nova senha deve ser diferente da atual." });
  });
});
