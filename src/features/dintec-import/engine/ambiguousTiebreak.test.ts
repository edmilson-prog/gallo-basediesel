import { describe, it, expect } from "vitest";
import { pickBestCodcliByLtv, type AmbiguousCandidate } from "./ambiguousTiebreak";

describe("pickBestCodcliByLtv", () => {
  it("picks the candidate with the highest LTV", () => {
    const candidates: AmbiguousCandidate[] = [
      { codcli: "957", ltv: 12000 },
      { codcli: "3150", ltv: 45000 },
    ];
    expect(pickBestCodcliByLtv(candidates)).toBe("3150");
  });

  it("returns the sole candidate when there is only one", () => {
    expect(pickBestCodcliByLtv([{ codcli: "265", ltv: 0 }])).toBe("265");
  });

  it("is deterministic on ties — first candidate in the array wins", () => {
    const candidates: AmbiguousCandidate[] = [
      { codcli: "2344", ltv: 5000 },
      { codcli: "2435", ltv: 5000 },
    ];
    expect(pickBestCodcliByLtv(candidates)).toBe("2344");
  });

  it("throws on an empty candidate list", () => {
    expect(() => pickBestCodcliByLtv([])).toThrow();
  });
});
