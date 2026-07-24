import { describe, expect, it } from "vitest";
import { bucketConversationsByHour } from "./hourlyActivity";

describe("bucketConversationsByHour", () => {
  it("buckets conversations across the full BRT day so far (hour 0 through the reference hour)", () => {
    const referenceIso = "2026-07-23T17:00:00.000Z"; // 14h BRT (UTC-3, fixed offset)
    const conversations = [
      { createdAt: "2026-07-23T17:05:00.000Z" }, // 14h05 BRT
      { createdAt: "2026-07-23T17:40:00.000Z" }, // 14h40 BRT
      { createdAt: "2026-07-23T13:10:00.000Z" }, // 10h10 BRT
      { createdAt: "2026-07-22T17:05:00.000Z" }, // previous day — excluded
    ];
    const result = bucketConversationsByHour(conversations, referenceIso);
    expect(result).toHaveLength(15); // hours 0..14
    expect(result[0]).toMatchObject({ hour: 0, label: "0h", count: 0 });
    expect(result[result.length - 1]).toMatchObject({ hour: 14, label: "14h", count: 2 });
    expect(result.find((p) => p.hour === 10)).toMatchObject({ count: 1 });
    const total = result.reduce((sum, p) => sum + p.count, 0);
    expect(total).toBe(3); // matches the 3 same-day conversations — the chart-total invariant
  });

  it("returns a single point just after midnight", () => {
    const referenceIso = "2026-07-23T03:30:00.000Z"; // 00:30 BRT
    const result = bucketConversationsByHour([], referenceIso);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ hour: 0, label: "0h", count: 0 });
  });
});
