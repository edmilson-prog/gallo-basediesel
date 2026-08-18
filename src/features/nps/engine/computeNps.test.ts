import { describe, expect, it } from "vitest";
import { classifyScore, computeNps } from "./computeNps";

describe("classifyScore", () => {
  it("classifies the 6/7 boundary", () => {
    expect(classifyScore(6)).toBe("detractor");
    expect(classifyScore(7)).toBe("passive");
  });

  it("classifies the 8/9 boundary", () => {
    expect(classifyScore(8)).toBe("passive");
    expect(classifyScore(9)).toBe("promoter");
  });

  it("classifies the extremes", () => {
    expect(classifyScore(0)).toBe("detractor");
    expect(classifyScore(10)).toBe("promoter");
  });
});

describe("computeNps", () => {
  const responses = (scores: number[]) => scores.map((score) => ({ score }));

  it("returns collecting below the minimum, never a number", () => {
    const result = computeNps(responses([10, 10, 9]), { minResponses: 5, sent: 10 });
    expect(result.state).toBe("collecting");
    expect(result.score).toBeNull();
    expect(result.n).toBe(3);
  });

  it("still reports the class counts while collecting", () => {
    const result = computeNps(responses([10, 10, 3]), { minResponses: 5, sent: 10 });
    expect(result.promoters).toBe(2);
    expect(result.detractors).toBe(1);
  });

  it("computes the PRD acceptance case: 12 promoters, 4 passives, 4 detractors", () => {
    const scores = [...Array(12).fill(10), ...Array(4).fill(8), ...Array(4).fill(3)];
    const result = computeNps(responses(scores), { minResponses: 5, sent: 40 });
    expect(result.state).toBe("ok");
    expect(result.score).toBe(40); // 60% promotores − 20% detratores
    expect(result.n).toBe(20);
    expect(result.responseRate).toBe(0.5);
  });

  it("rounds to the nearest integer", () => {
    // 1 promotor e 2 detratores em 3 → 33,33% − 66,67% = −33,33 → −33
    const result = computeNps(responses([9, 3, 3]), { minResponses: 1, sent: 3 });
    expect(result.score).toBe(-33);
  });

  it("reaches the extremes", () => {
    expect(computeNps(responses([10, 10, 9]), { minResponses: 1, sent: 3 }).score).toBe(100);
    expect(computeNps(responses([0, 6, 3]), { minResponses: 1, sent: 3 }).score).toBe(-100);
  });

  it("ignores passives in the score but counts them in n", () => {
    const result = computeNps(responses([7, 8, 7, 8]), { minResponses: 1, sent: 4 });
    expect(result.score).toBe(0);
    expect(result.n).toBe(4);
    expect(result.passives).toBe(4);
  });

  it("handles an empty set without dividing by zero", () => {
    const result = computeNps([], { minResponses: 5, sent: 0 });
    expect(result.state).toBe("collecting");
    expect(result.score).toBeNull();
    expect(result.n).toBe(0);
    expect(result.responseRate).toBe(0);
  });

  it("never reports a response rate above 1 when sent lags behind", () => {
    const result = computeNps(responses([10, 9]), { minResponses: 1, sent: 0 });
    expect(result.responseRate).toBe(0);
  });
});
