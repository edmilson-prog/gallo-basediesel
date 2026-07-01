import { describe, it, expect } from "vitest";
import type { IWhatsAppAccount } from "@/shared/types";
import { deriveInstanceLock } from "./instanceLock";

describe("deriveInstanceLock", () => {
  it("never locks a connected instance", () => {
    expect(deriveInstanceLock({ status: "connected" })).toEqual({ locked: false });
  });

  it("locks a disconnected instance with the disconnected reason", () => {
    expect(deriveInstanceLock({ status: "disconnected" })).toEqual({
      locked: true,
      reason: "disconnected",
    });
  });

  it("locks a pending (still pairing) instance with the pending reason", () => {
    expect(deriveInstanceLock({ status: "pending" })).toEqual({ locked: true, reason: "pending" });
  });

  it("fails open (never locks) when the account couldn't be resolved", () => {
    expect(deriveInstanceLock(null)).toEqual({ locked: false });
    expect(deriveInstanceLock(undefined)).toEqual({ locked: false });
  });

  it("is independent of alertsMuted — a muted-but-disconnected account still locks", () => {
    const account: Pick<IWhatsAppAccount, "status" | "alertsMuted"> = {
      status: "disconnected",
      alertsMuted: true,
    };
    expect(deriveInstanceLock(account)).toEqual({ locked: true, reason: "disconnected" });
  });
});
