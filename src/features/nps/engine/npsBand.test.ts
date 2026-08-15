import { describe, expect, it } from "vitest";
import type { INpsBandThresholds } from "./npsBand";
import {
  DEFAULT_NPS_BANDS,
  NPS_TARGET,
  npsBand,
  npsBandLabel,
  npsBandRanges,
  npsBandsAreOrdered,
  rulerPosition,
} from "./npsBand";

describe("npsBand", () => {
  it("names the four bands from the design kit", () => {
    expect(npsBand(-40)).toBe("critical");
    expect(npsBand(20)).toBe("improvement");
    expect(npsBand(60)).toBe("quality");
    expect(npsBand(80)).toBe("excellence");
  });

  it("places every boundary on the upper band", () => {
    expect(npsBand(0)).toBe("improvement");
    expect(npsBand(50)).toBe("quality");
    expect(npsBand(75)).toBe("excellence");
  });

  it("keeps the value just below a boundary in the lower band", () => {
    expect(npsBand(-1)).toBe("critical");
    expect(npsBand(49)).toBe("improvement");
    expect(npsBand(74)).toBe("quality");
  });

  it("handles the extremes", () => {
    expect(npsBand(-100)).toBe("critical");
    expect(npsBand(100)).toBe("excellence");
  });

  it("labels the bands in pt-BR", () => {
    expect(npsBandLabel(-40)).toBe("Crítica");
    expect(npsBandLabel(20)).toBe("Aperfeiçoamento");
    expect(npsBandLabel(60)).toBe("Qualidade");
    expect(npsBandLabel(80)).toBe("Excelência");
  });
});

describe("rulerPosition", () => {
  it("maps the -100..100 scale onto 0..100 percent", () => {
    expect(rulerPosition(-100)).toBe(0);
    expect(rulerPosition(0)).toBe(50);
    expect(rulerPosition(100)).toBe(100);
    expect(rulerPosition(60)).toBe(80);
  });

  it("clamps out-of-range input instead of overflowing the track", () => {
    expect(rulerPosition(-150)).toBe(0);
    expect(rulerPosition(150)).toBe(100);
  });
});

describe("NPS_TARGET", () => {
  it("is the internal goal the trend chart draws its dashed line at", () => {
    expect(NPS_TARGET).toBe(60);
  });
});

describe("configurable thresholds", () => {
  /** A store that decided the kit's cuts were too generous. */
  const strict: INpsBandThresholds = { excellence: 85, quality: 65, improvement: 30 };

  it("defaults to the kit's cuts when none are given", () => {
    expect(DEFAULT_NPS_BANDS).toEqual({ excellence: 75, quality: 50, improvement: 0 });
    expect(npsBand(60)).toBe(npsBand(60, DEFAULT_NPS_BANDS));
  });

  it("classifies by the given cuts instead of the defaults", () => {
    expect(npsBand(70, strict)).toBe("quality");
    // 60 is "qualidade" under the kit's cuts and only "aperfeiçoamento" here.
    expect(npsBand(60, strict)).toBe("improvement");
    expect(npsBand(60)).toBe("quality");
    expect(npsBand(85, strict)).toBe("excellence");
  });

  it("keeps everything below the lowest cut critical", () => {
    expect(npsBand(29, strict)).toBe("critical");
    expect(npsBand(0, strict)).toBe("critical");
  });

  it("labels a custom band in pt-BR", () => {
    expect(npsBandLabel(60, strict)).toBe("Aperfeiçoamento");
  });
});

describe("npsBandsAreOrdered", () => {
  it("accepts strictly decreasing cuts", () => {
    expect(npsBandsAreOrdered(DEFAULT_NPS_BANDS)).toBe(true);
    expect(npsBandsAreOrdered({ excellence: 85, quality: 65, improvement: 30 })).toBe(true);
    expect(npsBandsAreOrdered({ excellence: 2, quality: 1, improvement: 0 })).toBe(true);
  });

  it("rejects cuts that touch, which would make a band unreachable", () => {
    expect(npsBandsAreOrdered({ excellence: 50, quality: 50, improvement: 0 })).toBe(false);
    expect(npsBandsAreOrdered({ excellence: 75, quality: 0, improvement: 0 })).toBe(false);
  });

  it("rejects inverted cuts", () => {
    expect(npsBandsAreOrdered({ excellence: 40, quality: 60, improvement: 0 })).toBe(false);
    expect(npsBandsAreOrdered({ excellence: 75, quality: -10, improvement: 0 })).toBe(false);
  });
});

describe("npsBandRanges", () => {
  it("covers the whole ruler with no gap and no overlap", () => {
    const ranges = npsBandRanges();
    expect(ranges.map((range) => range.band)).toEqual([
      "excellence",
      "quality",
      "improvement",
      "critical",
    ]);
    expect(ranges[0]).toEqual({ band: "excellence", min: 75, max: 100 });
    expect(ranges[1]).toEqual({ band: "quality", min: 50, max: 74 });
    expect(ranges[2]).toEqual({ band: "improvement", min: 0, max: 49 });
    expect(ranges[3]).toEqual({ band: "critical", min: -100, max: -1 });
  });

  it("agrees with npsBand at every boundary it reports", () => {
    const bands: INpsBandThresholds = { excellence: 85, quality: 65, improvement: 30 };
    for (const range of npsBandRanges(bands)) {
      expect(npsBand(range.min, bands)).toBe(range.band);
      expect(npsBand(range.max, bands)).toBe(range.band);
    }
  });
});
