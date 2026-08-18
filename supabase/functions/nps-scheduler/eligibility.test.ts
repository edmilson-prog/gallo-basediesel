import { describe, expect, it } from "vitest";
import {
  decideSurveys,
  evaluateEligibility,
  type INpsCandidate,
  type INpsSchedulerSettings,
} from "./eligibility";

const SETTINGS: INpsSchedulerSettings = {
  enabled: true,
  triggerConversationEnabled: true,
  triggerConversationDelayHours: 2,
  cooldownDays: 30,
  samplingRate: 1,
  sendWindowStartHour: 9,
  sendWindowEndHour: 20,
  maxBackfillDays: 3,
  dailyCap: 50,
};

/** 14h UTC — inside the send window. */
const NOW = new Date("2026-08-12T14:00:00Z");

const candidate = (patch: Partial<INpsCandidate> = {}): INpsCandidate => ({
  conversationId: "11111111-1111-1111-1111-111111111111",
  storeId: "22222222-2222-2222-2222-222222222222",
  phoneDigits: "5555999998888",
  closedAt: new Date("2026-08-12T10:00:00Z").toISOString(), // 4h ago
  lastSurveyAt: null,
  hasActiveSurvey: false,
  optOut: false,
  hasHumanMessage: true,
  ...patch,
});

describe("evaluateEligibility", () => {
  it("accepts a conversation resolved past the delay, inside the window", () => {
    expect(evaluateEligibility(candidate(), SETTINGS, { now: NOW, sentToday: 0 })).toEqual({
      eligible: true,
    });
  });

  it("rejects a conversation resolved more recently than the delay", () => {
    const fresh = candidate({ closedAt: new Date("2026-08-12T13:30:00Z").toISOString() });
    expect(evaluateEligibility(fresh, SETTINGS, { now: NOW, sentToday: 0 })).toEqual({
      eligible: false,
      reason: "delay",
    });
  });

  it("rejects the historical backlog via the retroactive window", () => {
    const old = candidate({ closedAt: new Date("2026-07-01T10:00:00Z").toISOString() });
    expect(evaluateEligibility(old, SETTINGS, { now: NOW, sentToday: 0 })).toEqual({
      eligible: false,
      reason: "backfill",
    });
  });

  it("rejects a phone surveyed inside the cooldown", () => {
    const recent = candidate({ lastSurveyAt: new Date("2026-07-31T10:00:00Z").toISOString() });
    expect(evaluateEligibility(recent, SETTINGS, { now: NOW, sentToday: 0 })).toEqual({
      eligible: false,
      reason: "cooldown",
    });
  });

  it("accepts a phone whose cooldown has expired", () => {
    const old = candidate({ lastSurveyAt: new Date("2026-06-01T10:00:00Z").toISOString() });
    expect(evaluateEligibility(old, SETTINGS, { now: NOW, sentToday: 0 })).toEqual({
      eligible: true,
    });
  });

  it("rejects when a survey is already in flight", () => {
    expect(
      evaluateEligibility(candidate({ hasActiveSurvey: true }), SETTINGS, {
        now: NOW,
        sentToday: 0,
      }),
    ).toEqual({ eligible: false, reason: "active_survey" });
  });

  it("respects contact opt-out", () => {
    expect(
      evaluateEligibility(candidate({ optOut: true }), SETTINGS, { now: NOW, sentToday: 0 }),
    ).toEqual({ eligible: false, reason: "opt_out" });
  });

  it("rejects a conversation with no human message", () => {
    expect(
      evaluateEligibility(candidate({ hasHumanMessage: false }), SETTINGS, {
        now: NOW,
        sentToday: 0,
      }),
    ).toEqual({ eligible: false, reason: "no_human_message" });
  });

  it("defers outside the send window instead of sending", () => {
    const night = new Date("2026-08-12T23:00:00Z");
    expect(evaluateEligibility(candidate(), SETTINGS, { now: night, sentToday: 0 })).toEqual({
      eligible: false,
      reason: "send_window",
    });
  });

  it("defers before the send window opens", () => {
    const dawn = new Date("2026-08-12T06:00:00Z");
    const closed = candidate({ closedAt: new Date("2026-08-12T01:00:00Z").toISOString() });
    expect(evaluateEligibility(closed, SETTINGS, { now: dawn, sentToday: 0 })).toEqual({
      eligible: false,
      reason: "send_window",
    });
  });

  it("rejects once the daily cap is reached", () => {
    expect(evaluateEligibility(candidate(), SETTINGS, { now: NOW, sentToday: 50 })).toEqual({
      eligible: false,
      reason: "daily_cap",
    });
  });

  it("rejects everything when the master switch is off", () => {
    const off = { ...SETTINGS, enabled: false };
    expect(evaluateEligibility(candidate(), off, { now: NOW, sentToday: 0 })).toEqual({
      eligible: false,
      reason: "disabled",
    });
  });

  it("rejects when the conversation trigger is off", () => {
    const off = { ...SETTINGS, triggerConversationEnabled: false };
    expect(evaluateEligibility(candidate(), off, { now: NOW, sentToday: 0 })).toEqual({
      eligible: false,
      reason: "trigger_off",
    });
  });
});

describe("sampling", () => {
  it("is deterministic — the same conversation always decides the same way", () => {
    const half = { ...SETTINGS, samplingRate: 0.5 };
    const ctx = { now: NOW, sentToday: 0 };
    expect(evaluateEligibility(candidate(), half, ctx)).toEqual(
      evaluateEligibility(candidate(), half, ctx),
    );
  });

  it("drops roughly half the population at 0.5", () => {
    const half = { ...SETTINGS, samplingRate: 0.5 };
    const many = Array.from({ length: 200 }, (_, i) =>
      candidate({ conversationId: `conv-${i}`, phoneDigits: `55559999${i}` }),
    );
    const accepted = many.filter(
      (c) => evaluateEligibility(c, half, { now: NOW, sentToday: 0 }).eligible,
    ).length;
    expect(accepted).toBeGreaterThan(60);
    expect(accepted).toBeLessThan(140);
  });

  it("accepts everyone at rate 1", () => {
    const many = Array.from({ length: 50 }, (_, i) =>
      candidate({ conversationId: `conv-${i}`, phoneDigits: `55559999${i}` }),
    );
    const accepted = many.filter(
      (c) => evaluateEligibility(c, SETTINGS, { now: NOW, sentToday: 0 }).eligible,
    ).length;
    expect(accepted).toBe(50);
  });

  it("accepts nobody at rate 0", () => {
    const none = { ...SETTINGS, samplingRate: 0 };
    const many = Array.from({ length: 20 }, (_, i) =>
      candidate({ conversationId: `conv-${i}`, phoneDigits: `55559999${i}` }),
    );
    const accepted = many.filter(
      (c) => evaluateEligibility(c, none, { now: NOW, sentToday: 0 }).eligible,
    ).length;
    expect(accepted).toBe(0);
  });
});

describe("decideSurveys", () => {
  it("enforces the daily cap across the batch, never silently", () => {
    const capped = { ...SETTINGS, dailyCap: 3 };
    const many = Array.from({ length: 10 }, (_, i) =>
      candidate({ conversationId: `conv-${i}`, phoneDigits: `55559999${i}` }),
    );
    const result = decideSurveys(many, capped, { now: NOW, sentToday: 0 });
    expect(result.accepted).toHaveLength(3);
    expect(result.rejected.filter((r) => r.reason === "daily_cap")).toHaveLength(7);
  });

  it("does not survey the same phone twice in one batch", () => {
    const twins = [
      candidate({ conversationId: "conv-a", phoneDigits: "5555999998888" }),
      candidate({ conversationId: "conv-b", phoneDigits: "5555999998888" }),
    ];
    const result = decideSurveys(twins, SETTINGS, { now: NOW, sentToday: 0 });
    expect(result.accepted).toHaveLength(1);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0]?.reason).toBe("cooldown");
  });

  it("accounts for surveys already sent today when applying the cap", () => {
    const capped = { ...SETTINGS, dailyCap: 5 };
    const many = Array.from({ length: 10 }, (_, i) =>
      candidate({ conversationId: `conv-${i}`, phoneDigits: `55559999${i}` }),
    );
    const result = decideSurveys(many, capped, { now: NOW, sentToday: 4 });
    expect(result.accepted).toHaveLength(1);
  });

  it("returns every rejection so the tick can report instead of truncating", () => {
    const many = Array.from({ length: 6 }, (_, i) =>
      candidate({ conversationId: `conv-${i}`, phoneDigits: `55559999${i}`, optOut: i % 2 === 0 }),
    );
    const result = decideSurveys(many, SETTINGS, { now: NOW, sentToday: 0 });
    expect(result.accepted.length + result.rejected.length).toBe(6);
    expect(result.rejected.filter((r) => r.reason === "opt_out")).toHaveLength(3);
  });
});
