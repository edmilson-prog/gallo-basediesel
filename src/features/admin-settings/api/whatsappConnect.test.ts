import { describe, expect, it } from "vitest";
import {
  connectErrorMessage,
  CONNECT_ERROR_MESSAGES,
  EvolutionConnectError,
  resolveMockPairingState,
} from "./whatsappConnect";

describe("resolveMockPairingState", () => {
  it("starts closed, moves to connecting, then opens with a fake profile", () => {
    expect(resolveMockPairingState(0).state).toBe("close");
    expect(resolveMockPairingState(2499).state).toBe("close");
    expect(resolveMockPairingState(2500).state).toBe("connecting");
    expect(resolveMockPairingState(4999).state).toBe("connecting");
    const open = resolveMockPairingState(5000);
    expect(open.state).toBe("open");
    expect(open.phoneNumber).toBe("+5555999887766");
    expect(open.profileName).toBe("Gallo Base Diesel (demo)");
  });
});

describe("connectErrorMessage", () => {
  it("maps known codes and falls back to DEFAULT", () => {
    expect(connectErrorMessage(new EvolutionConnectError("x", "UNAUTHORIZED"))).toBe(
      CONNECT_ERROR_MESSAGES.UNAUTHORIZED,
    );
    expect(connectErrorMessage(new Error("boom"))).toBe(CONNECT_ERROR_MESSAGES.DEFAULT);
  });
});
