import { describe, expect, it } from "vitest";
import { calculateMetrics, mrrAt3, ndcgAt3, precisionAt1 } from "../src/metrics.js";

describe("metrics", () => {
  const ratings = { a: 3, b: 2, c: 0 };

  it("calculates Precision@1", () => {
    expect(precisionAt1(["a"], ratings)).toBe(1);
    expect(precisionAt1(["c"], ratings)).toBe(0);
  });

  it("calculates MRR@3", () => {
    expect(mrrAt3(["c", "b", "a"], ratings)).toBe(0.5);
    expect(mrrAt3(["c", "missing"], ratings)).toBe(0);
  });

  it("calculates nDCG@3", () => {
    expect(ndcgAt3(["a", "b", "c"], ratings)).toBe(1);
    expect(ndcgAt3(["c", "b", "a"], ratings)).toBeCloseTo(0.6207, 4);
  });

  it("calculates the expected metric set", () => {
    const metrics = calculateMetrics(["c", "b", "a"], ratings);

    expect(metrics.precisionAt1).toBe(0);
    expect(metrics.mrrAt3).toBe(0.5);
    expect(metrics.ndcgAt3).toBeCloseTo(0.6207, 4);
  });
});
