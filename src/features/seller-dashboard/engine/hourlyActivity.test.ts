import { describe, expect, it } from "vitest";
import { bucketConversationsByHour } from "./hourlyActivity";

describe("bucketConversationsByHour", () => {
  it("counts conversations in BRT-adjusted hourly buckets, rolling 8h window ending at the reference hour", () => {
    const referenceIso = "2026-07-23T17:00:00.000Z"; // 14h BRT (UTC-3, fixed offset)
    const conversations = [
      { createdAt: "2026-07-23T17:05:00.000Z" }, // 14h05 BRT
      { createdAt: "2026-07-23T17:40:00.000Z" }, // 14h40 BRT
      { createdAt: "2026-07-23T13:10:00.000Z" }, // 10h10 BRT
      { createdAt: "2026-07-22T17:05:00.000Z" }, // previous day — excluded
    ];
    const result = bucketConversationsByHour(conversations, referenceIso);
    expect(result).toHaveLength(8); // hours 7..14 BRT
    expect(result[0]).toMatchObject({ hour: 7, label: "7h", count: 0 });
    expect(result[result.length - 1]).toMatchObject({ hour: 14, label: "14h", count: 2 });
    expect(result.find((p) => p.hour === 10)).toMatchObject({ count: 1 });
  });

  it("clamps the window start at 0 for early-morning references", () => {
    const referenceIso = "2026-07-23T06:30:00.000Z"; // 3h30 BRT
    const result = bucketConversationsByHour([], referenceIso);
    expect(result).toHaveLength(4); // hours 0..3
    expect(result[0]!.hour).toBe(0);
    expect(result[result.length - 1]!.hour).toBe(3);
  });
});
