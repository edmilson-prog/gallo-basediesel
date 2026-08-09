import { describe, expect, it } from "vitest";
import type { IWhatsAppAccount } from "@/shared/types";
import { applyWahaPolledStatuses } from "./wahaPolledStatus";

function makeAccount(overrides: Partial<IWhatsAppAccount> = {}): IWhatsAppAccount {
  return {
    id: "waha-1",
    storeId: "store-1",
    label: "Vendas — WAHA",
    phoneNumber: "+555599850110",
    provider: "waha",
    credentialsRef: "WAHA_API_KEY",
    status: "connected",
    capabilities: {
      supportsTemplatesHsm: false,
      supportsInteractiveButtons: false,
      supportsLists: false,
      supportsReactions: false,
      supportsProactiveMessaging: false,
      supportsReadStatusInGroups: false,
    },
    currentState: "healthy",
    failoverPolicy: "disabled",
    isFailoverActive: false,
    createdAt: "2026-07-14T11:18:00.000Z",
    purpose: "atendimento",
    alertsMuted: false,
    sdrEnabled: false,
    ...overrides,
  };
}

describe("applyWahaPolledStatuses", () => {
  it("patches an account whose polled status changed", () => {
    const accounts = [makeAccount({ id: "a", status: "connected" })];
    const next = applyWahaPolledStatuses(accounts, {
      a: { state: "disconnected", rawState: "STOPPED" },
    });
    expect(next[0]!.status).toBe("disconnected");
  });

  it("leaves an account absent from the poll untouched", () => {
    // A failed poll must never be guessed as a disconnection — the badge keeps
    // its last known value instead of alarming on a network blip.
    const accounts = [
      makeAccount({ id: "a", status: "connected" }),
      makeAccount({ id: "b", status: "connected" }),
    ];
    const next = applyWahaPolledStatuses(accounts, {
      a: { state: "disconnected", rawState: "FAILED" },
    });
    expect(next[0]!.status).toBe("disconnected");
    expect(next[1]!.status).toBe("connected");
  });

  it("returns the SAME array reference when nothing changed (no needless re-render)", () => {
    const accounts = [makeAccount({ id: "a", status: "connected" })];
    const next = applyWahaPolledStatuses(accounts, {
      a: { state: "connected", rawState: "WORKING" },
    });
    expect(next).toBe(accounts);
  });

  it("does not mutate the input accounts", () => {
    const accounts = [makeAccount({ id: "a", status: "connected" })];
    applyWahaPolledStatuses(accounts, { a: { state: "pending", rawState: "SCAN_QR_CODE" } });
    expect(accounts[0]!.status).toBe("connected");
  });

  it("handles an empty poll result", () => {
    const accounts = [makeAccount({ id: "a" })];
    expect(applyWahaPolledStatuses(accounts, {})).toBe(accounts);
  });
});
