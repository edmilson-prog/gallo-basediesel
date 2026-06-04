import { describe, it, expect } from "vitest";

import { buildForecastInput } from "../buildForecastInput";
import type { ILead } from "@/shared/types/lead";

function makeLead(over: Partial<ILead>): ILead {
  return {
    id: over.id ?? "lead-1",
    storeId: "store-1",
    sellerId: "seller-1",
    name: "Lead",
    phone: "x",
    stage: { id: "stage-1", name: "Novo", order: 1, color: "#000000" },
    temperature: "quente",
    origin: "whatsapp",
    estimatedValue: over.estimatedValue,
    conversations: [],
    tags: [],
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
    ...over,
  };
}

const period = { type: "monthly" as const, start: "2026-06-01T00:00:00.000Z", end: "2026-06-30T23:59:59.999Z" };
const scope = { level: "store" as const, targetId: "store-1", storeId: "store-1" };

describe("buildForecastInput", () => {
  it("filters out converted and lost leads, keeping only open ones", () => {
    const leads = [
      makeLead({ id: "a", estimatedValue: 10_000 }),
      makeLead({ id: "b", estimatedValue: 20_000, convertedToCustomerId: "cust-1" }),
      makeLead({ id: "c", estimatedValue: 30_000, lossReason: "preço" }),
    ];
    const input = buildForecastInput({
      scope,
      metric: "revenue",
      period,
      realizedValue: 100_000,
      leads,
      now: new Date("2026-06-16T00:00:00.000Z"),
    });
    expect(input.openLeads).toHaveLength(1);
    expect(input.openLeads[0]!.id).toBe("a");
  });

  it("derives the calendar from the period and now, and stamps now as ISO", () => {
    const input = buildForecastInput({
      scope,
      metric: "revenue",
      period,
      realizedValue: 0,
      leads: [],
      now: new Date("2026-06-16T00:00:00.000Z"),
    });
    expect(input.calendar.totalDays).toBe(30);
    expect(input.calendar.daysElapsed).toBe(15);
    expect(input.calendar.daysRemaining).toBe(15);
    expect(input.now).toBe("2026-06-16T00:00:00.000Z");
  });
});
