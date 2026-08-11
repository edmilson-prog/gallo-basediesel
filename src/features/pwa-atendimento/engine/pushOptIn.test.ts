import { describe, expect, it } from "vitest";
import { PUSH_DECLINE_COOLDOWN_DAYS, shouldOfferPush } from "./pushOptIn";

const NOW = new Date("2026-08-11T12:00:00.000Z");

function daysBefore(days: number): string {
  return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

describe("shouldOfferPush", () => {
  it("offers when the browser has not decided and nothing was declined", () => {
    expect(shouldOfferPush({ permission: "default", declinedAt: null, now: NOW })).toBe(true);
  });

  it("stays quiet once permission is granted", () => {
    expect(shouldOfferPush({ permission: "granted", declinedAt: null, now: NOW })).toBe(false);
  });

  it("stays quiet once the browser blocked it — the soft ask cannot undo that", () => {
    expect(shouldOfferPush({ permission: "denied", declinedAt: null, now: NOW })).toBe(false);
  });

  it("respects the cooldown after a decline", () => {
    expect(shouldOfferPush({ permission: "default", declinedAt: daysBefore(5), now: NOW })).toBe(
      false,
    );
  });

  it("stays quiet on the last day of the cooldown", () => {
    expect(
      shouldOfferPush({
        permission: "default",
        declinedAt: daysBefore(PUSH_DECLINE_COOLDOWN_DAYS - 0.5),
        now: NOW,
      }),
    ).toBe(false);
  });

  it("offers again once the cooldown has elapsed", () => {
    expect(
      shouldOfferPush({
        permission: "default",
        declinedAt: daysBefore(PUSH_DECLINE_COOLDOWN_DAYS + 1),
        now: NOW,
      }),
    ).toBe(true);
  });

  it("ignores an unparseable decline stamp instead of blocking forever", () => {
    expect(shouldOfferPush({ permission: "default", declinedAt: "not-a-date", now: NOW })).toBe(
      true,
    );
  });
});
