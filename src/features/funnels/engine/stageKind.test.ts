import { describe, expect, it } from "vitest";
import { isClosingKind, resolveStageKind } from "./stageKind";

describe("resolveStageKind", () => {
  it("trusts an explicit kind over the legacy id", () => {
    expect(resolveStageKind({ id: "stage-fechado", kind: "aberta" })).toBe("aberta");
    expect(resolveStageKind({ id: "stage-novo", kind: "ganho" })).toBe("ganho");
  });

  it("falls back to the legacy closing id when kind is absent", () => {
    expect(resolveStageKind({ id: "stage-fechado" })).toBe("ganho");
  });

  it("treats any other legacy id as an open stage", () => {
    expect(resolveStageKind({ id: "stage-novo" })).toBe("aberta");
    expect(resolveStageKind({ id: "stage-negociacao" })).toBe("aberta");
  });
});

describe("isClosingKind", () => {
  it("is true for both terminal outcomes", () => {
    expect(isClosingKind("ganho")).toBe(true);
    expect(isClosingKind("perda")).toBe(true);
  });

  it("is false for entry and open stages", () => {
    expect(isClosingKind("entrada")).toBe(false);
    expect(isClosingKind("aberta")).toBe(false);
  });
});
