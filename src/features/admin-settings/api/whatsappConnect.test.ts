import { describe, expect, it } from "vitest";
import { resolveMockPairingState } from "./whatsappConnect";

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
