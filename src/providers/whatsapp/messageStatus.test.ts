import { describe, expect, it } from "vitest";
import { MESSAGE_STATUS_RANK, statusAdvances } from "./messageStatus";

describe("MESSAGE_STATUS_RANK", () => {
  it("ranks `failed` as RECOVERABLE — below delivered and read", () => {
    // Evolution/Baileys emits a spurious ERROR ack mid-flight for messages that
    // are in fact delivered/read; a real delivery confirmation must outrank it.
    expect(MESSAGE_STATUS_RANK.failed).toBeLessThan(MESSAGE_STATUS_RANK.delivered);
    expect(MESSAGE_STATUS_RANK.failed).toBeLessThan(MESSAGE_STATUS_RANK.read);
    // …but still above the pre-delivery states, so a genuine failure shows.
    expect(MESSAGE_STATUS_RANK.failed).toBeGreaterThan(MESSAGE_STATUS_RANK.sent);
    expect(MESSAGE_STATUS_RANK.failed).toBeGreaterThan(MESSAGE_STATUS_RANK.queued);
  });

  it("keeps the forward lifecycle monotonic", () => {
    expect(MESSAGE_STATUS_RANK.queued).toBeLessThan(MESSAGE_STATUS_RANK.sent);
    expect(MESSAGE_STATUS_RANK.sent).toBeLessThan(MESSAGE_STATUS_RANK.delivered);
    expect(MESSAGE_STATUS_RANK.delivered).toBeLessThan(MESSAGE_STATUS_RANK.read);
  });
});

describe("statusAdvances", () => {
  it("recovers a transient failure when delivered/read arrives later", () => {
    expect(statusAdvances("failed", "delivered")).toBe(true);
    expect(statusAdvances("failed", "read")).toBe(true);
  });

  it("does NOT let a late failure clobber an already delivered/read message", () => {
    expect(statusAdvances("delivered", "failed")).toBe(false);
    expect(statusAdvances("read", "failed")).toBe(false);
  });

  it("applies a genuine failure over queued/sent", () => {
    expect(statusAdvances("queued", "failed")).toBe(true);
    expect(statusAdvances("sent", "failed")).toBe(true);
  });

  it("never regresses through the forward lifecycle", () => {
    expect(statusAdvances("read", "delivered")).toBe(false);
    expect(statusAdvances("delivered", "sent")).toBe(false);
    expect(statusAdvances("sent", "queued")).toBe(false);
  });

  it("re-applies the same status idempotently", () => {
    expect(statusAdvances("delivered", "delivered")).toBe(true);
  });
});
