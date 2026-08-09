import { describe, expect, it } from "vitest";
import type { IWhatsAppAccount } from "@/shared/types";
import {
  buildDisconnectBannerCopy,
  deriveConnectionSignals,
  mergeConnectionAccounts,
} from "./useWhatsAppConnectionStatus";

describe("buildDisconnectBannerCopy", () => {
  it("names the account when a single one is down", () => {
    expect(buildDisconnectBannerCopy(["GALLO Campanhas"])).toEqual({
      headline: 'WhatsApp "GALLO Campanhas" desconectado.',
      cta: "Reconectar",
    });
  });

  it("aggregates with a count when 2+ are down", () => {
    expect(buildDisconnectBannerCopy(["A", "B"])).toEqual({
      headline: "2 números de WhatsApp desconectados.",
      cta: "Ver e reconectar",
    });
  });
});

function makeAccount(overrides: Partial<IWhatsAppAccount> = {}): IWhatsAppAccount {
  return {
    id: "wa-1",
    storeId: "store-1",
    label: "Conta",
    phoneNumber: "(55) 99999-0000",
    provider: "evolution",
    credentialsRef: "WA_TEST",
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
    createdAt: "2026-01-01T00:00:00.000Z",
    purpose: "atendimento",
    alertsMuted: false,
    sdrEnabled: false,
    ...overrides,
  };
}

const NEVER_SESSION_MUTED = () => false;

describe("mergeConnectionAccounts", () => {
  it("combines the shared engine-family list with the isolated WAHA list", () => {
    const family = [makeAccount({ id: "evo-1", provider: "evolution" })];
    const waha = [makeAccount({ id: "waha-1", provider: "waha" })];
    expect(mergeConnectionAccounts(family, waha)).toEqual([...family, ...waha]);
  });

  it("still works when one of the lists is empty", () => {
    const family = [makeAccount({ id: "evo-1", provider: "evolution" })];
    expect(mergeConnectionAccounts(family, [])).toEqual(family);
    expect(mergeConnectionAccounts([], family)).toEqual(family);
  });
});

describe("deriveConnectionSignals", () => {
  it("counts a disconnected WAHA account the same as any other provider", () => {
    // WAHA is excluded from whatsappAccountsProvider.list() (its rows have a
    // shape ~12 other consumers don't handle), so the shell's own query merges
    // list() with listWaha() before this function ever sees the accounts —
    // this only guards that the signal derivation itself has no provider gate.
    const down = makeAccount({ id: "waha-down", provider: "waha", status: "disconnected" });
    const signals = deriveConnectionSignals([down], NEVER_SESSION_MUTED);
    expect(signals.disconnected).toEqual([down]);
    expect(signals.alerting).toEqual([down]);
  });

  it("counts a connected account as healthy with no alerts", () => {
    const signals = deriveConnectionSignals(
      [makeAccount({ status: "connected" })],
      NEVER_SESSION_MUTED,
    );
    expect(signals).toEqual({
      total: 1,
      connectedCount: 1,
      disconnected: [],
      alerting: [],
      snoozed: false,
    });
  });

  it("surfaces a disconnected account in disconnected + alerting", () => {
    const down = makeAccount({ id: "wa-down", status: "disconnected" });
    const signals = deriveConnectionSignals([down], NEVER_SESSION_MUTED);
    expect(signals.disconnected).toEqual([down]);
    expect(signals.alerting).toEqual([down]);
    expect(signals.snoozed).toBe(false);
  });

  it("session-snoozed disconnect stays in disconnected but leaves alerting (snoozed=true)", () => {
    const down = makeAccount({ id: "wa-down", status: "disconnected" });
    const signals = deriveConnectionSignals([down], (id) => id === "wa-down");
    expect(signals.disconnected).toEqual([down]);
    expect(signals.alerting).toEqual([]);
    expect(signals.snoozed).toBe(true);
  });

  it("excludes a muted account from EVERY signal (count, disconnected, alerting)", () => {
    const mutedDown = makeAccount({ id: "wa-muted", status: "disconnected", alertsMuted: true });
    const connected = makeAccount({ id: "wa-ok", status: "connected" });
    const signals = deriveConnectionSignals([mutedDown, connected], NEVER_SESSION_MUTED);
    expect(signals.total).toBe(1);
    expect(signals.connectedCount).toBe(1);
    expect(signals.disconnected).toEqual([]);
    expect(signals.alerting).toEqual([]);
    expect(signals.snoozed).toBe(false);
  });

  it("does not raise snoozed when the only disconnect is muted (not snoozed)", () => {
    const mutedDown = makeAccount({ id: "wa-muted", status: "disconnected", alertsMuted: true });
    const signals = deriveConnectionSignals([mutedDown], NEVER_SESSION_MUTED);
    expect(signals.disconnected).toEqual([]);
    expect(signals.snoozed).toBe(false);
  });
});
