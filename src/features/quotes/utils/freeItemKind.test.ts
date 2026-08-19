// src/features/quotes/utils/freeItemKind.test.ts
import { describe, expect, it } from "vitest";
import { applyFreeItemKind, isFreeItemKindActive } from "./freeItemKind";

describe("applyFreeItemKind", () => {
  it("writes the kind into an empty description", () => {
    expect(applyFreeItemKind("", "Serviço")).toBe("Serviço");
    expect(applyFreeItemKind("   ", "Taxa")).toBe("Taxa");
  });

  it("keeps what the seller already typed, prefixed by the kind", () => {
    expect(applyFreeItemKind("troca de bicos", "Serviço")).toBe("Serviço — troca de bicos");
  });

  it("swaps the previous kind instead of stacking prefixes", () => {
    expect(applyFreeItemKind("Serviço — troca de bicos", "Mão de obra")).toBe(
      "Mão de obra — troca de bicos",
    );
    expect(applyFreeItemKind("Serviço", "Peça sob encomenda")).toBe("Peça sob encomenda");
  });

  it("is idempotent — re-picking the same kind changes nothing", () => {
    expect(applyFreeItemKind("Serviço — troca de bicos", "Serviço")).toBe(
      "Serviço — troca de bicos",
    );
  });

  it("leaves a description that merely starts with the word alone", () => {
    expect(applyFreeItemKind("Serviço de guincho", "Taxa")).toBe("Taxa — Serviço de guincho");
  });
});

describe("isFreeItemKindActive", () => {
  it("matches the kind alone and the kind as prefix", () => {
    expect(isFreeItemKindActive("Serviço", "Serviço")).toBe(true);
    expect(isFreeItemKindActive("Serviço — troca de bicos", "Serviço")).toBe(true);
  });

  it("does not match a free-typed description that happens to start with the word", () => {
    expect(isFreeItemKindActive("Serviço de guincho", "Serviço")).toBe(false);
  });

  it("does not match another kind", () => {
    expect(isFreeItemKindActive("Mão de obra — troca", "Serviço")).toBe(false);
    expect(isFreeItemKindActive("", "Serviço")).toBe(false);
  });
});
