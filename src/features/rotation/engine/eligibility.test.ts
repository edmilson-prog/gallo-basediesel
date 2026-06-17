import { describe, expect, it } from "vitest";
import type { ISeller } from "@/shared/types";
import { isSellerEligible } from "./eligibility";

function makeSeller(over: Partial<ISeller> = {}): ISeller {
  return {
    id: "seller-1",
    storeId: "store-matriz",
    fullName: "Carlos",
    email: "c@x.com",
    type: "internal",
    availability: "online",
    divisions: ["parts"],
    active: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...over,
  };
}

// Tuesday 09:00 SP (12:00Z). Weekday schedule 08:00–18:00.
const tuesday0900 = new Date("2026-06-16T12:00:00Z");
const WEEKDAY_8_18 = [1, 2, 3, 4, 5].map((weekday) => ({
  weekday: weekday as 1 | 2 | 3 | 4 | 5,
  openAt: "08:00",
  closeAt: "18:00",
  enabled: true,
}));

describe("isSellerEligible", () => {
  it("selects an online, active, in-hours seller with enabled participation", () => {
    const r = isSellerEligible(makeSeller(), { enabled: true }, tuesday0900);
    expect(r.eligible).toBe(true);
    expect(r.reason).toBe("selected");
  });

  it("skips when participation is disabled", () => {
    const r = isSellerEligible(makeSeller(), { enabled: false }, tuesday0900);
    expect(r).toEqual({ eligible: false, reason: "skipped_disabled" });
  });

  it("skips an inactive seller", () => {
    const r = isSellerEligible(makeSeller({ active: false }), { enabled: true }, tuesday0900);
    expect(r).toEqual({ eligible: false, reason: "skipped_inactive" });
  });

  it("skips an offline seller", () => {
    const r = isSellerEligible(makeSeller({ availability: "offline" }), { enabled: true }, tuesday0900);
    expect(r).toEqual({ eligible: false, reason: "skipped_offline" });
  });

  it("skips a seller outside the work schedule", () => {
    const night = new Date("2026-06-16T23:30:00Z"); // 20:30 SP
    const r = isSellerEligible(makeSeller({ workSchedule: WEEKDAY_8_18 }), { enabled: true }, night);
    expect(r).toEqual({ eligible: false, reason: "skipped_off_hours" });
  });

  it("treats a seller with no schedule as always in-hours", () => {
    const night = new Date("2026-06-16T23:30:00Z");
    const r = isSellerEligible(makeSeller(), { enabled: true }, night);
    expect(r.eligible).toBe(true);
  });
});
